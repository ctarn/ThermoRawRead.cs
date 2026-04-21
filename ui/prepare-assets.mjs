import {cp, mkdir, rm, stat, writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {promisify} from "node:util";

import pngToIco from "png-to-ico";

const execFileAsync = promisify(execFile);
const uiRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(uiRoot, "..");
const backendOutputDir = join(repoRoot, "tmp", "build-ui", "backend");
const iconOutputDir = join(repoRoot, "tmp", "build-ui", "icon");
const sourcePng = join(repoRoot, "fig", "ThermoRawRead.png");
const legacyIconOutputDir = join(repoRoot, "tmp", "build-ui", "icons");

function hostArch() {
    return {x64: "x86_64", arm64: "arm64"}[process.arch] ?? process.arch;
}

function hostOs() {
    return {darwin: "Darwin", linux: "Linux", win32: "Windows"}[process.platform] ?? process.platform;
}

async function stageBackend() {
    const backendSourceDir = join(repoRoot, "tmp", "build", `${hostArch()}.${hostOs()}`);

    try {
        await stat(backendSourceDir);
    } catch {
        throw new Error(
            `missing backend build at ${backendSourceDir}. Run dotnet build src/ThermoRawRead.csproj -c Release -o tmp/build/${hostArch()}.${hostOs()} first.`
        );
    }

    await rm(backendOutputDir, {recursive: true, force: true});
    await mkdir(backendOutputDir, {recursive: true});
    await cp(backendSourceDir, backendOutputDir, {recursive: true});
}

async function prepareIcns() {
    if (process.platform !== "darwin") return;

    const tiffPath = join(iconOutputDir, "icon.tiff");

    await execFileAsync("sips", [
        "-s",
        "format",
        "tiff",
        sourcePng,
        "--out",
        tiffPath
    ]);
    await execFileAsync("tiff2icns", [
        tiffPath,
        join(iconOutputDir, "icon.icns")
    ]);
    await rm(tiffPath, {force: true});
}

async function prepareIcons() {
    await stat(sourcePng);
    await rm(legacyIconOutputDir, {recursive: true, force: true});
    await rm(iconOutputDir, {recursive: true, force: true});
    await mkdir(iconOutputDir, {recursive: true});
    await cp(sourcePng, join(iconOutputDir, "icon.png"));
    await writeFile(join(iconOutputDir, "icon.ico"), await pngToIco(sourcePng));
    await prepareIcns();
}

async function main() {
    await stageBackend();
    await prepareIcons();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
