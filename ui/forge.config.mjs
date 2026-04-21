import path from "node:path";
import {
    backendOutputDir,
    forgeOutDir,
    iconRoot,
    packageJson,
    productName,
    repoRoot
} from "./meta.mjs";
import {buildAndPrepareAssets, organizeReleaseArtifacts} from "./prepare-assets.mjs";

const maker = (name, platforms, config) => ({
    name,
    platforms,
    ...(config ? {config} : {})
});

export default {
    outDir: forgeOutDir,
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
        extraResource: [backendOutputDir],
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
