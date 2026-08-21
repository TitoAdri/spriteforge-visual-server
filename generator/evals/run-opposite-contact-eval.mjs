import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editOpenAI } from "../src/providers/openai.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";
import { temporalEditPrompt, temporalPhaseFor } from "../../animation-temporal.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.join(here, "..", ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2]; }
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unavailable");
const sourcePath = path.join(here, "fixtures", "upscaled-test.png");
const source = await fs.readFile(sourcePath);
const outputRoot = path.join(here, "results", `walk-opposite-contact-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await fs.mkdir(outputRoot, { recursive: true });
const recipe = normalizeRecipe({
  assetType: "frame",
  subject: "the exact approved compact desert ranger with teal hood, brass goggles, tan scarf and copper lantern",
  view: "left-3-4",
  pose: temporalPhaseFor("walk", 4, 8),
  target: { width: 64, height: 96 },
  palette: { maxColors: 24, mood: "clean production pixel art" },
  pixelScale: "uniform-medium",
  composition: { paddingPercent: 3, fullBody: true, groundShadow: false },
  lockedTraits: ["exact face and skin tone", "teal hood and brass goggles", "tan scarf", "copper lantern", "exact costume construction", "exact palette and pixel cluster scale", "same left three-quarter view", "fixed bottom-center pivot"],
});
const change = temporalEditPrompt({ motion: "walk", index: 4, total: 8, userPrompt: "Create the opposite contact directly from the neutral master. There is no preceding walk frame: do not infer or preserve a previous leading leg." });
const result = await editOpenAI({ recipe, change, anchor: { bytes: source, mimeType: "image/png", filename: "immutable-identity-master.png" }, tier: "draft" });
await fs.writeFile(path.join(outputRoot, "opposite-contact-raw.png"), result.image);
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify({ callsUsed: 1, requestId: result.requestId, source: sourcePath }, null, 2));
console.log(JSON.stringify({ outputRoot, callsUsed: 1 }, null, 2));
