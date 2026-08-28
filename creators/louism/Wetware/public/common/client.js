export function connectShowClient({ role, deviceId, onState, onDevices, onInput, onInputSnapshot, onConnection, onTiming, getTelemetry }) {
  let socket;
  let retryTimer;
  let pingTimer;
  let serverOffset = 0;
  let latestState = null;
  let latestRtt = null;
  let devServerInstanceId = null;

  const api = {
    sendAction(action) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ACTION", action }));
    },
    sendInput(input) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "INPUT", input }));
    },
    sendMappingAction(action) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "MAPPING_ACTION", action }));
    },
    getState: () => latestState,
    serverNow: () => Date.now() + serverOffset,
    getTiming: () => ({ rtt: latestRtt, serverOffset }),
    refreshTelemetry: sendTelemetry,
    reconnect: connect
  };

  function connect() {
    clearTimeout(retryTimer);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}/ws`);
    onConnection?.("connecting");

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "HELLO", role, deviceId, telemetry: telemetryPayload() }));
      onConnection?.("online");
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "PING", sentAt: Date.now() }));
      }, 4000);
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "DEV_RELOAD") {
        location.reload();
        return;
      }
      if (message.type === "WELCOME") {
        const devReload = devReloadDecision(devServerInstanceId, message.dev);
        devServerInstanceId = devReload.instanceId;
        if (devReload.reload) {
          location.reload();
          return;
        }
      }
      if (message.serverTime) serverOffset = message.serverTime - Date.now();
      if (message.type === "WELCOME" || message.type === "STATE") {
        if (message.type === "WELCOME") {
          const inputs = message.inputs || [];
          if (onInputSnapshot) onInputSnapshot(inputs, message);
          else for (const input of inputs) onInput?.(input, message);
        }
        latestState = message.state;
        onState?.(message.state, message);
      }
      if (message.type === "DEVICES") onDevices?.(message.devices);
      if (message.type === "INPUT") onInput?.(message.input, message);
      if (message.type === "PONG") {
        latestRtt = Math.max(0, Date.now() - Number(message.sentAt || Date.now()));
        serverOffset = Number(message.serverTime || Date.now()) + latestRtt / 2 - Date.now();
        onTiming?.({ rtt: latestRtt, serverOffset });
        sendTelemetry();
      }
    });

    socket.addEventListener("close", () => {
      clearInterval(pingTimer);
      onConnection?.("offline");
      retryTimer = setTimeout(connect, 1200);
    });

    socket.addEventListener("error", () => socket.close());
  }

  function sendTelemetry() {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "TELEMETRY", telemetry: telemetryPayload() }));
  }

  function telemetryPayload() {
    const standalone = Boolean(navigator.standalone || window.matchMedia?.("(display-mode: standalone)").matches);
    const fullscreen = Boolean(document.fullscreenElement || window.matchMedia?.("(display-mode: fullscreen)").matches || navigator.standalone);
    const extra = getTelemetry?.();
    return {
      width: Math.round(innerWidth * (devicePixelRatio || 1)),
      height: Math.round(innerHeight * (devicePixelRatio || 1)),
      dpr: devicePixelRatio || 1,
      fullscreen,
      visible: document.visibilityState === "visible",
      secureContext: isSecureContext,
      displayMode: fullscreen ? "fullscreen" : standalone ? "standalone" : "browser",
      orientation: innerWidth >= innerHeight ? "landscape" : "portrait",
      rtt: latestRtt,
      path: location.pathname + location.search,
      ...(extra && typeof extra === "object" ? extra : {})
    };
  }

  let telemetryTimer;
  const scheduleTelemetry = () => {
    clearTimeout(telemetryTimer);
    telemetryTimer = setTimeout(sendTelemetry, 120);
  };
  addEventListener("resize", scheduleTelemetry);
  document.addEventListener("fullscreenchange", scheduleTelemetry);
  document.addEventListener("visibilitychange", scheduleTelemetry);

  connect();
  return api;
}

export function devReloadDecision(previousInstanceId, dev = {}) {
  const nextInstanceId = dev?.autoReload && typeof dev.instanceId === "string" ? dev.instanceId : null;
  return {
    instanceId: nextInstanceId,
    reload: Boolean(previousInstanceId && nextInstanceId && previousInstanceId !== nextInstanceId)
  };
}
