#!/usr/bin/env python3
"""Build one install zip per station, with that station's token baked in.

Each zip is what gets copied to a store PC: the uploader scripts plus an
`INSTALL.cmd` that runs the installer with the right station id and token, so
nobody at the store has to type a secret or read a manual.

  python3 cloudflare/scan-ingest/build-station-packs.py [--out DIR] [--station ID ...]

Tokens come from `station-tokens.local.json`, which is gitignored — generate it
with `generate_tokens.py` first. The zips contain live credentials; keep them
out of the repo and off shared drives.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
UPLOADER = REPO / "station-uploader"
TOKENS = HERE / "station-tokens.local.json"
STATIONS = HERE / "stations.js"
API_URL = "https://smartsolutionsai.us/api/scan-ingest"
SCRIPTS = ("ScanUploader.ps1", "Install-ScanUploader.ps1", "Uninstall-ScanUploader.ps1")

INSTALL_CMD = """@echo off
REM One-click install for {name} (station {sid}).
REM Right-click this file and choose "Run as administrator" if the task does not register.
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\\Install-ScanUploader.ps1" ^
  -StationId {sid} ^
  -StationToken "{token}" ^
  -WatchFolder "C:\\Scans" ^
  -ApiUrl "{api}"
echo.
pause
"""

README = """{name} — scan auto-upload (station {sid})

Install (once, on the store PC):
  1. Copy this whole folder to the PC (anywhere, e.g. the Desktop).
  2. Double-click INSTALL.cmd and wait for "Installed."
  3. Set the scanner's "save to" folder to C:\\Scans

After that:
  Save or scan every invoice into C:\\Scans. Nothing else to do — each PDF is
  uploaded within about 20 seconds and then moved into C:\\Scans\\Sent.

Uploads land in the Smart Solutions OneDrive under:
  {dest}

To remove it:
  powershell -ExecutionPolicy Bypass -File .\\Uninstall-ScanUploader.ps1

The token in INSTALL.cmd identifies this station only. Do not share the folder
between stores — each store has its own pack.
"""


def load_stations() -> dict:
    text = STATIONS.read_text().replace("export default ", "").strip().rstrip(";")
    return json.loads(text)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="/tmp/station-uploader-packs", type=Path)
    parser.add_argument("--station", action="append", metavar="ID", help="Limit to these stations")
    args = parser.parse_args()

    if not TOKENS.exists():
        raise SystemExit(f"Missing {TOKENS} — run: python3 {HERE / 'generate_tokens.py'}")
    tokens = json.loads(TOKENS.read_text())
    stations = load_stations()

    wanted = args.station or sorted(stations)
    out: Path = args.out
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    for sid in wanted:
        station = stations.get(sid)
        token = tokens.get(sid)
        if not station or not token:
            print(f"skip {sid}: {'no station entry' if not station else 'no token'}")
            continue
        name = station["name"]
        pack = out / f"scan-uploader-{sid}-{slug(name)}.zip"
        with zipfile.ZipFile(pack, "w", zipfile.ZIP_DEFLATED) as zf:
            for script in SCRIPTS:
                zf.write(UPLOADER / script, script)
            zf.writestr("INSTALL.cmd", INSTALL_CMD.format(sid=sid, name=name, token=token, api=API_URL))
            zf.writestr(
                "README.txt",
                README.format(sid=sid, name=name, dest=station["dest"]),
            )
        pack.chmod(0o600)
        print(f"{pack}  ({name})")

    print(f"\n{len(list(out.glob('*.zip')))} packs in {out}")


if __name__ == "__main__":
    main()
