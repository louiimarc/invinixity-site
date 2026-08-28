import { cueOutput } from "./outputs.js";

const AQUARIUM_CUE_ID = "transition-1-aquarium";

export function lightingMonitorState(cue, state = {}, now = Date.now()) {
  if (cue?.id === AQUARIUM_CUE_ID) {
    return monitorResult(false, false, "aquarium", "LIGHTS OFF — AQUARIUM");
  }

  if (state.blackout) {
    return monitorResult(false, false, "blackout", "BLACKOUT");
  }

  if (state.calibration) {
    return monitorResult(true, true, "calibration", "CALIBRATION CONTENT");
  }

  if (cue?.projector === "black") {
    return monitorResult(false, false, "blackout", "BLACKOUT");
  }

  const setupPreview = cue?.id === "house-loop" && state.setupPreview && state.setupPreview !== "off";
  const activeProjector = setupPreview || cueHasVisibleContent(cue, state, now);
  const wall = Boolean(setupPreview || (activeProjector && cueOutput(cue) === "wall"));
  const floor = Boolean(activeProjector && cueOutput(cue) === "floor" || cue?.floorLoading === true);
  return monitorResult(wall, floor, "show", `${cue?.number || "—"} · ${cue?.label || "WAITING"}`);
}

function cueHasVisibleContent(cue, state, now) {
  if (!cue || cue.projector === "black") return false;
  if (cue.projector !== "preshow-fade") return true;
  const durationMs = Math.max(100, (Number(cue.fadeDuration) || 4) * 1000);
  return Math.max(0, Number(now) - Number(state.updatedAt || now)) < durationMs;
}

function monitorResult(wall, floor, mode, detail) {
  return {
    mode,
    detail,
    wall:{ content:Boolean(wall), caption:wall ? "CONTENT" : "NO CONTENT" },
    floor:{ content:Boolean(floor), caption:floor ? "CONTENT" : "NO CONTENT" }
  };
}
