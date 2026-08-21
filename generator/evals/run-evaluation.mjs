import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "../src/providers/index.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(here, "..", ".env");
const envText = await fs.readFile(envFile, "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const args = Object.fromEntries(process.argv.slice(2).map((item) => item.replace(/^--/, "").split("=")));
const selected = args.provider || "both";
const tier = args.tier || "draft";
const providers = selected === "both" ? ["openai", "gemini"] : [selected];
if (!providers.every((provider) => ["openai", "gemini"].includes(provider))) throw new Error("--provider must be openai, gemini, or both");
if (!["draft", "final", "ultra"].includes(tier)) throw new Error("--tier must be draft, final, or ultra");

const allBriefs = JSON.parse(await fs.readFile(path.join(here, "briefs.json"), "utf8"));
const requestedIds = args.ids ? new Set(args.ids.split(",").filter(Boolean)) : null;
const briefs = requestedIds ? allBriefs.filter((brief) => requestedIds.has(brief.id) || (brief.group === "anchor" && [...requestedIds].some((id) => allBriefs.find((item) => item.id === id)?.anchorId === brief.id))) : allBriefs;
if (!briefs.length) throw new Error("No evaluation briefs matched --ids");
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const outputRoot = path.join(here, "results", runId);
await fs.mkdir(outputRoot, { recursive: true });
const manifest = { runId, startedAt: new Date().toISOString(), tier, providers, results: [] };
const anchors = new Map();

for (const providerName of providers) {
  const provider = getProvider(providerName);
  const providerDir = path.join(outputRoot, providerName);
  await fs.mkdir(providerDir, { recursive: true });
  for (const brief of briefs) {
    const recipe = normalizeRecipe(brief);
    const started = Date.now();
    try {
      let result;
      if (brief.group === "pose") {
        const anchor = anchors.get(`${providerName}:${brief.anchorId}`);
        if (!anchor) throw new Error(`Missing anchor for ${brief.anchorId}; anchor generation must succeed before pose evaluation`);
        result = await provider.edit({ recipe: anchor.recipe, change: brief.change, anchor: { bytes: anchor.bytes, mimeType: "image/png", filename: `${brief.anchorId}.png` }, tier, previousInteractionId: anchor.interactionId });
      } else {
        result = await provider.generate({ recipe, tier });
      }
      const extension = result.mimeType === "image/jpeg" ? "jpg" : "png";
      const filename = `${brief.id}.${extension}`;
      await fs.writeFile(path.join(providerDir, filename), result.image);
      if (brief.group === "anchor") anchors.set(`${providerName}:${brief.id}`, { recipe, bytes: result.image, interactionId: result.interactionId });
      manifest.results.push({ id: brief.id, group: brief.group, provider: providerName, model: result.model, file: `${providerName}/${filename}`, requestId: result.requestId, interactionId: result.interactionId, elapsedMs: Date.now() - started, status: "ok", review: null });
    } catch (error) {
      manifest.results.push({ id: brief.id, group: brief.group, provider: providerName, elapsedMs: Date.now() - started, status: "error", error: { message: error.message, code: error.code || null, requestId: error.requestId || null }, review: null });
      console.error(`[${providerName}] ${brief.id}: ${error.message}`);
    }
    await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  }
}
manifest.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Evaluation finished: ${outputRoot}`);
