import test from "node:test";
import assert from "node:assert/strict";
import { cues } from "../show/cues.js";
import { initialState, normalizeState, reduceState } from "../show/state.js";

test("GO advances and loads the cue's starting progress", () => {
  const state = reduceState(initialState(), { type: "GO" });
  assert.equal(state.cueId, cues[1].id);
  assert.equal(state.progress, cues[1].progress);
  assert.equal(state.revision, 2);
  assert.equal(state.blackout, false);
});

test("show opens on the H0 pre-start blackout", () => {
  const state = initialState();
  assert.equal(state.cueId, "house-loop");
  assert.equal(cues[0].projector, "black");
  assert.equal(cues[0].ipad, "black");
  assert.equal(state.blackout, true);
});

test("progress is hard-clamped to every cue's approved table band", () => {
  for (const cue of cues) {
    const low = reduceState({ ...initialState(), cueId:cue.id }, { type:"SET_PROGRESS", value:-100 });
    const high = reduceState({ ...initialState(), cueId:cue.id }, { type:"SET_PROGRESS", value:1000 });
    assert.equal(low.progress, cue.progressRange[0], `${cue.number} minimum`);
    assert.equal(high.progress, cue.progressRange[1], `${cue.number} maximum`);
  }
});

test("invalid recovered cue falls back safely", () => {
  const state = normalizeState({ cueId: "missing", progress: -4, blackout: 1 });
  assert.equal(state.cueId, cues[0].id);
  assert.equal(state.progress, 0);
  assert.equal(state.blackout, true);
});

test("selecting end cue engages blackout", () => {
  const state = reduceState(initialState(), { type: "SELECT_CUE", cueId: "end-black" });
  assert.equal(state.cueId, "end-black");
  assert.equal(state.blackout, true);
});

test("F4.0 is a full blackout between T2.1 and F4.1",()=>{
  const blackoutIndex=cues.findIndex((cue)=>cue.id==="fragment-4-blackout");
  assert.equal(cues[blackoutIndex-1].id,"transition-2-organs");
  assert.equal(cues[blackoutIndex+1].id,"fragment-4-roblox");
  const state=reduceState(initialState(),{ type:"SELECT_CUE",cueId:"fragment-4-blackout" });
  assert.equal(state.blackout,true);
  assert.equal(cues[state.cueIndex].ipad,"black");
  assert.equal(cues[state.cueIndex].floorLoading,false);
});

test("curtain call follows the show-end blackout and ends on a final blackout", () => {
  const endIndex = cues.findIndex((cue) => cue.id === "end-black");
  assert.equal(cues[endIndex + 1].id, "curtain-call-under-pressure");
  assert.equal(cues[endIndex + 1].floorLoading, false);
  assert.equal(cues[endIndex + 2].id, "exit-black");
  assert.equal(cues[endIndex + 2].projector, "black");
});

test("surface calibration points update, clamp and reset", () => {
  const moved = reduceState(initialState(), { type: "SET_SURFACE_POINT", surface: "floor", corner: 0, x: -2, y: .42 });
  assert.deepEqual(moved.surfaces.floor[0], [0, .42]);
  const reset = reduceState(moved, { type: "RESET_SURFACE", surface: "floor" });
  assert.deepEqual(reset.surfaces.floor[0], [0, 0]);
  assert.deepEqual(reset.surfaces.floor[2], [1, 1]);
});

test("legacy single-projector floor perspective migrates to the flat top-down plane", () => {
  const legacy = normalizeState({
    surfaces: {
      ...initialState().surfaces,
      floor: [[.08,.56],[.92,.56],[1,.98],[0,.98]]
    }
  });
  assert.deepEqual(legacy.surfaces.floor, [[0,0],[1,0],[1,1],[0,1]]);

  const adjusted = normalizeState({
    surfaces: {
      ...initialState().surfaces,
      floor: [[.01,.02],[.99,.01],[.98,.99],[.02,.98]]
    }
  });
  assert.deepEqual(adjusted.surfaces.floor, [[.01,.02],[.99,.01],[.98,.99],[.02,.98]]);
});

test("persistent floor loading keeps one progress value across cue changes", () => {
  let state = initialState();
  state = reduceState(state, { type:"SET_PROGRESS", value:27 });
  state = reduceState(state, { type:"SELECT_CUE", cueId:"fragment-3-budget" });
  assert.equal(state.progress, 66);
  state = reduceState(state, { type:"GO" });
  assert.equal(state.progress, 66);
});

test("selected camera is persistent show state and can return to default", () => {
  const selected = reduceState(initialState(), { type:"SET_CAMERA_DEVICE", deviceId:"continuity-camera-123", label:"Louis iPhone Camera" });
  assert.equal(selected.cameraDeviceId, "continuity-camera-123");
  assert.equal(selected.cameraDeviceLabel, "Louis iPhone Camera");
  assert.equal(normalizeState(selected).cameraDeviceId, "continuity-camera-123");
  const reset = reduceState(selected, { type:"SET_CAMERA_DEVICE", deviceId:"", label:"" });
  assert.equal(reset.cameraDeviceId, "");
  assert.equal(reset.cameraDeviceLabel, "");
});

test("Kala calibration, setup preview and stone mask persist in show state", () => {
  let state=reduceState(initialState(),{ type:"SET_KALA_FACE",value:{ x:.2,y:.8,scale:.5 } });
  state=reduceState(state,{ type:"SET_STONE_MASK_DRAFT",points:[[.1,.2],[.4,.2]] });
  assert.deepEqual(state.stoneMaskDraft,[[.1,.2],[.4,.2]]);
  state=reduceState(state,{ type:"SET_STONE_MASK",points:[[.1,.2],[.8,.2],[.5,.9]] });
  state=reduceState(state,{ type:"SET_SETUP_PREVIEW",preview:"kala-face" });
  assert.deepEqual(state.kalaFace,{ x:.2,y:.8,scale:.5 });
  assert.deepEqual(state.stoneMask,[[.1,.2],[.8,.2],[.5,.9]]);
  assert.deepEqual(state.stoneMaskDraft,[]);
  assert.equal(state.setupPreview,"kala-face");
  assert.deepEqual(normalizeState(state).stoneMask,state.stoneMask);
  const cleared=reduceState(state,{ type:"CLEAR_STONE_MASK" });
  assert.deepEqual(cleared.stoneMask,[]);
  assert.deepEqual(cleared.stoneMaskDraft,[]);
});

test("nugget launchpad selection is direct, arbitrary and nested inside the slideshow cue", () => {
  const outside = reduceState(initialState(), { type: "SET_NUGGET_INDEX", index:17 });
  assert.equal(outside.nuggetIndex, 0);
  assert.equal(outside.revision, 1);

  const slideshow = reduceState(initialState(), { type: "SELECT_CUE", cueId: "fragment-2-slideshow" });
  const improvised = reduceState(slideshow, { type: "SET_NUGGET_INDEX", index:31 });
  assert.equal(improvised.cueId, "fragment-2-slideshow");
  assert.equal(improvised.nuggetIndex, 31);
  assert.equal(reduceState(improvised, { type: "SET_NUGGET_INDEX", index:3 }).nuggetIndex, 3);
  assert.equal(reduceState(improvised, { type: "SET_NUGGET_INDEX", index:999 }).nuggetIndex, 42);
});
