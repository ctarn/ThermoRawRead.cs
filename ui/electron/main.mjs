import fs from "node:fs";
import fsp from "node:fs/promises";
import path, {dirname, join} from "node:path";
import readline from "node:readline";
import {spawn} from "node:child_process";
import {fileURLToPath} from 'url';

import electron from "electron";
import squirrelStartup from "electron-squirrel-startup";

const {app, BrowserWindow, dialog, ipcMain} = electron;

if (squirrelStartup) app.quit();

let mainWindow = null;
const tasks = new Map();

// utils
const send = (chan, msg) => mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.send(chan, msg);
const emitStatus = (taskId, status, msg) => send("job-status", {task_id: taskId, status, message: msg});
const emitLog = (taskId, line) => send("job-log", {task_id: taskId, line});

async function chooseFiles(title, filters) {
    const result = await dialog.showOpenDialog(mainWindow, {title, properties: ["openFile", "multiSelections"], filters});
    return result.canceled ? [] : result.filePaths;
}

async function chooseFolder(title) {
    const result = await dialog.showOpenDialog(mainWindow, {title, properties: ["openDirectory"]});
    return result.canceled ? null : result.filePaths[0] ?? null;
}

function normalizeTaskId(id) {
    if (!Number.isSafeInteger(id) || id < 0) throw new Error("task_id must be a safe integer");
    return id;
}

function resolveExecutable(name, taskId = null) {
    const paths = [];
    if (process.env[`${name.toUpperCase()}_PATH`]) paths.push(process.env[`${name.toUpperCase()}_PATH`]);
    paths.push(path.join(process.resourcesPath, "artifacts", name));
    paths.push(path.join(path.dirname(process.execPath), "artifacts", name));

    const resolved = paths.find(path => fs.existsSync(path));
    if (resolved) return process.platform === "win32" ? `${resolved}.exe` : resolved;
    if (taskId !== null) {
        emitLog(taskId, "Attempted paths (executable not found):");
        paths.forEach(p => emitLog(taskId, `  ${p}`));
    }
    throw new Error(`executable \`${name}\` not found`);
}
// utils end

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

async function loadState(statePath) {
    if (typeof statePath !== "string" || statePath.length === 0) throw new Error("state_path is required");
    return JSON.parse(await fsp.readFile(statePath, "utf8"));
}

async function saveState(statePath, state) {
    if (typeof statePath !== "string" || statePath.length === 0) throw new Error("state_path is required");
    await fsp.mkdir(path.dirname(statePath), {recursive: true});
    await fsp.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}

function runCommand(request) {
    const taskId = normalizeTaskId(request?.task_id);
    if (tasks.has(taskId)) throw new Error(`task ${taskId} is already running`);

    const command = request?.command?.trim?.();
    if (!command) throw new Error("command is required");

    if (!Array.isArray(request?.args)) throw new Error("command arguments are required");
    const args = request.args.map((arg) => {
        if (typeof arg !== "string") throw new Error("command arguments must be strings");
        return arg;
    });

    const exe = resolveExecutable(command, taskId);

    const child = spawn(exe, args, {cwd: dirname(exe), stdio: ["ignore", "pipe", "pipe"]});
    let finished = false;
    const taskState = {child, stopRequested: false};

    tasks.set(taskId, taskState);
    emitStatus(taskId, "running", `Running ${exe}`);

    if (child.stdout) readline.createInterface({input: child.stdout}).on("line", (line) => emitLog(taskId, line));
    if (child.stderr) readline.createInterface({input: child.stderr}).on("line", (line) => emitLog(taskId, line));

    const finalize = (status, message) => {
        if (finished) return;
        finished = true;
        tasks.delete(taskId);
        emitStatus(taskId, status, message);
    };

    child.once("close", (code, signal) => {
        if (taskState.stopRequested) finalize("stopped", "Task Stopped.");
        else if (code === 0) finalize("success", "Task Completed Successfully.");
        else finalize("error", `Task Exited: code=${code}; signal=${signal}).`);
    });
    child.once("error", (error) => finalize("error", `Failed to Launch ${exe}: ${error.message}`));
}

function stopTask(request) {
    const taskId = normalizeTaskId(request?.task_id);
    const taskState = tasks.get(taskId);
    if (!taskState) return;

    taskState.stopRequested = true;
    taskState.child.kill();
}

ipcMain.handle("load_state", (_event, payload) => loadState(payload.state_path));
ipcMain.handle("save_state", (_event, payload) => saveState(payload.state_path, payload.state));
ipcMain.handle("pick_raw_files", () => chooseFiles("Select Input Files", [{name: "Thermo RAW", extensions: ["raw"]}]));
ipcMain.handle("pick_input_dir", () => chooseFolder("Select Input Folder"));
ipcMain.handle("pick_output_dir", () => chooseFolder("Select Output Folder"));
ipcMain.handle("run_command", (_event, payload) => runCommand(payload));
ipcMain.handle("stop_task", (_event, payload) => stopTask(payload));

app.whenReady().then(() => mainWindow = createMainWindow());
app.on("activate", () => {if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();});
app.on("window-all-closed", () => {if (process.platform !== "darwin") app.quit();});
