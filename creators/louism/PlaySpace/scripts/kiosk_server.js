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
const offlineQueueExpiryMs = 24 * 60 * 60 * 1000;
const maximumLocalGalleryExamples = 50;
const maximumPosterBytes = 20 * 1024 * 1024;
const downloadDirectory = path.join(root, ".playspace-downloads");
const offlineQueueDirectory = path.join(root, ".playspace-offline-queue");
fs.mkdirSync(downloadDirectory, { recursive: true });
fs.mkdirSync(offlineQueueDirectory, { recursive: true });
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

function validOfflinePosterId(value) {
  return /^[A-Za-z0-9_-]+$/.test(value || "");
}

function offlinePosterImagePath(id) {
  return path.join(offlineQueueDirectory, `${id}.png`);
}

function offlinePosterMetadataPath(id) {
  return path.join(offlineQueueDirectory, `${id}.json`);
}

async function readOfflinePoster(id) {
  if (!validOfflinePosterId(id)) return null;
  try {
    let value = JSON.parse(
      await fs.promises.readFile(offlinePosterMetadataPath(id), "utf8"),
    );
    return value?.id == id ? value : null;
  } catch (error) {
    return null;
  }
}

async function writeOfflinePoster(value) {
  let destination = offlinePosterMetadataPath(value.id);
  let temporary = `${destination}.tmp`;
  await fs.promises.writeFile(temporary, `${JSON.stringify(value)}\n`);
  await fs.promises.rename(temporary, destination);
}

async function deleteOfflinePoster(value) {
  await Promise.allSettled([
    fs.promises.unlink(offlinePosterMetadataPath(value.id)),
    fs.promises.unlink(offlinePosterImagePath(value.id)),
  ]);
}

async function offlinePosters() {
  let filenames = await fs.promises.readdir(offlineQueueDirectory);
  let records = await Promise.all(
    filenames
      .filter((filename) => filename.endsWith(".json"))
      .map((filename) => readOfflinePoster(filename.slice(0, -5))),
  );
  let active = [];
  for (let record of records) {
    if (record == null) continue;
    if (!(record.queueExpiresAt > Date.now())) {
      await deleteOfflinePoster(record);
      continue;
    }
    active.push(record);
  }
  return active.sort((left, right) => right.createdAt - left.createdAt);
}

function offlinePosterGalleryEntry(record) {
  let synced = record.status == "synced" && record.cloudExampleUrl;
  return {
    id: record.id,
    url: `${publicOrigin}/offline-poster/${record.id}.png`,
    sourceUrl: synced ? record.cloudExampleUrl : "",
    downloadUrl: synced
      ? record.cloudDownloadUrl
      : record.localDownloadUrl,
    pendingUpload: !synced,
  };
}

function readJsonBody(request, maximumBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= maximumBytes) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > maximumBytes) {
        reject(new Error("JSON request is too large"));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    request.on("error", reject);
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

  if (request.method == "GET" && url.pathname == "/api/offline-posters") {
    let records = await offlinePosters();
    sendJson(response, 200, {
      examples: records
        .slice(0, maximumLocalGalleryExamples)
        .map(offlinePosterGalleryEntry),
      pendingUploads: records
        .filter((record) => record.status != "synced")
        .map(offlinePosterGalleryEntry),
    });
    return;
  }

  if (request.method == "POST" && url.pathname == "/api/gallery-cache") {
    let id = url.searchParams.get("id") || "";
    let cloudExampleUrl = url.searchParams.get("exampleUrl") || "";
    let cloudDownloadUrl = url.searchParams.get("downloadUrl") || "";
    let cloudPosterImageUrl = url.searchParams.get("posterImageUrl") || "";
    let cloudUrls = [
      cloudExampleUrl,
      cloudDownloadUrl,
      cloudPosterImageUrl,
    ];
    if (!validOfflinePosterId(id) || !cloudUrls.every((value) => {
      try {
        return new URL(value).protocol == "https:";
      } catch (error) {
        return false;
      }
    })) {
      sendJson(response, 400, { error: "Invalid gallery cache metadata" });
      return;
    }
    let image = await readPosterImage(request);
    if (image == null) {
      sendJson(response, 415, {
        error: "Gallery poster must be a PNG smaller than 20 MB",
      });
      return;
    }
    await fs.promises.writeFile(offlinePosterImagePath(id), image);
    let record = {
      id,
      status: "synced",
      claimUntil: 0,
      createdAt: Date.now(),
      queueExpiresAt: Date.now() + offlineQueueExpiryMs,
      localDownloadUrl: "",
      cloudExampleUrl,
      cloudDownloadUrl,
      cloudPosterImageUrl,
      cloudExpiresAt: Number(url.searchParams.get("expiresAt")) || null,
    };
    await writeOfflinePoster(record);
    sendJson(response, 201, offlinePosterGalleryEntry(record));
    return;
  }

  let offlineActionMatch = url.pathname.match(
    /^\/api\/offline-posters\/([A-Za-z0-9_-]+)\/(claim|release|synced)$/,
  );
  if (request.method == "POST" && offlineActionMatch != null) {
    let id = offlineActionMatch[1];
    let action = offlineActionMatch[2];
    let record = await readOfflinePoster(id);
    if (record == null || !(record.queueExpiresAt > Date.now())) {
      sendJson(response, 404, { error: "Offline poster not found" });
      return;
    }
    if (action == "claim") {
      if (record.status == "synced") {
        sendJson(response, 409, { error: "Poster is already online" });
        return;
      }
      if (record.claimUntil > Date.now()) {
        sendJson(response, 409, { error: "Poster upload is already claimed" });
        return;
      }
      record.claimUntil = Date.now() + 60 * 1000;
      await writeOfflinePoster(record);
      sendJson(response, 200, {
        id,
        uploadUrl: `${publicOrigin}/offline-poster/${id}.png`,
      });
      return;
    }
    if (action == "release") {
      record.claimUntil = 0;
      await writeOfflinePoster(record);
      sendJson(response, 200, { ok: true });
      return;
    }
    let payload;
    try {
      payload = await readJsonBody(request);
    } catch (error) {
      sendJson(response, 400, { error: error.message });
      return;
    }
    let cloudUrls = [
      payload.exampleUrl,
      payload.downloadUrl,
      payload.posterImageUrl,
    ];
    if (!cloudUrls.every((value) => {
      try {
        return new URL(value).protocol == "https:";
      } catch (error) {
        return false;
      }
    })) {
      sendJson(response, 400, { error: "Invalid cloud poster URLs" });
      return;
    }
    record.status = "synced";
    record.claimUntil = 0;
    record.cloudExampleUrl = payload.exampleUrl;
    record.cloudDownloadUrl = payload.downloadUrl;
    record.cloudPosterImageUrl = payload.posterImageUrl;
    record.cloudExpiresAt = payload.expiresAt || null;
    await writeOfflinePoster(record);
    sendJson(response, 200, offlinePosterGalleryEntry(record));
    return;
  }

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
    await fs.promises.writeFile(offlinePosterImagePath(token), image);
    let offlineRecord = {
      id: token,
      status: "pending",
      claimUntil: 0,
      createdAt: Date.now(),
      queueExpiresAt: Date.now() + offlineQueueExpiryMs,
      localDownloadUrl: `${publicOrigin}/d/${token}`,
    };
    await writeOfflinePoster(offlineRecord);
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

  let offlineImageMatch = url.pathname.match(
    /^\/offline-poster\/([A-Za-z0-9_-]+)\.png$/,
  );
  if ((request.method == "GET" || request.method == "HEAD") &&
      offlineImageMatch != null) {
    let record = await readOfflinePoster(offlineImageMatch[1]);
    let file = offlinePosterImagePath(offlineImageMatch[1]);
    if (record == null || !(record.queueExpiresAt > Date.now())) {
      send(response, 404, "Offline poster expired", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return;
    }
    let stat;
    try {
      stat = await fs.promises.stat(file);
    } catch (error) {
      send(response, 404, "Offline poster unavailable", {
        "Content-Type": "text/plain; charset=utf-8",
      });
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "private, max-age=60",
      "Content-Length": stat.size,
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method == "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
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

  let staticPathname = url.pathname.replace(
    /^\/device\/[12](?=\/|$)/,
    "",
  ) || "/";
  let relative;
  try {
    relative = staticPathname == "/"
      ? "index.html"
      : ["/control", "/control/"].includes(staticPathname)
        ? "control/index.html"
      : decodeURIComponent(staticPathname.slice(1));
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
  offlinePosters().catch((error) => {
    console.warn("Unable to clean the offline poster queue", error);
  });
}, 60 * 1000).unref();
