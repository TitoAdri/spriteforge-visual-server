import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editOpenAI } from "../src/providers/openai.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";
import { buildEditPrompt } from "../src/prompt-builder.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.join(here, "..", ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2]; }
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unavailable");

const identityPath = path.join(here, "fixtures", "upscaled-test.png");
const templatePath = path.join(here, "fixtures", "right-walk-template.png");
const identity = await fs.readFile(identityPath);
const template = await fs.readFile(templatePath);
const outputRoot = path.join(here, "results", `right-walk-template-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await fs.mkdir(outputRoot, { recursive: true });

const recipe = normalizeRecipe({
  assetType: "frame",
  subject: "the exact approved compact desert ranger with teal hood, brass goggles, tan scarf and copper lantern",
  view: "right-profile",
  pose: "three-frame rightward walk template",
  target: { width: 192, height: 96 },
  palette: { maxColors: 24, mood: "clean production pixel art" },
  pixelScale: "uniform-medium",
  composition: { paddingPercent: 0, fullBody: true, groundShadow: false },
  lockedTraits: ["exact face and skin tone", "teal hood and brass goggles", "tan scarf", "copper lantern", "exact costume construction", "exact palette and pixel cluster scale"],
  references: [{ bytes: template, mimeType: "image/png", role: "authoritative three-cell right-facing walk pose template; copy its three poses, anatomical leg alternation, cell order, spacing and baseline only" }],
});

const change = [
  "Create one horizontal spritesheet containing exactly three equal cells, read left to right.",
  "Image 1 is the immutable character identity master. Reproduce this exact ranger in every cell: same face, teal hood, brass goggles, tan scarf, costume construction, cape, palette, proportions, outlines, pixel clusters and copper lantern.",
  "Image 2 is an authoritative three-frame walk-pose template facing IMAGE-RIGHT. Copy each cell's body articulation, anatomical leg alternation, boot overlap, arm swing, body facing, spacing and shared ground baseline.",
  "Do not copy Image 2's bald mannequin identity, skin rendering, colors or lack of clothing. Transfer only its poses onto the ranger.",
  "Cell 1 and cell 3 are opposite contacts: a different anatomical leg must lead in each. Cell 2 is the centered passing pose. Make this alternation unmistakable in knees, boots, shading and overlap.",
  "The lantern remains fully visible in the same anatomical hand in all three cells and follows the arm naturally without changing size or design.",
  "All cells use identical canvas size, character scale and bottom pivot. One character per cell. Use one uniform chroma-magenta background across the entire sheet.",
  "No labels, borders, gutters, arrows, text, scenery, shadows, glow, particles, motion blur, duplicated limbs or additional characters.",
].join(" ");

if (process.argv.includes("--print-payload")) {
  console.log(JSON.stringify({
    endpoint: "POST https://api.openai.com/v1/images/edits",
    form: {
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
      size: "1536x1024",
      quality: "low",
      output_format: "png",
      prompt: buildEditPrompt(recipe, change),
      images: [
        { field: "image[]", filename: "immutable-ranger-identity.png", mimeType: "image/png", path: identityPath },
        { field: "image[]", filename: "reference-1.png", mimeType: "image/png", path: templatePath, role: recipe.references[0].role },
      ],
    },
  }, null, 2));
  process.exit(0);
}

const result = await editOpenAI({ recipe, change, anchor: { bytes: identity, mimeType: "image/png", filename: "immutable-ranger-identity.png" }, tier: "draft" });
await fs.writeFile(path.join(outputRoot, "right-walk-sheet-raw.png"), result.image);
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify({ callsUsed: 1, requestId: result.requestId, identityPath, templatePath }, null, 2));
console.log(JSON.stringify({ outputRoot, callsUsed: 1 }, null, 2));
