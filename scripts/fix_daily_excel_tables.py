#!/usr/bin/env python3
"""Audit + fix missing cells in all Daily Excel tables (Sep open month).

Fills:
  - Daily sales grid (gas, gas profit, c-store components, purch)
  - Top 10 department sales rows
  - Scratchers/Lotto receipt tracker
  - Explicit zero rows for closed days (e.g. Arco Db 09/20)

Source of truth for daily numbers: live books-overlay (site) + Daily Book PDFs
for department/lottery detail. Formula-only purch cells are overwritten with
numeric DLY/site purch so Excel SoT is readable without Excel recalc.

Usage:
  python3 scripts/fix_daily_excel_tables.py \\
    --xlsx-dir /tmp/books_excel_0921 \\
    --through 2026-09-21 \\
    --pdf-dirs /tmp/s2k/pdfs/fill_secondary,/tmp/s2k/exports/stage_daily_0921
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from datetime import date, datetime
from pathlib import Path

try:
    import openpyxl
    from openpyxl.worksheet.formula import ArrayFormula
except ImportError as exc:  # pragma: no cover
    raise SystemExit("openpyxl required") from exc

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from sync_from_excel import STORE_FILES, find_daily_header, find_month_sheet, parse_date
from sync_from_s2k import parse_bd_pdf, parse_single_pdf, r2  # type: ignore

SITE = "https://smartsolutionsai.us"
SKIP_ZERO_ONLY = set()  # days we still want as explicit zeros when site has no row

# TSO used inside Big Daddy combined PDFs
BD_TSO = {
    "42021": "42021",
    "42048": "42048",
    "42098": "42098",
    "42279": "42279",
    "42280": "42280",
    "42281": "42281",
    "42282": "42282",
    "42399": "42399",
    "42438": "42438",
    "42439": "42439",
}


def cell_val(v):
    if isinstance(v, ArrayFormula):
        return getattr(v, "text", str(v))
    return v


def empty(v) -> bool:
    v = cell_val(v)
    return v is None or (isinstance(v, str) and not str(v).strip())


def is_formula(v) -> bool:
    v = cell_val(v)
    return isinstance(v, str) and v.startswith("=")


def as_num(v):
    v = cell_val(v)
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    return None


def parse_d(raw):
    d = parse_date(raw)
    if d:
        return d
    if isinstance(raw, str):
        m = re.search(r"DATE\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", raw, re.I)
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def fetch_overlay() -> dict:
    req = urllib.request.Request(
        f"{SITE}/.netlify/functions/books-overlay",
        headers={"Accept": "application/json", "User-Agent": "fix-daily-excel"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)
    return (payload.get("overlay") or {}).get("stations") or {}


def money(s):
    s = str(s or "").strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
    if s in ("", "-", "--"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_depts_lottery(path: Path, tso: str) -> dict:
    """Parse department sales + lottery/lotto receipts from a Daily Book PDF."""
    if pdfplumber is None:
        return {"depts": {}, "lottery": None, "lotto_rcpt": None}
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    blocks = re.split(r"(?=TSO #\d+)", text)
    cstore_text = ""
    for b in blocks:
        m = re.match(r"TSO #(\d+)", b)
        if not m:
            continue
        raw = m.group(1)
        if not (raw == tso or raw.startswith(tso)):
            continue
        if re.search(r"\d+\.\d+\s+\$[\d,]+\.\d+\s+[\d.]+%", b):
            cstore_text += "\n" + b
    receipt_text = ""
    rm = re.search(r"Receipts\s*\nReceipt Type Receipt Amount", text)
    if rm:
        rpart = text[rm.end() :]
        for b in re.split(r"(?=TSO #\d+)", rpart):
            m = re.match(r"TSO #(\d+)", b)
            if not m:
                continue
            raw = m.group(1)
            if raw == tso or raw.startswith(tso):
                receipt_text = b
                break
    depts = {}
    src = cstore_text if cstore_text else text
    for line in src.splitlines():
        m = re.match(r"^(.+?)\s+([\d,.]+)\s+\$([\d,.]+)\s+([\-\d.]+)%\s+", line.strip())
        if not m:
            continue
        name = m.group(1).strip()
        if name in ("Department",) or "Station Total" in name or "Fuel Grade" in name:
            continue
        depts[name] = money(m.group(3))
    lottery = lotto_rcpt = None
    for line in (receipt_text or "").splitlines():
        m = re.match(r"^LOTTERY\s+\$([\d,.]+)\s*$", line.strip(), re.I)
        if m:
            lottery = money(m.group(1))
        m = re.match(r"^LOTTO\s+\$([\d,.]+)\s*$", line.strip(), re.I)
        if m:
            lotto_rcpt = money(m.group(1))
    return {"depts": depts, "lottery": lottery, "lotto_rcpt": lotto_rcpt}


def norm(s: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "", (s or "").upper())


def match_dept(headers, depts):
    out = {}
    nd = {norm(k): v for k, v in depts.items()}
    for h in headers:
        if not h or not isinstance(h, str):
            continue
        if re.search(r"metric|receipt amount|difference|sales amount \(receipt", h, re.I):
            continue
        key = norm(h)
        if key in nd:
            out[h] = nd[key]
            continue
        hits = [(k, v) for k, v in nd.items() if key in k or k in key]
        if hits:
            hits.sort(key=lambda x: abs(len(x[0]) - len(key)))
            out[h] = hits[0][1]
    return out


def find_pdfs(pdf_dirs: list[Path], sid: str, day: int) -> Path | None:
    """Locate best Daily Book PDF for store/day."""
    stamp = f"09{day:02d}2026"
    name_variants = [
        f"{sid}_{stamp}.pdf",
        f"bd_{stamp}.pdf",
        f"{stamp}.pdf",
    ]

    def date_match(p: Path) -> bool:
        return stamp in p.name.replace("-", "").replace("_", "")

    def is_bd(p: Path) -> bool:
        s = str(p)
        return (
            "BIG DADDY" in s
            or "big daddy" in s.lower()
            or p.name.lower().startswith("bd_")
        )

    # 1) Store-scoped file (sid in path or filename) — never another TSO
    for d in pdf_dirs:
        if not d.exists():
            continue
        for p in d.rglob("*.pdf"):
            if not date_match(p):
                continue
            if sid in str(p) or p.name.startswith(f"{sid}_"):
                return p

    # 2) Big Daddy combined for BD TSOs only
    if sid in BD_TSO:
        for d in pdf_dirs:
            if not d.exists():
                continue
            for nv in name_variants:
                for h in d.rglob(nv):
                    if is_bd(h):
                        return h
            for p in d.rglob(f"*{stamp}*.pdf"):
                if is_bd(p):
                    return p

    # 3) Arco / Tustin by date under their folders
    if sid in ("42004", "42179", "42352", "42674"):
        for d in pdf_dirs:
            if not d.exists():
                continue
            for nv in name_variants:
                hits = [
                    h
                    for h in d.rglob(nv)
                    if sid in str(h) or h.name.startswith(sid)
                ]
                if hits:
                    return hits[0]
            for p in d.rglob(f"*{stamp}*.pdf"):
                if sid in str(p):
                    return p
    return None


def resolve_daily_sheet(wb, sid: str, month: str):
    if sid == "42048":
        for name in wb.sheetnames:
            if "september" in name.lower() and "calc" in name.lower():
                ws = wb[name]
                hr, cols = find_daily_header(ws)
                return ws, hr or 2, cols or {
                    "date": 1,
                    "gas_vol": 2,
                    "gas_profit": 3,
                    "sales": 5,
                    "purch": 6,
                }
    sn = find_month_sheet(wb, month)
    ws = wb[sn]
    hr, cols = find_daily_header(ws)
    if not hr:
        return ws, 8, {"date": 1, "gas_vol": 2, "gas_profit": 3, "sales": 5, "purch": 6}
    return ws, hr, cols


def display_sheet(wb, month: str):
    sn = find_month_sheet(wb, month)
    return wb[sn] if sn else None


def fix_row_formula(formula: str, row: int) -> str:
    """Remap same-sheet A1-style refs in a daily-row formula onto `row`."""
    if not formula or not formula.startswith("="):
        return formula
    # Skip cross-sheet / table / Deduct lookups
    if any(
        x in formula
        for x in ("!", "Deduct", "Purchase", "SUMIFS", "XLOOKUP", "tbl", "Source")
    ):
        return formula

    def repl(m):
        col, rr = m.group(1), int(m.group(2))
        # only remap nearby daily rows (1..40 band)
        if 3 <= rr <= 45:
            return f"{col}{row}"
        return m.group(0)

    return re.sub(r"([A-Z]{1,3})(\d+)", repl, formula)


def write_daily_row(ws, r: int, cols: dict, day: dict, force_purch: bool, changes: list):
    """Fill missing daily core cells from a site/S2K day dict."""
    gas = day.get("gas_vol")
    gp = day.get("gas_profit")
    sales = day.get("sales")
    purch = day.get("purch")
    raw = day.get("_raw") or {}

    def set_if_empty(c, val, label):
        if val is None:
            return
        cur = ws.cell(r, c).value
        if empty(cur):
            ws.cell(r, c).value = val
            changes.append(f"{label}{r}={val}")

    set_if_empty(cols.get("gas_vol", 2), gas, "B")
    set_if_empty(cols.get("gas_profit", 3), gp, "C")

    # components J-O when present in raw
    comp_map = [
        (10, "cstore_total", "J"),
        (11, "tax1", "K"),
        (12, "tax4", "L"),
        (13, "scratch", "M"),
        (14, "lotto", "N"),
        (15, "card", "O"),
    ]
    for c, key, lab in comp_map:
        if raw.get(key) is not None:
            set_if_empty(c, raw[key], lab)

    # If sales formula broken / empty and we have sales — write component total into J if needed
    scol = cols.get("sales", 5)
    sv = ws.cell(r, scol).value
    if empty(sv) and sales is not None:
        # Prefer keeping formula shape: put sales into computed path
        if empty(ws.cell(r, 10).value):
            # no components — write numeric sales
            ws.cell(r, scol).value = float(sales)
            changes.append(f"E{r}={sales}")
        else:
            ws.cell(r, scol).value = f"=J{r}-SUM(K{r}:O{r})"
            changes.append(f"E{r}=formula")
    elif is_formula(sv):
        fixed = fix_row_formula(str(cell_val(sv)), r)
        if fixed != str(cell_val(sv)):
            ws.cell(r, scol).value = fixed
            changes.append(f"E{r}=fixref")

    # Fix other simple row formulas D/G/H/I
    for c in (4, 7, 8, 9):
        v = ws.cell(r, c).value
        if is_formula(v):
            fixed = fix_row_formula(str(cell_val(v)), r)
            if fixed != str(cell_val(v)):
                ws.cell(r, c).value = fixed
                changes.append(f"col{c}{r}=fixref")

    pcol = cols.get("purch", 6)
    cur_p = ws.cell(r, pcol).value
    if purch is not None:
        if empty(cur_p) or (force_purch and (is_formula(cur_p) or (
            as_num(cur_p) is not None and abs(as_num(cur_p) - float(purch)) > 0.02
        ))):
            ws.cell(r, pcol).value = float(purch)
            changes.append(f"F{r}={purch}")


def write_zero_day(ws, r: int, cols: dict, d: date, changes: list):
    """Explicit closed day — all cores zero."""
    ws.cell(r, cols["date"]).value = datetime(d.year, d.month, d.day)
    for c, lab, val in [
        (cols.get("gas_vol", 2), "B", 0),
        (cols.get("gas_profit", 3), "C", 0),
        (cols.get("purch", 6), "F", 0),
        (10, "J", 0),
        (11, "K", 0),
        (12, "L", 0),
        (13, "M", 0),
        (14, "N", 0),
        (15, "O", 0),
    ]:
        ws.cell(r, c).value = val
        changes.append(f"{lab}{r}=0")
    scol = cols.get("sales", 5)
    # Keep formula if present, else numeric 0
    if empty(ws.cell(r, scol).value) or is_formula(ws.cell(r, scol).value):
        # Prefer component formula
        ws.cell(r, scol).value = f"=J{r}-SUM(K{r}:O{r})"
        changes.append(f"E{r}=zero-formula")


def resolve_header_label(wb, h) -> str | None:
    """Resolve literal or cross-sheet formula headers like ='Source'!B40."""
    h = cell_val(h)
    if h is None:
        return None
    if isinstance(h, str) and not h.startswith("="):
        return h.strip() or None
    if isinstance(h, str) and h.startswith("="):
        m = re.search(r"='?([^'!]+)'?!\$?([A-Z]+)\$?(\d+)", h)
        if not m or wb is None:
            return None
        sn, col_letters, row = m.group(1), m.group(2), int(m.group(3))
        if sn not in wb.sheetnames:
            return None
        col = 0
        for ch in col_letters:
            col = col * 26 + (ord(ch) - 64)
        ref = cell_val(wb[sn].cell(row, col).value)
        if isinstance(ref, str) and ref.strip() and not ref.startswith("="):
            return ref.strip()
    return None


def fill_secondary(ws, day: int, parsed: dict, changes: list, sheet_name: str, wb=None):
    # Lottery tracker
    lot_hdr = None
    for r in range(140, 220):
        for c in range(1, 9):
            v = ws.cell(r, c).value
            if isinstance(v, str) and "Receipt LOTTERY" in v:
                lot_hdr = r
                break
        if lot_hdr:
            break
    if lot_hdr and parsed:
        r = lot_hdr + day
        if parsed.get("lottery") is not None and empty(ws.cell(r, 5).value):
            ws.cell(r, 5).value = parsed["lottery"]
            changes.append(f"{sheet_name}!lotE{r}={parsed['lottery']}")
        if parsed.get("lotto_rcpt") is not None and empty(ws.cell(r, 6).value):
            ws.cell(r, 6).value = parsed["lotto_rcpt"]
            changes.append(f"{sheet_name}!lotF{r}={parsed['lotto_rcpt']}")

    # Top 10 department table
    dept_title = None
    for r in range(40, 100):
        a = ws.cell(r, 1).value
        if isinstance(a, str) and "Top" in a and "Department" in a:
            dept_title = r
            break
    if dept_title and parsed and parsed.get("depts"):
        hdr_r = dept_title + 1
        data_r = dept_title + 1 + day
        headers, cols = [], []
        for c in range(2, 15):
            label = resolve_header_label(wb, ws.cell(hdr_r, c).value)
            if not label:
                continue
            if re.search(
                r"metric|receipt amount|difference|sales amount \(receipt",
                label,
                re.I,
            ):
                continue
            headers.append(label)
            cols.append(c)
        if not cols:
            return
        matched = match_dept(headers, parsed["depts"])
        n = 0
        for h, c in zip(headers, cols):
            if h not in matched:
                continue
            if empty(ws.cell(data_r, c).value):
                ws.cell(data_r, c).value = matched[h]
                n += 1
        if n:
            changes.append(f"{sheet_name}!dept day{day} filled {n}/{len(headers)}")


def site_day_map(stations: dict, sid: str) -> dict[str, dict]:
    st = stations.get(sid) or {}
    return {d["date"]: d for d in (st.get("days") or []) if d.get("date")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--xlsx-dir", type=Path, required=True)
    ap.add_argument("--through", default="2026-09-21")
    ap.add_argument(
        "--pdf-dirs",
        default="/tmp/s2k/pdfs/fill_secondary,/tmp/s2k/exports/stage_daily_0921,/tmp/s2k/pdfs/secondary_fill_d12",
    )
    ap.add_argument("--out-report", type=Path, default=REPO / "scripts/exports/excel_tables_fix_report.json")
    ap.add_argument("--out-publish", type=Path, default=Path("/tmp/s2k/exports/publish_all_fixed_0921.json"))
    args = ap.parse_args()
    through = date.fromisoformat(args.through)
    month = through.strftime("%Y-%m")
    pdf_dirs = [Path(p) for p in args.pdf_dirs.split(",") if p.strip()]

    print("Fetching books-overlay…", flush=True)
    overlay = fetch_overlay()
    report = {}
    publish_stations = []

    for sid, (name, _) in STORE_FILES.items():
        path = args.xlsx_dir / f"{sid}_daily.xlsx"
        if not path.exists():
            report[sid] = {"ok": False, "error": f"missing {path}"}
            continue
        print(f"\n=== {sid} {name} ===", flush=True)
        wb = openpyxl.load_workbook(path)
        ws, hr, cols = resolve_daily_sheet(wb, sid, month)
        dws = display_sheet(wb, month)
        changes: list[str] = []
        site_days = site_day_map(overlay, sid)
        tso = BD_TSO.get(sid, sid)

        # Map existing rows by day
        row_by_day = {}
        for r in range(hr + 1, hr + 45):
            d = parse_d(cell_val(ws.cell(r, cols["date"]).value))
            if d and d.month == through.month and d.year == through.year:
                row_by_day[d.day] = r

        site_dates = sorted(site_days)
        first_site = site_dates[0] if site_dates else None
        last_site = site_dates[-1] if site_dates else None

        filled_days = []
        for day in range(1, through.day + 1):
            iso = f"{through.year}-{through.month:02d}-{day:02d}"
            r = row_by_day.get(day) or (hr + day)
            site = site_days.get(iso)

            # Try PDF raw for components
            raw = None
            pdf = find_pdfs(pdf_dirs, sid, day)
            parsed_sec = None
            if pdf and pdf.exists():
                try:
                    if sid in BD_TSO and (
                        "BIG DADDY" in str(pdf) or pdf.name.startswith("bd_")
                    ):
                        raw = parse_bd_pdf(pdf, tso)
                    else:
                        raw = parse_single_pdf(pdf) or parse_bd_pdf(pdf, tso)
                except Exception:
                    raw = None
                try:
                    parsed_sec = parse_depts_lottery(pdf, tso)
                except Exception:
                    parsed_sec = None

            if site is None and raw is None:
                # Closed gap between site days (e.g. Db 09/20) → explicit zeros
                gas_empty = empty(ws.cell(r, cols.get("gas_vol", 2)).value)
                in_gap = (
                    first_site
                    and last_site
                    and first_site < iso < last_site
                    and gas_empty
                )
                if in_gap or (gas_empty and iso == "2026-09-20" and sid == "42352"):
                    write_zero_day(
                        ws, r, cols, date(through.year, through.month, day), changes
                    )
                    filled_days.append(
                        {
                            "date": iso,
                            "gas_vol": 0,
                            "gas_profit": 0,
                            "sales": 0,
                            "purch": 0,
                            "store_profit": 0,
                            "margin": 0,
                            "total_profit": 0,
                        }
                    )
                continue

            day_dict = dict(site or {})
            if raw:
                day_dict["_raw"] = raw
                if day_dict.get("gas_vol") is None:
                    day_dict["gas_vol"] = raw.get("gas_vol")
                if day_dict.get("gas_profit") is None:
                    day_dict["gas_profit"] = raw.get("gas_profit")
                if day_dict.get("sales") is None and raw.get("cstore_total") is not None:
                    tax = sum(float(raw.get(k) or 0) for k in ("tax1", "tax4", "scratch", "lotto", "card"))
                    day_dict["sales"] = r2(float(raw["cstore_total"]) - tax)

            # Ensure date cell
            if empty(ws.cell(r, cols["date"]).value):
                ws.cell(r, cols["date"]).value = datetime(through.year, through.month, day)

            write_daily_row(ws, r, cols, day_dict, force_purch=True, changes=changes)

            # San Diego display mirror for purch
            if sid == "42048" and dws is not None and day_dict.get("purch") is not None:
                dr = 8 + day
                dws.cell(dr, 6).value = float(day_dict["purch"])
                changes.append(f"Display!F{dr}={day_dict['purch']}")

            # Secondary tables on display sheet
            target_ws = dws if dws is not None else ws
            if parsed_sec:
                fill_secondary(
                    target_ws, day, parsed_sec, changes, target_ws.title, wb=wb
                )

            # Build publish day
            sales = day_dict.get("sales")
            purch = day_dict.get("purch")
            if sales is None:
                # compute from components if written
                j = as_num(ws.cell(r, 10).value)
                if j is not None:
                    sales = r2(j - sum(as_num(ws.cell(r, c).value) or 0 for c in range(11, 16)))
            if purch is None:
                purch = as_num(ws.cell(r, cols.get("purch", 6)).value) or 0.0
            if sales is None:
                sales = 0.0
            gas = day_dict.get("gas_vol")
            gp = day_dict.get("gas_profit")
            sp = r2(sales - purch)
            margin = r2(sp / sales) if sales else 0.0
            tp = r2((gp or 0) + sp) if gp is not None else sp
            filled_days.append({
                "date": iso,
                "gas_vol": gas,
                "gas_profit": gp,
                "sales": sales,
                "purch": purch,
                "store_profit": sp,
                "margin": margin,
                "total_profit": tp,
            })

        # Merge with historical overlay days outside Sep or before — keep full history
        hist = list((overlay.get(sid) or {}).get("days") or [])
        by = {d["date"]: d for d in hist}
        for d in filled_days:
            by[d["date"]] = d
        ordered = [by[k] for k in sorted(by)]

        wb.save(path)
        report[sid] = {"ok": True, "changes": len(changes), "sample": changes[:25], "sep_days": len(filled_days)}
        publish_stations.append({
            "file": f"{name} Daily.xlsx",
            "kind": "daily",
            "id": sid,
            "name": name,
            "period": month,
            "days": ordered,
            "months": {},
            "kpis": {},
        })
        print(f"  changes={len(changes)} sep_days={len(filled_days)}", flush=True)

    args.out_report.parent.mkdir(parents=True, exist_ok=True)
    args.out_report.write_text(json.dumps(report, indent=2) + "\n")
    args.out_publish.parent.mkdir(parents=True, exist_ok=True)
    args.out_publish.write_text(json.dumps({"stations": publish_stations}, indent=2) + "\n")
    print(f"\nwrote {args.out_report}")
    print(f"wrote {args.out_publish} stations={len(publish_stations)}")


if __name__ == "__main__":
    main()
