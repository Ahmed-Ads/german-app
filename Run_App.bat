@echo off
chcp 65001 >nul
title تشغيل تطبيق تعلّم الألمانية
echo.
echo ========================================================
echo        🇩🇪 تطبيق تعلّم الألمانية - التشغيل المحلي
echo ========================================================
echo.
echo جاري بدء خادم الويب المحلي وفتح التطبيق في المتصفح...
echo.

:: Check Python
python --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [✓] تم العثور على بايثون. جاري تشغيل الخادم على المنفذ 8000...
    start "" http://localhost:8000/index.html
    python -m http.server 8000
) else (
    echo [i] بايثون غير مثبت، يتم فتح التطبيق مباشرة في المتصفح الافتراضي...
    start "" index.html
)
