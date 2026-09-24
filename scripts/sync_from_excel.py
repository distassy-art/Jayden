#!/usr/bin/env python3
"""Publish open-month daily rows from Daily Excel → Cloudflare books overlay
**and** rebuild ``/data/daily_september.json`` (admin MTD "through" date).

Excel Daily.xlsx September sheets are the source of truth for website MTD
(store sales / purch / margin). After publish:

  1. POST stations → Netlify books overlay (KV)
  2. Rebuild ``daily_september.json`` from that overlay
  3. Deploy ss-api assets so ``/data/daily_september.json`` matches

Skipping step 2–3 leaves the UI stuck on an older ``through`` date even when
the books overlay already has newer days.

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
import os
import re
import shutil
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

try:
    import openpyxl
except ImportError as exc:  # pragma: no cover
    raise SystemExit("openpyxl required: pip install openpyxl") from exc

REPO = Path(__file__).resolve().parents[1]
DATE_FORMULA_RE = re.compile(
    r"^=\s*DATE\s*\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})\s*\)\s*$",
    re.IGNORECASE,
)
# ='September 2026 Source'!E3  or  ='Sheet Name'!E3
SHEET_REF_RE = re.compile(
    r"^=\s*(?:'([^']+)'|([A-Za-z0-9_ ]+))\s*!\s*([A-Za-z]+)(\d+)\s*$"
)

# ss-api checkout used to deploy /data/daily_september.json (override with env)
SS_API_DIR = Path(
    os.environ.get("SS_API_DEPLOY_DIR", "/tmp/ss-api-deploy")
).expanduser()

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
    "42359": ("Paradise", "Paradise Daily.xlsx"),
    "42399": ("Garden Grove", "Garden Grove Daily.xlsx"),
    "42438": ("Vista", "Vista Daily.xlsx"),
    "42439": ("Lamb", "Lamb Daily.xlsx"),
    "42674": ("Tustin", "Tustin Daily.xlsx"),
    "extramile": ("ExtraMile", "ExtraMile Daily.xlsx"),
}


def _month_name(month: str) -> str:
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
    return names[mo]


def find_month_sheet(wb, month: str) -> str | None:
    year, mo = month.split("-")
    want = _month_name(month)
    for name in wb.sheetnames:
        low = name.strip().lower()
        if low == f"{want} {year}" or low == want:
            return name
    for name in wb.sheetnames:
        if want in name.lower() and "calc" not in name.lower():
            return name
    return None


def find_month_calc_sheet(wb, month: str) -> str | None:
    """San Diego-style books keep the daily table on '{Month} Calculations'."""
    want = _month_name(month)
    for name in wb.sheetnames:
        low = name.strip().lower()
        if want in low and "calc" in low:
            return name
    return None


def find_month_source_sheet(wb, month: str) -> str | None:
    """Some Big Daddy books keep values on '{Month} YYYY Source'."""
    year, _mo = month.split("-")
    want = _month_name(month)
    for name in wb.sheetnames:
        low = name.strip().lower()
        if want in low and "source" in low and year in low:
            return name
    for name in wb.sheetnames:
        low = name.strip().lower()
        if want in low and "source" in low:
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
    m = DATE_FORMULA_RE.match(s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None
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
        has_purch = any(
            "net daily purchases" in t or t.startswith("net purchases")
            for t in texts.values()
        )
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
            elif "net daily purchases" in t or t.startswith("net purchases"):
                m["purch"] = c
            elif t.startswith("store profit"):
                m["store_profit"] = c
            elif t.startswith("store margin"):
                m["margin"] = c
            elif t.startswith("total profit"):
                m["total_profit"] = c
            elif "c-store total" in t:
                m["cstore_total"] = c
        return r, m
    return None, {}


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _col_letters_to_idx(letters: str) -> int:
    n = 0
    for ch in letters.upper():
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def resolve_numeric(wb, wb_f, sn: str, row: int, col: int, cols: dict | None = None):
    """data_only value, else cross-sheet ref, else C-Store Total − deductions."""
    ws = wb[sn]
    ws_f = wb_f[sn]
    v = num(ws.cell(row, col).value)
    if v is not None:
        return v
    raw = ws_f.cell(row, col).value
    if raw is None:
        return None
    if not isinstance(raw, str):
        return num(raw)
    s = raw.strip()
    m = SHEET_REF_RE.match(s)
    if m:
        ref_sheet = m.group(1) or m.group(2)
        ref_col = _col_letters_to_idx(m.group(3))
        ref_row = int(m.group(4))
        if ref_sheet in wb.sheetnames:
            return num(wb[ref_sheet].cell(ref_row, ref_col).value)
        return None
    # Reconstruct C-Store Sales from Total − tax/lottery/etc. columns.
    if cols and col == cols.get("sales"):
        total_col = cols.get("cstore_total") or 10
        total = num(ws.cell(row, total_col).value)
        if total is None:
            return None
        end = cols.get("total_profit")
        if end is None or end <= total_col:
            end = total_col + 6
        for c in range(total_col + 1, end):
            part = num(ws.cell(row, c).value)
            if part is not None:
                total -= part
        return total
    return None


def pick_daily_sheet(wb, wb_f, month: str):
    """Prefer Source (cached values), then Calculations, then open-month sheet."""
    candidates = []
    src = find_month_source_sheet(wb, month)
    if src:
        candidates.append(src)
    calc = find_month_calc_sheet(wb, month)
    if calc:
        candidates.append(calc)
    main = find_month_sheet(wb, month)
    if main:
        candidates.append(main)
    for sn in candidates:
        hr, cols = find_daily_header(wb_f[sn])
        if hr and cols.get("date") and cols.get("sales"):
            return sn, hr, cols
    return main, None, {}


def extract_station(path: Path, sid: str, name: str, fname: str, month: str) -> dict:
    wb = openpyxl.load_workbook(path, data_only=True)
    wb_f = openpyxl.load_workbook(path, data_only=False)
    sn, hr, cols = pick_daily_sheet(wb, wb_f, month)
    if not sn:
        raise SystemExit(f"{sid} {name}: no sheet for {month} in {path}")
    if not hr or not cols.get("date") or not cols.get("sales"):
        raise SystemExit(f"{sid} {name}: daily header not found on {sn}")
    ws = wb[sn]
    ws_f = wb_f[sn]
    year_i, mo_i = map(int, month.split("-"))
    days = []
    seen = set()
    blank_streak = 0
    for r in range(hr + 1, hr + 1 + 31):
        dt = parse_date(ws.cell(r, cols["date"]).value)
        if dt is None:
            dt = parse_date(ws_f.cell(r, cols["date"]).value)
        if not dt or dt.year != year_i or dt.month != mo_i:
            blank_streak += 1
            if blank_streak >= 3 and days:
                break
            continue
        iso = dt.isoformat()
        if iso in seen:
            continue
        sales = resolve_numeric(wb, wb_f, sn, r, cols["sales"], cols)
        purch = (
            resolve_numeric(wb, wb_f, sn, r, cols["purch"], cols)
            if cols.get("purch")
            else None
        )
        # Prefer main-sheet purch when Source purch is blank/0 but main has activity fills.
        if (purch is None or purch == 0) and sn != find_month_sheet(wb, month):
            main = find_month_sheet(wb, month)
            if main and main != sn:
                mhr, mcols = find_daily_header(wb_f[main])
                if mhr and mcols.get("purch"):
                    # Align by date on main sheet.
                    for mr in range(mhr + 1, mhr + 1 + 31):
                        mdt = parse_date(wb[main].cell(mr, mcols["date"]).value) or parse_date(
                            wb_f[main].cell(mr, mcols["date"]).value
                        )
                        if mdt and mdt.isoformat() == iso:
                            mp = resolve_numeric(wb, wb_f, main, mr, mcols["purch"], mcols)
                            if mp is not None:
                                purch = mp
                            break
        gas_vol = (
            resolve_numeric(wb, wb_f, sn, r, cols["gas_vol"], cols)
            if cols.get("gas_vol")
            else None
        )
        gas_profit = (
            resolve_numeric(wb, wb_f, sn, r, cols["gas_profit"], cols)
            if cols.get("gas_profit")
            else None
        )
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
        # Excel Deduct rule: negatives → $0 for margin/profit (MAX(0,F)).
        purch_for_margin = max(0.0, float(purch))
        store_profit = (
            resolve_numeric(wb, wb_f, sn, r, cols["store_profit"], cols)
            if cols.get("store_profit")
            else None
        )
        if store_profit is None:
            store_profit = sales - purch_for_margin
        # Match Excel: =(E-MAX(0,F))/E  (ratio, not percent)
        margin = ((sales - purch_for_margin) / sales) if sales else None
        total_profit = (
            resolve_numeric(wb, wb_f, sn, r, cols["total_profit"], cols)
            if cols.get("total_profit")
            else None
        )
        days.append(
            {
                "date": iso,
                "gas_vol": round(gas_vol, 2) if gas_vol is not None else None,
                "gas_profit": round(gas_profit, 2) if gas_profit is not None else None,
                "sales": round(sales, 2),
                # Keep raw Net Daily Purchases (may be negative); margin uses MAX(0,purch).
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


def resolve_path(xlsx_dir: Path, sid: str, fname: str) -> Path | None:
    candidates = [
        xlsx_dir / f"{sid}_daily.xlsx",
        xlsx_dir / fname,
        xlsx_dir / fname.replace(" ", "_"),
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def summarize(stations: list[dict]) -> None:
    print(f"{'id':10} {'name':28} {'days':>4} {'sales':>9} {'purch':>9} {'m%':>8}")
    for st in stations:
        sales = sum(float(d.get("sales") or 0) for d in st["days"])
        purch = sum(max(0.0, float(d.get("purch") or 0)) for d in st["days"])
        m = ((sales - purch) / sales * 100) if sales else None
        mtxt = f"{m:.2f}" if m is not None else "n/a"
        last = st["days"][-1]["date"] if st["days"] else "—"
        print(
            f"{st['id']:10} {st['name'][:28]:28} {len(st['days']):4} "
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
        if path is None:
            print(
                f"missing Excel for {sid} {name} "
                f"(tried {[str(xlsx_dir / f) for f in (f'{sid}_daily.xlsx', fname)]}); "
                "keeping existing overlay days"
            )
            continue
        st = extract_station(path, sid, name, fname, args.month)
        if not st["days"]:
            print(f"skip empty {sid} {name} (keep existing overlay days)")
            continue
        stations.append(st)

    if not stations:
        raise SystemExit("no stations with days extracted")

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
    print("Published to Cloudflare books overlay.", flush=True)

    # Overlay alone is not enough — rebuild + deploy daily_september.json
    # so /new MTD "through" matches Excel (otherwise UI stays on old date).
    rebuild_and_deploy_daily_open(args.month)


def rebuild_and_deploy_daily_open(month: str) -> None:
    """Rebuild /data/daily_september.json from live overlay and wrangler-deploy ss-api."""
    rebuild = REPO / "scripts" / "rebuild_daily_open_month.py"
    if not rebuild.exists():
        print(f"WARN missing {rebuild}; skip daily_september rebuild", flush=True)
        return
    dest = SS_API_DIR / "cf-dist" / "data" / "daily_september.json"
    if not (SS_API_DIR / "wrangler.jsonc").exists() and not (
        SS_API_DIR / "wrangler.toml"
    ).exists():
        print(
            f"WARN ss-api deploy dir missing ({SS_API_DIR}); "
            "wrote rebuild only to /tmp — set SS_API_DEPLOY_DIR",
            flush=True,
        )
        dest = Path(f"/tmp/daily_september_{month}.json")
    subprocess.check_call(
        [
            sys.executable,
            str(rebuild),
            "--month",
            month,
            "--out",
            str(dest),
        ]
    )
    # Stamp so wrangler always treats the asset as changed (avoids silent skip
    # when a prior deploy already uploaded an identical through-date payload,
    # then a later deploy of an older cf-dist rolled the site back).
    if dest.exists():
        doc = json.loads(dest.read_text())
        doc["built_at"] = datetime.now(timezone.utc).isoformat()
        dest.write_text(json.dumps(doc, indent=2) + "\n")
    # Mirror into every local checkout that might be wrangler-deployed later
    mirrors = (
        Path("/tmp/ss-site/data/daily_september.json"),
        Path("/tmp/ss-site/cf-dist/data/daily_september.json"),
        Path("/tmp/ss-unified-proto/assets/data/daily_september.json"),
        Path("/tmp/ss-unified-restore/assets/data/daily_september.json"),
    )
    for mirror in mirrors:
        if mirror.parent.exists() and dest.exists():
            shutil.copy2(dest, mirror)
            print(f"mirrored → {mirror}", flush=True)
    if not (SS_API_DIR / "wrangler.jsonc").exists() and not (
        SS_API_DIR / "wrangler.toml"
    ).exists():
        return
    print(f"npx wrangler deploy (cwd={SS_API_DIR})", flush=True)
    subprocess.check_call(["npx", "wrangler", "deploy"], cwd=str(SS_API_DIR))
    print(
        f"Deployed ss-api /data/daily_september.json for {month}. "
        "MTD through-date is live on /data/daily_september.json.",
        flush=True,
    )


if __name__ == "__main__":
    main()
