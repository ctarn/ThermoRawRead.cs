use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct AppState {
    process: Arc<Mutex<Option<Arc<Mutex<Child>>>>>,
    stop_requested: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedState {
    input_paths: Vec<String>,
    output_dir: String,
    recursive: bool,
    outputs: Vec<String>,
}

impl Default for SavedState {
    fn default() -> Self {
        Self {
            input_paths: Vec::new(),
            output_dir: String::new(),
            recursive: false,
            outputs: vec!["umz".into(), "csv".into(), "txt".into(), "meth".into()],
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunRequest {
    input_paths: Vec<String>,
    output_dir: String,
    recursive: bool,
    outputs: Vec<String>,
}

#[derive(Clone, Serialize)]
struct LogEvent {
    line: String,
}

#[derive(Clone, Serialize)]
struct StatusEvent {
    status: String,
    message: String,
}

fn file_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "ThermoRawRead.exe"
    } else {
        "ThermoRawRead"
    }
}

fn platform_dir_name() -> &'static str {
    match env::consts::OS {
        "macos" => "Darwin",
        "linux" => "Linux",
        "windows" => "Windows",
        other => other,
    }
}

fn state_path() -> Result<PathBuf, String> {
    let home = env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "unable to resolve home directory".to_string())?;
    Ok(home
        .join(".ThermoRawRead")
        .join("v1.5")
        .join("ui-state.json"))
}

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn resolve_backend_executable(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();

    if let Some(path) = env::var_os("THERMO_RAW_READ_BIN") {
        candidates.push(PathBuf::from(path));
    }

    let name = file_name();
    let arch = env::consts::ARCH;
    let platform = platform_dir_name();
    candidates.push(
        repo_root()
            .join("tmp")
            .join("build")
            .join(format!("{}.{}", arch, platform))
            .join(name),
    );

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("content").join(name));
    }

    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("content").join(name));
        }
    }

    candidates
        .into_iter()
        .find(|path| path.exists())
        .ok_or_else(|| {
            format!(
                "ThermoRawRead backend not found. Build src/ThermoRawRead.csproj first or set THERMO_RAW_READ_BIN."
            )
        })
}

fn emit_status(app: &AppHandle, status: &str, message: impl Into<String>) {
    let _ = app.emit(
        "job-status",
        StatusEvent {
            status: status.to_string(),
            message: message.into(),
        },
    );
}

fn run_dialog(program: &str, args: &[&str]) -> Result<Option<String>, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("failed to launch {program}: {error}"))?;

    if !output.status.success() {
        return Ok(None);
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        Ok(None)
    } else {
        Ok(Some(text))
    }
}

fn split_lines(text: String) -> Vec<String> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn pick_raw_files_impl() -> Result<Vec<String>, String> {
    match env::consts::OS {
        "macos" => Ok(run_dialog(
            "osascript",
            &[
                "-e",
                "set selectedFiles to choose file with prompt \"Select Thermo RAW files\" of type {\"raw\"} with multiple selections allowed",
                "-e",
                "set output to \"\"",
                "-e",
                "repeat with selectedFile in selectedFiles",
                "-e",
                "set output to output & POSIX path of selectedFile & linefeed",
                "-e",
                "end repeat",
                "-e",
                "return output",
            ],
        )?
        .map(split_lines)
        .unwrap_or_default()),
        "windows" => Ok(run_dialog(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Filter = 'Thermo RAW (*.raw)|*.raw'; $dialog.Multiselect = $true; if ($dialog.ShowDialog() -eq 'OK') { $dialog.FileNames -join [Environment]::NewLine }",
            ],
        )?
        .map(split_lines)
        .unwrap_or_default()),
        "linux" => {
            if let Ok(paths) = run_dialog(
                "zenity",
                &[
                    "--file-selection",
                    "--multiple",
                    "--separator=\n",
                    "--file-filter=*.raw",
                    "--title=Select Thermo RAW files",
                ],
            ) {
                return Ok(paths.map(split_lines).unwrap_or_default());
            }

            Ok(run_dialog(
                "kdialog",
                &[
                    "--getopenfilename",
                    ".",
                    "*.raw",
                    "--multiple",
                    "--separate-output",
                ],
            )?
            .map(split_lines)
            .unwrap_or_default())
        }
        _ => Err("file picker is not implemented for this platform".to_string()),
    }
}

fn pick_folder_impl(prompt: &str) -> Result<Option<String>, String> {
    match env::consts::OS {
        "macos" => run_dialog(
            "osascript",
            &[
                "-e",
                &format!("POSIX path of (choose folder with prompt \"{prompt}\")"),
            ],
        ),
        "windows" => run_dialog(
            "powershell",
            &[
                "-NoProfile",
                "-Command",
                &format!(
                    "Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = '{prompt}'; if ($dialog.ShowDialog() -eq 'OK') {{ $dialog.SelectedPath }}"
                ),
            ],
        ),
        "linux" => {
            if let Ok(folder) = run_dialog(
                "zenity",
                &["--file-selection", "--directory", &format!("--title={prompt}")],
            ) {
                return Ok(folder);
            }
            run_dialog("kdialog", &["--getexistingdirectory", "."])
        }
        _ => Err("folder picker is not implemented for this platform".to_string()),
    }
}

fn spawn_log_stream<R: std::io::Read + Send + 'static>(app: AppHandle, reader: R) {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines() {
            match line {
                Ok(line) => {
                    let _ = app.emit("job-log", LogEvent { line });
                }
                Err(error) => {
                    let _ = app.emit(
                        "job-log",
                        LogEvent {
                            line: format!("log stream error: {error}"),
                        },
                    );
                    break;
                }
            }
        }
    });
}

#[tauri::command]
fn load_state() -> Result<SavedState, String> {
    let path = state_path()?;
    if !path.exists() {
        return Ok(SavedState::default());
    }
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

#[tauri::command]
fn save_state(state: SavedState) -> Result<(), String> {
    let path = state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(&state).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn pick_raw_files() -> Result<Vec<String>, String> {
    pick_raw_files_impl()
}

#[tauri::command]
fn pick_input_dir() -> Result<Option<String>, String> {
    pick_folder_impl("Select input folder")
}

#[tauri::command]
fn pick_output_dir() -> Result<Option<String>, String> {
    pick_folder_impl("Select output folder")
}

#[tauri::command]
fn stop_job(state: State<'_, AppState>) -> Result<(), String> {
    let current = state
        .process
        .lock()
        .map_err(|_| "process lock poisoned".to_string())?
        .clone();
    let Some(process) = current else {
        return Ok(());
    };
    state.stop_requested.store(true, Ordering::SeqCst);

    let result = process
        .lock()
        .map_err(|_| "process lock poisoned".to_string())?
        .kill()
        .map_err(|error| error.to_string());

    result
}

#[tauri::command]
fn run_job(app: AppHandle, state: State<'_, AppState>, request: RunRequest) -> Result<(), String> {
    if request.input_paths.is_empty() {
        return Err("at least one input path is required".to_string());
    }
    if request.outputs.is_empty() {
        return Err("at least one output format is required".to_string());
    }

    let mut slot = state
        .process
        .lock()
        .map_err(|_| "process lock poisoned".to_string())?;
    if slot.is_some() {
        return Err("a conversion is already running".to_string());
    }

    let backend = resolve_backend_executable(&app)?;
    state.stop_requested.store(false, Ordering::SeqCst);
    let mut command = Command::new(&backend);

    request.outputs.iter().for_each(|output| {
        command.arg(format!("--{output}"));
    });

    if request.recursive {
        command.arg("--recursive");
    }
    if !request.output_dir.trim().is_empty() {
        command.arg("--out").arg(request.output_dir.trim());
    }
    command.args(&request.input_paths);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to launch {}: {error}", backend.display()))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    *slot = Some(child.clone());
    drop(slot);

    emit_status(&app, "running", format!("Running {}", backend.display()));

    if let Some(stdout) = stdout {
        spawn_log_stream(app.clone(), stdout);
    }
    if let Some(stderr) = stderr {
        spawn_log_stream(app.clone(), stderr);
    }

    let process_slot = state.process.clone();
    let stop_requested = state.stop_requested.clone();
    thread::spawn(move || {
        let result = loop {
            let status = {
                let mut process = match child.lock() {
                    Ok(process) => process,
                    Err(_) => break Err("process lock poisoned".to_string()),
                };

                match process.try_wait() {
                    Ok(status) => status,
                    Err(error) => break Err(error.to_string()),
                }
            };

            if let Some(status) = status {
                break Ok(status);
            }

            thread::sleep(Duration::from_millis(150));
        };
        let was_stopped = stop_requested.swap(false, Ordering::SeqCst);

        match result {
            Ok(status) if status.success() => {
                emit_status(&app, "success", "Conversion completed successfully.");
            }
            Ok(_) if was_stopped => {
                emit_status(&app, "stopped", "Conversion stopped.");
            }
            Ok(status) => {
                emit_status(
                    &app,
                    "error",
                    format!("Conversion exited with status {status}."),
                );
            }
            Err(error) => {
                emit_status(
                    &app,
                    "error",
                    format!("Failed to wait for converter: {error}"),
                );
            }
        }

        if let Ok(mut slot) = process_slot.lock() {
            *slot = None;
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            pick_raw_files,
            pick_input_dir,
            pick_output_dir,
            run_job,
            stop_job
        ])
        .run(tauri::generate_context!())
        .expect("error while running ThermoRawRead Tauri app");
}
