const childProcess = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createLocalControl } = require("./local_control_server.js");
const { createServerSettings } = require("./server_tls.js");

const root = __dirname;
const serverSettings = createServerSettings();
const { port, protocol } = serverSettings;
const expiryMinutes = Number.parseInt(
  process.env.PLAYSPACE_EXPIRY_MINUTES || "15",
  10,
);
const expiryMs = expiryMinutes * 60 * 1000;
const maximumPosterBytes = 20 * 1024 * 1024;
const downloadDirectory = path.join(root, ".playspace-downloads");
fs.mkdirSync(downloadDirectory, { recursive: true });
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
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function currentLocalHostname() {
  try {
    let name = childProcess.execFileSync(
      "/usr/sbin/scutil",
      ["--get", "LocalHostName"],
      { encoding: "utf8" },
    ).trim();
    if (name != "") return `${name}.local`.toLowerCase();
  } catch (error) {
    // Fall through to Node's hostname outside macOS.
  }
  let name = os.hostname().trim();
  return (name.endsWith(".local") ? name : `${name}.local`).toLowerCase();
}

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

const localHostname = currentLocalHostname();
const publicOrigin = (
  process.env.PLAYSPACE_PUBLIC_ORIGIN ||
    `${protocol}://${localHostname}:${port}`
).replace(/\/$/, "");
const localControl = createLocalControl({
  port,
  localHostname,
  protocol,
  sendJson,
});

function expirePoster(token, session = posterSessions.get(token)) {
  posterSessions.delete(token);
  if (session != null) fs.unlink(session.file, () => {});
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

function readPosterImage(request) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maximumPosterBytes) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on("end", () => {
      if (tooLarge || size < 8) {
        resolve(null);
        return;
      }
      let image = Buffer.concat(chunks);
      let signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      resolve(image.subarray(0, 8).equals(signature) ? image : null);
    });
    request.on("error", reject);
  });
}

function downloadPage(token, expiresAt) {
  let imageUrl = `/poster/${encodeURIComponent(token)}.png`;
  let minutes = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#4D1430">
  <title>Your PlaySpace poster</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(145deg, #fff8e9, #f7c7dc 55%, #dcebf4); color: #1d1d1d; font-family: ui-rounded, system-ui, sans-serif; }
    main { width: min(100%, 520px); margin: 0 auto; padding: 28px 22px 44px; text-align: center; }
    h1 { margin: 0 0 20px; font-size: clamp(30px, 9vw, 48px); line-height: .98; }
    img { display: block; width: 100%; border-radius: 24px; box-shadow: 0 18px 55px rgba(77, 20, 48, .18); }
    a { display: block; margin-top: 22px; padding: 17px 22px; border-radius: 999px; background: #7bcbbb; color: #1d1d1d; font-size: 19px; font-weight: 800; text-decoration: none; }
    p { color: #655d61; font-size: 14px; }
  </style>
</head>
<body><main>
  <h1>Your poster is ready!</h1>
  <img src="${imageUrl}" alt="Your finished PlaySpace poster">
  <a href="${imageUrl}?download=1">Download poster</a>
  <p>Available on this local network for ${minutes} minutes.</p>
</main></body>
</html>`;
}

async function handleRequest(request, response) {
  let url = new URL(request.url, "http://localhost");
  if (await localControl.handle(request, response, url)) return;

  if (request.method == "POST" && url.pathname == "/api/posters") {
    let image = await readPosterImage(request);
    if (image == null) {
      sendJson(response, 415, {
        error: "Poster must be a PNG smaller than 20 MB",
      });
      return;
    }
    let token = crypto.randomBytes(9).toString("base64url");
    let file = path.join(downloadDirectory, `${token}.png`);
    let expiresAt = Date.now() + expiryMs;
    await fs.promises.writeFile(file, image);
    posterSessions.set(token, { file, expiresAt });
    sendJson(response, 201, {
      token,
      downloadUrl: `${publicOrigin}/d/${token}`,
      posterImageUrl: `${publicOrigin}/poster/${token}.png`,
      exampleUrl: "",
      expiresAt,
    });
    return;
  }

  let downloadMatch = url.pathname.match(/^\/d\/([A-Za-z0-9_-]+)$/);
  if (request.method == "GET" && downloadMatch != null) {
    let session = posterSession(downloadMatch[1]);
    if (session == null) {
      send(response, 404, "This poster has expired.", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return;
    }
    send(response, 200, downloadPage(downloadMatch[1], session.expiresAt), {
      "Content-Type": "text/html; charset=utf-8",
    });
    return;
  }

  let posterMatch = url.pathname.match(
    /^\/poster\/([A-Za-z0-9_-]+)\.png$/,
  );
  if ((request.method == "GET" || request.method == "HEAD") && posterMatch) {
    let session = posterSession(posterMatch[1]);
    if (session == null) {
      send(response, 404, "Poster expired", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return;
    }
    let stat = await fs.promises.stat(session.file);
    response.writeHead(200, {
      "Cache-Control": "private, max-age=60",
      "Content-Disposition": url.searchParams.has("download")
        ? 'attachment; filename="PlaySpace-poster.png"'
        : 'inline; filename="PlaySpace-poster.png"',
      "Content-Length": stat.size,
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method == "HEAD") response.end();
    else fs.createReadStream(session.file).pipe(response);
    return;
  }

  if (request.method != "GET" && request.method != "HEAD") {
    send(response, 405, "Method not allowed");
    return;
  }

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
  if (relative.split("/").some((part) => part == "" || part.startsWith("."))) {
    send(response, 403, "Forbidden");
    return;
  }

  let filePath = path.resolve(root, relative);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    send(response, 403, "Forbidden");
    return;
  }
  fs.stat(filePath, (error, stat) => {
    if (error != null || !stat.isFile()) {
      send(response, 404, "Not found");
      return;
    }
    let extension = path.extname(filePath).toLowerCase();
    let cacheControl = [
      ".jpeg",
      ".jpg",
      ".png",
      ".svg",
      ".ttf",
      ".m4a",
      ".glsl",
    ].includes(
      extension,
    )
      ? "public, max-age=3600"
      : "no-cache";
    response.writeHead(200, {
      "Cache-Control": cacheControl,
      "Content-Length": stat.size,
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method == "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

let server = serverSettings.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Server error" });
    else response.end();
  });
});
server.listen(port, "0.0.0.0", () => {
  console.log(`PlaySpace kiosk: ${protocol}://localhost:${port}`);
  console.log(`Phone controller: ${localControl.controlUrl}`);
  for (let link of localControl.kioskLinks) {
    console.log(`${link.label}: ${link.url}`);
  }
});

setInterval(() => {
  for (let [token, session] of posterSessions) {
    if (Date.now() >= session.expiresAt) expirePoster(token, session);
  }
}, 60 * 1000).unref();
