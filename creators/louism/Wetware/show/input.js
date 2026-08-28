export function sanitizeLiveInput(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.source === "gamepad") return {
    source: "gamepad",
    active: Boolean(candidate.active),
    x: clamp(candidate.x, 0, 1),
    y: clamp(candidate.y, 0, 1),
    z: clamp(candidate.z ?? .5, 0, 1),
    axisX: clamp(candidate.axisX ?? 0, -1, 1),
    axisY: clamp(candidate.axisY ?? 0, -1, 1),
    axisZ: clamp(candidate.axisZ ?? 0, -1, 1),
    axisRX: clamp(candidate.axisRX ?? 0, -1, 1),
    leftTrigger: clamp(candidate.leftTrigger ?? 0, 0, 1),
    rightTrigger: clamp(candidate.rightTrigger ?? 0, 0, 1),
    leftBumper: Boolean(candidate.leftBumper),
    rightBumper: Boolean(candidate.rightBumper),
    start: Boolean(candidate.start)
  };
  if (candidate.source === "midi") return {
    source: "midi",
    cc: Math.round(clamp(candidate.cc, 0, 127)),
    value: Math.round(clamp(candidate.value, 0, 127)),
    normalized: clamp(candidate.normalized, 0, 1),
    mapping: String(candidate.mapping || "unmapped").slice(0, 30)
  };
  if (candidate.source === "identify") return {
    source: "identify",
    active: Boolean(candidate.active),
    startedAt: Math.round(clamp(candidate.startedAt, 0, 1_000_000_000_000_000))
  };
  if(candidate.source==="kala") return {
    source:"kala",
    active:Boolean(candidate.active),
    x:clamp(candidate.x,.0,1),
    y:clamp(candidate.y,.0,1)
  };
  return null;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}
