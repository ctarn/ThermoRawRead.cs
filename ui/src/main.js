const BUS = window.commandbus ?? null;
const APPLICATION = "ThermoRawRead";
const TASK_COMMAND = "ThermoRawRead";

const statusMeta = {
    idle: {badgeClass: "badge badge-muted", badgeText: "Idle"},
    running: {badgeClass: "badge", badgeText: "Running"},
    stopped: {badgeClass: "badge badge-muted", badgeText: "Stopped"},
    success: {badgeClass: "badge", badgeText: "Finished"},
    error: {badgeClass: "badge badge-error", badgeText: "Failed"}
};

const elements = {
    inputList: document.querySelector("#input-list"),
    inputCount: document.querySelector("#input-count"),
    inputAddFile: document.querySelector("#input-add-file"),
    inputAddFolder: document.querySelector("#input-add-folder"),
    inputClear: document.querySelector("#input-clear"),
    inputIsRecursive: document.querySelector("#input-is-recursive"),
    outputInput: document.querySelector("#output-input"),
    outputPick: document.querySelector("#output-pick"),
    formatGrid: document.querySelector("#format-grid"),
    commandPreview: document.querySelector("#command-preview"),
    taskStart: document.querySelector("#task-start"),
    taskStop: document.querySelector("#task-stop"),
    statusBadge: document.querySelector("#status-badge"),
    statusText: document.querySelector("#status-text"),
    logClear: document.querySelector("#log-clear"),
    logOutput: document.querySelector("#log-output"),
};

const bridgeErrorMessage = "Desktop bridge is unavailable. Restart the app to reload the preload script.";
const statePath = BUS ? `${BUS.env.homeDir}${BUS.env.pathSep}.${APPLICATION}${BUS.env.pathSep}ui-state.json` : "";
const formatInputs = Array.from(elements.formatGrid.querySelectorAll("input[type='checkbox']"));
const allowedOutputs = new Set(formatInputs.map((input) => input.value));
const defaultOutputs = formatInputs.filter((input) => input.checked).map((input) => input.value);
let nextTaskId = 1;

const defaultState = Object.freeze({
    inputs: [],
    output: "",
    recursive: false,
    formats: ["umz", "csv", "txt", "meth"]
});
const state = {
    inputs: [],
    output: "",
    recursive: false,
    formats: new Set(defaultOutputs),
    running: false,
    activeTaskId: null
};

function validOutputs(values) {
    return values.filter((value) => allowedOutputs.has(value));
}

function selectedOutputs() {
    return validOutputs(Array.from(state.formats));
}

function allocateTaskId() {
    const taskId = nextTaskId;
    nextTaskId += 1;
    return taskId;
}

function buildTaskArgs({preview = false} = {}) {
    const args = [];
    const outputs = selectedOutputs().sort();

    if (!preview && outputs.length === 0) {
        throw new Error("output format is required");
    }

    args.push(...outputs.map((output) => `--${output}`));

    if (state.recursive) {
        args.push("--recursive");
    }

    const output = state.output.trim();
    if (output) {
        args.push("--out", output);
    }

    const inputs = state.inputs.filter((input) => typeof input === "string" && input.length > 0);
    if (inputs.length === 0) {
        if (preview) {
            args.push("<input>");
        } else {
            throw new Error("input path is required");
        }
    } else {
        args.push(...inputs);
    }

    return args;
}

function buildTaskCommand(taskId, options) {
    return {
        task_id: taskId,
        command: TASK_COMMAND,
        args: buildTaskArgs(options)
    };
}

function renderInput() {
    elements.inputList.replaceChildren();

    const count = state.inputs.length;
    elements.inputCount.textContent = `${count} entr${count <= 1 ? "y" : "ies"}`;

    if (count === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "No RAW files or folders selected.";
        elements.inputList.append(empty);
        return;
    }

    state.inputs.forEach((path) => {
        const item = document.createElement("li");
        item.textContent = path;
        elements.inputList.append(item);
    });
}

function renderFormatGrid() {
    const selected = state.formats;
    formatInputs.forEach((input) => {
        input.checked = selected.has(input.value);
    });
}

function renderCommandPreview() {
    const quote = (str) => /\s/.test(str) || (str === "") ? JSON.stringify(str) : str;
    const parts = [TASK_COMMAND, ...buildTaskArgs({preview: true}).map(quote)];
    elements.commandPreview.textContent = parts.join(" ");
}

function setStatus(status, message) {
    const meta = statusMeta[status] ?? statusMeta.idle;
    elements.statusBadge.className = meta.badgeClass;
    elements.statusBadge.textContent = meta.badgeText;
    elements.statusText.textContent = message ?? "";
}

function setRunning(running) {
    state.running = running;
    elements.taskStart.disabled = running;
    elements.taskStop.disabled = !running;
}

function setBridgeEnabled(enabled) {
    [
        elements.outputInput,
        elements.inputIsRecursive,
        elements.inputAddFile,
        elements.inputAddFolder,
        elements.outputPick,
        elements.taskStart,
        elements.inputClear
    ].forEach((element) => {
        element.disabled = !enabled;
    });
    formatInputs.forEach((input) => {
        input.disabled = !enabled;
    });
    elements.taskStop.disabled = true;
}

function appendLog(line) {
    const content = elements.logOutput.textContent === "idle..." ? "" : elements.logOutput.textContent;
    elements.logOutput.textContent = `${content}${content ? "\n" : ""}${line}`;
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function renderState() {
    renderInput();
    renderFormatGrid();
    renderCommandPreview();
    elements.outputInput.value = state.output;
    elements.inputIsRecursive.checked = state.recursive;
    setRunning(state.running);
}

function hydrate(saved = {}) {
    const savedOutputs = Array.isArray(saved.formats) && saved.formats.length > 0
        ? validOutputs(saved.formats)
        : defaultOutputs;

    state.inputs = Array.isArray(saved.inputs) ? saved.inputs : [];
    state.output = typeof saved.output === "string" ? saved.output : "";
    state.recursive = Boolean(saved.recursive);
    state.formats = new Set(savedOutputs.length > 0 ? savedOutputs : defaultOutputs);
    state.running = false;
    state.activeTaskId = null;

    renderState();
}

function persistState() {
    if (!BUS) {
        return Promise.resolve();
    }

    return BUS.invoke("save_state", {
        state_path: statePath,
        state: {
            inputs: state.inputs,
            output: state.output,
            recursive: state.recursive,
            formats: selectedOutputs()
        }
    }).catch(() => {
    });
}

async function chooseFiles() {
    const paths = await BUS.invoke("pick_raw_files");
    if (!Array.isArray(paths) || paths.length === 0) return;

    state.inputs = [...new Set([...state.inputs, ...paths])];

    renderState();
    await persistState();
}

async function chooseInputDir() {
    const directory = await BUS.invoke("pick_input_dir");
    if (!directory) return;

    state.inputs = [...new Set([...state.inputs, directory])];

    renderState();
    await persistState();
}

async function chooseOutputDir() {
    const directory = await BUS.invoke("pick_output_dir");
    if (!directory) return;

    state.output = directory;
    renderState();
    await persistState();
}

async function runJob() {
    try {
        const taskId = allocateTaskId();
        const request = buildTaskCommand(taskId);
        state.activeTaskId = taskId;
        elements.logOutput.textContent = "";
        setRunning(true);
        setStatus("running", "ThermoRawRead is streaming logs from the CLI backend.");
        await BUS.invoke("run_task", request);
    } catch (error) {
        state.activeTaskId = null;
        setRunning(false);
        appendLog(String(error));
        setStatus("error", String(error));
    }
}

async function stopJob() {
    try {
        if (state.activeTaskId == null) return;
        await BUS.invoke("stop_task", {task_id: state.activeTaskId});
    } catch (error) {
        appendLog(String(error));
        setStatus("error", String(error));
    }
}

async function initialize() {
    renderInput();
    renderFormatGrid();
    renderCommandPreview();
    setRunning(false);

    if (!BUS) {
        setBridgeEnabled(false);
        setStatus("error", bridgeErrorMessage);
        appendLog(bridgeErrorMessage);
        return;
    }

    elements.outputInput.addEventListener("input", () => {
        state.output = elements.outputInput.value;
        renderCommandPreview();
        void persistState();
    });

    elements.inputIsRecursive.addEventListener("change", () => {
        state.recursive = elements.inputIsRecursive.checked;
        renderCommandPreview();
        void persistState();
    });

    formatInputs.forEach((input) => {
        input.addEventListener("change", async () => {
            if (input.checked) state.formats.add(input.value);
            else state.formats.delete(input.value);

            renderFormatGrid();
            renderCommandPreview();
            await persistState();
        });
    });

    elements.inputAddFile.addEventListener("click", chooseFiles);
    elements.inputAddFolder.addEventListener("click", chooseInputDir);
    elements.outputPick.addEventListener("click", chooseOutputDir);
    elements.taskStart.addEventListener("click", runJob);
    elements.taskStop.addEventListener("click", stopJob);
    elements.logClear.addEventListener("click", () => elements.logOutput.textContent = "idle...");
    elements.inputClear.addEventListener("click", () => {
        state.inputs = [];
        renderInput();
        renderCommandPreview();
        void persistState();
    });

    BUS.on("task-log", ({task_id: taskId, line}) => {
        if (taskId !== state.activeTaskId) return;
        appendLog(line);
    });

    BUS.on("task-status", ({task_id: taskId, status, message}) => {
        if (taskId !== state.activeTaskId) return;
        setRunning(status === "running");
        setStatus(status, message);
        if (status !== "running") {
            state.activeTaskId = null;
        }
    });

    try {
        const saved = await BUS.invoke("load_state", {state_path: statePath});
        hydrate(saved);
    } catch {
        hydrate(defaultState);
    }
}

void initialize();
