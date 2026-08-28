import test from "node:test";
import assert from "node:assert/strict";
import { canSendLiveInput, canSendShowAction } from "../show/control-access.js";

test("nugget controller may launch slides but cannot operate the theatre cue stack", () => {
  assert.equal(canSendShowAction("nugget", { type:"SET_NUGGET_INDEX", index:17 }), true);
  assert.equal(canSendShowAction("nugget", { type:"GO" }), false);
  assert.equal(canSendShowAction("nugget", { type:"SET_PROGRESS", value:90 }), false);
  assert.equal(canSendShowAction("projector", { type:"SET_NUGGET_INDEX", index:2 }), false);
  assert.equal(canSendShowAction("operator", { type:"GO" }), true);
});

test("Kala phone can move only the face pointer",()=>{
  assert.equal(canSendLiveInput("kala",{ source:"kala" }),true);
  assert.equal(canSendLiveInput("kala",{ source:"gamepad" }),false);
  assert.equal(canSendShowAction("kala",{ type:"GO" }),false);
});
