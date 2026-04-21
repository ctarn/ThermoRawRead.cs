#!/bin/bash

set -euo pipefail

echo "[1/2] Install UI dependencies"
(
    cd ui
    npm install
)

echo "[2/2] Build release artifacts via Electron Forge"
(
    cd ui
    npm run make
)
