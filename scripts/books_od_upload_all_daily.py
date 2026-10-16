#!/usr/bin/env python3
"""Upload all prepared Daily.xlsx files from /tmp/books_fix/xlsx via Graph OIDC."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ITEMS = REPO / "scripts/data/onedrive_daily_items.json"
XLSX_DIR = Path("/tmp/books_fix/xlsx")
UPLOAD_SCRIPT = REPO / "scripts/books_od_upload_graph_oidc.py"
# Same drive for all BIG DADDY client Daily workbooks (Mina OneDrive).
DRIVE_ID = "b!62jzo50hZkmt_4BVO3hC6uT330U6ivhGvMy_OL6aLXZhQbJZ3ScpT6ETCafYhUyQ"

NAME_BY_ID = {
    "42004": "Arco Placentia Daily.xlsx",
    "42021": "Westminster Daily.xlsx",
    "42048": "San Diego Daily.xlsx",
    "42098": "Brookhurst 75 Daily.xlsx",
    "42179": "Arco HB Daily.xlsx",
    "42279": "Koval Daily.xlsx",
    "42280": "Spring Mtn Daily.xlsx",
    "42281": "Charleston Daily.xlsx",
    "42282": "Oakey Las Vegas Blvd Daily.xlsx",
    "42352": "Arco Db Daily.xlsx",
    "42359": "Paradise Daily.xlsx",
    "42399": "Garden Grove Daily.xlsx",
    "42438": "Vista Daily.xlsx",
    "42439": "Lamb Daily.xlsx",
    "42674": "Tustin Daily.xlsx",
}


def main() -> None:
    items = json.loads(ITEMS.read_text())
    ok, fail = [], []
    for sid, meta in sorted(items.items()):
        fname = NAME_BY_ID.get(sid) or meta.get("file")
        path = XLSX_DIR / fname
        if not path.is_file():
            fail.append((sid, "missing local xlsx"))
            continue
        cmd = [
            sys.executable,
            str(UPLOAD_SCRIPT),
            "--drive-id",
            DRIVE_ID,
            "--item-id",
            meta["itemId"],
            "--file",
            str(path),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            ok.append((sid, r.stdout.strip()))
        else:
            fail.append((sid, (r.stderr or r.stdout).strip()[:200]))
    print(json.dumps({"ok": ok, "fail": fail}, indent=2))
    if fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
