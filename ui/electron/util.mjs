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

export const packageJson = JSON.parse(fs.readFileSync(join(uiRoot, "package.json"), "utf8"));

export const productName = packageJson.productName;
export const version = packageJson.version;

export const repoRoot = join(uiRoot, "..");
export const buildRoot = join(repoRoot, "tmp", "build");
export const buildUiRoot = join(repoRoot, "tmp", "build-ui");

export const backendOutputDir = join(buildUiRoot, "backend");
export const releaseDir = join(repoRoot, "tmp", "release", version);

export const sourcePng = join(repoRoot, "fig", "ThermoRawRead.png");
export const preloadEntry = join(electronRoot, "preload.mjs");

export function rendererEntry() {
    return join(uiRoot, "src", "main.html");
}

export function backendBuildDir(platform = process.platform, arch = process.arch) {
    return join(buildRoot, `${normalizeArch(arch)}.${normalizePlatform(platform)}`);
}

export function uiStatePath() {
    return path.join(os.homedir(), ".ThermoRawRead", version, "ui-state.json");
}

export function bundledBackendExecutablePath(baseDir, platform = process.platform) {
    return join(baseDir, "backend", backendExecutableName(productName, platform));
}

export function quotePowerShellString(value) {
    return `'${value.replace(/'/g, "''")}'`;
}

export async function removeIfExists(target) {
    await rm(target, {recursive: true, force: true});
}
