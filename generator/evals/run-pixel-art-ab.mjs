import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBasePrompt } from "../src/prompt-builder.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";
import { generateInternalPixelArt } from "../src/internal/openai-pixel-art.mjs";
import { buildPixelArtPromptV2, createPixelGridScaffold, pixelGridLayout } from "../src/internal/pixel-art-v2.mjs";
import { buildPixelArtPromptV3, createPixelGridScaffoldV3, pixelGridLayoutV3 } from "../src/internal/pixel-art-v3.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.join(here, "..", ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

function parseArgs(items) {
  return Object.fromEntries(items.map((item) => {
    const value = item.replace(/^--/, "");
    const separator = value.indexOf("=");
    return separator === -1 ? [value, "true"] : [value.slice(0, separator), value.slice(separator + 1)];
  }));
}

function parseTarget(value = "64x96") {
  const match = value.match(/^(\d+)x(\d+)$/i);
  if (!match) throw new Error("--target must use WIDTHxHEIGHT, for example --target=64x96");
  return { width: Number(match[1]), height: Number(match[2]) };
}

const args = parseArgs(process.argv.slice(2));
if (!args.subject) throw new Error("--subject is required. No provider call was made.");
const execute = args.execute === "true";
const allowedVariants = new Set(["v1", "v2", "v2-grid", "v3"]);
const variants = (args.variants || "v1,v2,v2-grid,v3").split(",").filter(Boolean);
if (!variants.length || variants.some((variant) => !allowedVariants.has(variant))) throw new Error("--variants must contain v1, v2, v2-grid, or v3");

const recipe = normalizeRecipe({
  assetType: args.assetType || "character",
  subject: args.subject,
  view: args.view || "left-3-4",
  pose: args.pose || "neutral idle pose",
  target: parseTarget(args.target),
  palette: { maxColors: Number(args.maxColors || 24), mood: args.mood || "clean game pixel art" },
  pixelScale: args.pixelScale || "uniform-medium",
});
const finalGrid = variants.length === 1 && variants[0] === "v3" ? pixelGridLayoutV3(recipe) : pixelGridLayout(recipe);

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = args.outputDir ? path.resolve(args.outputDir) : path.join(here, "results", "pixel-art-ab", runId);
await fs.mkdir(outputRoot, { recursive: true });
const manifest = {
  runId,
  createdAt: new Date().toISOString(),
  execute,
  recipe: { ...recipe, references: [] },
  variants: [],
  reviewCriteria: {
    colorFidelity: "Penalize any palette-wide yellow/ochre/sepia cast; named and neutral colors should remain distinct.",
    gridAdherence: `Inspect whether the raw model output follows the intended ${recipe.pixelScale} block rhythm of ${finalGrid.logicalWidth}x${finalGrid.logicalHeight} reference cells. Do not judge it by a forced resize; the detector must infer the returned grid.`,
    readability: `Judge the silhouette at the native ${recipe.target.width}x${recipe.target.height} resolution, not only the 1024px preview.`,
  },
};

for (const variant of variants) {
  const isV3 = variant === "v3";
  const variantRecipe = isV3 ? normalizeRecipe({ ...recipe, internalVariant: "v3-grid" }) : recipe;
  const grid = isV3 ? await createPixelGridScaffoldV3(variantRecipe) : variant === "v2-grid" ? await createPixelGridScaffold(variantRecipe) : null;
  const prompt = variant === "v1" ? buildBasePrompt(variantRecipe) : isV3 ? buildPixelArtPromptV3(variantRecipe) : buildPixelArtPromptV2(variantRecipe, { gridScaffold: Boolean(grid) });
  const v3Layout = isV3 ? pixelGridLayoutV3(variantRecipe) : null;
  const requestSize = v3Layout ? `${v3Layout.width}x${v3Layout.height}` : undefined;
  const promptFile = `${variant}.prompt.txt`;
  await fs.writeFile(path.join(outputRoot, promptFile), prompt, "utf8");
  const scaffoldFile = grid ? `${variant}-scaffold.png` : null;
  if (grid) await fs.writeFile(path.join(outputRoot, scaffoldFile), grid.bytes);

  const record = { variant, internalVariant: variantRecipe.internalVariant || null, promptFile, scaffoldFile, requestSize: requestSize ?? "1024x1024", status: execute ? "pending" : "dry-run" };
  manifest.variants.push(record);
  await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (!execute) continue;

  const started = Date.now();
  try {
    const result = await generateInternalPixelArt({ recipe: variantRecipe, prompt, images: grid ? [grid] : [], tier: args.tier || "draft", size: requestSize });
    const imageFile = `${variant}.png`;
    await fs.writeFile(path.join(outputRoot, imageFile), result.image);
    Object.assign(record, { status: "ok", imageFile, model: result.model, requestId: result.requestId, elapsedMs: Date.now() - started });
  } catch (error) {
    Object.assign(record, { status: "error", elapsedMs: Date.now() - started, error: { message: error.message, code: error.code || null, requestId: error.requestId || null } });
  }
  await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
}

console.log(`${execute ? "A/B generation" : "Dry run"} prepared at ${outputRoot}`);
if (!execute) console.log("No image-provider request was made. Add --execute=true only when a paid comparison is intended.");
