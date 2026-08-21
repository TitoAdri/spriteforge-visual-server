import { normalizeRecipe } from "./recipes.mjs";

const words = (items) => items.filter(Boolean).join(", ");

function pixelScaleDirection(recipe) {
  const rules = {
    "uniform-coarse": { label: "large, bold retro pixels", minBlock: 3, maxBlock: 5 },
    "uniform-medium": { label: "medium, balanced pixels", minBlock: 2, maxBlock: 3 },
    "uniform-fine": { label: "small, detailed pixels", minBlock: 1, maxBlock: 2 },
  };
  const rule = rules[recipe.pixelScale] || rules["uniform-medium"];
  const cells = (dimension) => `${Math.max(8, Math.ceil(dimension / rule.maxBlock))}-${Math.max(8, Math.floor(dimension / rule.minBlock))}`;
  return `${rule.label}: build the sprite as approximately ${cells(recipe.target.width)} by ${cells(recipe.target.height)} logical pixel cells after conversion. Make each visible color cluster about ${rule.minBlock}-${rule.maxBlock} final pixels wide; do not use details thinner than one logical cell. This is not a generic high-resolution illustration.`;
}

function assetDirection(r) {
  const rules = {
    item: "Present one collectible or inventory item only. Make its material, silhouette and interaction point readable at thumbnail size; do not show a hand, character, shelf or scene.",
    weapon: "Present one complete weapon or tool only, floating at a deliberate readable angle. Keep its grip, working end and silhouette fully visible; do not show a hand, sheath, character or scene.",
    prop: "Present one standalone gameplay prop only. It must read immediately as an interactable object, with a clear base and no surrounding furniture, characters or scenery.",
    environment: "Present one standalone scenery element only, such as a tree, rock, sign, shrine, crate cluster or lamp post. Keep its footprint and outer silhouette fully visible; do not turn it into a landscape scene.",
    building: "Present one complete standalone game building only. Show the roof, walls, entrance and base in a compact readable silhouette; no road, landscape, characters, neighboring buildings or cropped architecture.",
    "ui-icon": "Create one game UI icon only, seen front-on and centered. Use a bold, instantly recognizable pictogram with a strong outline; no letters, numbers, button chrome, interface panel or decorative text.",
    "ui-panel": "Create one compact game UI ornament or panel element only. Keep it front-on, centered and completely visible; no readable text, numbers, screenshots or interface layout.",
    tile: "Create one square seamless material tile only. It must repeat horizontally and vertically: left/right and top/bottom edges must connect as one periodic texture. Fill the whole tile with material; avoid a central hero object, directional border, background matte, empty padding, transparency, frame or isolated decoration.",
    frame: "Create exactly one animation frame of the supplied source sprite. Preserve identity, costume, proportions, perspective, outline language, palette and apparent pixel size; change only the requested pose phase. Do not redesign or reinterpret the asset.",
  };
  return rules[r.assetType] || "Present one standalone game asset only, with a clean readable silhouette and no scene around it.";
}

export function buildBasePrompt(recipeInput, referenceOffset = 0) {
  const r = normalizeRecipe(recipeInput);
  const fullBody = r.composition.fullBody ? "Full body where applicable; keep the complete subject visible." : "Keep the complete asset visible.";
  const referenceRules = r.references.length
    ? `Reference images: ${r.references.map((ref, index) => `Image ${index + 1 + referenceOffset} is ${ref.role || "a visual reference"}`).join("; ")}.`
    : "";
  const lockRules = r.lockedTraits.length
    ? `Traits that must remain unchanged: ${words(r.lockedTraits)}.`
    : "";

  return [
    "Asset type:",
    `One ${r.assetType} for a 2D video game.`,
    assetDirection(r),
    "",
    "Subject:",
    r.subject,
    "",
    "View and pose:",
    `${r.view} view; ${r.pose}. ${fullBody}`,
    "",
    "Pixel-art direction:",
    `Hand-crafted 2D pixel art. Crisp hard-edged clusters, deliberate pixel placement, no blur, no gradients, no anti-aliasing. Limited ${r.palette.maxColors}-color palette with a ${r.palette.mood} mood. Pixel scale requirement: ${pixelScaleDirection(r)} Every accessory, including small objects, must use the same apparent pixel-block size as the face, clothing and silhouette: no micro-pixels, no sub-grid detail, no fine dithering and no higher-resolution rendering inside accessories. The silhouette must remain readable after conversion to ${r.target.width}x${r.target.height} pixels.`,
    r.styleTags.length ? `Style labels (apply all consistently): ${words(r.styleTags)}.` : "",
    "",
    "Composition:",
    r.assetType === "tile"
      ? "Fill the entire square with an opaque seamless tile material. Opposite edges must connect exactly when the image repeats left-to-right and top-to-bottom. Do not add transparent pixels, a background matte, empty padding, frame, UI, labels, highlight glow, cast shadow, central object, directional lighting or edge border."
      : `Exactly one complete subject, centered, with ${r.composition.paddingPercent}% empty padding on every side. The background must be one perfectly uniform, opaque flat ${r.background.color} matte: no gradient, texture, shading, halo, purple edge bleed, or anti-aliasing into the subject. No aura, glow, bloom, rays, sparkles, particles, or emitted light around the asset. ${r.composition.groundShadow ? "A small controlled ground shadow is allowed." : "No floor and no cast shadow."}`,
    "",
    "Constraints:",
    `${words(r.constraints)}.`,
    referenceRules,
    lockRules,
    "",
    "Intended use:",
    `This image will be converted into a ${r.target.width}x${r.target.height} game asset. Prioritize a clean silhouette and readable color clusters over tiny detail.`,
  ].filter((line) => line !== undefined).join("\n");
}

export function buildEditPrompt(recipeInput, change) {
  const r = normalizeRecipe(recipeInput);
  const requiredLocks = r.lockedTraits.length ? r.lockedTraits : [r.subject, `${r.view} view`, `${r.palette.maxColors}-color palette`, `background ${r.background.color}`];
  return [
    "Use the supplied approved sprite anchor/reference image.",
    "",
    "Change only:",
    change,
    "",
    "Must remain unchanged:",
    words(requiredLocks),
    "",
    buildBasePrompt(r, 1),
    "",
    "Do not redesign the source asset. Do not add accessories, scenery, text, shadows, duplicate limbs, extra subjects, camera movement or a different perspective.",
  ].join("\n");
}
