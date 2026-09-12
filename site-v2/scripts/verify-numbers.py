#!/usr/bin/env python3
"""
Independently recompute every headline figure from the raw books feed and
compare it against what the console produces.

This deliberately does not import any of the console's code. It re-derives the
rules from scratch so that a mistake in the JavaScript aggregation shows up as a
mismatch rather than being reproduced identically on both sides.

    node scripts/dump-model.mjs > /tmp/figures.json
    curl -s http://localhost:8787/api/books-overlay > /tmp/overlay.json
    curl -s http://localhost:8787/api/data/owners.json > /tmp/owners.json
    python3 scripts/verify-numbers.py /tmp/figures.json /tmp/overlay.json /tmp/owners.json
"""

import json
import math
import sys
from collections import defaultdict
from datetime import date

METRICS = ["total_profit", "fuel_profit", "gas_profit", "store_profit",
           "sales", "purchases", "gas_vol"]

# Cent-level agreement; these are dollar figures summed over many rows.
TOLERANCE = 0.01

failures = 0
checks = 0


def check(ok, message):
    global failures, checks
    checks += 1
    if not ok:
        failures += 1
        print(f"  FAIL  {message}")


def close(a, b, tol=TOLERANCE):
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return math.isclose(float(a), float(b), abs_tol=tol, rel_tol=1e-9)


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def real_month(entry):
    """A month counts as reported only if some figure in it is non-zero."""
    if not entry:
        return False
    return any(is_number(entry.get(k)) and entry[k] != 0
               for k in ("sales", "purchases", "store_profit", "gas_vol",
                         "fuel_profit", "total_profit"))


def with_fuel_profit(entry):
    """`fuel_profit` and `gas_profit` are the same dollars under two names."""
    if is_number(entry.get("fuel_profit")) and is_number(entry.get("gas_profit")):
        return entry
    if is_number(entry.get("gas_profit")):
        return {**entry, "fuel_profit": float(entry["gas_profit"])}
    if is_number(entry.get("fuel_profit")):
        return {**entry, "gas_profit": float(entry["fuel_profit"])}
    return entry


def month_before_now():
    """The calendar month before this one — the last that can have closed."""
    today = date.today()
    year, month = (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)
    return f"{year}-{month:02d}"


def main(figures_path, overlay_path, owners_path, monthly_path=None, open_days_path=None,
         depts_path=None):
    figures = json.load(open(figures_path))
    stations = json.load(open(overlay_path))["overlay"]["stations"]

    # monthly.json is the reconciled book and wins for every station-month it
    # covers; the overlay is the working file behind it and is the fallback for
    # months the book has not reached. Derived here rather than read from the
    # console, so preferring the wrong one shows up as a mismatch.
    reconciled = {}
    if monthly_path:
        for station in (json.load(open(monthly_path)).get("stations") or []):
            sid = str(station.get("id"))
            for key, entry in (station.get("months") or {}).items():
                if isinstance(entry, dict):
                    reconciled.setdefault(sid, {})[key] = entry

    months = {}
    for sid, station in stations.items():
        book = reconciled.get(str(sid), {})
        overlay_months = station.get("months") or {}
        out = {}
        for key in set(overlay_months) | set(book):
            entry = book.get(key) or overlay_months.get(key)
            if real_month(entry):
                out[key] = with_fuel_profit(entry)
        months[str(sid)] = out

    print("Station set")
    check(sorted(months) == sorted(figures["stationIds"]),
          f"station ids differ: extra={set(months) - set(figures['stationIds'])} "
          f"missing={set(figures['stationIds']) - set(months)}")
    print(f"  ok    {len(months)} stations\n")

    # --- latest closed month -------------------------------------------------
    # The month being traded is not a closed month however much of it is filed.
    # Two things cap the search before the half-the-stores rule runs: the
    # calendar, and the span the reconciled book says it covers. The book is the
    # stronger of the two, because the overlay fills a month in as it is traded.
    all_months = sorted({m for mm in months.values() for m in mm})
    book_through = max((key for by_month in reconciled.values() for key in by_month),
                       default=None)
    cap = min(filter(None, [month_before_now(), book_through]))
    reporting = [sid for sid, mm in months.items() if mm]
    latest = None
    for key in reversed([m for m in all_months if m <= cap]):
        filed = sum(1 for sid in reporting if key in months[sid])
        if filed >= math.ceil(len(reporting) / 2):
            latest = key
            break

    print("Period resolution")
    check(latest is not None and latest <= cap,
          f"latest closed month {latest} is not before the open month (cap {cap})")
    check(latest == figures["latestMonth"],
          f"latest closed month: recomputed {latest}, console says {figures['latestMonth']}")

    closed = [m for m in all_months if m <= latest]
    check(closed == figures["closedMonths"],
          f"closed months differ: recomputed {len(closed)}, console {len(figures['closedMonths'])}")

    year = latest[:4]
    ytd = [m for m in closed if m.startswith(year)]
    check(ytd == figures["ytdKeys"], f"YTD keys: {ytd} vs {figures['ytdKeys']}")

    prior_ytd = [f"{int(m[:4]) - 1}-{m[5:]}" for m in ytd]
    check(prior_ytd == figures["priorYtdKeys"], "prior-year YTD keys differ")

    # Nothing past the latest closed month may reach a chart.
    ahead = [m for m in figures["closedMonths"] if m > latest]
    check(not ahead, f"console is charting part-months: {ahead}")
    print(f"  ok    latest={latest}, {len(closed)} closed, {len(ytd)} YTD months\n")

    def total(keys, ids=None):
        out = defaultdict(float)
        seen = defaultdict(bool)
        for sid in (ids if ids is not None else months):
            for key in keys:
                entry = months[sid].get(key)
                if not entry:
                    continue
                for metric in METRICS:
                    if is_number(entry.get(metric)):
                        out[metric] += entry[metric]
                        seen[metric] = True
        return {m: (out[m] if seen[m] else None) for m in METRICS}

    # --- portfolio -----------------------------------------------------------
    print("Portfolio year to date")
    mine = total(ytd)
    theirs = figures["portfolio"]["ytd"]
    for metric in METRICS:
        check(close(mine[metric], theirs[metric]),
              f"portfolio {metric}: recomputed {mine[metric]}, console {theirs[metric]}")

    margin = (mine["store_profit"] / mine["sales"]) if mine["sales"] else None
    check(close(margin, theirs["store_margin"], tol=1e-9),
          f"portfolio store margin: recomputed {margin}, console {theirs['store_margin']}")

    cpg = (mine["gas_profit"] / mine["gas_vol"]) if mine["gas_vol"] else None
    check(close(cpg, theirs["gas_margin"], tol=1e-9),
          f"portfolio $/gal: recomputed {cpg}, console {theirs['gas_margin']}")

    prior_mine = total(prior_ytd)
    for metric in METRICS:
        check(close(prior_mine[metric], figures["portfolio"]["prior"][metric]),
              f"portfolio prior-year {metric}: recomputed {prior_mine[metric]}, "
              f"console {figures['portfolio']['prior'][metric]}")
    print(f"  ok    total profit {mine['total_profit']:,.2f} · "
          f"store margin {margin:.4f} · {cpg:.4f}/gal\n")

    # --- per store -----------------------------------------------------------
    print("Per store year to date")
    for sid in sorted(months):
        mine = total(ytd, [sid])
        theirs = figures["byStore"][sid]["ytd"]
        for metric in METRICS:
            check(close(mine[metric], theirs[metric]),
                  f"{sid} {metric}: recomputed {mine[metric]}, console {theirs[metric]}")
    print(f"  ok    {len(months)} stores reconciled across {len(METRICS)} measures\n")

    # --- the stores must add up to the portfolio -----------------------------
    print("Stores sum to the portfolio")
    for metric in METRICS:
        summed = sum(figures["byStore"][sid]["ytd"][metric] or 0 for sid in figures["byStore"])
        check(close(summed, figures["portfolio"]["ytd"][metric] or 0),
              f"{metric}: stores sum to {summed}, portfolio shows "
              f"{figures['portfolio']['ytd'][metric]}")
    print("  ok    every measure reconciles\n")

    # --- monthly series ------------------------------------------------------
    print("Monthly series")
    for metric in ("total_profit", "gas_vol", "sales", "purchases"):
        for index in range(12):
            key = f"{year}-{index + 1:02d}"
            expected = total([key])[metric] if key in ytd else None
            got = figures["series"][metric][index]
            check(close(expected, got),
                  f"{metric} {key}: recomputed {expected}, console {got}")

    # Fuel margin must come from summed dollars over summed gallons, never from
    # averaging each store's own cents-per-gallon.
    for index in range(12):
        key = f"{year}-{index + 1:02d}"
        if key not in ytd:
            continue
        month = total([key])
        expected = (month["gas_profit"] / month["gas_vol"]) if month["gas_vol"] else None
        got = figures["series"]["gasMargin"][index]
        check(close(expected, got, tol=1e-9),
              f"$/gal {key}: recomputed {expected}, console {got}")

        naive = [months[sid][key]["gas_margin"] for sid in months
                 if key in months[sid] and is_number(months[sid][key].get("gas_margin"))]
        if naive and expected is not None:
            unweighted = sum(naive) / len(naive)
            if not math.isclose(unweighted, expected, rel_tol=1e-6):
                check(not close(got, unweighted, tol=1e-9),
                      f"$/gal {key}: console used an unweighted average of store margins")
    print(f"  ok    4 measures over 12 months, plus weighted fuel margin\n")

    # --- owners --------------------------------------------------------------
    print("Owner groups")
    owners = json.load(open(owners_path))
    house = {"smartsolutionsai", "admin"}
    mine_owners = {}
    for account in owners["accounts"]:
        email = str(account.get("email", "")).lower()
        if email.split("@")[0] in house:
            continue
        key = account.get("client") or email
        mine_owners.setdefault(key, set()).update(str(s) for s in account.get("stores", []))

    # Only stores that actually appear in the books can be rolled up.
    mine_owners = {k: (v & set(months)) for k, v in mine_owners.items()}
    mine_owners = {k: v for k, v in mine_owners.items() if v}

    console_owners = {o["client"]: o for o in figures["owners"]}
    check(sorted(mine_owners) == sorted(console_owners),
          f"client set differs: recomputed {sorted(mine_owners)}, console {sorted(console_owners)}")

    # Every store belongs to exactly one client, or the roll-ups double count.
    assigned = [s for ids in mine_owners.values() for s in ids]
    check(len(assigned) == len(set(assigned)),
          "a store is filed under more than one client")
    check(set(assigned) == set(months),
          f"stores filed under no client: {sorted(set(months) - set(assigned))}")

    for client, ids in mine_owners.items():
        got = console_owners.get(client)
        if not got:
            continue
        check(sorted(ids) == sorted(got["stores"]),
              f"{client} store list: recomputed {sorted(ids)}, console {sorted(got['stores'])}")
        for label, keys in (("ytd", ytd), ("prior", prior_ytd)):
            recomputed = total(keys, sorted(ids))
            for metric in METRICS:
                check(close(recomputed[metric], got[label][metric]),
                      f"{client} {label} {metric}: recomputed {recomputed[metric]}, "
                      f"console {got[label][metric]}")

    # The clients must add back up to the portfolio.
    for metric in METRICS:
        summed = sum(o["ytd"][metric] or 0 for o in figures["owners"])
        check(close(summed, figures["portfolio"]["ytd"][metric] or 0),
              f"{metric}: clients sum to {summed}, portfolio shows "
              f"{figures['portfolio']['ytd'][metric]}")
    print(f"  ok    {len(mine_owners)} clients partition {len(assigned)} stores "
          f"and reconcile to the portfolio\n")

    # --- day grain -----------------------------------------------------------
    print("Day grain")
    DAY_METRICS = ["gas_vol", "gas_profit", "sales", "purchases", "store_profit", "total_profit"]

    # Rebuild the per-date roll-up straight from the raw day records. The feed
    # calls the purchases column `purch`, which is exactly the kind of rename a
    # port silently drops.
    # The overlay's day records stop at the last closed month for all but one
    # store, so the console merges the open month in from its own feed. Merge it
    # here the same way: the overlay wins for the months it has reconciled, but
    # for the open month it carries gas only (sales null), so there the
    # open-month sheet — which holds the real daily sales — fills in.
    open_days = {}
    if open_days_path:
        for station in (json.load(open(open_days_path)).get("stations") or []):
            sid = str(station.get("id"))
            for day in (station.get("days") or []):
                if day.get("date"):
                    open_days.setdefault(sid, {})[str(day["date"])] = day

    def is_num(v):
        if v is None or v == "":
            return False
        try:
            float(v)
            return True
        except (TypeError, ValueError):
            return False

    # The feed calls the purchases column `purch`, which is exactly the kind of
    # rename a port silently drops. `reported` tracks which metrics any store
    # actually filed on a date: the newest days of the open month carry gallons
    # only, and a date nobody reported store profit for is unknown, not a
    # break-even zero.
    by_date = defaultdict(lambda: defaultdict(float))
    reported = defaultdict(set)
    day_count = defaultdict(int)
    columns = {"gas_vol": "gas_vol", "gas_profit": "gas_profit", "sales": "sales",
               "purchases": "purch", "store_profit": "store_profit",
               "total_profit": "total_profit"}
    for sid, s in stations.items():
        merged = {}
        for day in (s.get("days") or []):
            if day.get("date"):
                merged[str(day["date"])] = day
        for iso, day in open_days.get(str(sid), {}).items():
            existing = merged.get(iso)
            if existing is None or not is_num(existing.get("sales")):
                merged[iso] = day
        for iso, day in merged.items():
            if not iso:
                continue
            day_count[iso] += 1
            for metric, column in columns.items():
                value = day.get(column)
                if is_num(value):
                    by_date[iso][metric] += float(value)
                    reported[iso].add(metric)

    def bucket_key(iso, period):
        if period == "day":
            return iso
        if period == "month":
            return iso[:7]
        if period == "year":
            return iso[:4]
        date = __import__("datetime").date.fromisoformat(iso)
        return (date - __import__("datetime").timedelta(days=date.weekday())).isoformat()

    for period in ("day", "week", "month", "year"):
        buckets = defaultdict(lambda: defaultdict(float))
        bucket_reported = defaultdict(set)
        counts = defaultdict(int)
        for iso, row in by_date.items():
            key = bucket_key(iso, period)
            counts[key] += day_count[iso]
            bucket_reported[key] |= reported[iso]
            for metric in DAY_METRICS:
                buckets[key][metric] += row[metric]

        console_rows = {r["key"]: r for r in figures["days"][period]}
        check(sorted(buckets) == sorted(console_rows),
              f"{period} buckets differ: recomputed {len(buckets)}, console {len(console_rows)}")

        for key, row in buckets.items():
            got = console_rows.get(key)
            if not got:
                continue
            check(counts[key] == got["days"],
                  f"{period} {key} store-days: recomputed {counts[key]}, console {got['days']}")
            for metric in DAY_METRICS:
                mine = row[metric] if metric in bucket_reported[key] else None
                check(close(mine, got[metric]),
                      f"{period} {key} {metric}: recomputed {mine}, console {got[metric]}")
            expected = ((row["store_profit"] / row["sales"])
                        if {"sales", "store_profit"} <= bucket_reported[key] and row["sales"]
                        else None)
            check(close(expected, got["margin"], tol=1e-9),
                  f"{period} {key} margin: recomputed {expected}, console {got['margin']}")

    # Every grain has to reconcile to the same totals, or the period control is
    # showing four different answers to the same question.
    for metric in DAY_METRICS:
        totals = {p: sum(r[metric] or 0 for r in figures["days"][p])
                  for p in ("day", "week", "month", "year")}
        check(all(close(totals["day"], v) for v in totals.values()),
              f"{metric} does not reconcile across grains: {totals}")
    print(f"  ok    {len(by_date)} dates across 4 grains, all reconciling\n")

    # --- timeframes ----------------------------------------------------------
    # The "Showing" picker lets a page open one month or one finished year.
    # Both the months a timeframe claims to cover and the totals over them are
    # re-derived here, so a month that quietly sums its whole year, or a year
    # compared against the wrong year, fails rather than merely looking odd.
    print("Timeframes")
    all_months = sorted({m for sid in months for m in months[sid]})
    seen_kinds = defaultdict(int)

    for tf in figures.get("timeframes", []):
        tid, kind = tf["id"], tf["kind"]
        seen_kinds[kind] += 1

        if kind == "month":
            expect = [tid]
        elif kind == "year":
            expect = [m for m in closed if m.startswith(f"{tid}-")]
        else:
            expect = list(ytd)

        check(tf["keys"] == expect,
              f"timeframe {tid}: covers {tf['keys']}, recomputed {expect}")

        # A month is one month. A finished year is its twelve.
        if kind == "month":
            check(len(tf["keys"]) == 1,
                  f"timeframe {tid}: {len(tf['keys'])} months for a single-month selection")
        if kind == "year":
            check(len(tf["keys"]) == 12,
                  f"timeframe {tid}: {len(tf['keys'])} months for a full year")

        # Each comparison month is the same month one year earlier, and is
        # dropped rather than invented when that month was never reported.
        expect_prior = [f"{int(k[:4]) - 1}{k[4:]}" for k in expect]
        expect_prior = [k for k in expect_prior if k in all_months]
        check(tf["priorKeys"] == expect_prior,
              f"timeframe {tid}: compares against {tf['priorKeys']}, recomputed {expect_prior}")
        check(all(int(k[:4]) == int(c[:4]) - 1 and k[4:] == c[4:]
                  for k, c in zip(tf["priorKeys"], tf["keys"][:len(tf["priorKeys"])])),
              f"timeframe {tid}: comparison months are not the same months a year earlier")

        mine = total(expect)
        for metric in METRICS:
            check(close(mine[metric], tf["totals"][metric]),
                  f"timeframe {tid} {metric}: recomputed {mine[metric]}, "
                  f"console {tf['totals'][metric]}")

        mine_prior = total(expect_prior)
        for metric in METRICS:
            check(close(mine_prior[metric], tf["priorTotals"][metric]),
                  f"timeframe {tid} prior {metric}: recomputed {mine_prior[metric]}, "
                  f"console {tf['priorTotals'][metric]}")

    # The months of a year must add back up to that year, or the picker is
    # showing two different portfolios depending on which entry is chosen.
    by_id = {tf["id"]: tf for tf in figures.get("timeframes", [])}
    for tf in figures.get("timeframes", []):
        if tf["kind"] != "year":
            continue
        parts = [by_id[k] for k in tf["keys"] if k in by_id]
        if len(parts) != len(tf["keys"]):
            continue
        for metric in METRICS:
            summed = sum(p["totals"][metric] or 0 for p in parts)
            check(close(summed, tf["totals"][metric] or 0),
                  f"timeframe {tf['id']} {metric}: months sum to {summed}, "
                  f"year reports {tf['totals'][metric]}")

    print(f"  ok    {len(figures.get('timeframes', []))} timeframes "
          f"({seen_kinds['ytd']} to-date, {seen_kinds['year']} full-year, "
          f"{seen_kinds['month']} monthly), months sum to their year\n")

    # --- departments ---------------------------------------------------------
    # Departments come from the reconciled depts.json, not the older snapshot
    # bundled in the overlay. That snapshot covered fewer stores on mixed
    # Jan–Jul/YTD spans and put the all-stores margins near double the truth.
    # When the feed is supplied it wins; the overlay is only a fallback.
    print("Departments")
    rollup = defaultdict(lambda: {"sales": 0.0, "purchases": 0.0, "profit": 0.0, "stores": 0})
    if depts_path:
        dept_feed = json.load(open(depts_path))
        dept_stations = [(st.get("id"), st.get("departments") or [])
                         for st in (dept_feed.get("stations") or [])]

        # The feed ships its own verified all-stores beer margin. Recompute it
        # from the raw rows and hold the reconstruction to it before trusting
        # anything else the department view shows.
        verified = dept_feed.get("verified_all_stores_beer_margin")
        if is_number(verified):
            bsales = bprofit = 0.0
            for _sid, depts in dept_stations:
                for dept in depts:
                    if str(dept.get("name") or "").strip().upper() != "BEER":
                        continue
                    y = dept.get("y2026") or {}
                    if is_number(y.get("sales")):
                        bsales += y["sales"]
                    if is_number(y.get("profit")):
                        bprofit += y["profit"]
            recomputed = (bprofit / bsales) if bsales else None
            check(close(recomputed, verified, tol=5e-3),
                  f"all-stores beer margin: recomputed {recomputed}, feed says {verified}")
    else:
        dept_stations = [(sid, (s.get("depts") or {}).get("departments") or [])
                         for sid, s in stations.items()]

    for _sid, depts in dept_stations:
        for dept in depts:
            name = str(dept.get("name") or "").strip()
            if not name:
                continue
            row = rollup[name]
            row["stores"] += 1
            for field in ("sales", "purchases", "profit"):
                value = (dept.get("y2026") or {}).get(field)
                if is_number(value):
                    row[field] += value

    console_depts = {d["name"]: d for d in figures["departments"]}
    check(sorted(rollup) == sorted(console_depts),
          f"department names differ: extra={set(rollup) - set(console_depts)} "
          f"missing={set(console_depts) - set(rollup)}")

    for name, row in rollup.items():
        got = console_depts.get(name)
        if not got:
            continue
        for field in ("sales", "purchases", "profit"):
            check(close(row[field], got[field]),
                  f"department {name} {field}: recomputed {row[field]}, console {got[field]}")
        check(row["stores"] == got["stores"],
              f"department {name} store count: recomputed {row['stores']}, console {got['stores']}")
        expected = (row["profit"] / row["sales"]) if row["sales"] else None
        check(close(expected, got["margin"], tol=1e-9),
              f"department {name} margin: recomputed {expected}, console {got['margin']}")
    print(f"  ok    {len(rollup)} departments reconciled\n")

    print(f"{checks - failures}/{checks} figures verified")
    if failures:
        print(f"{failures} mismatched")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:7]))
