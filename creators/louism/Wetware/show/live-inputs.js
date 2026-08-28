const GAMEPAD_TTL_MS = 1500;
const KALA_TTL_MS = 2000;
const IDENTIFY_DURATION_MS = 20000;

export function createLiveInputStore() {
  const records = new Map();

  function set(input, receivedAt = Date.now()) {
    if (!input) return;
    records.set(inputKey(input), { input:structuredClone(input), receivedAt:Number(receivedAt) || 0 });
  }

  function snapshot(now = Date.now()) {
    expire(now);
    return [...records.values()].map(({ input }) => structuredClone(input));
  }

  function expire(now = Date.now()) {
    const expired = [];
    for (const [key, record] of records) {
      const { input, receivedAt } = record;
      if (input.source === "gamepad" && input.active && now - receivedAt > GAMEPAD_TTL_MS) {
        const inactive = {
          ...input,
          active:false,
          axisX:0, axisY:0, axisZ:0, axisRX:0,
          leftTrigger:0, rightTrigger:0,
          leftBumper:false, rightBumper:false, start:false
        };
        records.set(key, { input:inactive, receivedAt:now });
        expired.push(structuredClone(inactive));
      }
      if (input.source === "identify" && input.active && now - input.startedAt >= IDENTIFY_DURATION_MS) {
        const inactive = { ...input, active:false };
        records.set(key, { input:inactive, receivedAt:now });
        expired.push(structuredClone(inactive));
      }
      if(input.source==="kala" && input.active && now-receivedAt>KALA_TTL_MS) {
        const inactive={ ...input,active:false };
        records.set(key,{ input:inactive,receivedAt:now });
        expired.push(structuredClone(inactive));
      }
    }
    return expired;
  }

  return { set, snapshot, expire };
}

function inputKey(input) {
  return input.source === "midi" ? `midi:${input.mapping}:${input.cc}` : input.source;
}

export const liveInputTiming = Object.freeze({
  gamepadTtlMs:GAMEPAD_TTL_MS,
  kalaTtlMs:KALA_TTL_MS,
  identifyDurationMs:IDENTIFY_DURATION_MS
});
