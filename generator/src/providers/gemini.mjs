import { assertKey, normalizeImageResult, requestJson } from "./common.mjs";
import { outputPlan } from "../recipes.mjs";
import { buildBasePrompt, buildEditPrompt } from "../prompt-builder.mjs";

const API_ROOT = "https://generativelanguage.googleapis.com/v1/models";

const ASPECT_RATIO_ENUM = Object.freeze({
  "1:1": "ASPECT_RATIO_ONE_BY_ONE",
  "1:4": "ASPECT_RATIO_ONE_BY_FOUR",
  "1:8": "ASPECT_RATIO_ONE_BY_EIGHT",
  "2:3": "ASPECT_RATIO_TWO_BY_THREE",
  "3:2": "ASPECT_RATIO_THREE_BY_TWO",
  "3:4": "ASPECT_RATIO_THREE_BY_FOUR",
  "4:1": "ASPECT_RATIO_FOUR_BY_ONE",
  "4:3": "ASPECT_RATIO_FOUR_BY_THREE",
  "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
  "5:4": "ASPECT_RATIO_FIVE_BY_FOUR",
  "8:1": "ASPECT_RATIO_EIGHT_BY_ONE",
  "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
  "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
  "21:9": "ASPECT_RATIO_TWENTY_ONE_BY_NINE",
});

const IMAGE_SIZE_ENUM = Object.freeze({
  "512": "IMAGE_SIZE_FIVE_TWELVE",
  "1K": "IMAGE_SIZE_ONE_K",
  "2K": "IMAGE_SIZE_TWO_K",
  "4K": "IMAGE_SIZE_FOUR_K",
});

function encodeImage(image) {
  return { inlineData: { data: image.bytes.toString("base64"), mimeType: image.mimeType || "image/png" } };
}

export function buildGenerateContentPayload({ prompt, images = [], plan }) {
  const aspectRatio = ASPECT_RATIO_ENUM[plan.aspectRatio];
  const imageSize = IMAGE_SIZE_ENUM[plan.imageSize];
  if (!aspectRatio || !imageSize) throw new Error("Unsupported Gemini image output configuration");
  return {
    contents: [{ role: "user", parts: [{ text: prompt }, ...images.map(encodeImage)] }],
    generationConfig: {
      // Image-only avoids paying for conversational text that SpriteForge
      // neither displays nor needs for deterministic post-processing.
      responseModalities: ["IMAGE"],
      // Raw REST uses the protobuf enum names. The Google SDK accepts human
      // values such as "2:3" and "512" and translates them internally.
      responseFormat: { image: { aspectRatio, imageSize } },
    },
  };
}

export function imageFromGenerateContent(body) {
  const parts = body?.candidates?.flatMap((candidate) => candidate?.content?.parts || []) || [];
  const part = parts.find((item) => item?.inlineData?.data || item?.inline_data?.data);
  const image = part?.inlineData || part?.inline_data;
  return image ? { data: image.data, mimeType: image.mimeType || image.mime_type || "image/png" } : null;
}

async function generateContent({ recipe, tier, prompt, images = [] }) {
  const plan = outputPlan("gemini", tier, recipe);
  const payload = buildGenerateContentPayload({ prompt, images, plan });
  const url = `${API_ROOT}/${encodeURIComponent(plan.model)}:generateContent`;
  const { body, requestId } = await requestJson(url, {
    method: "POST",
    headers: { "x-goog-api-key": assertKey("GEMINI_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const image = imageFromGenerateContent(body);
  return normalizeImageResult({ provider: "gemini", model: plan.model, imageBase64: image?.data, mimeType: image?.mimeType || plan.mimeType, requestId, interactionId: null, raw: body });
}

export function generateGemini({ recipe, tier = "draft" }) {
  return generateContent({ recipe, tier, prompt: buildBasePrompt(recipe), images: recipe.references ?? [] });
}

export function editGemini({ recipe, change, anchor, tier = "draft" }) {
  return generateContent({ recipe, tier, prompt: buildEditPrompt(recipe, change), images: [anchor, ...(recipe.references ?? [])] });
}
