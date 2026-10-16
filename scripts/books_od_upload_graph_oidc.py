#!/usr/bin/env python3
"""Upload local Daily.xlsx bytes to OneDrive via Graph PUT (OIDC bearer from agent socket).

Does not print tokens. For cloud-agent books-audit OneDrive in-place updates.
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_SOCK = "/run/cursor/api.sock"
GRAPH_AUD = "https://graph.microsoft.com"
CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def fetch_graph_bearer(sock_path: str = DEFAULT_SOCK) -> str:
    body = json.dumps({"aud": GRAPH_AUD}).encode()
    req = (
        f"POST /v1/tokens/oidc HTTP/1.1\r\n"
        f"Host: localhost\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(body)}\r\n\r\n"
    ).encode() + body
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    s.settimeout(30)
    s.connect(sock_path)
    s.sendall(req)
    raw = b""
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        raw += chunk
    s.close()
    if b"\r\n\r\n" not in raw:
        raise SystemExit("OIDC socket: no HTTP body")
    body_text = raw.split(b"\r\n\r\n", 1)[1].decode()
    payload = json.loads(body_text)
    if "error" in payload:
        raise SystemExit(f"OIDC error: {payload.get('error')}")
    token = payload.get("token")
    if not token:
        raise SystemExit("OIDC response missing token")
    return token


def upload_item(
    bearer: str,
    drive_id: str,
    item_id: str,
    file_path: Path,
) -> tuple[int, int]:
    data = file_path.read_bytes()
    if len(data) > 4_000_000:
        raise SystemExit(f"file too large: {len(data)}")
    url = f"https://graph.microsoft.com/v1.0/drives/{drive_id}/items/{item_id}/content"
    req = urllib.request.Request(url, data=data, method="PUT")
    req.add_header("Authorization", f"Bearer {bearer}")
    req.add_header("Content-Type", CONTENT_TYPE)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return resp.status, len(data)
    except urllib.error.HTTPError as exc:
        err = exc.read(800).decode("utf-8", "replace")
        print(f"HTTP {exc.code} item={item_id}: {err}", file=sys.stderr)
        raise SystemExit(1) from exc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--drive-id", required=True)
    ap.add_argument("--item-id", required=True)
    ap.add_argument("--file", required=True, type=Path)
    ap.add_argument("--sock", default=DEFAULT_SOCK)
    args = ap.parse_args()
    bearer = fetch_graph_bearer(args.sock)
    status, nbytes = upload_item(bearer, args.drive_id, args.item_id, args.file)
    print(f"OK status={status} bytes={nbytes} item={args.item_id}")


if __name__ == "__main__":
    main()
