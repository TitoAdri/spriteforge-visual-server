import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { buildBasePrompt } from "../src/prompt-builder.mjs";
import { buildPixelArtPromptV2, createPixelGridScaffold, pixelGridLayout } from "../src/internal/pixel-art-v2.mjs";

const moonlitRanger = {
  subject: "A moonlit ranger with a teal cloak and brass goggles",
  target: { width: 32, height: 48 },
  palette: { maxColors: 32, mood: "premium game pixel art" },
  pixelScale: "uniform-medium",
};

test("public V1 prompt remains byte-for-byte unchanged", () => {
  const digest = createHash("sha256").update(buildBasePrompt({ ...moonlitRanger, target: { width: 64, height: 96 } })).digest("hex");
  assert.equal(digest, "8058f429c941d63bb153cd8743894271efc89413216badecd4997cfeb65c2fb2");
});

test("V2 uses an exact logical grid and explicit color-cast guardrails", () => {
  const prompt = buildPixelArtPromptV2(moonlitRanger);
  assert.match(prompt, /intended medium-scale grid of 32 columns by 48 rows/);
  assert.match(prompt, /global yellow, ochre, sepia/);
  assert.match(prompt, /teal stays teal/);
  assert.doesNotMatch(prompt, /lighting directions?/i);
  assert.doesNotMatch(prompt, /lightning/i);
});

test("grid scaffold maps one neutral checker cell to each logical pixel", async () => {
  const scaffold = await createPixelGridScaffold(moonlitRanger);
  const layout = pixelGridLayout(moonlitRanger);
  assert.deepEqual(layout, { previewSize: 1024, requestedWidth: 32, requestedHeight: 48, nativePixelsPerCell: 1, logicalWidth: 32, logicalHeight: 48, scale: 16, width: 512, height: 768, left: 256, top: 128 });
  const { data, info } = await sharp(scaffold.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1024);
  assert.equal(info.height, 1024);
  const rgba = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.deepEqual(rgba(0, 0), [255, 0, 255, 255]);
  assert.deepEqual(rgba(layout.left, layout.top), [72, 72, 72, 255]);
  assert.deepEqual(rgba(layout.left + layout.scale, layout.top), [184, 184, 184, 255]);
});

test("grid variant identifies the scaffold as temporary non-content", () => {
  const prompt = buildPixelArtPromptV2(moonlitRanger, { gridScaffold: true });
  assert.match(prompt, /Image 1 is a temporary registration scaffold/);
  assert.match(prompt, /leave no gray cells or checker pattern/);
});
