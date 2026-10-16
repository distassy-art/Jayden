#!/usr/bin/env python3
"""Upload xlsx to OneDrive via MCP create_or_update_file using prepared JSON.

Reads upload/*.json (from books_mcp_upload_prep.py) and prints MCP args size.
Actual MCP call must be done by the agent (CallDynamicTool); this script validates payloads.

Usage:
  python3 scripts/books_mcp_upload_from_json.py /tmp/books_fix/upload/42281.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: books_mcp_upload_from_json.py UPLOAD.json")
    payload = json.loads(Path(sys.argv[1]).read_text())
    b64 = payload.get("base64Content", "")
    print(
        json.dumps(
            {
                "itemId": payload["itemId"],
                "contentType": payload.get(
                    "contentType",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                ),
                "base64_len": len(b64),
                "bytes_approx": len(b64) * 3 // 4,
            }
        )
    )


if __name__ == "__main__":
    main()
