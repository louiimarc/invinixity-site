import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";
import { cues } from "./show/cues.js";
import { assetManifest } from "./show/assets.js";
import { initialState, normalizeState, reduceState } from "./show/state.js";
import { sanitizeTelemetry } from "./show/telemetry.js";
import { sanitizeLiveInput } from "./show/input.js";
import { canSendLiveInput, canSendShowAction } from "./show/control-access.js";
import { createLiveInputStore } from "./show/live-inputs.js";
import { resolveMediaAssetPath, validateMediaJson } from "./public/common/media-content.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(root, "public");
const stateDir = path.join(root, ".wetware-state");
const stateFile = path.join(stateDir, "show-state.json");
const port = Number(process.env.PORT || 4173);
const development = process.env.WETWARE_DEV === "1";
const serverInstanceId = crypto.randomUUID();
const clients = new Map();
const liveInputs = createLiveInputStore();
let showState = await loadState();
let saveTimer;

const requestHandler = async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname === "/api/status") return sendJson(response, 200, statusPayload());
    if (url.pathname === "/api/qr") return sendQrCode(response, url.searchParams.get("text"));
    if (url.pathname === "/api/preflight") return sendJson(response, 200, await mediaPreflight());
    if (url.pathname === "/api/manifest/aquarium") return sendManifest(response, aquariumManifest(url));
    if (url.pathname === "/api/manifest/nugget") return sendManifest(response, nuggetManifest());
    if (url.pathname === "/api/manifest/lighting") return sendManifest(response, lightingManifest());
    if (url.pathname === "/api/manifest/kala") return sendManifest(response, kalaManifest());
    if (/^\/ipad\/(?:[123]\/|index\.html)?$/.test(url.pathname)) return sendAquariumPage(response, url);
    if (url.pathname === "/show/cues.js") return sendFile(response, path.join(root, "show/cues.js"));
    if (url.pathname === "/show/surfaces.js") return sendFile(response, path.join(root, "show/surfaces.js"));
    if (url.pathname === "/show/outputs.js") return sendFile(response, path.join(root, "show/outputs.js"));
    if (url.pathname === "/show/lighting.js") return sendFile(response, path.join(root, "show/lighting.js"));
    if (url.pathname === "/show/assets.js") return sendFile(response, path.join(root, "show/assets.js"));
    if (url.pathname === "/show/slideshow.js") return sendFile(response, path.join(root, "show/slideshow.js"));
    if (url.pathname === "/show/production.js") return sendFile(response, path.join(root, "show/production.js"));
    if (url.pathname === "/show/budget-chaos.js") return sendFile(response, path.join(root, "show/budget-chaos.js"));
    if (url.pathname === "/show/scene-settings.js") return sendFile(response, path.join(root, "show/scene-settings.js"));
    if (url.pathname === "/vendor/p5.min.js") return sendFile(response, path.join(root, "node_modules/p5/lib/p5.min.js"));

    const requested = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(publicRoot, safePath);
    if (!filePath.startsWith(publicRoot)) return sendText(response, 403, "Forbidden");
    await sendFile(response, filePath, request);
  } catch (error) {
    const code = error?.code === "ENOENT" ? 404 : 500;
    sendText(response, code, code === 404 ? "Not found" : "Server error");
  }
};

const server = http.createServer(requestHandler);

attachWebSocketServer(server);

function attachWebSocketServer(targetServer) {
  const socketServer = new WebSocketServer({ server:targetServer, path:"/ws" });
  socketServer.on("connection", handleSocketConnection);
}

function handleSocketConnection(socket) {
  const meta = { id: crypto.randomUUID(), role: "unknown", deviceId: "unknown", connectedAt: Date.now(), lastSeen: Date.now(), telemetry: null };
  clients.set(socket, meta);
  send(socket, {
    type: "WELCOME",
    state: showState,
    cues,
    inputs:liveInputs.snapshot(),
    serverTime: Date.now(),
    dev: development ? { autoReload:true, instanceId:serverInstanceId } : undefined
  });
  broadcastStatus();

  socket.on("message", async (buffer) => {
    let message;
    try { message = JSON.parse(buffer.toString()); } catch { return; }
    meta.lastSeen = Date.now();

    if (message.type === "HELLO") {
      meta.role = String(message.role || "unknown").slice(0, 30);
      meta.deviceId = String(message.deviceId || meta.role).slice(0, 50);
      meta.telemetry = sanitizeTelemetry(message.telemetry);
      broadcastStatus();
      return;
    }

    if (message.type === "TELEMETRY") {
      meta.telemetry = sanitizeTelemetry(message.telemetry);
      broadcastStatus();
      return;
    }

    if (message.type === "ACTION" && canSendShowAction(meta.role, message.action)) {
      showState = reduceState(showState, message.action);
      scheduleSave(showState);
      broadcast({ type: "STATE", state: showState, serverTime: Date.now() });
      return;
    }

    if (message.type === "MAPPING_ACTION" && meta.role === "projector") {
      const type = message.action?.type;
      const projectorPlane = meta.deviceId === "mac-projector-floor" ? "floor" : meta.deviceId === "mac-projector-wall" ? "screen" : null;
      const selectsOwnPlane = type === "SET_CALIBRATION_SURFACE" && projectorPlane && message.action?.surface === projectorPlane;
      const editsOwnPlane = showState.calibration && ["SET_SURFACE_POINT", "RESET_SURFACE"].includes(type) && projectorPlane && message.action?.surface === projectorPlane;
      const allowed = type === "SET_CALIBRATION" || selectsOwnPlane || editsOwnPlane;
      if (!allowed) return;
      showState = reduceState(showState, message.action);
      scheduleSave(showState);
      broadcast({ type: "STATE", state: showState, serverTime: Date.now() });
      return;
    }

    if (message.type === "INPUT" && canSendLiveInput(meta.role,message.input)) {
      const input = sanitizeLiveInput(message.input);
      if (input) {
        liveInputs.set(input);
        broadcast({ type: "INPUT", input, serverTime: Date.now() });
      }
      return;
    }

    if (message.type === "PING") send(socket, { type: "PONG", serverTime: Date.now(), sentAt: message.sentAt });
  });

  socket.on("close", () => {
    clients.delete(socket);
    broadcastStatus();
  });
}

setInterval(() => {
  const cutoff = Date.now() - 15000;
  for (const [socket, meta] of clients) {
    if (meta.lastSeen < cutoff) socket.terminate();
  }
}, 5000).unref();

setInterval(() => {
  for (const input of liveInputs.expire()) broadcast({ type:"INPUT", input, serverTime:Date.now() });
}, 250).unref();

server.listen(port, "0.0.0.0", () => {
  const deviceUrl = `http://${localHostname()}:${port}`;
  console.log("\nWETWARE show control is ready\n");
  console.log(`Operator:  http://localhost:${port}/operator/`);
  console.log(`Wall:      http://localhost:${port}/projector/?output=wall`);
  console.log(`Floor:     http://localhost:${port}/projector/?output=floor`);
  console.log(`iPads:    ${deviceUrl}/ipad/1/ · /ipad/2/ · /ipad/3/`);
  console.log(`Nugget:   ${deviceUrl}/nugget/`);
  console.log(`Lighting: ${deviceUrl}/lighting/`);
  console.log(`Kala:     ${deviceUrl}/kala/`);
  if (development) console.log("Live reload: ON · source changes refresh connected clients");
  console.log("\nPress Ctrl+C to stop.\n");
});

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(payload) {
  for (const socket of clients.keys()) send(socket, payload);
}

function broadcastStatus() {
  const status = statusPayload();
  broadcast({ type: "DEVICES", devices: status.devices, serverTime: status.serverTime });
}

function statusPayload() {
  const addresses = localAddresses();
  return {
    state: showState,
    serverTime: Date.now(),
    network: { port, hostname:localHostname(), addresses },
    devices: [...clients.values()].map(({ id, role, deviceId, connectedAt, lastSeen, telemetry }) => ({ id, role, deviceId, connectedAt, lastSeen, telemetry }))
  };
}

function localHostname() {
  return `${os.hostname().replace(/\.local$/i, "")}.local`;
}

async function loadState() {
  try { return normalizeState(JSON.parse(await readFile(stateFile, "utf8"))); }
  catch { return initialState(); }
}

async function saveState(state) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function scheduleSave(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state).catch((error) => console.error("Could not save show state:", error)), 200);
}

async function sendFile(response, filePath, request = null) {
  const info = await stat(filePath);
  if (!info.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
  const type = mimeType(filePath);
  const editable = /(?:text\/html|text\/css|javascript)/.test(type);
  const streamable = /^(?:video|audio)\//.test(type);
  const range = streamable ? parseByteRange(request?.headers?.range,info.size) : null;
  const cacheControl = editable ? "no-cache" : "public, max-age=3600";
  if (request?.headers?.range && streamable && !range) {
    response.writeHead(416, { "Content-Range":`bytes */${info.size}`, "Accept-Ranges":"bytes" });
    response.end();
    return;
  }
  if (range) {
    response.writeHead(206, {
      "Content-Type":type,
      "Content-Length":range.end-range.start+1,
      "Content-Range":`bytes ${range.start}-${range.end}/${info.size}`,
      "Accept-Ranges":"bytes",
      "Cache-Control":cacheControl
    });
    if (request?.method === "HEAD") response.end();
    else createReadStream(filePath,{ start:range.start,end:range.end }).on("error",()=>response.destroy()).pipe(response);
    return;
  }
  if (streamable) {
    response.writeHead(200, { "Content-Type":type, "Content-Length":info.size, "Accept-Ranges":"bytes", "Cache-Control":cacheControl });
    if (request?.method === "HEAD") response.end();
    else createReadStream(filePath).on("error",()=>response.destroy()).pipe(response);
    return;
  }
  const body = await readFile(filePath);
  response.writeHead(200, { "Content-Type": type, "Content-Length":body.length, "Cache-Control":cacheControl });
  response.end(request?.method === "HEAD" ? undefined : body);
}

function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0,size-suffixLength);
    end = size-1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size-1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start,end:Math.min(end,size-1) };
}

function sendJson(response, code, value) {
  response.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function sendQrCode(response, value) {
  const text = String(value || "");
  if (!text || text.length > 1024) return sendText(response, 400, "Invalid QR content");
  const svg = await QRCode.toString(text, {
    type:"svg",
    width:512,
    margin:2,
    errorCorrectionLevel:"M",
    color:{ dark:"#090b0f", light:"#ffffff" }
  });
  response.writeHead(200, { "Content-Type":"image/svg+xml; charset=utf-8", "Cache-Control":"no-store" });
  response.end(svg);
}

function sendManifest(response, value) {
  response.writeHead(200, { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

function aquariumManifest(url) {
  const device = /^ipad-[123]$/.test(url.searchParams.get("device") || "") ? url.searchParams.get("device") : "ipad-1";
  const number = device.slice(-1);
  const reflect = ["x", "y", "xy"].includes(url.searchParams.get("reflect")) ? `?reflect=${url.searchParams.get("reflect")}` : "";
  return appManifest({
    name:`Wetware Aquarium ${number}`,
    shortName:`Aquarium ${number}`,
    startUrl:`/ipad/${number}/${reflect}`,
    scope:`/ipad/${number}/`,
    icon:"aquarium"
  });
}

function nuggetManifest() {
  return appManifest({
    name:"Wetware Nugget Launchpad",
    shortName:"Nugget Pad",
    startUrl:"/nugget/",
    scope:"/nugget/",
    icon:"nugget",
    display:"fullscreen"
  });
}

function lightingManifest() {
  const manifest = appManifest({
    name:"Wetware Lighting Monitor",
    shortName:"Lighting",
    startUrl:"/lighting/",
    scope:"/lighting/",
    icon:"lighting",
    display:"fullscreen",
    orientation:"portrait"
  });
  manifest.icons = [{ src:"/app-icons/lighting.svg", sizes:"any", type:"image/svg+xml", purpose:"any" }];
  return manifest;
}

function kalaManifest() {
  return appManifest({
    name:"Wetware Kala Face Controller",
    shortName:"Kala Face",
    startUrl:"/kala/",
    scope:"/kala/",
    icon:"kala",
    display:"fullscreen",
    orientation:"any"
  });
}

function appManifest({ name, shortName, startUrl, scope = "/", icon, display = "standalone", orientation = "landscape" }) {
  return {
    id:startUrl,
    name,
    short_name:shortName,
    start_url:startUrl,
    scope,
    display,
    display_override:[display,"standalone"],
    orientation,
    background_color:"#000000",
    theme_color:"#000000",
    icons:[
      { src:`/app-icons/${icon}-192.png`, sizes:"192x192", type:"image/png" },
      { src:`/app-icons/${icon}-512.png`, sizes:"512x512", type:"image/png", purpose:"any maskable" }
    ]
  };
}

async function sendAquariumPage(response, url) {
  const pathDevice = url.pathname.match(/^\/ipad\/([123])\//)?.[1];
  const queryDevice = /^ipad-[123]$/.test(url.searchParams.get("device") || "") ? url.searchParams.get("device").slice(-1) : null;
  const number = pathDevice || queryDevice || "1";
  const reflect = ["x", "y", "xy"].includes(url.searchParams.get("reflect")) ? `&reflect=${url.searchParams.get("reflect")}` : "";
  const template = await readFile(path.join(publicRoot, "ipad", "index.html"), "utf8");
  let html = template
    .replace("/api/manifest/aquarium?device=ipad-1", `/api/manifest/aquarium?device=ipad-${number}${reflect}`)
    .replace("<title>Wetware — Aquarium</title>", `<meta name="apple-mobile-web-app-title" content="Aquarium ${number}">\n  <title>Wetware — Aquarium ${number}</title>`);
  response.writeHead(200, { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store" });
  response.end(html);
}

function sendText(response, code, value) {
  response.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(value);
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".cer": "application/x-x509-ca-cert", ".pem": "application/x-pem-file", ".mp4": "video/mp4", ".m4a": "audio/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav"
  })[ext] || "application/octet-stream";
}

function localAddresses() {
  const addresses = new Set();
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) if (item.family === "IPv4" && !item.internal) addresses.add(item.address);
  }
  return [...addresses].sort((a, b) => addressPriority(a) - addressPriority(b) || a.localeCompare(b));
}

function addressPriority(address) {
  if (/^192\.168\./.test(address)) return 0;
  if (/^10\./.test(address)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(address)) return 4;
  return 3;
}

async function mediaPreflight() {
  const assets = await Promise.all(assetManifest.map(async (asset) => {
    const filePath = path.join(publicRoot, asset.path);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) return { ...asset, present: false, valid: false, ready: false, bytes: 0, errors: ["NOT A FILE"], dependencies: [] };
      const errors = [];
      const dependencies = [];
      if (info.size === 0) errors.push("EMPTY FILE");
      if (asset.kind === "json" && info.size > 0) {
        try {
          const normalized = validateMediaJson(asset.validator, JSON.parse(await readFile(filePath, "utf8")));
          const dependentImages = [...(normalized.slides || []).map((slide) => slide.image), ...(normalized.images || [])].filter(Boolean);
          for (const imagePath of dependentImages) {
            let relative;
            try {
              relative = resolveMediaAssetPath(imagePath, asset.path);
            } catch (error) {
              errors.push(`INVALID IMAGE PATH: ${imagePath} · ${error.message}`);
            }
            const dependency = { path: relative || imagePath, present: false, bytes: 0 };
            if (relative) {
              try {
                const dependencyInfo = await stat(path.join(publicRoot, relative));
                dependency.present = dependencyInfo.isFile() && dependencyInfo.size > 0;
                dependency.bytes = dependencyInfo.isFile() ? dependencyInfo.size : 0;
              } catch {}
              if (!dependency.present) errors.push(`MISSING IMAGE: ${relative}`);
            }
            dependencies.push(dependency);
          }
        } catch (error) {
          errors.push(`INVALID JSON: ${error.message}`);
        }
      }
      return { ...asset, present: true, valid: errors.length === 0, ready: errors.length === 0, bytes: info.size, errors, dependencies };
    } catch {
      return { ...asset, present: false, valid: false, ready: false, bytes: 0, errors: ["MISSING FILE"], dependencies: [] };
    }
  }));
  return {
    checkedAt: Date.now(),
    ready: assets.every((asset) => asset.ready),
    readyCount: assets.filter((asset) => asset.ready).length,
    present: assets.filter((asset) => asset.present).length,
    missing: assets.filter((asset) => !asset.present).length,
    invalid: assets.filter((asset) => asset.present && !asset.valid).length,
    assets
  };
}
