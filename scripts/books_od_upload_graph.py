#!/usr/bin/env python3
"""Upload a local file to OneDrive via Graph PUT using a tempauth bearer from downloadUrl.

Usage:
  python3 scripts/books_od_upload_graph.py \\
    --download-url 'https://...tempauth=v1....' \\
    --drive-id 'b!...' \\
    --item-id '01RVKK...' \\
    --file '/tmp/books_fix/xlsx/Charleston Daily.xlsx'

The downloadUrl comes from OneDrive MCP get_drive_item (@microsoft.graph.downloadUrl).
"""
from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


def extract_tempauth_bearer(download_url: str) -> str:
    m = re.search(r"tempauth=(v1\.[^&]+)", download_url)
    if not m:
        raise SystemExit("download URL missing tempauth= parameter")
    return m.group(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download-url", required=True)
    ap.add_argument("--drive-id", required=True)
    ap.add_argument("--item-id", required=True)
    ap.add_argument("--file", required=True, type=Path)
    args = ap.parse_args()
    data = args.file.read_bytes()
    if len(data) > 4_000_000:
        raise SystemExit(f"file too large for simple upload: {len(data)}")
    token = extract_tempauth_bearer(args.download_url)
    upload_url = (
        f"https://graph.microsoft.com/v1.0/drives/{args.drive_id}/items/{args.item_id}/content"
    )
    req = urllib.request.Request(upload_url, data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            body = resp.read(500)
            print(f"OK status={resp.status} bytes={len(data)} body={body[:120]!r}")
    except urllib.error.HTTPError as exc:
        err = exc.read(500)
        print(f"HTTP {exc.code}: {err!r}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
