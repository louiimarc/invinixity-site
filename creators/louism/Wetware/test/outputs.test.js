import test from "node:test";
import assert from "node:assert/strict";
import { cues } from "../show/cues.js";
import { cueBelongsToOutput, cueOutput, normalizeProjectorOutput, shouldShowFloorFishIndicator, shouldShowPersistentFloorLoading, surfaceOutput } from "../show/outputs.js";

test("plane cues route by projector while the vertical monolith routes to wall", () => {
  assert.equal(surfaceOutput("screen"), "wall");
  for (const surface of ["floor", "bebe", "kala-face", "rock"]) assert.equal(surfaceOutput(surface), "floor");
  assert.equal(cueOutput({ projector:"video" }), "wall");
  assert.equal(cueOutput({ projector:"loading", surface:"floor" }), "floor");
  assert.equal(cueOutput({ projector:"video", surface:"floor", target:"kala-face" }), "floor");
  assert.equal(cueBelongsToOutput({ projector:"organs", surface:"screen", target:"rock" }, "wall"), true);
  assert.equal(cueBelongsToOutput({ projector:"kala-face", surface:"screen", target:"kala-face" }, "wall"), true);
});

test("projector output identity defaults safely to the back wall", () => {
  assert.equal(normalizeProjectorOutput("floor"), "floor");
  assert.equal(normalizeProjectorOutput("unknown"), "wall");
});

test("floor loading visibility follows the approved table per cue", () => {
  const state = {};
  assert.equal(shouldShowPersistentFloorLoading({ floorLoading:true }, state, "floor"), true);
  assert.equal(shouldShowPersistentFloorLoading({ floorLoading:false }, state, "floor"), false);
  assert.equal(shouldShowPersistentFloorLoading({ floorLoading:true }, state, "wall"), false);
});

test("aquarium fish marker is routed only to the floor", () => {
  const aquarium=cues.find((cue)=>cue.id==="transition-1-aquarium");
  assert.equal(shouldShowFloorFishIndicator(aquarium,"floor"),true);
  assert.equal(shouldShowFloorFishIndicator(aquarium,"wall"),false);
  assert.equal(shouldShowFloorFishIndicator(cues.find((cue)=>cue.id==="fragment-3-budget"),"floor"),false);
});

test("floor loading is hidden for the approved media, blackout and post-show scenes", () => {
  const hiddenShowCueIds = cues
    .filter((cue) => !["H0","END","EXIT"].includes(cue.number) && cue.floorLoading !== true)
    .map((cue) => cue.id);
  assert.deepEqual(hiddenShowCueIds,[
    "preshow-get-ready",
    "fragment-1-hero",
    "transition-1-aquarium",
    "fragment-3-budget",
    "transition-2-organs",
    "fragment-4-blackout",
    "fragment-5-objects",
    "curtain-call-under-pressure"
  ]);
});
