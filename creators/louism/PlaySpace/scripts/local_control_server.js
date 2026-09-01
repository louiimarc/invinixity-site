const crypto = require("crypto");
const os = require("os");

const MAXIMUM_JSON_BYTES = 32 * 1024;
const VALID_DEVICE_ID = /^[A-Za-z0-9_-]{1,50}$/;
const VALID_ACTIONS = new Set([
  "toggle-seed",
  "open-moderation",
]);

function privateIpv4Addresses() {
  let addresses = [];
  for (let entries of Object.values(os.networkInterfaces())) {
    for (let entry of entries || []) {
      if (entry.family != "IPv4" || entry.internal) continue;
      let parts = entry.address.split(".").map(Number);
      let privateAddress = parts[0] == 10 ||
        (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] == 192 && parts[1] == 168);
      if (privateAddress) addresses.push(entry.address);
    }
  }
  return [...new Set(addresses)];
}

function localOrigins(port, localHostname, protocol) {
  return [
    `${protocol}://${localHostname}:${port}`,
    ...privateIpv4Addresses().map(
      (address) => `${protocol}://${address}:${port}`,
    ),
  ];
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size <= MAXIMUM_JSON_BYTES) chunks.push(chunk);
      else reject(new Error("Request is too large"));
    });
    request.on("end", () => {
      if (size > MAXIMUM_JSON_BYTES) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function writeEvent(response, type, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function createLocalControl({ port, localHostname, protocol = "http", sendJson }) {
  let clients = new Map();
  let latestAcknowledgements = new Map();

  let origins = localOrigins(port, localHostname, protocol);
  let primaryOrigin = origins[0];
  let kioskLinks = [1, 2].map((number) => ({
    deviceId: `ipad-${number}`,
    label: `iPad ${number}`,
    url: `${primaryOrigin}/?device=ipad-${number}`,
  }));

  function deviceSnapshot() {
    let now = Date.now();
    return [...clients.values()].map((client) => ({
      id: client.id,
      role: client.role,
      deviceId: client.deviceId,
      connectedAt: client.connectedAt,
      lastSeen: now,
      metadata: client.metadata,
    }));
  }

  function broadcast(type, payload, predicate = () => true) {
    for (let client of clients.values()) {
      if (predicate(client)) writeEvent(client.response, type, payload);
    }
  }

  function broadcastDevices() {
    broadcast("devices", { devices: deviceSnapshot(), serverTime: Date.now() });
  }

  async function handle(request, response, url) {
    if (request.method == "GET" && url.pathname == "/api/local-control/config") {
      sendJson(response, 200, {
        controlUrl: `${primaryOrigin}/control/`,
        kioskLinks,
        fallbackOrigins: origins.slice(1),
      });
      return true;
    }

    if (request.method == "GET" && url.pathname == "/api/local-control/status") {
      sendJson(response, 200, {
        devices: deviceSnapshot(),
        acknowledgements: [...latestAcknowledgements.values()],
        serverTime: Date.now(),
      });
      return true;
    }

    if (request.method == "GET" && url.pathname == "/api/local-control/events") {
      let role = url.searchParams.get("role") == "controller"
        ? "controller"
        : "kiosk";
      let fallbackId = role == "controller" ? "phone-controller" : "kiosk-local";
      let requestedId = url.searchParams.get("device") || fallbackId;
      let deviceId = VALID_DEVICE_ID.test(requestedId) ? requestedId : fallbackId;
      let id = crypto.randomUUID();
      let client = {
        id,
        role,
        deviceId,
        connectedAt: Date.now(),
        metadata: {
          userAgent: String(request.headers["user-agent"] || "").slice(0, 180),
        },
        response,
      };
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      });
      response.write(": PlaySpace local control\n\n");
      clients.set(id, client);
      writeEvent(response, "welcome", {
        id,
        deviceId,
        role,
        serverTime: Date.now(),
      });
      broadcastDevices();
      request.on("close", () => {
        clients.delete(id);
        broadcastDevices();
      });
      return true;
    }

    if (request.method == "POST" && url.pathname == "/api/local-control/action") {
      let payload;
      try {
        payload = await readJson(request);
      } catch (error) {
        sendJson(response, 400, { error: "Invalid control action" });
        return true;
      }
      let action = String(payload.action || "");
      let target = String(payload.target || "all");
      if (!VALID_ACTIONS.has(action)) {
        sendJson(response, 400, { error: "Unknown control action" });
        return true;
      }
      if (target != "all" && !VALID_DEVICE_ID.test(target)) {
        sendJson(response, 400, { error: "Invalid target device" });
        return true;
      }
      let actionId = crypto.randomUUID();
      let sent = 0;
      let actionMessage = { actionId, action, target, sentAt: Date.now() };
      for (let client of clients.values()) {
        if (
          client.role != "kiosk" ||
          (target != "all" && client.deviceId != target)
        ) {
          continue;
        }
        writeEvent(client.response, "action", actionMessage);
        sent++;
      }
      sendJson(response, 202, { actionId, action, target, sent });
      return true;
    }

    if (request.method == "POST" && url.pathname == "/api/local-control/ack") {
      let payload;
      try {
        payload = await readJson(request);
      } catch (error) {
        sendJson(response, 400, { error: "Invalid acknowledgement" });
        return true;
      }
      let deviceId = String(payload.deviceId || "");
      let acknowledgement = {
        actionId: String(payload.actionId || "").slice(0, 64),
        action: String(payload.action || "").slice(0, 64),
        deviceId: VALID_DEVICE_ID.test(deviceId) ? deviceId : "unknown",
        applied: payload.applied === true,
        state: payload.state || {},
        receivedAt: Date.now(),
      };
      latestAcknowledgements.set(acknowledgement.deviceId, acknowledgement);
      broadcast("ack", acknowledgement, (client) => client.role == "controller");
      sendJson(response, 200, { ok: true });
      return true;
    }

    return false;
  }

  let heartbeat = setInterval(() => {
    broadcast("ping", { serverTime: Date.now() });
  }, 15000);
  heartbeat.unref();

  return {
    controlUrl: `${primaryOrigin}/control/`,
    handle,
    kioskLinks,
  };
}

module.exports = { createLocalControl };
