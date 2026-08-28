export const SURFACE_ORDER = ["screen", "floor"];

export const SURFACE_LABELS = {
  screen: "BACK WALL PLANE",
  floor: "TOP-DOWN FLOOR PLANE"
};

export const DEFAULT_SURFACES = {
  screen: [[0, 0], [1, 0], [1, 1], [0, 1]],
  floor: [[0, 0], [1, 0], [1, 1], [0, 1]]
};

export function cloneDefaultSurfaces() {
  return Object.fromEntries(SURFACE_ORDER.map((name) => [name, DEFAULT_SURFACES[name].map((point) => [...point])]));
}

export function cueSurface(cue) {
  if (SURFACE_ORDER.includes(cue?.surface)) return cue.surface;
  if (cue?.target) return "floor";
  if (["loading", "spreadsheet", "anatomy", "organs"].includes(cue?.projector)) return "floor";
  return "screen";
}
