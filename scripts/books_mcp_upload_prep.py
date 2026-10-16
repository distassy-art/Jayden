#!/usr/bin/env python3
"""Prepare OneDrive MCP create_or_update_file args for an xlsx (≤1MB).

Writes JSON to --out with itemId, contentType, base64Content for MCP upload.
"""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--item-id", required=True)
    ap.add_argument("--xlsx", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args()
    data = args.xlsx.read_bytes()
    if len(data) > 1_000_000:
        raise SystemExit(f"file too large for MCP: {len(data)} bytes")
    payload = {
        "itemId": args.item_id,
        "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "base64Content": base64.b64encode(data).decode("ascii"),
    }
    args.out.write_text(json.dumps(payload) + "\n")
    print(f"wrote {args.out} bytes={len(data)}")


if __name__ == "__main__":
    main()
