import { spawn } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(scriptDir, "..");
const repoRoot = join(uiRoot, "..");
const cargoTargetDir = join(repoRoot, "tmp", "ui", "target");
const iconSource = join(repoRoot, "fig", "ThermoRawRead.png");
const iconOutputDir = join(repoRoot, "tmp", "ui", "icons");
const backendOutputDir = join(repoRoot, "tmp", "ui", "backend");

function hostArch() {
  return {
    x64: "x86_64",
    arm64: "arm64"
  }[process.arch] ?? process.arch;
}

function hostOs() {
  return {
    darwin: "Darwin",
    linux: "Linux",
    win32: "Windows"
  }[process.platform] ?? process.platform;
}

const command = join(
  uiRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tauri.cmd" : "tauri"
);

function run(commandArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: uiRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CARGO_TARGET_DIR: cargoTargetDir
      }
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${commandArgs.join(" ")} exited with code ${code ?? 1}`));
    });

    child.on("error", reject);
  });
}

async function stageBackend() {
  const backendSourceDir = join(repoRoot, "tmp", "build", `${hostArch()}.${hostOs()}`);
  await rm(backendOutputDir, { recursive: true, force: true });
  await mkdir(backendOutputDir, { recursive: true });
  await cp(backendSourceDir, backendOutputDir, { recursive: true });
}

async function main() {
  const tauriArgs = process.argv.slice(2);
  const [subcommand] = tauriArgs;

  if (subcommand !== "icon") {
    await stageBackend();
    await run(["icon", iconSource, "--output", iconOutputDir]);
  }

  await run(tauriArgs);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
