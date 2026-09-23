#!/usr/bin/env python3
"""Publish open-month daily rows from Daily Excel → Cloudflare books overlay.

Excel Daily.xlsx September sheets are the source of truth for website MTD
(store sales / purch / margin). After publish, open-month MTD is served from
the books overlay via Cloudflare Workers:

  - ss-api:           GET /api/daily-open  (and /data/daily_september.json)
  - ss-unified-proto: proxies /data/daily_september.json → /api/daily-open

Usage:
  python3 scripts/sync_from_excel.py \\
    --xlsx-dir /tmp/books_fix_0922 \\
    --month 2026-09 \\
    --publish

  python3 scripts/sync_from_excel.py --xlsx-dir ... --month 2026-09 --dry-run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:  # pragma: no cover
    raise SystemExit("openpyxl required: pip install openpyxl") from exc

REPO = Path(__file__).resolve().parents[1]

STORE_FILES = {
    "42004": ("Arco Placentia", "Arco Placentia Daily.xlsx"),
    "42021": ("Westminster", "Westminster Daily.xlsx"),
    "42048": ("San Diego", "San Diego Daily.xlsx"),
    "42098": ("Brookhurst 75", "Brookhurst 75 Daily.xlsx"),
    "42179": ("Arco HB", "Arco HB Daily.xlsx"),
    "42279": ("Koval", "Koval Daily.xlsx"),
    "42280": ("Spring Mtn", "Spring Mtn Daily.xlsx"),
    "42281": ("Charleston", "Charleston Daily.xlsx"),
    "42282": ("Oakey Las Vegas Blvd", "Oakey Las Vegas Blvd Daily.xlsx"),
    "42352": ("Arco Db", "Arco Db Daily.xlsx"),
    "42399": ("Garden Grove", "Garden Grove Daily.xlsx"),
    "42438": ("Vista", "Vista Daily.xlsx"),
    "42439": ("Lamb", "Lamb Daily.xlsx"),
    "42674": ("Tustin", "Tustin Daily.xlsx"),
}


def find_month_sheet(wb, month: str) -> str | None:
    year, mo = month.split("-")
    names = {
        "01": "january",
        "02": "february",
        "03": "march",
        "04": "april",
        "05": "may",
        "06": "june",
        "07": "july",
        "08": "august",
        "09": "september",
        "10": "october",
        "11": "november",
        "12": "december",
    }
    want = names[mo]
    for name in wb.sheetnames:
        low = name.strip().lower()
        if low == f"{want} {year}" or low == want:
            return name
    for name in wb.sheetnames:
        if want in name.lower() and "calc" not in name.lower():
            return name
    return None


def parse_date(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            pass
    return None


def find_daily_header(ws):
    for r in range(1, 40):
        texts = {}
        for c in range(1, 30):
            v = ws.cell(r, c).value
            if v is None:
                continue
            texts[c] = str(v).strip().lower()
        has_date = any(t == "date" for t in texts.values())
        has_sales = any("c-store sales" in t for t in texts.values())
        has_purch = any("net daily purchases" in t for t in texts.values())
        if not (has_date and has_sales and has_purch):
            continue
        m = {}
        for c, t in texts.items():
            if t == "date":
                m["date"] = c
            elif "gas volume" in t:
                m["gas_vol"] = c
            elif t.startswith("gas profit"):
                m["gas_profit"] = c
            elif "c-store sales" in t:
                m["sales"] = c
            elif "net daily purchases" in t:
                m["purch"] = c
            elif t.startswith("store profit"):
                m["store_profit"] = c
            elif t.startswith("store margin"):
                m["margin"] = c
            elif t.startswith("total profit"):
                m["total_profit"] = c
        return r, m
    return None, {}


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def extract_station(path: Path, sid: str, name: str, fname: str, month: str) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True)
    sn = find_month_sheet(wb, month)
    if not sn:
        raise SystemExit(f"{sid} {name}: no sheet for {month} in {path}")
    ws = wb[sn]
    hr, cols = find_daily_header(ws)
    if not hr or not cols.get("date") or not cols.get("sales"):
        raise SystemExit(f"{sid} {name}: daily header not found on {sn}")
    year_i, mo_i = map(int, month.split("-"))
    days = []
    seen = set()
    blank_streak = 0
    for r in range(hr + 1, hr + 1 + 31):
        dt = parse_date(ws.cell(r, cols["date"]).value)
        if not dt or dt.year != year_i or dt.month != mo_i:
            blank_streak += 1
            if blank_streak >= 3 and days:
                break
            continue
        iso = dt.isoformat()
        if iso in seen:
            continue
        sales = num(ws.cell(r, cols["sales"]).value)
        purch = num(ws.cell(r, cols["purch"]).value) if cols.get("purch") else None
        gas_vol = num(ws.cell(r, cols["gas_vol"]).value) if cols.get("gas_vol") else None
        gas_profit = num(ws.cell(r, cols["gas_profit"]).value) if cols.get("gas_profit") else None
        if sales is None:
            blank_streak += 1
            if blank_streak >= 3 and days:
                break
            continue
        blank_streak = 0
        purch = 0.0 if purch is None else purch
        # Drop empty placeholder rows (no activity).
        if sales == 0 and purch == 0 and not (gas_vol and gas_vol != 0):
            continue
        store_profit = (
            num(ws.cell(r, cols["store_profit"]).value)
            if cols.get("store_profit")
            else (sales - purch)
        )
        margin = (
            num(ws.cell(r, cols["margin"]).value)
            if cols.get("margin")
            else ((sales - purch) / sales if sales else None)
        )
        if margin is not None and abs(margin) > 1.5:
            margin = margin / 100.0
        if margin is None and sales:
            margin = (sales - purch) / sales
        if store_profit is None:
            store_profit = sales - purch
        total_profit = (
            num(ws.cell(r, cols["total_profit"]).value) if cols.get("total_profit") else None
        )
        days.append(
            {
                "date": iso,
                "gas_vol": round(gas_vol, 2) if gas_vol is not None else None,
                "gas_profit": round(gas_profit, 2) if gas_profit is not None else None,
                "sales": round(sales, 2),
                "purch": round(purch, 2),
                "store_profit": round(store_profit, 2),
                "margin": round(margin, 4) if margin is not None else None,
                "total_profit": round(total_profit, 2) if total_profit is not None else None,
            }
        )
        seen.add(iso)
    return {
        "file": fname,
        "kind": "daily",
        "id": sid,
        "name": name,
        "period": month,
        "days": days,
        "months": {},
        "kpis": {},
    }


def resolve_path(xlsx_dir: Path, sid: str, fname: str) -> Path:
    candidates = [
        xlsx_dir / f"{sid}_daily.xlsx",
        xlsx_dir / fname,
        xlsx_dir / fname.replace(" ", "_"),
    ]
    for c in candidates:
        if c.exists():
            return c
    raise SystemExit(f"missing Excel for {sid}: tried {[str(c) for c in candidates]}")


def summarize(stations: list[dict]) -> None:
    print(f"{'id':6} {'name':28} {'days':>4} {'sales':>9} {'purch':>9} {'m%':>8}")
    for st in stations:
        sales = sum(float(d.get("sales") or 0) for d in st["days"])
        purch = sum(float(d.get("purch") or 0) for d in st["days"])
        m = ((sales - purch) / sales * 100) if sales else None
        mtxt = f"{m:.2f}" if m is not None else "n/a"
        last = st["days"][-1]["date"] if st["days"] else "—"
        print(
            f"{st['id']:6} {st['name'][:28]:28} {len(st['days']):4} "
            f"{sales:9.0f} {purch:9.0f} {mtxt:>8}  last={last}"
        )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--xlsx-dir", required=True, help="Directory of *_daily.xlsx files")
    ap.add_argument("--month", default="2026-09", help="YYYY-MM open month")
    ap.add_argument("--out", default="/tmp/s2k/exports/sync_from_excel.json")
    ap.add_argument("--publish", action="store_true", help="POST to Cloudflare books overlay")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    xlsx_dir = Path(args.xlsx_dir)
    stations = []
    for sid, (name, fname) in STORE_FILES.items():
        path = resolve_path(xlsx_dir, sid, fname)
        stations.append(extract_station(path, sid, name, fname, args.month))

    payload = {
        "stations": stations,
        "source": "excel_daily_sheets",
        "month": args.month,
        "built_at": datetime.now(timezone.utc).isoformat(),
        "note": "Excel Daily sheets are source of truth for website open-month MTD",
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out} stations={len(stations)}")
    summarize(stations)

    if args.dry_run or not args.publish:
        if not args.publish:
            print("skip publish (pass --publish)")
        return

    cmd = ["node", str(REPO / "scripts/publish-books.mjs"), "--file", str(out)]
    print(" ".join(cmd), flush=True)
    subprocess.check_call(cmd)
    print(
        "Published to Cloudflare books overlay. "
        "MTD is live via /api/daily-open (ss-api) and proxied on ss-unified-proto.",
        flush=True,
    )


if __name__ == "__main__":
    main()
