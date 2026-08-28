import { cueSurface } from "./surfaces.js";

export const PROJECTOR_OUTPUTS = ["wall", "floor"];

export const PROJECTOR_OUTPUT_LABELS = {
  wall: "BACK WALL",
  floor: "TOP-DOWN FLOOR"
};

export function normalizeProjectorOutput(value) {
  return PROJECTOR_OUTPUTS.includes(value) ? value : "wall";
}

export function surfaceOutput(surface) {
  return surface === "screen" ? "wall" : "floor";
}

export function cueOutput(cue) {
  return surfaceOutput(cueSurface(cue));
}

export function cueBelongsToOutput(cue, output) {
  return cueOutput(cue) === normalizeProjectorOutput(output);
}

export function shouldShowPersistentFloorLoading(cue, _state, output) {
  return normalizeProjectorOutput(output) === "floor"
    && cue?.floorLoading === true;
}

export function shouldShowFloorFishIndicator(cue, output) {
  return normalizeProjectorOutput(output) === "floor"
    && cue?.floorFishIndicator === true;
}
