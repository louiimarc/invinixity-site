import test from "node:test";
import assert from "node:assert/strict";
import { wetwareInstallationMessage, WETWARE_INSTALLATION_MESSAGES, WETWARE_INSTALLATION_STAGES } from "../public/common/loading-copy.js";

test("twenty Wetware messages follow approved nonuniform progress ranges", () => {
  assert.equal(WETWARE_INSTALLATION_STAGES.length, 20);
  assert.equal(new Set(WETWARE_INSTALLATION_MESSAGES).size, 20);
  assert.deepEqual(WETWARE_INSTALLATION_STAGES.map(({ max }) => max), [2,7,10,17,21,29,32,38,43,46,54,59,62,69,73,81,85,91,96,100]);
  assert.equal(wetwareInstallationMessage(0), "SCANNING INHERITED ERRORS");
  assert.equal(wetwareInstallationMessage(2), "SCANNING INHERITED ERRORS");
  assert.equal(wetwareInstallationMessage(2.01), "INJECTING MEMORIES");
  assert.equal(wetwareInstallationMessage(55), "BACKING UP FIRST KISS");
  assert.equal(wetwareInstallationMessage(99), "AUTHENTICATING HEARTBEAT");
  assert.ok(WETWARE_INSTALLATION_MESSAGES.every((message) => message === message.toUpperCase()));
});
