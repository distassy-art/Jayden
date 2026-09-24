#!/usr/bin/env python3
"""Pull SoftSP (S2K) reports into OneDrive client folders.

Phase 0 (Excel → site SoT):
  - daily = DailyTotal+Summary ShowCost=1  (accumulate MMDDYYYY.pdf)
  - dly   = None Fuel Invoice Total Toggle=1 Expand  (latest *dly.pdf)
  - dpt   = DailyAPInvoice GroupBy=1 Department      (latest *dpt.pdf)

Phases 1–4 (on demand / month-end) — see REPORTS registry + game plan:
  validate/  bos recon fuel_daily dept nonfuel_full
  fuel/      fuel_grade fuel_purch fuel_inv fuel_pnl
  monthend/  kpi period tax cstore_tax apaging vendor_status
  sku/       sku_detail dept_margin top_sku purch_vs_sales

Schedule: scripts/s2k_report_schedule.md
Game plan: scripts/s2k_reports_game_plan.md

Requires:
  - S2K logins from /tmp/s2k/creds/Client-logins.xlsx sheet ``s2k``
  - SharePoint cookies at /tmp/od_cookies.json (FedAuth) for upload + recycle

Usage:
  python3 scripts/fill_daily_dly_dpt.py --show
  python3 scripts/fill_daily_dly_dpt.py --show --phase 0
  python3 scripts/fill_daily_dly_dpt.py --mode daily
  python3 scripts/fill_daily_dly_dpt.py --kinds dly,dpt
  python3 scripts/fill_daily_dly_dpt.py --kinds bos,recon --through 2026-09-23
  python3 scripts/fill_daily_dly_dpt.py --phase 1 --dry-run
  python3 scripts/pull_s2k_reports.py --show   # thin alias
"""

from __future__ import annotations

import argparse
import calendar
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

import openpyxl
import requests

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
DOCS_CLIENTS = (
    "/personal/minamorcos_smartsolutionsai26_onmicrosoft_com/Documents/Clients"
)

OD_COOKIES = Path("/tmp/od_cookies.json")
CREDS_XLSX = Path("/tmp/s2k/creds/Client-logins.xlsx")
OUT_DIR = Path("/tmp/s2k/exports/dly_dpt_run")
RESULT_JSON = Path("/tmp/s2k/exports/dly_dpt_run_result.json")

# login_group -> (label substring match on s2k sheet, account overrides)
LOGIN_GROUPS = {
    "gmail": "Arco Db",
    "hotmail": "big daddy",
    "placentia": "Placentia",
}

# Static account/site map (paths built per target month)
STORE_DEFS = [
    # key, login_group, account_id, site_id, folder under Clients/ (with {month})
    (
        "42179_HB",
        "gmail",
        -218,
        "208",
        "42179 (Arco HB)/{month}/Daily Summary",
    ),
    (
        "42352_Db",
        "gmail",
        -325,
        "387",
        "42352 (Arco Db)/{month}/Daily Summary",
    ),
    (
        "42004_Pl",
        "placentia",
        -631,
        "933",
        "42004 (Arco Placentia)/{month}/Daily Summary",
    ),
    (
        "42674_Tu",
        "hotmail",
        -243,
        "247",
        "BIG DADDY/42674 (Tustin)/{month}/Daily Summary",
    ),
]

BD_CENTRAL_DEFS = {
    "daily": "BIG DADDY/PDF/daily/{month}",
    "dly": "BIG DADDY/PDF/dly/{month}",
    "dpt": "BIG DADDY/PDF/dpt/{month}",
    # Phases 1–4 land under PDF/{bucket}/{month}
    "validate": "BIG DADDY/PDF/validate/{month}",
    "fuel": "BIG DADDY/PDF/fuel/{month}",
    "monthend": "BIG DADDY/PDF/monthend/{month}",
    "sku": "BIG DADDY/PDF/sku/{month}",
}

# kind -> SoftSP pull config. phase 0 feeds Excel; 1–4 are on-demand PDF packs.
# date_scope: day = single day; mtd = month-start..through; month = full calendar month
# keep: accumulate = never delete peers; latest = delete older *suffix* in folder
REPORTS: dict[str, dict] = {
    # —— Phase 0 ——
    "daily": {
        "rpt": "DailyTotal+Summary",
        "extra": {"ShowCost": "1"},
        "phase": 0,
        "date_scope": "day",
        "keep": "accumulate",
        "suffix": "",
        "bucket": "daily",
        "name": "Daily Book Summary",
    },
    "dly": {
        "rpt": "None Fuel Invoice Total",
        "extra": {"Toggle": "1"},
        "phase": 0,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "dly",
        "bucket": "dly",
        "name": "Non-Fuel Invoice Summary (Expand)",
    },
    "dpt": {
        "rpt": "DailyAPInvoice",
        "extra": {"GroupBy": "1"},
        "phase": 0,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "dpt",
        "bucket": "dpt",
        "name": "Non-Fuel Invoices by Dept",
    },
    # —— Phase 1 validate ——
    "bos": {
        "rpt": "DailyBosSales",
        "extra": {},
        "phase": 1,
        "date_scope": "day",
        "keep": "accumulate",
        "suffix": "bos",
        "bucket": "validate",
        "name": "Daily BOS Sales and Receipts",
    },
    "recon": {
        "rpt": "DailyReconciliation",
        "extra": {},
        "phase": 1,
        "date_scope": "day",
        "keep": "accumulate",
        "suffix": "recon",
        "bucket": "validate",
        "name": "Daily Report (Reconciliation)",
    },
    "fuel_daily": {
        "rpt": "DailyTotal+Summary-Fuel",
        "extra": {},
        "phase": 1,
        "date_scope": "day",
        "keep": "accumulate",
        "suffix": "fuelday",
        "bucket": "validate",
        "name": "Daily Report-Fuel",
    },
    "dept": {
        "rpt": "Daily+Sales+Summary+By+Department",
        "extra": {},
        "phase": 1,
        "date_scope": "day",
        "keep": "accumulate",
        "suffix": "dept",
        "bucket": "validate",
        "name": "Daily Sales Summary By Department",
    },
    "nonfuel_full": {
        "rpt": "NonFuelInvoiceFull",
        "extra": {},
        "phase": 1,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "nffull",
        "bucket": "validate",
        "name": "Non-Fuel Invoice Full Detail",
    },
    # —— Phase 2 fuel ——
    "fuel_grade": {
        "rpt": "Fuel+Sales+By+Grade",
        "extra": {},
        "phase": 2,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "fgrade",
        "bucket": "fuel",
        "name": "Fuel Sales by Grade",
    },
    "fuel_purch": {
        "rpt": "FuelRecDetail",
        "extra": {},
        "phase": 2,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "fpurch",
        "bucket": "fuel",
        "name": "Fuel Purchase Invoices",
    },
    "fuel_inv": {
        "rpt": "Monthly+Fuel+Inventory+Detail",
        "extra": {},
        "phase": 2,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "finv",
        "bucket": "fuel",
        "name": "Fuel Inventory Daily",
    },
    "fuel_pnl": {
        "rpt": "Fuel+Profit+Analysis+Report",
        "extra": {},
        "phase": 2,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "fpnl",
        "bucket": "fuel",
        "name": "Fuel Profit Analysis",
    },
    # —— Phase 3 month-end ——
    "kpi": {
        "rpt": "KeyPerformIndicator",
        "extra": {},
        "phase": 3,
        "date_scope": "month",
        "keep": "latest",
        "suffix": "kpi",
        "bucket": "monthend",
        "name": "Key Performance Indicator",
    },
    "period": {
        "rpt": "Station+Period+Summary+Report",
        "extra": {},
        "phase": 3,
        "date_scope": "month",
        "keep": "latest",
        "suffix": "period",
        "bucket": "monthend",
        "name": "Station Period Summary",
    },
    "tax": {
        "rpt": "Sales+Tax+Summary+Report",
        "extra": {},
        "phase": 3,
        "date_scope": "month",
        "keep": "latest",
        "suffix": "tax",
        "bucket": "monthend",
        "name": "Sales Tax Summary",
    },
    "cstore_tax": {
        "rpt": "CStore+Sales+(Tax)",
        "extra": {},
        "phase": 3,
        "date_scope": "month",
        "keep": "latest",
        "suffix": "cstax",
        "bucket": "monthend",
        "name": "Tax Report on C-Store Sales",
    },
    "apaging": {
        "rpt": "apaging",
        "extra": {},
        "phase": 3,
        "date_scope": "month",
        "keep": "latest",
        "suffix": "apag",
        "bucket": "monthend",
        "name": "AP Aging",
    },
    "vendor_status": {
        "rpt": "vendoraccountstatus",
        "extra": {},
        "phase": 3,
        "date_scope": "month",
        "keep": "latest",
        "suffix": "vend",
        "bucket": "monthend",
        "name": "Vendor Account Status",
    },
    # —— Phase 4 SKU (on request) ——
    "sku_detail": {
        "rpt": "SKU+Detail",
        "extra": {},
        "phase": 4,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "sku",
        "bucket": "sku",
        "name": "SKU Sales Detail",
    },
    "dept_margin": {
        "rpt": "Department+Margin+Report",
        "extra": {},
        "phase": 4,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "dmargin",
        "bucket": "sku",
        "name": "SKU Sales Margin by Department",
    },
    "top_sku": {
        "rpt": "Top+SKU+Detail+By+Station",
        "extra": {},
        "phase": 4,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "topsku",
        "bucket": "sku",
        "name": "Best Selling SKU by Station",
    },
    "purch_vs_sales": {
        "rpt": "Purchase+Vs+Sales+Report",
        "extra": {},
        "phase": 4,
        "date_scope": "mtd",
        "keep": "latest",
        "suffix": "pvs",
        "bucket": "sku",
        "name": "Purchase Vs Sales",
    },
}

PHASE0_KINDS = {"daily", "dly", "dpt"}


def month_folder(d: date) -> str:
    return f"{d.year}-{d.month:02d} {MONTH_NAMES[d.month]}"


def stamp(d: date) -> str:
    return d.strftime("%m%d%Y")


def month_end(d: date) -> date:
    last = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, last)


def build_store_map(target: date) -> tuple[list[tuple], dict[str, str]]:
    m = month_folder(target)
    stores = [
        (key, group, acc, site, path.format(month=m))
        for key, group, acc, site, path in STORE_DEFS
    ]
    bd = {k: v.format(month=m) for k, v in BD_CENTRAL_DEFS.items()}
    return stores, bd


# Back-compat names for schedule docs / imports (current calendar month PT)
_today_pt = datetime.now(PT).date()
STORES, BD_CENTRAL = build_store_map(_today_pt)


def date_range_for(cfg: dict, target: date) -> tuple[date, date]:
    scope = cfg.get("date_scope", "mtd")
    if scope == "day":
        return target, target
    month_start = date(target.year, target.month, 1)
    if scope == "month":
        return month_start, month_end(target)
    # mtd
    return month_start, target


def pdf_filename(kind: str, target: date) -> str:
    cfg = REPORTS[kind]
    if kind == "daily":
        return f"{stamp(target)}.pdf"
    suffix = cfg.get("suffix") or kind
    return f"{stamp(target)}{suffix}.pdf"


def per_store_folder(store_folder: str, kind: str) -> str:
    """Map store Daily Summary path → bucket folder for this kind."""
    cfg = REPORTS[kind]
    bucket = cfg.get("bucket", "validate")
    # Phase 0 daily/dly/dpt stay in Daily Summary (existing convention).
    if kind in ("daily", "dly", "dpt"):
        return store_folder
    # Replace trailing "Daily Summary" with Validate / Fuel / MonthEnd / SKU
    label = {
        "validate": "Validate",
        "fuel": "Fuel",
        "monthend": "MonthEnd",
        "sku": "SKU",
        "daily": "Daily Summary",
        "dly": "Daily Summary",
        "dpt": "Daily Summary",
    }.get(bucket, bucket.title())
    if store_folder.endswith("Daily Summary"):
        return store_folder[: -len("Daily Summary")] + label
    return f"{store_folder}/{label}"


def bd_folder(bd: dict[str, str], kind: str) -> str:
    cfg = REPORTS[kind]
    bucket = cfg.get("bucket", kind)
    if bucket in bd:
        return bd[bucket]
    # fall back to constructing from month already baked into daily path
    sample = bd.get("daily") or next(iter(bd.values()))
    # BIG DADDY/PDF/daily/{month} -> BIG DADDY/PDF/{bucket}/{month}
    parts = sample.split("/")
    if len(parts) >= 3 and parts[1] == "PDF":
        parts[2] = bucket
        return "/".join(parts)
    return f"BIG DADDY/PDF/{bucket}/{month_folder(_today_pt)}"


def kinds_for_phase(phase: int) -> list[str]:
    return [k for k, c in REPORTS.items() if c.get("phase") == phase]


def show_plan(
    target: date,
    kinds: set[str] | None = None,
    phase: int | None = None,
    only: set[str] | None = None,
) -> None:
    """Print where each report lands (no SoftSP / OneDrive calls)."""
    stores, bd = build_store_map(target)
    if only:
        stores = [row for row in stores if any(tok in row[0] for tok in only)]
    include_bd = only is None or any(
        tok.upper().startswith("BD") for tok in (only or set())
    )
    if phase is not None:
        kinds = set(kinds_for_phase(phase))
    if not kinds:
        kinds = set(REPORTS)
    ordered = sorted(kinds, key=lambda k: (REPORTS[k]["phase"], k))

    print(f"# SoftSP pull plan through {target} ({month_folder(target)})")
    print(f"# kinds={','.join(ordered)}")
    print()
    for kind in ordered:
        cfg = REPORTS[kind]
        start, end = date_range_for(cfg, target)
        name = pdf_filename(kind, target)
        print(
            f"## [{kind}] phase={cfg['phase']}  {cfg.get('name')}  "
            f"rpt={cfg['rpt']!r}"
        )
        extra = cfg.get("extra") or {}
        if extra:
            print(f"   extra={extra}")
        print(
            f"   dates={start}..{end}  keep={cfg['keep']}  file={name}"
        )
        for key, group, acc, site, folder in stores:
            dest = per_store_folder(folder, kind)
            print(
                f"   → {key}  login={group} acc={acc} site={site}"
            )
            print(f"     Clients/{dest}/{name}")
        if include_bd:
            print(f"   → BD_central  login=hotmail acc=-121 (all BD sites)")
            print(f"     Clients/{bd_folder(bd, kind)}/{name}")
        print()


def load_s2k_logins(path: Path = CREDS_XLSX) -> dict[str, tuple[str, str]]:
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["s2k"]
    rows = []
    for r in ws.iter_rows(values_only=True):
        if not r or not r[0] or not r[1] or not r[2]:
            continue
        label = str(r[0]).strip()
        if label.lower() in ("main account",):
            continue
        rows.append((label, str(r[1]).strip(), str(r[2]).strip()))
    out: dict[str, tuple[str, str]] = {}
    for group, needle in LOGIN_GROUPS.items():
        hit = next((r for r in rows if needle.lower() in r[0].lower()), None)
        if not hit:
            raise SystemExit(f"Missing S2K login for group {group!r} in {path}")
        out[group] = (hit[1], hit[2])
    return out


def od_cookie_header(path: Path = OD_COOKIES) -> str:
    cookies = json.loads(path.read_text())
    parts = [
        f"{c['name']}={c['value']}"
        for c in cookies
        if "sharepoint.com" in c.get("domain", "")
    ]
    if not any(p.startswith("FedAuth=") for p in parts):
        raise SystemExit(f"No FedAuth cookie in {path}")
    return "; ".join(parts)


class SharePoint:
    def __init__(self, cookie_hdr: str):
        self.cookie_hdr = cookie_hdr
        self.ctx = ssl.create_default_context()
        self.digest = self._digest()

    def _req(
        self,
        url: str,
        method: str = "GET",
        data: bytes | None = None,
        headers: dict | None = None,
        timeout: int = 180,
    ) -> tuple[int, bytes]:
        h = {
            "Cookie": self.cookie_hdr,
            "Accept": "application/json;odata=verbose",
            "User-Agent": "Mozilla/5.0",
        }
        if headers:
            h.update(headers)
        r = urllib.request.Request(url, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(r, context=self.ctx, timeout=timeout) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def _digest(self) -> str:
        code, body = self._req(BASE + "/_api/contextinfo", method="POST", data=b"")
        if code != 200:
            raise SystemExit(f"SharePoint digest failed: {code} {body[:300]}")
        return json.loads(body)["d"]["GetContextWebInformation"]["FormDigestValue"]

    def list_files(self, rel: str) -> list[dict]:
        url = (
            BASE
            + f"/_api/web/GetFolderByServerRelativeUrl('{quote(rel)}')"
            + "/Files?$select=Name,ServerRelativeUrl,UniqueId,Length&$top=500"
        )
        code, body = self._req(url)
        if code != 200:
            print(f"list fail {rel} {code} {body[:150]}", flush=True)
            return []
        return json.loads(body)["d"]["results"]

    def upload(self, folder_rel: str, name: str, content: bytes) -> tuple[bool, str]:
        url = (
            BASE
            + f"/_api/web/GetFolderByServerRelativeUrl('{quote(folder_rel)}')"
            + f"/Files/add(url='{quote(name)}',overwrite=true)"
        )
        code, body = self._req(
            url,
            method="POST",
            data=content,
            headers={
                "X-RequestDigest": self.digest,
                "Content-Type": "application/pdf",
            },
        )
        if code in (200, 201):
            return True, "ok"
        return False, f"{code} {body[:200]}"

    def recycle(self, uid: str) -> tuple[bool, int]:
        url = BASE + f"/_api/web/GetFileById('{uid}')"
        code, _ = self._req(
            url,
            method="POST",
            data=b"",
            headers={
                "X-RequestDigest": self.digest,
                "X-HTTP-Method": "DELETE",
                "IF-MATCH": "*",
            },
        )
        return code in (200, 204), code


class S2K:
    def __init__(self, logins: dict[str, tuple[str, str]]):
        self.logins = logins
        # group -> (session, login_payload, current_accountid)
        self._sessions: dict[str, tuple[requests.Session, dict, int]] = {}

    def session(self, group: str) -> tuple[requests.Session, dict, int]:
        if group not in self._sessions:
            email, pw = self.logins[group]
            s = requests.Session()
            s.headers["User-Agent"] = "Mozilla/5.0"
            u = s.post(
                "https://store.s2kprime.com/api/auth/login",
                json={"provider": "local", "email": email, "password": pw},
                timeout=60,
            ).json()
            if not isinstance(u, dict) or "accountid" not in u:
                raise RuntimeError(f"S2K login failed for {group}: {u}")
            self._sessions[group] = (s, u, int(u["accountid"]))
        return self._sessions[group]

    def switch(self, s: requests.Session, accountid: int) -> Any:
        xsrf = s.cookies.get("XSRF-TOKEN")
        r = s.post(
            "https://store.s2kprime.com/api/authprivate/changeAccount",
            json={"accountid": accountid},
            headers={"X-XSRF-TOKEN": xsrf, "Content-Type": "application/json"},
            timeout=30,
        )
        d = r.json()
        if not isinstance(d, dict) or d.get("accountid") != accountid:
            raise RuntimeError(f"switch {accountid} failed: {d}")
        return s.get(
            "https://store.s2kprime.com/api/account/sessionid", timeout=30
        ).json()

    def sessionid_for(
        self, group: str, accountid: int
    ) -> tuple[requests.Session, Any, dict]:
        s, u, cur = self.session(group)
        if cur != accountid:
            sid = self.switch(s, accountid)
            self._sessions[group] = (s, u, accountid)
        else:
            sid = s.get(
                "https://store.s2kprime.com/api/account/sessionid", timeout=30
            ).json()
        stores = None
        for acc in u.get("accounts") or []:
            if acc.get("id") == accountid:
                stores = acc.get("stores")
                break
        if stores is None and u.get("accountid") == accountid:
            stores = u.get("stores")
        meta = dict(u)
        meta["accountid"] = accountid
        if stores:
            meta["stores"] = stores
        return s, sid, meta

    def pull(
        self,
        s: requests.Session,
        sid: Any,
        rpt: str,
        start: str,
        end: str,
        site: str,
        extra: dict | None = None,
    ) -> requests.Response:
        import time

        q = [
            f"rpt={quote(rpt, safe='')}",
            f"id={sid}",
            f"StartDate={start}",
            f"EndDate={end}",
            f"StationID={site}",
            "rs:Format=PDF",
        ]
        if extra:
            for k, v in extra.items():
                q.append(f"{quote(str(k))}={quote(str(v), safe='')}")
        url = "https://store.s2kprime.com/report?" + "&".join(q)
        last_err: Exception | None = None
        for attempt in range(4):
            try:
                return s.get(url, timeout=180)
            except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as e:
                last_err = e
                wait = 4 * (2**attempt)
                print(
                    f"  S2K pull retry {attempt + 1}/4 after {type(e).__name__}; sleep {wait}s",
                    flush=True,
                )
                time.sleep(wait)
        assert last_err is not None
        raise last_err


def is_pdf(content: bytes, min_len: int = 3000) -> bool:
    return content[:4] == b"%PDF" and len(content) > min_len


def daily_book_has_sales(content: bytes) -> bool:
    """Reject empty Daily Book shells (S2K returns PDFs with headers but no sales).

    Text is usually compressed inside the PDF, so we cannot grep raw bytes.
    Prefer a quick pdfplumber extract; fall back to size heuristics.
    """
    if not is_pdf(content, min_len=5000):
        return False
    # Empty shells seen ~20KB; real single-store ~32KB+; BD multi ~100KB+.
    # Still open short files — a sparse day can be mid-size.
    try:
        import io

        import pdfplumber

        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages[:3])
        if "Station Total" in text:
            return True
        # Truly empty shells have Fuel Sales headers but no grade lines / totals
        if "Unleaded" in text or "Diesel" in text:
            return True
        return False
    except Exception:
        # If we cannot parse, allow upload when clearly larger than empty shells
        return len(content) >= 28000


def existing_daily_names(sp: SharePoint, folder_rel: str) -> set[str]:
    return {f["Name"].lower() for f in sp.list_files(folder_rel)}


def existing_daily_index(sp: SharePoint, folder_rel: str) -> dict[str, dict]:
    """Map lowercase filename -> SharePoint file metadata (Name, UniqueId, Length)."""
    return {f["Name"].lower(): f for f in sp.list_files(folder_rel)}


def run_daily(target: date) -> dict:
    """Pull missing day-behind Daily Book Summary PDFs; accumulate (no deletes)."""
    stores, bd = build_store_map(target)
    month_start = date(target.year, target.month, 1)
    cfg = REPORTS["daily"]
    logins = load_s2k_logins()
    sp = SharePoint(od_cookie_header())
    s2k = S2K(logins)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[str, list] = {
        "uploaded": [],
        "skipped": [],
        "failed": [],
        "pulled": [],
        "recycled_empty": [],
    }

    days: list[date] = []
    d = month_start
    while d <= target:
        days.append(d)
        d += timedelta(days=1)

    print(
        f"Daily Book Summary through {target} ({month_folder(target)}); "
        f"days={days[0]}..{days[-1]} (skip existing; recycle empty shells)",
        flush=True,
    )

    def handle_day(client_key: str, s, sid, site_or_stores, folder: str, folder_rel: str, local: Path, have: dict[str, dict], day: date) -> None:
        name = f"{stamp(day)}.pdf"
        key_l = name.lower()
        if key_l in have:
            meta = have[key_l]
            length = int(meta.get("Length") or 0)
            # Empty shells are ~20KB; real single-store ~32KB+, BD multi ~100KB+
            if length >= 28000:
                print(f"  skip {name} (exists {length}b)", flush=True)
                results["skipped"].append(
                    {"client": client_key, "file": name, "folder": folder}
                )
                return
            ok, code = sp.recycle(meta["UniqueId"])
            print(f"  recycle empty {name} ({length}b) -> {ok} {code}", flush=True)
            results["recycled_empty"].append(
                {"client": client_key, "file": name, "bytes": length, "ok": ok}
            )
            if not ok:
                results["failed"].append(
                    {"client": client_key, "file": name, "op": "recycle_empty", "code": code}
                )
                return
        rr = s2k.pull(
            s,
            sid,
            cfg["rpt"],
            day.isoformat(),
            day.isoformat(),
            site_or_stores,
            cfg["extra"] or None,
        )
        if not daily_book_has_sales(rr.content):
            results["failed"].append(
                {
                    "client": client_key,
                    "file": name,
                    "op": "pull_empty",
                    "status": rr.status_code,
                    "bytes": len(rr.content),
                }
            )
            print(
                f"  EMPTY/FAIL {name} {rr.status_code} {len(rr.content)}b (no Station Total)",
                flush=True,
            )
            return
        path = local / name
        path.write_bytes(rr.content)
        results["pulled"].append(str(path))
        print(f"  pulled {name} {len(rr.content)} bytes", flush=True)
        up_ok, msg = sp.upload(folder_rel, name, rr.content)
        print(f"  upload {name} -> {up_ok} {msg}", flush=True)
        entry = {
            "client": client_key,
            "file": name,
            "op": "upload",
            "ok": up_ok,
            "msg": msg,
            "folder": folder,
        }
        (results["uploaded"] if up_ok else results["failed"]).append(entry)

    for key, group, acc, site, folder in stores:
        print(f"\n=== {key} daily ({group} acc={acc} site={site}) ===", flush=True)
        folder_rel = f"{DOCS_CLIENTS}/{folder}"
        local = OUT_DIR / key
        local.mkdir(exist_ok=True)
        try:
            s, sid, _ = s2k.sessionid_for(group, acc)
        except Exception as e:
            results["failed"].append({"client": key, "op": "login", "error": str(e)})
            print(f"  LOGIN FAIL {e}", flush=True)
            continue

        have = existing_daily_index(sp, folder_rel)
        for day in days:
            handle_day(key, s, sid, site, folder, folder_rel, local, have, day)

    print("\n=== BD_central daily (hotmail -121) ===", flush=True)
    try:
        s, sid, meta_u = s2k.sessionid_for("hotmail", -121)
        stores_csv = meta_u.get("stores") or ""
        if not stores_csv:
            raise RuntimeError("no stores list on BD account -121")
    except Exception as e:
        results["failed"].append(
            {"client": "BD_central", "op": "login", "error": str(e)}
        )
        print(f"  LOGIN FAIL {e}", flush=True)
        stores_csv = ""

    if stores_csv:
        print(f"  stores={stores_csv}", flush=True)
        folder = bd["daily"]
        folder_rel = f"{DOCS_CLIENTS}/{folder}"
        local = OUT_DIR / "BD_central"
        local.mkdir(exist_ok=True)
        have = existing_daily_index(sp, folder_rel)
        for day in days:
            handle_day("BD_central", s, sid, stores_csv, folder, folder_rel, local, have, day)

    out = {
        "mode": "daily",
        "target": target.isoformat(),
        "month": month_folder(target),
        "uploaded": results["uploaded"],
        "skipped": results["skipped"],
        "failed": results["failed"],
        "pulled": results["pulled"],
        "recycled_empty": results["recycled_empty"],
    }
    daily_result = Path("/tmp/s2k/exports/daily_book_run_result.json")
    daily_result.parent.mkdir(parents=True, exist_ok=True)
    daily_result.write_text(json.dumps(out, indent=2))
    print(
        f"\nDONE daily uploaded={len(out['uploaded'])} "
        f"skipped={len(out['skipped'])} failed={len(out['failed'])} "
        f"recycled_empty={len(out['recycled_empty'])} "
        f"-> {daily_result}",
        flush=True,
    )
    return out


def delete_older_mtd(
    sp: SharePoint,
    folder_rel: str,
    keep_names: set[str],
    kind: str,
    results: dict,
    client_key: str,
) -> None:
    """Delete older MTD PDFs in folder; keep only keep_names.

    Matches files ending with the kind's suffix (dly, dpt, nffull, …) or,
    for kind=='both', either dly or dpt (legacy Phase 0 batch).
    """
    if kind == "both":
        suffix_re = r"(dly|dpt)\.pdf$"
    elif kind in REPORTS and REPORTS[kind].get("suffix"):
        suf = re.escape(REPORTS[kind]["suffix"])
        suffix_re = rf"{suf}\.pdf$"
    else:
        suffix_re = rf"{re.escape(kind)}\.pdf$"
    keep_l = {k.lower() for k in keep_names}
    for f in sp.list_files(folder_rel):
        n = f["Name"]
        nl = n.lower()
        if nl in keep_l:
            continue
        if not re.search(suffix_re, nl):
            continue
        ok, code = sp.recycle(f["UniqueId"])
        print(f"  delete old {n} -> {ok} ({code})", flush=True)
        bucket = "deleted" if ok else "failed"
        results[bucket].append(
            {"client": client_key, "file": n, "op": "delete", "ok": ok, "code": code}
        )


def run_dly_dpt(
    target: date,
    kinds: set[str] | None = None,
    only: set[str] | None = None,
) -> dict:
    kinds = kinds or {"dly", "dpt"}
    if not kinds.issubset({"dly", "dpt"}):
        raise SystemExit(f"Invalid kinds {kinds}; expected subset of dly,dpt")
    stores, bd = build_store_map(target)
    if only:
        stores = [
            row
            for row in stores
            if any(tok in row[0] for tok in only)
        ]
        if not stores:
            raise SystemExit(f"No STORE_DEFS matched --only {sorted(only)}")
    kind_names = {k: pdf_filename(k, target) for k in kinds}
    # date range from first kind (both are mtd)
    start, end = date_range_for(REPORTS[next(iter(kinds))], target)

    logins = load_s2k_logins()
    sp = SharePoint(od_cookie_header())
    s2k = S2K(logins)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    results: dict[str, list] = {
        "uploaded": [],
        "deleted": [],
        "failed": [],
        "pulled": [],
    }

    print(
        f"{'+'.join(sorted(kinds)).upper()} through {target} ({month_folder(target)}) "
        f"-> {', '.join(kind_names[k] for k in sorted(kinds))}"
        + (f" only={','.join(sorted(only))}" if only else ""),
        flush=True,
    )

    # Per-store clients (DLY+DPT land in Daily Summary folder)
    for key, group, acc, site, folder in stores:
        print(f"\n=== {key} ({group} acc={acc} site={site}) ===", flush=True)
        folder_rel = f"{DOCS_CLIENTS}/{folder}"
        local = OUT_DIR / key
        local.mkdir(exist_ok=True)
        try:
            s, sid, _ = s2k.sessionid_for(group, acc)
        except Exception as e:
            results["failed"].append(
                {"client": key, "op": "login", "error": str(e)}
            )
            print(f"  LOGIN FAIL {e}", flush=True)
            continue

        keep: set[str] = set()
        for kind in sorted(kinds):
            name = kind_names[kind]
            cfg = REPORTS[kind]
            rr = s2k.pull(
                s,
                sid,
                cfg["rpt"],
                start.isoformat(),
                end.isoformat(),
                site,
                cfg["extra"] or None,
            )
            if not is_pdf(rr.content):
                results["failed"].append(
                    {
                        "client": key,
                        "file": name,
                        "op": "pull",
                        "status": rr.status_code,
                        "bytes": len(rr.content),
                    }
                )
                print(
                    f"  FAIL {kind} {rr.status_code} {len(rr.content)}",
                    flush=True,
                )
                continue
            path = local / name
            path.write_bytes(rr.content)
            results["pulled"].append(str(path))
            print(f"  pulled {kind} {len(rr.content)} bytes", flush=True)
            up_ok, msg = sp.upload(folder_rel, name, rr.content)
            print(f"  upload {kind} -> {up_ok} {msg}", flush=True)
            entry = {
                "client": key,
                "file": name,
                "op": "upload",
                "ok": up_ok,
                "msg": msg,
                "folder": folder,
            }
            (results["uploaded"] if up_ok else results["failed"]).append(entry)
            if up_ok:
                keep.add(name)

        if keep:
            delete_kind = "both" if kinds == {"dly", "dpt"} else next(iter(kinds))
            delete_older_mtd(
                sp,
                folder_rel,
                keep,
                delete_kind,
                results,
                key,
            )

    # Big Daddy central multi-store — skip when --only is a per-store client
    # (HB / Db / Placentia). BD multi-store report includes every BD site and
    # must not be mixed into a single-store refresh.
    run_bd = only is None
    if only and any(tok.upper().startswith("BD") for tok in only):
        run_bd = True

    if run_bd:
        print(f"\n=== BD_central (hotmail -121) ===", flush=True)
        try:
            s, sid, meta_u = s2k.sessionid_for("hotmail", -121)
            stores_csv = meta_u.get("stores") or ""
            if not stores_csv:
                raise RuntimeError("no stores list on BD account -121")
        except Exception as e:
            results["failed"].append({"client": "BD_central", "op": "login", "error": str(e)})
            print(f"  LOGIN FAIL {e}", flush=True)
            stores_csv = ""

        if stores_csv:
            print(f"  stores={stores_csv}", flush=True)
            local = OUT_DIR / "BD_central"
            local.mkdir(exist_ok=True)
            for kind in sorted(kinds):
                name = kind_names[kind]
                cfg = REPORTS[kind]
                folder = bd_folder(bd, kind)
                folder_rel = f"{DOCS_CLIENTS}/{folder}"
                rr = s2k.pull(
                    s,
                    sid,
                    cfg["rpt"],
                    start.isoformat(),
                    end.isoformat(),
                    stores_csv,
                    cfg["extra"] or None,
                )
                if not is_pdf(rr.content, min_len=5000):
                    results["failed"].append(
                        {
                            "client": "BD_central",
                            "file": name,
                            "op": "pull",
                            "status": rr.status_code,
                            "bytes": len(rr.content),
                        }
                    )
                    print(
                        f"  FAIL {kind} {rr.status_code} {len(rr.content)}",
                        flush=True,
                    )
                    continue
                path = local / name
                path.write_bytes(rr.content)
                results["pulled"].append(str(path))
                print(f"  pulled {kind} {len(rr.content)} bytes", flush=True)
                up_ok, msg = sp.upload(folder_rel, name, rr.content)
                print(f"  upload {kind} -> {up_ok} {msg}", flush=True)
                entry = {
                    "client": "BD_central",
                    "file": name,
                    "op": "upload",
                    "ok": up_ok,
                    "msg": msg,
                    "folder": folder,
                }
                (results["uploaded"] if up_ok else results["failed"]).append(entry)
                if up_ok:
                    delete_older_mtd(
                        sp, folder_rel, {name}, kind, results, "BD_central"
                    )
    else:
        print("\n=== BD_central skipped (--only per-store; no multi-site pull) ===", flush=True)

    out = {
        "target": target.isoformat(),
        "month": month_folder(target),
        "kinds": sorted(kinds),
        "dly_name": kind_names.get("dly"),
        "dpt_name": kind_names.get("dpt"),
        "uploaded": results["uploaded"],
        "deleted": results["deleted"],
        "failed": results["failed"],
        "pulled": results["pulled"],
    }
    RESULT_JSON.write_text(json.dumps(out, indent=2))
    print(
        f"\nDONE uploaded={len(out['uploaded'])} deleted={len(out['deleted'])} "
        f"failed={len(out['failed'])} -> {RESULT_JSON}",
        flush=True,
    )
    return out


def run_kinds(
    target: date,
    kinds: set[str],
    only: set[str] | None = None,
    dry_run: bool = False,
) -> dict:
    """Pull any registered kinds (phases 0–4). ``daily`` uses run_daily path."""
    unknown = kinds - set(REPORTS)
    if unknown:
        raise SystemExit(f"Unknown kinds: {sorted(unknown)}; known={sorted(REPORTS)}")
    if "daily" in kinds:
        if dry_run:
            show_plan(target, {"daily"}, only=only)
            kinds = kinds - {"daily"}
        else:
            daily_out = run_daily(target)
            kinds = kinds - {"daily"}
            if not kinds:
                return daily_out
    # Phase 0 dly/dpt keep legacy runner when that's all we're doing
    if kinds and kinds.issubset({"dly", "dpt"}) and not dry_run:
        return run_dly_dpt(target, kinds=kinds, only=only)

    stores, bd = build_store_map(target)
    if only:
        stores = [row for row in stores if any(tok in row[0] for tok in only)]
        if not stores:
            raise SystemExit(f"No STORE_DEFS matched --only {sorted(only)}")

    if dry_run:
        show_plan(target, kinds, only=only)
        return {"dry_run": True, "kinds": sorted(kinds), "target": target.isoformat()}

    logins = load_s2k_logins()
    sp = SharePoint(od_cookie_header())
    s2k = S2K(logins)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    results: dict[str, list] = {
        "uploaded": [],
        "deleted": [],
        "failed": [],
        "pulled": [],
        "skipped": [],
    }

    print(
        f"KINDS {sorted(kinds)} through {target} ({month_folder(target)})",
        flush=True,
    )

    def pull_one(
        client_key: str,
        s,
        sid,
        site_or_stores: str,
        folder: str,
        kind: str,
    ) -> None:
        cfg = REPORTS[kind]
        name = pdf_filename(kind, target)
        start, end = date_range_for(cfg, target)
        folder_rel = f"{DOCS_CLIENTS}/{folder}"
        local = OUT_DIR / client_key
        local.mkdir(exist_ok=True)

        if cfg.get("keep") == "accumulate":
            have = existing_daily_names(sp, folder_rel)
            if name.lower() in have:
                print(f"  skip {name} (exists)", flush=True)
                results["skipped"].append(
                    {"client": client_key, "file": name, "folder": folder}
                )
                return

        rr = s2k.pull(
            s,
            sid,
            cfg["rpt"],
            start.isoformat(),
            end.isoformat(),
            site_or_stores,
            cfg.get("extra") or None,
        )
        min_len = 5000 if client_key == "BD_central" else 3000
        if not is_pdf(rr.content, min_len=min_len):
            results["failed"].append(
                {
                    "client": client_key,
                    "file": name,
                    "op": "pull",
                    "status": rr.status_code,
                    "bytes": len(rr.content),
                    "kind": kind,
                }
            )
            print(f"  FAIL {kind} {rr.status_code} {len(rr.content)}", flush=True)
            return
        path = local / name
        path.write_bytes(rr.content)
        results["pulled"].append(str(path))
        print(f"  pulled {kind} {len(rr.content)} bytes -> {name}", flush=True)
        up_ok, msg = sp.upload(folder_rel, name, rr.content)
        print(f"  upload {kind} -> {up_ok} {msg}", flush=True)
        entry = {
            "client": client_key,
            "file": name,
            "op": "upload",
            "ok": up_ok,
            "msg": msg,
            "folder": folder,
            "kind": kind,
        }
        (results["uploaded"] if up_ok else results["failed"]).append(entry)
        if up_ok and cfg.get("keep") == "latest":
            delete_older_mtd(sp, folder_rel, {name}, kind, results, client_key)

    for key, group, acc, site, base_folder in stores:
        print(f"\n=== {key} ({group} acc={acc} site={site}) ===", flush=True)
        try:
            s, sid, _ = s2k.sessionid_for(group, acc)
        except Exception as e:
            results["failed"].append({"client": key, "op": "login", "error": str(e)})
            print(f"  LOGIN FAIL {e}", flush=True)
            continue
        for kind in sorted(kinds):
            folder = per_store_folder(base_folder, kind)
            pull_one(key, s, sid, site, folder, kind)

    run_bd = only is None or any(tok.upper().startswith("BD") for tok in (only or set()))
    if run_bd:
        print("\n=== BD_central (hotmail -121) ===", flush=True)
        try:
            s, sid, meta_u = s2k.sessionid_for("hotmail", -121)
            stores_csv = meta_u.get("stores") or ""
            if not stores_csv:
                raise RuntimeError("no stores list on BD account -121")
        except Exception as e:
            results["failed"].append({"client": "BD_central", "op": "login", "error": str(e)})
            print(f"  LOGIN FAIL {e}", flush=True)
            stores_csv = ""
        if stores_csv:
            print(f"  stores={stores_csv}", flush=True)
            for kind in sorted(kinds):
                folder = bd_folder(bd, kind)
                pull_one("BD_central", s, sid, stores_csv, folder, kind)
    else:
        print("\n=== BD_central skipped (--only per-store) ===", flush=True)

    out = {
        "target": target.isoformat(),
        "month": month_folder(target),
        "kinds": sorted(kinds),
        "uploaded": results["uploaded"],
        "deleted": results["deleted"],
        "failed": results["failed"],
        "pulled": results["pulled"],
        "skipped": results["skipped"],
    }
    RESULT_JSON.write_text(json.dumps(out, indent=2))
    print(
        f"\nDONE uploaded={len(out['uploaded'])} deleted={len(out['deleted'])} "
        f"skipped={len(out['skipped'])} failed={len(out['failed'])} -> {RESULT_JSON}",
        flush=True,
    )
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--show",
        action="store_true",
        help="Print pull plan (SoftSP rpt + OneDrive destinations) and exit",
    )
    p.add_argument(
        "--map-only",
        action="store_true",
        help="Print store map and exit (alias of --show for phase 0)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Same as --show for selected kinds (no SoftSP / OneDrive)",
    )
    p.add_argument(
        "--mode",
        type=str,
        choices=("dly-dpt", "daily", "kinds"),
        default=None,
        help="dly-dpt (Phase 0 DLY+DPT), daily (Daily Book), or kinds (use --kinds/--phase)",
    )
    p.add_argument(
        "--through",
        type=str,
        default=None,
        help="Inclusive day-behind date YYYY-MM-DD (default: yesterday PT)",
    )
    p.add_argument(
        "--kinds",
        type=str,
        default=None,
        help="Comma-separated report kinds (see --list). Default depends on --mode.",
    )
    p.add_argument(
        "--phase",
        type=int,
        choices=(0, 1, 2, 3, 4),
        default=None,
        help="Select all kinds in this game-plan phase",
    )
    p.add_argument(
        "--list",
        action="store_true",
        help="List registered kinds and exit",
    )
    p.add_argument(
        "--only",
        type=str,
        default=None,
        help="Comma-separated store tokens matching STORE_DEFS keys "
        "(e.g. 42179,42352). Skips Big Daddy multi-site pull unless BD*.",
    )
    args = p.parse_args(argv)

    if args.list:
        for kind, cfg in sorted(REPORTS.items(), key=lambda kv: (kv[1]["phase"], kv[0])):
            print(
                f"  {kind:16} phase={cfg['phase']}  "
                f"{cfg.get('name')}  rpt={cfg['rpt']}"
            )
        return 0

    if args.through:
        target = date.fromisoformat(args.through)
    else:
        target = datetime.now(PT).date() - timedelta(days=1)

    only = None
    if args.only:
        only = {k.strip() for k in args.only.split(",") if k.strip()}

    kinds: set[str] | None = None
    if args.phase is not None:
        kinds = set(kinds_for_phase(args.phase))
    if args.kinds:
        kinds = {k.strip().lower() for k in args.kinds.split(",") if k.strip()}

    if args.show or args.map_only or args.dry_run:
        show_plan(target, kinds=kinds, phase=None if kinds else args.phase, only=only)
        return 0

    # Resolve default mode / kinds
    mode = args.mode
    if mode is None:
        if kinds is None:
            mode = "dly-dpt"
            kinds = {"dly", "dpt"}
        elif kinds == {"daily"}:
            mode = "daily"
        elif kinds.issubset({"dly", "dpt"}):
            mode = "dly-dpt"
        else:
            mode = "kinds"

    if mode == "daily":
        out = run_daily(target)
        return 1 if out["failed"] else 0

    if mode == "dly-dpt":
        kinds = kinds or {"dly", "dpt"}
        if not kinds.issubset({"dly", "dpt"}):
            # fall through to generic runner
            out = run_kinds(target, kinds, only=only)
            return 1 if out.get("failed") else 0
        out = run_dly_dpt(target, kinds=kinds, only=only)
        return 1 if out["failed"] else 0

    # mode == kinds
    if not kinds:
        raise SystemExit("--mode kinds requires --kinds or --phase")
    out = run_kinds(target, kinds, only=only)
    return 1 if out.get("failed") else 0


if __name__ == "__main__":
    sys.exit(main())
