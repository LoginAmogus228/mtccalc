@echo off
echo ==========================================
echo   MTC Art Computer v3.0 - Build to .EXE
echo ==========================================
echo.

echo [1/4] Installing Electron...
call npm install --save-dev electron electron-builder
if errorlevel 1 goto error

echo.
echo [2/4] Building web app...
call npm run build
if errorlevel 1 goto error

echo.
echo [3/4] Copying electron config...
copy electron-builder.json package.json.bak >nul
echo Done.

echo.
echo [4/4] Building .EXE installer...
call npx electron-builder --win --x64 --config electron-builder.json
if errorlevel 1 goto error

echo.
echo ==========================================
echo   BUILD COMPLETE!
echo   Check the "release" folder for .EXE
echo ==========================================
pause
exit /b 0

:error
echo.
echo ==========================================
echo   BUILD FAILED! Check errors above.
echo ==========================================
pause
exit /b 1
