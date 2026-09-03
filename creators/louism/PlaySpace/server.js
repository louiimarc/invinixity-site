const crypto = require("crypto");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const QRCode = require("qrcode");
const { createLocalControl } = require("./scripts/local_control_server.js");
const { createServerSettings } = require("./scripts/server_tls.js");

const root = __dirname;
const serverSettings = createServerSettings();
const { port, protocol } = serverSettings;

function currentLocalHostname() {
  try {
    let name = childProcess.execFileSync(
      "/usr/sbin/scutil",
      ["--get", "LocalHostName"],
      { encoding: "utf8" },
    ).trim();
    if (name != "") return `${name}.local`.toLowerCase();
  } catch (error) {
    // Fall back to Node's hostname on non-macOS development machines.
  }
  let name = os.hostname().trim();
  return (name.endsWith(".local") ? name : `${name}.local`).toLowerCase();
}

const localHostname = currentLocalHostname();
const publicOrigin = (
  process.env.PLAYSPACE_PUBLIC_ORIGIN ||
    `${protocol}://${localHostname}:${port}`
).replace(/\/$/, "");
const wifiName = process.env.PLAYSPACE_WIFI_NAME || "PlaySpace";
const wifiPassword = process.env.PLAYSPACE_WIFI_PASSWORD || "playspace-demo";
const wifiSecurity = process.env.PLAYSPACE_WIFI_SECURITY || "WPA";
const skipWifi = process.env.PLAYSPACE_SKIP_WIFI != "false";
const expiryMinutes = Number.parseInt(
  process.env.PLAYSPACE_EXPIRY_MINUTES || "15",
  10,
);
const expiryMs = expiryMinutes * 60 * 1000;
const maximumPosterBytes = 20 * 1024 * 1024;
const downloadDirectory = path.join(root, ".playspace-downloads");
const exampleDirectory = path.join(root, "assets", "examples", "generated");

fs.mkdirSync(downloadDirectory, { recursive: true });
fs.mkdirSync(exampleDirectory, { recursive: true });

const posterSessions = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".glsl": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), {
    "Content-Type": "application/json; charset=utf-8",
  });
}

const localControl = createLocalControl({
  port,
  localHostname,
  protocol,
  sendJson,
});

function nextExampleFilename() {
  let highest = 0;
  for (let filename of fs.readdirSync(exampleDirectory)) {
    let match = filename.match(/^example_(\d{3})\.png$/);
    if (match != null) highest = Math.max(highest, Number(match[1]));
  }
  return `example_${String(highest + 1).padStart(3, "0")}.png`;
}

function exampleUrls() {
  return fs.readdirSync(exampleDirectory)
    .filter((filename) => /^example_\d{3}\.png$/.test(filename))
    .sort()
    .map((filename) => `/assets/examples/generated/${filename}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function posterSession(token) {
  let session = posterSessions.get(token);
  if (session == null) return null;
  if (Date.now() >= session.expiresAt) {
    expirePoster(token, session);
    return null;
  }
  return session;
}

function expirePoster(token, session = posterSessions.get(token)) {
  posterSessions.delete(token);
  if (session == null) return;
  fs.unlink(session.file, () => {});
}

function downloadPage(token, session) {
  let imageUrl = `/poster/${encodeURIComponent(token)}.png`;
  let remainingMinutes = Math.max(
    1,
    Math.ceil((session.expiresAt - Date.now()) / 60000),
  );
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#4D1430">
  <title>Your PlaySpace poster</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #f2eee8; color: #1d1d1d; font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif; }
    main { width: min(100%, 520px); margin: 0 auto; padding: 28px 22px 44px; text-align: center; }
    .brand { margin: 0 0 8px; color: #4D1430; font-size: 15px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: 0 0 20px; font-size: clamp(30px, 9vw, 48px); line-height: .98; }
    .poster { display: block; width: 100%; border: 10px solid white; border-radius: 24px; box-shadow: 0 18px 55px rgba(77, 20, 48, .18); }
    .download { display: block; margin-top: 22px; padding: 17px 22px; border-radius: 999px; background: #7D9664; color: white; font-size: 19px; font-weight: 800; text-decoration: none; }
    .note { margin: 15px 0 0; color: #655d61; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <p class="brand">PlaySpace</p>
    <h1>Your poster is ready!</h1>
    <img class="poster" src="${imageUrl}" alt="Your finished PlaySpace poster">
    <a class="download" href="${imageUrl}?download=1" download="PlaySpace-poster.png">Download poster</a>
    <p class="note">Available on this Wi-Fi for ${remainingMinutes} minutes.</p>
  </main>
</body>
</html>`;
}

async function handleRequest(request, response) {
  let url = new URL(request.url, "http://localhost");

  if (await localControl.handle(request, response, url)) return;

  if (request.method == "GET" && url.pathname == "/api/config") {
    sendJson(response, 200, {
      publicOrigin,
      wifiName,
      wifiPassword,
      wifiSecurity,
      skipWifi,
      expiryMinutes,
    });
    return;
  }

  if (request.method == "GET" && url.pathname == "/api/qr") {
    let text = url.searchParams.get("text") || "";
    if (text.length == 0 || text.length > 2048) {
      sendJson(response, 400, { error: "Invalid QR content" });
      return;
    }
    try {
      let svg = await QRCode.toString(text, {
        type: "svg",
        width: 512,
        errorCorrectionLevel: "M",
        margin: 2,
        color: { dark: "#1D1D1D", light: "#FFFFFF" },
      });
      send(response, 200, svg, { "Content-Type": "image/svg+xml" });
    } catch (error) {
      sendJson(response, 500, { error: "Unable to generate QR code" });
    }
    return;
  }

  if (request.method == "GET" && url.pathname == "/api/examples") {
    sendJson(response, 200, { examples: exampleUrls() });
    return;
  }

  if (request.method == "POST" && url.pathname == "/api/examples") {
    let chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= maximumPosterBytes) chunks.push(chunk);
      else request.destroy();
    });
    request.on("end", () => {
      if (size < 8 || size > maximumPosterBytes) {
        sendJson(response, 413, { error: "Example image is invalid" });
        return;
      }
      let image = Buffer.concat(chunks);
      let pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      if (!image.subarray(0, 8).equals(pngSignature)) {
        sendJson(response, 415, { error: "Example must be a PNG" });
        return;
      }
      let filename = nextExampleFilename();
      let file = path.join(exampleDirectory, filename);
      fs.writeFile(file, image, (error) => {
        if (error != null) {
          sendJson(response, 500, { error: "Unable to save example" });
          return;
        }
        sendJson(response, 201, {
          filename,
          url: `/assets/examples/generated/${filename}`,
        });
      });
    });
    return;
  }

  if (request.method == "POST" && url.pathname == "/api/posters") {
    let chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= maximumPosterBytes) chunks.push(chunk);
      else request.destroy();
    });
    request.on("end", () => {
      if (size == 0 || size > maximumPosterBytes) {
        sendJson(response, 413, { error: "Poster image is too large" });
        return;
      }
      let token = crypto.randomBytes(9).toString("base64url");
      let file = path.join(downloadDirectory, `${token}.png`);
      let expiresAt = Date.now() + expiryMs;
      let image = Buffer.concat(chunks);
      fs.writeFile(file, image, (error) => {
        if (error != null) {
          sendJson(response, 500, { error: "Unable to save poster" });
          return;
        }
        let exampleFilename = nextExampleFilename();
        let exampleFile = path.join(exampleDirectory, exampleFilename);
        fs.writeFile(exampleFile, image, (exampleError) => {
          if (exampleError != null) {
            fs.unlink(file, () => {});
            sendJson(response, 500, {
              error: "Unable to save poster example",
            });
            return;
          }
          posterSessions.set(token, { file, expiresAt });
          sendJson(response, 201, {
            token,
            downloadUrl: `${publicOrigin}/d/${token}`,
            posterImageUrl: `${publicOrigin}/poster/${token}.png`,
            exampleUrl: `/assets/examples/generated/${exampleFilename}`,
            expiresAt,
          });
        });
      });
    });
    return;
  }

  let downloadMatch = url.pathname.match(/^\/d\/([A-Za-z0-9_-]+)$/);
  if (request.method == "GET" && downloadMatch != null) {
    let token = downloadMatch[1];
    let session = posterSession(token);
    if (session == null) {
      send(response, 404, "This poster has expired.", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return;
    }
    send(response, 200, downloadPage(token, session), {
      "Content-Type": "text/html; charset=utf-8",
    });
    return;
  }

  let posterMatch = url.pathname.match(/^\/poster\/([A-Za-z0-9_-]+)\.png$/);
  if (request.method == "GET" && posterMatch != null) {
    let token = posterMatch[1];
    let session = posterSession(token);
    if (session == null) {
      send(response, 404, "Poster expired", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": url.searchParams.has("download")
        ? 'attachment; filename="PlaySpace-poster.png"'
        : 'inline; filename="PlaySpace-poster.png"',
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(session.file).pipe(response);
    return;
  }

  if (request.method != "GET" && request.method != "HEAD") {
    send(response, 405, "Method not allowed");
    return;
  }

  let filePath;
  if (url.pathname == "/vendor/p5.js") {
    filePath = path.join(root, "node_modules/p5/lib/p5.min.js");
  } else if (url.pathname == "/vendor/p5.sound.js") {
    filePath = path.join(root, "node_modules/p5/lib/addons/p5.sound.min.js");
  } else {
    let relative;
    try {
      relative = url.pathname == "/"
        ? "index.html"
        : ["/control", "/control/"].includes(url.pathname)
          ? "control/index.html"
        : decodeURIComponent(url.pathname.slice(1));
    } catch (error) {
      send(response, 400, "Invalid URL");
      return;
    }
    filePath = path.resolve(root, relative);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      send(response, 403, "Forbidden");
      return;
    }
  }

  fs.stat(filePath, (error, stat) => {
    if (error != null || !stat.isFile()) {
      send(response, 404, "Not found");
      return;
    }
    let contentType = mimeTypes[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";
    let cacheControl = url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/shader/") ||
        url.pathname.startsWith("/vendor/")
      ? "public, max-age=3600"
      : "no-cache";
    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Length": stat.size,
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method == "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

const server = serverSettings.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Server error" });
    else response.end();
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`PlaySpace local kiosk: ${protocol}://localhost:${port}`);
  console.log(`Phone controller: ${localControl.controlUrl}`);
  for (let link of localControl.kioskLinks) {
    console.log(`${link.label}: ${link.url}`);
  }
  console.log("Poster downloads: Cloudflare endpoint in js/runtime_config.js");
});

setInterval(() => {
  for (let [token, session] of posterSessions) {
    if (Date.now() >= session.expiresAt) expirePoster(token, session);
  }
}, 60 * 1000).unref();
