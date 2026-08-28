import test from "node:test";
import assert from "node:assert/strict";
import { MAX_STONE_MASK_POINTS, normalizeKalaFace, normalizeProjectorPointer, normalizeSetupPreview, normalizeStoneMask, stoneMaskBounds } from "../show/scene-settings.js";

test("Kala calibration remains normalized and show-safe", () => {
  assert.deepEqual(normalizeKalaFace({ x:-2,y:4,width:0,height:9 }), { x:0,y:1,scale:1 });
  assert.deepEqual(normalizeKalaFace({ x:.2,y:.3,scale:.4 }), { x:.2,y:.3,scale:.4 });
  assert.deepEqual(normalizeKalaFace({ x:.2,y:.3,width:.4,height:.5 }), { x:.2,y:.3,scale:.5 });
});

test("back-wall pointer directly spans the full Kala movement area", () => {
  assert.deepEqual(normalizeProjectorPointer(0,0,1920,1080),{ x:0,y:0 });
  assert.deepEqual(normalizeProjectorPointer(960,540,1920,1080),{ x:.5,y:.5 });
  assert.deepEqual(normalizeProjectorPointer(2200,1200,1920,1080),{ x:1,y:1 });
});

test("stone vector masks reject malformed points and cap payload size", () => {
  const points=Array.from({ length:MAX_STONE_MASK_POINTS+20 },(_,index)=>[index/1000,2]);
  const mask=normalizeStoneMask([["x",0],null,...points]);
  assert.equal(mask.length,MAX_STONE_MASK_POINTS);
  assert.deepEqual(mask[0],[0,1]);
  assert.deepEqual(mask.at(-1),[(MAX_STONE_MASK_POINTS-1)/1000,1]);
});

test("stone mask bounds describe the closed outline instead of the projector window", () => {
  assert.deepEqual(stoneMaskBounds([[.2,.3],[.8,.25],[.7,.9],[.2,.3]]),{ x:.2,y:.25,width:.6000000000000001,height:.65 });
  assert.equal(stoneMaskBounds([[.2,.3],[.2,.3],[.2,.3]]),null);
});

test("setup preview accepts only operator-defined modes", () => {
  assert.equal(normalizeSetupPreview("shader"),"off");
  assert.equal(normalizeSetupPreview("audience-ui"),"off");
});
