import fs from "node:fs";
import os from "node:os";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

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

export function normalizeArch(arch = process.arch) {
    return {x64: "x86_64", arm64: "arm64"}[arch] ?? arch;
}

export function normalizePlatform(platform = process.platform) {
    return {darwin: "Darwin", linux: "Linux", win32: "Windows"}[platform] ?? platform;
}

export function backendBuildDir(platform = process.platform, arch = process.arch) {
    return join(buildRoot, `${normalizeArch(arch)}.${normalizePlatform(platform)}`);
}

export function releaseSuffix(platform = process.platform, arch = process.arch) {
    return `${normalizeArch(arch)}.${normalizePlatform(platform)}`;
}

export function backendExecutableName(platform = process.platform) {
    return platform === "win32" ? `${productName}.exe` : productName;
}

export function uiStatePath() {
    return path.join(os.homedir(), ".ThermoRawRead", uiStateVersion, "ui-state.json");
}
