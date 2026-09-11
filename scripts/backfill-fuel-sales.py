#!/usr/bin/env python3
"""Fill missing fuel revenue (gas_sales) into the live books overlay.

A month renders fuel revenue only if gas_sales reaches the site, and it can
arrive two ways: the static `/data/monthly.json` feed, or the month's own
overlay entry (which the console spreads over the feed). This reads the
Fuel Sales ($) column out of each Monthly Summary workbook, finds the months
`monthly.json` has no figure for, and emits a `{"stations":[...]}` payload that
re-sends those overlay months with gas_sales added.

Months already covered by `monthly.json` are left alone so the static feed
stays authoritative for them; pass --all to write every month regardless.
Each month is sent back with the fields it already had, so the publish adds
fuel revenue without dropping anything the overlay already holds.

Usage:
  python3 scripts/backfill-fuel-sales.py 42352:"Arco Db Monthly Summary.xlsx" ... \
      > stations.json
  node scripts/publish-books.mjs --file stations.json

Options:
  --overlay PATH   read the overlay from a file instead of fetching it live
  --monthly PATH   read monthly.json from a file instead of fetching it live
  --all            write every month that has a workbook figure, not just the
                   ones missing from monthly.json
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys
import urllib.request

SITE = "https://smartsolutionsai.us"
OVERLAY_URL = SITE + "/.netlify/functions/books-overlay"
MONTHLY_URL = SITE + "/data/monthly.json"

# Station names as published by the site (see .cursor/excel-sync.md).
STATION_NAMES = {
    "42004": "Arco Placentia",
    "42021": "Westminster",
    "42048": "San Diego",
    "42073": "Laguna",
    "42098": "Brookhurst 75",
    "42179": "Arco HB",
    "42246": "Arco GG",
    "42279": "Koval",
    "42280": "Spring Mtn",
    "42281": "Charleston",
    "42282": "Oakey Las Vegas Blvd",
    "42352": "Arco Db",
    "42359": "Paradise",
    "42399": "Garden Grove",
    "42438": "Vista",
    "42439": "Lamb",
    "42642": "La Mesa",
    "42674": "Tustin",
    "extramile": "ExtraMile",
}


def load_extractor():
    """Import the sibling extractor, whose filename is not a Python identifier."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "extract-fuel-summary-months.py")
    spec = importlib.util.spec_from_file_location("fuel_summary", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fetch_json(url, path=None):
    if path:
        with open(path) as fh:
            return json.load(fh)
    # The Worker rejects urllib's default user agent.
    req = urllib.request.Request(url, headers={
        "User-Agent": "smartsolutions-excel-sync",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode("utf8"))


def revenue_index(monthly):
    """Months that already carry gas_sales in the static monthly.json feed."""
    out = {}
    for station in (monthly.get("stations") or []):
        keys = {
            key for key, value in (station.get("months") or {}).items()
            if isinstance(value, dict) and value.get("gas_sales") is not None
        }
        out[str(station.get("id"))] = keys
    return out


def main():
    args = sys.argv[1:]
    overlay_path = None
    monthly_path = None
    send_all = False
    targets = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--overlay":
            i += 1
            overlay_path = args[i]
        elif arg == "--monthly":
            i += 1
            monthly_path = args[i]
        elif arg == "--all":
            send_all = True
        elif ":" in arg:
            store_id, path = arg.split(":", 1)
            targets.append((store_id.strip(), path))
        else:
            print(f"unrecognised argument: {arg}", file=sys.stderr)
            return 1
        i += 1

    if not targets:
        print(__doc__, file=sys.stderr)
        return 1

    fuel_summary = load_extractor()
    overlay = fetch_json(OVERLAY_URL, overlay_path)
    live = ((overlay.get("overlay") or {}).get("stations")) or {}
    published = revenue_index(fetch_json(MONTHLY_URL, monthly_path))

    stations = []
    filled = 0
    skipped_no_month = []
    for store_id, path in targets:
        name = STATION_NAMES.get(store_id, store_id)
        book = fuel_summary.extract(path, store_id, name)
        book_months = book["patch"]["fuel"][0]["months"]
        current = (live.get(store_id) or {}).get("months") or {}
        already = published.get(store_id) or set()

        months = {}
        for key in sorted(book_months):
            sales = book_months[key].get("gas_sales")
            if sales is None:
                continue
            if not send_all and (key in already or (current.get(key) or {}).get("gas_sales") is not None):
                continue
            existing = current.get(key)
            if existing is None:
                # No overlay month to extend; publishing fuel revenue on its own
                # would create a month with no store figures behind it.
                skipped_no_month.append((name, key, sales))
                continue
            months[key] = {**existing, "gas_sales": sales}
            filled += 1

        if not months:
            continue
        station = (live.get(store_id) or {})
        stations.append({
            "file": path.rsplit("/", 1)[-1],
            "kind": "monthly",
            "id": store_id,
            "name": station.get("name") or name,
            "period": max(months),
            # Echo the overlay's own day rows back. Nothing here changes them,
            # but sending them means the publish is safe whether the merge
            # appends days or replaces the station wholesale.
            "days": station.get("days") or [],
            "months": months,
            "kpis": station.get("kpis") or {},
        })

    total = sum(m["gas_sales"] for s in stations for m in s["months"].values())
    print(f"stores to publish: {len(stations)}", file=sys.stderr)
    for s in stations:
        keys = sorted(s["months"])
        amount = sum(m["gas_sales"] for m in s["months"].values())
        print(f"  {s['id']:<10} {s['name']:<22} {len(keys):>2} months "
              f"{keys[0]}..{keys[-1]}  ${amount:,.2f}", file=sys.stderr)
    print(f"fuel revenue added: {filled} store-months, ${total:,.2f}", file=sys.stderr)
    for name, key, sales in skipped_no_month:
        print(f"  skipped {name} {key} (${sales:,.2f}): no overlay month to extend",
              file=sys.stderr)

    json.dump({"stations": stations}, sys.stdout, indent=1)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
