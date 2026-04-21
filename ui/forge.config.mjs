import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));

const repoRoot = path.resolve(__dirname, "..");
const tmpRoot = path.join(repoRoot, "tmp");
const buildUiRoot = path.join(tmpRoot, "build-ui");
const iconRoot = path.join(buildUiRoot, "icon", "icon");
const backendRoot = path.join(buildUiRoot, "backend");
const forgeOutDir = path.join(buildUiRoot, packageJson.version, "gui-build");
const productName = packageJson.productName;
const maker = (name, platforms, config) => ({
    name,
    platforms,
    ...(config ? {config} : {})
});

export default {
    outDir: forgeOutDir,
    packagerConfig: {
        appBundleId: "io.ctarn.thermorawread",
        appCategoryType: "public.app-category.utilities",
        appCopyright: "Copyright © Tarn Yeong Ching",
        asar: true,
        executableName: productName,
        extraResource: [backendRoot],
        icon: iconRoot,
        name: productName,
        overwrite: true
    },
    makers: [
        maker("@electron-forge/maker-zip", ["darwin", "linux", "win32"]),
        maker("@electron-forge/maker-dmg", ["darwin"], {
            icon: `${iconRoot}.icns`
        }),
        maker("@electron-forge/maker-deb", ["linux"], {
            options: {
                homepage: "http://ctarn.io",
                icon: path.join(repoRoot, "fig", "ThermoRawRead.png"),
                maintainer: packageJson.author
            }
        }),
        maker("@electron-forge/maker-squirrel", ["win32"], {
            authors: packageJson.author,
            description: packageJson.description,
            name: productName,
            setupIcon: `${iconRoot}.ico`
        })
    ]
};
