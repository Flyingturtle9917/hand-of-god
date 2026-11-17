@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Chollian Hand of God - All-in-One Launcher

echo =======================================================
echo   천리안 '신의손' 서버 및 인터넷 공유 통합 실행기
echo =======================================================
echo.
echo 1. 게임 서버를 실행합니다...
start "Hand of God Server" "C:\Users\admin\.aside\runtime\node\node.exe" "%~dp0server.js"

timeout /t 2 > nul

echo 2. 웹 브라우저를 엽니다...
start http://localhost:3000

echo 3. Cloudflare 외부 인터넷 공유 터널을 시작합니다...
"%~dp0cloudflared.exe" tunnel --protocol http2 --url http://localhost:3000

pause
