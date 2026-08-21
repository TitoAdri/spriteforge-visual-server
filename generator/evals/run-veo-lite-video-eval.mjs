import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const generatorRoot = path.resolve(here, "..");
const envPath = path.join(generatorRoot, ".env");
const sourcePath = path.join(here, "fixtures", "veo-ranger-9x16.png");
const resultRoot = path.join(here, "results", `veo-lite-${new Date().toISOString().replaceAll(":", "-")}`);

async function loadEnv(filePath) {
  const env = {};
  const text = await fs.readFile(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function findVideoPayload(operation) {
  const candidates = [
    operation?.response?.generateVideoResponse?.generatedSamples?.[0]?.video,
    operation?.response?.generatedVideos?.[0]?.video,
    operation?.response?.videos?.[0],
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.uri) return { uri: candidate.uri };
    if (candidate.videoUri) return { uri: candidate.videoUri };
    if (candidate.videoBytes) return { bytes: candidate.videoBytes };
    if (candidate.bytesBase64Encoded) return { bytes: candidate.bytesBase64Encoded };
  }
  return null;
}

async function apiFetch(url, apiKey, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "x-goog-api-key": apiKey,
      ...(options.headers || {}),
    },
  });
}

const env = await loadEnv(envPath);
const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is missing from generator/.env");

await fs.mkdir(resultRoot, { recursive: true });
const sourceBytes = await fs.readFile(sourcePath);
const model = "veo-3.1-lite-generate-preview";
const durationSeconds = 4;
const prompt = [
  "Create a four-second pixel-art walk-in-place animation from this exact starting frame.",
  "Keep the camera completely locked, with no pan, zoom, crop, shake, or reframing.",
  "Keep the full character centered at exactly the same ground position and apparent size for the entire video.",
  "Preserve the exact same ranger identity, teal hood, brass goggles, tan scarf, clothing, proportions, palette, lantern, facing direction, and hard pixel-art rendering.",
  "Animate a clear natural walk cycle in place: left leg forward then right leg forward, two readable alternating contact steps, opposite arm swing, subtle body rise and fall, and a small physically coherent lantern swing.",
  "The feet must not slide across the ground and the character must not travel horizontally.",
  "Use only crisp nearest-neighbor-looking pixel edges; no smoothing, motion blur, antialiasing, morphing, extra limbs, costume changes, lighting effects, glow, particles, shadows, scenery, text, or UI.",
  "Keep the background perfectly uniform solid chroma magenta #FF00FF in every frame.",
  "End very close to the starting pose so the video can loop. Silence: no dialogue, music, or sound effects.",
].join(" ");

const requestBody = {
  instances: [{
    prompt,
    image: {
      mimeType: "image/png",
      bytesBase64Encoded: sourceBytes.toString("base64"),
    },
  }],
  parameters: {
    aspectRatio: "9:16",
    durationSeconds,
    resolution: "720p",
    personGeneration: "allow_adult",
    seed: 120826,
  },
};

const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`;
const startedAt = new Date().toISOString();
const submitResponse = await apiFetch(endpoint, apiKey, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(requestBody),
});
const submitText = await submitResponse.text();
if (!submitResponse.ok) {
  throw new Error(`Veo submission failed (${submitResponse.status}): ${submitText.slice(0, 2000)}`);
}

let operation = JSON.parse(submitText);
if (!operation.name) throw new Error("Veo did not return a long-running operation name.");
console.log(`SUBMITTED ${operation.name}`);

const operationUrl = `https://generativelanguage.googleapis.com/v1beta/${operation.name}`;
const deadline = Date.now() + 8 * 60 * 1000;
let pollCount = 0;
while (!operation.done && Date.now() < deadline) {
  await sleep(10_000);
  pollCount += 1;
  const pollResponse = await apiFetch(operationUrl, apiKey);
  const pollText = await pollResponse.text();
  if (!pollResponse.ok) throw new Error(`Veo polling failed (${pollResponse.status}): ${pollText.slice(0, 2000)}`);
  operation = JSON.parse(pollText);
  console.log(`POLL ${pollCount} done=${Boolean(operation.done)}`);
}

if (!operation.done) throw new Error("Veo operation timed out after eight minutes.");
await fs.writeFile(path.join(resultRoot, "operation.json"), JSON.stringify(operation, null, 2));
if (operation.error) throw new Error(`Veo generation failed: ${JSON.stringify(operation.error)}`);

const payload = findVideoPayload(operation);
if (!payload) throw new Error("Veo completed but no video payload was found in the response.");

const videoPath = path.join(resultRoot, "ranger-walk-4s.mp4");
if (payload.bytes) {
  await fs.writeFile(videoPath, Buffer.from(payload.bytes, "base64"));
} else {
  const videoResponse = await apiFetch(payload.uri, apiKey, { redirect: "follow" });
  if (!videoResponse.ok) throw new Error(`Veo video download failed (${videoResponse.status})`);
  await fs.writeFile(videoPath, Buffer.from(await videoResponse.arrayBuffer()));
}

const manifest = {
  startedAt,
  completedAt: new Date().toISOString(),
  model,
  input: sourcePath,
  output: videoPath,
  prompt,
  parameters: requestBody.parameters,
  generationCalls: 1,
  estimatedUsd: 0.20,
  operationName: operation.name,
};
await fs.writeFile(path.join(resultRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`VIDEO ${videoPath}`);
console.log(`MANIFEST ${path.join(resultRoot, "manifest.json")}`);
