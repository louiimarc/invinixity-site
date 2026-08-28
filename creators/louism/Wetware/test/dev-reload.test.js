import test from "node:test";
import assert from "node:assert/strict";
import { devReloadDecision } from "../public/common/client.js";

test("development clients reload only when the server instance changes", () => {
  assert.deepEqual(devReloadDecision(null, { autoReload:true, instanceId:"one" }), { instanceId:"one", reload:false });
  assert.deepEqual(devReloadDecision("one", { autoReload:true, instanceId:"one" }), { instanceId:"one", reload:false });
  assert.deepEqual(devReloadDecision("one", { autoReload:true, instanceId:"two" }), { instanceId:"two", reload:true });
  assert.deepEqual(devReloadDecision("one", undefined), { instanceId:null, reload:false });
});
