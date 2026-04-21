const commandBus = window.thermoRawRead;

const outputFormats = [
    {value: "umz", label: "UMZ", description: "Unified binary spectrum format", checked: true},
    {value: "csv", label: "CSV", description: "Scan list without peaks", checked: true},
    {value: "txt", label: "TXT", description: "Run metadata", checked: true},
    {value: "meth", label: "METH", description: "Instrument method file", checked: true},
    {value: "ms1", label: "MS1", description: "Text spectrum format", checked: false},
    {value: "ms2", label: "MS2", description: "Text spectrum format", checked: false}
];

const defaultOutputs = outputFormats
    .filter((format) => format.checked)
    .map((format) => format.value);

const statusMeta = {
    idle: {badgeClass: "badge badge-muted", badgeText: "Backend idle"},
    running: {badgeClass: "badge", badgeText: "Conversion running"},
    stopped: {badgeClass: "badge badge-muted", badgeText: "Conversion stopped"},
    success: {badgeClass: "badge", badgeText: "Conversion finished"},
    error: {badgeClass: "badge badge-error", badgeText: "Conversion failed"}
};

const state = {
    inputPaths: [],
    outputDir: "",
    recursive: false,
    outputs: new Set(defaultOutputs),
    running: false
};

const elements = {
    backendBadge: document.querySelector("#backend-badge"),
    statusText: document.querySelector("#status-text"),
    outputDir: document.querySelector("#output-dir"),
    recursive: document.querySelector("#recursive"),
    inputList: document.querySelector("#input-list"),
    inputCount: document.querySelector("#input-count"),
    formatGrid: document.querySelector("#format-grid"),
    commandPreview: document.querySelector("#command-preview"),
    startJob: document.querySelector("#start-job"),
    stopJob: document.querySelector("#stop-job"),
    clearInputs: document.querySelector("#clear-inputs"),
    clearLog: document.querySelector("#clear-log"),
    logOutput: document.querySelector("#log-output"),
    pickFiles: document.querySelector("#pick-files"),
    pickFolder: document.querySelector("#pick-folder"),
    pickOutput: document.querySelector("#pick-output")
};

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

function defaultOutDir(path) {
    const normalized = trimTrailingSeparators(path);
    const separator = pathSeparator(normalized);
    const index = normalized.lastIndexOf(separator);

    if (index < 0) return `${normalized}${separator}out`;
    if (index === 0) return `${separator}out`;

    return `${normalized.slice(0, index)}${separator}out`;
}

function validOutputs(values) {
    const allowed = new Set(outputFormats.map(({value}) => value));
    return values.filter((value) => allowed.has(value));
}

function selectedOutputs() {
    return validOutputs(Array.from(state.outputs));
}

function renderFormatOptions() {
    elements.formatGrid.replaceChildren();

    outputFormats.forEach(({value, label, description}) => {
        const card = document.createElement("label");
        card.className = "option-card";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = value;
        input.checked = state.outputs.has(value);
        input.addEventListener("change", async () => {
            if (input.checked) {
                state.outputs.add(value);
            } else {
                state.outputs.delete(value);
            }

            renderOutputs();
            renderCommandPreview();
            await persistState();
        });

        const text = document.createElement("div");

        const title = document.createElement("strong");
        title.textContent = label;

        const detail = document.createElement("small");
        detail.textContent = description;

        text.append(title, detail);
        card.append(input, text);
        elements.formatGrid.append(card);
    });
}

function renderInputs() {
    elements.inputList.replaceChildren();

    const count = state.inputPaths.length;
    elements.inputCount.textContent = `${count} entr${count === 1 ? "y" : "ies"}`;

    if (count === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "No RAW files or folders selected.";
        elements.inputList.append(empty);
        return;
    }

    state.inputPaths.forEach((path) => {
        const item = document.createElement("li");
        item.textContent = path;
        elements.inputList.append(item);
    });
}

function renderOutputs() {
    const selected = state.outputs;
    elements.formatGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
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

    const outputDir = state.outputDir.trim();
    if (outputDir) {
        parts.push("--out", quoteArg(outputDir));
    }

    if (state.inputPaths.length === 0) {
        parts.push("<input>");
    } else {
        parts.push(...state.inputPaths.map(quoteArg));
    }

    elements.commandPreview.textContent = parts.join(" ");
}

function setStatus(status, message) {
    const meta = statusMeta[status] ?? statusMeta.idle;
    elements.backendBadge.className = meta.badgeClass;
    elements.backendBadge.textContent = meta.badgeText;
    elements.statusText.textContent = message ?? "";
}

function setRunning(running) {
    state.running = running;
    elements.startJob.disabled = running;
    elements.stopJob.disabled = !running;
}

function appendLog(line) {
    const content = elements.logOutput.textContent === "idle..." ? "" : elements.logOutput.textContent;
    elements.logOutput.textContent = `${content}${content ? "\n" : ""}${line}`;
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function renderState() {
    renderInputs();
    renderOutputs();
    renderCommandPreview();
    elements.outputDir.value = state.outputDir;
    elements.recursive.checked = state.recursive;
    setRunning(state.running);
}

function hydrate(saved = {}) {
    const savedOutputs = Array.isArray(saved.outputs) && saved.outputs.length > 0
        ? validOutputs(saved.outputs)
        : defaultOutputs;

    state.inputPaths = Array.isArray(saved.inputPaths) ? saved.inputPaths : [];
    state.outputDir = typeof saved.outputDir === "string" ? saved.outputDir : "";
    state.recursive = Boolean(saved.recursive);
    state.outputs = new Set(savedOutputs.length > 0 ? savedOutputs : defaultOutputs);
    state.running = false;

    renderState();
}

function persistState() {
    return commandBus.invoke("save_state", {
        state: {
            inputPaths: state.inputPaths,
            outputDir: state.outputDir,
            recursive: state.recursive,
            outputs: selectedOutputs()
        }
    }).catch(() => {
    });
}

async function chooseFiles() {
    const paths = await commandBus.invoke("pick_raw_files");
    if (!Array.isArray(paths) || paths.length === 0) return;

    state.inputPaths = [...new Set([...state.inputPaths, ...paths])];

    if (!state.outputDir.trim()) {
        state.outputDir = defaultOutDir(paths[0]);
    }

    renderState();
    await persistState();
}

async function chooseInputDir() {
    const directory = await commandBus.invoke("pick_input_dir");
    if (!directory) return;

    const normalized = trimTrailingSeparators(directory);
    state.inputPaths = [...new Set([...state.inputPaths, normalized])];

    if (!state.outputDir.trim()) {
        state.outputDir = `${normalized}${pathSeparator(normalized)}out`;
    }

    renderState();
    await persistState();
}

async function chooseOutputDir() {
    const directory = await commandBus.invoke("pick_output_dir");
    if (!directory) return;

    state.outputDir = trimTrailingSeparators(directory);
    renderState();
    await persistState();
}

async function runJob() {
    if (state.inputPaths.length === 0) {
        setStatus("error", "At least one RAW file or folder is required.");
        return;
    }

    if (state.outputs.size === 0) {
        setStatus("error", "Select at least one export format.");
        return;
    }

    elements.logOutput.textContent = "";
    setRunning(true);
    setStatus("running", "ThermoRawRead is streaming logs from the CLI backend.");

    try {
        await commandBus.invoke("run_job", {
            request: {
                inputPaths: state.inputPaths,
                outputDir: state.outputDir.trim(),
                recursive: state.recursive,
                outputs: selectedOutputs()
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
        await commandBus.invoke("stop_job");
    } catch (error) {
        appendLog(String(error));
        setStatus("error", String(error));
    }
}

async function initialize() {
    renderFormatOptions();
    renderInputs();
    renderCommandPreview();
    setRunning(false);

    elements.outputDir.addEventListener("input", () => {
        state.outputDir = elements.outputDir.value;
        renderCommandPreview();
        void persistState();
    });

    elements.recursive.addEventListener("change", () => {
        state.recursive = elements.recursive.checked;
        renderCommandPreview();
        void persistState();
    });

    elements.pickFiles.addEventListener("click", () => {
        void chooseFiles();
    });

    elements.pickFolder.addEventListener("click", () => {
        void chooseInputDir();
    });

    elements.pickOutput.addEventListener("click", () => {
        void chooseOutputDir();
    });

    elements.startJob.addEventListener("click", () => {
        void runJob();
    });

    elements.stopJob.addEventListener("click", () => {
        void stopJob();
    });

    elements.clearLog.addEventListener("click", () => {
        elements.logOutput.textContent = "idle...";
    });

    elements.clearInputs.addEventListener("click", () => {
        state.inputPaths = [];
        renderInputs();
        renderCommandPreview();
        void persistState();
    });

    commandBus.on("job-log", ({line}) => {
        appendLog(line);
    });

    commandBus.on("job-status", ({status, message}) => {
        setRunning(status === "running");
        setStatus(status, message);
    });

    try {
        const saved = await commandBus.invoke("load_state");
        hydrate(saved);
    } catch {
        hydrate({});
    }
}

void initialize();
