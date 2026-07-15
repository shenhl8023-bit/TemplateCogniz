@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where powershell >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-project.ps1"
  set "EC=%ERRORLEVEL%"
  if not "%EC%"=="0" pause
  exit /b %EC%
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Neither PowerShell nor Node found.
  pause
  exit /b 1
)
if not exist "%~dp0server.js" (
  echo [ERROR] server.js missing
  pause
  exit /b 1
)
echo Starting via node ...
start "" http://127.0.0.1:3000
node "%~dp0server.js"
if errorlevel 1 pause
exit /b %ERRORLEVEL%
