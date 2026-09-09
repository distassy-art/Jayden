#!/usr/bin/env python3
"""Daily 8pm PT: OCR-rename scanned invoices on Mina OneDrive; optionally probe client drives.

Destination (Mina OD):
  Clients/.../Scans/YYYY-MM Month/

Rename convention (matches existing Scans warehouse):
  Vendor DDMM.ext   e.g. Coke 0809.pdf = Sep 8
  (day then month — same as Coca Cola 0409.pdf already in Scans)

Usage:
  python3 scripts/pull_scanned_invoices.py
  python3 scripts/pull_scanned_invoices.py --pull-clients
  python3 scripts/pull_scanned_invoices.py --only "Arco Db" --dry-run

Env / files:
  OD_COOKIES=/tmp/od_cookies.json
  CLIENT_LOGINS=/tmp/s2k/creds/Client-logins.xlsx
  scripts/invoice_scan_clients.json
"""
from __future__ import annotations

import argparse
import json
import os
import re
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    import openpyxl
except ImportError:
    openpyxl = None

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "scripts" / "invoice_scan_clients.json"
COOKIES_PATH = Path(os.environ.get("OD_COOKIES", "/tmp/od_cookies.json"))
CREDS_XLSX = Path(os.environ.get("CLIENT_LOGINS", "/tmp/s2k/creds/Client-logins.xlsx"))
HOST = "https://smartsolutionsai26-my.sharepoint.com"
BASE = HOST + "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com"
DOCS = "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents"
PT = ZoneInfo("America/Los_Angeles")
SSL_CTX = ssl.create_default_context()

SCAN_NAME_RE = re.compile(r"^Scan(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})", re.I)


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def cookie_header() -> str:
    cookies = json.loads(COOKIES_PATH.read_text())
    return "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if "sharepoint.com" in c.get("domain", "")
    )


def req(
    url: str,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict | None = None,
    timeout: int = 180,
):
    h = {
        "Cookie": cookie_header(),
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


def digest() -> str:
    code, body = req(BASE + "/_api/contextinfo", method="POST", data=b"")
    if code != 200:
        raise RuntimeError(f"digest {code} {body[:200]}")
    return json.loads(body)["d"]["GetContextWebInformation"]["FormDigestValue"]


def month_folder_name(dt: datetime | None = None) -> str:
    dt = dt or datetime.now(PT)
    return f"{dt.year:04d}-{dt.month:02d} {dt.strftime('%B')}"


def scans_folder_rel(client_dest: str, month: str | None = None, layout: str = "scans_then_month") -> str:
    month = month or month_folder_name()
    if layout == "month_then_scans":
        return f"{DOCS}/{client_dest}/{month}/Scans"
    return f"{DOCS}/{client_dest}/Scans/{month}"


def list_files(folder_rel: str) -> list[dict]:
    url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(folder_rel, safe='/')}')"
        + "/Files?$select=Name,ServerRelativeUrl,Length,TimeLastModified&$top=500"
    )
    code, body = req(url)
    if code == 404:
        return []
    if code != 200:
        raise RuntimeError(f"list {code} {folder_rel} {body[:200]}")
    return json.loads(body)["d"]["results"]


def ensure_folder(folder_rel: str) -> None:
    if not folder_rel.startswith(DOCS):
        raise ValueError(folder_rel)
    parts = folder_rel[len(DOCS) :].strip("/").split("/")
    cur = DOCS
    dig = digest()
    for part in parts:
        parent = cur
        cur = f"{cur}/{part}"
        code, _ = req(
            BASE
            + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(cur, safe='/')}')"
            + "?$select=Name"
        )
        if code == 200:
            continue
        add = (
            BASE
            + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(parent, safe='/')}')"
            + "/Folders/add('"
            + urllib.parse.quote(part)
            + "')"
        )
        code, body = req(add, method="POST", data=b"", headers={"X-RequestDigest": dig})
        if code not in (200, 201):
            code2, _ = req(
                BASE
                + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(cur, safe='/')}')"
                + "?$select=Name"
            )
            if code2 != 200:
                raise RuntimeError(f"mkdir {cur} {code} {body[:200]}")


def download_bytes(server_rel: str) -> bytes:
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel, safe='/')}')/$value"
    )
    code, body = req(url, timeout=300)
    if code != 200:
        raise RuntimeError(f"download {code} {server_rel} {body[:160]}")
    return body


def upload_bytes(folder_rel: str, name: str, data: bytes) -> None:
    ensure_folder(folder_rel)
    dig = digest()
    url = (
        BASE
        + f"/_api/web/GetFolderByServerRelativeUrl('{urllib.parse.quote(folder_rel, safe='/')}')"
        + f"/Files/add(url='{urllib.parse.quote(name)}',overwrite=true)"
    )
    code, body = req(
        url,
        method="POST",
        data=data,
        headers={"X-RequestDigest": dig, "Content-Type": "application/octet-stream"},
        timeout=300,
    )
    if code not in (200, 201):
        raise RuntimeError(f"upload {code} {folder_rel}/{name} {body[:200]}")


def move_rename(server_rel: str, new_rel: str) -> None:
    dig = digest()
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel, safe='/')}')"
        + f"/moveto(newurl='{urllib.parse.quote(new_rel, safe='/')}',flags=1)"
    )
    code, body = req(url, method="POST", data=b"", headers={"X-RequestDigest": dig})
    if code not in (200, 204):
        raise RuntimeError(f"move {code} {server_rel} -> {new_rel} {body[:200]}")


def load_passwords() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not CREDS_XLSX.exists() or openpyxl is None:
        return out
    wb = openpyxl.load_workbook(CREDS_XLSX, data_only=True)
    sheet = "Client logins" if "Client logins" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet]
    for row in ws.iter_rows(min_row=2, values_only=True):
        vals = list(row) + [None] * 4
        name, user, pw = vals[0], vals[1], vals[2]
        if not name or not user:
            continue
        out[str(name).strip()] = {
            "username": str(user).strip(),
            "password": str(pw).strip() if pw else "",
        }
    return out


def ocr_pdf(path: Path, max_pages: int = 2) -> str:
    with tempfile.TemporaryDirectory() as td:
        prefix = Path(td) / "p"
        subprocess.run(
            [
                "pdftoppm",
                "-png",
                "-r",
                "200",
                "-f",
                "1",
                "-l",
                str(max_pages),
                str(path),
                str(prefix),
            ],
            check=False,
            capture_output=True,
        )
        texts = []
        for img in sorted(Path(td).glob("p*.png")):
            r = subprocess.run(
                ["tesseract", str(img), "stdout", "--psm", "6"],
                capture_output=True,
                text=True,
            )
            texts.append(r.stdout or "")
        return "\n".join(texts)


def ocr_image(path: Path) -> str:
    r = subprocess.run(
        ["tesseract", str(path), "stdout", "--psm", "6"],
        capture_output=True,
        text=True,
    )
    return r.stdout or ""


def detect_vendor(text: str, fname: str, aliases: dict[str, str]) -> str | None:
    blob = (fname + "\n" + text).lower()
    for key, vendor in sorted(aliases.items(), key=lambda kv: -len(kv[0])):
        if key.lower() in blob:
            return vendor
    skip = (
        "invoice",
        "total",
        "page",
        "date",
        "phone",
        "www",
        "http",
        "sold to",
        "ship to",
        "bill to",
        "qty",
        "amount",
        "subtotal",
        "customer",
        "account",
        "delivery",
        "order",
        "receipt",
        "thank",
        "store",
        "arco",
        "ampm",
    )
    for line in text.splitlines():
        L = line.strip()
        if not (4 <= len(L) <= 40):
            continue
        low = L.lower()
        if any(s in low for s in skip):
            continue
        if re.search(r"\d{3}[-.]?\d{3}", L):
            continue
        if sum(c.isalpha() for c in L) < 3:
            continue
        cand = re.sub(r"[^A-Za-z0-9 &/-]+", "", L).strip(" -/")
        if 3 <= len(cand) <= 30:
            return cand.title()
    return None



def parse_invoice_date(text: str) -> date | None:
    months = {
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
        "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    }
    patterns = [
        r"(?:invoice\s*date|delivery\s*date|date)\s*[:\s]*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})",
        r"\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b",
        r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b",
        r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.I)
        if not m:
            continue
        g = m.groups()
        try:
            if g[1].isalpha():
                d, mon, y = int(g[0]), months[g[1][:3].lower()], int(g[2])
            elif g[0].isalpha():
                mon, d, y = months[g[0][:3].lower()], int(g[1]), int(g[2])
            else:
                a, b, y = int(g[0]), int(g[1]), int(g[2])
                if y < 100:
                    y += 2000
                mon, d = (b, a) if a > 12 else (a, b)
            return date(y, mon, d)
        except Exception:
            continue
    return None

def date_ddmm_from_scan_name(fname: str) -> str | None:
    m = SCAN_NAME_RE.match(fname)
    if not m:
        return None
    return f"{m.group('d')}{m.group('m')}"


def unique_target_name(folder_files: set[str], vendor: str, ddmm: str, ext: str) -> str:
    base = f"{vendor} {ddmm}{ext}"
    if base not in folder_files:
        return base
    n = 2
    while True:
        cand = f"{vendor} {ddmm}-{n}{ext}"
        if cand not in folder_files:
            return cand
        n += 1


def is_raw_scan(name: str) -> bool:
    return bool(SCAN_NAME_RE.match(name)) and name.lower().endswith(
        (".pdf", ".jpg", ".jpeg", ".png")
    )


def ocr_rename_client(
    client: dict,
    aliases: dict[str, str],
    dry_run: bool = False,
    month: str | None = None,
) -> list[dict]:
    dest = client["dest"]
    folder = scans_folder_rel(dest, month, layout=client.get("scans_layout", "scans_then_month"))
    results: list[dict] = []
    try:
        files = list_files(folder)
    except Exception as e:
        return [{"client": client["name"], "error": f"list failed: {e}", "folder": folder}]

    names = {f["Name"] for f in files}
    scans = [f for f in files if is_raw_scan(f["Name"])]
    if not scans:
        return [{"client": client["name"], "status": "no_raw_scans", "folder": folder}]

    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        for f in scans:
            name = f["Name"]
            rel = f["ServerRelativeUrl"]
            local = td_path / name
            entry: dict = {"client": client["name"], "from": name, "folder": folder}
            try:
                local.write_bytes(download_bytes(rel))
                text = ocr_pdf(local) if local.suffix.lower() == ".pdf" else ocr_image(local)
                vendor = detect_vendor(text, name, aliases) or "Unknown"
                inv_dt = parse_invoice_date(text)
                if inv_dt:
                    ddmm = f"{inv_dt.day:02d}{inv_dt.month:02d}"
                else:
                    ddmm = date_ddmm_from_scan_name(name) or datetime.now(PT).strftime("%d%m")
                ext = local.suffix.lower()
                if ext == ".jpeg":
                    ext = ".jpg"
                new_name = unique_target_name(names, vendor, ddmm, ext)
                new_rel = f"{folder}/{new_name}"
                entry.update(
                    {
                        "vendor": vendor,
                        "to": new_name,
                        "ocr_sample": " ".join(text.split())[:240],
                    }
                )
                if dry_run:
                    entry["status"] = "dry_run"
                else:
                    move_rename(rel, new_rel)
                    names.add(new_name)
                    names.discard(name)
                    entry["status"] = "renamed"
            except Exception as e:
                entry["status"] = "error"
                entry["error"] = str(e)[:300]
            results.append(entry)
            print(json.dumps(entry, ensure_ascii=False))
    return results


def pull_client_onedrive_outlook(client: dict, password: str, dry_run: bool = False) -> dict:
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.support.ui import WebDriverWait
    except ImportError:
        return {"client": client["name"], "status": "skip", "reason": "selenium missing"}

    user = client.get("username")
    if not user or not password:
        return {"client": client["name"], "status": "skip", "reason": "no credentials"}

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1400,900")
    driver = webdriver.Chrome(options=opts)
    wait = WebDriverWait(driver, 25)
    out: dict = {"client": client["name"], "username": user, "errors": []}
    try:
        driver.get("https://login.live.com/")
        wait.until(EC.presence_of_element_located((By.NAME, "loginfmt"))).send_keys(user)
        driver.find_element(By.ID, "idSIButton9").click()
        time.sleep(1.5)
        pw_el = wait.until(EC.presence_of_element_located((By.NAME, "passwd")))
        pw_el.clear()
        pw_el.send_keys(password)
        driver.find_element(By.ID, "idSIButton9").click()
        time.sleep(3)
        page = driver.page_source.lower()
        if any(x in page for x in ("approve", "identity", "two-step", "authenticator", "verify")):
            out["status"] = "mfa_blocked"
            out["url"] = driver.current_url
            return out
        try:
            driver.find_element(By.ID, "idSIButton9").click()
            time.sleep(2)
        except Exception:
            pass
        driver.get("https://onedrive.live.com/?v=files")
        time.sleep(5)
        if "login" in driver.current_url and "onedrive" not in driver.current_url:
            out["status"] = "login_failed"
            out["url"] = driver.current_url
            return out
        out["status"] = "session_ok_share_required"
        out["url"] = driver.current_url
        out["note"] = (
            "Prefer sharing each station Scans folder with Mina; unattended crawl is unreliable."
        )
        if dry_run:
            out["status"] = "dry_run_session"
    except Exception as e:
        out["status"] = "error"
        out["errors"].append(str(e)[:400])
    finally:
        try:
            driver.quit()
        except Exception:
            pass
    return out


def pull_client_google(client: dict, password: str, dry_run: bool = False) -> dict:
    user = client.get("username")
    if not user or not password:
        return {"client": client["name"], "status": "skip", "reason": "no credentials"}
    return {
        "client": client["name"],
        "status": "google_requires_interactive",
        "username": user,
        "note": (
            "Google blocks headless password login. Share the station Drive Scans folder "
            "with Mina, or use an App Password + Drive API."
        ),
    }


def run(pull_clients: bool, dry_run: bool, only: str | None, month: str | None) -> int:
    cfg = load_config()
    aliases = {k.lower(): v for k, v in (cfg.get("vendor_aliases") or {}).items()}
    passwords = load_passwords()
    clients = list(cfg.get("clients") or [])
    if only:
        clients = [
            c
            for c in clients
            if only.lower() in c["name"].lower() or only == str(c.get("station") or "")
        ]

    report = {
        "started": datetime.now(PT).isoformat(),
        "month": month or month_folder_name(),
        "ocr": [],
        "pull": [],
    }

    for client in clients:
        report["ocr"].extend(
            ocr_rename_client(client, aliases, dry_run=dry_run, month=month)
        )

    if pull_clients:
        for client in clients:
            key = client.get("password_key") or client["name"]
            cred = passwords.get(key) or passwords.get(client["name"]) or {}
            pw = cred.get("password", "")
            drive = (client.get("drive") or "onedrive").lower()
            if drive == "google":
                result = pull_client_google(client, pw, dry_run=dry_run)
            else:
                result = pull_client_onedrive_outlook(client, pw, dry_run=dry_run)
            report["pull"].append(result)
            print(json.dumps(result, ensure_ascii=False))

    out_path = Path("/tmp/invoice_scan_report.json")
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"Wrote {out_path}")
    renamed = sum(1 for r in report["ocr"] if r.get("status") == "renamed")
    errors = sum(1 for r in report["ocr"] if r.get("status") == "error")
    print(f"OCR renamed={renamed} errors={errors}")
    return 0 if errors == 0 else 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pull-clients", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="Filter client name or station id")
    ap.add_argument("--month", help='Override month folder, e.g. "2026-09 September"')
    ap.add_argument("--audit", action="store_true", help="After rename, stage Copilot audit pack and append Audit.xlsx")
    ap.add_argument("--as-of", help="Audit as-of YYYY-MM-DD (default: today PT)")
    args = ap.parse_args()
    rc = run(
            pull_clients=args.pull_clients,
            dry_run=args.dry_run,
            only=args.only,
            month=args.month,
        )
    if args.audit and not args.dry_run:
        import subprocess
        cmd = [sys.executable, str(ROOT / "scripts" / "run_invoice_copilot_audit.py")]
        if args.only:
            cmd += ["--only", args.only]
        if args.month:
            cmd += ["--month", args.month]
        if args.as_of:
            cmd += ["--as-of", args.as_of]
        print("Running Copilot audit staging:", " ".join(cmd))
        rc2 = subprocess.call(cmd)
        rc = rc or rc2
    sys.exit(rc)


if __name__ == "__main__":
    main()
