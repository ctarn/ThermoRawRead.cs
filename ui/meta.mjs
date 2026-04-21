import fs from "node:fs";
import os from "node:os";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {backendExecutableName, normalizeArch, normalizePlatform} from "./util.mjs";

const uiRoot = dirname(fileURLToPath(import.meta.url));

export const packageJsonPath = join(uiRoot, "package.json");
export const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

export const productName = packageJson.productName;
export const releaseVersion = packageJson.version;
export const uiStateVersion = "v1.5";

export const repoRoot = join(uiRoot, "..");
export const tmpRoot = join(repoRoot, "tmp");
export const buildRoot = join(tmpRoot, "build");
export const buildUiRoot = join(tmpRoot, "build-ui");
export const releaseRoot = join(tmpRoot, "release");

export const backendOutputDir = join(buildUiRoot, "backend");
export const iconOutputDir = join(buildUiRoot, "icon");
export const iconRoot = join(iconOutputDir, "icon");
export const iconsetOutputDir = join(iconOutputDir, "icon.iconset");
export const legacyIconOutputDir = join(buildUiRoot, "icons");
export const forgeOutDir = join(buildUiRoot, releaseVersion, "gui-build");
export const releaseDir = join(releaseRoot, releaseVersion);

export const sourcePng = join(repoRoot, "fig", "ThermoRawRead.png");
export const preloadEntry = join(uiRoot, "preload.mjs");

export function backendBuildDir(platform = process.platform, arch = process.arch) {
    return join(buildRoot, `${normalizeArch(arch)}.${normalizePlatform(platform)}`);
}

export function uiStatePath() {
    return path.join(os.homedir(), ".ThermoRawRead", uiStateVersion, "ui-state.json");
}

export function bundledBackendExecutablePath(baseDir, platform = process.platform) {
    return join(baseDir, "backend", backendExecutableName(productName, platform));
}
