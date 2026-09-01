const PLAYSPACE_LOCAL_DEVICE_KEY = "playspace.local-device.v1";

function playSpaceRunsOnLocalKioskHost() {
  let hostname = window.location.hostname;
  if (hostname == "localhost" || hostname == "127.0.0.1") return true;
  if (hostname.endsWith(".local")) return true;
  let parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length != 4 || !parts.every(Number.isFinite)) return false;
  return parts[0] == 10 ||
    (parts[0] == 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] == 192 && parts[1] == 168);
}

function playSpaceLocalDeviceId() {
  let requested = new URLSearchParams(window.location.search).get("device");
  if (/^ipad-[12]$/.test(requested || "")) {
    try {
      localStorage.setItem(PLAYSPACE_LOCAL_DEVICE_KEY, requested);
    } catch (error) {
      console.warn("Unable to remember PlaySpace device identity", error);
    }
    return requested;
  }
  try {
    let saved = localStorage.getItem(PLAYSPACE_LOCAL_DEVICE_KEY);
    if (/^ipad-[12]$/.test(saved || "")) return saved;
  } catch (error) {
    console.warn("Unable to restore PlaySpace device identity", error);
  }
  return "kiosk-local";
}

function playSpaceLocalControlState() {
  return {
    mode: scene?.session?.mode || "unknown",
    seedMode: scene?.secretSession?.enabled === true,
    demoOpen: scene?.secretDemo?.open === true,
    moderationOpen: scene?.homeGallery?.moderation?.open === true,
  };
}

function applyPlaySpaceLocalControlAction(action) {
  if (action == "toggle-seed") return toggleSecretSessionMode();
  if (action == "open-moderation") {
    return scene.homeGallery.moderation.open || openHomeGalleryModeration();
  }
  return false;
}

function acknowledgePlaySpaceLocalControl(deviceId, message, applied) {
  fetch("/api/local-control/ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      actionId: message.actionId,
      action: message.action,
      deviceId,
      applied,
      state: playSpaceLocalControlState(),
    }),
  }).catch((error) => {
    console.warn("Unable to acknowledge PlaySpace control action", error);
  });
}

function connectPlaySpaceLocalControl() {
  if (!playSpaceRunsOnLocalKioskHost() || typeof EventSource == "undefined") {
    return;
  }
  let deviceId = playSpaceLocalDeviceId();
  document.documentElement.dataset.playspaceDevice = deviceId;
  let events = new EventSource(
    `/api/local-control/events?role=kiosk&device=${encodeURIComponent(deviceId)}`,
  );
  events.addEventListener("action", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      return;
    }
    let applied = false;
    try {
      applied = applyPlaySpaceLocalControlAction(message.action) === true;
    } catch (error) {
      console.warn("Unable to apply PlaySpace control action", error);
    }
    acknowledgePlaySpaceLocalControl(deviceId, message, applied);
  });
  events.addEventListener("error", () => {
    document.documentElement.dataset.playspaceControl = "reconnecting";
  });
  events.addEventListener("welcome", () => {
    document.documentElement.dataset.playspaceControl = "online";
  });
  window.addEventListener("beforeunload", () => events.close(), { once: true });
}

window.addEventListener("load", connectPlaySpaceLocalControl, { once: true });
