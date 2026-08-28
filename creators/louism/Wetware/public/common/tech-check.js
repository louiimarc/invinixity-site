const EXPECTED_RENDERERS = [
  { deviceId: "mac-projector-wall", role: "projector", label: "BACK WALL PROJECTOR" },
  { deviceId: "mac-projector-floor", role: "projector", label: "TOP-DOWN FLOOR PROJECTOR" },
  { deviceId: "ipad-1", role: "ipad", label: "IPAD 1" },
  { deviceId: "ipad-2", role: "ipad", label: "IPAD 2" },
  { deviceId: "ipad-3", role: "ipad", label: "IPAD 3" }
];

export function evaluateTechnicalCheck({
  devices = [],
  assetReport = null,
  operatorRtt = null,
  gamepadConnected = false,
  ipadOrderConfirmed = false,
  midiEnabled = false,
  now = Date.now()
} = {}) {
  const checks = [];
  const expectedIds = new Set(EXPECTED_RENDERERS.map((item) => item.deviceId));

  for (const expected of EXPECTED_RENDERERS) {
    const matches = devices.filter((device) => device.deviceId === expected.deviceId);
    const exactRole = matches.filter((device) => device.role === expected.role);
    checks.push(required(
      `device-${expected.deviceId}`,
      expected.label,
      matches.length === 1 && exactRole.length === 1,
      matches.length === 0 ? "MISSING" : matches.length > 1 ? `${matches.length} DUPLICATES` : exactRole.length ? "CONNECTED" : `WRONG ROLE: ${matches[0].role}`
    ));
    if (exactRole.length === 1) {
      const device = exactRole[0];
      const age = Math.max(0, now - Number(device.lastSeen || 0));
      checks.push(required(`heartbeat-${expected.deviceId}`, `${expected.label} HEARTBEAT`, age <= 7000, `${Math.round(age)} ms AGO`));
      checks.push(required(`visible-${expected.deviceId}`, `${expected.label} VISIBLE`, device.telemetry?.visible === true, device.telemetry?.visible ? "VISIBLE" : "HIDDEN / UNKNOWN"));
      checks.push(required(
        `display-${expected.deviceId}`,
        `${expected.label} DISPLAY MODE`,
        device.telemetry?.fullscreen === true,
        `${device.telemetry?.width || "?"}×${device.telemetry?.height || "?"} · ${String(device.telemetry?.displayMode || "unknown").toUpperCase()}`
      ));
      const rtt = device.telemetry?.rtt;
      checks.push(required(`latency-${expected.deviceId}`, `${expected.label} RTT`, Number.isFinite(rtt) && rtt <= 120, Number.isFinite(rtt) ? `${rtt} ms` : "WAITING FOR PING"));
    }
  }

  const unexpectedDuplicates = [...expectedIds].filter((deviceId) => devices.filter((device) => device.deviceId === deviceId).length > 1);
  checks.push(required("unique-devices", "UNIQUE DEVICE IDENTITIES", unexpectedDuplicates.length === 0, unexpectedDuplicates.length ? unexpectedDuplicates.join(", ") : "NO DUPLICATES"));
  checks.push(required("ipad-order", "PHYSICAL IPAD ORDER", ipadOrderConfirmed, ipadOrderConfirmed ? "CONFIRMED · 1 LEFT · 2 CENTER · 3 RIGHT" : "RUN IPAD ORDER TEST AND CONFIRM"));
  checks.push(required("media", "PRODUCTION MEDIA", Boolean(assetReport?.ready), assetReport ? `${assetReport.readyCount ?? assetReport.present}/${assetReport.assets?.length || 0} VALID · ${assetReport.missing} MISSING · ${assetReport.invalid || 0} INVALID` : "PREFLIGHT UNAVAILABLE"));
  const expectedMedia = assetReport?.assets?.length || 0;
  const projectorProbes = [
    ["WALL", devices.find((device) => device.deviceId === "mac-projector-wall" && device.role === "projector")?.telemetry?.mediaProbe],
    ["FLOOR", devices.find((device) => device.deviceId === "mac-projector-floor" && device.role === "projector")?.telemetry?.mediaProbe]
  ];
  const probeResults = projectorProbes.map(([label, mediaProbe]) => projectorProbeResult(label, mediaProbe, expectedMedia, now));
  checks.push(required("media-decode", "BOTH PROJECTORS MEDIA DECODE", probeResults.every((result) => result.ready), probeResults.map((result) => result.detail).join(" · ")));
  checks.push(required("gamepad", "GAMEPAD", gamepadConnected, gamepadConnected ? "CONNECTED" : "MISSING"));
  checks.push(required("operator-rtt", "OPERATOR RTT", Number.isFinite(operatorRtt) && operatorRtt <= 120, Number.isFinite(operatorRtt) ? `${Math.round(operatorRtt)} ms` : "WAITING FOR PING"));

  checks.push(advisory("midi", "WEBMIDI", midiEnabled ? "ENABLED" : "OPTIONAL · VIRTUAL CC AVAILABLE", midiEnabled));

  const failedRequired = checks.filter((check) => check.severity === "required" && check.status !== "pass");
  const warnings = checks.filter((check) => check.status === "warn");
  return {
    ready: failedRequired.length === 0,
    checkedAt: now,
    checks,
    passed: checks.filter((check) => check.status === "pass").length,
    failed: failedRequired.length,
    warnings: warnings.length
  };
}

function projectorProbeResult(label, mediaProbe, expectedMedia, now) {
  if (!mediaProbe) return { ready:false, detail:`${label}: PROBE UNAVAILABLE` };
  const age = mediaProbe.checkedAt ? Math.max(0, now - mediaProbe.checkedAt) : Infinity;
  const ready = mediaProbe.status === "ready"
    && mediaProbe.failed === 0
    && mediaProbe.checked === expectedMedia
    && mediaProbe.total === expectedMedia
    && age <= 90000;
  if (mediaProbe.status === "checking") return { ready:false, detail:`${label}: ${mediaProbe.checked}/${mediaProbe.total} IN PROGRESS` };
  if (mediaProbe.status === "ready" && age > 90000) return { ready:false, detail:`${label}: STALE · ${Math.round(age / 1000)}s OLD` };
  return { ready, detail:`${label}: ${mediaProbe.checked}/${mediaProbe.total} · ${mediaProbe.failed} FAILED${mediaProbe.failures?.length ? ` · ${mediaProbe.failures.join(", ")}` : ""}` };
}

function required(id, label, pass, detail) {
  return { id, label, severity: "required", status: pass ? "pass" : "fail", detail };
}

function advisory(id, label, detail, pass) {
  return { id, label, severity: "advisory", status: pass ? "pass" : "warn", detail };
}
