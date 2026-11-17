@echo off
cd /d "%~dp0"
chcp 65001 > nul
title Chollian Hand of God Server

echo =======================================================
echo   Chollian 'Hand of God' Online Typing Server
echo =======================================================
echo.
echo Starting web browser: http://localhost:3000 ...
start http://localhost:3000

"C:\Users\admin\.aside\runtime\node\node.exe" server.js

pause
