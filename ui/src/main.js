function quoteArg(value) {
    if (value === "") return '""';
    return /\s/.test(value) ? JSON.stringify(value) : value;
}

function pathSeparator(path) {
    return path.includes("\\") ? "\\" : "/";
}

function trimTrailingSeparators(path) {
    return path.replace(/[\\/]+$/, "");
}

const cmdbus = window.commandbus ?? null;

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

const missingElements = Object.entries(elements)
    .filter(([, element]) => !element)
    .map(([name]) => name);

if (missingElements.length > 0) {
    throw new Error(`missing UI elements: ${missingElements.join(", ")}`);
}

const bridgeErrorMessage = "Desktop bridge is unavailable. Restart the app to reload the preload script.";
const formatInputs = Array.from(elements.formatGrid.querySelectorAll("input[type='checkbox']"));
const allowedOutputs = new Set(formatInputs.map((input) => input.value));
const defaultOutputs = formatInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
const state = {
    inputs: [],
    output: "",
    recursive: false,
    formats: new Set(defaultOutputs),
    running: false
};

function validOutputs(values) {
    return values.filter((value) => allowedOutputs.has(value));
}

function selectedOutputs() {
    return validOutputs(Array.from(state.formats));
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
    const parts = ["ThermoRawRead"];

    selectedOutputs()
        .sort()
        .forEach((output) => parts.push(`--${output}`));

    if (state.recursive) {
        parts.push("--recursive");
    }

    const output = state.output.trim();
    if (output) {
        parts.push("--out", quoteArg(output));
    }

    if (state.inputs.length === 0) {
        parts.push("<input>");
    } else {
        parts.push(...state.inputs.map(quoteArg));
    }

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

    renderState();
}

function persistState() {
    if (!cmdbus) {
        return Promise.resolve();
    }

    return cmdbus.invoke("save_state", {
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
    const paths = await cmdbus.invoke("pick_raw_files");
    if (!Array.isArray(paths) || paths.length === 0) return;

    state.inputs = [...new Set([...state.inputs, ...paths])];

    renderState();
    await persistState();
}

async function chooseInputDir() {
    const directory = await cmdbus.invoke("pick_input_dir");
    if (!directory) return;

    const normalized = trimTrailingSeparators(directory);
    state.inputs = [...new Set([...state.inputs, normalized])];

    if (!state.output.trim()) {
        state.output = `${normalized}${pathSeparator(normalized)}out`;
    }

    renderState();
    await persistState();
}

async function chooseOutputDir() {
    const directory = await cmdbus.invoke("pick_output_dir");
    if (!directory) return;

    state.output = trimTrailingSeparators(directory);
    renderState();
    await persistState();
}

async function runJob() {
    if (state.inputs.length === 0) {
        setStatus("error", "At least one RAW file or folder is required.");
        return;
    }

    if (state.formats.size === 0) {
        setStatus("error", "Select at least one export format.");
        return;
    }

    elements.logOutput.textContent = "";
    setRunning(true);
    setStatus("running", "ThermoRawRead is streaming logs from the CLI backend.");

    try {
        await cmdbus.invoke("run_task", {
            request: {
                inputs: state.inputs,
                output: state.output.trim(),
                recursive: state.recursive,
                formats: selectedOutputs()
            }
        });
    } catch (error) {
        setRunning(false);
        appendLog(String(error));
        setStatus("error", String(error));
    }
}

async function stopJob() {
    try {
        await cmdbus.invoke("stop_task");
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

    if (!cmdbus) {
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
            if (input.checked) {
                state.formats.add(input.value);
            } else {
                state.formats.delete(input.value);
            }

            renderFormatGrid();
            renderCommandPreview();
            await persistState();
        });
    });

    elements.inputAddFile.addEventListener("click", () => {
        void chooseFiles();
    });

    elements.inputAddFolder.addEventListener("click", () => {
        void chooseInputDir();
    });

    elements.outputPick.addEventListener("click", () => {
        void chooseOutputDir();
    });

    elements.taskStart.addEventListener("click", () => {
        void runJob();
    });

    elements.taskStop.addEventListener("click", () => {
        void stopJob();
    });

    elements.logClear.addEventListener("click", () => {
        elements.logOutput.textContent = "idle...";
    });

    elements.inputClear.addEventListener("click", () => {
        state.inputs = [];
        renderInput();
        renderCommandPreview();
        void persistState();
    });

    cmdbus.on("job-log", ({line}) => {
        appendLog(line);
    });

    cmdbus.on("job-status", ({status, message}) => {
        setRunning(status === "running");
        setStatus(status, message);
    });

    try {
        const saved = await cmdbus.invoke("load_state");
        hydrate(saved);
    } catch {
        hydrate({});
    }
}

void initialize();
