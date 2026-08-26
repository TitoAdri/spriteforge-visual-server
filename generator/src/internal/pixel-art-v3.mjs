import sharp from "sharp";
import { normalizeRecipe } from "../recipes.mjs";

const MIN_OUTPUT_PIXELS = 655_360;
const MAX_OUTPUT_PIXELS = 8_294_400;
const MAX_OUTPUT_EDGE = 3_840;

function words(items) {
  return items.filter(Boolean).join(", ");
}

function detailDensity(pixelScale) {
  const rules = {
    "uniform-coarse": "LARGE PIXELS: use very broad color clusters. Important shapes should usually span at least 2–3 logical cells; omit isolated single-cell accents except when essential for recognition.",
    "uniform-medium": "MEDIUM PIXELS: use balanced clusters. Important shapes may span 1–2 logical cells; reserve isolated single-cell accents for only a few essential marks.",
    "uniform-fine": "SMALL PIXELS: allow finer one-cell accents and narrower shape changes, but every mark must still occupy a complete logical cell on the same grid. Do not subdivide cells.",
  };
  return rules[pixelScale] || rules["uniform-medium"];
}

function logicalGridDimensions(recipe) {
  const multiplier = {
    "uniform-coarse": 0.5,
    "uniform-medium": 1,
    "uniform-fine": 2,
  }[recipe.pixelScale] || 1;

  return {
    width: Math.max(8, Math.round(recipe.target.width * multiplier)),
    height: Math.max(8, Math.round(recipe.target.height * multiplier)),
  };
}

function outputGridScale(width, height) {
  for (let scale = 1; scale <= MAX_OUTPUT_EDGE; scale += 1) {
    const outputWidth = width * scale;
    const outputHeight = height * scale;
    const pixels = outputWidth * outputHeight;
    if (
      outputWidth % 16 === 0 &&
      outputHeight % 16 === 0 &&
      pixels >= MIN_OUTPUT_PIXELS &&
      pixels <= MAX_OUTPUT_PIXELS &&
      Math.max(outputWidth, outputHeight) <= MAX_OUTPUT_EDGE &&
      Math.max(outputWidth, outputHeight) / Math.min(outputWidth, outputHeight) <= 3
    ) {
      return scale;
    }
  }
  throw new Error(`No valid GPT Image 2 canvas can map ${width}x${height} logical cells to equal square blocks`);
}

export function pixelGridLayoutV3(recipeInput) {
  const r = normalizeRecipe(recipeInput);
  const logical = logicalGridDimensions(r);
  const scale = outputGridScale(logical.width, logical.height);
  return {
    logicalWidth: logical.width,
    logicalHeight: logical.height,
    scale,
    width: logical.width * scale,
    height: logical.height * scale,
    left: 0,
    top: 0,
  };
}

export async function createPixelGridScaffoldV3(recipeInput, options = {}) {
  const layout = pixelGridLayoutV3(recipeInput);
  const dark = options.dark ?? 76;
  const light = options.light ?? 180;
  const pixels = Buffer.alloc(layout.width * layout.height * 4);

  for (let y = 0; y < layout.height; y += 1) {
    for (let x = 0; x < layout.width; x += 1) {
      const index = (y * layout.width + x) * 4;
      const gridX = Math.floor(x / layout.scale);
      const gridY = Math.floor(y / layout.scale);
      const value = (gridX + gridY) % 2 === 0 ? dark : light;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }

  const bytes = await sharp(pixels, {
    raw: { width: layout.width, height: layout.height, channels: 4 },
  }).png({ compressionLevel: 9 }).toBuffer();

  return {
    bytes,
    mimeType: "image/png",
    filename: `pixel-grid-v3-${layout.logicalWidth}x${layout.logicalHeight}.png`,
    role: `the authoritative full-canvas ${layout.logicalWidth} by ${layout.logicalHeight} logical-pixel paint template`,
    layout,
  };
}

export function buildPixelArtPromptV3(recipeInput) {
  const r = normalizeRecipe(recipeInput);
  const layout = pixelGridLayoutV3(r);
  const maxSubjectColumns = Math.max(4, Math.floor(layout.logicalWidth * 0.8125));
  const maxSubjectRows = Math.max(4, Math.floor(layout.logicalHeight * 0.875));
  const completeSubject = r.composition.fullBody
    ? "Show the complete subject, including the feet and every carried object."
    : "Show the complete asset without cropping.";
  const referenceRules = r.references.length
    ? `Additional references start at Image 2: ${r.references.map((ref, index) => `Image ${index + 2} is ${ref.role || "a visual reference"}`).join("; ")}. Use only their stated traits; Image 1 remains the grid authority.`
    : "";
  const lockRules = r.lockedTraits.length ? `Keep unchanged: ${words(r.lockedTraits)}.` : "";

  return [
    "OUTPUT CONTRACT — HIGHEST PRIORITY:",
    `Image 1 is the complete output canvas and an authoritative ${layout.logicalWidth}-column by ${layout.logicalHeight}-row paint-by-cell template. Preserve its exact canvas, aspect ratio and cell boundaries. One ${layout.scale}x${layout.scale} square in Image 1 equals exactly one indivisible logical output pixel.`,
    `Return a ${layout.width}x${layout.height} PNG preview of a genuinely low-resolution ${layout.logicalWidth}x${layout.logicalHeight} sprite enlarged by ${layout.scale}x nearest-neighbor blocks. This is a cell-coloring operation, not a free high-resolution redraw.`,
    "Assign exactly one flat color to every logical cell. Every color boundary and silhouette step must follow the supplied cell edges. Never split a cell, shade inside a cell, place sub-cell marks or invent a finer grid.",
    "Replace all gray checker cells. The checkerboard is temporary registration data, not transparency, texture, shading or visible content.",
    "",
    "SUBJECT:",
    r.subject,
    `${r.view} view; ${r.pose}. ${completeSubject}`,
    `Keep the complete subject within at most ${maxSubjectColumns} logical columns and ${maxSubjectRows} logical rows, centered with clear background cells around it.`,
    "Simplify aggressively for the cell budget. Express every named accessory through its silhouette and only two to four broad color clusters. Prefer recognition over decoration. Omit fabric texture, seams, scratches, tiny buckles, tiny highlights, micro-shadows, repeated trim and ornamental noise.",
    "",
    "PIXEL RENDERING:",
    `Hand-authored low-resolution game sprite with a limited palette of at most ${r.palette.maxColors} subject colors. Broad coherent clusters, hard staircase edges and no mixed pixel sizes.`,
    detailDensity(r.pixelScale),
    "No anti-aliasing, blur, gradients, soft curves, texture noise, fine dithering, partial cells, rotated pseudo-pixels, grid lines, labels, rulers, frame or visible checker pattern.",
    "",
    "COLOR:",
    "Keep named local colors distinct. Neutral whites and grays stay neutral; teal stays teal; explicitly warm materials remain local to those objects. No global yellow, ochre, sepia, beige, amber, brown or vintage wash.",
    "",
    "BACKGROUND:",
    r.assetType === "tile"
      ? "Fill the complete cell grid with one seamless opaque tile whose opposite edges connect exactly."
      : r.internalVariant === "v3-grid"
        ? "Return a genuinely transparent background around the subject. Do not add an opaque matte, checker pattern, shadow, glow, halo, particles, scenery or background texture."
        : `Every cell outside the subject must be the exact same flat opaque ${r.background.color} matte. No shadow, glow, halo, particles, scenery or background texture.`,
    referenceRules,
    lockRules,
    "",
    "FINAL CHECK:",
    `${words(r.constraints)}. Before finishing, verify that no feature is smaller than one supplied cell and that the subject stays inside the stated logical-cell budget.`,
  ].filter(Boolean).join("\n");
}
