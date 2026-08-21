import test from "node:test";
import assert from "node:assert/strict";
import { TEMPORAL_EDIT_MOTIONS, temporalEditPrompt, temporalPhaseFor } from "../../animation-temporal.js";

test("only idle and walk use sequential temporal editing", () => {
  assert.deepEqual([...TEMPORAL_EDIT_MOTIONS], ["idle", "walk"]);
});

test("walk assigns opposite contact phases across an eight-frame cycle", () => {
  assert.match(temporalPhaseFor("walk", 1, 8), /first contact/i);
  assert.match(temporalPhaseFor("walk", 4, 8), /opposite contact/i);
  assert.match(temporalPhaseFor("walk", 7, 8), /loop bridge/i);
});

test("four-frame walk keeps both contacts and a loop bridge", () => {
  assert.match(temporalPhaseFor("walk", 1, 4), /first contact/i);
  assert.match(temporalPhaseFor("walk", 2, 4), /opposite contact/i);
  assert.match(temporalPhaseFor("walk", 3, 4), /loop bridge/i);
});

test("idle prompt locks identity while using the preceding accepted frame", () => {
  const prompt = temporalEditPrompt({ motion: "idle", index: 1, total: 4, userPrompt: "quiet breathing" });
  assert.match(prompt, /Image 1 is the immutable identity master/);
  assert.match(prompt, /Image 2 is the immediately preceding accepted animation frame/);
  assert.match(prompt, /Both feet stay planted/);
  assert.match(prompt, /quiet breathing/);
});

test("walk prompt requires real alternating leg articulation", () => {
  const prompt = temporalEditPrompt({ motion: "walk", index: 4, total: 8 });
  assert.match(prompt, /two legs must exchange front\/back roles/i);
  assert.match(prompt, /opposite contact/i);
  assert.match(prompt, /do not slide the whole character/i);
  assert.match(prompt, /screen positions and overlap order must visibly exchange/i);
  assert.match(prompt, /deterministic full-sprite pose guide/i);
  assert.match(prompt, /pose guide is authoritative for which leg is forward/i);
});

test("unsupported motions stay on the existing animation pipeline", () => {
  assert.throws(() => temporalPhaseFor("custom", 1, 4), /Unsupported temporal edit motion/);
});
