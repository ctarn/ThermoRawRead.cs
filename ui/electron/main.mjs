import fs from "node:fs";
import fsp from "node:fs/promises";
import path, {dirname, join} from "node:path";
import os from "node:os";
import readline from "node:readline";
import {spawn} from "node:child_process";
import {fileURLToPath} from 'url';

import electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

const name = "ThermoRawRead";

const {app, BrowserWindow, dialog, ipcMain} = electron;

if (squirrelStartup) app.quit();

const defaultState = Object.freeze({
    inputs: [],
    output: "",
    recursive: false,
    formats: ["umz", "csv", "txt", "meth"]
});

let mainWindow = null;
let currentJob = null;
let stopRequested = false;

function send(channel, payload) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(channel, payload);
}

const emitStatus = (status, message) => send("job-status", { status, message });
const emitLog = (line) => send("job-log", { line });

function createMainWindow() {
    const window = new BrowserWindow({
        title: name,
        width: 1360,
        height: 920,
        minWidth: 1024,
        minHeight: 720,
        backgroundColor: "#ffffff",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            preload: join(dirname(fileURLToPath(import.meta.url)), 'preload.js'),
        }
    });

    void window.loadFile(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "main.html"));
    window.on("closed", () => {if (mainWindow === window) mainWindow = null;});
    return window;
}

function resolveExecutable(name = name) {
    const candidates = [];
    if (process.env[`${name.toUpperCase()}_BACKEND`]) candidates.push(process.env[`${name.toUpperCase()}_BACKEND`]);
    candidates.push(path.join(process.resourcesPath, "artifacts", name));
    candidates.push(path.join(path.dirname(process.execPath), "artifacts", name));

    const resolved = candidates.find(candidate => fs.existsSync(candidate));
    if (resolved) return process.platform === "win32" ? `${resolved}.exe` : resolved;
    throw new Error(`Executable \`${name}\` Not Found.`);
}

function buildCommandArgs(request) {
    const args = [];
    
    args.push(...request.formats.map(output => `--${output}`));
    
    if (request.recursive) args.push("--recursive");
    
    const output = request.output?.trim?.() ?? "";
    if (output) args.push("--out", output);

    args.push(...request.inputs);
    return args;
}

const statePath = path.join(os.homedir(), `.${name}`, "ui-state.json");

async function loadState() {
    try {
        return JSON.parse(await fsp.readFile(statePath, "utf8"));
    } catch (error) {
        if (error && error.code === "ENOENT") return structuredClone(defaultState);
        throw error;
    }
}

async function saveState(state) {
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    await fsp.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

async function chooseFiles(title, filters) {
    const result = await dialog.showOpenDialog(mainWindow, {title, properties: ["openFile", "multiSelections"], filters});
    return result.canceled ? [] : result.filePaths;
}

async function chooseFolder(title) {
    const result = await dialog.showOpenDialog(mainWindow, {title, properties: ["openDirectory"]});
    return result.canceled ? null : result.filePaths[0] ?? null;
}

function runJob(request) {
    if (!Array.isArray(request?.inputs) || request.inputs.length === 0) {
        throw new Error("at least one input path is required");
    }
    if (!Array.isArray(request?.formats) || request.formats.length === 0) {
        throw new Error("at least one output format is required");
    }
    if (currentJob) {
        throw new Error("a task is already running");
    }

    const backend = resolveExecutable();
    const child = spawn(backend, buildCommandArgs(request), {
        cwd: dirname(backend),
        stdio: ["ignore", "pipe", "pipe"]
    });
    let finished = false;

    const finalize = (status, message) => {
        if (finished) return;
        finished = true;
        currentJob = null;
        emitStatus(status, message);
    };

    currentJob = child;
    stopRequested = false;
    emitStatus("running", `Running ${backend}`);

    if (child.stdout) readline.createInterface({input: child.stdout}).on("line", emitLog);
    if (child.stderr) readline.createInterface({input: child.stderr}).on("line", emitLog);

    child.once("error", (error) => finalize("error", `Failed to launch ${backend}: ${error.message}`));

    child.once("close", (code, signal) => {
        if (stopRequested) {
            stopRequested = false;
            finalize("stopped", "Task Stopped.");
            return;
        }
        if (code === 0) {
            finalize("success", "Task Completed Successfully.");
            return;
        }
        const detail = signal ? `Signal ${signal}` : `Status ${code ?? "Unknown"}`;
        finalize("error", `Task Exited with ${detail}.`);
    });
}

function stopJob() {
    if (!currentJob) return;
    stopRequested = true;
    currentJob.kill();
}

ipcMain.handle("load_state", () => loadState());
ipcMain.handle("save_state", (_event, payload) => saveState(payload.state));
ipcMain.handle("pick_raw_files", () => chooseFiles("Select Input Files", [{name: "Thermo RAW", extensions: ["raw"]}]));
ipcMain.handle("pick_input_dir", () => chooseFolder("Select Input Folder"));
ipcMain.handle("pick_output_dir", () => chooseFolder("Select Output Folder"));
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
