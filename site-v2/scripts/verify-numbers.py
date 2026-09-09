#!/usr/bin/env python3
"""
Independently recompute every headline figure from the raw books feed and
compare it against what the console produces.

This deliberately does not import any of the console's code. It re-derives the
rules from scratch so that a mistake in the JavaScript aggregation shows up as a
mismatch rather than being reproduced identically on both sides.

    node scripts/dump-model.mjs > /tmp/console-figures.json
    python3 scripts/verify-numbers.py /tmp/console-figures.json /tmp/live/overlay.json
"""

import json
import math
import sys
from collections import defaultdict

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


def main(figures_path, overlay_path):
    figures = json.load(open(figures_path))
    stations = json.load(open(overlay_path))["overlay"]["stations"]

    # Rebuild the month map with the same "is it real" rule, derived here.
    months = {sid: {k: v for k, v in (s.get("months") or {}).items() if real_month(v)}
              for sid, s in stations.items()}

    print("Station set")
    check(sorted(months) == sorted(figures["stationIds"]),
          f"station ids differ: extra={set(months) - set(figures['stationIds'])} "
          f"missing={set(figures['stationIds']) - set(months)}")
    print(f"  ok    {len(months)} stations\n")

    # --- latest closed month -------------------------------------------------
    all_months = sorted({m for mm in months.values() for m in mm})
    reporting = [sid for sid, mm in months.items() if mm]
    latest = None
    for key in reversed(all_months):
        filed = sum(1 for sid in reporting if key in months[sid])
        if filed >= math.ceil(len(reporting) / 2):
            latest = key
            break

    print("Period resolution")
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

    # --- departments ---------------------------------------------------------
    print("Departments")
    rollup = defaultdict(lambda: {"sales": 0.0, "purchases": 0.0, "profit": 0.0, "stores": 0})
    for sid, s in stations.items():
        for dept in ((s.get("depts") or {}).get("departments") or []):
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
    sys.exit(main(sys.argv[1], sys.argv[2]))
