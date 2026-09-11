#!/usr/bin/env python3
"""Scheduled Clients Excel → smartsolutionsai.us books overlay sync.

Walks Documents/Clients on Smart Solutions OneDrive, downloads each store's
Daily / Monthly Summary / ExtraMile operational workbook, extracts rows, and
publishes via scripts/publish-books.mjs.

Auth: SharePoint cookies in /tmp/od_cookies.json (FedAuth).

Usage:
  python3 scripts/sync_books_scheduled.py [--dry-run] [--min-month YYYY-MM]
                                          [--only 42179,42004] [--workdir DIR]

Schedule (option 1 — timed sync): Wednesday and Sunday 10:00 AM Pacific.
  Cron (PDT / UTC-7): 0 17 * * 0,3
"""
from __future__ import annotations

import argparse
import json
import re
import ssl
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

HOST = "https://smartsolutionsai26-my.sharepoint.com"
PERSONAL = "minamorcos_smartsolutionsai26_onmicrosoft_com"
BASE = f"{HOST}/personal/{PERSONAL}"
ROOT = f"/personal/{PERSONAL}/Documents/Clients"
DEFAULT_COOKIES = Path("/tmp/od_cookies.json")
SSL_CTX = ssl.create_default_context()
REPO = Path(__file__).resolve().parents[1]

STATIONS: dict[str, str] = {
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

SKIP_PARTS = (
    "client scans",
    "_archived",
    "template",
    "store services",
    "_admin",
    "_agentuploadtest",
    "/invoices/",
    "/pdf/",
)

# Folder names we never descend into (case-insensitive).
SKIP_FOLDER_NAMES = {
    "pdf",
    "invoices",
    "client scans",
    "scans",
    "template",
    "_archived",
    "_admin",
    "_agentuploadtest",
    "store services",
}

FOLDER_ID_RE = re.compile(r"(?:^|/)(\d{5})\b")


def cookie_header(path: Path) -> str:
    cookies = json.loads(path.read_text())
    return "; ".join(
        f"{c['name']}={c['value']}"
        for c in cookies
        if "sharepoint" in c.get("domain", "")
    )


def sp_json(url: str, cookie: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "Cookie": cookie,
            "Accept": "application/json;odata=verbose",
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=120) as resp:
        return json.load(resp)["d"]


def download_file(server_rel: str, cookie: str) -> bytes:
    url = (
        BASE
        + f"/_api/web/GetFileByServerRelativeUrl('{urllib.parse.quote(server_rel)}')/$value"
    )
    req = urllib.request.Request(
        url,
        headers={"Cookie": cookie, "Accept": "*/*", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=180) as resp:
        return resp.read()


def skip_path(server_rel: str) -> bool:
    low = server_rel.lower().replace("\\", "/")
    return any(p in low for p in SKIP_PARTS)


def list_children(folder: str, cookie: str, kind: str) -> list[dict]:
    """kind is 'Files' or 'Folders'."""
    enc = urllib.parse.quote(folder)
    select = (
        "Name,ServerRelativeUrl,Length,TimeLastModified"
        if kind == "Files"
        else "Name,ServerRelativeUrl"
    )
    try:
        return sp_json(
            BASE
            + f"/_api/web/GetFolderByServerRelativeUrl('{enc}')/{kind}"
            + f"?$select={select}&$top=200",
            cookie,
        )["results"]
    except urllib.error.HTTPError as exc:
        print(f"warn: {kind} {folder}: {exc.code}", file=sys.stderr, flush=True)
        return []


def walk_files(folder: str, cookie: str, depth: int = 0) -> list[dict]:
    """List Excel-relevant files in a station folder.

    Daily / Monthly / ExtraMile workbooks live at the station folder root.
    Do not recurse into PDF / Vendor / pricing subfolders.
    """
    if skip_path(folder):
        return []
    return list_children(folder, cookie, "Files")



def discover_station_folders(cookie: str, only: set[str]) -> list[str]:
    """Return server-relative folder paths to scan for each active station."""
    roots = list_children(ROOT, cookie, "Folders")
    targets: list[str] = []
    for folder in roots:
        name = folder.get("Name") or ""
        rel = folder.get("ServerRelativeUrl") or ""
        low = name.lower()
        if low in SKIP_FOLDER_NAMES or low.startswith("_"):
            continue
        if low == "extramile":
            if not only or "extramile" in only:
                targets.append(rel)
            continue
        m = FOLDER_ID_RE.search(name)
        if m and m.group(1) in STATIONS:
            if not only or m.group(1) in only:
                targets.append(rel)
            continue
        # BIG DADDY (or similar) multi-store parent
        if "daddy" in low or "big" in low:
            for child in list_children(rel, cookie, "Folders"):
                cname = child.get("Name") or ""
                if cname.lower() in SKIP_FOLDER_NAMES:
                    continue
                cm = FOLDER_ID_RE.search(cname)
                if not cm:
                    continue
                sid = cm.group(1)
                if sid in STATIONS and (not only or sid in only):
                    targets.append(child["ServerRelativeUrl"])
    return targets


def station_from_path(server_rel: str, filename: str) -> tuple[str, str] | None:
    if filename.lower() == "extramile.xlsx":
        return "extramile", STATIONS["extramile"]
    m = FOLDER_ID_RE.search(server_rel.replace("\\", "/"))
    if not m:
        return None
    sid = m.group(1)
    if sid not in STATIONS:
        return None
    return sid, STATIONS[sid]


def classify(filename: str) -> str | None:
    n = filename.lower()
    if n == "extramile.xlsx":
        return "extramile"
    if n.startswith("extramile "):
        return None
    if n.endswith(" daily.xlsx"):
        return "daily"
    if "monthly summary" in n and n.endswith(".xlsx"):
        return "monthly"
    if n.endswith(" monthly.xlsx"):
        return "monthly"
    return None


def run_json(cmd: list[str]):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"cmd failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr[-1000:]}"
        )
    raw = proc.stdout.strip()
    return json.loads(raw) if raw else {}


def day_score(row: dict) -> int:
    return sum(
        1
        for k in ("gas_vol", "gas_profit", "sales", "store_profit", "total_profit")
        if isinstance(row.get(k), (int, float)) and row.get(k) not in (0, 0.0)
    )


def merge_days(*groups) -> list[dict]:
    by: dict[str, dict] = {}
    for rows in groups:
        for d in rows or []:
            if not d or not d.get("date"):
                continue
            prev = by.get(d["date"])
            if prev is None or day_score(d) >= day_score(prev):
                merged = dict(prev or {})
                merged.update({k: v for k, v in d.items() if v is not None})
                by[d["date"]] = merged
    return [by[k] for k in sorted(by)]


def days_from_patch(patch: dict) -> list[dict]:
    if not isinstance(patch, dict):
        return []
    by: dict[str, dict] = {}

    def add(rows):
        for d in rows or []:
            if d and d.get("date"):
                by[d["date"]] = d

    add(patch.get("daily"))
    for key, val in patch.items():
        if not str(key).startswith("daily") or key == "daily":
            continue
        if not isinstance(val, list):
            continue
        for pack in val:
            if isinstance(pack, dict) and isinstance(pack.get("days"), list):
                add(pack["days"])
    return [by[k] for k in sorted(by)]


def is_placeholder_month(days: list[dict]) -> bool:
    if not days:
        return True
    for d in days:
        for k in ("gas_vol", "gas_profit", "sales", "store_profit", "total_profit"):
            v = d.get(k)
            if isinstance(v, (int, float)) and v != 0:
                return False
    return True


def build_daily(
    path: Path, sid: str, name: str, filename: str, min_month: str
) -> dict | None:
    parsed: dict = {}
    try:
        parsed = run_json(["node", str(REPO / "scripts/parse-book.mjs"), str(path)])
    except Exception as exc:
        # San Diego / Garden Grove often fail books-parse; sheet extract still works.
        print(f"  parse-book skipped: {exc}")
    extracted = run_json(
        [
            "python3",
            str(REPO / "scripts/extract-daily-month-sheets.py"),
            str(path),
            "--min-month",
            min_month,
        ]
    )
    if not isinstance(extracted, list):
        extracted = []

    by_month: dict[str, list] = {}
    for d in extracted:
        by_month.setdefault(str(d["date"])[:7], []).append(d)
    cleaned: list[dict] = []
    for month, rows in by_month.items():
        if is_placeholder_month(rows):
            print(f"  skip empty placeholder month {month}")
            continue
        cleaned.extend(rows)

    days = merge_days(days_from_patch(parsed.get("patch") or {}), cleaned)
    months: dict = {}
    patch = parsed.get("patch") or {}
    if isinstance(patch.get("monthly"), dict):
        months = patch["monthly"]
    if not days and not months:
        return None
    period = days[-1]["date"][:7] if days else str(parsed.get("period") or "")
    return {
        "file": filename,
        "kind": "daily",
        "id": sid,
        "name": name,
        "period": period,
        "days": days,
        "months": months,
        "kpis": parsed.get("kpis") or {},
    }


def build_monthly(path: Path, sid: str, name: str, filename: str) -> dict | None:
    parsed: dict = {}
    try:
        parsed = run_json(["node", str(REPO / "scripts/parse-book.mjs"), str(path)])
    except Exception as exc:
        print(f"  parse-book skipped: {exc}")
    patch = parsed.get("patch") or {}
    months = patch.get("monthly") if isinstance(patch.get("monthly"), dict) else {}
    if not months:
        try:
            fuel = run_json(
                [
                    "python3",
                    str(REPO / "scripts/extract-fuel-summary-months.py"),
                    str(path),
                    sid,
                    name,
                ]
            )
            patches = fuel.get("patches") if isinstance(fuel, dict) else None
            if patches:
                m = (patches[0].get("patch") or {}).get("monthly")
                if isinstance(m, list) and m and isinstance(m[0], dict):
                    months = m[0].get("months") or {}
                elif isinstance(m, dict):
                    months = m
        except Exception as exc:
            print(f"  fuel-summary fallback failed: {exc}")
    if not months:
        return None
    return {
        "file": filename,
        "kind": "monthly",
        "id": sid,
        "name": name,
        "period": str(parsed.get("period") or ""),
        "days": [],
        "months": months,
        "kpis": parsed.get("kpis") or {},
    }


def build_extramile(path: Path) -> dict | None:
    payload = run_json(
        ["python3", str(REPO / "scripts/extract-extramile-book.py"), str(path)]
    )
    patches = payload.get("patches") if isinstance(payload, dict) else None
    if not patches:
        return None
    p = patches[0]
    patch = p.get("patch") or {}
    days = days_from_patch(patch)
    months: dict = {}
    monthly = patch.get("monthly")
    if isinstance(monthly, list) and monthly and isinstance(monthly[0], dict):
        months = monthly[0].get("months") or {}
    elif isinstance(monthly, dict):
        months = monthly
    if not days and not months:
        return None
    store = p.get("store") or {}
    return {
        "file": p.get("file") or "Extramile.xlsx",
        "kind": "daily",
        "id": str(store.get("id") or "extramile"),
        "name": str(store.get("name") or "ExtraMile"),
        "period": p.get("period") or (days[-1]["date"][:7] if days else ""),
        "days": days,
        "months": months if isinstance(months, dict) else {},
        "kpis": {},
    }



def last_closed_month_pt() -> str:
    """Previous calendar month in America/Los_Angeles (open month is never closed)."""
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("America/Los_Angeles")).date()
    y, m = today.year, today.month
    if m == 1:
        return f"{y - 1}-12"
    return f"{y}-{m - 1:02d}"


def strip_open_months(stations: list[dict], closed: str | None = None) -> list[dict]:
    """Keep days for MTD, but drop/zero months after last closed month for Trends."""
    closed = closed or last_closed_month_pt()
    out = []
    for s in stations:
        st = dict(s)
        months = {}
        for key, rec in (st.get("months") or {}).items():
            if key <= closed:
                months[key] = rec
            else:
                # Neutralize so isRealMonth fails if merge keeps the key
                months[key] = {
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
        st["months"] = months
        out.append(st)
    return out


def merge_stations(items: list[dict]) -> list[dict]:
    by: dict[str, dict] = {}
    for s in items:
        sid = s["id"]
        cur = by.get(sid)
        if not cur:
            by[sid] = {
                "file": s.get("file"),
                "kind": s.get("kind") or "daily",
                "id": sid,
                "name": s.get("name") or sid,
                "period": s.get("period") or "",
                "days": list(s.get("days") or []),
                "months": dict(s.get("months") or {}),
                "kpis": dict(s.get("kpis") or {}),
            }
            continue
        cur["days"] = merge_days(cur.get("days"), s.get("days"))
        months = dict(cur.get("months") or {})
        months.update(s.get("months") or {})
        cur["months"] = months
        if s.get("kind") == "daily":
            cur["file"] = s.get("file") or cur.get("file")
            cur["kind"] = "daily"
        if cur.get("days"):
            cur["period"] = cur["days"][-1]["date"][:7]
        elif s.get("period"):
            cur["period"] = s["period"]
        kpis = dict(cur.get("kpis") or {})
        kpis.update(s.get("kpis") or {})
        cur["kpis"] = kpis
    return [by[k] for k in sorted(by)]


def _publish_payload(stations: list[dict], dry_run: bool, label: str) -> None:
    payload = {"stations": stations}
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
        json.dump(payload, fh)
        tmp = fh.name
    cmd = ["node", str(REPO / "scripts/publish-books.mjs"), "--file", tmp]
    if dry_run:
        cmd.append("--dry-run")
    print(f"publish [{label}]:", " ".join(cmd), f"({len(stations)} stations)")
    proc = subprocess.run(cmd)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def publish(stations: list[dict], dry_run: bool) -> None:
    """Two-phase publish so open-month days don't rebuild Trends months.

    Worker mergeStation overwrites any month touched by incoming days via
    monthsFromDays. Phase 1 pushes days (+ closed months). Phase 2 pushes
    empty days with neutralized open months so those keys stay non-real for
    /new analytics.js majority closedMonths logic.
    """
    closed = last_closed_month_pt()
    phase1 = []
    phase2 = []
    for s in stations:
        st = dict(s)
        months = dict(st.get("months") or {})
        open_months = {k: v for k, v in months.items() if k > closed}
        closed_months = {k: v for k, v in months.items() if k <= closed}
        st1 = dict(st)
        st1["months"] = closed_months
        phase1.append(st1)
        if open_months:
            phase2.append(
                {
                    "file": st.get("file") or f"{st['id']}.xlsx",
                    "kind": st.get("kind") or "daily",
                    "id": st["id"],
                    "name": st.get("name") or st["id"],
                    "period": closed,
                    "days": [],
                    "months": open_months,
                    "kpis": {},
                }
            )
    _publish_payload(phase1, dry_run, "days+closed-months")
    if phase2:
        _publish_payload(phase2, dry_run, "neutralize-open-months")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--min-month",
        default=date.today().strftime("%Y-%m"),
        help="YYYY-MM lower bound for Daily sheet extraction (default: current month)",
    )
    ap.add_argument("--only", default="", help="comma-separated station ids")
    ap.add_argument("--workdir", default="", help="keep downloaded xlsx here")
    ap.add_argument("--cookies", default=str(DEFAULT_COOKIES))
    args = ap.parse_args()

    cookie_path = Path(args.cookies)
    if not cookie_path.exists():
        raise SystemExit(f"missing cookies: {cookie_path}")
    cookie = cookie_header(cookie_path)

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    work = (
        Path(args.workdir)
        if args.workdir
        else Path(tempfile.mkdtemp(prefix="books-sync-"))
    )
    work.mkdir(parents=True, exist_ok=True)
    print(f"workdir {work}", flush=True)
    print(f"min-month {args.min_month}", flush=True)

    print("discovering station folders …", flush=True)
    targets = discover_station_folders(cookie, only)
    print(f"scanning {len(targets)} station folders", flush=True)
    files: list[dict] = []
    for folder in targets:
        files.extend(walk_files(folder, cookie))
    print(f"found {len(files)} files in station folders", flush=True)

    by_key: dict[tuple[str, str], tuple] = {}
    for f in files:
        name = f.get("Name") or ""
        rel = f.get("ServerRelativeUrl") or ""
        if skip_path(rel):
            continue
        kind = classify(name)
        if not kind:
            continue
        st = station_from_path(rel, name)
        if not st:
            continue
        sid, sname = st
        if only and sid not in only:
            continue
        key = (sid, kind)
        prev = by_key.get(key)
        if prev is None or ("(1)" in prev[4] and "(1)" not in name):
            by_key[key] = (kind, sid, sname, rel, name)

    chosen = sorted(by_key.values(), key=lambda r: (r[1], r[0]))
    print(f"selected {len(chosen)} workbooks")

    built: list[dict] = []
    for kind, sid, sname, rel, name in chosen:
        print(f"• {sid} {sname} [{kind}] {name}")
        try:
            data = download_file(rel, cookie)
        except Exception as exc:
            print(f"  download failed: {exc}")
            continue
        local = work / f"{sid}_{kind}_{name}".replace(" ", "_")
        local.write_bytes(data)
        try:
            if kind == "daily":
                st = build_daily(local, sid, sname, name, args.min_month)
            elif kind == "monthly":
                st = build_monthly(local, sid, sname, name)
            else:
                st = build_extramile(local)
        except Exception as exc:
            print(f"  extract failed: {exc}")
            continue
        if not st:
            print("  no usable rows")
            continue
        last = (st.get("days") or [{}])[-1].get("date") if st.get("days") else "—"
        print(
            f"  → days={len(st.get('days') or [])} last={last} "
            f"months={len(st.get('months') or {})}"
        )
        built.append(st)

    stations = merge_stations(built)
    if not stations:
        raise SystemExit("no stations built — nothing to publish")
    closed = last_closed_month_pt()
    stations = strip_open_months(stations, closed)
    print(f"publishing {len(stations)} stations (months closed through {closed})")
    publish(stations, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
