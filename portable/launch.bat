@echo off
chcp 65001 >nul
echo Checking WebView2 runtime...
reg query "HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1
if %errorlevel% == 0 goto found
reg query "HKCU\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" >nul 2>&1
if %errorlevel% == 0 goto found
echo.
echo [ERROR] WebView2 runtime not found!
echo.
echo Please download and install from:
echo https://developer.microsoft.com/microsoft-edge/webview2/
echo.
echo Choose: Evergreen Standalone Installer (x64)
pause
exit /b 1
:found
echo WebView2 OK. Launching Excel Copy...
start "" "%~dp0Excel Copy.exe"
