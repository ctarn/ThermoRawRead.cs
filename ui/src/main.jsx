import React, {useEffect, useMemo, useRef, useState} from "react";
import {createRoot} from "react-dom/client";

const BUS = window.commandbus ?? null;
const APPLICATION = "ThermoRawRead";
const TASK_COMMAND = "ThermoRawRead";
const STATE_PATH = BUS ? `${BUS.env.homeDir}${BUS.env.pathSep}.${APPLICATION}${BUS.env.pathSep}ui-state.json` : "";

const FORMATS = [
    {value: "umz", label: "UMZ", description: "Unified binary spectrum format", defaultChecked: true},
    {value: "csv", label: "CSV", description: "Scan list without peaks", defaultChecked: true},
    {value: "txt", label: "TXT", description: "Run metadata", defaultChecked: true},
    {value: "meth", label: "METH", description: "Instrument method file", defaultChecked: true},
    {value: "ms1", label: "MS1", description: "Text spectrum format", defaultChecked: false},
    {value: "ms2", label: "MS2", description: "Text spectrum format", defaultChecked: false},
];

const ALLOWED_FORMATS = new Set(FORMATS.map((format) => format.value));
const DEFAULT_FORMATS = FORMATS.filter((format) => format.defaultChecked).map((format) => format.value);
const INITIAL_STATUS = {status: "idle", message: "Fill the configurations and click `Run`."};

function createState() {
    return {
        inputs: [],
        output: "",
        recursive: false,
        formats: DEFAULT_FORMATS,
    };
}

function validFormats(values) {
    return values.filter((value) => ALLOWED_FORMATS.has(value));
}

function hydrateState(saved = {}) {
    const savedFormats = Array.isArray(saved.formats) && saved.formats.length > 0
        ? validFormats(saved.formats)
        : DEFAULT_FORMATS;

    return {
        inputs: Array.isArray(saved.inputs) ? saved.inputs.filter((input) => typeof input === "string") : [],
        output: typeof saved.output === "string" ? saved.output : "",
        recursive: Boolean(saved.recursive),
        formats: savedFormats.length > 0 ? savedFormats : DEFAULT_FORMATS,
    };
}

function buildArgs(state, {preview = false} = {}) {
    const args = [];
    const formats = validFormats(state.formats).sort();

    if (formats.length > 0 || preview) args.push(...formats.map((output) => `--${output}`));
    else throw new Error("output format is required");

    if (state.recursive) args.push("--recursive");

    const output = state.output.trim();
    if (output) args.push("--out", output);

    const inputs = state.inputs.filter((input) => typeof input === "string" && input.length > 0);
    if (inputs.length > 0) args.push(...inputs);
    else if (preview) args.push("<input>");
    else throw new Error("input path is required");

    return args;
}

function buildCommandPreview(state) {
    const quote = (str) => /\s/.test(str) || str === "" ? JSON.stringify(str) : str;
    return [TASK_COMMAND, ...buildArgs(state, {preview: true}).map(quote)].join(" ");
}

function statusMeta(status) {
    const options = {
        idle: {badgeClass: "badge badge-muted", badgeText: "Idle"},
        running: {badgeClass: "badge", badgeText: "Running"},
        stopped: {badgeClass: "badge badge-muted", badgeText: "Stopped"},
        success: {badgeClass: "badge", badgeText: "Finished"},
        error: {badgeClass: "badge badge-error", badgeText: "Failed"},
    };
    return options[status] ?? options.idle;
}

function App() {
    const [config, setConfig] = useState(createState);
    const [status, setStatus] = useState(INITIAL_STATUS);
    const [running, setRunning] = useState(false);
    const [log, setLog] = useState("idle...");
    const [bridgeAvailable] = useState(Boolean(BUS));
    const activeTaskIdRef = useRef(null);
    const nextTaskIdRef = useRef(1);
    const logRef = useRef(null);

    const disabled = !bridgeAvailable;
    const commandPreview = useMemo(() => buildCommandPreview(config), [config]);
    const selectedFormats = useMemo(() => validFormats(config.formats), [config.formats]);
    const currentStatus = statusMeta(status.status);

    useEffect(() => {
        logRef.current?.scrollTo({top: logRef.current.scrollHeight});
    }, [log]);

    useEffect(() => {
        if (!BUS) {
            const message = "Desktop bridge is unavailable. Restart the app to reload the preload script.";
            setStatus({status: "error", message});
            setLog(message);
            return;
        }

        let mounted = true;
        BUS.invoke("load_state", {state_path: STATE_PATH})
            .then((saved) => mounted && setConfig(hydrateState(saved)))
            .catch(() => mounted && setConfig(createState()));

        const offLog = BUS.on("task-log", ({task_id: taskId, line}) => {
            if (taskId !== activeTaskIdRef.current) return;
            setLog((content) => {
                const previous = content === "idle..." ? "" : content;
                return `${previous}${previous ? "\n" : ""}${line}`;
            });
        });

        const offStatus = BUS.on("task-status", ({task_id: taskId, status: nextStatus, message}) => {
            if (taskId !== activeTaskIdRef.current) return;
            setRunning(nextStatus === "running");
            setStatus({status: nextStatus, message: message ?? ""});
            if (nextStatus !== "running") activeTaskIdRef.current = null;
        });

        return () => {
            mounted = false;
            offLog();
            offStatus();
        };
    }, []);

    function persistState(nextConfig) {
        if (!BUS) return Promise.resolve();
        return BUS.invoke("save_state", {
            state_path: STATE_PATH,
            state: {
                inputs: nextConfig.inputs,
                output: nextConfig.output,
                recursive: nextConfig.recursive,
                formats: validFormats(nextConfig.formats),
            },
        }).catch(() => {});
    }

    function updateConfig(updater) {
        setConfig((previous) => {
            const next = typeof updater === "function" ? updater(previous) : updater;
            void persistState(next);
            return next;
        });
    }

    async function addFiles() {
        const paths = await BUS.invoke("pick_raw_files");
        if (!Array.isArray(paths) || paths.length === 0) return;
        updateConfig((previous) => ({...previous, inputs: [...new Set([...previous.inputs, ...paths])]}));
    }

    async function addFolder() {
        const directory = await BUS.invoke("pick_input_dir");
        if (!directory) return;
        updateConfig((previous) => ({...previous, inputs: [...new Set([...previous.inputs, directory])]}));
    }

    async function pickOutput() {
        const directory = await BUS.invoke("pick_output_dir");
        if (!directory) return;
        updateConfig((previous) => ({...previous, output: directory}));
    }

    async function startTask() {
        try {
            const taskId = nextTaskIdRef.current++;
            const request = {task_id: taskId, command: TASK_COMMAND, args: buildArgs(config)};
            activeTaskIdRef.current = taskId;
            setLog("");
            setRunning(true);
            setStatus({status: "running", message: "ThermoRawRead is streaming logs from the CLI backend."});
            await BUS.invoke("run_task", request);
        } catch (error) {
            activeTaskIdRef.current = null;
            setRunning(false);
            setLog(String(error));
            setStatus({status: "error", message: String(error)});
        }
    }

    async function stopTask() {
        try {
            if (activeTaskIdRef.current == null) return;
            await BUS.invoke("stop_task", {task_id: activeTaskIdRef.current});
        } catch (error) {
            setLog((content) => `${content && content !== "idle..." ? `${content}\n` : ""}${String(error)}`);
            setStatus({status: "error", message: String(error)});
        }
    }

    function toggleFormat(format, checked) {
        updateConfig((previous) => {
            const formats = new Set(previous.formats);
            if (checked) formats.add(format);
            else formats.delete(format);
            return {...previous, formats: Array.from(formats)};
        });
    }

    return (
        <>
<header><h1>ThermoRawRead</h1></header>
<main>
    <div className="panel ctrl-panel">
        <section className="stack">
            <header className="section-head">
                <h3>Selected Inputs</h3>
                <small>{config.inputs.length} entr{config.inputs.length <= 1 ? "y" : "ies"}</small>
            </header>
            <ul className="path-list">
                {config.inputs.length > 0
                    ? config.inputs.map((path) => <li key={path}>{path}</li>)
                    : <li className="empty">Nothing Selected.</li>}
            </ul>
            <label className="toggle">
                <input
                    checked={config.recursive}
                    disabled={disabled}
                    type="checkbox"
                    onChange={(event) => updateConfig((previous) => ({...previous, recursive: event.target.checked}))}
                />
                <span>discover `.raw` files inside subfolders</span>
            </label>
            <div className="button-row">
                <button className="primary-btn" disabled={disabled} type="button" onClick={addFiles}>Add File</button>
                <button disabled={disabled} type="button" onClick={addFolder}>Add Folder</button>
                <button disabled={disabled} type="button" onClick={() => updateConfig((previous) => ({...previous, inputs: []}))}>Clear</button>
            </div>
        </section>

        <section className="stack">
            <h3>Output Directory</h3>
            <div className="input-row">
                <input
                    disabled={disabled}
                    placeholder="Optional. Defaults to each RAW file directory."
                    type="text"
                    value={config.output}
                    onChange={(event) => updateConfig((previous) => ({...previous, output: event.target.value}))}
                />
                <button className="input-action" disabled={disabled} type="button" onClick={pickOutput}>Browse</button>
            </div>
        </section>

        <section className="stack">
            <header className="section-head">
                <h3>Export Formats</h3>
                <small>Choose one or more</small>
            </header>
            <div className="option-grid">
                {FORMATS.map((format) => (
                    <label className="option-card" key={format.value}>
                        <input
                            checked={selectedFormats.includes(format.value)}
                            disabled={disabled}
                            type="checkbox"
                            onChange={(event) => toggleFormat(format.value, event.target.checked)}
                        />
                        <strong>{format.label}</strong>
                        <small>{format.description}</small>
                    </label>
                ))}
            </div>
        </section>

        <section className="button-row">
            <button className="primary-btn" disabled={disabled || running} type="button" onClick={startTask}>Run</button>
            <button className="danger-btn" disabled={disabled || !running} type="button" onClick={stopTask}>Stop</button>
        </section>

        <section className="stack status">
            <h3 className={currentStatus.badgeClass}>{currentStatus.badgeText}</h3>
            <small id="status-text">{status.message}</small>
        </section>

        <section className="stack">
            <h3>Command Preview</h3>
            <code className="mono-block">{commandPreview}</code>
        </section>
    </div>

    <div className="panel status-panel">
        <pre className="mono-block" ref={logRef}>{log}</pre>
        <button disabled={disabled} type="button" onClick={() => setLog("")}>Clear</button>
    </div>
</main>
<footer>
    <span><a href="http://ctarn.io">http://ctarn.io</a></span>
    <span>Copyright &copy; Tarn Yeong Ching</span>
    <span><a href="mailto:i@ctarn.io">i@ctarn.io</a></span>
</footer>
        </>
    );
}

createRoot(document.querySelector("#root")).render(<App />);
