#!/bin/bash

set -euo pipefail

echo "[1/9] Define paths"
product_name="ThermoRawRead"
repo_root="$(pwd)"
platform_arch="$(uname -m)"
platform_os="$(uname -s)"
backend_dir="tmp/build/${platform_arch}.${platform_os}"
staging_dir="$(mktemp -d "${TMPDIR:-/tmp}/${product_name}-release.XXXXXX")"
cli_stage_dir="${staging_dir}/cli"

trap 'rm -rf "${staging_dir}"' EXIT

echo "[2/9] Build CLI backend"
dotnet build "src/${product_name}.csproj" -c Release -o "${backend_dir}"

echo "[3/9] Read version and prepare release directories"
version="$(cat "${backend_dir}/VERSION")"
release_dir="tmp/release/${version}"
gui_build_dir="${release_dir}/gui-build"
cli_zip="${release_dir}/${product_name}-cli-${version}.${platform_arch}.${platform_os}.zip"
gui_zip="${release_dir}/${product_name}-gui-${version}.${platform_arch}.${platform_os}.zip"
mkdir -p "${release_dir}" "${cli_stage_dir}"
rm -f \
    "${cli_zip}" \
    "${gui_zip}" \
    "${release_dir}/${product_name}-installer-${version}.${platform_arch}.${platform_os}."*

rm -rf "${gui_build_dir}"

echo "[4/9] Build GUI bundle"
(
    cd ui
    npm install
    npm run make
)

echo "[5/9] Create CLI zip"
cp -R "${backend_dir}/." "${cli_stage_dir}/"
(
    cd "$(dirname "${cli_stage_dir}")"
    zip -qry "${repo_root}/${cli_zip}" "$(basename "${cli_stage_dir}")"
)

echo "[6/9] Copy GUI zip"
gui_payload="$(find "${gui_build_dir}/make/zip" -type f -name '*.zip' -print -quit)"
if [ -z "${gui_payload}" ]; then
    echo "missing Linux GUI zip under ${gui_build_dir}/make/zip" >&2
    exit 1
fi

cp "${gui_payload}" "${gui_zip}"

echo "[7/9] Copy installer"
installer="$(find "${gui_build_dir}/make" -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) -print -quit 2>/dev/null || true)"

if [ -z "${installer}" ]; then
    echo "missing installer output under ${gui_build_dir}" >&2
    exit 1
fi

installer_ext="${installer##*.}"
installer_out="${release_dir}/${product_name}-installer-${version}.${platform_arch}.${platform_os}.${installer_ext}"
cp "${installer}" "${installer_out}"

echo "[8/9] Cleanup staging directory"
echo "[9/9] Print outputs"
echo "release outputs:"
printf '  %s\n' "${cli_zip}" "${gui_zip}" "${installer_out}"
