$tools = "C:\projects\cloud-torrent-gdrive\tools"
if (-not (Test-Path $tools)) {
    New-Item -ItemType Directory -Force -Path $tools | Out-Null
}
$zip = Join-Path $tools "rclone.zip"
Write-Host "Downloading portable Rclone for Windows..."
Invoke-WebRequest -Uri "https://downloads.rclone.org/rclone-current-windows-amd64.zip" -OutFile $zip
Write-Host "Extracting Rclone..."
Expand-Archive -Path $zip -DestinationPath $tools -Force
Remove-Item -Path $zip -Force

$rcloneExe = (Get-ChildItem -Path $tools -Recurse -Filter "rclone.exe" | Select-Object -First 1).FullName
Copy-Item -Path $rcloneExe -Destination (Join-Path $tools "rclone.exe") -Force
Write-Host "Rclone installed at: $tools\rclone.exe"
& "$tools\rclone.exe" version
