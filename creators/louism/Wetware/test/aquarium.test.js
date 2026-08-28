import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AQUARIUM_EDGE_MARGIN, advanceFishWithLeftStick, advanceSwarmCenter, approachWrapped, aquariumDeviceFromUrl, aquariumDeviceIndex, aquariumWorldToLocal, aquariumWorldInterval, shortestWrappedDelta, stageFishIndicatorX } from "../public/common/aquarium.js";

test("three choreographed iPads partition one continuous normalized world", () => {
  assert.deepEqual([0, 1, 2].map(aquariumWorldInterval), [[0, 1/3], [1/3, 2/3], [2/3, 1]]);
  for (const worldX of [0, .1, 1/3, .5, 2/3, .999999]) {
    const owners = [0, 1, 2].map((index) => aquariumWorldToLocal(worldX, index, 1000)).filter((value) => value !== null);
    assert.equal(owners.length, 1, `${worldX} must appear on exactly one iPad`);
    assert.ok(owners[0] >= 0 && owners[0] < 1000);
  }
  assert.equal(aquariumWorldToLocal(1, 0, 1000), 0, "world wrap returns to iPad 1");
});

test("stable device URLs resolve to choreography indices", () => {
  assert.equal(aquariumDeviceIndex("ipad-1"), 0);
  assert.equal(aquariumDeviceIndex("ipad-2"), 1);
  assert.equal(aquariumDeviceIndex("ipad-3"), 2);
  assert.equal(aquariumDeviceIndex("ipad-99"), 2);
  assert.equal(aquariumDeviceFromUrl("?device=ipad-2", "/ipad/"), "ipad-2");
  assert.equal(aquariumDeviceFromUrl("", "/ipad/3/"), "ipad-3");
  assert.equal(aquariumDeviceFromUrl("", "/ipad/"), "ipad-1");
});

test("Gamepad integration crosses seams and clamps Y elevation and Z depth", () => {
  const moved = advanceSwarmCenter({ x:.332, y:.91, z:.09 }, { x:1, y:1, z:-1 }, .05);
  assert.ok(moved.x > 1/3);
  assert.equal(moved.y, 1-AQUARIUM_EDGE_MARGIN);
  assert.equal(moved.z, AQUARIUM_EDGE_MARGIN);
  const wrapped = advanceSwarmCenter({ x:.999, y:.08, z:.91 }, { x:1, y:-1, z:1 }, .05);
  assert.ok(wrapped.x < .02);
  assert.equal(wrapped.y, AQUARIUM_EDGE_MARGIN);
  assert.equal(wrapped.z, 1-AQUARIUM_EDGE_MARGIN);
  assert.ok(shortestWrappedDelta(.002,.999)>0, "fish keeps facing right while wrapping to iPad 1");
  assert.ok(shortestWrappedDelta(.999,.002)<0, "fish keeps facing left while wrapping to iPad 3");
  assert.ok(approachWrapped(.99,.01,.5)<.01, "render interpolation crosses the world seam without reversing");
});

test("aquarium fish uses hologram-inverted left-stick X, direct Y and preserves depth", () => {
  const moved=advanceFishWithLeftStick({ x:.5,y:.5,z:.63 },1,-1,.05);
  assert.ok(moved.x<.5,"left-stick right moves logical X left before the hologram mirror");
  assert.ok(moved.y<.5,"left-stick up moves the fish upward on screen");
  assert.equal(moved.z,.63,"right-stick/depth input is not part of aquarium movement");
});

test("actor floor indicator mirrors the fish world X position", () => {
  assert.equal(stageFishIndicatorX(0),1);
  assert.equal(stageFishIndicatorX(.25),.75);
  assert.equal(stageFishIndicatorX(1),0);
  assert.ok(stageFishIndicatorX(.999)<.01,"the end of square 3 sits at the left seam");
  assert.equal(stageFishIndicatorX(0),1,"wrapping to square 1 jumps to the opposite edge");
});

test("production aquarium uses only the ancient fish sprite", async () => {
  const ipadSource=await readFile(new URL("../public/ipad/ipad.js",import.meta.url),"utf8");
  assert.match(ipadSource,/ancient-iridescent-fish\.png/);
  assert.doesNotMatch(ipadSource,/generic-neon-fish\.png/);
  assert.doesNotMatch(ipadSource,/fish-3d|threeInstances|createFish3D/);
});
