# ThermoRawRead.cs

`ThermoRawRead.cs` keeps the Thermo RAW conversion logic in C# and ships an Electron desktop UI in [`ui`](./ui), built with Electron Forge.

## Backend

Build the standalone converter with:

```bash
dotnet build src/ThermoRawRead.csproj -c Release -o tmp/build/$(uname -m).$(uname -s)
```

That produces the CLI binary directly under `tmp/build/<arch>.<OS>/`.

## Electron UI

The Electron app lives in `ui/` and talks to the existing CLI instead of re-implementing the conversion pipeline. The desktop build pipeline is managed by Electron Forge via [`ui/forge.config.mjs`](./ui/forge.config.mjs).

```bash
cd ui
npm install
npm start
```

`npm start`, `npm run package`, and `npm run make` now let Electron Forge drive the full build pipeline. Forge builds the C# backend, stages it into `tmp/build-ui/backend`, prepares Forge icon assets under `tmp/build-ui/icon`, and writes GUI intermediates to `tmp/build-ui/<version>/gui-build`.

The release version comes from [`ui/package.json`](./ui/package.json).
If the backend binary is not in `tmp/build/<arch>.<OS>/ThermoRawRead`, set `THERMO_RAW_READ_BIN` before launching Electron.

## Release Packaging

Use Electron Forge directly:

```bash
cd ui
npm install
npm run make
```

Forge writes the final release artifacts to `tmp/release/<version>/`:

- `cli.zip`
- `gui.zip`
- `installer`

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
