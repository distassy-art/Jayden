#!/usr/bin/env python3
"""Fix /new Trends closed-month cutoff + Jul/Aug fuel revenue artifacts.

Live actions this script can take without Cloudflare:
  - Neutralize open months on the books overlay (Trends stops at last closed month).

Fuel revenue (`gas_sales` on /data/monthly.json) needs a Cloudflare site deploy.
This script refreshes data/monthly.json + data/fuel-sales-from-excel-2026.json from
Client Monthly workbooks. Deploy with CLOUDFLARE_API_TOKEN when available:

  CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=1ad267ec20bc187ad2fe348f66ed7acf \\
    npx wrangler deploy   # from the smartsolutions-site checkout
"""
from __future__ import annotations

import argparse
import os
import io
import json
import re
import ssl
import subprocess
import tempfile
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from openpyxl import load_workbook

REPO = Path(__file__).resolve().parents[1]
SITE = "https://smartsolutionsai.us"
ADMIN = {"email": "smartsolutionsai", "role": "owner"}
PT = ZoneInfo("America/Los_Angeles")
HOST = "https://smartsolutionsai26-my.sharepoint.com"
PERSONAL = "minamorcos_smartsolutionsai26_onmicrosoft_com"
BASE = f"{HOST}/personal/{PERSONAL}"
SSL_CTX = ssl.create_default_context()
COOKIES = Path("/tmp/od_cookies.json")

MONTH_NAME = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
STATION_NAMES = {
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
    "42359": "Paradise",
    "42399": "Garden Grove",
    "42438": "Vista",
    "42439": "Lamb",
    "42642": "La Mesa",
    "42674": "Tustin",
    "extramile": "ExtraMile",
}


def last_closed_month(today: date | None = None) -> str:
    today = today or datetime.now(PT).date()
    y, m = today.year, today.month
    if m == 1:
        return f"{y - 1}-12"
    return f"{y}-{m - 1:02d}"


def api(path: str, method: str = "GET", body=None):
    req = urllib.request.Request(
        SITE + path,
        data=None if body is None else json.dumps(body).encode(),
        method=method,
        headers={
            "Content-Type": "application/json",
            "x-ss-email": ADMIN["email"],
            "x-ss-role": ADMIN["role"],
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode())


def cookie_header() -> str:
    raw = json.loads(COOKIES.read_text())
    if isinstance(raw, list):
        return "; ".join(f"{c['name']}={c['value']}" for c in raw)
    return "; ".join(f"{k}={v}" for k, v in raw.items())


def month_key_from_label(label) -> str | None:
    if isinstance(label, datetime):
        return f"{label.year}-{label.month:02d}"
    if isinstance(label, date):
        return f"{label.year}-{label.month:02d}"
    if isinstance(label, (int, float)) and label > 40000:
        d = datetime(1899, 12, 30) + timedelta(days=int(label))
        return f"{d.year}-{d.month:02d}"
    s = str(label or "").strip()
    m = re.search(
        r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})",
        s,
        re.I,
    )
    if m:
        return f"{m.group(2)}-{MONTH_NAME[m.group(1)[:3].lower()]:02d}"
    return None


def extract_fuel_sales_2026(wb) -> dict[str, float]:
    out: dict[str, float] = {}
    for name in wb.sheetnames:
        if re.search(r"2026\s*fuel$", name.strip(), re.I):
            ws = wb[name]
            for row in ws.iter_rows(min_row=1, max_row=40, max_col=6, values_only=True):
                key = month_key_from_label(row[0])
                if key and key.startswith("2026-") and isinstance(row[2], (int, float)):
                    out[key] = float(row[2])
            return out
    if "Fuel Summary" in wb.sheetnames:
        ws = wb["Fuel Summary"]
        for row in ws.iter_rows(min_row=1, max_row=50, max_col=12, values_only=True):
            key = month_key_from_label(row[6] if len(row) > 6 else None)
            if (
                key
                and key.startswith("2026-")
                and len(row) > 8
                and isinstance(row[8], (int, float))
            ):
                out[key] = float(row[8])
    return out


def sp_json(cookie: str, url: str):
    req = urllib.request.Request(
        url, headers={"Cookie": cookie, "Accept": "application/json;odata=verbose"}
    )
    with urllib.request.urlopen(req, timeout=120, context=SSL_CTX) as r:
        return json.loads(r.read().decode())


def list_children(cookie: str, server_rel: str, kind: str = "Folders"):
    q = urllib.parse.quote(server_rel, safe="/")
    if kind == "Files":
        url = (
            f"{BASE}/_api/web/GetFolderByServerRelativeUrl(@p)/Files"
            f"?@p=%27{q}%27&$select=Name,ServerRelativeUrl,TimeLastModified"
            f"&$orderby=TimeLastModified%20desc"
        )
    else:
        url = (
            f"{BASE}/_api/web/GetFolderByServerRelativeUrl(@p)/Folders"
            f"?@p=%27{q}%27&$select=Name,ServerRelativeUrl"
        )
    return sp_json(cookie, url)["d"]["results"]


def download(cookie: str, server_rel: str) -> bytes:
    q = urllib.parse.quote(server_rel, safe="/")
    url = f"{BASE}/_api/web/GetFileByServerRelativeUrl('{q}')/$value"
    req = urllib.request.Request(url, headers={"Cookie": cookie})
    with urllib.request.urlopen(req, timeout=180, context=SSL_CTX) as r:
        return r.read()


def collect_fuel_sales(cookie: str, only: set[str] | None) -> dict[str, dict[str, float]]:
    root = f"/personal/{PERSONAL}/Documents/Clients"
    stores = []
    for top in list_children(cookie, root, "Folders"):
        name = top["Name"]
        if name.startswith("_") or name.lower() == "template":
            continue
        if re.match(r"^\d{5}\b", name) or "extra" in name.lower():
            stores.append(top)
            continue
        try:
            stores.extend(list_children(cookie, top["ServerRelativeUrl"], "Folders"))
        except Exception as exc:
            print(f"warn: list {name}: {exc}", flush=True)

    by_id: dict[str, dict[str, float]] = {}
    for st in stores:
        name = st["Name"]
        m = re.match(r"^(\d{5})\b", name)
        sid = m.group(1) if m else ("extramile" if "extra" in name.lower() else None)
        if not sid or (only and sid not in only):
            continue
        try:
            files = list_children(cookie, st["ServerRelativeUrl"], "Files")
        except Exception as exc:
            print(f"warn: files {sid}: {exc}", flush=True)
            continue
        monthly = next(
            (
                fi
                for fi in files
                if fi["Name"].lower().endswith(".xlsx")
                and "monthly" in fi["Name"].lower()
                and "summary" in fi["Name"].lower()
            ),
            None,
        ) or next(
            (
                fi
                for fi in files
                if fi["Name"].lower().endswith(".xlsx") and "monthly" in fi["Name"].lower()
            ),
            None,
        )
        if not monthly:
            print(f"warn: no monthly for {sid} {name}", flush=True)
            continue
        wb = load_workbook(
            io.BytesIO(download(cookie, monthly["ServerRelativeUrl"])), data_only=True
        )
        sales = extract_fuel_sales_2026(wb)
        by_id[sid] = sales
        print(
            f"fuel-sales {sid} {STATION_NAMES.get(sid, name)} "
            f"jul={sales.get('2026-07')} aug={sales.get('2026-08')}",
            flush=True,
        )
    return by_id


def neutralize_open_months(overlay: dict, closed: str) -> list[dict]:
    zero = {
        "sales": 0,
        "purchases": 0,
        "gas_vol": 0,
        "gas_profit": 0,
        "store_profit": 0,
        "total_profit": 0,
        "store_margin": 0,
        "gas_margin": 0,
        "days": 0,
    }
    stations = []
    for sid, st in sorted((overlay.get("stations") or {}).items()):
        open_months = {
            key: dict(zero) for key in (st.get("months") or {}) if key > closed
        }
        if not open_months:
            continue
        stations.append(
            {
                "file": st.get("file") or f"{sid}.xlsx",
                "kind": "daily",
                "id": sid,
                "name": STATION_NAMES.get(sid) or st.get("name") or sid,
                "period": closed,
                "days": [],
                "months": open_months,
                "kpis": {},
            }
        )
    return stations


def patch_monthly_json(fuel: dict[str, dict[str, float]], closed: str) -> dict:
    req = urllib.request.Request(SITE + "/data/monthly.json", headers={"User-Agent": "ss"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        monthly = json.loads(resp.read().decode())
    filled = 0
    for st in monthly.get("stations") or []:
        sid = str(st.get("id"))
        months = st.setdefault("months", {})
        for key, val in (fuel.get(sid) or {}).items():
            if key > closed or not isinstance(val, (int, float)):
                continue
            row = months.setdefault(key, {})
            row["gas_sales"] = round(float(val), 2)
            filled += 1
    monthly["as_of"] = datetime.now(PT).date().isoformat()
    monthly["rule"] = (
        f"closed months through {datetime.strptime(closed, '%Y-%m').strftime('%B %Y')}"
    )
    monthly["fixed_at"] = datetime.now(PT).strftime("%Y-%m-%dT%H:%M:%SZ")
    monthly["fuel_sales_note"] = (
        "Backfilled gas_sales from Client Monthly Fuel sheets "
        "(HB/Paradise Aug and ExtraMile missing in Excel when run)."
    )
    print(f"monthly.json gas_sales cells written: {filled}", flush=True)
    return monthly


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--closed-through", default="")
    ap.add_argument("--skip-overlay", action="store_true")
    ap.add_argument("--skip-monthly", action="store_true")
    args = ap.parse_args()
    only = {x.strip() for x in args.only.split(",") if x.strip()}
    closed = args.closed_through or last_closed_month()
    print(f"last closed month: {closed}", flush=True)

    cookie = cookie_header()
    fuel = collect_fuel_sales(cookie, only or None)
    (REPO / "data").mkdir(exist_ok=True)
    (REPO / "data" / "fuel-sales-from-excel-2026.json").write_text(
        json.dumps(fuel, indent=2)
    )

    if not args.skip_overlay:
        overlay = api("/.netlify/functions/books-overlay")
        stations = neutralize_open_months(overlay.get("overlay") or {}, closed)
        if only:
            stations = [s for s in stations if s["id"] in only]
        print(f"overlay open-month neutralize: {len(stations)} stations", flush=True)
        if stations and not args.dry_run:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
                json.dump({"stations": stations}, fh)
                tmp = fh.name
            proc = subprocess.run(
                ["node", str(REPO / "scripts/publish-books.mjs"), "--file", tmp]
            )
            if proc.returncode != 0:
                raise SystemExit(proc.returncode)

    if not args.skip_monthly:
        monthly = patch_monthly_json(fuel, closed)
        out = REPO / "data" / "monthly.json"
        out.write_text(json.dumps(monthly, indent=2))
        print(f"wrote {out}", flush=True)
        if not (
            os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
        ):
            print(
                "CLOUDFLARE_API_TOKEN not set — live /data/monthly.json not deployed.",
                flush=True,
            )


if __name__ == "__main__":
    main()
