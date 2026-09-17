#Requires -Version 5.1
Unregister-ScheduledTask -TaskName "SmartSolutionsScanUploader" -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Scheduled task SmartSolutionsScanUploader removed."
Write-Host "Folder C:\SmartSolutions\ScanUploader left in place (delete manually if desired)."
