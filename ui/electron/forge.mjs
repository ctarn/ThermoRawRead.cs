import {spawn} from "node:child_process";
import {readFileSync} from "node:fs";
import {copyFile, cp, mkdir, rename, rm, stat, writeFile} from "node:fs/promises";
import {basename, dirname, extname, join} from "node:path";
import {fileURLToPath} from "node:url";
import pngToIco from "png-to-ico";

const repoDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const packageJson = JSON.parse(readFileSync(join(repoDir, "ui", "package.json"), "utf8"));
const APPLICATION = packageJson.productName;
const VERSION = packageJson.version;

const ARCH_NAMES = {x64: "x86_64", arm64: "arm64"};
const PLATFORM_NAMES = {darwin: "Darwin", linux: "Linux", win32: "Windows"};
const RID = `${ARCH_NAMES[process.arch] ?? process.arch}.${PLATFORM_NAMES[process.platform] ?? process.platform}`;

const buildDir = join(repoDir, "tmp", "build", RID);
const releaseDir = join(repoDir, "tmp", "release", VERSION);
const artifactsDir = join(repoDir, "tmp", "artifacts");
const iconDir = join(repoDir, "tmp", "icon");
const iconBasename = join(iconDir, "icon");
const sourceIcon = join(repoDir, "fig", `${APPLICATION}.png`);

const rmrf = (target) => rm(target, { recursive: true, force: true });
const mkdirs = (target) => mkdir(target, { recursive: true });

function run(cmd, args, cwd = repoDir) {
    return new Promise((resolve, reject) => {
        const process = spawn(cmd, args, {cwd, stdio: "inherit"});
        process.once("error", reject);
        process.once("close", code => code === 0 ? resolve() : reject(new Error(`${cmd} exited with code \`${code}\``)));
    });
}

async function generateAssets() {
    await run("dotnet", ["build", join("src", `${APPLICATION}.csproj`), "-c", "Release", "-o", buildDir]);
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
            await run("sips", ["-z", sz, sz, sourceIcon, "-o", join(out, `icon_${sz}x${sz}.png`)]);
            await run("sips", ["-z", dsz, dsz, sourceIcon, "-o", join(out, `icon_${sz}x${sz}@2x.png`)]);
        }
        await run("iconutil", ["--convert", "icns", out, "--output", `${iconBasename}.icns`]);
    }
}

async function organizeRelease(makes) {
    await mkdirs(releaseDir);

    const gui = join(releaseDir, `${APPLICATION}-${VERSION}.${RID}`);
    const cli = join(releaseDir, `${APPLICATION}-cli-${VERSION}.${RID}`);

    const cliDir = join(dirname(artifactsDir), basename(cli));
    try {
        await rename(artifactsDir, cliDir);
        await rmrf(`${cli}.zip`);
        if (process.platform === "win32") {
            const quote = (value) => `'${value.replace(/'/g, "''")}'`;
            await run("powershell", ["-NoProfile", "-Command",
                `Compress-Archive -Path ${quote(cliDir)} -DestinationPath ${quote(`${cli}.zip`)} -Force`
            ]);
        } else {
            await run("zip", ["-qry", `${cli}.zip`, basename(cliDir)], dirname(cliDir));
        }
    } finally {
        await rename(cliDir, artifactsDir);
    }

    const outputs = [];
    for (const result of makes) {
        const out = [`${cli}.zip`];
        for (const src of result.artifacts) {
            const dst = `${gui}${extname(src)}`;
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
        executableName: APPLICATION,
        extraResource: [artifactsDir],
        icon: iconBasename,
        name: APPLICATION,
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
            name: APPLICATION,
            setupIcon: `${iconBasename}.ico`
        }}
    ]
};
