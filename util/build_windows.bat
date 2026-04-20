@echo off
setlocal

echo [1/9] Define paths
set product_name=ThermoRawRead
set platform_arch=x86_64
set platform_os=Windows
set backend_dir=tmp\build\%platform_arch%.%platform_os%

echo [2/9] Build CLI backend
dotnet build src\%product_name%.csproj -c Release -o %backend_dir%

echo [3/9] Read version and prepare release directories
set /p version=<%backend_dir%\VERSION
set release_dir=tmp\release\%version%
set gui_build_dir=%release_dir%\gui-build
set cli_stage_dir=%release_dir%\cli
set cli_zip=%release_dir%\%product_name%-cli-%version%.%platform_arch%.%platform_os%.zip
set gui_zip=%release_dir%\%product_name%-gui-%version%.%platform_arch%.%platform_os%.zip
mkdir "%release_dir%"
if exist "%gui_build_dir%" rmdir /s /q "%gui_build_dir%"
if exist "%cli_stage_dir%" rmdir /s /q "%cli_stage_dir%"
mkdir "%cli_stage_dir%"
del /f /q "%cli_zip%" 2>nul
del /f /q "%gui_zip%" 2>nul
del /f /q "%release_dir%\%product_name%-installer-%version%.%platform_arch%.%platform_os%.msi" 2>nul
del /f /q "%release_dir%\%product_name%-installer-%version%.%platform_arch%.%platform_os%.exe" 2>nul

echo [4/9] Build GUI bundle
cd ui
npm install
npm run make
cd ..

echo [5/9] Create CLI zip
xcopy /e /i /y "%backend_dir%\*" "%cli_stage_dir%\" >nul
powershell -NoProfile -Command "Compress-Archive -Path '%cli_stage_dir%\*' -DestinationPath '%cli_zip%' -Force"

echo [6/9] Copy GUI zip
set gui_payload=
for /r "%gui_build_dir%\make\zip" %%F in (*.zip) do set gui_payload=%%~fF
if not defined gui_payload (
  echo missing Windows GUI zip under %gui_build_dir%\make\zip
  exit /b 1
)
copy /y "%gui_payload%" "%gui_zip%" >nul

echo [7/9] Copy installer
set installer=
for /r "%gui_build_dir%\make" %%F in (*.exe) do set installer=%%~fF
if not defined installer (
  for /r "%gui_build_dir%\make" %%F in (*.msi) do set installer=%%~fF
)
if not defined installer (
  echo missing installer output under %gui_build_dir%
  exit /b 1
)

for %%F in ("%installer%") do set installer_out=%release_dir%\%product_name%-installer-%version%.%platform_arch%.%platform_os%%%~xF
for %%F in ("%installer%") do copy /y "%%~fF" "%installer_out%" >nul

echo [8/9] Cleanup staging directory
rmdir /s /q "%cli_stage_dir%"

echo [9/9] Print outputs
echo release outputs:
echo   %cli_zip%
echo   %gui_zip%
echo   %installer_out%
