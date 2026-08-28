import test from "node:test";
import assert from "node:assert/strict";
import { evaluateTechnicalCheck } from "../public/common/tech-check.js";

const now = 1_000_000;
const devices = [
  ["mac-projector-wall", "projector"], ["mac-projector-floor", "projector"], ["ipad-1", "ipad"], ["ipad-2", "ipad"], ["ipad-3", "ipad"]
].map(([deviceId, role]) => ({
  id: `${deviceId}-socket`, deviceId, role, lastSeen: now - 200,
  telemetry: {
    visible: true, fullscreen: true, width: 1920, height: 1080, displayMode: "fullscreen", rtt: 8,
    ...(deviceId.startsWith("mac-projector-") ? { mediaProbe: { status:"ready", checked:9, total:9, failed:0, checkedAt:now - 1000, failures:[] } } : {})
  }
}));
const assetReport = { ready: true, present: 9, missing: 0, assets: Array.from({ length: 9 }) };

test("technical certification passes only with the complete renderer set", () => {
  const result = evaluateTechnicalCheck({ devices, assetReport, operatorRtt: 5, gamepadConnected: true, ipadOrderConfirmed:true, midiEnabled: false, now });
  assert.equal(result.ready, true);
  assert.equal(result.failed, 0);
  assert.equal(result.warnings, 1);
});

test("duplicates, stale/hidden renderers, missing media and gamepad fail", () => {
  const broken = [
    ...devices,
    { ...devices[1], id: "duplicate" }
  ].map((device) => device.deviceId === "ipad-3" ? { ...device, lastSeen: now - 9000, telemetry: { ...device.telemetry, visible: false } } : device);
  const result = evaluateTechnicalCheck({ devices: broken, assetReport: { ...assetReport, ready: false, missing: 2 }, operatorRtt: 200, gamepadConnected: false, ipadOrderConfirmed:true, now });
  assert.equal(result.ready, false);
  assert.ok(result.failed >= 6);
  assert.equal(result.checks.find((check) => check.id === "unique-devices").status, "fail");
});

test("projector codec failure or stale media probe blocks certification", () => {
  const failedProbe = devices.map((device) => device.deviceId === "mac-projector-wall" ? {
    ...device,
    telemetry: { ...device.telemetry, mediaProbe: { status:"failed", checked:9, total:9, failed:1, checkedAt:now - 1000, failures:["kala-face:VIDEO_ERROR_4"] } }
  } : device);
  const failed = evaluateTechnicalCheck({ devices:failedProbe, assetReport, operatorRtt:5, gamepadConnected:true, ipadOrderConfirmed:true, now });
  assert.equal(failed.ready, false);
  assert.match(failed.checks.find((check) => check.id === "media-decode").detail, /kala-face/);

  const staleProbe = devices.map((device) => device.deviceId === "mac-projector-floor" ? {
    ...device,
    telemetry: { ...device.telemetry, mediaProbe: { ...device.telemetry.mediaProbe, checkedAt:now - 91000 } }
  } : device);
  const stale = evaluateTechnicalCheck({ devices:staleProbe, assetReport, operatorRtt:5, gamepadConnected:true, ipadOrderConfirmed:true, now });
  assert.equal(stale.checks.find((check) => check.id === "media-decode").status, "fail");
  assert.match(stale.checks.find((check) => check.id === "media-decode").detail, /STALE/);
});

test("physical iPad choreography requires explicit visual confirmation", () => {
  const result = evaluateTechnicalCheck({ devices, assetReport, operatorRtt:5, gamepadConnected:true, ipadOrderConfirmed:false, now });
  assert.equal(result.ready, false);
  assert.equal(result.checks.find((check) => check.id === "ipad-order").status, "fail");
});
