#!/usr/bin/env python3
"""Generate per-station upload tokens (local only — do not commit)."""
from __future__ import annotations

import argparse
import json
import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIONS_JS = ROOT / "stations.js"
OUT = ROOT / "station-tokens.local.json"


def load_stations() -> dict:
    text = STATIONS_JS.read_text().replace("export default ", "").strip().rstrip(";")
    return json.loads(text)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Overwrite existing local tokens")
    args = ap.parse_args()
    stations = load_stations()
    if OUT.exists() and not args.force:
        print(f"Exists: {OUT} (pass --force to regenerate)")
        return
    tokens = {sid: secrets.token_urlsafe(24) for sid in stations}
    OUT.write_text(json.dumps(tokens, indent=2) + "\n")
    OUT.chmod(0o600)
    print(f"Wrote {OUT} ({len(tokens)} stations)")


if __name__ == "__main__":
    main()
