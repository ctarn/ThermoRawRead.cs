set name=ThermoRawRead
set arch=x86_64
set content=tmp\%arch%.Windows
dotnet build src\%name%.csproj -c Release -o %content%
set /p version=<VERSION
set out=tmp\release\%name%-%version%.%arch%.Windows
rmdir /s /q %out%
pyinstaller ui\%name%.py -Fwy -i fig\%name%.png --distpath %out% --workpath tmp\build ^
    --add-data %content%;content
del %name%.spec
