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
