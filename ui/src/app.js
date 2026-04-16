const formats = [
    {code: "umz", title: "UMZ", desc: "Unified binary spectrum format", checked: true},
    {code: "csv", title: "CSV", desc: "Scan list without peaks", checked: true},
    {code: "txt", title: "TXT", desc: "Run metadata", checked: true},
    {code: "meth", title: "METH", desc: "Instrument method file", checked: true},
    {code: "ms1", title: "MS1", desc: "Text spectrum format"},
    {code: "ms2", title: "MS2", desc: "Text spectrum format"}
];

const state = {
    inputPaths: [],
    outputDir: "",
    recursive: false,
    outputs: new Set(formats.filter((item) => item.checked).map((item) => item.code)),
    running: false
};

const tauriCore = window.__TAURI__?.core;
const tauriEvent = window.__TAURI__?.event;

const els = {
    backendBadge: document.querySelector("#backend-badge"),
    statusText: document.querySelector("#status-text"),
    outputDir: document.querySelector("#output-dir"),
    recursive: document.querySelector("#recursive"),
    inputList: document.querySelector("#input-list"),
    inputCount: document.querySelector("#input-count"),
    formatGrid: document.querySelector("#format-grid"),
    commandPreview: document.querySelector("#command-preview"),
    runJob: document.querySelector("#run-job"),
    stopJob: document.querySelector("#stop-job"),
    clearInputs: document.querySelector("#clear-inputs"),
    clearLog: document.querySelector("#clear-log"),
    logOutput: document.querySelector("#log-output"),
    pickFiles: document.querySelector("#pick-files"),
    pickInputDir: document.querySelector("#pick-input-dir"),
    pickOutputDir: document.querySelector("#pick-output-dir")
};

function invoke(command, payload = {}) {
    if (!tauriCore?.invoke) {
        return Promise.reject(new Error("This UI needs to run inside Tauri."));
    }
    return tauriCore.invoke(command, payload);
}

function listen(eventName, handler) {
    if (!tauriEvent?.listen) return Promise.resolve(() => {
    });
    return tauriEvent.listen(eventName, handler);
}

function pathSeparator(path) {
    return path.includes("\\") ? "\\" : "/";
}

function trimTrailingSeparators(path) {
    return path.replace(/[\\/]+$/, "");
}

function defaultOutDir(path) {
    const normalized = trimTrailingSeparators(path);
    const separator = pathSeparator(path);
    const index = normalized.lastIndexOf(separator);

    if (index < 0) return `${normalized}${separator}out`;
    if (index === 0) return `${separator}out`;

    return `${normalized.slice(0, index)}${separator}out`;
}

function renderFormats() {
    els.formatGrid.innerHTML = "";
    formats.forEach((format) => {
        const label = document.createElement("label");
        label.className = "option-card";
        label.innerHTML = `
      <input type="checkbox" ${state.outputs.has(format.code) ? "checked" : ""} />
      <div>
        <strong>${format.title}</strong>
        <small>${format.desc}</small>
      </div>
    `;

        const input = label.querySelector("input");
        input.addEventListener("change", () => {
            if (input.checked) state.outputs.add(format.code);
            else state.outputs.delete(format.code);
            persistState();
            renderPreview();
        });

        els.formatGrid.appendChild(label);
    });
}

function renderInputs() {
    els.inputCount.textContent = `${state.inputPaths.length} entr${state.inputPaths.length === 1 ? "y" : "ies"}`;
    els.inputList.innerHTML = "";

    if (state.inputPaths.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "No RAW files or folders selected.";
        els.inputList.appendChild(empty);
        return;
    }

    state.inputPaths.forEach((path) => {
        const item = document.createElement("li");
        item.textContent = path;
        els.inputList.appendChild(item);
    });
}

function renderPreview() {
    const parts = ["ThermoRawRead"];
    Array.from(state.outputs)
        .sort()
        .forEach((code) => parts.push(`--${code}`));
    if (state.recursive) parts.push("--recursive");
    if (state.outputDir.trim()) parts.push("--out", state.outputDir.trim());
    parts.push(...(state.inputPaths.length > 0 ? state.inputPaths : ["<input>"]));
    els.commandPreview.textContent = parts.join(" ");
}

function setStatus(kind, message) {
    const mapping = {
        idle: ["badge-muted", "Backend idle"],
        running: ["badge-running", "Conversion running"],
        stopped: ["badge-muted", "Conversion stopped"],
        success: ["badge-success", "Conversion finished"],
        error: ["badge-error", "Conversion failed"]
    };
    const [className, badgeText] = mapping[kind] ?? mapping.idle;
    els.backendBadge.className = `badge ${className}`;
    els.backendBadge.textContent = badgeText;
    els.statusText.textContent = message;
}

function setRunning(running) {
    state.running = running;
    els.runJob.disabled = running;
    els.stopJob.disabled = !running;
}

function appendLog(line) {
    const content = els.logOutput.textContent === "Waiting for a run." ? "" : els.logOutput.textContent;
    els.logOutput.textContent = `${content}${content ? "\n" : ""}${line}`;
    els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function hydrate(saved) {
    state.inputPaths = Array.isArray(saved?.inputPaths) ? saved.inputPaths : [];
    state.outputDir = saved?.outputDir ?? "";
    state.recursive = Boolean(saved?.recursive);
    state.outputs = new Set(
        Array.isArray(saved?.outputs) && saved.outputs.length > 0
            ? saved.outputs
            : formats.filter((item) => item.checked).map((item) => item.code)
    );

    els.outputDir.value = state.outputDir;
    els.recursive.checked = state.recursive;
    renderFormats();
    renderInputs();
    renderPreview();
}

function persistState() {
    void invoke("save_state", {
        state: {
            inputPaths: state.inputPaths,
            outputDir: state.outputDir,
            recursive: state.recursive,
            outputs: Array.from(state.outputs)
        }
    }).catch(() => {
    });
}

async function chooseFiles() {
    const paths = await invoke("pick_raw_files");
    if (!Array.isArray(paths) || paths.length === 0) return;
    state.inputPaths = [...new Set([...state.inputPaths, ...paths])];
    if (!state.outputDir) {
        state.outputDir = defaultOutDir(paths[0]);
        els.outputDir.value = state.outputDir;
    }
    persistState();
    renderInputs();
    renderPreview();
}

async function chooseInputDir() {
    const path = await invoke("pick_input_dir");
    if (!path) return;
    const normalized = trimTrailingSeparators(path);
    state.inputPaths = [...new Set([...state.inputPaths, normalized])];
    if (!state.outputDir) {
        state.outputDir = `${normalized}${pathSeparator(normalized)}out`;
        els.outputDir.value = state.outputDir;
    }
    persistState();
    renderInputs();
    renderPreview();
}

async function chooseOutputDir() {
    const path = await invoke("pick_output_dir");
    if (!path) return;
    state.outputDir = trimTrailingSeparators(path);
    els.outputDir.value = state.outputDir;
    persistState();
    renderPreview();
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

    els.logOutput.textContent = "";
    setRunning(true);
    setStatus("running", "ThermoRawRead is streaming logs from the CLI backend.");

    try {
        await invoke("run_job", {
            request: {
                inputPaths: state.inputPaths,
                outputDir: state.outputDir.trim(),
                recursive: state.recursive,
                outputs: Array.from(state.outputs)
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
        await invoke("stop_job");
    } catch (error) {
        appendLog(String(error));
        setStatus("error", String(error));
    }
}

async function bootstrap() {
    renderFormats();
    renderInputs();
    renderPreview();

    els.outputDir.addEventListener("input", () => {
        state.outputDir = els.outputDir.value;
        persistState();
        renderPreview();
    });

    els.recursive.addEventListener("change", () => {
        state.recursive = els.recursive.checked;
        persistState();
        renderPreview();
    });

    els.pickFiles.addEventListener("click", () => void chooseFiles());
    els.pickInputDir.addEventListener("click", () => void chooseInputDir());
    els.pickOutputDir.addEventListener("click", () => void chooseOutputDir());
    els.runJob.addEventListener("click", () => void runJob());
    els.stopJob.addEventListener("click", () => void stopJob());
    els.clearLog.addEventListener("click", () => {
        els.logOutput.textContent = "Waiting for a run.";
    });
    els.clearInputs.addEventListener("click", () => {
        state.inputPaths = [];
        persistState();
        renderInputs();
        renderPreview();
    });

    await listen("job-log", (event) => appendLog(event.payload.line));
    await listen("job-status", (event) => {
        const {status, message} = event.payload;
        if (status === "running") {
            setRunning(true);
            setStatus("running", message);
            return;
        }
        if (status === "success") {
            setRunning(false);
            setStatus("success", message);
            return;
        }
        if (status === "stopped") {
            setRunning(false);
            setStatus("stopped", message);
            return;
        }
        setRunning(false);
        setStatus("error", message);
    });

    try {
        const saved = await invoke("load_state");
        hydrate(saved);
    } catch {
        hydrate({});
    }

    if (!tauriCore?.invoke) {
        setStatus("error", "Static preview mode only. Launch through Tauri to enable dialogs and conversion.");
    }
}

void bootstrap();
