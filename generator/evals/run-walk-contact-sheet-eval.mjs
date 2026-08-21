import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editOpenAI } from "../src/providers/openai.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.join(here, "..", ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2]; }
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unavailable");

const sourcePath = path.join(here, "fixtures", "upscaled-test.png");
const source = await fs.readFile(sourcePath);
const outputRoot = path.join(here, "results", `walk-contact-sheet-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await fs.mkdir(outputRoot, { recursive: true });
const recipe = normalizeRecipe({
  assetType: "frame",
  subject: "the exact approved compact desert ranger with teal hood, brass goggles, tan scarf and copper lantern",
  view: "left-3-4",
  pose: "two opposite walk contact keyframes",
  target: { width: 128, height: 96 },
  palette: { maxColors: 24, mood: "clean production pixel art" },
  pixelScale: "uniform-medium",
  composition: { paddingPercent: 0, fullBody: true, groundShadow: false },
  lockedTraits: ["exact identity, costume and accessories", "exact palette and pixel scale", "same left three-quarter camera", "copper lantern remains in the same hand"],
});
const change = [
  "Return one horizontal two-panel sprite sheet with exactly two equal cells and no gutter.",
  "LEFT cell is walk contact A: the character's anatomically near leg is clearly forward and visibly overlaps the far leg; the far leg reaches backward.",
  "RIGHT cell is the exact opposite walk contact B: the anatomically far leg has swung forward and is now visibly readable across/in front in screen space while the former forward near leg reaches backward.",
  "The two cells must not reuse the same front leg. Their knees, boots and overlap order must visibly exchange, like two opposite extremes of a traditional walk cycle.",
  "Keep the exact same character identity, scale, bottom baseline, camera, face, hood, goggles, scarf, torso, clothing, palette and pixel clusters in both cells.",
  "The copper lantern stays fully visible in the exact same hand with identical size and construction in both cells.",
  "Only limb articulation changes. No labels, borders, arrows, guide colors, duplicate characters within a cell, scenery, motion effects or redesign.",
].join(" ");
const result = await editOpenAI({ recipe, change, anchor: { bytes: source, mimeType: "image/png", filename: "immutable-identity-master.png" }, tier: "draft" });
await fs.writeFile(path.join(outputRoot, "contact-sheet-raw.png"), result.image);
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify({ callsUsed: 1, requestId: result.requestId, source: sourcePath }, null, 2));
console.log(JSON.stringify({ outputRoot, callsUsed: 1 }, null, 2));
