import test from "node:test";
import assert from "node:assert/strict";
import { effectiveBlackout, emergencyBlackoutMessage, normalizeEmergencyMessage, reconcileEmergencyBlackout } from "../public/common/emergency.js";

test("emergency blackout messages are deterministic and bounded", () => {
  assert.deepEqual(emergencyBlackoutMessage(1, 12.7), { type:"SET_EMERGENCY_BLACKOUT", value:true, sentAt:13 });
  assert.deepEqual(normalizeEmergencyMessage({ type:"SET_EMERGENCY_BLACKOUT", value:false, sentAt:-4, injected:"ignored" }), { type:"SET_EMERGENCY_BLACKOUT", value:false, sentAt:0 });
  assert.equal(normalizeEmergencyMessage({ type:"TOGGLE_BLACKOUT", value:true }), null);
  assert.equal(normalizeEmergencyMessage({ type:"SET_EMERGENCY_BLACKOUT", value:"true" }), null);
});

test("local blackout overrides stale server state until it is reconciled", () => {
  assert.equal(effectiveBlackout(false, true), true);
  assert.equal(effectiveBlackout(true, false), false);
  assert.equal(effectiveBlackout(true, null), true);
  assert.equal(reconcileEmergencyBlackout(true, false), true);
  assert.equal(reconcileEmergencyBlackout(true, true), null);
  assert.equal(reconcileEmergencyBlackout(false, false), null);
});
