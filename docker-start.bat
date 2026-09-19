@echo off
title Start CloudTorrent via Docker
cd /d "%~dp0"
echo Checking if Docker is running...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker engine to initialize (up to 30s)...
    :wait_docker
    timeout /t 5 >nul
    docker info >nul 2>&1
    if %ERRORLEVEL% neq 0 goto wait_docker
)

echo.
echo Starting container with restart: always...
docker compose up -d --build
echo.
echo ========================================================
echo CloudTorrent is running inside Docker on http://localhost:5000!
echo It will restart automatically with Docker.
echo ========================================================
pause
