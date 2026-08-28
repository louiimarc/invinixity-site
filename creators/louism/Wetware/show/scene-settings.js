export const DEFAULT_KALA_FACE = Object.freeze({ x:.5, y:.5, scale:.42 });
export const MAX_STONE_MASK_POINTS = 512;
export const SETUP_PREVIEWS = Object.freeze(["off", "kala-face", "stone-mask"]);

export function normalizeKalaFace(candidate = {}) {
  const legacyScale = candidate.height ?? candidate.width;
  return {
    x:clamp(candidate.x, 0, 1, DEFAULT_KALA_FACE.x),
    y:clamp(candidate.y, 0, 1, DEFAULT_KALA_FACE.y),
    scale:clamp(candidate.scale ?? legacyScale, .03, 1, DEFAULT_KALA_FACE.scale)
  };
}

export function normalizeProjectorPointer(clientX,clientY,windowWidth,windowHeight) {
  return {
    x:clamp(Number(clientX)/Math.max(1,Number(windowWidth)||1),0,1,.5),
    y:clamp(Number(clientY)/Math.max(1,Number(windowHeight)||1),0,1,.5)
  };
}

export function normalizeStoneMask(candidate = []) {
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [[clamp(x, 0, 1, 0), clamp(y, 0, 1, 0)]];
  }).slice(0, MAX_STONE_MASK_POINTS);
}

export function stoneMaskBounds(candidate = []) {
  const points = normalizeStoneMask(candidate);
  if (points.length < 3) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([,y]) => y);
  const x = Math.min(...xs), y = Math.min(...ys);
  const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
  if (width < .001 || height < .001) return null;
  return { x, y, width, height };
}

export function normalizeSetupPreview(value) {
  return SETUP_PREVIEWS.includes(value) ? value : "off";
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}
