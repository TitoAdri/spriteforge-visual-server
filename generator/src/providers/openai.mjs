import sharp from "sharp";
import { assertKey, normalizeImageResult, requestJson } from "./common.mjs";
import { outputPlan } from "../recipes.mjs";
import { buildBasePrompt, buildEditPrompt } from "../prompt-builder.mjs";

const API_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL = "https://api.openai.com/v1/images/edits";
const REFERENCE_MAX_SIDE = 512;

function headers() {
  return { Authorization: `Bearer ${assertKey("OPENAI_API_KEY")}` };
}

async function compactReference(reference, fallbackName, { upscale = false, maxSide = REFERENCE_MAX_SIDE, mirror = false } = {}) {
  // Reference images influence OpenAI's billed image-input tokens according
  // to their dimensions. The model only needs visual direction here, not a
  // full-resolution source file. Nearest-neighbour preserves hard pixel edges.
  // Normal style references stay at 512px; identity turnarounds opt into 1024px.
  let pipeline = sharp(reference.bytes, { animated: false, limitInputPixels: 16_000_000 }).rotate();
  if (mirror) pipeline = pipeline.flop();
  const bytes = await pipeline
    .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: !upscale, kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { blob: new Blob([bytes], { type: "image/png" }), filename: fallbackName };
}

export async function generateOpenAI({ recipe, tier = "draft" }) {
  const plan = outputPlan("openai", tier, recipe);
  // The generation endpoint is text-only. When a premium Theme supplies
  // visual references, use the image-edit endpoint so the model receives
  // those images as visual context rather than reducing them to tags.
  if (recipe.references?.length) {
    const form = new FormData();
    form.set("model", plan.model); form.set("prompt", buildBasePrompt(recipe)); form.set("size", plan.size); form.set("quality", plan.quality); form.set("output_format", plan.outputFormat);
    for (const [index, reference] of recipe.references.entries()) {
      const image = await compactReference(reference, `theme-reference-${index + 1}.png`);
      form.append("image[]", image.blob, image.filename);
    }
    const { body, requestId } = await requestJson(EDIT_URL, { method: "POST", headers: headers(), body: form });
    return normalizeImageResult({ provider: "openai", model: plan.model, imageBase64: body?.data?.[0]?.b64_json, requestId, raw: body });
  }
  const { body, requestId } = await requestJson(API_URL, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ model: plan.model, prompt: buildBasePrompt(recipe), size: plan.size, quality: plan.quality, output_format: plan.outputFormat, n: 1 }),
  });
  return normalizeImageResult({ provider: "openai", model: plan.model, imageBase64: body?.data?.[0]?.b64_json, requestId, raw: body });
}

export async function editOpenAI({ recipe, change, anchor, tier = "draft" }) {
  const plan = outputPlan("openai", tier, recipe);
  const form = new FormData();
  form.set("model", plan.model);
  form.set("prompt", buildEditPrompt(recipe, change));
  form.set("size", plan.size);
  form.set("quality", plan.quality);
  form.set("output_format", plan.outputFormat);
  if (recipe.internalVariant === "sprite-turnaround") {
    form.set("background", "transparent");
  }
  const turnaround = recipe.internalVariant === "sprite-turnaround";
  const anchorImage = await compactReference(anchor, anchor.filename || "anchor.png", { upscale: turnaround, maxSide: turnaround ? 1024 : REFERENCE_MAX_SIDE });
  if (turnaround && recipe.turnaround?.projection === "platformer") {
    const guide = await compactReference(anchor, "target-facing-guide.png", { upscale: true, maxSide: 1024, mirror: true });
    form.append("image[]", guide.blob, guide.filename);
    form.append("image[]", anchorImage.blob, anchorImage.filename);
  } else {
    form.append("image[]", anchorImage.blob, anchorImage.filename);
  }
  for (const [index, reference] of (recipe.references || []).entries()) {
    const image = await compactReference(reference, `reference-${index + 1}.png`);
    form.append("image[]", image.blob, image.filename);
  }
  const { body, requestId } = await requestJson(EDIT_URL, { method: "POST", headers: headers(), body: form });
  return normalizeImageResult({ provider: "openai", model: plan.model, imageBase64: body?.data?.[0]?.b64_json, requestId, raw: body });
}
