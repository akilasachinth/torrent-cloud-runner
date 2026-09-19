@echo off
title Start CloudTorrent in Background
cd /d "%~dp0"
echo Starting CloudTorrent Server silently in background...
start "" wscript.exe "%~dp0start-silent.vbs"
timeout /t 2 >nul
echo.
echo Checking port 5000...
netstat -aon | findstr ":5000" | findstr "LISTENING"
echo.
echo CloudTorrent is now running on http://localhost:5000 outside of Antigravity!
pause
