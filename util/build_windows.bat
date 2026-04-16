set name=ThermoRawRead
set arch=x86_64
set content=tmp\%arch%.Windows
dotnet build src\%name%.csproj -c Release -o %content%
cd ui
npm install
npm run tauri:build
