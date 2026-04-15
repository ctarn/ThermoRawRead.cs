set name=ThermoRawRead
set arch=x86_64
set content=tmp\%arch%.Windows
dotnet build src\%name%.csproj -c Release -o %content%
set /p version=<VERSION
set out=tmp\release\%name%-%version%.%arch%.Windows
rmdir /s /q %out%
python -m nuitka ui\%name%.py ^
    --mode=app ^
    --assume-yes-for-downloads ^
    --enable-plugin=tk-inter ^
    --include-package-data=ttkbootstrap ^
    --include-data-dir=%content%=content ^
    --include-data-files=fig\%name%.png=content/%name%.png ^
    --include-onefile-external-data=content/** ^
    --windows-console-mode=disable ^
    --windows-icon-from-ico=fig\%name%.png ^
    --output-dir=%out% ^
    --output-filename=%name%
