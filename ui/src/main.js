const BUS = window.commandbus ?? null;
const APPLICATION = "ThermoRawRead";
const TASK_COMMAND = "ThermoRawRead";

const STATE_PATH = BUS ? `${BUS.env.homeDir}${BUS.env.pathSep}.${APPLICATION}${BUS.env.pathSep}ui-state.json` : "";

const ELEMENTS = {
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

const FORMAT_INPUTS = Array.from(ELEMENTS.formatGrid.querySelectorAll("input[type='checkbox']"));
const ALLOWED_FORMATS = new Set(FORMAT_INPUTS.map((input) => input.value));
const DEFAULT_FORMATS = FORMAT_INPUTS.filter((input) => input.checked).map((input) => input.value);

const createState = () => ({
    inputs: [],
    output: "",
    recursive: false,
    formats: new Set(DEFAULT_FORMATS),
    running: false,
    activeTaskId: null
});

const DEFAULT_STATE = Object.freeze(createState());
const STATE = createState();

const validFormats = (values) => values.filter((value) => ALLOWED_FORMATS.has(value));
const selectedFormats = () => validFormats(Array.from(STATE.formats));

let NEXT_TASK_ID = 1;
const allocateTaskId = () => NEXT_TASK_ID++;

function buildArgs({preview = false} = {}) {
    const args = [];

    const formats = selectedFormats().sort();
    if (formats.length > 0 || preview) args.push(...formats.map((output) => `--${output}`));
    else throw new Error("output format is required");

    if (STATE.recursive) args.push("--recursive");

    const output = STATE.output.trim();
    if (output) args.push("--out", output);

    const inputs = STATE.inputs.filter((input) => typeof input === "string" && input.length > 0);
    if (inputs.length > 0) args.push(...inputs);
    else if (preview) args.push("<input>");
    else throw new Error("input path is required");

    return args;
}

function buildCmd(taskId, options) {
    return {task_id: taskId, command: TASK_COMMAND, args: buildArgs(options)};
}

function renderInput() {
    ELEMENTS.inputList.replaceChildren();

    const count = STATE.inputs.length;
    ELEMENTS.inputCount.textContent = `${count} entr${count <= 1 ? "y" : "ies"}`;

    ELEMENTS.inputList.insertAdjacentHTML("beforeend", 
        count > 0 ? STATE.inputs.map(path => `<li>${path}</li>`).join('') : '<li class="empty">Nothing Selected.</li>'
    );
}

function renderFormats() {
    FORMAT_INPUTS.forEach((item) => item.checked = STATE.formats.has(item.value));
}

function renderCommandPreview() {
    const quote = (str) => /\s/.test(str) || (str === "") ? JSON.stringify(str) : str;
    ELEMENTS.commandPreview.textContent = [TASK_COMMAND, ...buildArgs({preview: true}).map(quote)].join(" ");
}

function renderTaskCtrl(running) {
    STATE.running = running;
    ELEMENTS.taskStart.disabled = running;
    ELEMENTS.taskStop.disabled = !running;
}

function renderStatus(status, message) {
    const opts = {
        idle: {badgeClass: "badge badge-muted", badgeText: "Idle"},
        running: {badgeClass: "badge", badgeText: "Running"},
        stopped: {badgeClass: "badge badge-muted", badgeText: "Stopped"},
        success: {badgeClass: "badge", badgeText: "Finished"},
        error: {badgeClass: "badge badge-error", badgeText: "Failed"}
    };
    ELEMENTS.statusBadge.className = opts[status].badgeClass;
    ELEMENTS.statusBadge.textContent = opts[status].badgeText;
    ELEMENTS.statusText.textContent = message ?? "";
}

function appendLog(line) {
    const content = ELEMENTS.logOutput.textContent === "idle..." ? "" : ELEMENTS.logOutput.textContent;
    ELEMENTS.logOutput.textContent = `${content}${content ? "\n" : ""}${line}`;
    ELEMENTS.logOutput.scrollTop = ELEMENTS.logOutput.scrollHeight;
}

function renderState() {
    renderInput();
    ELEMENTS.inputIsRecursive.checked = STATE.recursive;
    renderFormats();
    renderCommandPreview();
    ELEMENTS.outputInput.value = STATE.output;
    renderTaskCtrl(STATE.running);
}

function hydrate(saved = {}) {
    const savedOutputs = Array.isArray(saved.formats) && saved.formats.length > 0
        ? validFormats(saved.formats)
        : DEFAULT_FORMATS;

    STATE.inputs = Array.isArray(saved.inputs) ? saved.inputs : [];
    STATE.output = typeof saved.output === "string" ? saved.output : "";
    STATE.recursive = Boolean(saved.recursive);
    STATE.formats = new Set(savedOutputs.length > 0 ? savedOutputs : DEFAULT_FORMATS);
    STATE.running = false;
    STATE.activeTaskId = null;

    renderState();
}

function persistState() {
    return BUS ? BUS.invoke("save_state", {
        state_path: STATE_PATH,
        state: {
            inputs: STATE.inputs,
            output: STATE.output,
            recursive: STATE.recursive,
            formats: selectedFormats()
        }
    }).catch(() => {}) : Promise.resolve();
}

async function clickInputAddFile() {
    const paths = await BUS.invoke("pick_raw_files");
    if (!Array.isArray(paths) || paths.length === 0) return;

    STATE.inputs = [...new Set([...STATE.inputs, ...paths])];

    renderState();
    await persistState();
}

async function clickInputAddFolder() {
    const directory = await BUS.invoke("pick_input_dir");
    if (!directory) return;

    STATE.inputs = [...new Set([...STATE.inputs, directory])];

    renderState();
    await persistState();
}

async function clickInputClear() {
    STATE.inputs = [];
    renderInput();
    renderCommandPreview();
    void persistState();
}

async function clickOutputPick() {
    const directory = await BUS.invoke("pick_output_dir");
    if (!directory) return;

    STATE.output = directory;
    renderState();
    await persistState();
}

async function clickTaskStart() {
    try {
        const taskId = allocateTaskId();
        const request = buildCmd(taskId);
        STATE.activeTaskId = taskId;
        ELEMENTS.logOutput.textContent = "";
        renderTaskCtrl(true);
        renderStatus("running", "ThermoRawRead is streaming logs from the CLI backend.");
        await BUS.invoke("run_task", request);
    } catch (error) {
        STATE.activeTaskId = null;
        renderTaskCtrl(false);
        appendLog(String(error));
        renderStatus("error", String(error));
    }
}

async function clickTaskStop() {
    try {
        if (STATE.activeTaskId == null) return;
        await BUS.invoke("stop_task", {task_id: STATE.activeTaskId});
    } catch (error) {
        appendLog(String(error));
        renderStatus("error", String(error));
    }
}

async function initialize() {
    renderInput();
    renderFormats();
    renderCommandPreview();
    renderTaskCtrl(false);

    if (!BUS) {
        Object.values(ELEMENTS).forEach((element) => element.disabled = true);
        FORMAT_INPUTS.forEach((input) => input.disabled = true);
        const msg = "Desktop bridge is unavailable. Restart the app to reload the preload script.";
        renderStatus("error", msg);
        appendLog(msg);
        return;
    }

    ELEMENTS.outputInput.addEventListener("input", () => {
        STATE.output = ELEMENTS.outputInput.value;
        renderCommandPreview();
        void persistState();
    });

    ELEMENTS.inputIsRecursive.addEventListener("change", () => {
        STATE.recursive = ELEMENTS.inputIsRecursive.checked;
        renderCommandPreview();
        void persistState();
    });

    FORMAT_INPUTS.forEach((input) => input.addEventListener("change", async () => {
        if (input.checked) STATE.formats.add(input.value);
        else STATE.formats.delete(input.value);
        renderFormats();
        renderCommandPreview();
        await persistState();
    }));

    ELEMENTS.inputAddFile.addEventListener("click", clickInputAddFile);
    ELEMENTS.inputAddFolder.addEventListener("click", clickInputAddFolder);
    ELEMENTS.inputClear.addEventListener("click", clickInputClear);
    ELEMENTS.outputPick.addEventListener("click", clickOutputPick);
    ELEMENTS.taskStart.addEventListener("click", clickTaskStart);
    ELEMENTS.taskStop.addEventListener("click", clickTaskStop);
    ELEMENTS.logClear.addEventListener("click", () => ELEMENTS.logOutput.textContent = "");

    BUS.on("task-log", ({task_id: taskId, line}) => {
        if (taskId !== STATE.activeTaskId) return;
        appendLog(line);
    });

    BUS.on("task-status", ({task_id: taskId, status, message}) => {
        if (taskId !== STATE.activeTaskId) return;
        renderTaskCtrl(status === "running");
        renderStatus(status, message);
        if (status !== "running") STATE.activeTaskId = null;
    });

    try {
        hydrate(await BUS.invoke("load_state", {state_path: STATE_PATH}));
    } catch {
        hydrate(DEFAULT_STATE);
    }
}

void initialize();
