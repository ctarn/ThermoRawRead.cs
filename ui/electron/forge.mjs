import {spawn} from "node:child_process";
import fs from "node:fs";
import {copyFile, cp, mkdir, mkdtemp, rename, rm, stat, writeFile} from "node:fs/promises";
import path, {basename, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import pngToIco from "png-to-ico";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const packageJson = JSON.parse(fs.readFileSync(join(repoDir, "ui", "package.json"), "utf8"));
const productName = packageJson.productName;
const version = packageJson.version;

const ARCH_NAMES = {x64: "x86_64", arm64: "arm64"};
const PLATFORM_NAMES = {darwin: "Darwin", linux: "Linux", win32: "Windows"};

const rid = `${ARCH_NAMES[process.arch] ?? process.arch}.${PLATFORM_NAMES[process.platform] ?? process.platform}`;

const buildDir = join(repoDir, "tmp", "build", rid);
const releaseDir = join(repoDir, "tmp", "release", version);
const iconDir = join(repoDir, "tmp", "icon");
const artifactsDir = join(repoDir, "tmp", "artifacts");
const sourceIcon = join(repoDir, "fig", `${productName}.png`);
const iconBasename = join(iconDir, "icon");

const rmrf = (target) => rm(target, { recursive: true, force: true });
const mkdirs = (target) => mkdir(target, { recursive: true });

function runCommand(cmd, args, cwd = repoDir) {
    return new Promise((resolve, reject) => {
        const process = spawn(cmd, args, {cwd, stdio: "inherit"});
        process.once("error", reject);
        process.once("close", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with code \`${code}\``)));
    });
}

async function generateAssets() {
    await runCommand("dotnet", ["build", path.join("src", `${productName}.csproj`), "-c", "Release", "-o", buildDir]);
    await rmrf(artifactsDir);
    await cp(buildDir, artifactsDir, {recursive: true});

    await stat(sourceIcon);
    await rmrf(iconDir);
    await mkdirs(iconDir);
    await cp(sourceIcon, `${iconBasename}.png`);
    await writeFile(`${iconBasename}.ico`, await pngToIco(sourceIcon));

    if (process.platform === "darwin") {
        const out = join(iconDir, "icon.iconset");
        await rmrf(out);
        await mkdirs(out);
        for (const size of [16, 32, 128, 256, 512]) {
            const sz = String(size);
            const dsz = String(size * 2);
            await runCommand("sips", ["-z", sz, sz, sourceIcon, "-o", path.join(out, `icon_${sz}x${sz}.png`)]);
            await runCommand("sips", ["-z", dsz, dsz, sourceIcon, "-o", path.join(out, `icon_${sz}x${sz}@2x.png`)]);
        }
        await runCommand("iconutil", ["--convert", "icns", out, "--output", `${iconBasename}.icns`]);
    }
}

async function organizeRelease(makes) {
    await mkdirs(releaseDir);

    const gui = path.join(releaseDir, `${productName}-${version}.${rid}`);
    const cli = path.join(releaseDir, `${productName}-cli-${version}.${rid}`);

    const cliDir = path.join(path.dirname(artifactsDir), path.basename(cli));
    try {
        await rename(artifactsDir, cliDir);
        await rmrf(`${cli}.zip`);
        if (process.platform === "win32") {
            const quote = (value) => `'${value.replace(/'/g, "''")}'`;
            await runCommand("powershell", ["-NoProfile", "-Command",
                `Compress-Archive -Path ${quote(cliDir)} -DestinationPath ${quote(`${cli}.zip`)} -Force`
            ]);
        } else {
            await runCommand("zip", ["-qry", `${cli}.zip`, path.basename(cli)], cliDir);
        }
    } finally {
        await rename(cliDir, artifactsDir);
    }

    const outputs = [];
    for (const result of makes) {
        const out = [`${cli}.zip`];
        for (const src of result.artifacts) {
            const dst = `${gui}${path.extname(src)}`;
            await copyFile(src, dst);
            out.push(dst);
        }
        outputs.push({...result, artifacts: out});
    }
    return outputs;
}

export default {
    outDir: join(repoDir, "tmp", "forge"),
    hooks: {
        generateAssets,
        postMake: (_forgeConfig, makeResults) => organizeRelease(makeResults)
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
                icon: sourceIcon,
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
