import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeFaceManifest, normalizeSlideshowContent, resolveMediaAssetPath, resolveMediaAssetUrl } from "../public/common/media-content.js";

test("slideshow accepts strings and styled local-image slides", () => {
  const result = normalizeSlideshowContent({ slides: ["KEMEJA", { text: "TUHAN", image: "slides/tuhan.jpg", background: "#000000", foreground: "#71ff4b", fit:"contain", zoom: true }] });
  assert.equal(result.slides[0].text, "KEMEJA");
  assert.equal(result.slides[1].image, "slides/tuhan.jpg");
  assert.equal(result.slides[1].fit, "contain");
  assert.equal(result.slides[1].zoom, true);
  assert.equal(result.slides[0].fit, "cover");
  assert.throws(() => normalizeSlideshowContent({ slides: [{ image: "https://example.com/x.jpg" }] }), /local/);
});

test("slideshow images resolve beside root-relative and absolute data URLs", () => {
  const page = "http://127.0.0.1:4173/projector/";
  const expected = "http://127.0.0.1:4173/assets/data/slides/kemeja.png";
  assert.equal(resolveMediaAssetUrl("slides/kemeja.png", "/assets/data/slideshow.json", page), expected);
  assert.equal(resolveMediaAssetUrl("slides/kemeja.png", "http://127.0.0.1:4173/assets/data/slideshow.json", page), expected);
});

test("preflight image paths remain inside their slideshow manifest folder", () => {
  assert.equal(resolveMediaAssetPath("01-kemeja.png", "/assets/image/nugget-series/slideshow.json"), "/assets/image/nugget-series/01-kemeja.png");
  assert.equal(resolveMediaAssetPath("slides/01-kemeja.png", "/assets/data/slideshow.json"), "/assets/data/slides/01-kemeja.png");
  assert.throws(() => resolveMediaAssetPath("/assets/data/outside.png", "/assets/image/nugget-series/slideshow.json"), /inside/);
  assert.throws(() => normalizeSlideshowContent({ slides:[{ image:"/assets/image/absolute.png" }] }), /relative/);
});

test("Kala face manifests accept only local PNG layers", () => {
  assert.deepEqual(normalizeFaceManifest({ images:["face-01.png","makeup/face-02.PNG"] }),{ images:["face-01.png","makeup/face-02.PNG"] });
  assert.throws(()=>normalizeFaceManifest({ images:["face.jpg"] }),/PNG/);
  assert.throws(()=>normalizeFaceManifest({ images:["../face.png"] }),/local/);
});

test("production Kala face manifest contains the six prepared makeup layers", async () => {
  const manifest=JSON.parse(await readFile(new URL("../public/assets/image/kala-face/manifest.json",import.meta.url),"utf8"));
  const normalized=normalizeFaceManifest(manifest);
  assert.deepEqual(normalized.images,["face-01.png","face-02.png","face-03.png","face-04.png","face-05.png","face-06.png"]);
});
