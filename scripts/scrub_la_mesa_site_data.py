#!/usr/bin/env python3
"""Remove La Mesa (42642) from a smartsolutions-site data/ checkout.

The open-month rebuild already skips 42642 for daily_september.json / manager
home, but legacy portal files (stations, admin-stores, books, fuel, …) can
still carry La Mesa after an older deploy. Run this before wrangler deploy.

Usage:
  python3 scripts/scrub_la_mesa_site_data.py /path/to/smartsolutions-site
  python3 scripts/scrub_la_mesa_site_data.py /tmp/ss-site --through 2026-09-16
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SKIP = "42642"
SKIP_EMAILS = {"arcolamesa", "arcolamesa@outlook.com"}


def drop_id_keys(obj) -> int:
    removed = 0
    if isinstance(obj, dict):
        if SKIP in obj:
            del obj[SKIP]
            removed += 1
        for v in list(obj.values()):
            removed += drop_id_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            removed += drop_id_keys(v)
    return removed


def drop_station_rows(obj) -> int:
    removed = 0
    if isinstance(obj, dict):
        for key in ("stations", "stores", "ranking", "rows", "items"):
            rows = obj.get(key)
            if not isinstance(rows, list) or not rows:
                continue
            if isinstance(rows[0], dict):
                before = len(rows)
                obj[key] = [
                    x
                    for x in rows
                    if str(x.get("id") or x.get("store") or "") != SKIP
                    and x.get("name") != "La Mesa"
                    and x.get("client") != "La Mesa"
                ]
                removed += before - len(obj[key])
            elif all(isinstance(x, (str, int)) for x in rows):
                before = len(rows)
                obj[key] = [x for x in rows if str(x) != SKIP]
                removed += before - len(obj[key])
        for v in obj.values():
            if isinstance(v, (dict, list)):
                removed += drop_station_rows(v)
    elif isinstance(obj, list):
        for v in obj:
            if isinstance(v, (dict, list)):
                removed += drop_station_rows(v)
    return removed


def scrub_json_file(path: Path, through: str | None) -> int:
    data = json.loads(path.read_text())
    removed = 0

    if path.name == "managers.json" and isinstance(data, list):
        out = []
        for row in data:
            if isinstance(row, dict) and row.get("email") in SKIP_EMAILS:
                removed += 1
                continue
            if isinstance(row, dict) and isinstance(row.get("stores"), list):
                before = len(row["stores"])
                row["stores"] = [s for s in row["stores"] if str(s) != SKIP]
                removed += before - len(row["stores"])
            out.append(row)
        data = out
    elif path.name == "admin-stores.json" and isinstance(data, dict):
        before = len(data.get("stores") or [])
        data["stores"] = [
            s for s in (data.get("stores") or []) if str(s.get("store")) != SKIP
        ]
        removed += before - len(data["stores"])
    elif path.name == "logins.json" and isinstance(data, dict):
        accounts = data.get("accounts") or []
        if isinstance(accounts, list):
            before = len(accounts)
            data["accounts"] = [
                a
                for a in accounts
                if str((a or {}).get("station_id") or "") != SKIP
                and (a or {}).get("email") not in SKIP_EMAILS
                and "La Mesa" not in json.dumps(a)
            ]
            removed += before - len(data["accounts"])
    elif path.name == "profiles.json" and isinstance(data, dict):
        profiles = data.get("profiles") or []
        if isinstance(profiles, list):
            before = len(profiles)
            data["profiles"] = [
                p
                for p in profiles
                if (p or {}).get("email") not in SKIP_EMAILS
                and (p or {}).get("client") != "La Mesa"
                and (p or {}).get("name") != "La Mesa"
            ]
            removed += before - len(data["profiles"])
            for p in data["profiles"]:
                if isinstance(p.get("stores"), list):
                    p["stores"] = [
                        s
                        for s in p["stores"]
                        if not (
                            isinstance(s, dict)
                            and (
                                str(s.get("id")) == SKIP or s.get("name") == "La Mesa"
                            )
                        )
                        and str(s) != SKIP
                    ]
    else:
        removed += drop_station_rows(data)
        removed += drop_id_keys(data)

    if through and isinstance(data, dict) and path.name in {
        "stations.json",
        "fuel.json",
        "profit.json",
        "books.json",
        "daily_september.json",
    }:
        if "through" in data or path.name == "stations.json":
            data["through"] = through
        if "as_of" in data or path.name in {"books.json", "fuel.json", "profit.json"}:
            data["as_of"] = through

    if path.name == "books.json":
        path.write_text(json.dumps(data, separators=(",", ":")))
    else:
        path.write_text(json.dumps(data, indent=2) + "\n")
    return removed


def scrub_js_maps(site: Path) -> list[str]:
    touched = []
    patterns = [
        (re.compile(r'\n\s*"42642":\s*\{[^}]*"scans_layout"[^}]*\},', re.S), ""),
        (re.compile(r'\n\s*"42642":\s*"La Mesa",'), ""),
        (re.compile(r'\n\s*"arcolamesa@outlook\.com":\s*\["42642"\],'), ""),
        (re.compile(r'\n\s*"arcolamesa":\s*\["42642"\],'), ""),
        (re.compile(r"\n\s*arcolamesa:\s*\\[\"42642\"\\],"), ""),
        (re.compile(r',\s*"42642":\s*1'), ""),
        (re.compile(r'"42642":\s*1,\s*'), ""),
    ]
    for rel in (
        "src/handlers/stations.js",
        "src/handlers/mgr-vendor-schedule.js",
        "src/lib/books-store.js",
        "src/lib/extract-books.js",
        "netlify/functions/lib/books-store.js",
        "netlify/functions/lib/books-store.mjs",
        "netlify/functions/lib/extract-books.js",
    ):
        path = site / rel
        if not path.exists():
            continue
        text = path.read_text()
        new = text
        for rx, repl in patterns:
            new = rx.sub(repl, new)
        if new != text:
            path.write_text(new)
            touched.append(rel)
    return touched


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("site", type=Path, help="smartsolutions-site checkout root")
    ap.add_argument("--through", default=None, help="optional as_of/through bump")
    args = ap.parse_args()
    data = args.site / "data"
    if not data.is_dir():
        print(f"no data/ under {args.site}", file=sys.stderr)
        return 2

    total = 0
    for path in sorted(data.rglob("*.json")):
        raw = path.read_text()
        if SKIP not in raw and "La Mesa" not in raw and "arcolamesa" not in raw.lower():
            continue
        # Drop per-store vendor artifact
        if path.name == f"{SKIP}.json" and "by-store" in str(path):
            path.unlink()
            print(f"deleted {path.relative_to(args.site)}")
            continue
        try:
            n = scrub_json_file(path, args.through)
        except Exception as e:
            print(f"skip {path}: {e}", file=sys.stderr)
            continue
        still = SKIP in path.read_text() or "La Mesa" in path.read_text()
        print(f"{path.relative_to(args.site)}: removed~{n} still={still}")
        total += n

    for rel in scrub_js_maps(args.site):
        print(f"scrubbed js {rel}")

    print(f"done removed~{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
