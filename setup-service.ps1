$ErrorActionPreference = "Stop"
$taskName = "CloudTorrentService"
$vbsPath = "C:\projects\cloud-torrent-gdrive\start-silent.vbs"
$workDir = "C:\projects\cloud-torrent-gdrive"

Write-Host "Registering Windows Scheduled Task: $taskName..." -ForegroundColor Cyan

# Create Task Action
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $workDir

# Create Logon Trigger (Starts on user login/reboot)
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings: run on battery, do not timeout
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# Register task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

Write-Host "Starting task now via Windows Task Scheduler..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $taskName

# Wait 2 seconds and check port 5000
Start-Sleep -Seconds 2
$portCheck = netstat -aon | findstr ":5000" | findstr "LISTENING"

if ($portCheck) {
    Write-Host "SUCCESS! CloudTorrent is now running as an independent Windows Service on port 5000!" -ForegroundColor Green
    Write-Host "It will automatically start whenever your laptop boots or restarts, completely independent of Antigravity." -ForegroundColor Green
} else {
    Write-Host "Warning: Port 5000 was not detected yet. Please check start-silent.vbs" -ForegroundColor Yellow
}
