#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$InstallDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigPath = Join-Path $InstallDir "config.json"
$LogPath = Join-Path $InstallDir "uploader.log"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch {}
}

function Read-Config {
  if (-not (Test-Path $ConfigPath)) { throw "Missing $ConfigPath" }
  return Get-Content -Raw -Path $ConfigPath | ConvertFrom-Json
}

function Ensure-Dir([string]$Path) {
  if ($Path -and -not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Test-FileStable([string]$Path, [int]$Seconds) {
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $a = (Get-Item -LiteralPath $Path).Length
  Start-Sleep -Seconds $Seconds
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $b = (Get-Item -LiteralPath $Path).Length
  return ($a -eq $b -and $b -gt 64)
}

function Send-Pdf($Cfg, [string]$FilePath) {
  $name = [IO.Path]::GetFileName($FilePath)
  $bytes = [IO.File]::ReadAllBytes($FilePath)
  $headers = @{
    "X-Station-Id"    = [string]$Cfg.station_id
    "X-Station-Token" = [string]$Cfg.station_token
    "X-Filename"      = $name
  }
  $resp = Invoke-WebRequest -Uri $Cfg.api_url -Method POST -Headers $headers `
    -ContentType "application/pdf" -Body $bytes -UseBasicParsing -TimeoutSec 180
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.ok) { throw "API ok=false: $($resp.Content)" }
  return $json
}

function Move-ToSent($Cfg, [string]$FilePath) {
  Ensure-Dir $Cfg.sent_folder
  $name = [IO.Path]::GetFileName($FilePath)
  $dest = Join-Path $Cfg.sent_folder $name
  if (Test-Path -LiteralPath $dest) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $dest = Join-Path $Cfg.sent_folder ("{0}_{1}.pdf" -f [IO.Path]::GetFileNameWithoutExtension($name), $stamp)
  }
  Move-Item -LiteralPath $FilePath -Destination $dest -Force
  return $dest
}

function Process-Folder($Cfg) {
  Ensure-Dir $Cfg.watch_folder
  Ensure-Dir $Cfg.sent_folder
  $stable = 5
  if ($Cfg.stable_seconds) { $stable = [int]$Cfg.stable_seconds }
  $watchRoot = (Resolve-Path -LiteralPath $Cfg.watch_folder).Path
  $files = Get-ChildItem -LiteralPath $watchRoot -File -Filter *.pdf -ErrorAction SilentlyContinue |
    Where-Object { $_.Directory.FullName -eq $watchRoot }

  foreach ($f in $files) {
    try {
      if (-not (Test-FileStable $f.FullName $stable)) {
        Write-Log "Skip (still writing): $($f.Name)"
        continue
      }
      Write-Log "Uploading $($f.Name) ($($f.Length) bytes)"
      $result = Send-Pdf $Cfg $f.FullName
      $moved = Move-ToSent $Cfg $f.FullName
      Write-Log ("OK {0}/{1}; archived {2}" -f $result.folder, $result.filename, $moved)
    } catch {
      Write-Log ("FAIL {0}: {1}" -f $f.Name, $_.Exception.Message)
    }
  }
}

$cfg = Read-Config
if (-not $cfg.station_id -or -not $cfg.station_token -or -not $cfg.api_url -or -not $cfg.watch_folder) {
  Write-Log "config.json incomplete"
  exit 1
}
if (-not $cfg.sent_folder) {
  $cfg | Add-Member -NotePropertyName sent_folder -NotePropertyValue (Join-Path $cfg.watch_folder "Sent") -Force
}

Write-Log ("Started station={0} watch={1}" -f $cfg.station_id, $cfg.watch_folder)
$poll = 15
if ($cfg.poll_seconds) { $poll = [int]$cfg.poll_seconds }

while ($true) {
  try { Process-Folder $cfg } catch { Write-Log ("Loop: {0}" -f $_.Exception.Message) }
  Start-Sleep -Seconds $poll
}
