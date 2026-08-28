import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeTelemetry } from "../show/telemetry.js";

test("telemetry is bounded and reduced to show-safe fields", () => {
  assert.deepEqual(sanitizeTelemetry({
    width: 99999,
    height: -4,
    dpr: 20,
    fullscreen: 1,
    visible: true,
    secureContext: false,
    displayMode: "standalone",
    orientation: "landscape",
    rtt: 12.6,
    path: "/ipad/?device=ipad-1",
    userAgent: "must not pass"
  }), {
    width: 10000,
    height: 1,
    dpr: 5,
    fullscreen: true,
    visible: true,
    secureContext: false,
    displayMode: "standalone",
    orientation: "landscape",
    rtt: 13,
    path: "/ipad/?device=ipad-1"
  });
});

test("projector media probe telemetry is bounded and deduplicated", () => {
  const telemetry = sanitizeTelemetry({
    mediaProbe: {
      status: "failed", checked:999, total:10, failed:2, checkedAt:1234.8,
      failures:["kala-face:VIDEO_ERROR_4", "kala-face:VIDEO_ERROR_4", "x".repeat(90)]
    }
  });
  assert.deepEqual(telemetry.mediaProbe, {
    status:"failed", checked:100, total:10, failed:2, checkedAt:1235,
    failures:["kala-face:VIDEO_ERROR_4", "x".repeat(50)]
  });
});

test("projector camera telemetry exposes status without leaking extra fields", () => {
  const telemetry = sanitizeTelemetry({
    cameraInput: { ready:true, label:"iPhone Continuity Camera", error:"x".repeat(200), stream:"must not pass" }
  });
  assert.deepEqual(telemetry.cameraInput, {
    ready:true,
    label:"iPhone Continuity Camera",
    error:"x".repeat(120)
  });
});
