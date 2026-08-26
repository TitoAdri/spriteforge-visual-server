import { normalizeRecipe } from "./recipes.mjs";
import { ISOMETRIC_DIRECTIONS, normalizeTurnaround } from "./turnaround.mjs";

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

const ASSET_V2_MIN_OUTPUT_PIXELS = 655_360;
const ASSET_V2_MAX_OUTPUT_PIXELS = 8_294_400;
const ASSET_V2_MAX_OUTPUT_EDGE = 3_840;

export function assetV2GridLayout(recipeInput) {
  const r = normalizeRecipe(recipeInput);
  const multiplier = {
    // Without a visual scaffold GPT Image 2 consistently renders roughly
    // twice the requested logical density. Use a text-only calibration so
    // the detected result lands near Character's public large/medium/small
    // scales while preserving the cheaper generations endpoint.
    "uniform-coarse": 0.125,
    "uniform-medium": 0.25,
    "uniform-fine": 0.5,
  }[r.pixelScale] || 0.25;
  const logicalWidth = Math.max(8, Math.round(r.target.width * multiplier));
  const logicalHeight = Math.max(8, Math.round(r.target.height * multiplier));

  for (let scale = 1; scale <= ASSET_V2_MAX_OUTPUT_EDGE; scale += 1) {
    const width = logicalWidth * scale;
    const height = logicalHeight * scale;
    const pixels = width * height;
    if (
      width % 16 === 0 &&
      height % 16 === 0 &&
      pixels >= ASSET_V2_MIN_OUTPUT_PIXELS &&
      pixels <= ASSET_V2_MAX_OUTPUT_PIXELS &&
      Math.max(width, height) <= ASSET_V2_MAX_OUTPUT_EDGE &&
      Math.max(width, height) / Math.min(width, height) <= 3
    ) {
      return { logicalWidth, logicalHeight, scale, width, height };
    }
  }
  throw new Error(`No valid GPT Image 2 canvas can map ${logicalWidth}x${logicalHeight} Asset Generator 2 cells to equal square blocks`);
}

export function buildAssetPromptV2(recipeInput) {
  const r = normalizeRecipe({ ...recipeInput, internalVariant: "asset-transparent-v2" });
  const layout = assetV2GridLayout(r);
  const maxSubjectColumns = Math.max(4, Math.floor(layout.logicalWidth * 0.8125));
  const maxSubjectRows = Math.max(4, Math.floor(layout.logicalHeight * 0.875));
  const density = {
    "uniform-coarse": "LARGE PIXELS: use very broad clusters. Omit isolated single-cell accents unless essential for recognition.",
    "uniform-medium": "MEDIUM PIXELS: use balanced clusters. Reserve isolated single-cell accents for only a few essential marks.",
    "uniform-fine": "SMALL PIXELS: finer one-cell accents are allowed, but every mark must still occupy one complete cell on the same grid.",
  }[r.pixelScale] || "MEDIUM PIXELS: use balanced clusters.";
  const referenceRules = r.references.length
    ? `Optional style references: ${r.references.map((ref, index) => `Image ${index + 1} is ${ref.role || "a visual reference"}`).join("; ")}. They may guide only the named visual traits and never override the grid contract.`
    : "";
  const lockRules = r.lockedTraits.length ? `Keep unchanged: ${words(r.lockedTraits)}.` : "";

  return [
    "OUTPUT CONTRACT — HIGHEST PRIORITY:",
    `Construct this as an exact ${layout.logicalWidth}-column by ${layout.logicalHeight}-row sprite on one uniform invisible logical grid. This is a genuinely low-resolution source image.`,
    `Return a ${layout.width}x${layout.height} transparent PNG preview made by enlarging that logical sprite exactly ${layout.scale}x with nearest-neighbor square blocks. One ${layout.scale}x${layout.scale} output square equals one indivisible logical pixel.`,
    "Every silhouette step, color boundary, highlight and internal feature must align to those cell boundaries. Assign one flat color per occupied cell. Never split a cell, shade inside a cell, mix pixel sizes, rotate pseudo-pixels or introduce a finer grid.",
    "The grid and pixel density stated in this OUTPUT CONTRACT are authoritative. Ignore any conflicting large, medium, small, coarse, fine or pixel-scale wording inside the asset description, Theme direction, style labels or reference descriptions.",
    "This must be genuinely low-resolution pixel art enlarged cleanly. Do not create a smooth high-resolution illustration and imitate pixel art with a mosaic overlay, tiny square texture, soft rendering or post-effect.",
    "The logical grid is invisible construction geometry only. Do not draw grid lines, rulers, checkerboards or a visible cell template.",
    "",
    "ASSET:",
    `One ${r.assetType} for a 2D video game.`,
    assetDirection(r),
    r.subject,
    `${r.view} view; ${r.pose}. Keep the complete asset visible and uncropped.`,
    `Keep the complete asset within at most ${maxSubjectColumns} logical columns and ${maxSubjectRows} logical rows, centered with clear transparent cells around it.`,
    "Simplify aggressively for the cell budget. Express each material and named detail through a small number of broad color clusters; omit tiny seams, scratches, texture, ornamental noise and micro-highlights.",
    "",
    "PIXEL RENDERING:",
    `Hand-authored game pixel art with at most ${r.palette.maxColors} colors and a ${r.palette.mood} mood. Broad coherent clusters, crisp staircase edges and one consistent block scale across every part of the asset.`,
    density,
    "No anti-aliasing, blur, gradients, translucency inside the subject, soft curves, smooth gloss, bloom, glow, soft shadows, texture noise, fine dithering or sub-grid detail.",
    r.styleTags.length ? `Style labels: ${words(r.styleTags)}. Apply them without increasing the logical detail density.` : "",
    "",
    "BACKGROUND:",
    "Return genuine alpha transparency around the asset. No opaque backdrop, black field, colored matte, checkerboard, gradient, scenery, floor, cast shadow, halo, aura, particles or emitted light.",
    referenceRules,
    lockRules,
    "",
    "FINAL CHECK:",
    `${words(r.constraints)}. Before finishing, verify that the complete design uses only the stated logical grid, no feature is smaller than one logical cell, and no smooth or high-resolution detail remains.`,
  ].filter(Boolean).join("\n");
}

export function buildBasePrompt(recipeInput, referenceOffset = 0) {
  const r = normalizeRecipe(recipeInput);
  const nativeTransparency = r.internalVariant === "asset-transparent-v2";
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
      : nativeTransparency
        ? `Exactly one complete isolated subject, centered, with ${r.composition.paddingPercent}% transparent padding on every side. Return a genuinely transparent background around the subject: no solid backdrop, checkerboard, gradient, texture, scenery, halo or background color. No aura, glow, bloom, rays, sparkles, particles, emitted light, floor or cast shadow.`
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
  if (r.internalVariant === "sprite-turnaround") return buildTurnaroundPrompt(r);
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

const DIRECTION_DESCRIPTIONS = Object.freeze({
  up: "screen-up, a rear-facing isometric orientation with the back most visible",
  "up-right": "screen-up-right, a rear-right three-quarter isometric orientation",
  right: "screen-right, a right-facing isometric profile",
  "down-right": "screen-down-right, a front-right three-quarter isometric orientation",
  down: "screen-down, a front-facing isometric orientation with the chest or face most visible",
  "down-left": "screen-down-left, a front-left three-quarter isometric orientation",
  left: "screen-left, a left-facing isometric profile",
  "up-left": "screen-up-left, a rear-left three-quarter isometric orientation",
});

function isometricRotation(source, target) {
  const from = ISOMETRIC_DIRECTIONS.indexOf(source);
  const to = ISOMETRIC_DIRECTIONS.indexOf(target);
  const clockwiseSteps = (to - from + ISOMETRIC_DIRECTIONS.length) % ISOMETRIC_DIRECTIONS.length;
  if (clockwiseSteps <= 4) return `${clockwiseSteps * 45} degrees clockwise around the character's vertical axis`;
  return `${(ISOMETRIC_DIRECTIONS.length - clockwiseSteps) * 45} degrees counter-clockwise around the character's vertical axis`;
}

export function buildTurnaroundPrompt(recipeInput) {
  const r = normalizeRecipe(recipeInput);
  const t = normalizeTurnaround(r.turnaround);
  const platformer = t.projection === "platformer";
  const projection = platformer
    ? "Use the same fixed orthographic 2D side-view camera and the same baseline. Image 1 is a horizontally mirrored spatial guide derived from the approved source; it is authoritative for target facing, pose envelope, placement, silhouette and the screen-side positions of all asymmetries. Reconstruct a genuine view of the opposite physical side; do not merely mirror the identity, costume details or source pixels, and do not simply return the guide pixels. Image 2 remains authoritative for identity, materials and physical-side ownership."
    : `Use the exact same fixed parallel isometric camera, elevation, foreshortening, scale and ground-plane orientation as Image 1. The requested target is ${DIRECTION_DESCRIPTIONS[t.targetDirection]}.`;
  const rotation = platformer
    ? `Rotate the character 180 degrees around its vertical axis, from ${t.sourceDirection}-facing to ${t.targetDirection}-facing.`
    : `Rotate only the character ${isometricRotation(t.sourceDirection, t.targetDirection)}, from ${DIRECTION_DESCRIPTIONS[t.sourceDirection]} to ${DIRECTION_DESCRIPTIONS[t.targetDirection]}. Do not orbit, tilt, zoom or move the camera.`;
  const identityImage = platformer ? "Image 2" : "Image 1";
  const hidden = t.hiddenDetails
    ? `When newly visible surfaces are not shown in ${identityImage}, reveal only these user-specified details: ${t.hiddenDetails}. Infer the minimum connecting geometry needed; do not invent additional ornaments.`
    : "For newly visible surfaces, infer only the minimum plausible continuation of visible materials, colors, seams and anatomy. Do not invent logos, ornaments, weapons, pockets or accessories.";
  const imageAuthority = platformer
    ? "Image 1 is the target-facing spatial anchor: its screen-side placement of the body, hands, weapon, shield and every carried item is mandatory. Image 2 is the approved unmirrored identity source and is authoritative for character identity, materials and which physical hand or body side owns each item."
    : "Image 1 is the approved identity and style anchor.";

  return [
    "TASK — SPRITE TURNAROUND:",
    imageAuthority,
    "Produce exactly one new sprite of that same character at the requested facing direction.",
    "This is a controlled viewpoint reconstruction, not a redesign, pose change, animation frame or new character.",
    "",
    "VIEW SYSTEM:",
    projection,
    rotation,
    "",
    "IDENTITY AND ASYMMETRY:",
    "Preserve the same character identity, anatomy, proportions, silhouette mass, costume, equipment, materials, palette, outline language and apparent pixel size.",
    "Preserve physical left/right ownership of every asymmetric feature. A shield, scar, pouch, shoulder pad or weapon stays attached to the same physical side of the character even when it moves to the opposite side of the image.",
    platformer ? "HARD EQUIPMENT-SIDE LOCK: every held or carried item must occupy the screen side shown in Image 1, opposite its screen side in Image 2. The weapon and shield must trade screen sides without trading physical hands. Do not move an item back to a familiar or conventional hand." : null,
    platformer ? "Do not preserve the source's screen-left/screen-right arrangement from Image 2; use Image 1 for the required target-side arrangement." : "Do not copy screen-left and screen-right placement as if the source were a mirror template.",
    "",
    "BODY AND POSE LOCK:",
    `Treat the subject as a ${t.bodyType === "biped" ? "biped with coherent shoulders, hips, hands and feet" : t.bodyType === "quadruped" ? "quadruped with coherent forelegs, hind legs, spine and tail" : "custom body plan whose visible joint relationships must remain coherent"}.`,
    "Keep the same neutral pose phase, limb contacts, stance width, center of mass, vertical placement and canvas occupancy. Rotate the body as a rigid character turnaround; do not swap limbs, duplicate limbs or change the action.",
    "",
    "SPRITE CONSISTENCY:",
    `Preserve the source's low-resolution pixel-art construction for a ${r.target.width}x${r.target.height} game sprite: crisp hard-edged clusters, no anti-aliasing, no blur, no gradients, no micro-pixels and no higher-resolution detail.`,
    `Use at most ${r.palette.maxColors} colors and preserve the source palette relationships. Keep the complete sprite centered and uncropped with the same transparent padding and feet/baseline placement.`,
    hidden,
    "",
    "OUTPUT CONTRACT:",
    "Return one isolated sprite only on genuine alpha transparency. No backdrop, checkerboard, floor, cast shadow, halo, text, labels, direction arrows, guide lines, extra views, sprite sheet or duplicated character.",
    platformer ? "Before finishing, compare both images: match Image 1 for target facing and exact screen-side equipment placement; match Image 2 for identity and physical-side ownership. Verify pose lock, limb count, silhouette scale and transparency." : "Before finishing, verify the target facing, fixed camera, physical-side asymmetries, pose lock, limb count, silhouette scale and transparent background against Image 1.",
  ].filter((line) => line !== null).join("\n");
}
