import fs from "node:fs";
import fsp from "node:fs/promises";
import path, {dirname, join} from "node:path";
import readline from "node:readline";
import {spawn} from "node:child_process";
import {fileURLToPath} from 'url';

import electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

const {app, BrowserWindow, dialog, ipcMain} = electron;

let mainWindow = null;
const tasks = new Map();

function createMainWindow() {
    const window = new BrowserWindow({
        width: 1200,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: "#ffffff",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            preload: join(dirname(fileURLToPath(import.meta.url)), "preload.mjs"),
        }
    });

    void window.loadFile(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "main.html"));
    window.on("closed", () => {if (mainWindow === window) mainWindow = null;});
    return window;
}

if (squirrelStartup) app.quit();
app.whenReady().then(() => mainWindow = createMainWindow());
app.on("activate", () => {if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();});
app.on("window-all-closed", () => {if (process.platform !== "darwin") app.quit();});

const send = (chan, msg) => mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send(chan, msg);
const emitStatus = (taskId, status, msg) => send("task-status", {task_id: taskId, status, message: msg});
const emitLog = (taskId, line) => send("task-log", {task_id: taskId, line});

function normalizeTaskId(id) {
    if (!Number.isSafeInteger(id) || id < 0) throw new Error("task id must be a safe integer");
    return id;
}

async function loadState(statePath) {
    if (typeof statePath !== "string" || statePath.length === 0) throw new Error("state path is required");
    return JSON.parse(await fsp.readFile(statePath, "utf8"));
}

async function saveState(statePath, state) {
    if (typeof statePath !== "string" || statePath.length === 0) throw new Error("state path is required");
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

function resolveExecutable(name, taskId = null) {
    const paths = [];
    if (process.env[`${name.toUpperCase()}_PATH`]) paths.push(process.env[`${name.toUpperCase()}_PATH`]);
    paths.push(path.join(process.resourcesPath, "artifacts", name));
    paths.push(path.join(path.dirname(process.execPath), "artifacts", name));

    const resolved = paths.find(path => fs.existsSync(path));
    if (resolved) return process.platform === "win32" ? `${resolved}.exe` : resolved;
    emitLog(taskId, "Attempted paths (executable not found):");
    paths.forEach(p => emitLog(taskId, `  ${p}`));
    throw new Error(`executable \`${name}\` not found`);
}

function runTask(request) {
    const id = normalizeTaskId(request?.task_id);
    if (tasks.has(id)) throw new Error(`task ${id} is already running`);

    const cmd = request?.command?.trim?.();
    if (!cmd) throw new Error("command is required");

    if (!Array.isArray(request?.args)) throw new Error("command arguments are required");
    if (request.args.some(arg => typeof arg !== "string")) throw new Error("command arguments must be strings");

    const exe = resolveExecutable(cmd, id);
    const args = [...request.args];

    const proc = spawn(exe, args, {cwd: dirname(exe), stdio: ["ignore", "pipe", "pipe"]});
    if (proc.stdout) readline.createInterface({input: proc.stdout}).on("line", (line) => emitLog(id, line));
    if (proc.stderr) readline.createInterface({input: proc.stderr}).on("line", (line) => emitLog(id, line));

    const state = {process: proc, stopped: false};
    tasks.set(id, state);
    emitStatus(id, "running", `Task #${id} Running: ${exe}`);

    proc.once("close", (code, signal) => {
        if (state.stopped) emitStatus(id, "stopped", `Task #${id} Stopped.`);
        else if (code === 0) emitStatus(id, "success", `Task #${id} Completed Successfully.`);
        else emitStatus(id, "error", `Task #${id} Exited: code=${code}; signal=${signal}.`);
        tasks.delete(id)
    });
    proc.once("error", (error) => {
        emitStatus(id, "error", `Task #${id} Failed: ${error.message}`);
        tasks.delete(id)
    });
}

function stopTask(request) {
    const id = normalizeTaskId(request?.task_id);
    const state = tasks.get(id);
    if (!state) throw new Error(`task ${id} is not existing`);
    state.stopped = true;
    state.process.kill();
}

ipcMain.handle("load_state", (_event, payload) => loadState(payload.state_path));
ipcMain.handle("save_state", (_event, payload) => saveState(payload.state_path, payload.state));
ipcMain.handle("pick_raw_files", () => chooseFiles("Select Input Files", [{name: "Thermo RAW", extensions: ["raw"]}]));
ipcMain.handle("pick_input_dir", () => chooseFolder("Select Input Folder"));
ipcMain.handle("pick_output_dir", () => chooseFolder("Select Output Folder"));
ipcMain.handle("run_task", (_event, payload) => runTask(payload));
ipcMain.handle("stop_task", (_event, payload) => stopTask(payload));
