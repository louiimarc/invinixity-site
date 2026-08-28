import test from "node:test";
import assert from "node:assert/strict";
import { appendRehearsalEntry, buildRehearsalReport, createRehearsalLog, normalizeRehearsalLog, rehearsalCueCsv } from "../public/common/rehearsal-log.js";

test("rehearsal log derives cue durations, triggers and notes", () => {
  let log = createRehearsalLog({ title:"Venue run", startedAt:1000 });
  log = appendRehearsalEntry(log, { type:"session-start", at:1000, detail:"START" });
  log = appendRehearsalEntry(log, { type:"cue-enter", at:1100, cueId:"a", cueNumber:"F1", label:"First", detail:"SESSION START" });
  log = appendRehearsalEntry(log, { type:"note", at:1600, cueId:"a", note:'Line, then "movement"' });
  log = appendRehearsalEntry(log, { type:"cue-enter", at:3100, cueId:"b", cueNumber:"F2", label:"Second", detail:"GO" });
  log = appendRehearsalEntry(log, { type:"session-stop", at:5100, cueId:"b" });
  const report = buildRehearsalReport(log, 9000);
  assert.equal(report.active, false);
  assert.equal(report.summary.durationMs, 4100);
  assert.equal(report.summary.cueVisits[0].durationMs, 2000);
  assert.deepEqual(report.summary.cueVisits[0].notes, ['Line, then "movement"']);
  assert.equal(report.summary.cueVisits[1].durationMs, 2000);
  const csv = rehearsalCueCsv(log);
  assert.match(csv, /F1,a,First/);
  assert.match(csv, /"Line, then ""movement"""/);
});

test("stored rehearsal logs are schema-checked and text is bounded", () => {
  const recovered = normalizeRehearsalLog({
    format:"wetware-rehearsal-log", version:1, startedAt:10, active:true,
    title:"x".repeat(200), entries:[{ type:"note", at:11, note:"y".repeat(800) }, { type:"bad", at:12 }], injected:true
  });
  assert.equal(recovered.title.length, 120);
  assert.equal(recovered.entries.length, 1);
  assert.equal(recovered.entries[0].note.length, 500);
  assert.equal("injected" in recovered, false);
});
