#!/usr/bin/env python3
"""Fill Daily.xlsx secondary tables from Daily Book Summary PDFs.

Companion to ``fill_daily_excel.py`` (main gas/c-store rows). This script fills:
  - Receipt LOTTERY / LOTTO block
  - Top N Department Sales table
  - September Source department tables (when present)

Method: scripted PDF → Excel only. Do **not** use Copilot for Daily.xlsx.
Blank cells only — never overwrite existing values or Net Purchases.

Requires:
  - SharePoint cookies at ``/tmp/od_cookies.json``
  - Gaps/meta from a prior ``fill_daily_excel.py`` run
    (``/tmp/s2k/exports/daily_xlsx_gaps.json``), or pass ``--through`` alone
    and the built-in store map is used.

Usage:
  python3 scripts/fill_daily_excel_secondary.py
  python3 scripts/fill_daily_excel_secondary.py --through 2026-09-12
  python3 scripts/fill_daily_excel_secondary.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pdfplumber
from openpyxl import load_workbook

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
BASE = HOST + "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com"
ROOT = "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents"
COOKIES_PATH = Path("/tmp/od_cookies.json")
GAPS_PATH = Path("/tmp/s2k/exports/daily_xlsx_gaps.json")
PDF_CACHE = Path("/tmp/s2k/pdfs/fill_secondary")
OUT = Path("/tmp/s2k/exports/secondary_fill")
RESULT = Path("/tmp/s2k/exports/secondary_fill_report.json")
SSL_CTX = ssl.create_default_context()

STORE_META = {
    "42179": {
        "folder": "42179 (Arco HB)",
        "name": "Arco HB Daily.xlsx",
        "mode": "single",
        "pdf_folder": "Clients/42179 (Arco HB)/{month_folder}/Daily Summary",
        "tso": "42179",
    },
    "42004": {
        "folder": "42004 (Arco Placentia)",
        "name": "Arco Placentia Daily.xlsx",
        "mode": "single",
        "pdf_folder": "Clients/42004 (Arco Placentia)/{month_folder}/Daily Summary",
        "tso": "42004",
    },
    "42352": {
        "folder": "42352 (Arco Db)",
        "name": "Arco Db Daily.xlsx",
        "mode": "single",
        "pdf_folder": "Clients/42352 (Arco Db)/{month_folder}/Daily Summary",
        "tso": "42352",
    },
    "42674": {
        "folder": "BIG DADDY/42674 (Tustin)",
        "name": "Tustin Daily.xlsx",
        "mode": "single",
        "pdf_folder": "Clients/BIG DADDY/42674 (Tustin)/{month_folder}/Daily Summary",
        "tso": "42674",
    },
    "42642": {
        "folder": "BIG DADDY/42642 (La Mesa)",
        "name": "La Mesa Daily.xlsx",
        "mode": "bd",
        "tso": "42642",
    },
    "42280": {
        "folder": "BIG DADDY/42280 (Spring Mtn)",
        "name": "Spring Mtn Daily.xlsx",
        "mode": "bd",
        "tso": "42280",
    },
    "42438": {
        "folder": "BIG DADDY/42438 (Vista)",
        "name": "Vista Daily.xlsx",
        "mode": "bd",
        "tso": "42438",
    },
    "42281": {
        "folder": "BIG DADDY/42281 (Charleston)",
        "name": "Charleston Daily.xlsx",
        "mode": "bd",
        "tso": "42281",
    },
    "42359": {
        "folder": "BIG DADDY/42359 (Paradise)",
        "name": "Paradise Daily.xlsx",
        "mode": "bd",
        "tso": "42359",
    },
    "42399": {
        "folder": "BIG DADDY/42399 (Garden Grove)",
        "name": "Garden Grove Daily.xlsx",
        "mode": "bd",
        "tso": "42399",
    },
    "42282": {
        "folder": "BIG DADDY/42282 (Oakey  Las Vegas Blvd)",
        "name": "Oakey Las Vegas Blvd Daily.xlsx",
        "mode": "bd",
        "tso": "42282",
    },
    "42439": {
        "folder": "BIG DADDY/42439 (Lamb)",
        "name": "Lamb Daily.xlsx",
        "mode": "bd",
        "tso": "42439",
    },
    "42098": {
        "folder": "BIG DADDY/42098 (Brookhurst 75)",
        "name": "Brookhurst 75 Daily.xlsx",
        "mode": "bd",
        "tso": "42098",
    },
    "42021": {
        "folder": "BIG DADDY/42021 (Westminster)",
        "name": "Westminster Daily.xlsx",
        "mode": "bd",
        "tso": "42021",
    },
    "42048": {
        "folder": "BIG DADDY/42048 (San Diego)",
        "name": "San Diego Daily.xlsx",
        "mode": "bd",
        "tso": "42048",
    },
    "42279": {
        "folder": "BIG DADDY/42279 Flamingo (Koval)",
        "name": "Koval Daily.xlsx",
        "mode": "bd",
        "tso": "42279",
    },
}

COOKIE = ""


def cookie_header() -> str:
    cookies = json.loads(COOKIES_PATH.read_text())
    return "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if "sharepoint.com" in c.get("domain", "")
    )


def req(url, method="GET", data=None, headers=None, timeout=180):
    h = {
        "Cookie": COOKIE,
        "Accept": "application/json;odata=verbose",
        "User-Agent": "Mozilla/5.0",
    }
    if headers:
        h.update(headers)
    request = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(request, context=SSL_CTX, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def digest():
    return json.loads(req(BASE + "/_api/contextinfo", method="POST", data=b"")[1])[
        "d"
    ]["GetContextWebInformation"]["FormDigestValue"]


def download_bytes(server_rel: str) -> bytes:
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel, safe='/')}')/$value"
    )
    code, body = req(url)
    if code != 200:
        raise RuntimeError(f"download {code} {server_rel} {body[:160]}")
    return body


def unlock(server_rel: str):
    enc = urllib.parse.quote(server_rel, safe="/")
    dig = digest()
    for action in [
        "CheckOut",
        "UndoCheckOut",
        "CheckIn(comment='unlock',checkInType=1)",
        "UndoCheckOut",
    ]:
        req(
            BASE + f"/_api/web/GetFileByServerRelativeUrl('{enc}')/{action}",
            method="POST",
            data=b"",
            headers={"X-RequestDigest": dig, "IF-MATCH": "*"},
        )
    req(
        BASE + f"/_api/web/GetFileByServerRelativeUrl('{enc}')/ReleaseLock",
        method="POST",
        data=b"",
        headers={"X-RequestDigest": dig, "IF-MATCH": "*"},
    )


def upload_bytes(server_rel: str, data: bytes) -> bool:
    folder, name = server_rel.rsplit("/", 1)
    add_url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(folder, safe='/')}')"
        + f"/Files/add(url='{urllib.parse.quote(name)}',overwrite=true)"
    )
    put_url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel, safe='/')}')/$value"
    )
    for i in range(8):
        unlock(server_rel)
        dig = digest()
        headers = {
            "X-RequestDigest": dig,
            "Content-Type": "application/octet-stream",
            "Accept": "application/json;odata=verbose",
            "Prefer": "bypass-shared-lock",
        }
        code, _ = req(add_url, method="POST", data=data, headers=headers, timeout=300)
        if code in (200, 201):
            return True
        headers2 = {
            "X-RequestDigest": dig,
            "X-HTTP-Method": "PUT",
            "IF-MATCH": "*",
            "Content-Type": "application/octet-stream",
            "Prefer": "bypass-shared-lock",
        }
        code2, _ = req(put_url, method="POST", data=data, headers=headers2, timeout=300)
        if code2 in (200, 201, 204):
            return True
        print(f"  upload retry {i + 1}: add={code} put={code2}")
        time.sleep(5 + i * 3)
    return False


def money(s):
    s = (s or "").strip().replace(",", "").replace("$", "").replace("(", "-").replace(")", "")
    if s in ("", "-", "--"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def month_folder(year: int, month: int) -> str:
    return f"{year}-{month:02d} {MONTH_NAMES[month]}"


def ensure_pdf(cfg, year: int, month: int, day: int) -> Path | None:
    name = f"{month:02d}{day:02d}{year}.pdf"
    mf = month_folder(year, month)
    if cfg["mode"] == "single":
        folder = cfg["pdf_folder"].format(month_folder=mf)
        server = f"{ROOT}/{folder}/{name}"
        local = PDF_CACHE / f"{cfg['tso']}_{name}"
    else:
        server = f"{ROOT}/Clients/BIG DADDY/PDF/daily/{mf}/{name}"
        local = PDF_CACHE / f"bd_{name}"
    if local.exists() and local.stat().st_size > 10000:
        return local
    try:
        local.write_bytes(download_bytes(server))
        return local
    except Exception as e:
        print(f"  pdf miss day{day}: {e}")
        return None


def parse_pdf(path: Path, tso: str):
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
    if not receipt_text:
        m = re.search(
            r"Receipt Type\s+Receipt Amount([\s\S]+?)(?:TOTAL RECEIPT|Total Receipt|$)",
            text,
            re.I,
        )
        if m:
            receipt_text = m.group(1)

    depts = {}
    src_dept = cstore_text if cstore_text else text
    for line in src_dept.splitlines():
        m = re.match(r"^(.+?)\s+([\d,.]+)\s+\$([\d,.]+)\s+([\-\d.]+)%\s+", line.strip())
        if not m:
            continue
        name = m.group(1).strip()
        if name in ("Department",) or "Station Total" in name or "Fuel Grade" in name:
            continue
        depts[name] = money(m.group(3))

    lottery = 0.0
    lotto_rcpt = 0.0
    for line in (receipt_text or "").splitlines():
        m = re.match(r"^LOTTERY\s+\$([\d,.]+)\s*$", line.strip(), re.I)
        if m:
            lottery = money(m.group(1)) or 0.0
        m = re.match(r"^LOTTO\s+\$([\d,.]+)\s*$", line.strip(), re.I)
        if m:
            lotto_rcpt = money(m.group(1)) or 0.0
    return {
        "depts": depts,
        "lottery": lottery,
        "lotto_rcpt": lotto_rcpt,
        "has_receipt_section": bool((receipt_text or "").strip()),
    }


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


def empty(v):
    return v is None or (isinstance(v, str) and not str(v).strip())


def find_lottery_hdr(ws):
    for r in range(140, 200):
        for c in range(1, 9):
            v = ws.cell(r, c).value
            if isinstance(v, str) and "Receipt LOTTERY" in v:
                return r
    return None


def find_dept_table(ws):
    for r in range(40, 100):
        a = ws.cell(r, 1).value
        if isinstance(a, str) and "Top" in a and "Department" in a:
            return r
    return None


def pick_sheet(wb, year: int, month: int) -> str:
    sn = f"{MONTH_NAMES[month]} {year}"
    if sn in wb.sheetnames:
        return sn
    label = MONTH_NAMES[month]
    for s in wb.sheetnames:
        if s.startswith(label) and "Source" not in s and "Calc" not in s:
            return s
    raise RuntimeError(f"no {label} sheet in {wb.sheetnames}")


def parse_args():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--through",
        help="Fill through this date (YYYY-MM-DD). Default: yesterday PT.",
    )
    p.add_argument(
        "--store",
        action="append",
        dest="stores",
        help="Limit to store id(s), e.g. 42179. Repeatable.",
    )
    p.add_argument(
        "--force-lottery",
        action="store_true",
        help="Overwrite Receipt LOTTERY/LOTTO when PDF differs (default: blanks only).",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Save locally but do not upload.",
    )
    return p.parse_args()


def main():
    global COOKIE
    args = parse_args()
    if args.through:
        through_date = date.fromisoformat(args.through)
    else:
        through_date = datetime.now(PT).date() - timedelta(days=1)
    year, month, through = through_date.year, through_date.month, through_date.day

    PDF_CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    COOKIE = cookie_header()
    print(f"secondary fill through {through_date.isoformat()} (days 1..{through})")

    stores = STORE_META
    if GAPS_PATH.exists():
        gaps = json.loads(GAPS_PATH.read_text())
        # Prefer gaps metadata for folder/name when present
        for sid, meta in gaps.items():
            if sid in stores:
                stores[sid] = {**stores[sid], **{k: meta[k] for k in ("folder", "name") if k in meta}}
    if args.stores:
        want = set(args.stores)
        stores = {sid: cfg for sid, cfg in stores.items() if sid in want}
        missing = want - set(stores)
        if missing:
            print(f"unknown --store ids: {sorted(missing)}")

    report = {}
    for sid, cfg in stores.items():
        print(f"\n=== {sid} {cfg['name']} ===")
        server_rel = f"{ROOT}/Clients/{cfg['folder']}/{cfg['name']}"
        try:
            raw = download_bytes(server_rel)
        except Exception as e:
            report[sid] = {"file": cfg["name"], "error": str(e)}
            print(f"  FAIL download: {e}")
            continue
        fd, path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        Path(path).write_bytes(raw)
        wb = load_workbook(path)
        try:
            sn = pick_sheet(wb, year, month)
        except RuntimeError as e:
            report[sid] = {"file": cfg["name"], "error": str(e)}
            print(f"  {e}")
            wb.close()
            os.unlink(path)
            continue
        ws = wb[sn]
        changes = []
        source_sheets = [
            s for s in wb.sheetnames if MONTH_NAMES[month] in s and "Source" in s
        ]
        lot_hdr = find_lottery_hdr(ws)
        dept_title = find_dept_table(ws)

        for day in range(1, through + 1):
            pdf = ensure_pdf(cfg, year, month, day)
            if not pdf:
                continue
            parsed = parse_pdf(pdf, cfg["tso"])

            if lot_hdr:
                r = lot_hdr + day
                main_r = 8 + day
                # Scratchers/Lotto sales from main M/N when blank (or static leftovers).
                for col, letter in ((2, "M"), (3, "N")):
                    cur = ws.cell(r, col).value
                    want = f"={letter}{main_r}"
                    if empty(cur) or (
                        isinstance(cur, (int, float))
                        and not empty(ws.cell(main_r, 13 if letter == "M" else 14).value)
                    ):
                        if empty(cur) or isinstance(cur, (int, float)):
                            ws.cell(r, col).value = want
                            changes.append(f"{sn}!{chr(64+col)}{r}={want}")
                for col, formula in (
                    (4, f"=B{r}+C{r}"),
                    (7, f"=E{r}+F{r}"),
                    (8, f"=D{r}-G{r}"),
                ):
                    if empty(ws.cell(r, col).value):
                        ws.cell(r, col).value = formula
                        changes.append(f"{sn}!{chr(64+col)}{r}={formula}")

                if parsed["has_receipt_section"]:
                    for col, key, label in (
                        (5, "lottery", "E"),
                        (6, "lotto_rcpt", "F"),
                    ):
                        new_v = parsed[key]
                        cur = ws.cell(r, col).value
                        if empty(cur) or (
                            args.force_lottery
                            and isinstance(cur, (int, float))
                            and float(cur) != float(new_v)
                        ):
                            ws.cell(r, col).value = new_v
                            changes.append(f"{sn}!{label}{r}={new_v}")
                else:
                    if not empty(ws.cell(main_r, 2).value) and empty(ws.cell(r, 5).value):
                        ws.cell(r, 5).value = 0
                        ws.cell(r, 6).value = 0
                        changes.append(f"{sn}!E{r}/F{r}=0 (no receipt lines)")

            if dept_title:
                hdr_r = dept_title + 1
                data_r = dept_title + 1 + day
                headers, cols = [], []
                for c in range(2, 15):
                    h = ws.cell(hdr_r, c).value
                    if isinstance(h, str) and h.strip() and not h.startswith("="):
                        if re.search(
                            r"metric|receipt amount|difference|sales amount \(receipt",
                            h,
                            re.I,
                        ):
                            continue
                        headers.append(h)
                        cols.append(c)
                existing = [ws.cell(data_r, c).value for c in cols]
                if cols and all(empty(v) for v in existing) and parsed["depts"]:
                    matched = match_dept(headers, parsed["depts"])
                    for h, c in zip(headers, cols):
                        if h in matched:
                            ws.cell(data_r, c).value = matched[h]
                    changes.append(
                        f"{sn}!dept day{day} filled {len(matched)}/{len(headers)}"
                    )

            for ssn in source_sheets:
                sw = wb[ssn]
                for r in range(1, min(80, (sw.max_row or 1) + 1)):
                    vals = [sw.cell(r, c).value for c in range(1, 12)]
                    if vals[0] == "Date" and any(
                        isinstance(v, str)
                        and re.search(r"BEER|SCRATCH|CIGARETTE", str(v))
                        for v in vals
                    ):
                        target = r + day
                        headers, cols = [], []
                        for c in range(2, 12):
                            h = sw.cell(r, c).value
                            if isinstance(h, str) and h.strip():
                                headers.append(h)
                                cols.append(c)
                        existing = [sw.cell(target, c).value for c in cols]
                        if cols and all(empty(v) for v in existing) and parsed["depts"]:
                            matched = match_dept(headers, parsed["depts"])
                            for h, c in zip(headers, cols):
                                if h in matched:
                                    sw.cell(target, c).value = matched[h]
                            changes.append(f"{ssn}!dept day{day}")
                        break

        changes = list(dict.fromkeys(changes))
        report[sid] = {"file": cfg["name"], "changes": changes, "upload": None}
        print(f"  changes: {len(changes)}")
        for c in changes[:15]:
            print("   ", c)
        if changes:
            out = OUT / f"{sid}_filled.xlsx"
            wb.save(out)
            if args.dry_run:
                report[sid]["upload"] = "dry_run"
                print("  DRY-RUN saved locally")
            else:
                ok = upload_bytes(server_rel, out.read_bytes())
                report[sid]["upload"] = ok
                print("  UPLOADED" if ok else "  UPLOAD FAILED")
        wb.close()
        os.unlink(path)

    payload = {"through": through_date.isoformat(), "report": report}
    RESULT.write_text(json.dumps(payload, indent=2))
    print("\nSUMMARY")
    for k, v in report.items():
        n = len(v.get("changes") or [])
        print(k, n, v.get("upload"), v.get("error", ""))


if __name__ == "__main__":
    main()
