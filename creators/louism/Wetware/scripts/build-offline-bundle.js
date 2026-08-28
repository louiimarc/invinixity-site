import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const requestedOutput = argumentValue("--output") || path.join(root, "dist", `wetware-offline-${timestamp}.tar.gz`);
const output = path.resolve(root, requestedOutput);

if (!output.endsWith(".tar.gz")) fail("Bundle output must end in .tar.gz");
if (existsSync(output) || existsSync(`${output}.sha256`)) fail(`Refusing to overwrite existing bundle: ${output}`);

const test = spawnSync(process.execPath, ["--test"], { cwd:root, stdio:"inherit" });
if (test.status !== 0) fail("Tests failed; offline bundle was not created");

mkdirSync(path.dirname(output), { recursive:true });
const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), "wetware-offline-"));
const bundleName = path.basename(output, ".tar.gz");
const staging = path.join(temporaryRoot, bundleName);
mkdirSync(staging);

try {
  const entries = [
    "server.js", "package.json", "package-lock.json", "README.md",
    "START-WETWARE.command", "VERIFY-WETWARE.command",
    "docs", "public", "show", "scripts", "test", "node_modules"
  ];
  for (const relative of entries) copyRequired(relative, staging);
  if (existsSync(path.join(root, ".wetware-state", "show-state.json"))) copyRequired(".wetware-state/show-state.json", staging);
  const runtimeDirectory = path.join(staging, "runtime");
  mkdirSync(runtimeDirectory, { recursive:true });
  cpSync(process.execPath, path.join(runtimeDirectory, "node"));
  const nodeLicense = path.resolve(path.dirname(process.execPath), "..", "LICENSE");
  if (!existsSync(nodeLicense)) fail(`Node runtime license is missing beside ${process.execPath}`);
  cpSync(nodeLicense, path.join(runtimeDirectory, "NODE-LICENSE"));

  const files = walkFiles(staging)
    .filter((relative) => relative !== "BUNDLE-MANIFEST.json" && !relative.startsWith(".wetware-state/"))
    .map((relative) => {
      const bytes = readFileSync(path.join(staging, relative));
      return { path:relative, bytes:bytes.length, sha256:createHash("sha256").update(bytes).digest("hex") };
    });
  const manifest = {
    format:"wetware-offline-bundle",
    version:1,
    createdAt:new Date().toISOString(),
    nodeVersion:process.version,
    platform:process.platform,
    architecture:process.arch,
    integrityFiles:files.length,
    mutableFiles:[".wetware-state/show-state.json"],
    files
  };
  writeFileSync(path.join(staging, "BUNDLE-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const archive = spawnSync("tar", ["-czf", output, "-C", temporaryRoot, bundleName], { stdio:"inherit" });
  if (archive.status !== 0) fail("tar could not create the offline bundle");
  const archiveHash = createHash("sha256").update(readFileSync(output)).digest("hex");
  writeFileSync(`${output}.sha256`, `${archiveHash}  ${path.basename(output)}\n`);
  console.log(`\nOffline bundle ready:\n${output}\n${output}.sha256`);
} finally {
  rmSync(temporaryRoot, { recursive:true, force:true });
}

function copyRequired(relative, targetRoot) {
  const source = path.join(root, relative);
  if (!existsSync(source)) fail(`Required bundle source is missing: ${relative}`);
  const target = path.join(targetRoot, relative);
  mkdirSync(path.dirname(target), { recursive:true });
  cpSync(source, target, { recursive:true, filter:(sourcePath) => path.basename(sourcePath) !== ".DS_Store" });
}

function walkFiles(directory, prefix = "") {
  const results = [];
  for (const name of readdirSync(directory).sort()) {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const info = statSync(absolute);
    if (info.isDirectory()) results.push(...walkFiles(absolute, relative));
    else if (info.isFile()) results.push(relative);
  }
  return results;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function fail(message) {
  console.error(`\nBUNDLE FAILED: ${message}`);
  process.exit(1);
}
