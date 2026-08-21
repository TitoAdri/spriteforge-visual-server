import { assertKey, requestJson } from "./providers/common.mjs";

const API_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-5.6-luna";

const SYSTEM = `You are SpriteForge's senior motion director for PixelEngine's dedicated pixel-art animation model.

Your job is to convert a user's gameplay intention into one concise, production-ready temporal prompt for PixelEngine. PixelEngine receives ONE source sprite and generates the entire sequence jointly. It is not a frame-by-frame image editor.

Write only movement and temporal staging, never a description or redesign of the character. Preserve the source character's identity, costume, palette, facing direction, pixel scale and framing. The prompt must describe a complete sequence: starting pose, readable extremes, recovery, and loop closure where appropriate.

Quality rules:
- Idle: subtle breathing/weight shift; both feet remain on the same ground line; no walking, floating, camera motion or random wobble.
- Walk/run: explicitly alternate left-foot and right-foot contacts and passing poses; arms swing opposite the legs; the character stays in-place unless the user explicitly requests travel; bottom pivot stays stable.
- Attack/jump/custom: state anticipation, action extreme, follow-through/recovery, and whether feet or pivot may move.
- Require one character only, a stable canvas, consistent scale, no camera movement, no scene, no VFX, no glow, no particles, no motion blur, no duplicate limbs or characters.
- Pixel art must stay crisp with a limited palette and no anti-aliasing or gradients.
- Keep the prompt within 900 characters and make it executable rather than poetic.

Return JSON only. The negative prompt must be a short comma-separated list tailored to the requested motion.`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "negativePrompt", "summary"],
  properties: {
    prompt: { type: "string", minLength: 80, maxLength: 900 },
    negativePrompt: { type: "string", minLength: 20, maxLength: 500 },
    summary: { type: "string", minLength: 10, maxLength: 180 },
  },
};

function clean(value, max) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractText(body) {
  if (typeof body?.output_text === "string") return body.output_text;
  for (const item of body?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string") return content.text;
  return "";
}

export async function generatePixelEnginePrompt(input = {}) {
  const context = {
    sourceName: clean(input.sourceName, 160) || "approved source sprite",
    motion: clean(input.motion, 40) || "idle",
    frames: Number.isInteger(input.frames) ? input.frames : 6,
    canvas: Number.isInteger(input.canvas) ? input.canvas : 128,
    colors: Number.isInteger(input.colors) ? input.colors : 24,
    request: clean(input.request, 900),
    constraints: clean(input.constraints, 500),
  };
  if (!context.request) throw new Error("Describe the motion you want to generate.");
  const { body, requestId } = await requestJson(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${assertKey("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions: SYSTEM,
      input: JSON.stringify(context),
      reasoning: { effort: "low" },
      max_output_tokens: 900,
      text: { format: { type: "json_schema", name: "pixelengine_motion_prompt", strict: true, schema } },
    }),
  });
  let result;
  try { result = JSON.parse(extractText(body)); } catch { throw new Error("The prompt assistant returned an invalid response."); }
  const prompt = clean(result?.prompt, 900); const negativePrompt = clean(result?.negativePrompt, 500); const summary = clean(result?.summary, 180);
  if (prompt.length < 80 || negativePrompt.length < 20 || !summary) throw new Error("The prompt assistant returned an incomplete response.");
  return { prompt, negativePrompt, summary, model: MODEL, requestId };
}
