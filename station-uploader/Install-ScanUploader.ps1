#Requires -Version 5.1
<#
.SYNOPSIS
  Install ScanUploader on a station Windows PC (one time).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Install-ScanUploader.ps1 -StationId 42179 -StationToken "SECRET"
#>
param(
  [Parameter(Mandatory = $true)][string]$StationId,
  [Parameter(Mandatory = $true)][string]$StationToken,
  [string]$WatchFolder = "C:\Scans",
  [string]$ApiUrl = "https://smartsolutionsai.us/api/scan-ingest",
  [string]$AlternateApiUrl = "https://smartsolutions-site.smartsolutionsai.workers.dev/api/scan-ingest",
  [string]$InstallDir = "C:\SmartSolutions\ScanUploader"
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot
if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $WatchFolder | Out-Null
$sent = Join-Path $WatchFolder "Sent"
New-Item -ItemType Directory -Force -Path $sent | Out-Null

Copy-Item -Force (Join-Path $here "ScanUploader.ps1") (Join-Path $InstallDir "ScanUploader.ps1")

$config = [ordered]@{
  station_id         = "$StationId"
  station_token      = "$StationToken"
  api_url            = "$ApiUrl"
  alternate_api_url  = "$AlternateApiUrl"
  watch_folder       = "$WatchFolder"
  sent_folder        = "$sent"
  poll_seconds       = 15
  stable_seconds     = 5
}
($config | ConvertTo-Json) | Set-Content -Encoding UTF8 (Join-Path $InstallDir "config.json")

$taskName = "SmartSolutionsScanUploader"
$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$InstallDir\ScanUploader.ps1`""

# Bare USERNAME (e.g. "MINA") fails Register-ScheduledTask; need DOMAIN\user.
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not $userId) { $userId = "$env:USERDOMAIN\$env:USERNAME" }

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
# Logon + every 5 minutes so a killed watcher restarts without waiting for reboot.
$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $userId
$triggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($triggerLogon, $triggerRepeat) -Settings $settings -User $userId -RunLevel Limited -Force | Out-Null
} catch {
  # Fallback for odd Microsoft / local account forms
  $tr = "`"$ps`" $arg"
  $p = Start-Process -FilePath "$env:SystemRoot\System32\schtasks.exe" -ArgumentList @(
    "/Create", "/TN", $taskName, "/TR", $tr, "/SC", "ONLOGON", "/RL", "LIMITED", "/F"
  ) -Wait -PassThru -NoNewWindow
  if ($p.ExitCode -ne 0) { throw "Failed to register scheduled task for $userId : $($_.Exception.Message)" }
  # Also register a repeating start via schtasks
  Start-Process -FilePath "$env:SystemRoot\System32\schtasks.exe" -ArgumentList @(
    "/Create", "/TN", ($taskName + "KeepAlive"), "/TR", $tr, "/SC", "MINUTE", "/MO", "5", "/RL", "LIMITED", "/F"
  ) -Wait -PassThru -NoNewWindow | Out-Null
}

# Stop any old watcher, then start fresh.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like "*ScanUploader.ps1*" } |
  ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }

Start-Process -FilePath $ps -ArgumentList $arg -WindowStyle Hidden

Write-Host ""
Write-Host "Installed."
Write-Host "  Station : $StationId"
Write-Host "  Watch   : $WatchFolder   (managers save/scan PDFs here)"
Write-Host "  Sent    : $sent"
Write-Host "  API     : $ApiUrl"
Write-Host "  Fallback: $AlternateApiUrl"
Write-Host "  Task    : $taskName (logon + every 5 min)"
Write-Host "  Log     : $InstallDir\uploader.log"
Write-Host ""
Write-Host "Test: copy any .pdf into $WatchFolder - it should move to Sent in ~20s."
Write-Host "If it stays in C:\Scans, open uploader.log and re-run INSTALL.bat."
