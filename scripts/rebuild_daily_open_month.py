#!/usr/bin/env python3
"""Rebuild /data/daily_september.json (admin daily-open) from the live books overlay.

The admin console at /new maps `/api/data/daily-open.json` →
`/data/daily_september.json`. That static asset is what drives the MTD
"through" date. The KV books overlay alone is not enough — after publishing
open-month days you must rebuild and deploy this file.

La Mesa (42642) is excluded.

Usage:
  python3 scripts/rebuild_daily_open_month.py [--month 2026-09] [--out PATH]
  python3 scripts/rebuild_daily_open_month.py --month 2026-09 \\
    --out /tmp/ss-site/data/daily_september.json

Then from the smartsolutions-site checkout:
  bash scripts/build-cf-dist.sh && npx wrangler deploy
"""
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

SITE = "https://smartsolutionsai.us"
SKIP_IDS = {"42642"}  # La Mesa — removed from website books
DAY_KEYS = (
    "date",
    "gas_vol",
    "gas_profit",
    "sales",
    "purch",
    "store_profit",
    "margin",
    "total_profit",
)
MONTH_LABELS = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
}


def fetch_overlay() -> dict:
    req = urllib.request.Request(
        f"{SITE}/.netlify/functions/books-overlay",
        headers={
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)
    if not payload.get("ok"):
        raise SystemExit(f"books-overlay failed: {payload!r}"[:400])
    stations = (payload.get("overlay") or {}).get("stations") or {}
    if not isinstance(stations, dict) or not stations:
        raise SystemExit("books-overlay returned no stations")
    return stations


def as_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def station_key(sid: str):
    return (0, int(sid)) if sid.isdigit() else (1, sid)


def build(stations: dict, month: str) -> dict:
    year, mo = month.split("-")
    year_i, mo_i = int(year), int(mo)
    label = f"{MONTH_LABELS[mo_i]} {year_i} month to date"
    out_stations = []
    sales_dates: list[str] = []

    for sid in sorted(stations.keys(), key=station_key):
        if sid in SKIP_IDS:
            continue
        st = stations[sid] or {}
        days = []
        for raw in st.get("days") or []:
            if not isinstance(raw, dict):
                continue
            date = str(raw.get("date") or "")
            if not date.startswith(month):
                continue
            row = {"date": date}
            for key in DAY_KEYS:
                if key == "date":
                    continue
                if key in raw:
                    row[key] = as_float(raw.get(key))
            days.append(row)
            if row.get("sales"):
                sales_dates.append(date)
        days.sort(key=lambda r: r["date"])
        out_stations.append(
            {
                "id": sid,
                "name": st.get("name") or sid,
                "days": days,
            }
        )

    through = max(sales_dates) if sales_dates else None
    return {
        "month": month,
        "label": label,
        "through": through,
        "closed": False,
        "stations": out_stations,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--month", default="2026-09", help="YYYY-MM open month")
    ap.add_argument(
        "--out",
        help="Write JSON here (default: stdout)",
    )
    ap.add_argument(
        "--overlay-file",
        help="Use a local overlay JSON instead of fetching live",
    )
    args = ap.parse_args()

    if args.overlay_file:
        payload = json.loads(Path(args.overlay_file).read_text())
        stations = payload.get("stations") or (payload.get("overlay") or {}).get("stations")
        if not stations:
            raise SystemExit("overlay file has no stations")
    else:
        stations = fetch_overlay()

    doc = build(stations, args.month)
    text = json.dumps(doc, indent=2) + "\n"
    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(
            f"wrote {path} through={doc['through']} stations={len(doc['stations'])}",
            flush=True,
        )
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
