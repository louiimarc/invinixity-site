import { cues, cueById, cueProgressRange } from "./cues.js";
import { cloneDefaultSurfaces, DEFAULT_SURFACES, SURFACE_ORDER } from "./surfaces.js";
import { nuggetScriptQueue } from "./slideshow.js";
import { DEFAULT_KALA_FACE, normalizeKalaFace, normalizeSetupPreview, normalizeStoneMask } from "./scene-settings.js";

const LEGACY_SINGLE_PROJECTOR_FLOOR = [[.08,.56],[.92,.56],[1,.98],[0,.98]];

export function initialState() {
  return {
    cueId: cues[0].id,
    cueIndex: 0,
    progress: cues[0].progress,
    blackout: cues[0].projector === "black",
    frozen: false,
    calibration: false,
    cameraDeviceId: "",
    cameraDeviceLabel: "",
    kalaFace: { ...DEFAULT_KALA_FACE },
    stoneMask: [],
    stoneMaskDraft: [],
    setupPreview: "off",
    calibrationSurface: "screen",
    surfaces: cloneDefaultSurfaces(),
    pulse: 0,
    nuggetIndex: 0,
    revision: 1,
    updatedAt: Date.now()
  };
}

export function normalizeState(candidate = {}) {
  const fallback = initialState();
  const cue = cueById.get(candidate.cueId) || cueById.get(fallback.cueId);
  const [progressMinimum, progressMaximum] = cueProgressRange(cue);
  const normalized = {
    ...fallback,
    cueId: cue.id,
    cueIndex: cue.index,
    progress: clamp(Number(candidate.progress ?? cue.progress), progressMinimum, progressMaximum),
    blackout: Boolean(candidate.blackout ?? fallback.blackout),
    frozen: Boolean(candidate.frozen),
    calibration: Boolean(candidate.calibration),
    cameraDeviceId: String(candidate.cameraDeviceId || "").slice(0, 256),
    cameraDeviceLabel: String(candidate.cameraDeviceLabel || "").slice(0, 120),
    kalaFace: normalizeKalaFace(candidate.kalaFace),
    stoneMask: normalizeStoneMask(candidate.stoneMask),
    stoneMaskDraft: normalizeStoneMask(candidate.stoneMaskDraft),
    setupPreview: normalizeSetupPreview(candidate.setupPreview),
    calibrationSurface: SURFACE_ORDER.includes(candidate.calibrationSurface) ? candidate.calibrationSurface : "screen",
    surfaces: normalizeSurfaces(candidate.surfaces),
    pulse: Number(candidate.pulse) || 0,
    nuggetIndex: clamp(Math.trunc(Number(candidate.nuggetIndex) || 0), 0, nuggetScriptQueue.length - 1),
    revision: Math.max(1, Number(candidate.revision) || 1),
    updatedAt: Number(candidate.updatedAt) || Date.now()
  };
  return normalized;
}

export function reduceState(current, action) {
  const state = normalizeState(current);
  let next = { ...state };

  switch (action?.type) {
    case "GO":
      next = selectIndex(state, Math.min(state.cueIndex + 1, cues.length - 1));
      break;
    case "BACK":
      next = selectIndex(state, Math.max(state.cueIndex - 1, 0));
      break;
    case "SELECT_CUE": {
      const cue = cueById.get(action.cueId);
      if (cue) next = selectIndex(state, cue.index);
      break;
    }
    case "SET_PROGRESS":
      next.progress = clamp(Number(action.value), ...cueProgressRange(cues[state.cueIndex]));
      break;
    case "TOGGLE_BLACKOUT":
      next.blackout = !state.blackout;
      break;
    case "SET_BLACKOUT":
      next.blackout = Boolean(action.value);
      break;
    case "TOGGLE_FREEZE":
      next.frozen = !state.frozen;
      break;
    case "TOGGLE_CALIBRATION":
      next.calibration = !state.calibration;
      break;
    case "SET_CALIBRATION":
      next.calibration = Boolean(action.value);
      break;
    case "SET_CAMERA_DEVICE":
      next.cameraDeviceId = String(action.deviceId || "").slice(0, 256);
      next.cameraDeviceLabel = String(action.label || "").slice(0, 120);
      break;
    case "SET_KALA_FACE":
      next.kalaFace = normalizeKalaFace({ ...state.kalaFace, ...action.value });
      break;
    case "SET_STONE_MASK":
      next.stoneMask = normalizeStoneMask(action.points);
      next.stoneMaskDraft = [];
      break;
    case "SET_STONE_MASK_DRAFT":
      next.stoneMaskDraft = normalizeStoneMask(action.points);
      break;
    case "CLEAR_STONE_MASK":
      next.stoneMask = [];
      next.stoneMaskDraft = [];
      break;
    case "SET_SETUP_PREVIEW":
      next.setupPreview = normalizeSetupPreview(action.preview);
      break;
    case "SET_CALIBRATION_SURFACE":
      if (SURFACE_ORDER.includes(action.surface)) next.calibrationSurface = action.surface;
      break;
    case "SET_SURFACE_POINT": {
      if (!SURFACE_ORDER.includes(action.surface)) break;
      const corner = Math.max(0, Math.min(3, Number(action.corner) || 0));
      next.surfaces = normalizeSurfaces(state.surfaces);
      next.surfaces[action.surface][corner] = [clamp(Number(action.x), 0, 1), clamp(Number(action.y), 0, 1)];
      break;
    }
    case "RESET_SURFACE":
      if (SURFACE_ORDER.includes(action.surface)) {
        next.surfaces = normalizeSurfaces(state.surfaces);
        next.surfaces[action.surface] = DEFAULT_SURFACES[action.surface].map((point) => [...point]);
      }
      break;
    case "PULSE":
      next.pulse = state.pulse + 1;
      break;
    case "SET_NUGGET_INDEX":
      if (cues[state.cueIndex].projector !== "slideshow") return state;
      next.nuggetIndex = clamp(Math.trunc(Number(action.index) || 0), 0, nuggetScriptQueue.length - 1);
      break;
    default:
      return state;
  }

  next.revision = state.revision + 1;
  next.updatedAt = Date.now();
  return normalizeState(next);
}

function selectIndex(state, index) {
  const cue = cues[index];
  const [progressMinimum, progressMaximum] = cueProgressRange(cue);
  return {
    ...state,
    cueId: cue.id,
    cueIndex: index,
    progress: clamp(state.progress, progressMinimum, progressMaximum),
    nuggetIndex: cue.projector === "slideshow" && state.cueIndex !== index ? 0 : state.nuggetIndex,
    blackout: cue.projector === "black"
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeSurfaces(candidate = {}) {
  const result = cloneDefaultSurfaces();
  for (const name of SURFACE_ORDER) {
    if (!Array.isArray(candidate?.[name]) || candidate[name].length !== 4) continue;
    result[name] = candidate[name].map((point, index) => {
      if (!Array.isArray(point) || point.length !== 2) return [...DEFAULT_SURFACES[name][index]];
      return [clamp(Number(point[0]), 0, 1), clamp(Number(point[1]), 0, 1)];
    });
  }
  // The dedicated top-down rig replaced the old single-projector floor trapezoid.
  // Migrate only that exact old default; preserve every intentional venue edit.
  if (sameQuad(result.floor, LEGACY_SINGLE_PROJECTOR_FLOOR)) {
    result.floor = DEFAULT_SURFACES.floor.map((point) => [...point]);
  }
  return result;
}

function sameQuad(a, b) {
  return a.length === b.length && a.every((point, index) => point.every((value, axis) => Math.abs(value - b[index][axis]) < 1e-9));
}
