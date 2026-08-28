import test from "node:test";
import assert from "node:assert/strict";
import { nuggetPopTransition, nuggetScriptQueue, nuggetSlideCandidates, productionNuggetSlideshow, slideshowVocabulary } from "../show/slideshow.js";
import { normalizeSlideshowContent } from "../public/common/media-content.js";

test("candidate artwork covers the fixed vocabulary with one asset per slide", () => {
  assert.equal(slideshowVocabulary.length, 43);
  assert.equal(nuggetSlideCandidates.length, 43);
  assert.deepEqual(nuggetSlideCandidates.map(({ text }) => text), slideshowVocabulary);
  assert.equal(nuggetScriptQueue[0], "KEMEJA");
  assert.equal(nuggetScriptQueue.at(-1), "TUHAN");
  assert.equal(new Set(nuggetScriptQueue).size, 43);
  assert.ok(nuggetScriptQueue.includes("GELAR SARJANA CHICKEN NUGGET (S.Cn)"));
  assert.equal(nuggetScriptQueue[17], "INTERNET");
  assert.equal(nuggetSlideCandidates[17].file, "18-internet.png");
  assert.equal(nuggetSlideCandidates.at(-1).text, "TUHAN");
  assert.equal(nuggetSlideCandidates.at(-1).file, "43-tuhan-cross.png");
  assert.equal(new Set(nuggetSlideCandidates.map(({ file }) => file)).size, 43);
});

test("production nugget slideshow preserves portrait artwork without cropping", () => {
  const content = normalizeSlideshowContent(productionNuggetSlideshow());
  assert.equal(content.slides.length, 43);
  assert.ok(content.slides.every((slide) => slide.fit === "contain" && slide.image.endsWith(".png")));
  assert.ok(content.slides.every((slide) => slide.background === "#000000"));
  assert.equal(content.slides.at(-1).zoom, true);
});

test("nugget launches fade in with a restrained pop and settle quickly", () => {
  const start = nuggetPopTransition(0);
  const peak = nuggetPopTransition(176);
  const end = nuggetPopTransition(320);
  assert.deepEqual(start,{ opacity:0,scale:.94 });
  assert.ok(peak.opacity === 1 && peak.scale > 1 && peak.scale <= 1.02);
  assert.deepEqual(end,{ opacity:1,scale:1 });
});
