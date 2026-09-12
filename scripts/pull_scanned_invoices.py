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
    (authoritative source for ALL client OneDrive/Google usernames + passwords)
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
    """Rename/move a file. Prefer moveto; fall back to copy-upload + delete."""
    dig = digest()
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel, safe='/')}')"
        + f"/moveto(newurl='{urllib.parse.quote(new_rel, safe='/')}',flags=1)"
    )
    code, body = req(url, method="POST", data=b"", headers={"X-RequestDigest": dig})
    if code in (200, 204):
        return
    # Fallback: download → upload as new name → delete original (handles locked/odd paths)
    data = download_bytes(server_rel)
    folder, name = new_rel.rsplit("/", 1)
    upload_bytes(folder, name, data)
    dig = digest()
    del_url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel, safe='/')}')"
    )
    code2, body2 = req(
        del_url,
        method="POST",
        data=b"",
        headers={
            "X-RequestDigest": dig,
            "IF-MATCH": "*",
            "X-HTTP-Method": "DELETE",
        },
    )
    if code2 not in (200, 204):
        raise RuntimeError(
            f"move failed {code} then delete {code2}: {server_rel} -> {new_rel} "
            f"{body[:120]} | {body2[:120]}"
        )


def load_client_logins() -> dict[str, dict]:
    """Load ALL OneDrive/Google usernames+passwords from Client-logins.xlsx.

    Sheet \"Client logins\" columns: Client name | Username | Password | Station
    Indexed by client name, station id, and username (lowercase).
    """
    by_key: dict[str, dict] = {}
    if not CREDS_XLSX.exists() or openpyxl is None:
        return by_key
    wb = openpyxl.load_workbook(CREDS_XLSX, data_only=True)
    sheet = "Client logins" if "Client logins" in wb.sheetnames else wb.sheetnames[0]
    ws = wb[sheet]
    for row in ws.iter_rows(min_row=2, values_only=True):
        vals = list(row) + [None] * 4
        name, user, pw, station = vals[0], vals[1], vals[2], vals[3]
        if not name or not user:
            continue
        entry = {
            "client_name": str(name).strip(),
            "username": str(user).strip(),
            "password": str(pw).strip() if pw else "",
            "station": str(station).strip() if station not in (None, "") else "",
        }
        # Skip S2K meta accounts used for reporting tools, not station drives
        low = entry["client_name"].lower()
        if low.startswith("s2k "):
            continue
        by_key[entry["client_name"]] = entry
        by_key[entry["client_name"].lower()] = entry
        if entry["station"]:
            by_key[entry["station"]] = entry
        by_key[entry["username"].lower()] = entry
    return by_key


def load_passwords() -> dict[str, dict]:
    """Backward-compatible wrapper around load_client_logins()."""
    return load_client_logins()


def resolve_client_credentials(client: dict, logins: dict[str, dict]) -> dict:
    """Merge Client-logins.xlsx into a client row (xlsx wins for user/password)."""
    keys = [
        client.get("password_key"),
        client.get("name"),
        str(client.get("station") or ""),
        (client.get("username") or "").lower(),
    ]
    cred = {}
    for k in keys:
        if not k:
            continue
        cred = logins.get(str(k)) or logins.get(str(k).lower()) or {}
        if cred:
            break
    merged = dict(client)
    if cred:
        merged["username"] = cred.get("username") or merged.get("username")
        merged["_password"] = cred.get("password") or ""
        merged["_cred_source"] = "Client-logins.xlsx"
        merged["_cred_name"] = cred.get("client_name")
    else:
        merged["_password"] = ""
        merged["_cred_source"] = None
    return merged


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
        "office",
        "emailed copy",
        "original",
        "articles",
        "notice",
        "remittance",
        "bill of lading",
        "loading ticket",
        "rma",
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


def _ms_find_username_field(driver, wait):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC

    # New Microsoft login UI uses #usernameEntry; classic uses name=loginfmt
    for by, sel in (
        (By.ID, "usernameEntry"),
        (By.NAME, "loginfmt"),
        (By.CSS_SELECTOR, "input[type='email']"),
        (By.CSS_SELECTOR, "input[name='loginfmt']"),
    ):
        try:
            return wait.until(EC.presence_of_element_located((by, sel)))
        except Exception:
            continue
    raise RuntimeError("username field not found")


def _ms_find_password_field(driver, wait):
    from selenium.webdriver.common.by import By
    from selenium.webdriver.support import expected_conditions as EC

    for by, sel in (
        (By.NAME, "passwd"),
        (By.ID, "passwordEntry"),
        (By.CSS_SELECTOR, "input[type='password']"),
    ):
        try:
            return wait.until(EC.presence_of_element_located((by, sel)))
        except Exception:
            continue
    raise RuntimeError("password field not found")


def _ms_click_next(driver):
    from selenium.webdriver.common.by import By

    for sel in (
        (By.ID, "idSIButton9"),
        (By.CSS_SELECTOR, "input[type='submit']"),
        (By.CSS_SELECTOR, "button[type='submit']"),
        (By.CSS_SELECTOR, "button[data-testid='primaryButton']"),
    ):
        try:
            el = driver.find_element(*sel)
            if el.is_displayed():
                el.click()
                return True
        except Exception:
            continue
    return False


def _ms_page_blocked(page: str, url: str) -> str | None:
    p = (page or "").lower()
    u = (url or "").lower()
    if "proof-confirmation" in p or "proof-confirmation-email" in p:
        return "proof_blocked"
    if any(
        x in p
        for x in (
            "help us protect your account",
            "verify your identity",
            "approve sign in",
            "authenticator",
            "enter code",
            "two-step",
            "two step",
            "security code",
        )
    ):
        return "mfa_blocked"
    if "account.live.com/identity" in u or "account.live.com/proofs" in u:
        return "proof_blocked"
    return None


def pull_client_onedrive_outlook(client: dict, password: str, dry_run: bool = False) -> dict:
    """Sign into client personal OneDrive using Client-logins username/password."""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
    except ImportError:
        return {"client": client["name"], "status": "skip", "reason": "selenium missing"}

    user = client.get("username")
    if not user or not password:
        return {
            "client": client["name"],
            "status": "skip",
            "reason": "no credentials in Client-logins.xlsx",
        }

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1400,900")
    opts.add_argument(
        "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=opts)
    from selenium.webdriver.support.ui import WebDriverWait

    wait = WebDriverWait(driver, 30)
    cookie_dir = Path("/tmp/s2k/client_od_cookies")
    cookie_dir.mkdir(parents=True, exist_ok=True)
    cookie_file = cookie_dir / f"{re.sub(r'[^a-zA-Z0-9]+', '_', user.lower())}.json"
    out: dict = {
        "client": client["name"],
        "username": user,
        "cred_source": client.get("_cred_source") or "Client-logins.xlsx",
        "errors": [],
    }
    try:
        driver.get("https://login.live.com/")
        time.sleep(1.5)
        user_el = _ms_find_username_field(driver, wait)
        user_el.clear()
        user_el.send_keys(user)
        _ms_click_next(driver)
        time.sleep(2.5)

        blocked = _ms_page_blocked(driver.page_source, driver.current_url)
        if blocked:
            out["status"] = blocked
            out["url"] = driver.current_url
            out["drive"] = "onedrive"
            out["note"] = (
                "Microsoft identity proof/MFA blocked unattended Outlook OneDrive login. "
                "Share station Scans with MinaMorcos@Smartsolutionsai26, "
                "or complete one interactive sign-in and save cookies. "
                "(Placentia + Westminster are Google Drive — use Drive share instead.)"
            )
            return out

        try:
            pw_el = _ms_find_password_field(driver, wait)
        except Exception:
            blocked = _ms_page_blocked(driver.page_source, driver.current_url)
            out["status"] = blocked or "login_failed_no_password_field"
            out["url"] = driver.current_url
            out["note"] = "Password step not reached; check Client-logins username or MFA."
            return out

        pw_el.clear()
        pw_el.send_keys(password)
        _ms_click_next(driver)
        time.sleep(3.5)

        blocked = _ms_page_blocked(driver.page_source, driver.current_url)
        if blocked:
            out["status"] = blocked
            out["url"] = driver.current_url
            return out

        # Stay signed in?
        try:
            _ms_click_next(driver)
            time.sleep(2)
        except Exception:
            pass

        driver.get("https://onedrive.live.com/?v=files")
        time.sleep(6)
        url = driver.current_url
        if "login" in url.lower() and "onedrive" not in url.lower():
            out["status"] = "login_failed"
            out["url"] = url
            return out

        # Persist cookies for reuse (avoids some MFA prompts on next run)
        try:
            cookie_file.write_text(json.dumps(driver.get_cookies(), indent=2))
            out["cookies_saved"] = str(cookie_file)
        except Exception as e:
            out["errors"].append(f"cookie_save: {e}")

        out["status"] = "session_ok"
        out["url"] = url
        out["note"] = (
            "Logged in with Client-logins.xlsx. Prefer sharing each station Scans "
            "folder with Mina for reliable unattended copy; headless file crawl is best-effort."
        )
        if dry_run:
            out["status"] = "dry_run_session"
    except Exception as e:
        out["status"] = "error"
        out["errors"].append(str(e)[:400])
        try:
            out["url"] = driver.current_url
        except Exception:
            pass
    finally:
        try:
            driver.quit()
        except Exception:
            pass
    return out


def pull_client_google(client: dict, password: str, dry_run: bool = False) -> dict:
    """Placentia + Westminster use Google Drive (not OneDrive).

    Headless Google password login is blocked (WebLite / bot challenges).
    Unattended path: share the station Drive Scans folder with
    MinaMorcos@Smartsolutionsai26, then copy via Drive API / shared link.
    """
    user = client.get("username")
    if not user or not password:
        return {
            "client": client["name"],
            "status": "skip",
            "drive": "google",
            "reason": "no credentials in Client-logins.xlsx",
        }
    return {
        "client": client["name"],
        "status": "google_share_required",
        "drive": "google",
        "username": user,
        "cred_source": client.get("_cred_source") or "Client-logins.xlsx",
        "note": (
            "Placentia/Westminster are Google Drive. Google blocks headless password login. "
            "Share the station Drive Scans folder with MinaMorcos@Smartsolutionsai26 "
            "(Viewer+download), or provide a Google App Password for Drive API. "
            "Password is already loaded from Client-logins."
        ),
    }


def run(pull_clients: bool, dry_run: bool, only: str | None, month: str | None) -> int:
    cfg = load_config()
    aliases = {k.lower(): v for k, v in (cfg.get("vendor_aliases") or {}).items()}
    logins = load_client_logins()
    clients = [
        resolve_client_credentials(c, logins) for c in (cfg.get("clients") or [])
    ]
    if only:
        clients = [
            c
            for c in clients
            if only.lower() in c["name"].lower() or only == str(c.get("station") or "")
        ]

    report = {
        "started": datetime.now(PT).isoformat(),
        "month": month or month_folder_name(),
        "client_logins_path": str(CREDS_XLSX),
        "client_logins_loaded": len({v["client_name"] for v in logins.values() if "client_name" in v}),
        "ocr": [],
        "pull": [],
    }

    for client in clients:
        report["ocr"].extend(
            ocr_rename_client(client, aliases, dry_run=dry_run, month=month)
        )

    if pull_clients:
        for client in clients:
            pw = client.get("_password") or ""
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
    if pull_clients:
        for p in report["pull"]:
            print(f"  pull {p.get('client')}: {p.get('status')} ({p.get('username')})")
    return 0 if errors == 0 else 1


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--pull-clients", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="Filter client name or station id")
    ap.add_argument("--month", help='Override month folder, e.g. "2026-09 September"')
    ap.add_argument("--audit", action="store_true", help="After rename, stage Copilot audit pack and append Audit.xlsx")
    ap.add_argument("--as-of", help="Audit as-of YYYY-MM-DD (default: today PT)")
    ap.add_argument(
        "--list-creds",
        action="store_true",
        help="Print Client-logins.xlsx mapping for each configured client (no passwords)",
    )
    args = ap.parse_args()
    if args.list_creds:
        cfg = load_config()
        logins = load_client_logins()
        print(f"Client-logins: {CREDS_XLSX} ({'ok' if CREDS_XLSX.exists() else 'MISSING'})")
        names = sorted({v["client_name"] for v in logins.values() if "client_name" in v})
        print(f"Rows loaded: {len(names)} -> {', '.join(names)}")
        for c in cfg.get("clients") or []:
            m = resolve_client_credentials(c, logins)
            print(
                f"  {m['name']:28} station={str(m.get('station') or '-'):6} "
                f"user={m.get('username') or '-':40} "
                f"pw={'yes' if m.get('_password') else 'NO':3} "
                f"src={m.get('_cred_name') or 'MISSING'}"
            )
        sys.exit(0)
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
