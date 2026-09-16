#!/usr/bin/env python3
"""Fill client ``* Daily.xlsx`` workbooks from Daily Book Summary PDFs.

Standard method for Daily.xlsx (do **not** use Copilot for this):
  1. Ensure day-behind Daily Book Summary PDFs exist on OneDrive.
  2. Fill blank main-table cells (gas vol/profit, c-store total, tax/scratch/lotto/card).
  3. Restore blank formula columns from a template row.
  4. If Net Purchases is blank on a day that already has sales, set it to **0**
     temporarily until the next DLY/DPT pull supplies real purchase totals.
  5. Run ``fill_daily_excel_secondary.py`` for lottery receipt + Top N dept tables.

Schedule (America/Los_Angeles) — see ``scripts/s2k_report_schedule.md``:
  Mon / Wed / Fri / Sun **8:00 AM**. If day-behind Daily PDFs are missing
  (Daily Book + DLY/DPT job is every day 2:00 PM), pull them first with
  ``fill_daily_dly_dpt.py --mode daily``.

Requires:
  - SharePoint cookies at ``/tmp/od_cookies.json`` (FedAuth)

Usage:
  python3 scripts/fill_daily_excel.py
  python3 scripts/fill_daily_excel.py --through 2026-09-12
  python3 scripts/fill_daily_excel.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import openpyxl
import pdfplumber
from openpyxl.utils import get_column_letter

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

COOKIES_PATH = Path("/tmp/od_cookies.json")
HOST = "https://smartsolutionsai26-my.sharepoint.com"
BASE = f"{HOST}/personal/minamorcos_smartsolutionsai26_onmicrosoft_com"
ROOT = "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents"
PDF_DIR = Path("/tmp/s2k/exports/daily_pdfs_excel_fill")
OUT_DIR = Path("/tmp/s2k/exports/daily_xlsx_excel_fill")
RESULT = Path("/tmp/s2k/exports/daily_excel_fill_result.json")
GAPS_OUT = Path("/tmp/s2k/exports/daily_xlsx_gaps.json")
SSL_CTX = ssl.create_default_context()
HDR = 8

# folder + workbook name under Clients/
META = {
    "42179": {
        "folder": "42179 (Arco HB)",
        "name": "Arco HB Daily.xlsx",
        "pdf_mode": "single",
        "pdf_folder": "Clients/42179 (Arco HB)/{month_folder}/Daily Summary",
    },
    "42004": {
        "folder": "42004 (Arco Placentia)",
        "name": "Arco Placentia Daily.xlsx",
        "pdf_mode": "single",
        "pdf_folder": "Clients/42004 (Arco Placentia)/{month_folder}/Daily Summary",
    },
    "42352": {
        "folder": "42352 (Arco Db)",
        "name": "Arco Db Daily.xlsx",
        "pdf_mode": "single",
        "pdf_folder": "Clients/42352 (Arco Db)/{month_folder}/Daily Summary",
    },
    "42674": {
        "folder": "BIG DADDY/42674 (Tustin)",
        "name": "Tustin Daily.xlsx",
        "pdf_mode": "single",
        "pdf_folder": "Clients/BIG DADDY/42674 (Tustin)/{month_folder}/Daily Summary",
    },
    "42280": {
        "folder": "BIG DADDY/42280 (Spring Mtn)",
        "name": "Spring Mtn Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42280",
    },
    "42438": {
        "folder": "BIG DADDY/42438 (Vista)",
        "name": "Vista Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42438",
    },
    "42281": {
        "folder": "BIG DADDY/42281 (Charleston)",
        "name": "Charleston Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42281",
    },
    "42399": {
        "folder": "BIG DADDY/42399 (Garden Grove)",
        "name": "Garden Grove Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42399",
    },
    "42282": {
        "folder": "BIG DADDY/42282 (Oakey  Las Vegas Blvd)",
        "name": "Oakey Las Vegas Blvd Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42282",
    },
    "42439": {
        "folder": "BIG DADDY/42439 (Lamb)",
        "name": "Lamb Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42439",
    },
    "42098": {
        "folder": "BIG DADDY/42098 (Brookhurst 75)",
        "name": "Brookhurst 75 Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42098",
        "source": True,
    },
    "42021": {
        "folder": "BIG DADDY/42021 (Westminster)",
        "name": "Westminster Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42021",
    },
    "42279": {
        "folder": "BIG DADDY/42279 Flamingo (Koval)",
        "name": "Koval Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42279",
    },
    "42048": {
        "folder": "BIG DADDY/42048 (San Diego)",
        "name": "San Diego Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42048",
    },
    "42359": {
        "folder": "BIG DADDY/42359 (Paradise)",
        "name": "Paradise Daily.xlsx",
        "pdf_mode": "bd",
        "tso": "42359",
    },
}


def month_folder(year: int, month: int) -> str:
    return f"{year}-{month:02d} {MONTH_NAMES[month]}"


def sheet_name(year: int, month: int) -> str:
    return f"{MONTH_NAMES[month]} {year}"


def cookie_header() -> str:
    cookies = json.loads(COOKIES_PATH.read_text())
    return "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if "sharepoint.com" in c.get("domain", "")
    )


COOKIE = ""
DIGEST = ""


def req(url, method="GET", data=None, headers=None, timeout=180):
    h = {
        "Cookie": COOKIE,
        "Accept": "application/json;odata=verbose",
        "User-Agent": "Mozilla/5.0",
    }
    if headers:
        h.update(headers)
    body = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body = json.dumps(data).encode()
            h.setdefault("Content-Type", "application/json;odata=verbose")
        else:
            body = data if isinstance(data, bytes) else data.encode()
    request = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(request, context=SSL_CTX, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def get_digest() -> str:
    code, body = req(BASE + "/_api/contextinfo", method="POST", data=b"")
    if code != 200:
        raise RuntimeError(f"digest fail {code} {body[:300]}")
    return json.loads(body)["d"]["GetContextWebInformation"]["FormDigestValue"]


def download_file(server_rel: str) -> bytes:
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel)}')/$value"
    )
    request = urllib.request.Request(
        url, headers={"Cookie": COOKIE, "Accept": "*/*", "User-Agent": "Mozilla/5.0"}
    )
    with urllib.request.urlopen(request, context=SSL_CTX, timeout=180) as resp:
        return resp.read()


def upload_file(server_rel: str, data: bytes):
    global DIGEST
    folder, name = server_rel.rsplit("/", 1)
    url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(folder)}')"
        + f"/Files/add(url='{urllib.parse.quote(name)}',overwrite=true)"
    )
    headers = {
        "X-RequestDigest": DIGEST,
        "Content-Type": "application/octet-stream",
        "Accept": "application/json;odata=verbose",
    }
    code, body = req(url, method="POST", data=data, headers=headers, timeout=300)
    if code == 403:
        DIGEST = get_digest()
        headers["X-RequestDigest"] = DIGEST
        code, body = req(url, method="POST", data=data, headers=headers, timeout=300)
    if code not in (200, 201):
        raise RuntimeError(f"upload fail {code} {body[:400]}")


def money(s):
    s = (s or "").strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
    if s in ("", "-", "--"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_dept_amount(text, label):
    m = re.search(rf"{re.escape(label)}\s+[\d,.]+\s+\$([\d,.]+)", text, re.I)
    return (money(m.group(1)) or 0.0) if m else 0.0


def parse_cstore_fields(text):
    out = {}
    m = re.search(
        r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+([\d.]+)%\s+\$([\-\d,.]+)", text
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


def parse_single(path: Path) -> dict:
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    out = {}
    m = re.search(
        r"Grand Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)", text
    )
    if not m:
        m = re.search(
            r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)",
            text,
        )
    if m:
        out["gas_vol"] = float(m.group(1).replace(",", ""))
        out["gas_profit"] = money(m.group(4))
    cstore = text
    for marker in ("CStore Sales", "C-Store Sales", "Department Qty"):
        if marker in text:
            cstore = text.split(marker, 1)[1]
            break
    out.update(parse_cstore_fields(cstore))
    if out.get("cstore_total") is None:
        m = re.search(r"Total\s+[\d,.]+\s+\$([\d,.]+)", cstore)
        if m:
            out["cstore_total"] = money(m.group(1))
    return out


def parse_bd_store(path: Path, tso: str) -> dict | None:
    with pdfplumber.open(path) as pdf:
        text = "\n".join(p.extract_text() or "" for p in pdf.pages)
    blocks = []
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
    out = {}
    fuel_m = re.search(
        r"Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)",
        block,
    )
    if fuel_m:
        out["gas_vol"] = float(fuel_m.group(1).replace(",", ""))
        out["gas_profit"] = money(fuel_m.group(4))
    out.update(parse_cstore_fields(block))
    return out


def pdf_name(year: int, month: int, day: int) -> str:
    return f"{month:02d}{day:02d}{year}.pdf"


def ensure_pdf(meta: dict, year: int, month: int, day: int) -> Path | None:
    name = pdf_name(year, month, day)
    mf = month_folder(year, month)
    bd_pdf_folder = f"Clients/BIG DADDY/PDF/daily/{mf}"
    if meta["pdf_mode"] == "single":
        folder = meta["pdf_folder"].format(month_folder=mf)
        server = f"{ROOT}/{folder}/{name}"
        local = PDF_DIR / f"{meta.get('key', day)}_{name}"
    else:
        server = f"{ROOT}/{bd_pdf_folder}/{name}"
        local = PDF_DIR / f"bd_{name}"

    def _pdf_has_sales(data: bytes) -> bool:
        if len(data) < 5000 or not data.startswith(b"%PDF"):
            return False
        try:
            import io

            with pdfplumber.open(io.BytesIO(data)) as pdf:
                text = "\n".join((p.extract_text() or "") for p in pdf.pages[:3])
            return "Station Total" in text or "Unleaded" in text or "Diesel" in text
        except Exception:
            return len(data) >= 28000

    if local.exists() and local.stat().st_size > 20000:
        data = local.read_bytes()
        if _pdf_has_sales(data):
            return local
        local.unlink(missing_ok=True)
    try:
        data = download_file(server)
        if not _pdf_has_sales(data):
            print(f"  PDF empty shell {local.name} bytes={len(data)}")
            return None
        local.write_bytes(data)
        print(f"  downloaded {local.name} ({len(data)} bytes)")
        return local
    except Exception as e:
        print(f"  PDF miss {name}: {e}")
        return None


def header_map(ws) -> dict[str, str]:
    cols = {}
    for c in range(1, 16):
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
            # Prefer Net Purchases; keep Base Purchases as a separate input col
            if "base" in hl:
                cols["purchases_base"] = letter
            else:
                cols["purchases"] = letter
    if "purchases" not in cols:
        cols["purchases"] = cols.get("purchases_base", "F")
    return cols


def cell_empty(v) -> bool:
    return v is None or (isinstance(v, str) and not str(v).strip())


def has_sales_row(ws, row: int, gas_col: str = "B") -> bool:
    b = ws[f"{gas_col}{row}"].value
    if cell_empty(b):
        return False
    if isinstance(b, (int, float)) and b == 0:
        j = ws[f"J{row}"].value
        if cell_empty(j) or j == 0:
            return False
    return True


def zero_empty_purchases(ws, through: int, cols: dict[str, str]) -> list[str]:
    """Placeholder 0 until DLY/DPT lands real Net Purchases — blank cells only.

    Skips formula cells. If Net Purchases is formula-driven from a Base Purchases
    column, also zero blank Base cells so the Net formula can resolve.
    """
    gas_col = cols.get("gas_vol", "B")
    targets = []
    for key in ("purchases", "purchases_base"):
        letter = cols.get(key)
        if letter and letter not in targets:
            targets.append(letter)
    if not targets:
        targets = ["F"]
    changed = []
    for day in range(1, through + 1):
        r = HDR + day
        if not has_sales_row(ws, r, gas_col):
            continue
        for letter in targets:
            cell = f"{letter}{r}"
            val = ws[cell].value
            if isinstance(val, str) and val.startswith("="):
                continue
            if cell_empty(val):
                ws[cell] = 0
                changed.append(f"{cell}=0")
    return changed


def remap_formula(formula, src_row, dst_row):
    """Remap A1-style row refs from src_row -> dst_row (e.g. J9:O9 -> J12:O12).

    Must match digits after column letters. A lookbehind that bans A-Z never
    matches ``B9`` / ``J9``, which left every filled day pointing at the
    template row (seen on Arco HB September C-Store formulas).
    """
    return re.sub(
        rf"([A-Za-z]+){src_row}(?!\d)",
        rf"\g<1>{dst_row}",
        formula,
    )


def _formula_refs_own_row(formula: str, row: int) -> bool:
    """True when every A1 row ref in the formula points at ``row`` (or totals ≥40)."""
    refs = re.findall(r"[A-Za-z]+(\d+)", formula)
    if not refs:
        return False
    for num in refs:
        n = int(num)
        if n == row:
            continue
        if n >= 40:  # month totals / averages block
            continue
        return False
    return True


def template_formulas(ws, day: int) -> dict[str, str]:
    target = HDR + day
    for ref_day in range(1, 32):
        rr = HDR + ref_day
        dval = ws[f"D{rr}"].value
        if ws[f"B{rr}"].value in (None, ""):
            continue
        if not (isinstance(dval, str) and dval.startswith("=")):
            continue
        # Skip damaged template rows that still point at another day (e.g. all → 13)
        if not _formula_refs_own_row(dval, rr):
            continue
        mapping = {}
        for col in ("D", "E", "G", "H", "I"):
            val = ws[f"{col}{rr}"].value
            if isinstance(val, str) and val.startswith("=") and _formula_refs_own_row(val, rr):
                mapping[col] = remap_formula(val, rr, target)
        if mapping:
            return mapping
    return {}


def write_values(ws, day, vals, cols):
    r = HDR + day
    changed = []
    for field, key in [
        ("gas_vol", "gas_vol"),
        ("gas_profit", "gas_profit"),
        ("cstore_total", "cstore_total"),
        ("tax1", "tax1"),
        ("tax4", "tax4"),
        ("scratch", "scratch"),
        ("lotto", "lotto"),
        ("card", "card"),
    ]:
        if field not in cols:
            continue
        val = vals.get(key)
        if val is None:
            continue
        cell = f"{cols[field]}{r}"
        if ws[cell].value not in (None, ""):
            continue
        ws[cell] = val
        changed.append(f"{cell}={val}")
    for col, formula in template_formulas(ws, day).items():
        if ws[f"{col}{r}"].value in (None, ""):
            ws[f"{col}{r}"] = formula
            changed.append(f"{col}=formula")
    # Temporary placeholder until DLY/DPT supplies real purchase totals
    purch = cols.get("purchases", "F")
    gas_col = cols.get("gas_vol", "B")
    if has_sales_row(ws, r, gas_col) and cell_empty(ws[f"{purch}{r}"].value):
        ws[f"{purch}{r}"] = 0
        changed.append(f"{purch}{r}=0")
    return changed


def fill_brookhurst(wb, day, vals, year, month, sn):
    src = wb[f"{MONTH_NAMES[month]} {year} Source"]
    ws = wb[sn]
    sr = 2 + day
    mr = HDR + day
    changed = []
    if src[f"A{sr}"].value in (None, ""):
        src[f"A{sr}"] = datetime(year, month, day)
        changed.append(f"src!A{sr}=date")
    tax_sum = sum((vals.get(k) or 0.0) for k in ("tax1", "tax4", "scratch", "lotto", "card"))
    mapping = {
        "B": vals.get("gas_vol"),
        "C": vals.get("gas_profit"),
        "D": round(vals["gas_profit"] / vals["gas_vol"], 4) if vals.get("gas_vol") else None,
        "E": round(vals["cstore_total"] - tax_sum, 2)
        if vals.get("cstore_total") is not None
        else None,
        "F": 0,  # temporary Net Purchases until DLY/DPT
        "J": vals.get("cstore_total"),
        "K": vals.get("tax1", 0.0),
        "L": vals.get("tax4", 0.0),
        "M": vals.get("scratch", 0.0),
        "N": vals.get("lotto", 0.0),
        "O": vals.get("card", 0.0),
    }
    for col, val in mapping.items():
        if val is None:
            continue
        if src[f"{col}{sr}"].value in (None, ""):
            src[f"{col}{sr}"] = val
            changed.append(f"src!{col}{sr}={val}")
    for col, formula in {
        "G": f'=IF(COUNTA(A{sr}:F{sr})=0,"",E{sr}-F{sr})',
        "H": f'=IFERROR(G{sr}/E{sr},"")',
        "I": f'=IF(COUNTA(A{sr}:F{sr})=0,"",C{sr}+G{sr})',
    }.items():
        if src[f"{col}{sr}"].value in (None, ""):
            src[f"{col}{sr}"] = formula
    src_label = f"{MONTH_NAMES[month]} {year} Source"
    for col, formula in {
        "B": f"='{src_label}'!B{sr}",
        "C": f"='{src_label}'!C{sr}",
        "E": f"='{src_label}'!E{sr}",
        "J": f"='{src_label}'!J{sr}",
        "K": f"='{src_label}'!K{sr}",
        "L": f"='{src_label}'!L{sr}",
        "M": f"='{src_label}'!M{sr}",
        "N": f"='{src_label}'!N{sr}",
        "O": f"='{src_label}'!O{sr}",
    }.items():
        if ws[f"{col}{mr}"].value in (None, ""):
            ws[f"{col}{mr}"] = formula
            changed.append(f"{col}{mr}->src")
    for col, formula in template_formulas(ws, day).items():
        if col in ("D", "G", "H", "I") and ws[f"{col}{mr}"].value in (None, ""):
            ws[f"{col}{mr}"] = formula
            changed.append(f"{col}=formula")
    return changed


def garden_grove_day_formulas(r: int) -> dict[str, str]:
    """Self-row D/E/G/H/I formulas for Garden Grove Daily (never hardcode values)."""
    return {
        "D": f'=IF(OR(B{r}="",B{r}=0),"",C{r}/B{r})',
        "E": f'=IF(J{r}="","",J{r}-N(K{r})-N(L{r})-N(M{r})-N(N{r})-N(O{r}))',
        "G": f'=IF(OR(E{r}="",F{r}=""),"",E{r}-F{r})',
        "H": f'=IF(OR(E{r}="",E{r}=0),"",G{r}/E{r})',
        "I": f'=IF(OR(C{r}="",G{r}=""),"",C{r}+G{r})',
    }


def repair_garden_grove_formulas(ws, through_day: int = 31) -> list[str]:
    """Overwrite missing, hardcoded, or wrong-row D/E/G/H/I on GG day rows.

    Prior damage copied day-5 formulas onto days 1–4 and left days 11/14 blank.
    Always restore the self-row template for every day row in the month sheet.
    """
    changed = []
    last = min(31, max(1, through_day))
    for day in range(1, last + 1):
        r = HDR + day
        # Skip trailing template spacer row with no date formula
        if ws[f"A{r}"].value in (None, ""):
            continue
        for col, formula in garden_grove_day_formulas(r).items():
            cur = ws[f"{col}{r}"].value
            if cur == formula:
                continue
            if isinstance(cur, str) and cur.startswith("=") and _formula_refs_own_row(cur, r):
                # Already a valid self-row formula (may differ slightly in IF shape)
                continue
            ws[f"{col}{r}"] = formula
            kind = "missing" if cur in (None, "") else ("hardcoded" if not (isinstance(cur, str) and cur.startswith("=")) else "wrong-row")
            changed.append(f"{col}{r}={kind}")
    return changed


def fill_garden_grove(ws, day, vals):
    r = HDR + day
    changed = []
    for col, val in [
        ("B", vals.get("gas_vol")),
        ("C", vals.get("gas_profit")),
        ("J", vals.get("cstore_total")),
        ("K", vals.get("tax1", 0.0)),
        ("L", vals.get("tax4", 0.0)),
        ("M", vals.get("scratch", 0.0)),
        ("N", vals.get("lotto", 0.0)),
        ("O", vals.get("card", 0.0)),
    ]:
        if val is None:
            continue
        if ws[f"{col}{r}"].value in (None, ""):
            ws[f"{col}{r}"] = val
            changed.append(f"{col}={val}")
    for col, formula in garden_grove_day_formulas(r).items():
        cur = ws[f"{col}{r}"].value
        if cur == formula:
            continue
        if isinstance(cur, str) and cur.startswith("=") and _formula_refs_own_row(cur, r):
            continue
        ws[f"{col}{r}"] = formula
        changed.append(f"{col}=formula")
    if has_sales_row(ws, r) and cell_empty(ws[f"F{r}"].value):
        ws[f"F{r}"] = 0
        changed.append(f"F{r}=0")
    return changed


def fill_san_diego(wb, day, vals, year, month):
    calc = f"{MONTH_NAMES[month]} Calculations"
    ws = wb[calc]
    r = 2 + day
    changed = []
    tax_sum = sum((vals.get(k) or 0.0) for k in ("tax1", "tax4", "scratch", "lotto", "card"))
    mapping = [
        ("B", vals.get("gas_vol")),
        ("C", vals.get("gas_profit")),
        (
            "E",
            round(vals["cstore_total"] - tax_sum, 2)
            if vals.get("cstore_total") is not None
            else None,
        ),
        ("J", vals.get("cstore_total")),
        ("K", vals.get("tax1", 0.0)),
        ("L", vals.get("tax4", 0.0)),
        ("M", vals.get("scratch", 0.0)),
        ("N", vals.get("lotto", 0.0)),
        ("O", vals.get("card", 0.0)),
    ]
    for col, val in mapping:
        if val is None:
            continue
        if ws[f"{col}{r}"].value in (None, ""):
            ws[f"{col}{r}"] = val
            changed.append(f"{col}{r}={val}")
    return changed


def pick_sheet(wb, year: int, month: int):
    sn = sheet_name(year, month)
    if sn in wb.sheetnames:
        return sn
    label = MONTH_NAMES[month].lower()
    for name in wb.sheetnames:
        nl = name.lower()
        if (
            label in nl
            and str(year) in nl
            and "source" not in nl
            and "calc" not in nl
        ):
            return name
    return None


def missing_days_for_wb(wb, key: str, through: int, year: int, month: int) -> list[int]:
    calc = f"{MONTH_NAMES[month]} Calculations"
    if key == "42048":
        if calc not in wb.sheetnames:
            return list(range(1, through + 1))
        ws = wb[calc]
        miss = []
        for day in range(1, through + 1):
            if ws[f"B{2 + day}"].value in (None, ""):
                miss.append(day)
        return miss
    sheet = pick_sheet(wb, year, month)
    if not sheet:
        return list(range(1, through + 1))
    ws = wb[sheet]
    cols = header_map(ws)
    gas_col = cols.get("gas_vol", "B")
    miss = []
    for day in range(1, through + 1):
        if ws[f"{gas_col}{HDR + day}"].value in (None, ""):
            miss.append(day)
    return miss


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--through",
        help="Fill through this date (YYYY-MM-DD). Default: yesterday PT.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Download and fill locally but do not upload.",
    )
    return p.parse_args()


def main():
    global COOKIE, DIGEST
    args = parse_args()
    if args.through:
        through_date = date.fromisoformat(args.through)
    else:
        through_date = datetime.now(PT).date() - timedelta(days=1)
    year, month, through = through_date.year, through_date.month, through_date.day
    sn = sheet_name(year, month)

    PDF_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    COOKIE = cookie_header()
    DIGEST = get_digest()
    print(f"digest ok; through {through_date.isoformat()} (day {through})")

    gaps = {}
    report = []
    for key, meta in META.items():
        meta = dict(meta)
        meta["key"] = key
        xlsx_rel = f"Clients/{meta['folder']}/{meta['name']}"
        server = f"{ROOT}/{xlsx_rel}"
        local = OUT_DIR / f"{key}_{meta['name'].replace(' ', '_')}"
        try:
            data = download_file(server)
            local.write_bytes(data)
        except Exception as e:
            print(f"FAIL download {key}: {e}")
            report.append({"store": key, "error": f"download {e}"})
            continue
        wb = openpyxl.load_workbook(local)
        miss = missing_days_for_wb(wb, key, through, year, month)
        gaps[key] = {
            "folder": meta["folder"],
            "name": meta["name"],
            "missing_days": miss,
        }
        print(f"{key} missing={miss}")

        sheet = pick_sheet(wb, year, month)
        calc = f"{MONTH_NAMES[month]} Calculations"
        purch_zeros: list[str] = []
        if key == "42048":
            ws = wb[calc] if calc in wb.sheetnames else None
            cols = {}
        else:
            if not sheet:
                report.append({"store": key, "error": f"no {sn} sheet"})
                continue
            ws = wb[sheet]
            cols = header_map(ws)
            print(f"  columns: {cols}")
            purch_zeros = zero_empty_purchases(ws, through, cols)
            if meta.get("source"):
                src_name = f"{MONTH_NAMES[month]} {year} Source"
                if src_name in wb.sheetnames:
                    src = wb[src_name]
                    for day in range(1, through + 1):
                        sr = 2 + day
                        # Source F = Net Purchases when sales row present
                        if src[f"B{sr}"].value not in (None, "") and cell_empty(src[f"F{sr}"].value):
                            src[f"F{sr}"] = 0
                            purch_zeros.append(f"src!F{sr}=0")
            if purch_zeros:
                print(f"  purchases->0: {purch_zeros[:12]}{'...' if len(purch_zeros)>12 else ''}")

        filled = []
        skipped_no_pdf = []
        formula_repairs: list[str] = []
        if key == "42399" and ws is not None:
            # Full month rows: damaged GG sheets had wrong-row / missing D–I
            formula_repairs = repair_garden_grove_formulas(ws, 31)
            if formula_repairs:
                print(
                    f"  formula repair: {formula_repairs[:16]}"
                    f"{'...' if len(formula_repairs) > 16 else ''}"
                )

        for day in miss:
            if key == "42048":
                if ws is None or ws[f"B{2 + day}"].value not in (None, ""):
                    continue
            else:
                gas_col = cols.get("gas_vol", "B")
                if ws[f"{gas_col}{HDR + day}"].value not in (None, ""):
                    continue
            pdf = ensure_pdf(meta, year, month, day)
            if not pdf:
                skipped_no_pdf.append(day)
                continue
            if meta["pdf_mode"] == "single":
                vals = parse_single(pdf)
            else:
                vals = parse_bd_store(pdf, meta["tso"])
                if not vals:
                    print(f"  day {day}: TSO {meta['tso']} not in PDF")
                    continue
            if vals.get("gas_vol") is None or vals.get("cstore_total") is None:
                print(f"  day {day}: parse incomplete {vals}")
                continue
            if key == "42048":
                ch = fill_san_diego(wb, day, vals, year, month)
            elif meta.get("source"):
                ch = fill_brookhurst(wb, day, vals, year, month, sheet)
            elif key == "42399":
                ch = fill_garden_grove(ws, day, vals)
            else:
                # prefer write_values; fall back to write_values alias if renamed
                writer = globals().get("write_values") or globals().get("write_values")
                ch = writer(ws, day, vals, cols)
            print(f"  day {day}: {ch}")
            if ch:
                filled.append(day)

        changed = bool(filled or purch_zeros or formula_repairs)
        if changed and not args.dry_run:
            wb.save(local)
            upload_file(server, local.read_bytes())
            print(
                f"  UPLOADED filled={filled} purchases0={len(purch_zeros)} "
                f"formula_repairs={len(formula_repairs)}"
            )
        elif changed:
            wb.save(local)
            print(
                f"  DRY-RUN saved filled={filled} purchases0={len(purch_zeros)} "
                f"formula_repairs={len(formula_repairs)}"
            )
        else:
            print("  nothing uploaded")
        report.append(
            {
                "store": key,
                "filled": filled,
                "purchases_zeroed": purch_zeros,
                "formula_repairs": formula_repairs,
                "skipped_no_pdf": skipped_no_pdf,
                "file": meta["name"],
            }
        )

    GAPS_OUT.write_text(json.dumps(gaps, indent=2))
    payload = {"through": through_date.isoformat(), "report": report}
    RESULT.write_text(json.dumps(payload, indent=2))
    print("\nDONE")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
