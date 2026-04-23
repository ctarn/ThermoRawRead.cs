import fs from "node:fs";
import fsp from "node:fs/promises";
import path, {dirname, join} from "node:path";
import os from "node:os";
import readline from "node:readline";
import {spawn} from "node:child_process";
import {fileURLToPath} from 'url';

import electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

const APPLICATION = "ThermoRawRead";

const {app, BrowserWindow, dialog, ipcMain} = electron;

if (squirrelStartup) app.quit();

const defaultState = Object.freeze({
    inputs: [],
    output: "",
    recursive: false,
    formats: ["umz", "csv", "txt", "meth"]
});

const statePath = path.join(os.homedir(), `.${APPLICATION}`, "ui-state.json");

let mainWindow = null;
let currentTask = null;
let stopRequested = false;

// utils
const send = (chan, msg) => mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send(chan, msg);
const emitStatus = (status, msg) => send("job-status", { status, message: msg });
const emitLog = (line) => send("job-log", { line });

async function chooseFiles(title, filters) {
    const result = await dialog.showOpenDialog(mainWindow, {title, properties: ["openFile", "multiSelections"], filters});
    return result.canceled ? [] : result.filePaths;
}

async function chooseFolder(title) {
    const result = await dialog.showOpenDialog(mainWindow, {title, properties: ["openDirectory"]});
    return result.canceled ? null : result.filePaths[0] ?? null;
}

function resolveExecutable(name = APPLICATION) {
    const paths = [];
    if (process.env[`${name.toUpperCase()}_PATH`]) paths.push(process.env[`${name.toUpperCase()}_PATH`]);
    paths.push(path.join(process.resourcesPath, "artifacts", name));
    paths.push(path.join(path.dirname(process.execPath), "artifacts", name));

    const resolved = paths.find(path => fs.existsSync(path));
    if (resolved) return process.platform === "win32" ? `${resolved}.exe` : resolved;
    throw new Error(`executable \`${name}\` not found`);
}
// utils end

function createMainWindow() {
    const window = new BrowserWindow({
        title: APPLICATION,
        width: 1200,
        height: 900,
        minWidth: 800,
        minHeight: 600,
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

async function loadState() {
    const exists = await fsp.access(statePath).then(() => true).catch(err => err.code === 'ENOENT' ? false : Promise.reject(err));
    return exists? JSON.parse(await fsp.readFile(statePath, "utf8")) : structuredClone(defaultState);
}

async function saveState(state) {
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    await fsp.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function runTask(request) {
    if (!Array.isArray(request?.inputs) || request.inputs.length === 0) throw new Error("input path is required");
    if (!Array.isArray(request?.formats) || request.formats.length === 0) throw new Error("output format is required");
    if (currentTask) throw new Error("already running");

    const exe = resolveExecutable(APPLICATION);

    const args = [];
    args.push(...request.formats.map(output => `--${output}`));
    if (request.recursive) args.push("--recursive");
    const output = request.output?.trim?.() ?? "";
    if (output) args.push("--out", output);
    args.push(...request.inputs);

    const child = spawn(exe, args, {cwd: dirname(exe), stdio: ["ignore", "pipe", "pipe"]});
    let finished = false;

    currentTask = child;
    stopRequested = false;
    emitStatus("running", `Running ${exe}`);

    if (child.stdout) readline.createInterface({input: child.stdout}).on("line", emitLog);
    if (child.stderr) readline.createInterface({input: child.stderr}).on("line", emitLog);

    const finalize = (status, message) => {
        if (finished) return;
        finished = true;
        currentTask = null;
        stopRequested = false;
        emitStatus(status, message);
    };

    child.once("close", (code, signal) => {
        if (stopRequested) finalize("stopped", "Task Stopped.");
        else if (code === 0) finalize("success", "Task Completed Successfully.");
        else finalize("error", `Task Exited: code=${code}; signal=${signal}).`);
    });
    child.once("error", (error) => finalize("error", `Failed to Launch ${exe}: ${error.message}`));
}

function stopTask() {
    if (!currentTask) return;
    stopRequested = true;
    currentTask.kill();
}

ipcMain.handle("load_state", () => loadState());
ipcMain.handle("save_state", (_event, payload) => saveState(payload.state));
ipcMain.handle("pick_raw_files", () => chooseFiles("Select Input Files", [{name: "Thermo RAW", extensions: ["raw"]}]));
ipcMain.handle("pick_input_dir", () => chooseFolder("Select Input Folder"));
ipcMain.handle("pick_output_dir", () => chooseFolder("Select Output Folder"));
ipcMain.handle("run_task", (_event, payload) => runTask(payload.request));
ipcMain.handle("stop_task", () => stopTask());

app.whenReady().then(() => mainWindow = createMainWindow());
app.on("activate", () => {if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();});
app.on("window-all-closed", () => {if (process.platform !== "darwin") app.quit();});
