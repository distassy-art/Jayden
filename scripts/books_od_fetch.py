#!/usr/bin/env python3
"""Download OneDrive files from short-lived @microsoft.graph.downloadUrl values.

The agent obtains URLs via OneDrive MCP get_drive_item, writes a manifest, then:

  python3 scripts/books_od_fetch.py /tmp/books_fix/pdf_manifest.json

Manifest entries: {"url": "...", "dest": "/tmp/s2k/exports/..."}
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: books_od_fetch.py MANIFEST.json")
    manifest = json.loads(Path(sys.argv[1]).read_text())
    ok, fail = 0, 0
    for entry in manifest:
        url = entry["url"]
        dest = Path(entry["dest"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            urllib.request.urlretrieve(url, dest)
            ok += 1
            print(f"OK {dest.name} ({dest.stat().st_size} bytes)")
        except Exception as exc:
            fail += 1
            print(f"FAIL {dest}: {exc}")
    print(f"done ok={ok} fail={fail}")
    if fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
