import { AuthError } from "../auth.mjs";

const BASE_URL = "https://api.pixelengine.ai/functions/v1";

function apiKey() {
  const key = String(process.env.PIXEL_ENGINE_API_KEY || "").trim();
  if (!key) throw new AuthError(503, "pixelengine_not_configured", "PixelEngine is not configured by the site owner.");
  return key;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${apiKey()}`, ...(options.headers || {}) }, signal: AbortSignal.timeout(30_000) });
  } catch (cause) {
    throw new AuthError(502, "pixelengine_unavailable", "PixelEngine could not be reached.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AuthError(response.status === 401 ? 503 : response.status >= 500 ? 502 : response.status, body?.error?.code || "pixelengine_request_failed", body?.error?.message || "PixelEngine rejected the request.");
  return body;
}

export async function startPixelEngineAnimation(payload) {
  const endpoint = payload.mode === "keyframes" ? "/keyframes" : "/animate";
  return request(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.body) });
}

export async function startPixelEngineBackgroundRemoval(bytes, mimeType = "image/webp") {
  const image = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  return request("/remove-background", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, rmbg_alpha_threshold: 128 }) });
}

export async function pollPixelEngineJob(jobId) {
  return request(`/jobs?id=${encodeURIComponent(jobId)}`);
}

export async function cancelPixelEngineJob(jobId) {
  return request("/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_job_id: jobId }) });
}

export async function downloadPixelEngineOutput(url) {
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(60_000) }); } catch { throw new AuthError(502, "pixelengine_download_failed", "PixelEngine completed the job but its output could not be downloaded."); }
  if (!response.ok) throw new AuthError(502, "pixelengine_download_failed", "PixelEngine completed the job but its output could not be downloaded.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new AuthError(502, "pixelengine_output_invalid", "PixelEngine returned an invalid animation output.");
  return { bytes, mimeType: String(response.headers.get("content-type") || "image/webp").split(";")[0] };
}
