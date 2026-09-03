const expectedDevices = [
  { deviceId: "ipad-1", label: "iPad 1" },
  { deviceId: "ipad-2", label: "iPad 2" },
];

let config = null;
let devices = [];
let acknowledgements = new Map();
let eventSource = null;

const $ = (id) => document.getElementById(id);

function kioskConnections(deviceId) {
  return devices.filter(
    (device) => device.role == "kiosk" && device.deviceId == deviceId,
  );
}

function latestDeviceState(deviceId) {
  return acknowledgements.get(deviceId)?.state || {};
}

function deviceStateText(deviceId) {
  let state = latestDeviceState(deviceId);
  let modes = [];
  if (state.seedMode) modes.push("π seed on");
  if (state.moderationOpen) modes.push("∑ gallery open");
  if (modes.length > 0) return modes.join(" · ");
  return state.mode ? `Scene: ${state.mode}` : "Waiting for first command";
}

function renderDevices() {
  let cards = expectedDevices.map(({ deviceId, label }) => {
    let connections = kioskConnections(deviceId);
    let card = document.createElement("article");
    card.className = "device";
    let heading = document.createElement("div");
    heading.className = "device-heading";
    let dot = document.createElement("i");
    dot.className = `status-dot ${connections.length > 0 ? "online" : ""}`;
    let name = document.createElement("span");
    name.textContent = label;
    heading.append(dot, name);
    let status = document.createElement("small");
    status.textContent = connections.length == 0
      ? "Offline"
      : connections.length == 1
        ? "Online"
        : `Online · ${connections.length} tabs`;
    let state = document.createElement("small");
    state.className = "state";
    state.textContent = deviceStateText(deviceId);
    card.append(heading, status, state);
    return card;
  });
  $("devices").replaceChildren(...cards);
}

async function qrDataUrl(text) {
  if (window.QRCode?.toDataURL == null) return "";
  return QRCode.toDataURL(text, {
    width: 520,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#1D1D1D", light: "#FFFFFF" },
  });
}

async function copyText(text) {
  if (navigator.clipboard?.writeText != null) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      // HTTP .local pages may not receive the secure-context clipboard API.
    }
  }
  let input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  let copied = document.execCommand("copy");
  input.remove();
  return copied;
}

async function renderJoinLinks() {
  let cards = [];
  for (let link of config.kioskLinks || []) {
    let card = document.createElement("article");
    card.className = "join-card";
    let title = document.createElement("h3");
    title.textContent = link.label;
    let image = document.createElement("img");
    image.alt = `QR code for ${link.label}`;
    image.src = await qrDataUrl(link.url);
    let anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.textContent = link.url;
    let copy = document.createElement("button");
    copy.className = "copy";
    copy.type = "button";
    copy.textContent = "Copy URL";
    copy.addEventListener("click", async () => {
      copy.textContent = await copyText(link.url) ? "Copied" : "Open URL above";
      setTimeout(() => copy.textContent = "Copy URL", 1200);
    });
    card.append(title, image, anchor, copy);
    cards.push(card);
  }
  $("join-links").replaceChildren(...cards);

  let alternatives = (config.fallbackOrigins || []).map((origin) => {
    let paragraph = document.createElement("p");
    paragraph.textContent = `${origin}/device/1/  ·  ${origin}/device/2/`;
    return paragraph;
  });
  $("fallback-origins").replaceChildren(...alternatives);
  $("fallback-details").hidden = alternatives.length == 0;
}

function updateConnection(online) {
  $("connection").classList.toggle("online", online);
  $("connection").querySelector("span").textContent = online
    ? "Mac online"
    : "Reconnecting";
}

function mergeAcknowledgement(acknowledgement) {
  acknowledgements.set(acknowledgement.deviceId, acknowledgement);
  renderDevices();
  let result = acknowledgement.applied ? "Applied" : "Not available in this scene";
  $("feedback").className = `feedback ${acknowledgement.applied ? "" : "error"}`;
  $("feedback").textContent = `${acknowledgement.deviceId}: ${result}`;
}

function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource(
    "/api/local-control/events?role=controller&device=phone-controller",
  );
  eventSource.addEventListener("welcome", () => updateConnection(true));
  eventSource.addEventListener("devices", (event) => {
    devices = JSON.parse(event.data).devices || [];
    renderDevices();
  });
  eventSource.addEventListener("ack", (event) => {
    mergeAcknowledgement(JSON.parse(event.data));
  });
  eventSource.onerror = () => updateConnection(false);
}

async function refreshStatus() {
  let response = await fetch("/api/local-control/status", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read kiosk status");
  let payload = await response.json();
  devices = payload.devices || [];
  for (let acknowledgement of payload.acknowledgements || []) {
    acknowledgements.set(acknowledgement.deviceId, acknowledgement);
  }
  renderDevices();
}

async function sendAction(action) {
  let target = $("target").value;
  $("feedback").className = "feedback";
  $("feedback").textContent = "Sending...";
  let response = await fetch("/api/local-control/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, target }),
  });
  let payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Control action failed");
  $("feedback").textContent = payload.sent > 0
    ? `Sent to ${payload.sent} online kiosk${payload.sent == 1 ? "" : "s"}.`
    : "No matching kiosk is online.";
  $("feedback").classList.toggle("error", payload.sent == 0);
}

async function setup() {
  try {
    let response = await fetch("/api/local-control/config", { cache: "no-store" });
    if (!response.ok) throw new Error("Local controller is unavailable");
    config = await response.json();
    await renderJoinLinks();
    await refreshStatus();
    connectEvents();
  } catch (error) {
    updateConnection(false);
    $("feedback").className = "feedback error";
    $("feedback").textContent = error.message;
  }

  $("refresh").addEventListener("click", () => refreshStatus().catch(() => {}));
  for (let button of document.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => {
      sendAction(button.dataset.action).catch((error) => {
        $("feedback").className = "feedback error";
        $("feedback").textContent = error.message;
      });
    });
  }
}

setup();
