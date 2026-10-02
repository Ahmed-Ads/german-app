@echo off
setlocal
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

echo ========================================================
echo   Launching Windows Verification and Audit Suite
echo ========================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "tools\run_windows_checks.ps1"
set PS_EXIT=%ERRORLEVEL%

echo.
if exist "%~dp0audit\windows_results\summary.txt" (
    start "" notepad.exe "%~dp0audit\windows_results\summary.txt"
)
echo ========================================================
echo Summary report: %~dp0audit\windows_results\summary.txt
echo Raw log file  : %~dp0audit\windows_results\raw_run.log
echo ========================================================
echo.
pause
exit /b %PS_EXIT%
