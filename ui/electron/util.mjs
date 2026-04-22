import fs from "node:fs";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

export const arch = {
    x64: "x86_64", arm64: "arm64",
}[process.arch] ?? process.arch;
export const platform = {
    darwin: "Darwin", linux: "Linux", win32: "Windows",
}[process.platform] ?? process.platform;
export const rid = `${arch}.${platform}`;

export const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const packageJson = JSON.parse(fs.readFileSync(join(repoDir, "ui", "package.json"), "utf8"));
export const productName = packageJson.productName;
export const version = packageJson.version;

export const buildDir = join(repoDir, "tmp", "build", rid);
export const releaseDir = join(repoDir, "tmp", "release", version);
