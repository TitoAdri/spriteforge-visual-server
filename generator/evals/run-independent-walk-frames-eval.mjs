import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { editOpenAI } from "../src/providers/openai.mjs";
import { normalizeRecipe } from "../src/recipes.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const envText = await fs.readFile(path.join(here, "..", ".env"), "utf8").catch(() => "");
for (const line of envText.split(/\r?\n/)) { const match = line.match(/^([A-Z0-9_]+)=(.*)$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2]; }
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is unavailable");

const identityPath = path.join(here, "fixtures", "upscaled-test.png");
const identity = await fs.readFile(identityPath);
const outputRoot = path.join(here, "results", `independent-right-walk-${new Date().toISOString().replace(/[:.]/g, "-")}`);
await fs.mkdir(outputRoot, { recursive: true });
const manifest = { callsUsed: 0, identityPath, frames: [] };

for (let frame = 1; frame <= 3; frame += 1) {
  const templatePath = path.join(here, "fixtures", `right-walk-frame-${frame}.png`);
  const template = await fs.readFile(templatePath);
  const phase = frame === 1 ? "right-facing walk contact A" : frame === 2 ? "right-facing centered passing pose" : "right-facing opposite walk contact B";
  const recipe = normalizeRecipe({
    assetType: "frame",
    subject: "the exact approved compact desert ranger with teal hood, brass goggles, tan scarf and copper lantern",
    view: "right-profile",
    pose: phase,
    target: { width: 64, height: 96 },
    palette: { maxColors: 24, mood: "clean production pixel art" },
    pixelScale: "uniform-medium",
    composition: { paddingPercent: 3, fullBody: true, groundShadow: false },
    lockedTraits: ["exact face and skin tone", "teal hood and brass goggles", "tan scarf", "copper lantern", "exact costume construction", "exact palette and pixel cluster scale"],
    references: [{ bytes: template, mimeType: "image/png", role: `authoritative single-frame anatomical pose template for ${phase}; copy its exact hip, knee, ankle, boot, arm and torso positions and its limb overlap only` }],
  });
  const change = [
    `Create exactly one animation frame in the ${phase}.`,
    "Image 1 is the immutable identity master. Preserve its exact ranger identity, face, teal hood, brass goggles, tan scarf, costume construction, cape, palette, proportions, outline language, pixel clusters and copper lantern.",
    "Image 2 is the authoritative pose template for this frame. Match its body facing, torso angle, hip position, both knee bends, both ankle positions, boot directions, arm positions and which limbs overlap in front.",
    "Transfer only the pose from Image 2. Do not copy its mannequin identity, bald head, naked body, skin colors or rendering style.",
    "The copper lantern remains fully visible in the same anatomical hand and follows that hand without changing size or construction.",
    "One complete character only, fixed bottom-center pivot, uniform chroma-magenta background. No spritesheet, duplicate pose, extra character, text, border, scenery, shadow, glow, particles or motion blur.",
  ].join(" ");
  manifest.callsUsed += 1;
  await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
  const result = await editOpenAI({ recipe, change, anchor: { bytes: identity, mimeType: "image/png", filename: "immutable-ranger-identity.png" }, tier: "draft" });
  const filename = `frame-${String(frame).padStart(2, "0")}-raw.png`;
  await fs.writeFile(path.join(outputRoot, filename), result.image);
  manifest.frames.push({ frame, phase, templatePath, filename, requestId: result.requestId });
  await fs.writeFile(path.join(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
}

console.log(JSON.stringify({ outputRoot, callsUsed: manifest.callsUsed }, null, 2));
