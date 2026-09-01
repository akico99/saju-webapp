@echo off
cd /d "%~dp0"
echo ============================================
echo   Starting saju-webapp server...
echo   Your browser will open automatically.
echo   (Closing this window will stop the server)
echo ============================================
start "" cmd /c "timeout /t 2 >nul && start http://localhost:4500"
if exist "C:\Program Files\nodejs\node.exe" (
  "C:\Program Files\nodejs\node.exe" server.js
) else (
  node server.js
)
pause
