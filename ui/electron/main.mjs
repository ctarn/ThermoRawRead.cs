import fs from "node:fs";
import fsp from "node:fs/promises";
import path, {dirname, join} from "node:path";
import os from "node:os";
import readline from "node:readline";
import {spawn} from "node:child_process";
import { fileURLToPath } from 'url';

import electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

const name = "ThermoRawRead";

const {app, BrowserWindow, dialog, ipcMain} = electron;

if (squirrelStartup) {
    app.quit();
}

const defaultSavedState = Object.freeze({
    inputPaths: [],
    outputDir: "",
    recursive: false,
    outputs: ["umz", "csv", "txt", "meth"]
});

let mainWindow = null;
let currentJob = null;
let stopRequested = false;

function send(channel, payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
}

function emitStatus(status, message) {
    send("job-status", {status, message});
}

function emitLog(line) {
    send("job-log", {line});
}

function createMainWindow() {
    const window = new BrowserWindow({
        title: "ThermoRawRead",
        width: 1360,
        height: 920,
        minWidth: 1024,
        minHeight: 720,
        backgroundColor: "#f6efe7",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            preload: join(dirname(fileURLToPath(import.meta.url)), 'preload.js'),
        }
    });

    void window.loadFile(join(dirname(fileURLToPath(import.meta.url)), "..", "main.html"));
    window.on("closed", () => {
        if (mainWindow === window) {
            mainWindow = null;
        }
    });
    return window;
}


function backendExecutableName(productName, platform = currentPlatform()) {
    return platform === "win32" ? `${productName}.exe` : productName;
}

function resolveBackendExecutable() {
    const candidates = [];

    if (process.env.THERMO_RAW_READ_BIN) {
        candidates.push(process.env.THERMO_RAW_READ_BIN);
    }

    candidates.push(path.join(process.resourcesPath, "artifacts", backendExecutableName(name)));
    candidates.push(path.join(path.dirname(process.execPath), "artifacts", backendExecutableName(name)));

    const resolved = candidates.find((candidate) => fs.existsSync(candidate));
    if (resolved) return resolved;

    throw new Error(
        "ThermoRawRead backend not found. Build src/ThermoRawRead.csproj first or set THERMO_RAW_READ_BIN."
    );
}

function attachLogStream(stream) {
    if (!stream) return;

    readline.createInterface({input: stream}).on("line", (line) => {
        emitLog(line);
    });
}

function buildCommandArgs(request) {
    const args = [];

    request.outputs.forEach((output) => {
        args.push(`--${output}`);
    });

    if (request.recursive) {
        args.push("--recursive");
    }

    const outputDir = request.outputDir?.trim?.() ?? "";
    if (outputDir) {
        args.push("--out", outputDir);
    }

    args.push(...request.inputPaths);
    return args;
}

function finishJob(status, message) {
    currentJob = null;
    emitStatus(status, message);
}

function runJob(request) {
    if (!Array.isArray(request?.inputPaths) || request.inputPaths.length === 0) {
        throw new Error("at least one input path is required");
    }
    if (!Array.isArray(request?.outputs) || request.outputs.length === 0) {
        throw new Error("at least one output format is required");
    }
    if (currentJob) {
        throw new Error("a conversion is already running");
    }

    const backend = resolveBackendExecutable();
    const child = spawn(backend, buildCommandArgs(request), {
        cwd: dirname(backend),
        stdio: ["ignore", "pipe", "pipe"]
    });
    let finished = false;

    const finalize = (status, message) => {
        if (finished) return;
        finished = true;
        finishJob(status, message);
    };

    currentJob = child;
    stopRequested = false;
    emitStatus("running", `Running ${backend}`);

    attachLogStream(child.stdout);
    attachLogStream(child.stderr);

    child.once("error", (error) => {
        finalize("error", `Failed to launch ${backend}: ${error.message}`);
    });

    child.once("close", (code, signal) => {
        if (stopRequested) {
            stopRequested = false;
            finalize("stopped", "Conversion stopped.");
            return;
        }

        if (code === 0) {
            finalize("success", "Conversion completed successfully.");
            return;
        }

        const detail = signal ? `signal ${signal}` : `status ${code ?? "unknown"}`;
        finalize("error", `Conversion exited with ${detail}.`);
    });
}

function stopJob() {
    if (!currentJob) return;
    stopRequested = true;
    currentJob.kill();
}

const statePath = path.join(os.homedir(), `.${name}`, "ui-state.json");

async function loadState() {
    try {
        const content = await fsp.readFile(statePath, "utf8");
        return JSON.parse(content);
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return {
                ...defaultSavedState,
                outputs: [...defaultSavedState.outputs]
            };
        }

        throw error;
    }
}

async function saveState(state) {
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    await fsp.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function chooseRawFiles() {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select Thermo RAW files",
        properties: ["openFile", "multiSelections"],
        filters: [{name: "Thermo RAW", extensions: ["raw"]}]
    });

    return result.canceled ? [] : result.filePaths;
}

async function chooseFolder(title) {
    const result = await dialog.showOpenDialog(mainWindow, {
        title,
        properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
}

ipcMain.handle("load_state", () => loadState());
ipcMain.handle("save_state", (_event, payload) => saveState(payload.state));
ipcMain.handle("pick_raw_files", () => chooseRawFiles());
ipcMain.handle("pick_input_dir", () => chooseFolder("Select input folder"));
ipcMain.handle("pick_output_dir", () => chooseFolder("Select output folder"));
ipcMain.handle("run_job", (_event, payload) => runJob(payload.request));
ipcMain.handle("stop_job", () => stopJob());

app.whenReady().then(() => {
    mainWindow = createMainWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createMainWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
