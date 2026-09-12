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
  station_id      = "$StationId"
  station_token   = "$StationToken"
  api_url         = "$ApiUrl"
  watch_folder    = "$WatchFolder"
  sent_folder     = "$sent"
  poll_seconds    = 15
  stable_seconds  = 5
}
($config | ConvertTo-Json) | Set-Content -Encoding UTF8 (Join-Path $InstallDir "config.json")

$taskName = "SmartSolutionsScanUploader"
$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$arg = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$InstallDir\ScanUploader.ps1`""

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

Start-Process -FilePath $ps -ArgumentList $arg -WindowStyle Hidden

Write-Host ""
Write-Host "Installed."
Write-Host "  Station : $StationId"
Write-Host "  Watch   : $WatchFolder   (managers save/scan PDFs here)"
Write-Host "  Sent    : $sent"
Write-Host "  API     : $ApiUrl"
Write-Host "  Task    : $taskName (auto-starts at logon)"
Write-Host ""
Write-Host "Test: copy any .pdf into $WatchFolder — it should move to Sent in ~20s."
