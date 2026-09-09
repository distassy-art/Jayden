#!/usr/bin/env python3
"""Fill S2K Daily Book Summary / DLY / DPT into OneDrive client folders.

Reports (S2K):
  - Daily  = DailyTotal+Summary with ShowCost=1  (one PDF per business day)
  - DLY    = None Fuel Invoice Total             (month-to-date; keep latest only)
  - DPT    = DailyAPInvoice                      (baseline = collapsed vendor summary MTD)

Policy:
  - Daily files accumulate (MMDDYYYY.pdf).
  - DLY/DPT are month-to-date: after uploading the latest
    MMDDYYYYdly.pdf / MMDDYYYYdpt.pdf, delete older dly/dpt files in that month folder.

Schedule (America/Los_Angeles) — see scripts/s2k_report_schedule.md:
  - DLY + DPT: Wed 8:00 AM, Sun 4:00 AM
  - Daily Book Summary: every day 2:00 PM
  - Daily Excel update (from Daily PDFs): Mon/Wed/Fri/Sun 8:00 AM

Requires:
  - S2K logins from /tmp/s2k/creds/Client-logins.xlsx sheet ``s2k``
  - SharePoint cookies at /tmp/od_cookies.json (FedAuth) for upload + recycle

Usage:
  python3 scripts/fill_daily_dly_dpt.py                    # DLY+DPT through yesterday PT
  python3 scripts/fill_daily_dly_dpt.py --mode daily       # Daily Book Summary (skip existing)
  python3 scripts/fill_daily_dly_dpt.py --map-only
  python3 scripts/fill_daily_dly_dpt.py --through 2026-09-08
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
}

REPORTS = {
    # ShowCost=1 includes Cost / Margin / Profit columns.
    "daily": {"rpt": "DailyTotal+Summary", "extra": {"ShowCost": "1"}},
    "dly": {"rpt": "None Fuel Invoice Total", "extra": {}},
    # Baseline DailyAPInvoice is already the collapsed vendor summary.
    # Do NOT pass ViewType=CollapseAll — that has returned HTTP 500.
    "dpt": {"rpt": "DailyAPInvoice", "extra": {}},
}


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
        return s.get(url, timeout=180)


def is_pdf(content: bytes, min_len: int = 3000) -> bool:
    return content[:4] == b"%PDF" and len(content) > min_len


def delete_older_mtd(
    sp: SharePoint,
    folder_rel: str,
    keep_names: set[str],
    kind: str,
    results: dict,
    client_key: str,
) -> None:
    """Delete older *dly* / *dpt* PDFs in folder; keep only keep_names."""
    for f in sp.list_files(folder_rel):
        n = f["Name"]
        nl = n.lower()
        if nl in {k.lower() for k in keep_names}:
            continue
        if kind == "dly" and "dly" not in nl:
            continue
        if kind == "dpt" and "dpt" not in nl:
            continue
        if kind == "both" and not re.search(r"(dly|dpt)\.pdf$", nl):
            continue
        ok, code = sp.recycle(f["UniqueId"])
        print(f"  delete old {n} -> {ok} ({code})", flush=True)
        bucket = "deleted" if ok else "failed"
        results[bucket].append(
            {"client": client_key, "file": n, "op": "delete", "ok": ok, "code": code}
        )


def existing_daily_names(sp: SharePoint, folder_rel: str) -> set[str]:
    return {f["Name"].lower() for f in sp.list_files(folder_rel)}


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
    }

    days = []
    d = month_start
    while d <= target:
        days.append(d)
        d += timedelta(days=1)

    print(
        f"Daily Book Summary through {target} ({month_folder(target)}); "
        f"days={days[0]}..{days[-1]} (skip existing)",
        flush=True,
    )

    for key, group, acc, site, folder in stores:
        print(f"\n=== {key} daily ({group} acc={acc} site={site}) ===", flush=True)
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

        have = existing_daily_names(sp, folder_rel)
        for day in days:
            name = f"{stamp(day)}.pdf"
            if name.lower() in have:
                print(f"  skip {name} (exists)", flush=True)
                results["skipped"].append(
                    {"client": key, "file": name, "folder": folder}
                )
                continue
            rr = s2k.pull(
                s,
                sid,
                cfg["rpt"],
                day.isoformat(),
                day.isoformat(),
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
                    f"  FAIL {name} {rr.status_code} {len(rr.content)}",
                    flush=True,
                )
                continue
            path = local / name
            path.write_bytes(rr.content)
            results["pulled"].append(str(path))
            print(f"  pulled {name} {len(rr.content)} bytes", flush=True)
            up_ok, msg = sp.upload(folder_rel, name, rr.content)
            print(f"  upload {name} -> {up_ok} {msg}", flush=True)
            entry = {
                "client": key,
                "file": name,
                "op": "upload",
                "ok": up_ok,
                "msg": msg,
                "folder": folder,
            }
            (results["uploaded"] if up_ok else results["failed"]).append(entry)

    # Big Daddy central multi-store daily
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
        have = existing_daily_names(sp, folder_rel)
        for day in days:
            name = f"{stamp(day)}.pdf"
            if name.lower() in have:
                print(f"  skip {name} (exists)", flush=True)
                results["skipped"].append(
                    {"client": "BD_central", "file": name, "folder": folder}
                )
                continue
            rr = s2k.pull(
                s,
                sid,
                cfg["rpt"],
                day.isoformat(),
                day.isoformat(),
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
                    f"  FAIL {name} {rr.status_code} {len(rr.content)}",
                    flush=True,
                )
                continue
            path = local / name
            path.write_bytes(rr.content)
            results["pulled"].append(str(path))
            print(f"  pulled {name} {len(rr.content)} bytes", flush=True)
            up_ok, msg = sp.upload(folder_rel, name, rr.content)
            print(f"  upload {name} -> {up_ok} {msg}", flush=True)
            entry = {
                "client": "BD_central",
                "file": name,
                "op": "upload",
                "ok": up_ok,
                "msg": msg,
                "folder": folder,
            }
            (results["uploaded"] if up_ok else results["failed"]).append(entry)

    out = {
        "mode": "daily",
        "target": target.isoformat(),
        "month": month_folder(target),
        "uploaded": results["uploaded"],
        "skipped": results["skipped"],
        "failed": results["failed"],
        "pulled": results["pulled"],
    }
    daily_result = Path("/tmp/s2k/exports/daily_book_run_result.json")
    daily_result.write_text(json.dumps(out, indent=2))
    print(
        f"\nDONE daily uploaded={len(out['uploaded'])} "
        f"skipped={len(out['skipped'])} failed={len(out['failed'])} "
        f"-> {daily_result}",
        flush=True,
    )
    return out


def run_dly_dpt(target: date) -> dict:
    stores, bd = build_store_map(target)
    month_start = date(target.year, target.month, 1)
    end = month_end(target)
    dly_name = f"{stamp(target)}dly.pdf"
    dpt_name = f"{stamp(target)}dpt.pdf"

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
        f"DLY+DPT through {target} ({month_folder(target)}) "
        f"-> {dly_name} / {dpt_name}",
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

        for kind, name in (("dly", dly_name), ("dpt", dpt_name)):
            cfg = REPORTS[kind]
            rr = s2k.pull(
                s,
                sid,
                cfg["rpt"],
                month_start.isoformat(),
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

        delete_older_mtd(
            sp,
            folder_rel,
            {dly_name, dpt_name},
            "both",
            results,
            key,
        )

    # Big Daddy central multi-store
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
        for kind, name, folder_key in (
            ("dly", dly_name, "dly"),
            ("dpt", dpt_name, "dpt"),
        ):
            cfg = REPORTS[kind]
            folder = bd[folder_key]
            folder_rel = f"{DOCS_CLIENTS}/{folder}"
            rr = s2k.pull(
                s,
                sid,
                cfg["rpt"],
                month_start.isoformat(),
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
            delete_older_mtd(
                sp, folder_rel, {name}, kind, results, "BD_central"
            )

    out = {
        "target": target.isoformat(),
        "month": month_folder(target),
        "dly_name": dly_name,
        "dpt_name": dpt_name,
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


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--map-only",
        action="store_true",
        help="Print store map and exit",
    )
    p.add_argument(
        "--mode",
        choices=("dly-dpt", "daily"),
        default="dly-dpt",
        help="dly-dpt (default) or daily book summary",
    )
    p.add_argument(
        "--through",
        type=str,
        default=None,
        help="Inclusive day-behind date YYYY-MM-DD (default: yesterday PT)",
    )
    args = p.parse_args(argv)

    if args.through:
        target = date.fromisoformat(args.through)
    else:
        target = datetime.now(PT).date() - timedelta(days=1)

    stores, bd = build_store_map(target)
    if args.map_only:
        print("Store map:")
        for row in stores:
            print(" ", row)
        print("BD central:", bd)
        print("Reports:", REPORTS)
        return 0

    if args.mode == "daily":
        out = run_daily(target)
    else:
        out = run_dly_dpt(target)
    return 1 if out["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
