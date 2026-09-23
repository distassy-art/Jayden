#!/usr/bin/env python3
"""S2K Daily + DLY/DPT PDFs → smartsolutionsai.us books + Daily Excel (Excel is output only).

Source of truth is S2K reports (SoftSP/OneDrive stage), not Excel:
  - Daily Book Summary → gas + c-store sales components
  - DLY (None Fuel Invoice Total, expand) → Net Daily Purchases by Inv Date
  - DPT (DailyAPInvoice, by dept) staged alongside DLY for audit (MTD cost)

Day math (non-fuel):
  sales = cstore_total - tax1 - tax4 - scratch - lotto - card
  purch = sum(DLY Inv Total by Inv Date) EXCLUDING Deduct-sheet vendors
         (always exclude Lotto/Lottery); blank amount→0; negative→0
  store_profit = sales - purch
  margin = store_profit / sales when sales else None
  total_profit = gas_profit + store_profit

Deduct vendor lists are read from each client's Daily.xlsx Deduct sheet and
cached in scripts/deduct_vendors_by_store.json.

Do not invent numbers. Empty Daily Book shells (no Station Total) are skipped.

Skips: La Mesa (42642), Paradise (42359 hold).

Usage:
  python3 scripts/sync_from_s2k.py --through 2026-09-21 \\
    --stage /tmp/s2k/exports/stage_daily_0921 \\
    --dly-stage /tmp/s2k/exports/stage_dly_dpt_0921 \\
    --publish

  python3 scripts/sync_from_s2k.py --through 2026-09-21 \\
    --stage ... --dly-stage ... --fill-excel --xlsx-dir /tmp/books_fill_s2k --publish
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    import pdfplumber
except ImportError as exc:  # pragma: no cover
    raise SystemExit("pdfplumber required: pip install pdfplumber") from exc

try:
    import openpyxl
    from openpyxl.utils import get_column_letter
except ImportError:
    openpyxl = None  # type: ignore

REPO = Path(__file__).resolve().parents[1]

STATIONS: dict[str, str] = {
    "42004": "Arco Placentia",
    "42021": "Westminster",
    "42048": "San Diego",
    "42098": "Brookhurst 75",
    "42179": "Arco HB",
    "42279": "Koval",
    "42280": "Spring Mtn",
    "42281": "Charleston",
    "42282": "Oakey Las Vegas Blvd",
    "42352": "Arco Db",
    "42399": "Garden Grove",
    "42438": "Vista",
    "42439": "Lamb",
    "42674": "Tustin",
}

SKIP_IDS = {"42642", "42359"}  # La Mesa removed; Paradise hold

# Folder name fragments under SoftSP stage dirs (after Clients__)
SINGLE_STORE_FOLDERS = {
    "42004": "42004 (Arco Placentia)",
    "42179": "42179 (Arco HB)",
    "42352": "42352 (Arco Db)",
    "42674": "42674 (Tustin)",
}
BD_IDS = {
    "42021",
    "42048",
    "42098",
    "42279",
    "42280",
    "42281",
    "42282",
    "42399",
    "42438",
    "42439",
}

SHEET_DEFAULT = None  # resolved per month
HDR = 8


def money(s: str | None) -> float | None:
    if s is None:
        return None
    t = str(s).strip().replace(",", "").replace("$", "")
    t = t.replace("(", "-").replace(")", "")
    if t in ("", "-", "--"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def parse_dept_amount(text: str, label: str) -> float:
    m = re.search(rf"{re.escape(label)}\s+[\d,.]+\s+\$([\d,.]+)", text, re.I)
    return (money(m.group(1)) or 0.0) if m else 0.0


def parse_cstore_fields(text: str) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    m = re.search(
        r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+([\d.]+)%\s+\$([\-\d,.]+)",
        text,
    )
    if m:
        out["cstore_total"] = money(m.group(2))
    out["tax1"] = parse_dept_amount(text, "TAX 1")
    out["tax4"] = parse_dept_amount(text, "TAX 4")
    out["scratch"] = parse_dept_amount(text, "SCRATCH TICKETS")
    out["lotto"] = parse_dept_amount(text, "LOTTO")
    card = parse_dept_amount(text, "CARD ACTIVATIONS")
    if card == 0.0:
        card = parse_dept_amount(text, "CARD ACTIVATION")
    out["card"] = card
    return out


def parse_fuel_totals(text: str) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    m = re.search(
        r"Grand Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)",
        text,
    )
    if not m:
        m = re.search(
            r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)",
            text,
        )
    if m:
        out["gas_vol"] = float(m.group(1).replace(",", ""))
        out["gas_profit"] = money(m.group(4))
    return out


def pdf_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def parse_single_pdf(path: Path) -> dict[str, Any] | None:
    text = pdf_text(path)
    if "Station Total" not in text and "Grand Total" not in text:
        return None
    out: dict[str, Any] = {}
    out.update(parse_fuel_totals(text))
    cstore = text
    for marker in ("CStore Sales", "C-Store Sales", "Department Qty"):
        if marker in text:
            cstore = text.split(marker, 1)[1]
            break
    out.update(parse_cstore_fields(cstore))
    if out.get("gas_vol") is None and out.get("cstore_total") is None:
        return None
    return out


def parse_bd_pdf(path: Path, tso: str) -> dict[str, Any] | None:
    text = pdf_text(path)
    blocks: list[str] = []
    for part in re.split(r"(?=TSO #\d+)", text):
        m = re.match(r"TSO #(\d+)", part)
        if not m:
            continue
        raw = m.group(1)
        if raw == tso or raw.startswith(tso):
            blocks.append(part)
    if not blocks:
        return None
    block = "\n".join(blocks)
    out: dict[str, Any] = {}
    fuel_m = re.search(
        r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)",
        block,
    )
    if fuel_m:
        out["gas_vol"] = float(fuel_m.group(1).replace(",", ""))
        out["gas_profit"] = money(fuel_m.group(4))
    # BD multi often has fuel Station Total then later CStore Station Total
    out.update(parse_cstore_fields(block))
    # Prefer cstore Station Total when both fuel+cstore share the label:
    # re-scan for last Station Total with margin% pattern (cstore)
    m2 = list(
        re.finditer(
            r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+([\d.]+)%\s+\$([\-\d,.]+)",
            block,
        )
    )
    if m2:
        out["cstore_total"] = money(m2[-1].group(2))
    if out.get("gas_vol") is None and out.get("cstore_total") is None:
        return None
    return out


_DLY_LINE_RE = re.compile(
    r"TSO #(\d+)\s+#\d+\s+(\S+)\s+(\d{2}/\d{2}/\d{2})(?:\s+\$?([\-\d,]+\.\d{2}))?"
)
_VENDOR_HDR_RE = re.compile(
    r"^(.+?)\s+\$[\-\d,]+\.\d{2}\s+\$[\-\d,]+\.\d{2}\s+\$[\-\d,]+\.\d{2}"
)
_SKIP_LINE_RE = re.compile(
    r"^(Non-Fuel|Last updated|Station Inv|Grouped by|^\d+ of \d+|^\d+ Station|"
    r"\d{1,2}/\d{1,2}/\d{4}|TSO_)",
    re.I,
)
_LOTTERY_RE = re.compile(r"\b(lotto|lottery)\b", re.I)

DEDUCT_VENDORS_PATH = Path(__file__).resolve().parent / "deduct_vendors_by_store.json"


def inv_date_to_iso(mdy: str) -> str:
    mm, dd, yy = mdy.split("/")
    return f"20{yy}-{mm}-{dd}"


def norm_vendor(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", " ", str(name).lower())
    return re.sub(r"\s+", " ", s).strip()


def load_deduct_maps(
    path: Path = DEDUCT_VENDORS_PATH,
) -> dict[str, dict[str, list[str]]]:
    if not path.exists():
        print(f"warn: no deduct vendor map at {path}", flush=True)
        return {}
    return json.loads(path.read_text())


def is_lottery_vendor(vendor: str) -> bool:
    return bool(_LOTTERY_RE.search(vendor or ""))


def vendor_is_deduct(vendor: str, deduct_names: list[str]) -> bool:
    """True if DLY vendor matches a Deduct-sheet name (fuzzy contains)."""
    if not vendor:
        return False
    if is_lottery_vendor(vendor):
        return True
    nv = norm_vendor(vendor)
    if not nv:
        return False
    for d in deduct_names:
        nd = norm_vendor(d)
        if not nd or len(nd) < 3:
            continue
        if nv == nd or nd in nv or nv in nd:
            return True
    return False


def invoice_amount(raw: str | None) -> float:
    """Blank/missing → 0; negative → 0 (Excel Valid Amount / treat-as-$0)."""
    if raw is None or str(raw).strip() == "":
        return 0.0
    amt = money(raw)
    if amt is None:
        return 0.0
    if amt < 0:
        return 0.0
    return float(amt)


def iter_dly_invoices(text: str):
    """Yield (tso, iso_date, vendor, amount) from DLY expand text."""
    vendor = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if _SKIP_LINE_RE.match(line):
            continue
        m = _DLY_LINE_RE.match(line)
        if m:
            sid, _inv, dt, amt_s = m.group(1), m.group(2), m.group(3), m.group(4)
            yield sid, inv_date_to_iso(dt), vendor, invoice_amount(amt_s)
            continue
        # Vendor header (keeps across page breaks until next header)
        if line.startswith("TSO #") or line.startswith("Grand Total"):
            continue
        hm = _VENDOR_HDR_RE.match(line)
        if hm:
            vendor = hm.group(1).strip()
            continue
        # Soft vendor-only header (rare)
        if not line.startswith("TSO") and "$" not in line and len(line) < 60:
            # ignore bare page noise
            pass


def parse_dly_purchases(
    path: Path,
    tso: str | None = None,
    deduct_names: list[str] | None = None,
) -> dict[str, float]:
    """Net Daily Purchases from DLY: include invoices not on Deduct list.

    - Lotto / Lottery always excluded
    - Deduct-sheet vendors excluded (per client Excel)
    - Missing Inv Total → 0; negative Inv Total → 0
    """
    text = pdf_text(path)
    deduct_names = deduct_names or []
    by_day: dict[str, float] = defaultdict(float)
    skipped = included = 0
    for sid, iso_d, vendor, amt in iter_dly_invoices(text):
        if tso and sid != tso:
            continue
        if vendor_is_deduct(vendor, deduct_names):
            skipped += 1
            continue
        by_day[iso_d] += amt
        included += 1
    print(
        f"    invoices include={included} deduct_skip={skipped} "
        f"vendor_days={len(by_day)}",
        flush=True,
    )
    return {k: round(v, 2) for k, v in by_day.items()}


def parse_dly_purchases_multi(
    path: Path,
    deduct_by_sid: dict[str, list[str]],
) -> dict[str, dict[str, float]]:
    """BD central DLY → {tso: {iso_date: purch}} with per-store Deduct lists."""
    text = pdf_text(path)
    by: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for sid, iso_d, vendor, amt in iter_dly_invoices(text):
        deduct = deduct_by_sid.get(sid) or deduct_by_sid.get(str(sid)) or []
        # Always apply global lottery exclude even if map missing
        if vendor_is_deduct(vendor, deduct):
            continue
        by[sid][iso_d] += amt
    return {sid: {d: round(v, 2) for d, v in days.items()} for sid, days in by.items()}


def load_purchases_from_dly_stages(
    stage_dirs: list[Path],
    deduct_maps: dict[str, dict[str, list[str]]] | None = None,
) -> dict[str, dict[str, float]]:
    """Return {station_id: {iso_date: purch}} from staged *dly.pdf files."""
    deduct_maps = deduct_maps if deduct_maps is not None else load_deduct_maps()
    out: dict[str, dict[str, float]] = {}
    for root in stage_dirs:
        if not root.is_dir():
            continue
        for d in root.iterdir():
            if not d.is_dir():
                continue
            dlys = sorted(d.glob("*dly.pdf"))
            if not dlys:
                continue
            latest = dlys[-1]
            matched_single = None
            for sid, needle in SINGLE_STORE_FOLDERS.items():
                if needle in d.name:
                    matched_single = sid
                    break
            if matched_single:
                deduct = (deduct_maps.get(matched_single) or {}).get("deduct") or []
                print(
                    f"  DLY {matched_single}: {latest.name} deduct_vendors={len(deduct)}",
                    flush=True,
                )
                days = parse_dly_purchases(latest, matched_single, deduct)
                out[matched_single] = days
                print(
                    f"  DLY {matched_single}: days={len(days)} "
                    f"total={round(sum(days.values()), 2)}",
                    flush=True,
                )
                continue
            if "PDF__dly__" in d.name or "/dly/" in d.name.replace("__", "/"):
                deduct_by_sid = {
                    sid: (meta.get("deduct") or [])
                    for sid, meta in deduct_maps.items()
                }
                multi = parse_dly_purchases_multi(latest, deduct_by_sid)
                for sid, days in multi.items():
                    if sid not in STATIONS or sid in SKIP_IDS:
                        continue
                    out[sid] = days
                    print(
                        f"  DLY {sid}: {latest.name} days={len(days)} "
                        f"total={round(sum(days.values()), 2)} "
                        f"deduct={len(deduct_by_sid.get(sid) or [])}",
                        flush=True,
                    )
    return out


def r2(v: float | None) -> float | None:
    if v is None:
        return None
    return round(float(v), 2)


def books_day(
    iso: str, raw: dict[str, Any], purch: float | None = None
) -> dict[str, Any]:
    cstore = raw.get("cstore_total")
    tax = sum(
        float(raw.get(k) or 0.0)
        for k in ("tax1", "tax4", "scratch", "lotto", "card")
    )
    sales = None
    if cstore is not None:
        sales = r2(float(cstore) - tax)
    if purch is not None:
        purch = r2(float(purch))
    gas_vol = r2(raw.get("gas_vol")) if raw.get("gas_vol") is not None else None
    gas_profit = r2(raw.get("gas_profit")) if raw.get("gas_profit") is not None else None
    store_profit = None
    if sales is not None and purch is not None:
        store_profit = r2(sales - purch)
    elif sales is not None:
        # No DLY coverage yet — leave purch null; do not fake margin
        store_profit = None
    margin = None
    if store_profit is not None and sales not in (None, 0, 0.0):
        margin = round(store_profit / sales, 4)
    total_profit = None
    if gas_profit is not None and store_profit is not None:
        total_profit = r2(gas_profit + store_profit)
    elif gas_profit is not None and purch is None and sales is not None:
        # Temporary: sales-only total until DLY lands (matches prior publish)
        total_profit = r2(gas_profit + sales)
        store_profit = sales
        margin = 1.0 if sales else None
    elif gas_profit is not None:
        total_profit = gas_profit
    elif store_profit is not None:
        total_profit = store_profit
    return {
        "date": iso,
        "gas_vol": gas_vol,
        "gas_profit": gas_profit,
        "sales": sales,
        "purch": purch,
        "store_profit": store_profit,
        "margin": margin,
        "total_profit": total_profit,
        "_raw": raw,
    }


def stamp(d: date) -> str:
    return d.strftime("%m%d%Y")


def iso(d: date) -> str:
    return d.isoformat()


def find_pdf(stage_dirs: list[Path], folder_needle: str, name: str) -> Path | None:
    """Locate MMDDYYYY.pdf under SoftSP stage folder names containing folder_needle."""
    for root in stage_dirs:
        if not root.is_dir():
            continue
        for d in root.iterdir():
            if not d.is_dir():
                continue
            if folder_needle not in d.name:
                continue
            p = d / name
            if p.exists() and p.stat().st_size >= 28000:
                return p
    return None


def day_range(through: date) -> list[date]:
    start = date(through.year, through.month, 1)
    out: list[date] = []
    d = start
    while d <= through:
        out.append(d)
        d += timedelta(days=1)
    return out


def collect_station_days(
    sid: str,
    through: date,
    stage_dirs: list[Path],
    purchases: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    days: list[dict[str, Any]] = []
    purch_map = purchases or {}
    has_dly = purchases is not None  # caller passes {} when DLY loaded for station
    for d in day_range(through):
        name = f"{stamp(d)}.pdf"
        raw = None
        if sid in SINGLE_STORE_FOLDERS:
            pdf = find_pdf(stage_dirs, SINGLE_STORE_FOLDERS[sid], name)
            if pdf:
                raw = parse_single_pdf(pdf)
        elif sid in BD_IDS:
            pdf = find_pdf(stage_dirs, "PDF__daily__", name)
            if not pdf:
                pdf = find_pdf(stage_dirs, "PDF/daily", name)
            if not pdf:
                pdf = find_pdf(stage_dirs, "daily__20", name)
            if pdf:
                raw = parse_bd_pdf(pdf, sid)
        if not raw:
            continue
        iso_d = iso(d)
        if has_dly:
            purch = float(purch_map.get(iso_d, 0.0))
        else:
            purch = None
        days.append(books_day(iso_d, raw, purch=purch))
    return days


def strip_raw(days: list[dict]) -> list[dict]:
    out = []
    for d in days:
        row = {k: v for k, v in d.items() if not k.startswith("_")}
        out.append(row)
    return out


def month_sheet_name(through: date) -> str:
    return through.strftime("%B %Y")  # September 2026


def header_map(ws) -> dict[str, str]:
    cols: dict[str, str] = {}
    for c in range(1, 20):
        h = ws.cell(HDR, c).value
        if not isinstance(h, str):
            continue
        hl = h.lower()
        letter = get_column_letter(c)
        if "gas volume" in hl:
            cols["gas_vol"] = letter
        elif "gas profit" in hl:
            cols["gas_profit"] = letter
        elif "c-store total" in hl or "reported c-store total" in hl:
            cols["cstore_total"] = letter
        elif hl.strip().startswith("tax 1"):
            cols["tax1"] = letter
        elif hl.strip().startswith("tax 4"):
            cols["tax4"] = letter
        elif "scratch" in hl:
            cols["scratch"] = letter
        elif "lotto" in hl:
            cols["lotto"] = letter
        elif "card" in hl:
            cols["card"] = letter
        elif "purchase" in hl:
            cols["purchases"] = letter
    cols.setdefault("purchases", "F")
    return cols


def remap_formula(formula: str, src_row: int, dst_row: int) -> str:
    return re.sub(rf"(?<![A-Z0-9]){src_row}(?!\d)", str(dst_row), formula)


def template_formulas(ws, day: int) -> dict[str, str]:
    target = HDR + day
    for ref_day in range(1, 32):
        rr = HDR + ref_day
        dval = ws[f"D{rr}"].value
        if ws[f"B{rr}"].value in (None, ""):
            continue
        if not (isinstance(dval, str) and dval.startswith("=")):
            continue
        mapping = {}
        for col in ("D", "E", "G", "H", "I", "L"):
            val = ws[f"{col}{rr}"].value
            if isinstance(val, str) and val.startswith("="):
                mapping[col] = remap_formula(val, rr, target)
        return mapping
    return {}


def fill_standard_sheet(
    ws, day: int, raw: dict, cols: dict[str, str], purch: float | None = None
) -> list[str]:
    r = HDR + day
    changed: list[str] = []
    field_map = [
        ("gas_vol", "gas_vol"),
        ("gas_profit", "gas_profit"),
        ("cstore_total", "cstore_total"),
        ("tax1", "tax1"),
        ("tax4", "tax4"),
        ("scratch", "scratch"),
        ("lotto", "lotto"),
        ("card", "card"),
    ]
    for field, key in field_map:
        if field not in cols:
            continue
        val = raw.get(key)
        if val is None:
            continue
        cell = f"{cols[field]}{r}"
        if ws[cell].value not in (None, ""):
            continue
        ws[cell] = val
        changed.append(f"{cell}={val}")
    if purch is not None and "purchases" in cols:
        cell = f"{cols['purchases']}{r}"
        if ws[cell].value in (None, ""):
            ws[cell] = purch
            changed.append(f"{cell}={purch}")
    for col, formula in template_formulas(ws, day).items():
        if ws[f"{col}{r}"].value in (None, ""):
            ws[f"{col}{r}"] = formula
            changed.append(f"{col}=formula")
    return changed


def fill_workbook(path: Path, sid: str, through: date, days: list[dict]) -> dict:
    if openpyxl is None:
        return {"ok": False, "error": "openpyxl missing"}
    sheet = month_sheet_name(through)
    wb = openpyxl.load_workbook(path)
    filled_days: list[int] = []
    notes: list[str] = []

    for row in days:
        d = date.fromisoformat(row["date"])
        day = d.day
        raw = row.get("_raw") or {}
        purch = row.get("purch")
        if sid == "42048" and "September Calculations" in wb.sheetnames:
            ws = wb["September Calculations"]
            r = 2 + day
            if ws[f"B{r}"].value not in (None, ""):
                continue
            tax_sum = sum(
                float(raw.get(k) or 0.0)
                for k in ("tax1", "tax4", "scratch", "lotto", "card")
            )
            mapping = {
                "B": raw.get("gas_vol"),
                "C": raw.get("gas_profit"),
                "E": r2(float(raw["cstore_total"]) - tax_sum)
                if raw.get("cstore_total") is not None
                else None,
                "F": purch,
                "J": raw.get("cstore_total"),
                "K": raw.get("tax1", 0.0),
                "L": raw.get("tax4", 0.0),
                "M": raw.get("scratch", 0.0),
                "N": raw.get("lotto", 0.0),
                "O": raw.get("card", 0.0),
            }
            ch = []
            for col, val in mapping.items():
                if val is None:
                    continue
                if ws[f"{col}{r}"].value in (None, ""):
                    ws[f"{col}{r}"] = val
                    ch.append(f"{col}{r}")
            if ch:
                filled_days.append(day)
                notes.append(f"day{day}:{','.join(ch)}")
            continue

        if sheet not in wb.sheetnames:
            notes.append(f"no sheet {sheet}")
            break
        ws = wb[sheet]
        cols = header_map(ws)
        gas_col = cols.get("gas_vol", "B")
        if ws[f"{gas_col}{HDR + day}"].value not in (None, ""):
            if purch is not None and cols.get("purchases"):
                pcell = f"{cols['purchases']}{HDR + day}"
                if ws[pcell].value in (None, ""):
                    ws[pcell] = purch
                    filled_days.append(day)
                    notes.append(f"day{day}:purch={purch}")
            continue
        ch = fill_standard_sheet(ws, day, raw, cols, purch=purch)
        if ch:
            filled_days.append(day)
            notes.append(f"day{day}:{len(ch)}cells")

    if filled_days:
        wb.save(path)
    return {"ok": True, "filled_days": filled_days, "notes": notes, "path": str(path)}


def build_stations_payload(
    through: date,
    stage_dirs: list[Path],
    only: set[str] | None,
    purch_by_station: dict[str, dict[str, float]] | None = None,
) -> list[dict]:
    stations: list[dict] = []
    for sid, name in STATIONS.items():
        if sid in SKIP_IDS:
            continue
        if only and sid not in only:
            continue
        purch_map = None
        if purch_by_station is not None and sid in purch_by_station:
            purch_map = purch_by_station[sid]
        elif purch_by_station is not None:
            purch_map = {}
        days = collect_station_days(sid, through, stage_dirs, purchases=purch_map)
        if not days:
            print(f"  {sid} {name}: no PDF days through {through}", flush=True)
            continue
        last = days[-1]
        print(
            f"  {sid} {name}: days={len(days)} last={last['date']} "
            f"sales={last.get('sales')} purch={last.get('purch')} "
            f"margin={last.get('margin')}",
            flush=True,
        )
        stations.append(
            {
                "file": f"{name} Daily.xlsx",
                "kind": "daily",
                "id": sid,
                "name": name,
                "period": through.strftime("%Y-%m"),
                "days": strip_raw(days),
                "months": {},
                "kpis": {},
                "_days_with_raw": days,
            }
        )
    return stations


def publish(stations: list[dict], dry: bool) -> None:
    payload = {
        "stations": [
            {k: v for k, v in s.items() if not k.startswith("_")} for s in stations
        ]
    }
    out = Path("/tmp/s2k/exports/sync_from_s2k_publish.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"wrote {out}", flush=True)
    if dry:
        print("dry-run: skip publish-books.mjs", flush=True)
        return
    cmd = ["node", str(REPO / "scripts/publish-books.mjs"), "--file", str(out)]
    print("running", " ".join(cmd), flush=True)
    subprocess.check_call(cmd)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--through", required=True, help="YYYY-MM-DD day-behind target")
    ap.add_argument(
        "--stage",
        action="append",
        default=[],
        help="Daily Book SoftSP stage dir (repeatable)",
    )
    ap.add_argument("--prior", action="append", default=[], help="Alias for --stage")
    ap.add_argument(
        "--dly-stage",
        action="append",
        default=[],
        help="DLY/DPT SoftSP stage dir (repeatable). Enables purch + store margin.",
    )
    ap.add_argument("--only", help="Comma-separated station ids")
    ap.add_argument("--publish", action="store_true", help="POST to live books overlay")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--fill-excel",
        action="store_true",
        help="Fill Daily.xlsx in --xlsx-dir from the same PDF parses",
    )
    ap.add_argument(
        "--xlsx-dir",
        default="/tmp/books_fill_s2k",
        help="Directory with {id}_daily.xlsx files",
    )
    ap.add_argument(
        "--out-json",
        default="/tmp/s2k/exports/sync_from_s2k_result.json",
    )
    args = ap.parse_args()
    through = date.fromisoformat(args.through)
    stage_dirs = [Path(p) for p in (args.stage + args.prior)]
    if not stage_dirs:
        raise SystemExit("Provide at least one --stage / --prior directory")
    only = {x.strip() for x in args.only.split(",")} if args.only else None

    print(f"S2K → site/excel through {through}", flush=True)
    print(f"daily stages: {[str(p) for p in stage_dirs]}", flush=True)

    purch_by_station = None
    if args.dly_stage:
        dly_dirs = [Path(p) for p in args.dly_stage]
        print(f"DLY stages: {[str(p) for p in dly_dirs]}", flush=True)
        purch_by_station = load_purchases_from_dly_stages(dly_dirs)

    stations = build_stations_payload(
        through, stage_dirs, only, purch_by_station=purch_by_station
    )

    excel_report = []
    if args.fill_excel:
        xdir = Path(args.xlsx_dir)
        for st in stations:
            sid = st["id"]
            xlsx = xdir / f"{sid}_daily.xlsx"
            if not xlsx.exists():
                excel_report.append({"id": sid, "ok": False, "error": f"missing {xlsx}"})
                continue
            rep = fill_workbook(xlsx, sid, through, st["_days_with_raw"])
            excel_report.append({"id": sid, **rep})
            print(f"  excel {sid}: filled={rep.get('filled_days')}", flush=True)

    if args.publish or args.dry_run:
        publish(stations, dry=args.dry_run or not args.publish)

    result = {
        "through": through.isoformat(),
        "stations": [
            {
                "id": s["id"],
                "name": s["name"],
                "days": len(s["days"]),
                "last": s["days"][-1]["date"] if s["days"] else None,
                "last_sales": s["days"][-1].get("sales") if s["days"] else None,
                "last_purch": s["days"][-1].get("purch") if s["days"] else None,
                "last_margin": s["days"][-1].get("margin") if s["days"] else None,
            }
            for s in stations
        ],
        "excel": excel_report,
        "dly": bool(args.dly_stage),
    }
    Path(args.out_json).write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
