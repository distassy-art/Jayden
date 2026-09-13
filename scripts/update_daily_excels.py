#!/usr/bin/env python3
"""Fill missing September daily Excel rows from Daily Book Summary PDFs."""
from __future__ import annotations

import json
import re
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.utils import get_column_letter
import pdfplumber

COOKIES_PATH = Path('/tmp/od_cookies.json')
HOST = 'https://smartsolutionsai26-my.sharepoint.com'
BASE = f'{HOST}/personal/minamorcos_smartsolutionsai26_onmicrosoft_com'
ROOT = '/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents'
PDF_DIR = Path('/tmp/s2k/exports/daily_pdfs_sep')
OUT_DIR = Path('/tmp/s2k/exports/daily_xlsx_updated')
PDF_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

SHEET = 'September 2026'
HDR = 8
BD_PDF_FOLDER = 'Clients/BIG DADDY/PDF/daily/2026-09 September'
SSL_CTX = ssl.create_default_context()
GAPS = json.loads(Path('/tmp/s2k/exports/daily_xlsx_gaps.json').read_text())

STORES = [
    {
        'key': '42179',
        'pdf_mode': 'single',
        'pdf_folder': 'Clients/42179 (Arco HB)/2026-09 September/Daily Summary',
    },
    {
        'key': '42004',
        'pdf_mode': 'single',
        'pdf_folder': 'Clients/42004 (Arco Placentia)/2026-09 September/Daily Summary',
    },
    {
        'key': '42352',
        'pdf_mode': 'single',
        'pdf_folder': 'Clients/42352 (Arco Db)/2026-09 September/Daily Summary',
    },
    {
        'key': '42674',
        'pdf_mode': 'single',
        'pdf_folder': 'Clients/BIG DADDY/42674 (Tustin)/2026-09 September/Daily Summary',
    },
    {'key': '42642', 'pdf_mode': 'bd', 'tso': '42642'},
    {'key': '42280', 'pdf_mode': 'bd', 'tso': '42280'},
    {'key': '42438', 'pdf_mode': 'bd', 'tso': '42438'},
    {'key': '42281', 'pdf_mode': 'bd', 'tso': '42281'},
    {'key': '42399', 'pdf_mode': 'bd', 'tso': '42399'},
    {'key': '42282', 'pdf_mode': 'bd', 'tso': '42282'},
    {'key': '42439', 'pdf_mode': 'bd', 'tso': '42439'},
    {'key': '42098', 'pdf_mode': 'bd', 'tso': '42098', 'source': True},
    {'key': '42021', 'pdf_mode': 'bd', 'tso': '42021'},
    {'key': '42279', 'pdf_mode': 'bd', 'tso': '42279'},
    {'key': '42048', 'pdf_mode': 'bd', 'tso': '42048'},
    {'key': '42359', 'pdf_mode': 'bd', 'tso': '42359'},
]


def cookie_header() -> str:
    cookies = json.loads(COOKIES_PATH.read_text())
    return '; '.join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if 'sharepoint.com' in c.get('domain', '')
    )


COOKIE = cookie_header()


def req(url, method='GET', data=None, headers=None, timeout=180):
    h = {
        'Cookie': COOKIE,
        'Accept': 'application/json;odata=verbose',
        'User-Agent': 'Mozilla/5.0',
    }
    if headers:
        h.update(headers)
    body = None
    if data is not None:
        if isinstance(data, (dict, list)):
            body = json.dumps(data).encode()
            h.setdefault('Content-Type', 'application/json;odata=verbose')
        else:
            body = data if isinstance(data, bytes) else data.encode()
    request = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(request, context=SSL_CTX, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def get_digest() -> str:
    code, body = req(BASE + '/_api/contextinfo', method='POST', data=b'')
    if code != 200:
        raise RuntimeError(f'digest fail {code} {body[:300]}')
    return json.loads(body)['d']['GetContextWebInformation']['FormDigestValue']


DIGEST = get_digest()
print('digest ok')


def download_file(server_rel: str) -> bytes:
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel)}')/$value"
    )
    request = urllib.request.Request(
        url,
        headers={'Cookie': COOKIE, 'Accept': '*/*', 'User-Agent': 'Mozilla/5.0'},
        method='GET',
    )
    with urllib.request.urlopen(request, context=SSL_CTX, timeout=180) as resp:
        return resp.read()


def upload_file(server_rel: str, data: bytes):
    global DIGEST
    import time
    folder, name = server_rel.rsplit('/', 1)
    add_url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(folder)}')"
        + f"/Files/add(url='{urllib.parse.quote(name)}',overwrite=true)"
    )
    put_url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel)}')/$value"
    )
    file_url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel)}')"
    )
    last = b""
    for i in range(8):
        DIGEST = get_digest()
        for action in [
            "UndoCheckOut",
            "CheckOut",
            "UndoCheckOut",
            "CheckIn(comment='agent',checkInType=0)",
        ]:
            req(
                file_url + f"/{action}",
                method="POST",
                data=b"",
                headers={"X-RequestDigest": DIGEST},
            )
        DIGEST = get_digest()
        headers = {
            "X-RequestDigest": DIGEST,
            "Content-Type": "application/octet-stream",
            "Accept": "application/json;odata=verbose",
            "Prefer": "bypass-shared-lock",
        }
        code, body = req(add_url, method="POST", data=data, headers=headers, timeout=300)
        if code in (200, 201):
            return
        headers2 = {
            "X-RequestDigest": DIGEST,
            "X-HTTP-Method": "PUT",
            "IF-MATCH": "*",
            "Content-Type": "application/octet-stream",
            "Prefer": "bypass-shared-lock",
        }
        code2, body2 = req(put_url, method="POST", data=data, headers=headers2, timeout=300)
        if code2 in (200, 201, 204):
            return
        last = body2 or body
        print(f"  upload retry {i+1}: add={code} put={code2}", flush=True)
        time.sleep(3 + i * 3)
    raise RuntimeError(f"upload fail {last[:400]}")


def money(s: str) -> float | None:
    s = (s or '').strip().replace(',', '').replace('$', '')
    s = s.replace('(', '-').replace(')', '')
    if s in ('', '-', '--'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_dept_amount(text: str, label: str) -> float:
    m = re.search(rf'{re.escape(label)}\s+[\d,.]+\s+\$([\d,.]+)', text, re.I)
    return (money(m.group(1)) or 0.0) if m else 0.0


def parse_cstore_fields(text: str) -> dict:
    out: dict = {}
    m = re.search(
        r'Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+([\d.]+)%\s+\$([\-\d,.]+)',
        text,
    )
    if m:
        out['cstore_total'] = money(m.group(2))
    out['tax1'] = parse_dept_amount(text, 'TAX 1')
    out['tax4'] = parse_dept_amount(text, 'TAX 4')
    out['scratch'] = parse_dept_amount(text, 'SCRATCH TICKETS')
    out['lotto'] = parse_dept_amount(text, 'LOTTO')
    card = parse_dept_amount(text, 'CARD ACTIVATIONS')
    if card == 0.0:
        card = parse_dept_amount(text, 'CARD ACTIVATION')
    out['card'] = card
    return out


def parse_single(path: Path) -> dict:
    with pdfplumber.open(path) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)
    out: dict = {}
    m = re.search(
        r'Grand Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)',
        text,
    )
    if not m:
        m = re.search(
            r'Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)',
            text,
        )
    if m:
        out['gas_vol'] = float(m.group(1).replace(',', ''))
        out['gas_profit'] = money(m.group(4))
    # Prefer C-store section after department header
    cstore = text
    for marker in ('CStore Sales', 'C-Store Sales', 'Department Qty'):
        if marker in text:
            cstore = text.split(marker, 1)[1]
            break
    out.update(parse_cstore_fields(cstore))
    return out


def parse_bd_store(path: Path, tso: str) -> dict | None:
    with pdfplumber.open(path) as pdf:
        text = '\n'.join(p.extract_text() or '' for p in pdf.pages)
    blocks = []
    for part in re.split(r'(?=TSO #\d+)', text):
        m = re.match(r'TSO #(\d+)', part)
        if not m:
            continue
        raw = m.group(1)
        if raw == tso or raw.startswith(tso) or tso.startswith(raw[:5]):
            blocks.append(part)
    if not blocks:
        return None
    block = '\n'.join(blocks)
    out: dict = {}
    fuel_m = re.search(
        r'Station Total:\s*([\d,.]+)\s+\$([\d,.]+)\s+\$([\d,.]+)\s+\$([\-\d,.]+)',
        block,
    )
    if fuel_m:
        out['gas_vol'] = float(fuel_m.group(1).replace(',', ''))
        out['gas_profit'] = money(fuel_m.group(4))
    out.update(parse_cstore_fields(block))
    return out


def ensure_pdf(store: dict, day: int) -> Path | None:
    name = f'09{day:02d}2026.pdf'
    if store['pdf_mode'] == 'single':
        server = f"{ROOT}/{store['pdf_folder']}/{name}"
        local = PDF_DIR / f"{store['key']}_{name}"
    else:
        server = f'{ROOT}/{BD_PDF_FOLDER}/{name}'
        local = PDF_DIR / f'bd_{name}'
    if local.exists() and local.stat().st_size > 25000:
        return local
    if local.exists():
        local.unlink()
    try:
        data = download_file(server)
        local.write_bytes(data)
        print(f'  downloaded {local.name} ({len(data)} bytes)')
        return local
    except Exception as e:
        print(f'  PDF miss {server}: {e}')
        return None


def header_map(ws) -> dict[str, str]:
    cols: dict[str, str] = {}
    for c in range(1, 16):
        h = ws.cell(HDR, c).value
        if not isinstance(h, str):
            continue
        hl = h.lower()
        letter = get_column_letter(c)
        if 'gas volume' in hl:
            cols['gas_vol'] = letter
        elif 'gas profit' in hl:
            cols['gas_profit'] = letter
        elif 'c-store total' in hl or 'reported c-store total' in hl:
            cols['cstore_total'] = letter
        elif hl.strip().startswith('tax 1'):
            cols['tax1'] = letter
        elif hl.strip().startswith('tax 4'):
            cols['tax4'] = letter
        elif 'scratch' in hl:
            cols['scratch'] = letter
        elif 'lotto' in hl:
            cols['lotto'] = letter
        elif 'card' in hl:
            cols['card'] = letter
    return cols


def remap_formula(formula: str, src_row: int, dst_row: int) -> str:
    return re.sub(rf'(?<![A-Z0-9]){src_row}(?!\d)', str(dst_row), formula)


def template_formulas(ws, day: int) -> dict[str, str]:
    target = HDR + day
    for ref_day in range(1, 32):
        rr = HDR + ref_day
        dval = ws[f'D{rr}'].value
        if ws[f'B{rr}'].value in (None, ''):
            continue
        if not (isinstance(dval, str) and dval.startswith('=')):
            continue
        mapping = {}
        for col in ('D', 'E', 'G', 'H', 'I', 'L'):
            val = ws[f'{col}{rr}'].value
            if isinstance(val, str) and val.startswith('='):
                mapping[col] = remap_formula(val, rr, target)
        return mapping
    return {}


def write_values(ws, day: int, vals: dict, cols: dict[str, str]) -> list[str]:
    r = HDR + day
    changed = []
    for field, key in [
        ('gas_vol', 'gas_vol'),
        ('gas_profit', 'gas_profit'),
        ('cstore_total', 'cstore_total'),
        ('tax1', 'tax1'),
        ('tax4', 'tax4'),
        ('scratch', 'scratch'),
        ('lotto', 'lotto'),
        ('card', 'card'),
    ]:
        if field not in cols:
            continue
        val = vals.get(key)
        if val is None:
            continue
        cell = f'{cols[field]}{r}'
        if ws[cell].value not in (None, ''):
            continue
        ws[cell] = val
        changed.append(f'{cell}={val}')
    for col, formula in template_formulas(ws, day).items():
        if col == 'F':
            continue
        if ws[f'{col}{r}'].value in (None, ''):
            ws[f'{col}{r}'] = formula
            changed.append(f'{col}=formula')
    return changed


def fill_brookhurst(wb, day: int, vals: dict) -> list[str]:
    src = wb['September 2026 Source']
    ws = wb[SHEET]
    sr = 2 + day
    mr = HDR + day
    changed = []
    if src[f'A{sr}'].value in (None, ''):
        src[f'A{sr}'] = datetime(2026, 9, day)
        changed.append(f'src!A{sr}=date')
    tax_sum = sum((vals.get(k) or 0.0) for k in ('tax1', 'tax4', 'scratch', 'lotto', 'card'))
    mapping = {
        'B': vals.get('gas_vol'),
        'C': vals.get('gas_profit'),
        'D': round(vals['gas_profit'] / vals['gas_vol'], 4) if vals.get('gas_vol') else None,
        'E': round(vals['cstore_total'] - tax_sum, 2) if vals.get('cstore_total') is not None else None,
        'J': vals.get('cstore_total'),
        'K': vals.get('tax1', 0.0),
        'L': vals.get('tax4', 0.0),
        'M': vals.get('scratch', 0.0),
        'N': vals.get('lotto', 0.0),
        'O': vals.get('card', 0.0),
    }
    for col, val in mapping.items():
        if val is None:
            continue
        if src[f'{col}{sr}'].value in (None, ''):
            src[f'{col}{sr}'] = val
            changed.append(f'src!{col}{sr}={val}')
    for col, formula in {
        'G': f'=IF(COUNTA(A{sr}:F{sr})=0,"",E{sr}-F{sr})',
        'H': f'=IFERROR(G{sr}/E{sr},"")',
        'I': f'=IF(COUNTA(A{sr}:F{sr})=0,"",C{sr}+G{sr})',
    }.items():
        if src[f'{col}{sr}'].value in (None, ''):
            src[f'{col}{sr}'] = formula
    links = {
        'B': f"='September 2026 Source'!B{sr}",
        'C': f"='September 2026 Source'!C{sr}",
        'E': f"='September 2026 Source'!E{sr}",
        'J': f"='September 2026 Source'!J{sr}",
        'K': f"='September 2026 Source'!K{sr}",
        'L': f"='September 2026 Source'!L{sr}",
        'M': f"='September 2026 Source'!M{sr}",
        'N': f"='September 2026 Source'!N{sr}",
        'O': f"='September 2026 Source'!O{sr}",
    }
    for col, formula in links.items():
        if ws[f'{col}{mr}'].value in (None, ''):
            ws[f'{col}{mr}'] = formula
            changed.append(f'{col}{mr}->src')
    for col, formula in template_formulas(ws, day).items():
        if col in ('D', 'G', 'H', 'I') and ws[f'{col}{mr}'].value in (None, ''):
            ws[f'{col}{mr}'] = formula
            changed.append(f'{col}=formula')
    return changed


def fill_garden_grove(ws, day: int, vals: dict) -> list[str]:
    r = HDR + day
    changed = []
    pairs = [
        ('B', vals.get('gas_vol')),
        ('C', vals.get('gas_profit')),
        ('J', vals.get('cstore_total')),
        ('K', vals.get('tax1', 0.0)),
        ('L', vals.get('tax4', 0.0)),
        ('M', vals.get('scratch', 0.0)),
        ('N', vals.get('lotto', 0.0)),
        ('O', vals.get('card', 0.0)),
    ]
    for col, val in pairs:
        if val is None:
            continue
        if ws[f'{col}{r}'].value in (None, ''):
            ws[f'{col}{r}'] = val
            changed.append(f'{col}={val}')
    extras = {
        'D': f'=IF(OR(B{r}="",B{r}=0),"",C{r}/B{r})',
        'E': f'=IF(J{r}="","",J{r}-N(K{r})-N(L{r})-N(M{r})-N(N{r})-N(O{r}))',
        'G': f'=IF(OR(E{r}="",F{r}=""),"",E{r}-F{r})',
        'H': f'=IF(OR(E{r}="",E{r}=0),"",G{r}/E{r})',
        'I': f'=IF(OR(C{r}="",G{r}=""),"",C{r}+G{r})',
    }
    for col, formula in extras.items():
        if ws[f'{col}{r}'].value in (None, ''):
            ws[f'{col}{r}'] = formula
            changed.append(f'{col}=formula')
    return changed



def fill_san_diego(wb, day: int, vals: dict) -> list[str]:
    """San Diego writes into September Calculations (header row 2, day1=row3)."""
    ws = wb['September Calculations']
    r = 2 + day
    changed = []
    mapping = [
        ('B', vals.get('gas_vol')),
        ('C', vals.get('gas_profit')),
        ('E', None),  # C-Store Sales formula-driven from J-taxes sometimes; write J total instead
        ('J', vals.get('cstore_total')),
        ('K', vals.get('tax1', 0.0)),
        ('L', vals.get('tax4', 0.0)),
        ('M', vals.get('scratch', 0.0)),
        ('N', vals.get('lotto', 0.0)),
        ('O', vals.get('card', 0.0)),
    ]
    # If E is blank and we have cstore components, set C-Store Sales = total - taxes - scratch - lotto - card
    tax_sum = sum((vals.get(k) or 0.0) for k in ('tax1', 'tax4', 'scratch', 'lotto', 'card'))
    if vals.get('cstore_total') is not None:
        mapping[2] = ('E', round(vals['cstore_total'] - tax_sum, 2))
    for col, val in mapping:
        if val is None:
            continue
        if ws[f'{col}{r}'].value in (None, ''):
            ws[f'{col}{r}'] = val
            changed.append(f'{col}{r}={val}')
    return changed

def main():
    report = []
    for store in STORES:
        key = store['key']
        gap = GAPS[key]
        missing = gap['missing_days']
        if not missing:
            continue
        xlsx_rel = f"Clients/{gap['folder']}/{gap['name']}"
        print(f"\n=== {key} {gap['name']} missing={missing} ===")
        xlsx_server = f'{ROOT}/{xlsx_rel}'
        local = OUT_DIR / xlsx_rel.replace('/', '__')
        try:
            local.write_bytes(download_file(xlsx_server))
        except Exception as e:
            print(f'  download fail: {e}')
            report.append({'store': key, 'error': str(e)})
            continue
        wb = openpyxl.load_workbook(local)
        if key == '42048':
            if 'September Calculations' not in wb.sheetnames:
                report.append({'store': key, 'error': 'no September Calculations'})
                continue
            ws = wb['September Calculations']
            cols = {}
        else:
            if SHEET not in wb.sheetnames:
                report.append({'store': key, 'error': f'no {SHEET}'})
                continue
            ws = wb[SHEET]
            cols = header_map(ws)
        print(f'  columns: {cols}')
        filled = []
        for day in missing:
            if key == '42048':
                if ws[f'B{2 + day}'].value not in (None, ''):
                    print(f'  day {day}: already filled')
                    continue
            else:
                gas_col = cols.get('gas_vol', 'B')
                if ws[f'{gas_col}{HDR + day}'].value not in (None, ''):
                    print(f'  day {day}: already filled')
                    continue
            pdf = ensure_pdf(store, day)
            if not pdf:
                continue
            if store['pdf_mode'] == 'single':
                vals = parse_single(pdf)
            else:
                vals = parse_bd_store(pdf, store['tso'])
                if not vals:
                    print(f"  day {day}: TSO {store['tso']} not in PDF")
                    continue
            if vals.get('gas_vol') is None or vals.get('cstore_total') is None:
                print(f'  day {day}: parse incomplete {vals}')
                continue
            if key == '42048':
                ch = fill_san_diego(wb, day, vals)
            elif store.get('source'):
                ch = fill_brookhurst(wb, day, vals)
            elif key == '42399':
                ch = fill_garden_grove(ws, day, vals)
            else:
                ch = write_values(ws, day, vals, cols)
            print(f'  day {day}: {ch}')
            filled.append(day)
        if filled:
            wb.save(local)
            try:
                upload_file(xlsx_server, local.read_bytes())
                print(f'  UPLOADED days {filled}')
                report.append({'store': key, 'filled': filled, 'file': gap['name']})
            except Exception as e:
                print(f'  UPLOAD FAIL (will retry later): {e}')
                locked = Path('/tmp/s2k/exports/daily_xlsx_locked')
                locked.mkdir(parents=True, exist_ok=True)
                dest = locked / f'{key}_{gap["name"].replace(" ", "_")}'
                dest.write_bytes(local.read_bytes())
                report.append({
                    'store': key,
                    'filled': filled,
                    'file': gap['name'],
                    'upload': 'locked',
                    'local': str(dest),
                    'error': str(e)[:300],
                })
        else:
            print('  nothing uploaded')
            report.append({'store': key, 'filled': filled, 'file': gap['name']})
    out = Path('/tmp/s2k/exports/daily_excel_fill_report.json')
    out.write_text(json.dumps(report, indent=2))
    print('\nDONE')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
