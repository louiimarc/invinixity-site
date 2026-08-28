export const EMERGENCY_CHANNEL = "wetware-emergency-v1";

export function emergencyBlackoutMessage(value, sentAt = Date.now()) {
  return { type:"SET_EMERGENCY_BLACKOUT", value:Boolean(value), sentAt:Math.max(0, Math.round(Number(sentAt) || 0)) };
}

export function normalizeEmergencyMessage(candidate) {
  if (!candidate || candidate.type !== "SET_EMERGENCY_BLACKOUT" || typeof candidate.value !== "boolean") return null;
  return emergencyBlackoutMessage(candidate.value, candidate.sentAt);
}

export function effectiveBlackout(authoritative, override = null) {
  return override === null ? Boolean(authoritative) : Boolean(override);
}

export function reconcileEmergencyBlackout(override, authoritative) {
  if (override === null) return null;
  return Boolean(override) === Boolean(authoritative) ? null : Boolean(override);
}
