@echo off
chcp 65001 > nul
title Localtunnel 외부 공유 실행

echo =======================================================
echo   천리안 신의손 - 외부 인터넷 공유 터널 (Localtunnel)
echo =======================================================
echo.
echo * 최초 접속 시 친구들에게 'Tunnel Password'를 묻는 화면이 뜨면:
echo   비밀번호로 방장 IP: 221.140.10.254 를 입력하시면 됩니다.
echo.

set PATH=C:\Users\admin\.aside\runtime\node;%PATH%
call .\node_modules\.bin\lt.cmd --port 3000

pause
