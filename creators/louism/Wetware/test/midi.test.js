import test from "node:test";
import assert from "node:assert/strict";
import { cueIndexFromCC, decodeControlChange } from "../public/common/midi.js";

test("decodes Control Change on any MIDI channel", () => {
  assert.deepEqual(decodeControlChange([0xb5, 3, 127]), { channel: 6, cc: 3, value: 127, normalized: 1 });
});

test("strictly rejects MIDI notes and other message types", () => {
  assert.equal(decodeControlChange([0x90, 60, 127]), null);
  assert.equal(decodeControlChange([0x80, 60, 0]), null);
  assert.equal(decodeControlChange([0xe0, 0, 64]), null);
  assert.equal(decodeControlChange([0xc0, 4, 0]), null);
});

test("CC cue selection spans first through last cue without overflow", () => {
  assert.equal(cueIndexFromCC(0, 18), 0);
  assert.equal(cueIndexFromCC(127, 18), 17);
  assert.equal(cueIndexFromCC(255, 18), 17);
});
