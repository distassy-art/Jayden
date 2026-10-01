#!/usr/bin/env python3
"""Pull Paradise (42359) daily + dly + dpt PDFs using Microsoft Edge only.

S2K blocks non-Edge clients (502 / hung login). Uses Playwright with
``/usr/bin/microsoft-edge`` and an Edge User-Agent, then reuses session
cookies for SoftSP report URLs (same as fill_daily_dly_dpt.S2K.pull).

Outputs:
  /tmp/s2k/exports/dly_dpt_run/42359_Pa/{MMDDYYYY.pdf, *dly.pdf, *dpt.pdf}
  /tmp/s2k/exports/paradise_s2k_pull_result.json

Upload to OneDrive (Graph MCP or FedAuth) under:
  Clients/BIG DADDY/42359 (Paradise)/{month}/Daily Summary/

Usage:
  python3 scripts/pull_paradise_s2k_edge.py --through 2026-09-29
  python3 scripts/pull_paradise_s2k_edge.py --check-only
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import openpyxl
import requests
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "scripts"))
from fill_daily_dly_dpt import (  # noqa: E402
    REPORTS,
    daily_book_has_sales,
    date_range_for,
    month_folder,
    pdf_filename,
    stamp,
)

PT = ZoneInfo("America/Los_Angeles")
EDGE = Path("/usr/bin/microsoft-edge")
CREDS = Path("/tmp/s2k/creds/Client-logins.xlsx")
OUT_DIR = Path("/tmp/s2k/exports/dly_dpt_run/42359_Pa")
RESULT = Path("/tmp/s2k/exports/paradise_s2k_pull_result.json")
EDGE_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
)
# S2K StationID for Paradise (TSO in multi-store PDFs)
DEFAULT_STATION = "42073"


def paradise_login() -> tuple[requests.Session, dict]:
    wb = openpyxl.load_workbook(CREDS, data_only=True)
    email = pw = None
    for r in wb["s2k"].iter_rows(values_only=True):
        if r and r[1] and "paradise" in str(r[1]).lower():
            email, pw = str(r[2]).strip(), str(r[3]).strip()
            break
    if not email:
        raise SystemExit("Paradise login missing in Client-logins.xlsx s2k sheet")

    login_payload = {"provider": "local", "email": email, "password": pw}
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=str(EDGE),
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = browser.new_context(user_agent=EDGE_UA)
        page = context.new_page()
        page.goto(
            "https://store.s2kprime.com/s2k/#/login",
            wait_until="domcontentloaded",
            timeout=90_000,
        )
        api = page.evaluate(
            """async (payload) => {
                const r = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload),
                    credentials: 'include',
                });
                return {status: r.status, text: await r.text()};
            }""",
            login_payload,
        )
        cookies = context.cookies()
        browser.close()

    if api.get("status") != 200:
        raise RuntimeError(
            f"Paradise Edge login failed HTTP {api.get('status')}: "
            f"{str(api.get('text', ''))[:300]}"
        )
    body = json.loads(api["text"])
    if not isinstance(body, dict) or "accountid" not in body:
        raise RuntimeError(f"Paradise login unexpected body: {str(body)[:300]}")

    s = requests.Session()
    s.headers["User-Agent"] = EDGE_UA
    for c in cookies:
        s.cookies.set(c["name"], c["value"], domain=c.get("domain"), path=c.get("path", "/"))

    sid = s.get("https://store.s2kprime.com/api/account/sessionid", timeout=60).json()
    meta = dict(body)
    meta["sessionid"] = sid
    return s, meta


def pull_pdf(
    s: requests.Session,
    sid: object,
    rpt: str,
    start: date,
    end: date,
    station: str,
    extra: dict | None,
) -> bytes:
    q = [
        f"rpt={quote(rpt, safe='')}",
        f"id={sid}",
        f"StartDate={start.isoformat()}",
        f"EndDate={end.isoformat()}",
        f"StationID={station}",
        "rs:Format=PDF",
    ]
    if extra:
        for k, v in extra.items():
            q.append(f"{quote(str(k))}={quote(str(v), safe='')}")
    url = "https://store.s2kprime.com/report?" + "&".join(q)
    r = s.get(url, timeout=180)
    r.raise_for_status()
    return r.content


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--through", type=str, default=None, help="YYYY-MM-DD inclusive")
    ap.add_argument(
        "--check-only",
        action="store_true",
        help="Edge login probe only; write paradise_s2k_pull_result.json",
    )
    ap.add_argument("--station", type=str, default=DEFAULT_STATION)
    args = ap.parse_args()

    if args.through:
        target = date.fromisoformat(args.through)
    else:
        target = datetime.now(PT).date() - timedelta(days=1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out: dict = {"target": target.isoformat(), "station_id": args.station, "files": [], "errors": []}

    try:
        s, meta = paradise_login()
        out["login"] = {"accountid": meta.get("accountid"), "ok": True}
    except Exception as e:
        out["login"] = {"ok": False, "error": str(e)}
        RESULT.write_text(json.dumps(out, indent=2))
        print(json.dumps(out, indent=2))
        return 1

    if args.check_only:
        RESULT.write_text(json.dumps(out, indent=2))
        print("Paradise Edge login OK", out["login"])
        return 0

    sid = meta.get("sessionid")
    month = month_folder(target)
    pulls = [
        ("daily", REPORTS["daily"], target, target),
        ("dly", REPORTS["dly"], *date_range_for(REPORTS["dly"], target)),
        ("dpt", REPORTS["dpt"], *date_range_for(REPORTS["dpt"], target)),
    ]
    for kind, cfg, start, end in pulls:
        name = pdf_filename(kind, target)
        path = OUT_DIR / name
        try:
            content = pull_pdf(
                s,
                sid,
                cfg["rpt"],
                start,
                end,
                args.station,
                cfg.get("extra"),
            )
            if kind == "daily" and not daily_book_has_sales(content):
                out["errors"].append({"file": name, "op": "empty_daily"})
                print(f"EMPTY daily {name} ({len(content)}b)", flush=True)
                continue
            path.write_bytes(content)
            out["files"].append({"kind": kind, "path": str(path), "bytes": len(content)})
            print(f"OK {name} {len(content)}b -> {path}", flush=True)
        except Exception as e:
            out["errors"].append({"file": name, "error": str(e)})
            print(f"FAIL {name}: {e}", flush=True)

    out["onedrive_prefix"] = (
        f"Clients/BIG DADDY/42359 (Paradise)/{month}/Daily Summary"
    )
    RESULT.write_text(json.dumps(out, indent=2))
    print(f"Wrote {RESULT}")
    return 1 if out["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
