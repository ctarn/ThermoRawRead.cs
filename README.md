# ThermoRawRead.cs

`ThermoRawRead.cs` keeps the Thermo RAW conversion logic in C# and ships an Electron desktop UI in [`ui`](./ui), built with Electron Forge.

## Backend

Build the converter first:

```bash
dotnet build src/ThermoRawRead.csproj -c Release -o tmp/build/$(uname -m).$(uname -s)
```

That produces the CLI binary consumed by the Electron UI.

## Electron UI

The Electron app lives in `ui/` and talks to the existing CLI instead of re-implementing the conversion pipeline. The desktop build pipeline is managed by Electron Forge via [`ui/forge.config.mjs`](./ui/forge.config.mjs).

```bash
cd ui
npm install
npm start
```

If the backend binary is not in `tmp/build/<arch>.<OS>/ThermoRawRead`, set `THERMO_RAW_READ_BIN` before launching Electron.
Electron build artifacts are written to `tmp/release/<version>/gui-build`.
Before `start` / `package` / `make`, [`ui/prepare-assets.mjs`](./ui/prepare-assets.mjs) stages the CLI bundle into `tmp/build-ui/backend` and prepares Forge icon assets under `tmp/build-ui/icon`.

## Release Packaging

Use the platform build script in `util/` to produce all three release artifacts together:

- `cli.zip`
- `gui.zip`
- `installer`

They are written under `tmp/release/<version>/`.

## CI Release

GitHub Actions builds release artifacts on macOS, Linux, and Windows via [`.github/workflows/release.yml`](./.github/workflows/release.yml).

- `workflow_dispatch`: build all three platforms and upload workflow artifacts
- `push` tag `v*`: build all three platforms, upload workflow artifacts, and publish them to the GitHub Release for that tag

## Layout

- `src/`: Thermo RAW reader and exporters
- `ui/main.mjs`: Electron main process
- `ui/preload.mjs`: Electron preload bridge
- `ui/index.html`, `ui/renderer.js`, `ui/style.css`: desktop UI renderer
- `ui/prepare-assets.mjs`: stage backend and icon assets for Forge
