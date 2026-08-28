import test from "node:test";
import assert from "node:assert/strict";
import { cues } from "../show/cues.js";
import { lightingMonitorState } from "../show/lighting.js";

const cue = (id) => cues.find((candidate) => candidate.id === id);

test("lighting monitor follows wall, floor and persistent-loading content", () => {
  assert.deepEqual(outputs("preshow-get-ready"),[true,false]);
  assert.deepEqual(outputs("fragment-2-loading"),[false,true]);
  assert.deepEqual(outputs("fragment-2-camera"),[true,true]);
  assert.deepEqual(outputs("fragment-3-budget"),[false,true]);
  assert.deepEqual(outputs("transition-2-organs"),[true,false]);
  assert.deepEqual(outputs("fragment-4-kodelife"),[true,true]);
});

test("aquarium is a hard no-light override even though both projectors carry content", () => {
  const status = lightingMonitorState(cue("transition-1-aquarium"),{});
  assert.equal(status.mode,"aquarium");
  assert.deepEqual([status.wall.content,status.floor.content],[false,false]);
  assert.match(status.detail,/LIGHTS OFF/);
});

test("blackout, calibration and completed preshow fade report actual visibility", () => {
  assert.deepEqual(outputs("fragment-2-camera",{ blackout:true }),[false,false]);
  assert.deepEqual(outputs("house-loop",{ calibration:true,blackout:false }),[true,true]);
  const fade = cue("fragment-1-hero");
  assert.equal(lightingMonitorState(fade,{ updatedAt:1000 },4999).wall.content,true);
  assert.equal(lightingMonitorState(fade,{ updatedAt:1000 },5000).wall.content,false);
});

function outputs(id,state={}) {
  const status = lightingMonitorState(cue(id),state,Date.now());
  return [status.wall.content,status.floor.content];
}
