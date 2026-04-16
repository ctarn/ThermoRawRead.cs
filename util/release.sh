#!/bin/bash

set -euo pipefail
shopt -s nullglob

arch="$(uname -m)"
os="$(uname -s)"
content="tmp/build/${arch}.${os}"
version="$(cat "${content}/VERSION")"
tag="v${version}"
files=(tmp/release/"${version}"/*)

if [ "${#files[@]}" -eq 0 ]; then
  echo "no release artifacts found under tmp/release" >&2
  exit 1
fi

gh release upload --clobber "${tag}" "${files[@]}"
