#!/usr/bin/env python3
"""Fill Financial Audit S2K columns from Daily Book Summary PDFs.

Receipts mapping
----------------
  SAFEDROP                     → S2K Safe Drop
  CREDIT+DEBIT+EBT+MOBILE
    +PREPAID GIFT − FEE        → S2K Daily Receipt / S2K Credit+Debit+EBT
  abs(FEE)                     → EFT Fee Amount (when that column exists)
  CASH OVER/SHORT              → Over / Short

Standing rule: always leave 2 days behind for the next round.
  Fill through (PT today − 2); leave today and yesterday for the next run.

Examples
--------
  python3 scripts/fill_financial_audit_from_s2k.py --station 42004 --year 2026 --month 9 --upload
  python3 scripts/fill_financial_audit_from_s2k.py --all --year 2026 --month 9 --upload
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import traceback
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pdfplumber
from openpyxl import load_workbook
from openpyxl.worksheet.table import Table
from openpyxl.worksheet.worksheet import Worksheet

PT = ZoneInfo("America/Los_Angeles")
MONTH_NAMES = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]

HOST = "https://smartsolutionsai26-my.sharepoint.com"
BASE = f"{HOST}/personal/minamorcos_smartsolutionsai26_onmicrosoft_com"
DOCS_ROOT = "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents"
OD_COOKIES = Path("/tmp/od_cookies.json")
SSL_CTX = ssl.create_default_context()
WORK_DIR = Path("/tmp/s2k/exports/financial_fill_all")

LINE_RE = re.compile(
    r"^([A-Za-z][A-Za-z0-9 /&'.-]*?)\s+(\(\$?[\d,]+\.\d{2}\)|\$?[\d,]+\.\d{2})\s*$"
)

# pdf_mode: solo = store Daily Summary; bd = BIG DADDY multi-station daily PDF; none = skip
CLIENTS: list[dict[str, str]] = [
    {
        "station": "42004",
        "tso": "42004",
        "label": "Placentia",
        "od_xlsx": "Clients/42004 (Arco Placentia)/Placentia Financial Audit.xlsx",
        "pdf_mode": "solo",
        "pdf_folder": "Clients/42004 (Arco Placentia)/{month}/Daily Summary",
    },
    {
        "station": "42179",
        "tso": "42179",
        "label": "Arco HB",
        "od_xlsx": "Clients/42179 (Arco HB)/Arco HB Financial Audit.xlsx",
        "pdf_mode": "solo",
        "pdf_folder": "Clients/42179 (Arco HB)/{month}/Daily Summary",
    },
    {
        "station": "42352",
        "tso": "42352",
        "label": "Arco Db",
        "od_xlsx": "Clients/42352 (Arco Db)/Arco Db Financial Audit.xlsx",
        "pdf_mode": "solo",
        "pdf_folder": "Clients/42352 (Arco Db)/{month}/Daily Summary",
    },
    {
        "station": "42674",
        "tso": "42674",
        "label": "Tustin",
        "od_xlsx": "Clients/BIG DADDY/42674 (Tustin)/Tustin  Financial Audit.xlsx",
        "pdf_mode": "solo",
        "pdf_folder": "Clients/BIG DADDY/42674 (Tustin)/{month}/Daily Summary",
    },
    {
        "station": "42021",
        "tso": "42021",
        "label": "Westminster",
        "od_xlsx": "Clients/BIG DADDY/42021 (Westminster)/Westminster Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42048",
        "tso": "42048",
        "label": "San Diego",
        "od_xlsx": "Clients/BIG DADDY/42048 (San Diego)/San Diego Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42098",
        "tso": "42098",
        "label": "Brookhurst 75",
        "od_xlsx": "Clients/BIG DADDY/42098 (Brookhurst 75)/Brookhurst  Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42279",
        "tso": "42279",
        "label": "Koval",
        "od_xlsx": "Clients/BIG DADDY/42279 Flamingo (Koval)/Koval Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42280",
        "tso": "42280",
        "label": "Spring Mtn",
        "od_xlsx": "Clients/BIG DADDY/42280 (Spring Mtn)/Spring Mtn  Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42281",
        "tso": "42281",
        "label": "Charleston",
        "od_xlsx": "Clients/BIG DADDY/42281 (Charleston)/Charleston  Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42282",
        "tso": "42282",
        "label": "Oakey Las Vegas Blvd",
        "od_xlsx": "Clients/BIG DADDY/42282 (Oakey  Las Vegas Blvd)/Oakey Las Vegas Blvd Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42399",
        "tso": "42399",
        "label": "Garden Grove",
        "od_xlsx": "Clients/BIG DADDY/42399 (Garden Grove)/Garden Grove Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42438",
        "tso": "42438",
        "label": "Vista",
        "od_xlsx": "Clients/BIG DADDY/42438 (Vista)/Vista Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42439",
        "tso": "42439",
        "label": "Lamb",
        "od_xlsx": "Clients/BIG DADDY/42439 (Lamb)/Lamb Financial Audit.xlsx",
        "pdf_mode": "bd",
        "pdf_folder": "Clients/BIG DADDY/PDF/daily/{month}",
    },
    {
        "station": "42359",
        "tso": "42359",
        "label": "Paradise",
        "od_xlsx": "Clients/BIG DADDY/42359 (Paradise)/Paradise Financial Audit.xlsx",
        "pdf_mode": "solo",
        "pdf_folder": "Clients/BIG DADDY/42359 (Paradise)/{month}/Daily Summary",
        "optional": "1",
    },
    {
        "station": "extramile",
        "tso": "",
        "label": "ExtraMile",
        "od_xlsx": "Clients/ExtraMile/ExtraMile Financial Audit.xlsx",
        "pdf_mode": "none",
        "pdf_folder": "",
        "optional": "1",
    },
]


def month_folder(year: int, month: int) -> str:
    return f"{year}-{month:02d} {MONTH_NAMES[month]}"


def default_through() -> date:
    return datetime.now(PT).date() - timedelta(days=2)


def month_sheet_name(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month]} {year}"


def parse_money(raw: str) -> float | None:
    t = raw.strip().replace(",", "").replace("$", "")
    if t.startswith("(") and t.endswith(")"):
        t = "-" + t[1:-1]
    if t in ("", "-", "--"):
        return None
    try:
        return float(t)
    except ValueError:
        return None


def strip_pdf_noise(text: str) -> str:
    text = re.sub(r"Daily Book Summary Report\n", "\n", text, flags=re.I)
    text = re.sub(r"Last updated on[^\n]*\n", "\n", text, flags=re.I)
    text = re.sub(r"^\s*\d+\s+of\s+\d+\s*$", "", text, flags=re.M)
    text = re.sub(r"TSO_BIG DADDYS OIL S2K[^\n]*\n", "\n", text, flags=re.I)
    return text


def parse_receipt_lines(block: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for line in block.splitlines():
        line = line.strip()
        if not line:
            continue
        up = line.upper()
        if up.startswith(("RECEIPT TYPE", "RECEIPT AMOUNT", "TSO #", "LAST UPDATED")):
            continue
        mm = LINE_RE.match(line)
        if not mm:
            continue
        name = mm.group(1).strip().upper()
        amt = parse_money(mm.group(2))
        if amt is None or not name:
            continue
        out[name] = amt
    return out


def parse_receipts_single(text: str) -> dict[str, float]:
    text = strip_pdf_noise(text)
    m = re.search(r"\nReceipts?\s*\n", text, re.I)
    block = text[m.start() :] if m else text
    return parse_receipt_lines(block)


def parse_receipts_for_tso(text: str, tso: str) -> dict[str, float]:
    text = strip_pdf_noise(text)
    m = re.search(r"\nReceipts?\b", text, re.I)
    block = text[m.start() :] if m else text
    pat = re.compile(
        rf"TSO\s*#({re.escape(tso)}\d*)[^\n]*\n(.*?)(?=\nTSO\s*#|\Z)",
        re.S | re.I,
    )
    best: dict[str, float] = {}
    best_score = -1
    for mm in pat.finditer(block):
        got = parse_receipt_lines(mm.group(2))
        score = sum(
            1 for k in got if k.replace(" ", "") in {"CREDIT", "DEBIT", "SAFEDROP", "SAFEDROP"}
        )
        if score > best_score or (score == best_score and len(got) > len(best)):
            best = got
            best_score = score
    return best


def is_prepaid_gift(name: str) -> bool:
    compact = name.replace(" ", "")
    if compact in {"PREPAIDGIFT", "PREPAYGIFT", "PREPAIDGIFTCARD"}:
        return True
    return ("PREPAID" in name or "PREPAY" in name) and "GIFT" in name


def financial_fields(receipts: dict[str, float]) -> dict[str, float | None]:
    safe = None
    for k, v in receipts.items():
        if k.replace(" ", "") in {"SAFEDROP", "SAFEDROP"}:
            safe = v
            break

    fee = None
    for k, v in receipts.items():
        if k == "FEE" or k.endswith(" FEE"):
            fee = abs(v)
            break

    over = None
    for k, v in receipts.items():
        if "OVER" in k and "SHORT" in k:
            over = v
            break

    daily = 0.0
    found = False
    for k, v in receipts.items():
        if (
            k in {"CREDIT", "DEBIT", "MOBILE"}
            or k.startswith("EBT")
            or is_prepaid_gift(k)
        ):
            daily += v
            found = True
    if found and fee is not None:
        daily -= fee

    return {
        "safe_drop": safe,
        "daily_receipt": round(daily, 2) if found else None,
        "eft_fee": fee,
        "over_short": over,
    }


def parse_daily_pdf(path: Path, tso: str | None = None) -> dict[str, Any]:
    with pdfplumber.open(path) as pdf:
        text = "\n".join((p.extract_text() or "") for p in pdf.pages)
    receipts = (
        parse_receipts_for_tso(text, tso) if tso else parse_receipts_single(text)
    )
    return {"path": str(path), "receipts": receipts, **financial_fields(receipts)}


def norm_col(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())


def col_index(table: Table, *candidates: str) -> int | None:
    wanted = {norm_col(c) for c in candidates}
    for i, c in enumerate(table.tableColumns, start=1):
        if norm_col(c.name) in wanted:
            return i
    return None


def find_tables(ws: Worksheet) -> tuple[Table | None, Table | None]:
    cashier = over = None
    for t in ws.tables.values():
        cols = {norm_col(c.name) for c in t.tableColumns}
        if "s2ksafedrop" in cols:
            cashier = t
        if "overshort" in cols:
            over = t
    return cashier, over


def parse_ref(ref: str) -> tuple[str, int, str, int]:
    m = re.match(r"([A-Z]+)(\d+):([A-Z]+)(\d+)", ref)
    if not m:
        raise ValueError(f"Bad table ref {ref}")
    return m.group(1), int(m.group(2)), m.group(3), int(m.group(4))


def as_date(v: Any) -> date | None:
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def set_cell(ws: Worksheet, row: int, col: int, value: Any) -> None:
    """Write a cell value; never write into a MergedCell (that corrupts the file)."""
    from openpyxl.cell.cell import MergedCell

    cell = ws.cell(row, col)
    if isinstance(cell, MergedCell):
        raise RuntimeError(
            f"Refusing to write merged cell {cell.coordinate} on {ws.title} "
            f"(would corrupt workbook)"
        )
    cell.value = value


def ensure_table_rows(ws: Worksheet, table: Table, needed_data_rows: int) -> None:
    """Grow a table by inserting rows so content/merges below shift safely.

    Blindly extending table.ref into the next section (e.g. CASH OVER/SHORT
    title merges) corrupts the workbook — that was the all-client failure mode.
    """
    if needed_data_rows <= 0:
        return
    c1, r1, c2, r2 = parse_ref(table.ref)
    has_totals = any(
        bool(c.totalsRowFunction or c.totalsRowLabel or c.totalsRowFormula)
        for c in table.tableColumns
    )
    data_rows_now = (r2 - r1) - (1 if has_totals else 0)
    if needed_data_rows <= data_rows_now:
        return

    grow = needed_data_rows - data_rows_now
    # Insert above totals row when present; otherwise right after current last data row.
    insert_at = r2 if has_totals else (r2 + 1)

    # openpyxl insert_rows does not reliably move merges — shift them ourselves.
    old_merges = [str(mr) for mr in ws.merged_cells.ranges]
    to_remerge: list[str] = []
    for ref in old_merges:
        m = re.match(r"([A-Z]+)(\d+):([A-Z]+)(\d+)", ref)
        if not m:
            continue
        min_row, max_row = int(m.group(2)), int(m.group(4))
        if min_row >= insert_at:
            ws.unmerge_cells(ref)
            to_remerge.append(
                f"{m.group(1)}{min_row + grow}:{m.group(3)}{max_row + grow}"
            )

    ws.insert_rows(insert_at, amount=grow)
    for ref in to_remerge:
        ws.merge_cells(ref)

    # Shift every table whose range starts at/after the insertion point.
    for t in ws.tables.values():
        tc1, tr1, tc2, tr2 = parse_ref(t.ref)
        if t.name == table.name:
            t.ref = f"{c1}{r1}:{c2}{r2 + grow}"
        elif tr1 >= insert_at:
            t.ref = f"{tc1}{tr1 + grow}:{tc2}{tr2 + grow}"


def fix_broken_split_refs(ws: Worksheet) -> int:
    n = 0
    for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row or 1, 120), max_col=12):
        for cell in row:
            v = cell.value
            if not isinstance(v, str):
                continue
            nv = v.replace("$B$224", "$B$7")
            if cell.coordinate in {"H7", "H8", "E7", "F7", "G7", "E8", "F8", "G8"}:
                nv = (
                    nv.replace("E224", "E7")
                    .replace("F224", "F7")
                    .replace("G224", "G7")
                    .replace("E225", "E8")
                    .replace("F225", "F8")
                    .replace("G225", "G8")
                )
            if nv != v:
                cell.value = nv
                n += 1
    for t in ws.tables.values():
        for c in t.tableColumns:
            formula = getattr(c, "calculatedColumnFormula", None)
            if not formula:
                continue
            text = getattr(formula, "text", None)
            if isinstance(text, str) and "$B$224" in text:
                formula.text = text.replace("$B$224", "$B$7")
                n += 1
    return n


def fill_month(
    ws: Worksheet,
    year: int,
    month: int,
    by_day: dict[int, dict[str, Any]],
    overwrite: bool = True,
) -> dict[str, Any]:
    cashier, over = find_tables(ws)
    if cashier is None:
        raise SystemExit(f"No cashier table on {ws.title}")

    needed = max(by_day) if by_day else 0
    ensure_table_rows(ws, cashier, needed)
    if over is not None:
        ensure_table_rows(ws, over, needed)

    _, header_row, _, last_row = parse_ref(cashier.ref)
    has_totals = any(
        bool(c.totalsRowFunction or c.totalsRowLabel or c.totalsRowFormula)
        for c in cashier.tableColumns
    )
    data_last = last_row - (1 if has_totals else 0)

    c_date = col_index(cashier, "Date") or 1
    c_safe = col_index(cashier, "S2K Safe Drop")
    c_daily = col_index(
        cashier,
        "S2K Daily Receipt",
        "S2K Credit + Debit + EBT",
        "S2K Credit + Debit + EBT",
    )
    c_fee = col_index(cashier, "EFT Fee Amount")
    if not c_safe or not c_daily:
        names = [c.name for c in cashier.tableColumns]
        raise SystemExit(f"Missing S2K cols on {ws.title}; have {names}")

    date_rows: dict[date, int] = {}
    empty_rows: list[int] = []
    for r in range(header_row + 1, data_last + 1):
        d = as_date(ws.cell(r, c_date).value)
        if d:
            date_rows[d] = r
        elif ws.cell(r, c_date).value in (None, ""):
            empty_rows.append(r)

    filled: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for day, fields in sorted(by_day.items()):
        d = date(year, month, day)
        row = date_rows.get(d)
        if row is None:
            if not empty_rows:
                skipped.append({"day": day, "reason": "no empty row"})
                continue
            row = empty_rows.pop(0)
            set_cell(ws, row, c_date, datetime(year, month, day))
            date_rows[d] = row

        if not overwrite and ws.cell(row, c_safe).value not in (None, ""):
            skipped.append({"day": day, "reason": "already filled"})
            continue

        if fields.get("safe_drop") is not None:
            set_cell(ws, row, c_safe, fields["safe_drop"])
        if fields.get("daily_receipt") is not None:
            set_cell(ws, row, c_daily, round(float(fields["daily_receipt"]), 2))
        if c_fee and fields.get("eft_fee") is not None:
            set_cell(ws, row, c_fee, fields["eft_fee"])
        filled.append(
            {
                "day": day,
                "row": row,
                "safe_drop": fields.get("safe_drop"),
                "daily_receipt": fields.get("daily_receipt"),
                "eft_fee": fields.get("eft_fee"),
                "over_short": fields.get("over_short"),
            }
        )

    over_filled: list[dict[str, Any]] = []
    if over is not None:
        _, o_header, _, o_last = parse_ref(over.ref)
        o_has_totals = any(
            bool(c.totalsRowFunction or c.totalsRowLabel or c.totalsRowFormula)
            for c in over.tableColumns
        )
        o_data_last = o_last - (1 if o_has_totals else 0)
        header_val = ws.cell(o_header, 1).value
        first_data = o_header + (1 if isinstance(header_val, str) else 0)
        o_date_rows: dict[date, int] = {}
        o_empty: list[int] = []
        for r in range(first_data, o_data_last + 1):
            d = as_date(ws.cell(r, 1).value)
            if d:
                o_date_rows[d] = r
            elif ws.cell(r, 1).value in (None, ""):
                o_empty.append(r)

        for day, fields in sorted(by_day.items()):
            if fields.get("over_short") is None:
                continue
            d = date(year, month, day)
            row = o_date_rows.get(d)
            if row is None:
                if not o_empty:
                    continue
                row = o_empty.pop(0)
                set_cell(ws, row, 1, datetime(year, month, day))
                o_date_rows[d] = row
            if overwrite or ws.cell(row, 2).value in (None, ""):
                set_cell(ws, row, 2, fields["over_short"])
                over_filled.append(
                    {"day": day, "row": row, "over_short": fields["over_short"]}
                )

    return {
        "sheet": ws.title,
        "cashier_filled": filled,
        "over_filled": over_filled,
        "skipped": skipped,
        "refs_fixed": fix_broken_split_refs(ws),
    }


def cookie_header() -> str:
    cookies = json.loads(OD_COOKIES.read_text())
    return "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if "sharepoint.com" in c.get("domain", "")
    )


def od_req(
    url: str,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict | None = None,
) -> tuple[int, bytes]:
    h = {
        "Cookie": cookie_header(),
        "Accept": "application/json;odata=verbose",
        "User-Agent": "Mozilla/5.0",
    }
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=180) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def digest() -> str:
    return json.loads(od_req(BASE + "/_api/contextinfo", method="POST", data=b"")[1])[
        "d"
    ]["GetContextWebInformation"]["FormDigestValue"]


def od_list_files(folder_under_docs: str) -> list[dict[str, Any]]:
    server = f"{DOCS_ROOT}/{folder_under_docs.lstrip('/')}"
    enc = urllib.parse.quote(server, safe="/")
    url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{enc}')/Files"
        + "?$select=Name,Length,TimeLastModified&$top=200"
    )
    code, body = od_req(url)
    if code != 200:
        return []
    return json.loads(body)["d"]["results"]


def od_download(rel_under_docs: str, dest: Path) -> Path:
    server = f"{DOCS_ROOT}/{rel_under_docs.lstrip('/')}"
    enc = urllib.parse.quote(server, safe="/")
    url = BASE + f"/_api/web/GetFileByServerRelativeUrl('{enc}')/$value"
    code, body = od_req(url)
    if code != 200:
        raise RuntimeError(f"download failed {code} {rel_under_docs} {body[:160]!r}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    return dest


def upload_od(rel_under_docs: str, content: bytes) -> bool:
    server_rel = f"{DOCS_ROOT}/{rel_under_docs.lstrip('/')}"
    folder, name = server_rel.rsplit("/", 1)
    enc = urllib.parse.quote(server_rel, safe="/")
    dig = digest()
    for action in [
        "CheckOut",
        "UndoCheckOut",
        "CheckIn(comment='financial-audit-s2k-fill',checkInType=1)",
        "UndoCheckOut",
    ]:
        od_req(
            BASE + f"/_api/web/GetFileByServerRelativeUrl('{enc}')/{action}",
            method="POST",
            data=b"",
            headers={"X-RequestDigest": dig, "IF-MATCH": "*"},
        )
    add_url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(folder, safe='/')}')"
        + f"/Files/add(url='{urllib.parse.quote(name)}',overwrite=true)"
    )
    for i in range(6):
        dig = digest()
        code, body = od_req(
            add_url,
            method="POST",
            data=content,
            headers={
                "X-RequestDigest": dig,
                "Content-Type": "application/octet-stream",
                "Prefer": "bypass-shared-lock",
            },
        )
        if code in (200, 201):
            return True
        print(f"  upload retry {i + 1}: {code} {body[:160]!r}")
    return False


def download_month_pdfs(
    client: dict[str, str], year: int, month: int, through: date, dest_dir: Path
) -> dict[int, Path]:
    if client["pdf_mode"] == "none":
        return {}
    folder = client["pdf_folder"].format(month=month_folder(year, month))
    files = od_list_files(folder)
    out: dict[int, Path] = {}
    for f in files:
        name = f["Name"]
        if re.search(r"dly|dpt", name, re.I):
            continue
        m = re.match(r"^(\d{2})(\d{2})(\d{4})\.pdf$", name, re.I)
        if not m:
            continue
        mm, dd, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yy != year or mm != month:
            continue
        d = date(year, month, dd)
        if d > through:
            continue
        local = dest_dir / name
        if not local.exists() or local.stat().st_size != int(f.get("Length") or -1):
            od_download(f"{folder}/{name}", local)
        out[dd] = local
    return out


def fill_client(
    client: dict[str, str],
    year: int,
    month: int,
    through: date,
    upload: bool,
    overwrite: bool,
) -> dict[str, Any]:
    label = client["label"]
    station = client["station"]
    print(f"\n=== {label} ({station}) ===")
    work = WORK_DIR / station
    work.mkdir(parents=True, exist_ok=True)

    if client["pdf_mode"] == "none":
        return {
            "station": station,
            "label": label,
            "status": "skipped",
            "reason": "no Daily Summary PDF source configured",
        }

    pdfs = download_month_pdfs(client, year, month, through, work / "pdfs")
    if not pdfs:
        status = "skipped" if client.get("optional") == "1" else "error"
        return {
            "station": station,
            "label": label,
            "status": status,
            "reason": "no PDFs through cutoff",
            "pdf_folder": client["pdf_folder"].format(month=month_folder(year, month)),
        }

    use_tso = client["pdf_mode"] == "bd"
    tso = client.get("tso") or None
    by_day: dict[int, dict[str, Any]] = {}
    parse_errors: list[dict[str, Any]] = []
    for day, path in sorted(pdfs.items()):
        try:
            parsed = parse_daily_pdf(path, tso=tso if use_tso else None)
            if parsed.get("safe_drop") is None and parsed.get("daily_receipt") is None:
                parse_errors.append(
                    {"day": day, "path": str(path), "reason": "no receipts parsed"}
                )
                continue
            by_day[day] = parsed
        except Exception as e:  # noqa: BLE001
            parse_errors.append({"day": day, "path": str(path), "error": str(e)})

    if not by_day:
        status = "skipped" if client.get("optional") == "1" else "error"
        return {
            "station": station,
            "label": label,
            "status": status,
            "reason": "no usable receipt days",
            "parse_errors": parse_errors,
        }

    xlsx_local = work / Path(client["od_xlsx"]).name
    od_download(client["od_xlsx"], xlsx_local)
    wb = load_workbook(xlsx_local)
    sheet = month_sheet_name(year, month)
    if sheet not in wb.sheetnames:
        return {
            "station": station,
            "label": label,
            "status": "error",
            "reason": f"missing sheet {sheet}",
            "sheets": wb.sheetnames,
        }

    result = fill_month(wb[sheet], year, month, by_day, overwrite=overwrite)
    for sn in wb.sheetnames:
        if sn != sheet and re.search(r"20\d{2}", sn):
            result.setdefault("other_refs_fixed", {})[sn] = fix_broken_split_refs(
                wb[sn]
            )

    out = work / f"{Path(client['od_xlsx']).stem}_filled.xlsx"
    wb.save(out)

    # Validate reopen before any upload — refuse to push a corrupt workbook.
    try:
        check = load_workbook(out)
        _ = check.sheetnames
        if sheet not in check.sheetnames:
            raise RuntimeError(f"saved workbook missing sheet {sheet}")
        check.close()
    except Exception as e:  # noqa: BLE001
        return {
            "station": station,
            "label": label,
            "status": "error",
            "reason": f"saved workbook failed validation: {e}",
            "out": str(out),
        }

    upload_info = None
    if upload:
        ok = upload_od(client["od_xlsx"], out.read_bytes())
        upload_info = {"ok": ok, "path": client["od_xlsx"]}
        print("  UPLOADED" if ok else "  UPLOAD FAILED", client["od_xlsx"])

    print(
        f"  filled {len(result['cashier_filled'])} days / "
        f"{len(result['over_filled'])} over-short through {through}"
    )
    return {
        "station": station,
        "label": label,
        "status": "ok",
        "through": through.isoformat(),
        "parsed_days": sorted(by_day),
        "parse_errors": parse_errors,
        "fill": {
            "cashier_days": len(result["cashier_filled"]),
            "over_days": len(result["over_filled"]),
            "skipped": result["skipped"],
            "refs_fixed": result["refs_fixed"],
            "days": result["cashier_filled"],
        },
        "out": str(out),
        "upload": upload_info,
    }


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--all", action="store_true", help="Fill every Financial Audit client")
    ap.add_argument("--station", help="Single station id (e.g. 42004)")
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--month", type=int, required=True)
    ap.add_argument("--through", type=date.fromisoformat, default=None)
    ap.add_argument("--upload", action="store_true")
    ap.add_argument("--no-overwrite", action="store_true")
    ap.add_argument(
        "--report",
        type=Path,
        default=WORK_DIR / "financial_fill_all_report.json",
    )
    args = ap.parse_args()

    through = args.through or default_through()
    print(
        f"Fill through={through.isoformat()} "
        f"(leave 2 days behind; PT today−2 unless --through set)"
    )

    if args.all:
        targets = CLIENTS
    elif args.station:
        targets = [c for c in CLIENTS if c["station"] == args.station]
        if not targets:
            raise SystemExit(f"Unknown station {args.station}")
    else:
        raise SystemExit("Pass --all or --station")

    WORK_DIR.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []
    for client in targets:
        try:
            results.append(
                fill_client(
                    client,
                    args.year,
                    args.month,
                    through,
                    upload=args.upload,
                    overwrite=not args.no_overwrite,
                )
            )
        except Exception as e:  # noqa: BLE001
            print(f"  FAILED {client['label']}: {e}")
            traceback.print_exc()
            results.append(
                {
                    "station": client["station"],
                    "label": client["label"],
                    "status": "error",
                    "error": str(e),
                }
            )

    report = {
        "through": through.isoformat(),
        "year": args.year,
        "month": args.month,
        "results": results,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2, default=str))

    ok = sum(1 for r in results if r.get("status") == "ok")
    skipped = sum(1 for r in results if r.get("status") == "skipped")
    err = sum(1 for r in results if r.get("status") == "error")
    print(f"\nDONE ok={ok} skipped={skipped} error={err} report={args.report}")


if __name__ == "__main__":
    main()
