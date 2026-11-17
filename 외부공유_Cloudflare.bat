@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Cloudflare Tunnel for Hand of God

echo =======================================================
echo   Cloudflare Online Share Tunnel
echo =======================================================
echo.
echo Copy the https://xxxx.trycloudflare.com link below
echo and share it with your friends!
echo (Do not close this window while playing)
echo.

"%~dp0cloudflared.exe" tunnel --protocol http2 --url http://localhost:3000

pause
