@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where powershell >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-project.ps1"
  set "EC=%ERRORLEVEL%"
  if not "%EC%"=="0" pause
  exit /b %EC%
)
set "PORT=3000"
set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  taskkill /PID %%P /F
)
if "%FOUND%"=="0" echo No process on port %PORT%.
pause
exit /b 0
