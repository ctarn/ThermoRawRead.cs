import fs from "node:fs";
import os from "node:os";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

function currentArch() {
    return typeof process === "undefined" ? undefined : process.arch;
}

function currentPlatform() {
    return typeof process === "undefined" ? undefined : process.platform;
}

export function normalizeArch(arch = currentArch()) {
    return {x64: "x86_64", arm64: "arm64"}[arch] ?? arch;
}

export function normalizePlatform(platform = currentPlatform()) {
    return {darwin: "Darwin", linux: "Linux", win32: "Windows"}[platform] ?? platform;
}

export function releaseSuffix(platform = currentPlatform(), arch = currentArch()) {
    return `${normalizeArch(arch)}.${normalizePlatform(platform)}`;
}

export function backendExecutableName(productName, platform = currentPlatform()) {
    return platform === "win32" ? `${productName}.exe` : productName;
}

const electronRoot = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(electronRoot, "..");

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
export const preloadEntry = join(electronRoot, "preload.mjs");

export function rendererEntry() {
    return join(uiRoot, "src", "index.html");
}

export function backendBuildDir(platform = process.platform, arch = process.arch) {
    return join(buildRoot, `${normalizeArch(arch)}.${normalizePlatform(platform)}`);
}

export function uiStatePath() {
    return path.join(os.homedir(), ".ThermoRawRead", uiStateVersion, "ui-state.json");
}

export function bundledBackendExecutablePath(baseDir, platform = process.platform) {
    return join(baseDir, "backend", backendExecutableName(productName, platform));
}

export function quotePowerShellString(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
