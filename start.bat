@echo off
title CloudTorrent to Google Drive Server
cd /d "C:\projects\cloud-torrent-gdrive"
echo Starting CloudTorrent Server on http://localhost:5000 ...
node server.js
pause
