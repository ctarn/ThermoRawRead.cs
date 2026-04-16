name="ThermoRawRead"
content="tmp/$(uname -m).$(uname -s)"
dotnet build src/$name.csproj -c Release -o $content
(
    cd ui
    npm install
    npm run tauri:build
)
