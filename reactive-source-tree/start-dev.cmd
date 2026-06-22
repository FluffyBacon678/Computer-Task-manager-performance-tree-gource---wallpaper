@echo off
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm was not found in PATH.
  echo Install Node.js, then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "Reactive Source Tree Dev Server" cmd /k "pushd ""%~dp0"" && npm.cmd run dev"
timeout /t 2 >nul
start "" "http://127.0.0.1:5173/"
