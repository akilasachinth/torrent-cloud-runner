@echo off
title Connect Google Drive to Cloud Runner
powershell -ExecutionPolicy Bypass -File "%~dp0auth-gdrive.ps1"
pause
