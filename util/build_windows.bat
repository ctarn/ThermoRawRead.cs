@echo off
setlocal

REM 1. Define paths
echo [1/12] Define paths
set name=ThermoRawRead
set arch=x86_64
set /p version=<VERSION
set content=tmp\%arch%.Windows
set tauri_target=tmp\ui\target\release
set bundle_dir=%tauri_target%\bundle
set backend_stage=tmp\ui\backend
set release_root=tmp\release\%version%
set cli_stage=%release_root%\cli
set gui_stage=%release_root%\gui
set cli_zip=%release_root%\%name%-cli-%version%.%arch%.Windows.zip
set gui_zip=%release_root%\%name%-gui-%version%.%arch%.Windows.zip

REM 2. Prepare release directories
echo [2/12] Prepare release directories
mkdir "%release_root%"
if exist "%cli_stage%" rmdir /s /q "%cli_stage%"
if exist "%gui_stage%" rmdir /s /q "%gui_stage%"
mkdir "%cli_stage%"
mkdir "%gui_stage%"
del /f /q "%cli_zip%" 2>nul
del /f /q "%gui_zip%" 2>nul
del /f /q "%release_root%\%name%-installer-%version%.%arch%.Windows.msi" 2>nul
del /f /q "%release_root%\%name%-installer-%version%.%arch%.Windows.exe" 2>nul

REM 3. Build CLI backend
echo [3/12] Build CLI backend
dotnet build src\%name%.csproj -c Release -o %content%

REM 4. Build GUI bundle
echo [4/12] Build GUI bundle
cd ui
npm install
npm run tauri:build
cd ..

REM 5. Stage CLI payload
echo [5/12] Stage CLI payload
xcopy /e /i /y "%content%\*" "%cli_stage%\" >nul

REM 6. Create CLI zip
echo [6/12] Create CLI zip
powershell -NoProfile -Command "Compress-Archive -Path '%cli_stage%\*' -DestinationPath '%cli_zip%' -Force"

REM 7. Stage GUI payload
echo [7/12] Stage GUI payload
if not exist "%tauri_target%\thermorawread-tauri.exe" (
  echo missing Windows GUI binary at %tauri_target%\thermorawread-tauri.exe
  exit /b 1
)
if not exist "%backend_stage%" (
  echo missing staged backend at %backend_stage%
  exit /b 1
)
copy /y "%tauri_target%\thermorawread-tauri.exe" "%gui_stage%\%name%.exe" >nul
mkdir "%gui_stage%\content"
xcopy /e /i /y "%backend_stage%\*" "%gui_stage%\content\" >nul

REM 8. Create GUI zip
echo [8/12] Create GUI zip
powershell -NoProfile -Command "Compress-Archive -Path '%gui_stage%\*' -DestinationPath '%gui_zip%' -Force"

REM 9. Locate installer
echo [9/12] Locate installer
set installer=
for %%F in ("%bundle_dir%\msi\*.msi") do set installer=%%~fF
if not defined installer (
  for %%F in ("%bundle_dir%\nsis\*.exe") do set installer=%%~fF
)
if not defined installer (
  echo missing installer output under %bundle_dir%
  exit /b 1
)

REM 10. Copy installer
echo [10/12] Copy installer
for %%F in ("%installer%") do set installer_out=%release_root%\%name%-installer-%version%.%arch%.Windows%%~xF
for %%F in ("%installer%") do copy /y "%%~fF" "%installer_out%" >nul

REM 11. Clean staging directories
echo [11/12] Clean staging directories
rmdir /s /q "%cli_stage%"
rmdir /s /q "%gui_stage%"

REM 12. Print outputs
echo [12/12] Print outputs
echo release outputs:
echo   %cli_zip%
echo   %gui_zip%
echo   %installer_out%
