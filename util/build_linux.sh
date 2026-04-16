#!/bin/bash

set -euo pipefail

# 1. Define paths
echo "[1/12] Define paths"
name="ThermoRawRead"
repo_root="$(pwd)"
arch="$(uname -m)"
os="$(uname -s)"
version="$(cat VERSION)"
content="tmp/build/${arch}.${os}"
tauri_target="tmp/ui/target/release"
bundle_dir="${tauri_target}/bundle"
release_root="tmp/release/${version}"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/${name}-release.XXXXXX")"
cli_stage="${staging_dir}/cli"
gui_stage="${staging_dir}/gui"
backend_stage="tmp/ui/backend"

trap 'rm -rf "${staging_dir}"' EXIT

# 2. Prepare release directories
echo "[2/12] Prepare release directories"
mkdir -p "${release_root}" "${cli_stage}" "${gui_stage}"
rm -f \
    "${release_root}/${name}-"{cli,gui}"-${version}.${arch}.${os}.zip" \
    "${release_root}/${name}-installer-${version}.${arch}.${os}."*

# 3. Build CLI backend
echo "[3/12] Build CLI backend"
dotnet build "src/${name}.csproj" -c Release -o "${content}"

# 4. Build GUI bundle
echo "[4/12] Build GUI bundle"
(
    cd ui
    npm install
    npm run tauri:build
)

# 5. Stage CLI payload
echo "[5/12] Stage CLI payload"
cp -R "${content}/." "${cli_stage}/"

# 6. Create CLI zip
echo "[6/12] Create CLI zip"
cli_zip="${release_root}/${name}-cli-${version}.${arch}.${os}.zip"
(
    cd "$(dirname "${cli_stage}")"
    zip -qry "${repo_root}/${cli_zip}" "$(basename "${cli_stage}")"
)

# 7. Stage GUI payload
echo "[7/12] Stage GUI payload"
gui_payload="${tauri_target}/thermorawread-ui"
if [ ! -f "${gui_payload}" ]; then
    echo "missing Linux GUI binary at ${gui_payload}" >&2
    exit 1
fi
if [ ! -d "${backend_stage}" ]; then
    echo "missing staged backend at ${backend_stage}" >&2
    exit 1
fi

cp "${gui_payload}" "${gui_stage}/${name}"
chmod +x "${gui_stage}/${name}"
mkdir -p "${gui_stage}/content"
cp -R "${backend_stage}/." "${gui_stage}/content/"

# 8. Create GUI zip
echo "[8/12] Create GUI zip"
gui_zip="${release_root}/${name}-gui-${version}.${arch}.${os}.zip"
(
    cd "$(dirname "${gui_stage}")"
    zip -qry "${repo_root}/${gui_zip}" "$(basename "${gui_stage}")"
)

# 9. Locate installer
echo "[9/12] Locate installer"
installer="$(find "${bundle_dir}" -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) -print -quit 2>/dev/null || true)"

if [ -z "${installer}" ]; then
    echo "missing installer output under ${bundle_dir}" >&2
    exit 1
fi

# 10. Copy installer
echo "[10/12] Copy installer"
installer_ext="${installer##*.}"
installer_out="${release_root}/${name}-installer-${version}.${arch}.${os}.${installer_ext}"
cp "${installer}" "${installer_out}"

# 11. Cleanup staging directories via trap
echo "[11/12] Cleanup staging directories via trap"

# 12. Print outputs
echo "[12/12] Print outputs"
echo "release outputs:"
printf '  %s\n' "${cli_zip}" "${gui_zip}" "${installer_out}"
