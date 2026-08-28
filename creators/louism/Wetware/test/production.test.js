import test from "node:test";
import assert from "node:assert/strict";
import { production, productionDateLabel } from "../show/production.js";

test("official production metadata is explicit and timezone-qualified", () => {
  assert.equal(production.title, "WETWARE<3");
  assert.equal(production.timezone, "Asia/Jakarta");
  assert.equal(new Date(production.eventAt).toISOString(), "2026-08-27T12:00:00.000Z");
  assert.match(productionDateLabel(), /27 AUG 2026 · 19:00 WIB/);
  assert.equal(production.referenceUrls.length, 2);
});
