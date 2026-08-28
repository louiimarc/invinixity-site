export function sanitizeTelemetry(candidate = {}) {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
  const displayModes = new Set(["browser", "standalone", "fullscreen", "minimal-ui"]);
  const orientations = new Set(["portrait", "landscape", "unknown"]);
  const displayMode = displayModes.has(candidate.displayMode) ? candidate.displayMode : "browser";
  const orientation = orientations.has(candidate.orientation) ? candidate.orientation : "unknown";
  const telemetry = {
    width: Math.round(clamp(candidate.width, 1, 10000)),
    height: Math.round(clamp(candidate.height, 1, 10000)),
    dpr: clamp(candidate.dpr, 0.5, 5),
    fullscreen: Boolean(candidate.fullscreen),
    visible: Boolean(candidate.visible),
    secureContext: Boolean(candidate.secureContext),
    displayMode,
    orientation,
    rtt: candidate.rtt == null ? null : Math.round(clamp(candidate.rtt, 0, 5000)),
    path: String(candidate.path || "").slice(0, 80)
  };
  if (candidate.mediaProbe && typeof candidate.mediaProbe === "object") telemetry.mediaProbe = sanitizeMediaProbe(candidate.mediaProbe, clamp);
  if (candidate.cameraInput && typeof candidate.cameraInput === "object") {
    telemetry.cameraInput = {
      ready: Boolean(candidate.cameraInput.ready),
      label: String(candidate.cameraInput.label || "").slice(0, 80),
      error: String(candidate.cameraInput.error || "").slice(0, 120)
    };
  }
  return telemetry;
}

function sanitizeMediaProbe(candidate, clamp) {
  const allowedStatuses = new Set(["checking", "ready", "failed"]);
  return {
    status: allowedStatuses.has(candidate.status) ? candidate.status : "checking",
    checked: Math.round(clamp(candidate.checked, 0, 100)),
    total: Math.round(clamp(candidate.total, 0, 100)),
    failed: Math.round(clamp(candidate.failed, 0, 100)),
    checkedAt: Math.max(0, Math.round(Number(candidate.checkedAt) || 0)),
    failures: [...new Set(Array.isArray(candidate.failures) ? candidate.failures : [])]
      .slice(0, 20)
      .map((value) => String(value).slice(0, 50))
  };
}
