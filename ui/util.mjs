function currentArch() {
    return typeof process === "undefined" ? undefined : process.arch;
}

function currentPlatform() {
    return typeof process === "undefined" ? undefined : process.platform;
}

export function normalizeArch(arch = currentArch()) {
    return {x64: "x86_64", arm64: "arm64"}[arch] ?? arch;
}

export function normalizePlatform(platform = currentPlatform()) {
    return {darwin: "Darwin", linux: "Linux", win32: "Windows"}[platform] ?? platform;
}

export function releaseSuffix(platform = currentPlatform(), arch = currentArch()) {
    return `${normalizeArch(arch)}.${normalizePlatform(platform)}`;
}

export function backendExecutableName(productName, platform = currentPlatform()) {
    return platform === "win32" ? `${productName}.exe` : productName;
}

export function quoteArg(value) {
    if (value === "") return '""';
    return /\s/.test(value) ? JSON.stringify(value) : value;
}

export function pathSeparator(path) {
    return path.includes("\\") ? "\\" : "/";
}

export function trimTrailingSeparators(path) {
    return path.replace(/[\\/]+$/, "");
}

export function defaultOutDir(path) {
    const normalized = trimTrailingSeparators(path);
    const separator = pathSeparator(normalized);
    const index = normalized.lastIndexOf(separator);

    if (index < 0) return `${normalized}${separator}out`;
    if (index === 0) return `${separator}out`;

    return `${normalized.slice(0, index)}${separator}out`;
}

export function quotePowerShellString(value) {
    return `'${value.replace(/'/g, "''")}'`;
}
