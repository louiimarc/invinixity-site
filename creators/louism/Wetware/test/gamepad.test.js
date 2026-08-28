import test from "node:test";
import assert from "node:assert/strict";
import { adjustLoadingProgress, bumperCueStep, gamepadButtonPressure, LEFT_TRIGGER_ACTIVATION_PRESSURE, LOADING_PROGRESS_MAX_PER_SECOND, LOADING_PROGRESS_MIN_PER_SECOND } from "../public/common/gamepad.js";

test("trigger pressure controls forward and reverse loading speed", () => {
  assert.equal(gamepadButtonPressure({ value:.4 }), .4);
  assert.equal(gamepadButtonPressure({ value:2 }), 1);
  assert.equal(gamepadButtonPressure({ pressed:true }), 1);
  assert.equal(adjustLoadingProgress(20, 0, .1), 20);
  assert.equal(adjustLoadingProgress(20, LEFT_TRIGGER_ACTIVATION_PRESSURE, .1), 20);
  const minimum = adjustLoadingProgress(20, LEFT_TRIGGER_ACTIVATION_PRESSURE + Number.EPSILON, .1);
  const half = adjustLoadingProgress(20, .5, .1);
  const full = adjustLoadingProgress(20, 1, .1);
  const reverse = adjustLoadingProgress(20, -1, .1);
  assert.ok(Math.abs((minimum - 20) * 10 - LOADING_PROGRESS_MIN_PER_SECOND) < 1e-12);
  assert.ok(full > half);
  assert.ok(Math.abs((full - 20) * 10 - LOADING_PROGRESS_MAX_PER_SECOND) < 1e-12);
  assert.ok(Math.abs((20 - reverse) * 10 - LOADING_PROGRESS_MAX_PER_SECOND) < 1e-12);
  assert.equal(adjustLoadingProgress(99.9, 1, 1), 100);
  assert.equal(adjustLoadingProgress(.1, -1, 1), 0);
  assert.equal(adjustLoadingProgress(48.95, 1, 1, 1, 49), 49);
  assert.equal(adjustLoadingProgress(66.05, -1, 1, 66, 76), 66);
  assert.equal(adjustLoadingProgress(99.85, 1, 1, 76, 99.9), 99.9);
});

test("L1 and R1 step cues only on their rising edge", () => {
  assert.equal(bumperCueStep({ left:false,right:false },{ left:true,right:false }),-1);
  assert.equal(bumperCueStep({ left:true,right:false },{ left:true,right:false }),0);
  assert.equal(bumperCueStep({ left:false,right:false },{ left:false,right:true }),1);
  assert.equal(bumperCueStep({ left:false,right:true },{ left:false,right:true }),0);
  assert.equal(bumperCueStep({ left:false,right:false },{ left:true,right:true }),0);
});
