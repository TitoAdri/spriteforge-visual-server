import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { editOpenAI } from "../src/providers/openai.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";
import { temporalEditPrompt, temporalPhaseFor } from "../../animation-temporal.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);
const projectRoot = path.join(here, "..", "..");
const envText = await fs.readFile(path.join(here, "..", ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2]; }

const args = Object.fromEntries(process.argv.slice(2).map((item) => item.replace(/^--/, "").split("=")));
const maximumCalls = Math.min(40, Math.max(1, Number(args.maxCalls || 40)));
const referenceScale = Math.min(8, Math.max(1, Number(args.referenceScale || 1)));
const useDepthGuide = String(args.depthGuide || "false").toLowerCase() === "true";
const sourcePath = path.resolve(projectRoot, args.source || "generator/evals/results/2026-07-29T14-32-10-920Z/gemini/char-01.jpg");
const motions = String(args.motions || "idle:2,walk:4").split(",").map((entry) => { const [motion, count] = entry.split(":"); return { motion, count: Number(count) }; });
if (motions.some(({ motion, count }) => !["idle", "walk"].includes(motion) || !Number.isInteger(count) || count < 2 || count > 8)) throw new Error("--motions must contain idle or walk with 2-8 frames");
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unavailable");

const source = await fs.readFile(sourcePath);
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(here, "results", `animation-gpt-${runId}`);
await fs.mkdir(outputRoot, { recursive: true });
const extension = path.extname(sourcePath).toLowerCase();
const sourceMime = extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
await fs.writeFile(path.join(outputRoot, `source${extension || ".png"}`), source);
const manifest = { runId, provider: "openai", model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2", source: sourcePath, maximumCalls, callsUsed: 0, motions: [] };

async function saveManifest() { await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2)); }
async function countedEdit(args) {
  if (manifest.callsUsed >= maximumCalls) throw new Error(`Evaluation call budget exhausted at ${maximumCalls}`);
  manifest.callsUsed += 1;
  await saveManifest();
  return editOpenAI(args);
}
async function normalizeFrame(inputPath, outputPath) {
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "prepare-animation-source.ps1"), "-InputPath", inputPath, "-OutputPath", outputPath, "-Width", "64", "-Height", "96"], { windowsHide: true });
}
async function upscaleReference(inputPath, outputPath) {
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "upscale-animation-reference.ps1"), "-InputPath", inputPath, "-OutputPath", outputPath, "-Scale", String(referenceScale)], { windowsHide: true });
}

const recipeBase = normalizeRecipe({
  assetType: "frame",
  subject: "the exact approved compact desert ranger with teal hood, brass goggles, tan scarf and copper lantern",
  view: "left-3-4",
  pose: "animation frame",
  target: { width: 64, height: 96 },
  palette: { maxColors: 24, mood: "clean production pixel art" },
  pixelScale: "uniform-medium",
  composition: { paddingPercent: 3, fullBody: true, groundShadow: false },
  lockedTraits: ["exact face and skin tone", "teal hood and brass goggles", "tan scarf", "copper lantern", "exact costume construction", "exact palette and pixel cluster scale", "same left three-quarter view", "fixed bottom-center pivot"],
});

for (const spec of motions) {
  const motionDir = path.join(outputRoot, spec.motion);
  await fs.mkdir(motionDir, { recursive: true });
  await fs.writeFile(path.join(motionDir, `frame-01${extension || ".png"}`), source);
  const anchorReferencePath = path.join(motionDir, "anchor-reference.png");
  await upscaleReference(sourcePath, anchorReferencePath);
  const anchorReference = await fs.readFile(anchorReferencePath);
  let previous = anchorReference; let previousMime = "image/png";
  const motionResult = { motion: spec.motion, frameCount: spec.count, frames: [{ position: 0, file: `frame-01${extension || ".png"}`, source: true }] };
  manifest.motions.push(motionResult);
  for (let index = 1; index < spec.count; index += 1) {
    const started = Date.now();
    const references = [{ bytes: previous, mimeType: previousMime, role: "immediately preceding accepted animation frame; use only for temporal continuity while the first image remains the identity master" }];
    if (useDepthGuide && spec.motion === "walk") {
      const guidePath = path.join(motionDir, `frame-${String(index + 1).padStart(2, "0")}-depth-guide.png`);
      await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "make-walk-depth-guide.ps1"), "-OutputPath", guidePath, "-Index", String(index), "-Total", String(spec.count)], { windowsHide: true });
      references.push({ bytes: await fs.readFile(guidePath), mimeType: "image/png", role: "abstract anatomical pose and depth guide: cyan near leg is drawn over orange far leg; copy positions and overlap only, never colors or rendering" });
    }
    const recipe = normalizeRecipe({ ...recipeBase, pose: temporalPhaseFor(spec.motion, index, spec.count), references });
    const prompt = temporalEditPrompt({ motion: spec.motion, index, total: spec.count, userPrompt: spec.motion === "idle" ? "a restrained readable breathing loop" : "a readable in-place game walk cycle with alternating legs" });
    try {
      const result = await countedEdit({ recipe, change: prompt, anchor: { bytes: anchorReference, mimeType: "image/png", filename: "immutable-identity-master.png" }, tier: "draft" });
      const rawFile = `frame-${String(index + 1).padStart(2, "0")}-raw.png`; const frameFile = `frame-${String(index + 1).padStart(2, "0")}.png`;
      await fs.writeFile(path.join(motionDir, rawFile), result.image); await normalizeFrame(path.join(motionDir, rawFile), path.join(motionDir, frameFile));
      const previousReferencePath = path.join(motionDir, `frame-${String(index + 1).padStart(2, "0")}-reference.png`);
      await upscaleReference(path.join(motionDir, frameFile), previousReferencePath);
      previous = await fs.readFile(previousReferencePath); previousMime = "image/png";
      motionResult.frames.push({ position: index, phase: recipe.pose, file: frameFile, rawFile, requestId: result.requestId, elapsedMs: Date.now() - started, status: "ok" });
    } catch (error) {
      motionResult.frames.push({ position: index, phase: recipe.pose, elapsedMs: Date.now() - started, status: "error", error: error.message, code: error.code || null, requestId: error.requestId || null });
      await saveManifest(); throw error;
    }
    await saveManifest();
  }
}
manifest.finishedAt = new Date().toISOString();
await saveManifest();
console.log(JSON.stringify({ outputRoot, callsUsed: manifest.callsUsed, maximumCalls }, null, 2));
