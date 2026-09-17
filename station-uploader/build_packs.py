#!/usr/bin/env python3
"""Build per-station install packs (zip + PASTE_INSTALL.txt) for OneDrive."""
from __future__ import annotations

import base64
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UPLOADER = Path(__file__).resolve().parent
STATIONS_JS = ROOT / "cloudflare" / "scan-ingest" / "stations.js"
TOKENS_JSON = ROOT / "cloudflare" / "scan-ingest" / "station-tokens.local.json"
API = "https://smartsolutionsai.us/api/scan-ingest"
ALT_API = "https://smartsolutions-site.smartsolutionsai.workers.dev/api/scan-ingest"
WATCH = r"C:\Scans"
SENT = r"C:\Scans\Sent"
INSTALL_DIR = r"C:\SmartSolutions\ScanUploader"
TASK = "SmartSolutionsScanUploader"


def load_stations() -> dict:
    body = STATIONS_JS.read_text(encoding="utf-8").replace("export default", "stations =").strip().rstrip(";")
    ns: dict = {}
    exec(body, ns)
    return ns["stations"]


def slug(sid: str, name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", f"{sid}_{name}").strip("_")


def main() -> None:
    import argparse
    import shutil

    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default="/tmp/station-uploader-packs")
    args = ap.parse_args()
    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    stations = load_stations()
    tokens = json.loads(TOKENS_JSON.read_text(encoding="utf-8"))
    scan_ps1 = (UPLOADER / "ScanUploader.ps1").read_bytes()
    install_ps1 = (UPLOADER / "Install-ScanUploader.ps1").read_bytes()
    uninstall_ps1 = (UPLOADER / "Uninstall-ScanUploader.ps1").read_bytes()

    for sid, meta in stations.items():
        if sid not in tokens:
            raise SystemExit(f"missing token for {sid}")
        name = meta["name"]
        folder = slug(sid, name)
        d = out / folder
        d.mkdir()
        cfg = {
            "station_id": sid,
            "station_token": tokens[sid],
            "api_url": API,
            "alternate_api_url": ALT_API,
            "watch_folder": WATCH,
            "sent_folder": SENT,
            "poll_seconds": 15,
            "stable_seconds": 5,
        }
        (d / "config.json").write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
        (d / "ScanUploader.ps1").write_bytes(scan_ps1)
        (d / "Install-ScanUploader.ps1").write_bytes(install_ps1)
        (d / "Uninstall-ScanUploader.ps1").write_bytes(uninstall_ps1)
        bat = (
            "@echo off\r\n"
            'cd /d "%~dp0"\r\n'
            f"echo Installing ScanUploader for station {sid} ({name})\r\n"
            'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-ScanUploader.ps1" '
            f'-StationId {sid} -StationToken "{tokens[sid]}" -WatchFolder "C:\\Scans" '
            f'-ApiUrl "{API}" -AlternateApiUrl "{ALT_API}"\r\n'
            "echo.\r\n"
            "echo Exit code: %ERRORLEVEL%\r\n"
            "pause\r\n"
        )
        (d / "INSTALL.bat").write_bytes(bat.encode("ascii", "ignore"))
        (d / "README.txt").write_text(
            f"Station: {name} ({sid})\n"
            "Watch folder: C:\\Scans\n\n"
            "1. Extract this zip to Desktop (not zip preview).\n"
            "2. Double-click INSTALL.bat\n"
            "3. Or open PASTE_INSTALL.txt, copy all, paste into PowerShell.\n",
            encoding="ascii",
            errors="ignore",
        )
        up_b64 = base64.b64encode(scan_ps1).decode("ascii")
        cfg_b64 = base64.b64encode((json.dumps(cfg, indent=2) + "\n").encode()).decode("ascii")
        paste = f"""# Station {sid} ({name}) one-shot installer (ASCII only)
$ErrorActionPreference = 'Stop'
$InstallDir = '{INSTALL_DIR}'
$WatchFolder = '{WATCH}'
$SentFolder = '{SENT}'
$TaskName = '{TASK}'

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $WatchFolder | Out-Null
New-Item -ItemType Directory -Force -Path $SentFolder | Out-Null

$upB64 = '{up_b64}'
$cfgB64 = '{cfg_b64}'
[IO.File]::WriteAllBytes((Join-Path $InstallDir 'ScanUploader.ps1'), [Convert]::FromBase64String($upB64))
[IO.File]::WriteAllBytes((Join-Path $InstallDir 'config.json'), [Convert]::FromBase64String($cfgB64))

$ps = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'
$arg = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $InstallDir 'ScanUploader.ps1') + '"'

$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $userId) {{ $userId = "$env:USERDOMAIN\\$env:USERNAME" }}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $userId
$triggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
try {{
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($triggerLogon, $triggerRepeat) -Settings $settings -User $userId -RunLevel Limited -Force | Out-Null
}} catch {{
  $tr = '"' + $ps + '" ' + $arg
  $p = Start-Process -FilePath ($env:SystemRoot + '\\System32\\schtasks.exe') -ArgumentList @('/Create','/TN',$TaskName,'/TR',$tr,'/SC','ONLOGON','/RL','LIMITED','/F') -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) {{ throw ('Failed to register scheduled task for ' + $userId) }}
  Start-Process -FilePath ($env:SystemRoot + '\\System32\\schtasks.exe') -ArgumentList @('/Create','/TN',($TaskName + 'KeepAlive'),'/TR',$tr,'/SC','MINUTE','/MO','5','/RL','LIMITED','/F') -Wait -PassThru -NoNewWindow | Out-Null
}}

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object {{ $_.CommandLine -and $_.CommandLine -like '*ScanUploader.ps1*' }} |
  ForEach-Object {{ try {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }} catch {{}} }}

Start-Process -FilePath $ps -ArgumentList $arg -WindowStyle Hidden
Write-Host 'SUCCESS'
Write-Host ('Station: {sid} ({name})')
Write-Host ('UserId: ' + $userId)
Write-Host 'Put a PDF in C:\\Scans and wait about 20 seconds.'
Write-Host 'Log: C:\\SmartSolutions\\ScanUploader\\uploader.log'
"""
        (d / "PASTE_INSTALL.txt").write_text(paste, encoding="ascii")
        zip_path = out / f"{folder}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in d.iterdir():
                zf.write(f, arcname=f.name)
        print(zip_path.name, zip_path.stat().st_size)

    print(f"wrote {len(stations)} packs to {out}")


if __name__ == "__main__":
    main()
