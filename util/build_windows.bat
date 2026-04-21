@echo off
setlocal

echo [1/2] Install UI dependencies
cd ui
call npm install
if errorlevel 1 exit /b 1

echo [2/2] Build release artifacts via Electron Forge
call npm run make
if errorlevel 1 exit /b 1
