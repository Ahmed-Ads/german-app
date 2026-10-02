@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo   Launching Windows Verification and Audit Suite
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools\run_windows_checks.ps1"
echo.
pause
