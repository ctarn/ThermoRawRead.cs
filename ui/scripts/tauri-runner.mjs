import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiRoot = join(scriptDir, "..");
const repoRoot = join(uiRoot, "..");
const cargoTargetDir = join(repoRoot, "tmp", "ui", "target");
const iconSource = join(repoRoot, "fig", "ThermoRawRead.png");
const iconOutputDir = join(repoRoot, "tmp", "ui", "icons");

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

async function main() {
  const tauriArgs = process.argv.slice(2);
  const [subcommand] = tauriArgs;

  if (subcommand !== "icon") {
    await run(["icon", iconSource, "--output", iconOutputDir]);
  }

  await run(tauriArgs);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
