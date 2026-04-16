# ThermoRawRead.cs

`ThermoRawRead.cs` keeps the Thermo RAW conversion logic in C# and ships a Tauri desktop UI in [`ui`](./ui).

## Backend

Build the converter first:

```bash
dotnet build src/ThermoRawRead.csproj -c Release -o tmp/$(uname -m).$(uname -s)
```

That produces the CLI binary consumed by the Tauri UI.

## Tauri UI

The Tauri app lives in `ui/` and talks to the existing CLI instead of re-implementing the conversion pipeline.

```bash
cd ui
npm install
npm run tauri:dev
```

If the backend binary is not in `tmp/<arch>.<os>/ThermoRawRead`, set `THERMO_RAW_READ_BIN` before launching Tauri.
Tauri/Cargo build artifacts are written to `tmp/ui/target`.
App icons are generated at build/dev time from `fig/ThermoRawRead.png` into `tmp/ui/icons` and are not stored as generated assets in the repo.

## Release Packaging

Use the platform build script in `util/` to produce all three release artifacts together:

- `cli.zip`
- `gui.zip`
- `installer`

They are written under `tmp/release/ThermoRawRead-<version>.<arch>.<os>/`.

## Layout

- `src/`: Thermo RAW reader and exporters
- `ui/`: Tauri desktop UI
