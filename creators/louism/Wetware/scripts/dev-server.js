import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const watchedFiles = [
  fileURLToPath(import.meta.url),
  path.join(root, "server.js"),
  path.join(root, "package.json"),
  path.join(root, "public/sw.js")
];
const watchedDirectories = [
  path.join(root, "show"),
  ...["operator", "projector", "ipad", "kala", "nugget", "lighting", "setup", "common"].map((name) => path.join(root, "public", name))
];
let serverProcess = null;
let restartTimer = null;
let stopping = false;
let scanning = false;
let sourceSnapshot = await buildSourceSnapshot();

function startServer() {
  if (stopping || serverProcess) return;
  const childProcess = spawn(globalThis.process.execPath, ["server.js"], {
    cwd: root,
    env: { ...globalThis.process.env, WETWARE_DEV:"1" },
    stdio: "inherit"
  });
  serverProcess = childProcess;
  childProcess.on("exit", (code, signal) => {
    if (serverProcess === childProcess) serverProcess = null;
    if (!stopping && code) console.error(`Development server stopped (${signal || code}). Edit a source file to retry.`);
  });
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(restartServer, 100);
}

function restartServer() {
  if (stopping) return;
  const previous = serverProcess;
  serverProcess = null;
  if (!previous) return startServer();
  previous.once("exit", startServer);
  previous.kill("SIGTERM");
}

async function buildSourceSnapshot() {
  const files = [...watchedFiles];
  for (const directory of watchedDirectories) {
    const entries = await readdir(directory, { recursive:true, withFileTypes:true });
    for (const entry of entries) {
      if (entry.isFile() && /\.(?:css|html|js|json)$/i.test(entry.name)) files.push(path.join(entry.parentPath, entry.name));
    }
  }
  const snapshot = new Map();
  for (const file of files) {
    try {
      const info = await stat(file);
      snapshot.set(file, `${info.mtimeMs}:${info.size}`);
    } catch {}
  }
  return snapshot;
}

function snapshotsMatch(left, right) {
  if (left.size !== right.size) return false;
  for (const [file, signature] of left) if (right.get(file) !== signature) return false;
  return true;
}

const scanTimer = setInterval(async () => {
  if (stopping || scanning) return;
  scanning = true;
  try {
    const nextSnapshot = await buildSourceSnapshot();
    if (!snapshotsMatch(sourceSnapshot, nextSnapshot)) {
      sourceSnapshot = nextSnapshot;
      scheduleRestart();
    }
  } catch (error) {
    console.error("Development source scan failed:", error.message);
  } finally {
    scanning = false;
  }
}, 500);

function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  clearInterval(scanTimer);
  if (serverProcess) {
    serverProcess.once("exit", () => globalThis.process.exit(0));
    serverProcess.kill("SIGTERM");
  }
  else globalThis.process.exit(0);
}

globalThis.process.on("SIGINT", stop);
globalThis.process.on("SIGTERM", stop);
startServer();
