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
const iconsetOutputDir = join(iconOutputDir, "icon.iconset");
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

    await rm(iconsetOutputDir, {recursive: true, force: true});

    await execFileAsync("/bin/zsh", [
        "-lc",
        [
            `mkdir -p ${JSON.stringify(`${iconsetOutputDir}/`)}`,
            `sips -z 16 16 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_16x16.png"))}`,
            `sips -z 32 32 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_16x16@2x.png"))}`,
            `sips -z 32 32 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_32x32.png"))}`,
            `sips -z 64 64 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_32x32@2x.png"))}`,
            `sips -z 128 128 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_128x128.png"))}`,
            `sips -z 256 256 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_128x128@2x.png"))}`,
            `sips -z 256 256 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_256x256.png"))}`,
            `sips -z 512 512 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_256x256@2x.png"))}`,
            `sips -z 512 512 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_512x512.png"))}`,
            `sips -z 1024 1024 ${JSON.stringify(sourcePng)} --out ${JSON.stringify(join(iconsetOutputDir, "icon_512x512@2x.png"))}`,
            `iconutil --convert icns ${JSON.stringify(iconsetOutputDir)} --output ${JSON.stringify(join(iconOutputDir, "icon.icns"))}`
        ].join("\n")
    ]);
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
