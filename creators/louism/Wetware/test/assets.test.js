import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assetManifest } from "../show/assets.js";
import { cues } from "../show/cues.js";

test("every manifest asset is consumed by exactly its declared cues", () => {
  const assetsById = new Map(assetManifest.map((asset) => [asset.id, asset]));
  assert.equal(assetsById.size, assetManifest.length);
  for (const cue of cues) {
    const paths = [cue.media, cue.auxiliaryMedia, cue.data].filter(Boolean);
    for (const assetId of cue.assets || []) {
      const asset = assetsById.get(assetId);
      assert.ok(asset, `${cue.number} references unknown asset ${assetId}`);
      assert.ok(paths.includes(asset.path), `${cue.number} declares ${assetId} but never consumes ${asset.path}`);
    }
    for (const path of paths) {
      assert.ok(assetManifest.some((asset) => asset.path === path && cue.assets?.includes(asset.id)), `${cue.number} consumes untracked asset ${path}`);
    }
  }
  for (const asset of assetManifest) {
    const consumers = cues.filter((cue) => cue.assets?.includes(asset.id)).map((cue) => cue.number).sort();
    assert.deepEqual(consumers, [...asset.cues].sort(), `${asset.id} cue coverage differs from manifest`);
  }
});

test("video cues declare playback and fallback behavior explicitly", () => {
  for (const cue of cues.filter((item) => item.media)) {
    assert.equal(typeof cue.loop, "boolean", `${cue.number} needs loop policy`);
    assert.equal(typeof cue.audio, "boolean", `${cue.number} needs audio policy`);
    if (!["video","camera"].includes(cue.projector)) assert.ok(cue.fallbackProjector, `${cue.number} needs a generative fallback`);
  }
});

test("Under Pressure curtain call is tracked for fully offline playback", () => {
  const cue = cues.find((item) => item.id === "curtain-call-under-pressure");
  assert.equal(cue.projector,"video");
  assert.equal(cue.media,"/assets/video/under-pressure.mp4");
  assert.deepEqual(cue.assets,["under-pressure"]);
  assert.equal(cue.loop,false);
  assert.equal(cue.audio,true);
  assert.equal(cue.floorLoading,false);
  assert.equal(cues.some((item) => item.projector === "youtube"),false);
});

test("Fragment IV shows the OBS camera while its soundtrack loops until the next cue", () => {
  const cue = cues.find((item) => item.id === "fragment-4-kodelife");
  assert.equal(cue.projector,"camera");
  assert.equal(cue.media,"/assets/audio/fragment-4-kodelife.m4a");
  assert.equal(cue.auxiliaryMedia,undefined);
  assert.equal(cue.loop,true);
  assert.equal(cue.audio,true);
  assert.deepEqual(cue.assets,["fragment-4-kodelife-audio"]);
  assert.equal(assetManifest.find((asset) => asset.id === "fragment-4-kodelife-audio")?.kind,"audio");
  assert.equal(assetManifest.some((asset) => asset.id === "fragment-4-hdri-video"),false);
});

test("Milo video preserves the complete frame", () => {
  assert.equal(cues.find((item) => item.id === "fragment-2-milo")?.fit,"contain");
});

test("hero intro crops its baked portrait frame and aligns it flush right", () => {
  assert.equal(cues.find((item) => item.id === "preshow-get-ready")?.fit,"portrait-right");
  assert.equal(cues.find((item) => item.id === "fragment-1-hero")?.fit,"portrait-right");
});

test("aquarium loops the silent Ocean Fish Tank video on the back wall", () => {
  const cue = cues.find((item) => item.id === "transition-1-aquarium");
  assert.equal(cue.projector,"video");
  assert.equal(cue.media,"/assets/video/ocean-fishtank.mp4");
  assert.deepEqual(cue.assets,["aquarium-back-wall"]);
  assert.equal(cue.loop,true);
  assert.equal(cue.audio,false);
  assert.equal(cue.ipad,"aquarium");
  assert.equal(cue.floorLoading,false);
  assert.equal(cue.floorFishIndicator,true);
});

test("stone video loops only while its one-shot back-wall video plays", () => {
  const cue = cues.find((item) => item.id === "transition-2-organs");
  assert.equal(cue.loop,false);
  assert.equal(cue.auxiliaryLoop,true);
  assert.equal(cue.audio,true);
  assert.equal(cue.backgroundDim,.3);
});

test("reverse video fades to blackout over its final five seconds", () => {
  const cue = cues.find((item) => item.id === "fragment-5-objects");
  assert.equal(cue.fadeOutDuration,5);
  assert.equal(cue.loop,false);
  assert.equal(cue.floorLoading,false);
});

test("pre-show blackout exposes camera setup only during calibration", async () => {
  const projector = await readFile(new URL("../public/projector/projector.js",import.meta.url),"utf8");
  assert.match(projector,/const visible = projectorOutput === "wall" && Boolean\(state\.calibration\)/);
});

test("saved stone mask blacks out the background from H1 through F2.3", () => {
  const occluded = cues.filter((cue) => cue.stoneOcclusion).map((cue) => cue.number);
  assert.deepEqual(occluded,["H1","F1.1","F2.1","F2.2","F2.3","T2.1","F5.1","END","CALL","EXIT"]);
  assert.deepEqual(cues.filter((cue) => ["F2.4","T1.1","F3.1","F3.2","F3.3","F4.1","F4.2","F4.3"].includes(cue.number) && cue.stoneOcclusion).map((cue) => cue.number),[]);
});

test("Kala face uses a direct mouse-driven foreground overlay", () => {
  const cue=cues.find((item)=>item.id==="fragment-3-face");
  assert.equal(cue.directOverlay,true);
});

test("F3.4 loops the local Ibu Riri rain video until the next cue", () => {
  const cue=cues.find((item)=>item.id==="fragment-3-ibu-riri");
  assert.equal(cue.number,"F3.4");
  assert.equal(cue.media,"/assets/video/fragment-3-ibu-riri-rain.mov");
  assert.equal(cue.loop,true);
  assert.equal(cue.audio,false);
  assert.equal(cues[cues.indexOf(cue)+1]?.id,"transition-2-organs");
});

test("show surfaces never display missing-media comments", async () => {
  const projector = await readFile(new URL("../public/projector/projector.js",import.meta.url),"utf8");
  assert.doesNotMatch(projector,/MISSING \/ UNARMED|missingAsset\(/);
});
