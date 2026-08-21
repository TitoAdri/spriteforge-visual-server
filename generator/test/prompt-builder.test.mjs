import test from "node:test";
import assert from "node:assert/strict";
import { buildBasePrompt, buildEditPrompt } from "../src/prompt-builder.mjs";
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
