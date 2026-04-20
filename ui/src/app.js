const commandBus = window.thermoRawRead;
const state = {
    inputPaths: [],
    outputDir: "",
    recursive: false,
    outputs: new Set(["umz", "csv", "txt", "meth"]),
    running: false
};

const elements = {
    clearInputs: document.querySelector("#clear-inputs"),
    inputList: document.querySelector("#input-list"),
    outputDir: document.querySelector("#output-dir"),
    pickFiles: document.querySelector("#pick-files"),
    pickFolder: document.querySelector("#pick-folder"),
    pickOutput: document.querySelector("#pick-output"),
    recursive: document.querySelector("#recursive"),
    outputOptions: [...document.querySelectorAll("#output-options input[type='checkbox']")],
    startJob: document.querySelector("#start-job"),
    stopJob: document.querySelector("#stop-job"),
    statusBadge: document.querySelector("#status-badge"),
    statusMessage: document.querySelector("#status-message"),
    logOutput: document.querySelector("#log-output")
};

function renderInputs() {
    elements.inputList.innerHTML = "";

    if (state.inputPaths.length === 0) {
        elements.inputList.classList.add("empty");
        const item = document.createElement("li");
        item.textContent = "No input selected.";
        elements.inputList.append(item);
        return;
    }

    elements.inputList.classList.remove("empty");
    state.inputPaths.forEach((value) => {
        const item = document.createElement("li");
        item.textContent = value;
        elements.inputList.append(item);
    });
}

function renderOutputs() {
    elements.outputOptions.forEach((option) => {
        option.checked = state.outputs.has(option.value);
    });
}

function renderState() {
    renderInputs();
    renderOutputs();
    elements.outputDir.value = state.outputDir;
    elements.recursive.checked = state.recursive;
    elements.startJob.disabled = state.running;
    elements.stopJob.disabled = !state.running;
}

function setStatus(status, message) {
    elements.statusBadge.textContent = status;
    elements.statusBadge.className = `status-badge ${status}`;
    elements.statusMessage.textContent = message;
}

function appendLog(line) {
    elements.logOutput.textContent += `${line}\n`;
    elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

async function persistState() {
    await commandBus.invoke("save_state", {
        state: {
            inputPaths: state.inputPaths,
            outputDir: state.outputDir,
            recursive: state.recursive,
            outputs: [...state.outputs]
        }
    });
}

function mergeInputPaths(nextPaths) {
    const merged = new Set([...state.inputPaths, ...nextPaths]);
    state.inputPaths = [...merged];
    renderInputs();
    void persistState();
}

async function initialize() {
    const saved = await commandBus.invoke("load_state");
    state.inputPaths = Array.isArray(saved.inputPaths) ? saved.inputPaths : [];
    state.outputDir = typeof saved.outputDir === "string" ? saved.outputDir : "";
    state.recursive = Boolean(saved.recursive);
    state.outputs = new Set(Array.isArray(saved.outputs) ? saved.outputs : ["umz", "csv", "txt", "meth"]);
    renderState();
}

elements.pickFiles.addEventListener("click", async () => {
    const paths = await commandBus.invoke("pick_raw_files");
    if (paths.length > 0) {
        mergeInputPaths(paths);
    }
});

elements.pickFolder.addEventListener("click", async () => {
    const directory = await commandBus.invoke("pick_input_dir");
    if (directory) {
        mergeInputPaths([directory]);
    }
});

elements.pickOutput.addEventListener("click", async () => {
    const directory = await commandBus.invoke("pick_output_dir");
    if (!directory) return;
    state.outputDir = directory;
    renderState();
    await persistState();
});

elements.clearInputs.addEventListener("click", async () => {
    state.inputPaths = [];
    renderInputs();
    await persistState();
});

elements.outputDir.addEventListener("change", async (event) => {
    state.outputDir = event.target.value.trim();
    await persistState();
});

elements.recursive.addEventListener("change", async (event) => {
    state.recursive = event.target.checked;
    await persistState();
});

elements.outputOptions.forEach((option) => {
    option.addEventListener("change", async (event) => {
        if (event.target.checked) {
            state.outputs.add(event.target.value);
        } else {
            state.outputs.delete(event.target.value);
        }

        renderOutputs();
        await persistState();
    });
});

elements.startJob.addEventListener("click", async () => {
    elements.logOutput.textContent = "";
    state.running = true;
    renderState();

    try {
        await commandBus.invoke("run_job", {
            request: {
                inputPaths: state.inputPaths,
                outputDir: state.outputDir,
                recursive: state.recursive,
                outputs: [...state.outputs]
            }
        });
    } catch (error) {
        state.running = false;
        renderState();
        setStatus("error", error.message);
    }
});

elements.stopJob.addEventListener("click", async () => {
    await commandBus.invoke("stop_job");
});

commandBus.on("job-status", ({status, message}) => {
    state.running = status === "running";
    renderState();
    setStatus(status, message);
});

commandBus.on("job-log", ({line}) => {
    appendLog(line);
});

void initialize().catch((error) => {
    setStatus("error", error.message);
});
