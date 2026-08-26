import { assertKey, normalizeImageResult, requestJson } from "../providers/common.mjs";
import { outputPlan } from "../recipes.mjs";

const API_URL = "https://api.openai.com/v1/images/generations";
const EDIT_URL = "https://api.openai.com/v1/images/edits";

function headers() {
  return { Authorization: `Bearer ${assertKey("OPENAI_API_KEY")}` };
}

export async function generateInternalPixelArt({ recipe, prompt, images = [], tier = "draft", size, quality }) {
  const plan = outputPlan("openai", tier, recipe);
  const requestSize = size ?? plan.size;
  const requestQuality = quality ?? plan.quality;
  // Native transparency is limited to the V3 character pipeline and the
  // administrator-only Asset Generator 2 experiment.
  const requestTransparentBackground = ["v3-grid", "asset-transparent-v2"].includes(recipe.internalVariant);
  if (images.length) {
    const form = new FormData();
    form.set("model", plan.model);
    form.set("prompt", prompt);
    form.set("size", requestSize);
    form.set("quality", requestQuality);
    form.set("output_format", plan.outputFormat);
    if (requestTransparentBackground) form.set("background", "transparent");
    for (const [index, image] of images.entries()) {
      form.append("image[]", new Blob([image.bytes], { type: image.mimeType || "image/png" }), image.filename || `reference-${index + 1}.png`);
    }
    const { body, requestId } = await requestJson(EDIT_URL, { method: "POST", headers: headers(), body: form });
    return normalizeImageResult({ provider: "openai", model: plan.model, imageBase64: body?.data?.[0]?.b64_json, requestId, raw: body });
  }

  const { body, requestId } = await requestJson(API_URL, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: plan.model,
      prompt,
      size: requestSize,
      quality: requestQuality,
      output_format: plan.outputFormat,
      ...(requestTransparentBackground ? { background: "transparent" } : {}),
      n: 1,
    }),
  });
  return normalizeImageResult({ provider: "openai", model: plan.model, imageBase64: body?.data?.[0]?.b64_json, requestId, raw: body });
}
