$ErrorActionPreference = "Continue"
$tools = "C:\projects\cloud-torrent-gdrive\tools"
$rclone = Join-Path $tools "rclone.exe"
$repo = "akilasachinth/torrent-cloud-runner"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Google Drive Authorization Wizard for Cloud Torrent" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Starting local authorization listener..." -ForegroundColor Yellow
Write-Host ""

$tokenJson = ""
$browserLaunched = $false

# Run rclone authorize "drive" merging stderr and stdout in real-time
& $rclone authorize "drive" 2>&1 | ForEach-Object {
    $currentLine = "$_"
    Write-Host $currentLine -ForegroundColor Gray

    # Detect if rclone produced an authorization link and open browser automatically
    if (-not $browserLaunched -and ($currentLine -match "(http://127\.0\.0\.1:53682/auth\?state=[a-zA-Z0-9_\-]+)")) {
        $authUrl = $matches[1]
        Write-Host ""
        Write-Host ">>> Opening your browser automatically..." -ForegroundColor Green
        Write-Host ">>> If browser does not open, copy and paste this link:" -ForegroundColor Yellow
        Write-Host "    $authUrl" -ForegroundColor Cyan
        Write-Host ""
        try {
            Start-Process $authUrl
            $browserLaunched = $true
        } catch {
            Write-Host "Could not automatically launch browser. Please open the link above manually." -ForegroundColor Yellow
        }
    }

    # Detect JSON token
    $trimmed = $currentLine.Trim()
    if ($trimmed.StartsWith("{") -and $trimmed.Contains('"access_token"')) {
        $tokenJson = $trimmed
    }
}

if (-not $tokenJson) {
    Write-Host ""
    Write-Host "Could not capture authorization token." -ForegroundColor Red
    Write-Host "If you saw a token printed above, you can paste it manually." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Google Drive Authorization received successfully!" -ForegroundColor Green

$rcloneConfig = "[gdrive]`ntype = drive`nscope = drive`ntoken = " + $tokenJson + "`n"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($rcloneConfig)
$b64 = [System.Convert]::ToBase64String($bytes)

Write-Host "Saving encrypted credentials to GitHub Secrets ($repo)..." -ForegroundColor Cyan
gh secret set RCLONE_CONFIG_BASE64 -R $repo --body $b64

Write-Host ""
Write-Host "SUCCESS! Google Drive is now connected to your Cloud Runner!" -ForegroundColor Green
Write-Host "You can close this window now and download torrents." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to exit"
