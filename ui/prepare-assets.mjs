import {spawn} from "node:child_process";
import {copyFile, cp, mkdir, mkdtemp, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path, {join} from "node:path";
import {fileURLToPath} from "node:url";

import pngToIco from "png-to-ico";
import {
    backendBuildDir,
    backendOutputDir,
    iconOutputDir,
    iconsetOutputDir,
    legacyIconOutputDir,
    productName,
    releaseDir,
    releaseVersion,
    repoRoot,
    sourcePng
} from "./meta.mjs";
import {quotePowerShellString, releaseSuffix} from "./util.mjs";

const iconsetSpecs = [
    ["icon_16x16.png", 16, 16],
    ["icon_16x16@2x.png", 32, 32],
    ["icon_32x32.png", 32, 32],
    ["icon_32x32@2x.png", 64, 64],
    ["icon_128x128.png", 128, 128],
    ["icon_128x128@2x.png", 256, 256],
    ["icon_256x256.png", 256, 256],
    ["icon_256x256@2x.png", 512, 512],
    ["icon_512x512.png", 512, 512],
    ["icon_512x512@2x.png", 1024, 1024]
];

function runCommand(command, args, cwd = repoRoot) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: "inherit"
        });

        child.once("error", reject);
        child.once("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(new Error(`${command} exited with status ${code ?? "unknown"}`));
        });
    });
}

function installerExtensions(platform) {
    if (platform === "darwin") return ["dmg", "pkg"];
    if (platform === "linux") return ["deb", "rpm", "AppImage"];
    if (platform === "win32") return ["exe", "msi"];
    return [];
}

function isGuiZipArtifact(artifact) {
    return artifact.toLowerCase().endsWith(".zip");
}

function isInstallerArtifact(platform, artifact) {
    const lowerArtifact = artifact.toLowerCase();
    return installerExtensions(platform).some((extension) => lowerArtifact.endsWith(`.${extension.toLowerCase()}`));
}

async function removeIfExists(target) {
    await rm(target, {recursive: true, force: true});
}

async function prepareReleaseTargets(platform, arch) {
    const suffix = releaseSuffix(platform, arch);
    const cliZip = join(releaseDir, `${productName}-cli-${releaseVersion}.${suffix}.zip`);
    const guiZip = join(releaseDir, `${productName}-gui-${releaseVersion}.${suffix}.zip`);

    await mkdir(releaseDir, {recursive: true});
    await removeIfExists(cliZip);
    await removeIfExists(guiZip);

    for (const extension of installerExtensions(platform)) {
        await removeIfExists(join(releaseDir, `${productName}-installer-${releaseVersion}.${suffix}.${extension}`));
    }

    return {cliZip, guiZip, suffix};
}

async function copyReleaseArtifact(source, destination) {
    await mkdir(path.dirname(destination), {recursive: true});
    await removeIfExists(destination);
    await copyFile(source, destination);
}

async function stageBackend(platform = process.platform, arch = process.arch) {
    const sourceDir = backendBuildDir(platform, arch);

    try {
        await stat(sourceDir);
    } catch {
        throw new Error(
            `missing backend build at ${sourceDir}. Run npm run package or build src/${productName}.csproj first.`
        );
    }

    await rm(backendOutputDir, {recursive: true, force: true});
    await cp(sourceDir, backendOutputDir, {recursive: true});
}

async function prepareIcns() {
    if (process.platform !== "darwin") return;

    await rm(iconsetOutputDir, {recursive: true, force: true});
    await mkdir(iconsetOutputDir, {recursive: true});

    for (const [name, width, height] of iconsetSpecs) {
        await runCommand("sips", [
            "-z",
            String(width),
            String(height),
            sourcePng,
            "--out",
            join(iconsetOutputDir, name)
        ]);
    }

    await runCommand("iconutil", [
        "--convert",
        "icns",
        iconsetOutputDir,
        "--output",
        join(iconOutputDir, "icon.icns")
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

export async function buildBackend(platform = process.platform, arch = process.arch) {
    await runCommand("dotnet", [
        "build",
        join("src", `${productName}.csproj`),
        "-c",
        "Release",
        "-o",
        backendBuildDir(platform, arch)
    ]);
}

export async function prepareAssets(platform = process.platform, arch = process.arch) {
    await stageBackend(platform, arch);
    await prepareIcons();
}

export async function buildAndPrepareAssets(platform = process.platform, arch = process.arch) {
    await buildBackend(platform, arch);
    await prepareAssets(platform, arch);
}

async function createCliZip(platform, arch, destination) {
    const sourceDir = backendBuildDir(platform, arch);
    const stagingRoot = await mkdtemp(join(os.tmpdir(), `${productName}-cli-`));
    const cliStageDir = join(stagingRoot, "cli");

    try {
        await cp(sourceDir, cliStageDir, {recursive: true});

        if (platform === "win32") {
            await runCommand("powershell", [
                "-NoProfile",
                "-Command",
                `Compress-Archive -Path ${quotePowerShellString(`${cliStageDir}\\*`)} -DestinationPath ${quotePowerShellString(destination)} -Force`
            ]);
        } else {
            await runCommand("zip", ["-qry", destination, "cli"], stagingRoot);
        }
    } finally {
        await rm(stagingRoot, {recursive: true, force: true});
    }

    return destination;
}

export async function organizeReleaseArtifacts(makeResults) {
    const cliDone = new Set();
    const releaseTargetsBySuffix = new Map();
    const rewrittenResults = [];

    for (const result of makeResults) {
        const {platform, arch} = result;
        const suffix = releaseSuffix(platform, arch);
        let releaseTargets = releaseTargetsBySuffix.get(suffix);

        if (!releaseTargets) {
            releaseTargets = await prepareReleaseTargets(platform, arch);
            releaseTargetsBySuffix.set(suffix, releaseTargets);
        }

        const rewrittenArtifacts = [];
        let installerCopied = false;

        if (!cliDone.has(releaseTargets.suffix)) {
            rewrittenArtifacts.push(await createCliZip(platform, arch, releaseTargets.cliZip));
            cliDone.add(releaseTargets.suffix);
        }

        for (const artifact of result.artifacts) {
            if (isGuiZipArtifact(artifact)) {
                await copyReleaseArtifact(artifact, releaseTargets.guiZip);
                rewrittenArtifacts.push(releaseTargets.guiZip);
                continue;
            }

            if (!installerCopied && isInstallerArtifact(platform, artifact)) {
                const installerDestination = join(
                    releaseDir,
                    `${productName}-installer-${releaseVersion}.${releaseTargets.suffix}${path.extname(artifact)}`
                );

                await copyReleaseArtifact(artifact, installerDestination);
                rewrittenArtifacts.push(installerDestination);
                installerCopied = true;
            }
        }

        if (rewrittenArtifacts.length > 0) {
            rewrittenResults.push({
                ...result,
                artifacts: rewrittenArtifacts
            });
        }
    }

    return rewrittenResults;
}

async function main() {
    await buildAndPrepareAssets();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
