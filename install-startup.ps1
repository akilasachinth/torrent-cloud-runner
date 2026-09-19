$startupFolder = [System.Environment]::GetFolderPath('Startup')
$targetFile = Join-Path $startupFolder "CloudTorrentGDrive.vbs"
$sourceFile = "C:\projects\cloud-torrent-gdrive\start-silent.vbs"

Copy-Item -Path $sourceFile -Destination $targetFile -Force
Write-Host "✅ Auto-start installed successfully!" -ForegroundColor Green
Write-Host "Location: $targetFile" -ForegroundColor Cyan
Write-Host "CloudTorrent will now automatically start on localhost:5000 whenever your laptop starts or reboots." -ForegroundColor Green
