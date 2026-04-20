import {cp, mkdir, rm, stat, writeFile} from "node:fs/promises";
import path, {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

import pngToIco from "png-to-ico";

const uiRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(uiRoot, "..");
const backendOutputDir = join(repoRoot, "tmp", "build-ui", "backend");
const iconOutputDir = join(repoRoot, "tmp", "build-ui", "icons");
const sourcePng = join(repoRoot, "fig", "ThermoRawRead.png");
const sourceIcns = join(repoRoot, "fig", "ThermoRawRead.icns");

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

async function prepareIcons() {
    await mkdir(iconOutputDir, {recursive: true});
    await cp(sourcePng, join(iconOutputDir, "icon.png"));
    await cp(sourceIcns, join(iconOutputDir, "icon.icns"));
    await writeFile(join(iconOutputDir, "icon.ico"), await pngToIco(sourcePng));
}

async function main() {
    await stageBackend();
    await prepareIcons();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
