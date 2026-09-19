$startupFolder = [System.Environment]::GetFolderPath('Startup')
$targetFile = Join-Path $startupFolder "CloudTorrentGDrive.vbs"

if (Test-Path $targetFile) {
    Remove-Item -Path $targetFile -Force
    Write-Host "Auto-start launcher removed from Windows Startup folder." -ForegroundColor Yellow
} else {
    Write-Host "Auto-start launcher was not found in Windows Startup folder."
}
