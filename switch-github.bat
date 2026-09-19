@echo off
title Switch GitHub Account to akilasachinth
echo ==========================================================
echo Log in to GitHub Account: akilasachinth
echo ==========================================================
echo.
echo A one-time code will appear below and your browser will open.
echo Make sure you are signed into 'akilasachinth' in your browser,
echo then enter the code to authorize.
echo.
gh auth login --web -h github.com -p https --scopes repo,workflow
echo.
echo Checking active account...
gh auth status
echo.
pause
