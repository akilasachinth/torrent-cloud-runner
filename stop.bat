@echo off
title Stop CloudTorrent Server
echo Stopping any running server on port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    echo Terminating PID %%a ...
    taskkill /f /pid %%a
)
echo Done!
pause
