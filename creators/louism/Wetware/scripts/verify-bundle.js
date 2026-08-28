import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "BUNDLE-MANIFEST.json");

if (!existsSync(manifestPath)) {
  console.log("Development tree: no bundle manifest to verify.");
  process.exit(0);
}

let manifest;
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); }
catch { fail("BUNDLE-MANIFEST.json is unreadable"); }
if (manifest?.format !== "wetware-offline-bundle" || manifest.version !== 1 || !Array.isArray(manifest.files)) fail("Bundle manifest format is invalid");

const failures = [];
for (const record of manifest.files) {
  if (!safeRelativePath(record.path)) { failures.push(`${record.path}: UNSAFE PATH`); continue; }
  const absolute = path.join(root, record.path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) { failures.push(`${record.path}: MISSING`); continue; }
  const bytes = readFileSync(absolute);
  if (bytes.length !== record.bytes) { failures.push(`${record.path}: SIZE MISMATCH`); continue; }
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== record.sha256) failures.push(`${record.path}: HASH MISMATCH`);
}

if (failures.length) fail(`${failures.length} integrity failure(s):\n${failures.slice(0, 20).join("\n")}`);
console.log(`Bundle integrity verified: ${manifest.files.length} immutable files. Mutable show state is intentionally excluded.`);

function safeRelativePath(value) {
  const text = String(value || "");
  return Boolean(text) && !path.isAbsolute(text) && !text.split(/[\\/]/).includes("..");
}

function fail(message) {
  console.error(`\nVERIFY FAILED: ${message}`);
  process.exit(1);
}
