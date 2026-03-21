@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found in PATH.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
)
start http://localhost:3210
node server.js
