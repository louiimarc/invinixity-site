import test from "node:test";
import assert from "node:assert/strict";
import { createLiveInputStore, liveInputTiming } from "../show/live-inputs.js";

test("live inputs replay in memory for reconnecting renderers", () => {
  const store = createLiveInputStore();
  store.set({ source:"gamepad", active:true, x:.4, y:.6, axisX:.2, axisY:0 }, 1000);
  store.set({ source:"midi", cc:3, value:96, normalized:96/127, mapping:"fish-speed" }, 1000);
  assert.deepEqual(store.snapshot(1200).map((input) => input.source).sort(), ["gamepad", "midi"]);
});

test("stale Gamepad and completed identity patterns fail inactive", () => {
  const store = createLiveInputStore();
  store.set({ source:"gamepad", active:true, x:.4, y:.6, axisX:.2, axisY:-.1, axisZ:.3, axisRX:-.4, leftTrigger:.5, rightTrigger:.6, leftBumper:true, rightBumper:true, start:true }, 1000);
  store.set({ source:"identify", active:true, startedAt:1000 }, 1000);
  const expired = store.expire(1000 + Math.max(liveInputTiming.gamepadTtlMs, liveInputTiming.identifyDurationMs) + 1);
  assert.equal(expired.length, 2);
  const snapshot = store.snapshot(30000);
  assert.equal(snapshot.find((input) => input.source === "gamepad").active, false);
  assert.deepEqual(snapshot.find((input) => input.source === "gamepad").axisX, 0);
  assert.deepEqual(snapshot.find((input) => input.source === "gamepad").axisRX, 0);
  assert.deepEqual(snapshot.find((input) => input.source === "gamepad").rightTrigger, 0);
  assert.deepEqual(snapshot.find((input) => input.source === "gamepad").leftBumper, false);
  assert.deepEqual(snapshot.find((input) => input.source === "gamepad").start, false);
  assert.equal(snapshot.find((input) => input.source === "identify").active, false);
});

test("MIDI mappings retain independent latest values until server restart", () => {
  const store = createLiveInputStore();
  store.set({ source:"midi", cc:2, value:20, normalized:20/127, mapping:"intensity" }, 1000);
  store.set({ source:"midi", cc:3, value:80, normalized:80/127, mapping:"fish-speed" }, 1100);
  store.set({ source:"midi", cc:2, value:50, normalized:50/127, mapping:"intensity" }, 1200);
  const snapshot = store.snapshot(999999);
  assert.equal(snapshot.length, 2);
  assert.equal(snapshot.find((input) => input.mapping === "intensity").value, 50);
});

test("Kala controller holds its point with heartbeat and safely expires",()=>{
  const store=createLiveInputStore();
  store.set({ source:"kala",active:true,x:.25,y:.75 },1000);
  assert.equal(store.snapshot(1000+liveInputTiming.kalaTtlMs-1)[0].active,true);
  const expired=store.expire(1000+liveInputTiming.kalaTtlMs+1);
  assert.deepEqual(expired,[{ source:"kala",active:false,x:.25,y:.75 }]);
});
