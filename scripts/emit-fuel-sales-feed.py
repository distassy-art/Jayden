#!/usr/bin/env python3
"""Emit fuel revenue per store-month in the shape of /data/monthly.json.

`POST /.netlify/functions/books` merges day rows only — it ignores `months` —
so gas_sales cannot be written into the KV overlay. The static
`/data/monthly.json` feed is the only place the site reads fuel revenue from,
which makes this the hand-off artifact: merge it into that feed on the next
site deploy.

Usage:
  python3 scripts/emit-fuel-sales-feed.py 42352:"Arco Db Monthly Summary.xlsx" ... \
      [--monthly monthly.json] > data/fuel-sales.json

Each month is tagged `missing: true` when the live monthly.json carries no
figure for it, so a reviewer can see what the feed is short of.
"""
from __future__ import annotations

import json
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from importlib.util import module_from_spec, spec_from_file_location  # noqa: E402
import os  # noqa: E402


def load(name):
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), name)
    spec = spec_from_file_location(name.replace("-", "_").removesuffix(".py"), path)
    mod = module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    args = sys.argv[1:]
    monthly_path = None
    targets = []
    i = 0
    while i < len(args):
        if args[i] == "--monthly":
            i += 1
            monthly_path = args[i]
        elif ":" in args[i]:
            store_id, path = args[i].split(":", 1)
            targets.append((store_id.strip(), path))
        else:
            print(f"unrecognised argument: {args[i]}", file=sys.stderr)
            return 1
        i += 1
    if not targets:
        print(__doc__, file=sys.stderr)
        return 1

    fuel_summary = load("extract-fuel-summary-months.py")
    backfill = load("backfill-fuel-sales.py")
    published = backfill.revenue_index(
        backfill.fetch_json(backfill.MONTHLY_URL, monthly_path)
    )

    stations = []
    missing = 0
    for store_id, path in targets:
        name = backfill.STATION_NAMES.get(store_id, store_id)
        book = fuel_summary.extract(path, store_id, name)
        already = published.get(store_id) or set()
        months = {}
        for key, rec in sorted(book["patch"]["fuel"][0]["months"].items()):
            sales = rec.get("gas_sales")
            if sales is None:
                continue
            months[key] = {"gas_sales": sales}
            if key not in already:
                months[key]["missing"] = True
                missing += 1
        if months:
            stations.append({"id": store_id, "name": name,
                             "source": path.rsplit("/", 1)[-1], "months": months})

    total = sum(len(s["months"]) for s in stations)
    print(f"{total} store-months of fuel revenue, {missing} absent from monthly.json",
          file=sys.stderr)
    json.dump({"stations": stations}, sys.stdout, indent=1, sort_keys=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
