import fs from "node:fs";
import {copyFile, cp, mkdir, mkdtemp, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

function currentArch() {
    return typeof process === "undefined" ? undefined : process.arch;
}

function currentPlatform() {
    return typeof process === "undefined" ? undefined : process.platform;
}

function normalizeArch(arch = currentArch()) {
    return {x64: "x86_64", arm64: "arm64"}[arch] ?? arch;
}

function normalizePlatform(platform = currentPlatform()) {
    return {darwin: "Darwin", linux: "Linux", win32: "Windows"}[platform] ?? platform;
}

export function releaseSuffix(platform = currentPlatform(), arch = currentArch()) {
    return `${normalizeArch(arch)}.${normalizePlatform(platform)}`;
}

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const packageJson = JSON.parse(fs.readFileSync(join(repoRoot, "ui", "package.json"), "utf8"));
export const productName = packageJson.productName;
export const version = packageJson.version;

export const buildRoot = join(repoRoot, "tmp", "build", `${releaseSuffix()}`);
export const releaseDir = join(repoRoot, "tmp", "release", version);

export async function removeIfExists(target) {
    await rm(target, {recursive: true, force: true});
}
