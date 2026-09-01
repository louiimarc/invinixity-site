const fs = require("fs");
const path = require("path");
const { transform } = require("lightningcss");
const sharp = require("sharp");
const { minify } = require("terser");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "output", "kiosk-runtime");

function copyFile(relativeSource, relativeDestination = relativeSource) {
  let source = path.join(root, relativeSource);
  let destination = path.join(output, relativeDestination);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyDirectory(relativeSource, relativeDestination = relativeSource) {
  let source = path.join(root, relativeSource);
  let destination = path.join(output, relativeDestination);
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => path.basename(entry) != ".DS_Store",
  });
}

async function copyRuntimeGlyphs() {
  let sourceDirectory = path.join(root, "assets", "poster", "glyphs", "png");
  let destinationDirectory = path.join(
    output,
    "assets",
    "poster",
    "glyphs",
    "png",
  );
  fs.mkdirSync(destinationDirectory, { recursive: true });
  let filenames = fs.readdirSync(sourceDirectory)
    .filter((filename) => filename.toLowerCase().endsWith(".png"))
    .sort();
  for (let filename of filenames) {
    await sharp(path.join(sourceDirectory, filename))
      .resize({ height: 512, withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(destinationDirectory, filename));
  }
}

async function buildApplicationBundle(indexSource) {
  let scriptPattern = /^(\s*)<script src="(js\/[^\"]+\.js)"><\/script>\s*$/gm;
  let scripts = [];
  let inserted = false;
  let index = indexSource.replace(
    scriptPattern,
    (match, indentation, source) => {
      scripts.push(source);
      if (inserted) return "";
      inserted = true;
      return `${indentation}<script src="app.min.js"></script>`;
    },
  );
  if (scripts.length == 0) throw new Error("No PlaySpace scripts found in index.html");

  let source = scripts.map((relativePath) => {
    let contents = fs.readFileSync(path.join(root, relativePath), "utf8");
    return `\n;/* ${relativePath} */\n${contents}`;
  }).join("\n");
  let result = await minify(source, {
    compress: {
      keep_fargs: true,
      keep_fnames: true,
      passes: 1,
    },
    mangle: {
      keep_classnames: true,
      keep_fnames: true,
      toplevel: false,
    },
    format: {
      ascii_only: true,
      comments: false,
    },
    sourceMap: false,
  });
  if (result.code == null) throw new Error("Unable to minify PlaySpace scripts");
  fs.writeFileSync(path.join(output, "app.min.js"), `${result.code}\n`);
  fs.writeFileSync(path.join(output, "index.html"), index);
}

function buildStylesheet() {
  let result = transform({
    filename: "style.css",
    code: fs.readFileSync(path.join(root, "style.css")),
    minify: true,
  });
  fs.writeFileSync(path.join(output, "style.css"), result.code);
}

function writeRuntimePackage() {
  let manifest = {
    name: "playspace-kiosk-runtime",
    version: "1.0.0",
    private: true,
    description: "Generated PlaySpace event runtime",
    scripts: { start: "node server.js" },
  };
  fs.writeFileSync(
    path.join(output, "package.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(output, "START_HERE.txt"),
    [
      "PlaySpace kiosk runtime",
      "",
      "1. Open Terminal in this folder.",
      "2. Run: npm start",
      "3. Open: http://localhost:8080",
      "",
      "This folder is generated. Rebuild it from the source project with:",
      "npm run build:kiosk",
      "",
      "The public poster API address is copied from js/runtime_config.js",
      "during the build. Rebuild this folder after changing that address.",
      "",
    ].join("\n"),
  );
}

function directorySize(directory) {
  let total = 0;
  for (let entry of fs.readdirSync(directory, { withFileTypes: true })) {
    let entryPath = path.join(directory, entry.name);
    total += entry.isDirectory()
      ? directorySize(entryPath)
      : fs.statSync(entryPath).size;
  }
  return total;
}

async function main() {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  await buildApplicationBundle(fs.readFileSync(path.join(root, "index.html"), "utf8"));
  buildStylesheet();
  copyFile("site.webmanifest");
  copyFile("scripts/kiosk_server.js", "server.js");
  copyDirectory("shader");
  copyDirectory("vendor");

  copyFile("assets/audio/camera_capture.m4a");
  copyDirectory("assets/branding");
  copyDirectory("assets/data");
  copyDirectory("assets/examples/fallback");
  copyFile("assets/fonts/Humanize.ttf");
  copyFile("assets/fonts/Nunito-Bold.ttf");
  copyDirectory("assets/home");
  copyDirectory("assets/poster/back");
  copyFile("assets/poster/overlay/foreground.svg");
  copyDirectory("assets/ui");

  for (let category of ["female", "in_between", "male"]) {
    let directory = path.join(root, "assets", "portraits", category);
    for (let filename of fs.readdirSync(directory)) {
      if (!filename.endsWith("-expanded.png")) continue;
      copyFile(
        `assets/portraits/${category}/${filename}`,
      );
    }
  }
  await copyRuntimeGlyphs();
  writeRuntimePackage();

  let megabytes = directorySize(output) / (1024 * 1024);
  console.log(`PlaySpace kiosk runtime built: ${output}`);
  console.log(`Runtime size: ${megabytes.toFixed(1)} MB`);
  console.log(`Start it with: cd "${output}" && npm start`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
