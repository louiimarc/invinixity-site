import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeLiveInput } from "../show/input.js";

test("live inputs are source-specific and bounded", () => {
  assert.deepEqual(sanitizeLiveInput({ source:"gamepad", active:1, x:2, y:-1, z:2, axisX:-4, axisY:.4, axisZ:4, axisRX:-2, leftTrigger:2, rightTrigger:.25, leftBumper:1, start:true }), {
    source:"gamepad", active:true, x:1, y:0, z:1, axisX:-1, axisY:.4, axisZ:1, axisRX:-1,
    leftTrigger:1, rightTrigger:.25, leftBumper:true, rightBumper:false, start:true
  });
  assert.deepEqual(sanitizeLiveInput({ source:"midi", cc:3.7, value:200, normalized:.5, mapping:"fish-speed" }), {
    source:"midi", cc:4, value:127, normalized:.5, mapping:"fish-speed"
  });
  assert.deepEqual(sanitizeLiveInput({ source:"kala",active:1,x:3,y:-2,extra:"ignored" }),{
    source:"kala",active:true,x:1,y:0
  });
  assert.equal(sanitizeLiveInput({ source:"unknown" }), null);
});

test("iPad identification messages carry only an active flag and bounded epoch", () => {
  assert.deepEqual(sanitizeLiveInput({ source:"identify", active:true, startedAt:1234.7, injected:"ignored" }), {
    source:"identify", active:true, startedAt:1235
  });
  assert.deepEqual(sanitizeLiveInput({ source:"identify", active:false, startedAt:-10 }), {
    source:"identify", active:false, startedAt:0
  });
});
