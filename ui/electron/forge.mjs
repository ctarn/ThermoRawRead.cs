import {spawn} from "node:child_process";
import {copyFile, cp, mkdir, mkdtemp, rm, stat, writeFile} from "node:fs/promises";
import os from "node:os";
import path, {dirname, join} from "node:path";
import pngToIco from "png-to-ico";
import {productName, version, rid, packageJson, repoDir, buildDir, releaseDir} from "./util.mjs";

const iconDir = join(repoDir, "tmp", "icon");
const artifactsDir = join(repoDir, "tmp", "artifacts");

async function removeIfExists(target) {
    await rm(target, {recursive: true, force: true});
}

function runCommand(command, args, cwd = repoDir) {
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

async function copyReleaseArtifact(source, destination) {
    await mkdir(path.dirname(destination), {recursive: true});
    await removeIfExists(destination);
    await copyFile(source, destination);
}

async function prepareReleaseTargets(platform, arch) {
    const cliZip = path.join(releaseDir, `${productName}-cli-${version}.${rid}.zip`);
    const guiZip = path.join(releaseDir, `${productName}-gui-${version}.${rid}.zip`);

    await mkdir(releaseDir, {recursive: true});
    await removeIfExists(cliZip);
    await removeIfExists(guiZip);

    for (const extension of installerExtensions(platform)) {
        await removeIfExists(path.join(releaseDir, `${productName}-installer-${version}.${rid}.${extension}`));
    }

    return {cliZip, guiZip, suffix: rid};
}

async function stageBackend(platform = process.platform, arch = process.arch) {
    try {
        await stat(buildDir);
    } catch {
        throw new Error(
            `missing backend build at ${buildDir}. Run npm run package or build src/${productName}.csproj first.`
        );
    }

    await removeIfExists(artifactsDir);
    await cp(buildDir, artifactsDir, {recursive: true});
}


async function prepareIcons() {
    const sourcePng = join(repoDir, "fig", `${productName}.png`);
    await stat(sourcePng);
    await removeIfExists(iconDir);
    await mkdir(iconDir, {recursive: true});
    await cp(sourcePng, path.join(iconDir, "icon.png"));
    await writeFile(path.join(iconDir, "icon.ico"), await pngToIco(sourcePng));

    if (process.platform !== "darwin") return;
    const iconsetDir = join(iconDir, "icon.iconset");
    await removeIfExists(iconsetDir);
    await mkdir(iconsetDir, {recursive: true});

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

    for (const [name, w, h] of iconsetSpecs) {
        await runCommand("sips", ["-z", String(w), String(h), sourcePng, "--out", path.join(iconsetDir, name)]);
    }

    await runCommand("iconutil", ["--convert", "icns", iconsetDir, "--output", path.join(iconDir, "icon.icns")]);
}

async function buildBackend(platform = process.platform, arch = process.arch) {
    await runCommand("dotnet", [
        "build",
        path.join("src", `${productName}.csproj`),
        "-c",
        "Release",
        "-o",
        buildDir
    ]);
}

async function buildAndPrepareAssets(platform = process.platform, arch = process.arch) {
    await buildBackend(platform, arch);
    await stageBackend(platform, arch);
    await prepareIcons();
}

function quotePowerShellString(value) {
    return `'${value.replace(/'/g, "''")}'`;
}

async function createCliZip(platform, arch, destination) {
    const stagingRoot = await mkdtemp(path.join(os.tmpdir(), `${productName}-cli-`));
    const cliStageDir = path.join(stagingRoot, "cli");

    try {
        await cp(buildDir, cliStageDir, {recursive: true});

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
        await removeIfExists(stagingRoot);
    }

    return destination;
}

async function organizeReleaseArtifacts(makeResults) {
    const cliDone = new Set();
    const releaseTargetsBySuffix = new Map();
    const rewrittenResults = [];

    for (const result of makeResults) {
        const {platform, arch} = result;
        let releaseTargets = releaseTargetsBySuffix.get(rid);

        if (!releaseTargets) {
            releaseTargets = await prepareReleaseTargets(platform, arch);
            releaseTargetsBySuffix.set(rid, releaseTargets);
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
                const installerDestination = path.join(
                    releaseDir,
                    `${productName}-installer-${version}.${releaseTargets.suffix}${path.extname(artifact)}`
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

const iconBasename = join(iconDir, "icon");

export default {
    outDir: join(repoDir, "tmp", "forge"),
    hooks: {
        generateAssets: async (_forgeConfig, platform, arch) => {
            await buildAndPrepareAssets(platform, arch);
        },
        postMake: async (_forgeConfig, makeResults) => organizeReleaseArtifacts(makeResults)
    },
    packagerConfig: {
        appBundleId: "io.ctarn.thermorawread",
        appCategoryType: "public.app-category.utilities",
        appCopyright: "Copyright © Tarn Yeong Ching",
        asar: true,
        executableName: productName,
        extraResource: [artifactsDir],
        icon: iconBasename,
        name: productName,
        overwrite: true
    },
    makers: [
        {name: "@electron-forge/maker-zip", platforms: ["darwin", "linux", "win32"], config: {}},
        {name: "@electron-forge/maker-dmg", platforms: ["darwin"], config: {
            icon: `${iconBasename}.icns`
        }},
        {name: "@electron-forge/maker-deb", platforms: ["linux"], config: {
            options: {
                homepage: "http://ctarn.io",
                icon: path.join(repoDir, "fig", "ThermoRawRead.png"),
                maintainer: packageJson.author
            }
        }},
        {name: "@electron-forge/maker-squirrel", platforms: ["win32"], config: {
            authors: packageJson.author,
            description: packageJson.description,
            name: productName,
            setupIcon: `${iconBasename}.ico`
        }}
    ]
};
