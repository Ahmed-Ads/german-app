@echo off
chcp 65001 >nul
title تشغيل تطبيق تعلّم الألمانية (German Learning App)

echo.
echo ========================================================
echo        🇩🇪 تطبيق تعلّم الألمانية - التشغيل المحلي
echo ========================================================
echo.

set PORT=8000
set HOST=127.0.0.1

:: Check if port 8000 is already in use
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [!] تنبيه: المنفذ %PORT% مشغول حالياً بتطبيق آخر.
    echo [i] جاري محاولة فتح التطبيق مباشرة على العنوان http://%HOST%:%PORT%/index.html ...
    start "" "http://%HOST%:%PORT%/index.html"
    pause
    exit /b 0
)

:: Find python executable (py -3, then python, then python3)
set PY_CMD=
py -3 --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PY_CMD=py -3
    goto :FOUND_PY
)

python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PY_CMD=python
    goto :FOUND_PY
)

python3 --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set PY_CMD=python3
    goto :FOUND_PY
)

:: If Python is not installed, open directly via default browser
echo [i] لم يتم العثور على بايثون. يتم فتح التطبيق مباشرة في المتصفح كملف محلي...
start "" "%~dp0index.html"
exit /b 0

:FOUND_PY
echo [✓] تم العثور على بايثون: %PY_CMD%
echo [i] جاري تشغيل الخادم المحلي على: http://%HOST%:%PORT%/index.html
echo     (اضغط Ctrl+C لإيقاف الخادم عند الانتهاء)
echo.

:: Launch browser in background after short delay to let server start
start "" cmd /c "timeout /t 1 /nobreak >nul & start "" http://%HOST%:%PORT%/index.html"

:: Run local server bound to 127.0.0.1 ONLY (security standard)
%PY_CMD% -m http.server %PORT% --bind %HOST%
