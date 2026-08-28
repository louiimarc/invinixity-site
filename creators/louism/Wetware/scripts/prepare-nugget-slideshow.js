import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nuggetSlideCandidates, productionNuggetSlideshow } from "../show/slideshow.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public", "assets", "image", "nugget-series");
const manifestPath = path.join(source, "slideshow.json");
const install = process.argv.includes("--install");
const approved = process.argv.includes("--approved");
const expected = new Set(nuggetSlideCandidates.map(({ file }) => file));

if (!existsSync(source)) fail(`candidate folder is missing: ${source}`);
const actual = readdirSync(source).filter((name) => name.toLowerCase().endsWith(".png")).sort();
const missing = [...expected].filter((name) => !actual.includes(name));
const unexpected = actual.filter((name) => !expected.has(name));
const invalid = [];

for (const file of [...expected].sort()) {
  const filePath = path.join(source, file);
  if (!existsSync(filePath)) continue;
  try {
    const info = inspectPng(readFileSync(filePath));
    if (info.width !== 720 || info.height !== 1280) invalid.push(`${file}: ${info.width}×${info.height}, expected 720×1280`);
    if (![2, 4, 6].includes(info.colorType)) invalid.push(`${file}: unsupported PNG color type ${info.colorType}`);
  } catch (error) {
    invalid.push(`${file}: ${error.message}`);
  }
}

if (missing.length || unexpected.length || invalid.length) {
  if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
  if (unexpected.length) console.error(`Unexpected: ${unexpected.join(", ")}`);
  if (invalid.length) console.error(`Invalid:\n- ${invalid.join("\n- ")}`);
  fail("candidate artwork audit failed");
}

console.log(`Candidate audit passed: ${actual.length} ordered 720×1280 RGB/RGBA PNGs.`);
if (!install) {
  console.log("Review only: production media was not changed.");
  process.exit(0);
}
if (!approved) fail("installation requires both --install and --approved after creative/rights approval");
if (existsSync(manifestPath)) fail("production slideshow already exists; refusing to overwrite it");

writeFileSync(manifestPath, `${JSON.stringify(productionNuggetSlideshow(), null, 2)}\n`);
console.log(`Installed slideshow.json beside ${actual.length} approved web images in ${source}.`);

function inspectPng(bytes) {
  if (bytes.length < 33 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a valid PNG header");
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("IHDR is missing");
  return { width:bytes.readUInt32BE(16), height:bytes.readUInt32BE(20), colorType:bytes[25] };
}

function fail(message) {
  console.error(`NUGGET SLIDES FAILED: ${message}`);
  process.exit(1);
}
