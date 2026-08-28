export function decodeControlChange(data) {
  if (!data || data.length < 3) return null;
  const status = Number(data[0]) & 0xff;
  if ((status & 0xf0) !== 0xb0) return null;
  const cc = clamp7(data[1]);
  const value = clamp7(data[2]);
  return { channel: (status & 0x0f) + 1, cc, value, normalized: value / 127 };
}

export function cueIndexFromCC(value, cueCount) {
  if (!Number.isInteger(cueCount) || cueCount < 1) return 0;
  return Math.min(cueCount - 1, Math.floor(clamp7(value) / 127 * cueCount));
}

function clamp7(value) {
  return Math.min(127, Math.max(0, Number(value) || 0));
}
