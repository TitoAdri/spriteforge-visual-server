export const ASSET_TYPES = ["character", "enemy", "npc", "item", "weapon", "prop", "environment", "building", "tile", "ui-icon", "ui-panel", "frame"];
export const VIEWS = ["front", "left-profile", "right-profile", "left-3-4", "right-3-4", "top-down", "isometric"];
export const TIERS = ["draft", "final", "ultra"];

export const DEFAULT_RECIPE = Object.freeze({
  assetType: "character",
  subject: "a compact fantasy ranger with a teal hood and a brass lantern",
  view: "left-3-4",
  pose: "neutral idle pose",
  target: { width: 48, height: 72 },
  palette: { maxColors: 24, mood: "twilight fantasy" },
  pixelScale: "uniform-medium",
  styleTags: [],
  background: { mode: "chroma-key", color: "#FF00FF" },
  composition: { paddingPercent: 18, fullBody: true, groundShadow: false },
  constraints: ["no text", "no watermark", "no logo", "no UI", "no frame", "no extra characters", "do not crop the subject"],
  references: [],
  lockedTraits: [],
});

function assert(condition, message) {
  if (!condition) throw new Error(`Invalid sprite recipe: ${message}`);
}

export function normalizeRecipe(input = {}) {
  const recipe = structuredClone(DEFAULT_RECIPE);
  Object.assign(recipe, input);
  recipe.target = { ...DEFAULT_RECIPE.target, ...(input.target ?? {}) };
  recipe.palette = { ...DEFAULT_RECIPE.palette, ...(input.palette ?? {}) };
  recipe.background = { ...DEFAULT_RECIPE.background, ...(input.background ?? {}) };
  recipe.composition = { ...DEFAULT_RECIPE.composition, ...(input.composition ?? {}) };
  recipe.constraints = [...new Set([...(DEFAULT_RECIPE.constraints ?? []), ...(input.constraints ?? [])])];
  recipe.references = input.references ?? [];
  recipe.lockedTraits = input.lockedTraits ?? [];
  recipe.styleTags = [...new Set((input.styleTags ?? []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];

  assert(ASSET_TYPES.includes(recipe.assetType), `assetType must be one of ${ASSET_TYPES.join(", ")}`);
  assert(VIEWS.includes(recipe.view), `view must be one of ${VIEWS.join(", ")}`);
  assert(Number.isInteger(recipe.target.width) && recipe.target.width >= 8 && recipe.target.width <= 256, "target.width must be 8-256");
  assert(Number.isInteger(recipe.target.height) && recipe.target.height >= 8 && recipe.target.height <= 256, "target.height must be 8-256");
  assert(Number.isInteger(recipe.palette.maxColors) && recipe.palette.maxColors >= 2 && recipe.palette.maxColors <= 256, "palette.maxColors must be 2-256");
  assert(["uniform-coarse", "uniform-medium", "uniform-fine"].includes(recipe.pixelScale), "pixelScale must be uniform-coarse, uniform-medium, or uniform-fine");
  assert(recipe.styleTags.length <= 8 && recipe.styleTags.every((tag) => /^[a-z0-9][a-z0-9 -]{0,40}$/.test(tag)), "styleTags must contain at most 8 short labels");
  assert(/^#[0-9a-fA-F]{6}$/.test(recipe.background.color), "background.color must be a six-digit hex colour");
  assert(recipe.composition.paddingPercent >= 0 && recipe.composition.paddingPercent <= 40, "paddingPercent must be 0-40");
  return recipe;
}

export function outputPlan(provider, tier, recipeInput) {
  const recipe = normalizeRecipe(recipeInput);
  assert(TIERS.includes(tier), `tier must be one of ${TIERS.join(", ")}`);
  const ratio = recipe.target.width / recipe.target.height;
  const portrait = ratio < 1 / 1.15;
  const landscape = ratio > 1.15;
  if (provider === "openai") {
    return {
      provider, model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      // GPT Image's smallest supported canvas is 1024px. SpriteForge snaps
      // the result down to a small game grid locally, so a square working
      // canvas is sufficient for every normal sprite and costs less than the
      // portrait/landscape variants. Composition instructions preserve the
      // requested aspect ratio inside that canvas.
      size: "1024x1024",
      quality: tier === "draft" ? "low" : tier === "final" ? "medium" : "high",
      outputFormat: "png",
    };
  }
  if (provider === "gemini") {
    const aspectRatio = ratio >= 3.1 ? "4:1" : ratio >= 2.15 ? "21:9" : ratio >= 1.68 ? "16:9" : ratio >= 1.28 ? "3:2" : ratio <= 0.33 ? "1:4" : ratio <= 0.58 ? "9:16" : ratio <= 0.72 ? "2:3" : "1:1";
    return {
      provider, model: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
      imageSize: tier === "draft" ? "512" : tier === "final" ? "1K" : "2K",
      aspectRatio,
      // generateContent reports the actual MIME type on the returned inline
      // image. PNG is only the safe fallback if that field is absent.
      mimeType: "image/png",
    };
  }
  throw new Error(`Unknown provider: ${provider}`);
}
