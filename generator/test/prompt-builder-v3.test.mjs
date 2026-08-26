import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { buildPixelArtPromptV3, createPixelGridScaffoldV3, pixelGridLayoutV3 } from "../src/internal/pixel-art-v3.mjs";

const ranger = {
  subject: "A compact desert ranger with a teal hood, brass goggles, tan scarf and copper lantern",
  target: { width: 32, height: 48 },
  palette: { maxColors: 32, mood: "premium game pixel art" },
  pixelScale: "uniform-medium",
  styleTags: [],
};

test("V3 maps a 32x48 logical grid to the smallest valid exact-ratio GPT Image 2 canvas", () => {
  assert.deepEqual(pixelGridLayoutV3(ranger), {
    logicalWidth: 32,
    logicalHeight: 48,
    scale: 21,
    width: 672,
    height: 1008,
    left: 0,
    top: 0,
  });
});

test("V3 scaffold fills the complete output with one square block per logical pixel", async () => {
  const scaffold = await createPixelGridScaffoldV3(ranger);
  const { data, info } = await sharp(scaffold.bytes).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 672);
  assert.equal(info.height, 1008);
  const rgba = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.deepEqual(rgba(0, 0), [76, 76, 76, 255]);
  assert.deepEqual(rgba(20, 20), [76, 76, 76, 255]);
  assert.deepEqual(rgba(21, 0), [180, 180, 180, 255]);
  assert.deepEqual(rgba(671, 1007), [76, 76, 76, 255]);
});

test("V3 gives medium pixels a concrete coarse subject budget and no lighting controls", () => {
  const prompt = buildPixelArtPromptV3(ranger);
  assert.match(prompt, /672x1008 PNG/);
  assert.match(prompt, /32-column by 48-row/);
  assert.match(prompt, /at most 26 logical columns and 42 logical rows/);
  assert.match(prompt, /two to four broad color clusters/);
  assert.match(prompt, /No global yellow, ochre, sepia/);
  assert.doesNotMatch(prompt, /lighting directions?/i);
  assert.doesNotMatch(prompt, /lightning/i);
});

test("the private V3 flow asks GPT Image 2 for a genuinely transparent canvas", () => {
  const prompt = buildPixelArtPromptV3({ ...ranger, internalVariant: "v3-grid" });
  assert.match(prompt, /genuinely transparent background/);
  assert.doesNotMatch(prompt, /flat opaque #FF00FF matte/);
});

test("V3 maps large and small pixel references to coarser and finer logical grids", () => {
  assert.deepEqual(pixelGridLayoutV3({ ...ranger, pixelScale: "uniform-coarse" }), {
    logicalWidth: 16,
    logicalHeight: 24,
    scale: 42,
    width: 672,
    height: 1008,
    left: 0,
    top: 0,
  });
  assert.deepEqual(pixelGridLayoutV3({ ...ranger, pixelScale: "uniform-fine" }), {
    logicalWidth: 64,
    logicalHeight: 96,
    scale: 11,
    width: 704,
    height: 1056,
    left: 0,
    top: 0,
  });
  const largePrompt = buildPixelArtPromptV3({ ...ranger, pixelScale: "uniform-coarse" });
  const smallPrompt = buildPixelArtPromptV3({ ...ranger, pixelScale: "uniform-fine" });
  assert.match(largePrompt, /16-column by 24-row/);
  assert.match(smallPrompt, /64-column by 96-row/);
});
