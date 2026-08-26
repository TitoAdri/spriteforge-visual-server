import sharp from "sharp";
import { normalizeRecipe } from "../recipes.mjs";

const PREVIEW_SIZE = 1024;
const MAX_LOGICAL_CANVAS_SIDE = 768;

const words = (items) => items.filter(Boolean).join(", ");

function assetDirection(r) {
  const rules = {
    item: "Show one collectible or inventory item only. Keep its complete silhouette and interaction point readable; no hand, character, shelf or scene.",
    weapon: "Show one complete weapon or tool only. Keep its grip, working end and full silhouette visible; no hand, sheath, character or scene.",
    prop: "Show one standalone gameplay prop only, with a clear footprint and no surrounding furniture, characters or scenery.",
    environment: "Show one standalone scenery element only. Keep its footprint and full outer silhouette visible; do not turn it into a landscape scene.",
    building: "Show one complete standalone game building only. Keep roof, walls, entrance and base visible; no neighboring buildings, landscape or cropped architecture.",
    "ui-icon": "Show one front-facing game UI icon only. Use a bold readable pictogram; no letters, numbers, button chrome or interface panel.",
    "ui-panel": "Show one compact front-facing game UI ornament or panel element only; no readable text, numbers, screenshots or interface layout.",
    tile: "Create one opaque square seamless material tile. Fill the complete logical canvas and make opposite edges connect exactly; no central hero object, padding, matte, frame or isolated decoration.",
    frame: "Create exactly one animation frame of the supplied sprite. Preserve identity, costume, proportions, view, palette and logical pixel size; change only the requested pose phase.",
  };
  return rules[r.assetType] || "Show one standalone game asset only, with a clean readable silhouette and no surrounding scene.";
}

function detailDensity(pixelScale) {
  const rules = {
    "uniform-coarse": "Use broad clusters: important shapes should usually span at least 2 logical cells. Avoid isolated single-cell accents.",
    "uniform-medium": "Use balanced medium clusters: important shapes may span 1–2 logical cells. Reserve isolated single-cell accents for only a few essential marks.",
    "uniform-fine": "Fine one-cell accents are allowed sparingly, but every mark must still occupy a complete logical cell on the same grid.",
  };
  return rules[pixelScale] || rules["uniform-medium"];
}

function logicalGridDimensions(r) {
  return {
    // The internal A/B recipe's target is the grid we want GPT Image to
    // return. Pixel scale changes the prompt's block language, not a second
    // hidden target dimension that would later require forced reduction.
    nativePixelsPerCell: 1,
    width: r.target.width,
    height: r.target.height,
  };
}

export function pixelGridLayout(recipeInput, options = {}) {
  const r = normalizeRecipe(recipeInput);
  const logical = logicalGridDimensions(r);
  const previewSize = options.previewSize ?? PREVIEW_SIZE;
  const maxLogicalCanvasSide = options.maxLogicalCanvasSide ?? MAX_LOGICAL_CANVAS_SIDE;
  const scale = Math.max(1, Math.floor(maxLogicalCanvasSide / Math.max(logical.width, logical.height)));
  const width = logical.width * scale;
  const height = logical.height * scale;
  return {
    previewSize,
    requestedWidth: r.target.width,
    requestedHeight: r.target.height,
    nativePixelsPerCell: logical.nativePixelsPerCell,
    logicalWidth: logical.width,
    logicalHeight: logical.height,
    scale,
    width,
    height,
    left: Math.floor((previewSize - width) / 2),
    top: Math.floor((previewSize - height) / 2),
  };
}

function hexRgb(value) {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

export async function createPixelGridScaffold(recipeInput, options = {}) {
  const r = normalizeRecipe(recipeInput);
  const layout = pixelGridLayout(r, options);
  const matte = hexRgb(r.background.color);
  const dark = options.dark ?? 72;
  const light = options.light ?? 184;
  const pixels = Buffer.alloc(layout.previewSize * layout.previewSize * 4);

  for (let y = 0; y < layout.previewSize; y += 1) {
    for (let x = 0; x < layout.previewSize; x += 1) {
      const index = (y * layout.previewSize + x) * 4;
      const gridX = Math.floor((x - layout.left) / layout.scale);
      const gridY = Math.floor((y - layout.top) / layout.scale);
      const inside = x >= layout.left && x < layout.left + layout.width && y >= layout.top && y < layout.top + layout.height;
      const value = inside ? ((gridX + gridY) % 2 === 0 ? dark : light) : null;
      pixels[index] = value ?? matte.r;
      pixels[index + 1] = value ?? matte.g;
      pixels[index + 2] = value ?? matte.b;
      pixels[index + 3] = 255;
    }
  }

  const bytes = await sharp(pixels, {
    raw: { width: layout.previewSize, height: layout.previewSize, channels: 4 },
  }).png({ compressionLevel: 9 }).toBuffer();

  return {
    bytes,
    mimeType: "image/png",
    filename: `pixel-grid-${layout.logicalWidth}x${layout.logicalHeight}.png`,
    role: `a temporary ${layout.logicalWidth} by ${layout.logicalHeight} logical-pixel registration scaffold`,
    layout,
  };
}

export function buildPixelArtPromptV2(recipeInput, options = {}) {
  const r = normalizeRecipe(recipeInput);
  const layout = pixelGridLayout(r, options);
  const hasGridScaffold = Boolean(options.gridScaffold);
  const firstRecipeReference = hasGridScaffold ? 2 : 1;
  const referenceRules = r.references.length
    ? `Other references: ${r.references.map((ref, index) => `Image ${index + firstRecipeReference} is ${ref.role || "a visual reference"}`).join("; ")}. Use them only for the described visual traits; the logical-grid rules remain unchanged.`
    : "";
  const lockRules = r.lockedTraits.length ? `Keep these traits unchanged: ${words(r.lockedTraits)}.` : "";
  const completeSubject = r.composition.fullBody ? "Keep the complete subject visible, including the full body where applicable." : "Keep the complete asset visible.";

  return [
    "Goal:",
    `Create exactly one production-ready ${r.assetType} for a 2D video game.`,
    "",
    "Subject:",
    r.subject,
    assetDirection(r),
    "",
    "View and pose:",
    `${r.view} view; ${r.pose}. ${completeSubject}`,
    "",
    "Medium pixel-grid reference — strong visual invariant:",
    `Use one intended medium-scale grid of ${layout.logicalWidth} columns by ${layout.logicalHeight} rows as the block rhythm. One reference cell is indivisible: keep silhouettes and color changes aligned to this block scale and do not add finer detail inside a cell. The ${layout.previewSize}x${layout.previewSize} output remains the model's native preview canvas; preserve the returned image for grid detection and cleanup instead of forcing it down to this cell count.`,
    "Every color change and every silhouette step must land on that single shared integer grid. Fill whole cells only. Do not use mixed pixel sizes, half-cells, rotated pseudo-pixels, sub-grid marks, smooth curves, anti-aliasing, blur, gradients, texture noise or fine dithering. Do not draw grid lines, labels, rulers, a checkerboard or a frame in the finished image.",
    detailDensity(r.pixelScale),
    "",
    "Pixel-art rendering:",
    `Hand-crafted 2D pixel art with deliberate hard-edged color clusters and a limited palette of at most ${r.palette.maxColors} subject colors. Use the ${r.palette.mood} mood as art direction without sacrificing distinct material colors. Keep the silhouette readable at the native ${r.target.width}x${r.target.height} resolution.`,
    r.styleTags.length ? `Apply these style labels consistently: ${words(r.styleTags)}.` : "",
    "",
    "Color fidelity — hard invariant:",
    "Keep independent local colors distinct and maintain neutral channel balance across the complete asset. Neutral whites and grays must remain neutral; teal stays teal, blue stays blue, violet stays violet, and explicitly named metals or warm-colored objects keep only their own local hue. Do not apply a global yellow, ochre, sepia, beige, amber, brown or vintage wash. Do not shift unrelated colors toward yellow and do not impose one palette-wide tint.",
    "",
    "Composition:",
    r.assetType === "tile"
      ? "Fill every cell of the logical canvas with the opaque seamless tile material. Opposite edges must connect exactly. No padding, matte, central object, border or transparency."
      : `Place exactly one complete subject inside the logical canvas with about ${r.composition.paddingPercent}% empty padding on every side. Every unoccupied logical cell must be the same perfectly uniform opaque ${r.background.color} matte. No halo, edge bleed, texture, aura, particles or cast shadow.`,
    "",
    hasGridScaffold
      ? `Image 1 is a temporary registration scaffold, not visible content. Replace every gray checker cell in its centered ${layout.logicalWidth}x${layout.logicalHeight} cell work area with exactly one final subject color or the exact matte color. Preserve its cell boundaries and outer matte, but leave no gray cells or checker pattern in the finished image.`
      : "",
    referenceRules,
    lockRules,
    "",
    "Final constraints:",
    `${words(r.constraints)}. Prioritize the intended medium block rhythm, silhouette readability and clean color separation over tiny detail.`,
  ].filter(Boolean).join("\n");
}
