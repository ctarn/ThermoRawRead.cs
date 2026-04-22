import fs from "node:fs";
import {copyFile, cp, mkdir, mkdtemp, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

export function releaseSuffix(platform = currentPlatform(), arch = currentArch()) {
    arch = {x64: "x86_64", arm64: "arm64"}[process.arch] ?? process.arch;
    platform = {darwin: "Darwin", linux: "Linux", win32: "Windows"}[process.platform] ?? process.platform;
    return `${arch}.${platform}`;
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
