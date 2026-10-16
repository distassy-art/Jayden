#!/usr/bin/env python3
"""Upload local Daily.xlsx files using tempauth from get_drive_item downloadUrl manifest.

Manifest JSON array:
  [{"storeId":"42281","itemId":"...","downloadUrl":"https://...tempauth=...","file":"/tmp/..."}]

Does not log tokens. For books-audit OneDrive in-place updates.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
UPLOAD = REPO / "scripts/books_od_upload_graph.py"
DRIVE_ID = "b!62jzo50hZkmt_4BVO3hC6uT330U6ivhGvMy_OL6aLXZhQbJZ3ScpT6ETCafYhUyQ"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path)
    args = ap.parse_args()
    entries = json.loads(args.manifest.read_text())
    ok, fail = [], []
    for e in entries:
        sid = e.get("storeId", e.get("itemId", "?"))
        cmd = [
            sys.executable,
            str(UPLOAD),
            "--download-url",
            e["downloadUrl"],
            "--drive-id",
            DRIVE_ID,
            "--item-id",
            e["itemId"],
            "--file",
            e["file"],
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            ok.append((sid, r.stdout.strip()))
        else:
            fail.append((sid, (r.stderr or r.stdout).strip()[:300]))
    print(json.dumps({"ok": ok, "fail": fail}, indent=2))
    if fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
