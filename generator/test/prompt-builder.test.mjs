import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { assetV2GridLayout, buildAssetPromptV2, buildBasePrompt, buildEditPrompt, buildTurnaroundPrompt } from "../src/prompt-builder.mjs";
import { assessPlatformerTurnaround, normalizeTurnaround } from "../src/turnaround.mjs";
import { normalizeRecipe, outputPlan } from "../src/recipes.mjs";
import { buildGenerateContentPayload, imageFromGenerateContent } from "../src/providers/gemini.mjs";

test("base prompt contains deterministic production constraints", () => {
  const prompt = buildBasePrompt({ subject: "a blue wizard", target: { width: 32, height: 48 }, palette: { maxColors: 16 } });
  assert.match(prompt, /32x48/);
  assert.match(prompt, /16-color palette/);
  assert.match(prompt, /#FF00FF/);
  assert.match(prompt, /no anti-aliasing/);
  assert.match(prompt, /no micro-pixels/);
});

test("Asset Generator 2 uses native transparency and a concrete text-only logical grid", () => {
  const recipe = { assetType: "item", subject: "a brass compass", target: { width: 48, height: 48 }, pixelScale: "uniform-medium", internalVariant: "asset-transparent-v2" };
  const prompt = buildAssetPromptV2(recipe);
  assert.match(prompt, /genuine alpha transparency/);
  assert.match(prompt, /one collectible or inventory item only/i);
  assert.match(prompt, /12-column by 12-row sprite/);
  assert.match(prompt, /9 logical columns and 10 logical rows/);
  assert.match(prompt, /one uniform invisible logical grid/);
  assert.match(prompt, /816x816 transparent PNG/);
  assert.match(prompt, /exactly 68x with nearest-neighbor square blocks/);
  assert.match(prompt, /Do not draw grid lines/);
  assert.doesNotMatch(prompt, /Image 1/);
  assert.doesNotMatch(prompt, /opaque flat #FF00FF matte/);
});

test("Asset Generator 2 maps pixel scale labels to distinct textual grid budgets", () => {
  const base = { assetType: "prop", subject: "a treasure chest", target: { width: 64, height: 64 }, internalVariant: "asset-transparent-v2" };
  assert.deepEqual(assetV2GridLayout({ ...base, pixelScale: "uniform-coarse" }), { logicalWidth: 8, logicalHeight: 8, scale: 102, width: 816, height: 816 });
  assert.deepEqual(assetV2GridLayout({ ...base, pixelScale: "uniform-medium" }), { logicalWidth: 16, logicalHeight: 16, scale: 51, width: 816, height: 816 });
  assert.deepEqual(assetV2GridLayout({ ...base, pixelScale: "uniform-fine" }), { logicalWidth: 32, logicalHeight: 32, scale: 26, width: 832, height: 832 });
  assert.match(buildAssetPromptV2({ ...base, pixelScale: "uniform-coarse" }), /8-column by 8-row/);
  assert.match(buildAssetPromptV2({ ...base, pixelScale: "uniform-medium" }), /16-column by 16-row/);
  assert.match(buildAssetPromptV2({ ...base, pixelScale: "uniform-fine" }), /32-column by 32-row/);
});

test("Asset Generator 2 keeps the requested grid authoritative over Theme scale wording", () => {
  const prompt = buildAssetPromptV2({
    assetType: "item",
    subject: "a brass compass. Theme direction: crisp medium-scale pixels",
    target: { width: 48, height: 48 },
    pixelScale: "uniform-coarse",
    internalVariant: "asset-transparent-v2",
  });
  assert.match(prompt, /exact 8-column by 8-row sprite/);
  assert.match(prompt, /Theme direction, style labels or reference descriptions/);
  assert.match(prompt, /LARGE PIXELS/);
});

test("edit prompt separates change from locks", () => {
  const prompt = buildEditPrompt({ subject: "a blue wizard", lockedTraits: ["blue robe", "silver staff"] }, "walk contact pose");
  assert.match(prompt, /Change only:/);
  assert.match(prompt, /walk contact pose/);
  assert.match(prompt, /Must remain unchanged:/);
  assert.match(prompt, /blue robe, silver staff/);
});

test("edit prompt numbers pose references after the anchor", () => {
  const prompt = buildEditPrompt({ subject: "a blue wizard", references: [{ role: "pose guide" }] }, "walk contact pose");
  assert.match(prompt, /Image 2 is pose guide/);
  assert.doesNotMatch(prompt, /Image 1 is pose guide/);
});

test("output plans use provider-specific low-cost drafts", () => {
  assert.equal(outputPlan("openai", "draft", {}).quality, "low");
  const gemini = outputPlan("gemini", "draft", {});
  assert.equal(gemini.imageSize, "512");
  assert.equal(gemini.mimeType, "image/png");
});

test("Gemini keeps a matching aspect ratio while OpenAI drafts use the compact square canvas", () => {
  assert.equal(outputPlan("gemini", "draft", { target: { width: 240, height: 64 } }).aspectRatio, "4:1");
  assert.equal(outputPlan("openai", "draft", { target: { width: 192, height: 96 } }).size, "1024x1024");
});

test("Gemini draft requests use image-only generateContent at 512", () => {
  const plan = outputPlan("gemini", "draft", {});
  const payload = buildGenerateContentPayload({
    prompt: "one sprite",
    images: [{ bytes: Buffer.from("anchor"), mimeType: "image/png" }],
    plan,
  });
  assert.deepEqual(payload.generationConfig.responseModalities, ["IMAGE"]);
  assert.equal(payload.generationConfig.responseFormat.image.aspectRatio, "ASPECT_RATIO_TWO_BY_THREE");
  assert.equal(payload.generationConfig.responseFormat.image.imageSize, "IMAGE_SIZE_FIVE_TWELVE");
  assert.equal(payload.contents[0].parts[1].inlineData.mimeType, "image/png");
});

test("Gemini generateContent image response is parsed", () => {
  const image = imageFromGenerateContent({ candidates: [{ content: { parts: [{ inlineData: { data: "aW1hZ2U=", mimeType: "image/jpeg" } }] } }] });
  assert.deepEqual(image, { data: "aW1hZ2U=", mimeType: "image/jpeg" });
});

test("recipe rejects unsafe target dimensions", () => {
  assert.throws(() => normalizeRecipe({ target: { width: 4, height: 16 } }), /target.width/);
});

test("platformer turnaround prompt rotates the character without mirroring or moving the camera", () => {
  const prompt = buildTurnaroundPrompt({
    subject: "approved ranger",
    target: { width: 48, height: 72 },
    internalVariant: "sprite-turnaround",
    turnaround: { sourceAssetId: "11111111-1111-4111-8111-111111111111", projection: "platformer", sourceDirection: "right", targetDirection: "left", bodyType: "biped" },
  });
  assert.match(prompt, /180-degree turn around.*vertical axis/i);
  assert.match(prompt, /same fixed orthographic 2D side-view camera/i);
  assert.match(prompt, /Image 1 is the sole authority for identity/i);
  assert.doesNotMatch(prompt, /Image 2/i);
  assert.match(prompt, /SCREEN-SPACE EQUIPMENT LOCK/i);
  assert.match(prompt, /same side of the canvas as Image 1/i);
  assert.match(prompt, /smallest possible change/i);
  assert.match(prompt, /48x72 sprite/i);
  assert.match(prompt, /transparent pixel-art sprite/i);
});

test("platformer can rotate equipment with the physical side when explicitly requested", () => {
  const normalized = normalizeTurnaround({ sourceAssetId: "11111111-1111-4111-8111-111111111111", projection: "platformer", sourceDirection: "right", targetDirection: "left", bodyType: "biped", equipmentMode: "physical-side" });
  const prompt = buildTurnaroundPrompt({ internalVariant: "sprite-turnaround", turnaround: normalized });
  assert.equal(normalized.equipmentMode, "physical-side");
  assert.match(prompt, /PHYSICAL-SIDE EQUIPMENT LOCK/i);
  assert.match(prompt, /may move to the opposite side of the canvas/i);
  assert.throws(() => normalizeTurnaround({ ...normalized, equipmentMode: "guess" }), /equipment placement mode/i);
});

test("isometric turnaround prompt describes a fixed-camera directional rotation and hidden surfaces", () => {
  const prompt = buildTurnaroundPrompt({
    subject: "approved fox",
    internalVariant: "sprite-turnaround",
    turnaround: { sourceAssetId: "22222222-2222-4222-8222-222222222222", projection: "isometric", directionCount: 8, sourceDirection: "down-left", targetDirection: "up-right", bodyType: "quadruped", hiddenDetails: "blue buckle on the physical right side" },
  });
  assert.match(prompt, /180 degrees clockwise/);
  assert.match(prompt, /Do not orbit, tilt, zoom or move the camera/);
  assert.match(prompt, /quadruped with coherent forelegs/);
  assert.match(prompt, /blue buckle on the physical right side/);
});

test("four-direction isometric turnaround accepts only diagonal game directions", () => {
  assert.throws(() => normalizeTurnaround({ sourceAssetId: "33333333-3333-4333-8333-333333333333", projection: "isometric", directionCount: 4, sourceDirection: "down", targetDirection: "up", bodyType: "biped" }), /diagonal game directions/);
  assert.equal(normalizeTurnaround({ sourceAssetId: "33333333-3333-4333-8333-333333333333", projection: "isometric", directionCount: 4, sourceDirection: "down-left", targetDirection: "up-right", bodyType: "biped" }).targetDirection, "up-right");
});

test("platformer turnaround validation rejects an unchanged asymmetric silhouette", async () => {
  const width = 32, height = 32, pixels = Buffer.alloc(width * height * 4);
  const paint = (left, top, right, bottom) => { for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) { const index = (y * width + x) * 4; pixels[index] = 255; pixels[index + 1] = 255; pixels[index + 2] = 255; pixels[index + 3] = 255; } };
  paint(7, 5, 13, 28); paint(13, 9, 26, 14);
  const source = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const mirrored = await sharp(source).flop().png().toBuffer();
  assert.equal((await assessPlatformerTurnaround(source, source)).changed, false);
  assert.equal((await assessPlatformerTurnaround(source, mirrored)).changed, true);
});
