// Deliberately small backend for the production generator service.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "./providers/index.mjs";
import { normalizeRecipe } from "./recipes.mjs";
import { assetV2GridLayout, buildAssetPromptV2 } from "./prompt-builder.mjs";
import { AuthError, createAuth } from "./auth.mjs";
import { createLibrary } from "./library.mjs";
import { startPixelEngineAnimation, pollPixelEngineJob, cancelPixelEngineJob, downloadPixelEngineOutput } from "./providers/pixelengine.mjs";
import { removeKnownMagentaMatte } from "./local-background-cleanup.mjs";
import { generatePixelEnginePrompt } from "./pixelengine-prompt-assistant.mjs";
import { exportAnimation } from "./animation-export.mjs";
import { CREDIT_COSTS, billingPlanForId, billingPlanForPriceId, creditCostForGeneration, publicBillingCatalog } from "./billing-catalog.mjs";
import { createBillingPortal, createCheckout, verifyWebhookSignature } from "./stripe.mjs";
import { generateInternalPixelArt } from "./internal/openai-pixel-art.mjs";
import { buildPixelArtPromptV3, createPixelGridScaffoldV3, pixelGridLayoutV3 } from "./internal/pixel-art-v3.mjs";
import { assessPlatformerTurnaround, normalizeTurnaround, turnaroundView } from "./turnaround.mjs";

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
const envText = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
for (const line of envText.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const port = Number(process.env.SPRITEFORGE_PORT || 3002);
const requestLog = new Map();
const boundedEnvInt = (name, fallback, minimum, maximum) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
};
const RATE_LIMIT_WINDOW_MS = boundedEnvInt("SPRITEFORGE_GENERATION_RATE_LIMIT_WINDOW_MS", 5 * 60 * 1000, 60 * 1000, 60 * 60 * 1000);
const RATE_LIMIT_MAX_REQUESTS = boundedEnvInt("SPRITEFORGE_GENERATION_RATE_LIMIT_MAX", 10, 1, 100);
const ANALYTICS_UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_ad", "utm_audience", "utm_term", "utm_content", "utm_id"];
const normalizeAttribution = (value) => {
  if (!value || typeof value !== "object") return null;
  const result = Object.fromEntries(ANALYTICS_UTM_KEYS.map((key) => [key, String(value[key] || "").trim().slice(0, 160)]).filter(([, item]) => item));
  return Object.keys(result).length ? result : null;
};
const auth = createAuth();
const library = createLibrary(auth);

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function sendFile(response, status, file) {
  response.writeHead(status, {
    "Content-Type": file.mimeType,
    "Content-Length": file.bytes.length,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(file.bytes);
}

function sendDownload(response, file) {
  response.writeHead(200, {
    "Content-Type": file.mimeType,
    "Content-Length": file.bytes.length,
    "Content-Disposition": `attachment; filename="${file.filename}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(file.bytes);
}

async function readJson(request, limit = 1_000_000) {
  const raw = await readRaw(request, limit);
  try { return JSON.parse(raw.toString("utf8")); } catch { throw new AuthError(400, "invalid_json", "Request body must be valid JSON"); }
}

async function readRaw(request, limit = 1_000_000) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new AuthError(413, "request_too_large", "Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function animationContinuityReferences(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 4) throw new AuthError(400, "invalid_animation_references", "Animation accepts up to four temporal references");
  return value.map((reference) => {
    const base64 = String(reference?.base64 || ""); const mimeType = String(reference?.mimeType || "").toLowerCase();
    if (!/^(image\/png|image\/jpeg|image\/webp)$/.test(mimeType) || base64.length < 16 || base64.length > 500_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new AuthError(400, "invalid_animation_reference", "Invalid preceding-frame reference");
    const bytes = Buffer.from(base64, "base64"); if (bytes.length < 8 || bytes.length > 350_000) throw new AuthError(400, "invalid_animation_reference", "Invalid preceding-frame reference size");
    const requestedRole = String(reference?.role || "").replace(/[^a-zA-Z0-9 .,;:()'/-]/g, "").slice(0, 180);
    return { bytes, mimeType, role: requestedRole || "a pose-only guide; copy its body pose but ignore its character design, colours, scale and details" };
  });
}

function pixelEngineEnabled() {
  return process.env.SPRITEFORGE_PIXELENGINE_ENABLED === "true";
}

function pixelEngineImage(value) {
  const base64 = String(value || "").replace(/^data:image\/png;base64,/i, "");
  if (!base64 || base64.length > 7_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new AuthError(400, "invalid_pixelengine_image", "Animation 3 needs a PNG source sprite.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 8 || bytes.length > 5 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new AuthError(400, "invalid_pixelengine_image", "Animation 3 needs a PNG source sprite under 5 MB.");
  return base64;
}

function pixelEnginePayload(payload = {}) {
  const mode = payload.mode === "keyframes" ? "keyframes" : "animate";
  const prompt = String(payload.prompt || "").trim();
  const negativePrompt = String(payload.negativePrompt || "").trim().slice(0, 1200);
  const outputFrames = Number(payload.outputFrames); const colors = Number(payload.colors);
  const canvasSize = Number(payload.transform?.canvasSize); const offsetX = Number(payload.transform?.offsetX || 0); const offsetY = Number(payload.transform?.offsetY || 0);
  if (!prompt || prompt.length > 3000) throw new AuthError(400, "invalid_pixelengine_prompt", "Write a motion prompt up to 3,000 characters.");
  if (!Number.isInteger(colors) || colors < 2 || colors > 256) throw new AuthError(400, "invalid_pixelengine_colors", "Choose between 2 and 256 colors.");
  if (!Number.isInteger(canvasSize) || canvasSize < 8 || canvasSize > 256 || !Number.isInteger(offsetX) || !Number.isInteger(offsetY) || Math.abs(offsetX) > 256 || Math.abs(offsetY) > 256) throw new AuthError(400, "invalid_pixelengine_transform", "Animation canvas settings are invalid.");
  const transform = { canvas_size: canvasSize, fill_method: ["edge-extend", "solid", "transparent"].includes(payload.transform?.fillMethod) ? payload.transform.fillMethod : "transparent", offset_x: offsetX, offset_y: offsetY };
  if (transform.fill_method === "solid") transform.fill_color = /^#[0-9a-f]{6}$/i.test(String(payload.transform?.fillColor || "")) ? payload.transform.fillColor : "#ff00ff";
  const seed = Number(payload.seed); const common = { prompt, negative_prompt: negativePrompt || undefined, pixel_config: { colors }, seed: Number.isInteger(seed) && seed >= 1 && seed <= 9_999_999_999 ? seed : undefined, output_format: "webp", matte_color: /^#[0-9a-f]{6}$/i.test(String(payload.matteColor || "")) ? payload.matteColor : "#ff00ff", transform };
  const backgroundCleanup = payload.backgroundCleanup !== false;
  if (mode === "animate") {
    if (!Number.isInteger(outputFrames) || outputFrames < 2 || outputFrames > 16 || outputFrames % 2) throw new AuthError(400, "invalid_pixelengine_frames", "PixelEngine animation requires 2–16 even frames.");
    return { mode, backgroundCleanup, body: { ...common, image: pixelEngineImage(payload.image), model: "pixel-engine-v1.1", output_frames: outputFrames } };
  }
  if (!Number.isInteger(outputFrames) || outputFrames < 3 || outputFrames > 20) throw new AuthError(400, "invalid_pixelengine_frames", "PixelEngine keyframes require 3–20 frames.");
  const frames = Array.isArray(payload.frames) ? payload.frames : [];
  if (!frames.length || frames.length > outputFrames) throw new AuthError(400, "invalid_pixelengine_keyframes", "Add between one and the total number of keyframes.");
  const used = new Set(); const normalized = frames.map((frame) => { const index = Number(frame?.index); const strength = Number(frame?.strength ?? 1); if (!Number.isInteger(index) || index < 0 || index >= outputFrames || used.has(index) || !Number.isFinite(strength) || strength < 0 || strength > 1) throw new AuthError(400, "invalid_pixelengine_keyframes", "Keyframes need unique valid positions and strengths."); used.add(index); return { index, image: pixelEngineImage(frame?.image), strength, placement: { offset_x: Number(frame?.offsetX || 0), offset_y: Number(frame?.offsetY || 0), flip_h: Boolean(frame?.flipH), flip_v: Boolean(frame?.flipV) } }; });
  return { mode, backgroundCleanup, body: { ...common, render_mode: "pixel", total_frames: outputFrames, frames: normalized } };
}

const pixelEngineJobResponse = (job, asset = null) => ({ id: job.id, status: job.status, progress: Number(job.progress || 0), error: job.error_code || null, model: job.model, asset: asset || (job.asset_id ? { id: job.asset_id } : null), cancelRequested: Boolean(job.cancel_requested_at) });

async function settlePixelEngineJob(request, user, currentJob) {
  let job = currentJob;
  if (["success", "failure", "cancelled"].includes(job.status)) return pixelEngineJobResponse(job);
  const state = await pollPixelEngineJob(job.api_job_id);
  const remoteStatus = String(state.status || "pending").toLowerCase();
  if (remoteStatus === "success") {
    job = library.updatePixelEngineJob(user.id, job.id, { status: "saving", progress: 0.98 });
    const outputUrl = state.output?.url;
    if (!outputUrl) throw new AuthError(502, "pixelengine_output_missing", "PixelEngine finished without an output URL.");
    const output = await downloadPixelEngineOutput(outputUrl);
    const cleaned = job.model.endsWith("+local-rmbg") ? await removeKnownMagentaMatte(output.bytes) : output.bytes;
    const saved = await library.saveAnimationOutput(request, { clipId: job.clip_id, base64: cleaned.toString("base64"), mimeType: "image/webp", model: job.model.replace(/\+local-rmbg$/, ""), prompt: job.prompt });
    library.linkAnimationOutput(job.clip_id, saved.id);
    try { auth.recordAnalyticsEvent({ eventName: "generation_completed", userId: user.id, product: "animation", metadata: { provider: "pixelengine", model: job.model } }); }
    catch (analyticsError) { console.warn({ event: "analytics_record_failed", code: analyticsError.code || "analytics_error" }); }
    job = library.updatePixelEngineJob(user.id, job.id, { status: "success", progress: 1, assetId: saved.id, errorCode: null });
    return pixelEngineJobResponse(job, saved);
  }
  if (["failure", "failed", "cancelled", "canceled"].includes(remoteStatus)) {
    const finalStatus = remoteStatus === "cancelled" || remoteStatus === "canceled" ? "cancelled" : "failure";
    job = library.updatePixelEngineJob(user.id, job.id, { status: finalStatus, progress: 0, errorCode: String(state.error?.message || state.error || (finalStatus === "cancelled" ? "Cancelled" : "PixelEngine failed")).slice(0, 500) });
    if (!job.credit_exempt && !job.refund_issued) { auth.refundGeneration(user.id, job.idempotency_key); job = library.updatePixelEngineJob(user.id, job.id, { refundIssued: true }); }
    return pixelEngineJobResponse(job);
  }
  const progress = Number(state.progress);
  job = library.updatePixelEngineJob(user.id, job.id, { status: job.cancel_requested_at ? "cancelling" : remoteStatus === "queued" ? "queued" : "pending", progress: Number.isFinite(progress) ? progress : job.progress });
  return pixelEngineJobResponse(job);
}

function mayGenerate(user) {
  if (!user.credit_exempt && !user.email_verified) return { ok: false, status: 403, code: "email_verification_required" };
  if (process.env.SPRITEFORGE_GENERATOR_ENABLED !== "true") return { ok: false, status: 503, code: "generator_disabled" };
  const now = Date.now();
  const key = `user:${user.id}`;
  const recent = (requestLog.get(key) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) return { ok: false, status: 429, code: "generation_rate_limited" };
  recent.push(now);
  requestLog.set(key, recent);
  return { ok: true };
}

async function generateCharacterV3(recipe) {
  const grid = await createPixelGridScaffoldV3(recipe);
  const layout = pixelGridLayoutV3(recipe);
  return generateInternalPixelArt({
    recipe,
    prompt: buildPixelArtPromptV3(recipe),
    images: [grid, ...(recipe.references || [])],
    tier: "draft",
    size: `${layout.width}x${layout.height}`,
  });
}

async function generateTransparentAssetV2(recipe) {
  const layout = assetV2GridLayout(recipe);
  return generateInternalPixelArt({
    recipe,
    prompt: buildAssetPromptV2(recipe),
    images: recipe.references || [],
    tier: "draft",
    size: `${layout.width}x${layout.height}`,
  });
}

http.createServer(async (request, response) => {
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  if (request.method === "GET" && ["/health", "/api/health"].includes(pathname)) return send(response, 200, { ok: true });
  if (request.method === "GET" && pathname === "/api/auth/me") {
    try { return send(response, 200, auth.status(request)); } catch (error) { console.error({ event: "auth_status_failed", message: error.message, code: error.code }); return send(response, error.status || 500, { error: "Authentication unavailable", code: error.code || "auth_error" }); }
  }
  if (request.method === "GET" && pathname === "/api/auth/google") {
    try { response.writeHead(302, { Location: auth.beginGoogle(request, response), "Cache-Control": "no-store" }); return response.end(); } catch (error) { return send(response, error.status || 400, { error: error.message || "Google sign-in unavailable", code: error.code || "google_auth_error" }); }
  }
  if (request.method === "GET" && pathname === "/api/auth/google/callback") {
    const query = new URL(request.url || "/", "http://localhost").searchParams;
    try {
      const result = await auth.completeGoogle(request, response, { state: query.get("state"), code: query.get("code") });
      const signupQuery = result.created ? `&signup=completed&signup_id=${encodeURIComponent(result.user.id)}` : "";
      response.writeHead(302, { Location: `/app?auth=google${signupQuery}`, "Cache-Control": "no-store" }); return response.end();
    } catch (error) { return send(response, error.status || 400, { error: error.message || "Google sign-in could not be completed", code: error.code || "google_auth_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/auth/verify-email") {
    try { return send(response, 200, auth.verifyEmail(request, response, (await readJson(request, 10_000)).token)); } catch (error) { return send(response, error.status || 400, { error: error.message || "Verification failed", code: error.code || "verification_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/auth/verify-email/resend") {
    try { return send(response, 200, await auth.resendVerification(request)); } catch (error) { return send(response, error.status || 400, { error: error.message || "Verification email could not be sent", code: error.code || "verification_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/auth/password-reset/request") {
    try { return send(response, 200, await auth.requestPasswordReset(request, await readJson(request, 20_000))); }
    catch (error) { return send(response, error.status || 400, { error: error.message || "Password reset could not be started", code: error.code || "password_reset_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/auth/password-reset/confirm") {
    try { return send(response, 200, await auth.resetPassword(request, response, await readJson(request, 20_000))); }
    catch (error) { return send(response, error.status || 400, { error: error.message || "Password reset failed", code: error.code || "password_reset_error" }); }
  }
  if (request.method === "GET" && pathname === "/api/billing/catalog") return send(response, 200, publicBillingCatalog());
  if (request.method === "POST" && pathname === "/api/analytics/events") {
    try { return send(response, 202, auth.trackAnalyticsEvent(request, await readJson(request, 12_000))); }
    catch (error) { return send(response, error.status || 400, { error: error.message || "Analytics event rejected", code: error.code || "analytics_error" }); }
  }
  if (request.method === "GET" && pathname === "/api/analytics/summary") {
    try {
      const query = new URL(request.url || "/", "http://localhost").searchParams;
      return send(response, 200, auth.analyticsSummary(request, { from: Date.parse(query.get("from") || ""), to: Date.parse(query.get("to") || "") }));
    } catch (error) { return send(response, error.status || 400, { error: error.message || "Analytics summary unavailable", code: error.code || "analytics_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/stripe/webhook") {
    try {
      const event = verifyWebhookSignature(await readRaw(request, 1_000_000), request.headers["stripe-signature"]);
      const result = auth.processStripeEvent(event, {
        planForPriceId: billingPlanForPriceId,
        planForId: billingPlanForId,
      });
      return send(response, 200, { received: true, duplicate: result.duplicate });
    } catch (error) {
      console.warn({ event: "stripe_webhook_rejected", code: error.code || "stripe_webhook_error", status: error.status || 400 });
      return send(response, error.status || 400, { error: "Webhook rejected", code: error.code || "stripe_webhook_error" });
    }
  }
  if (request.method === "GET" && pathname === "/api/billing/status") {
    try { return send(response, 200, auth.billingStatus(request)); } catch (error) { return send(response, error.status || 400, { error: error.message, code: error.code || "billing_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/billing/checkout") {
    try {
      const body = await readJson(request, 10_000); const user = auth.requireVerified(request, { csrf: true }); const attribution = normalizeAttribution(body.attribution);
      const plan = billingPlanForId(String(body.planId || ""));
      if (!plan) throw new AuthError(400, "invalid_plan", "Choose a valid billing plan");
      const session = await createCheckout({ user, plan, attribution });
      try { auth.recordAnalyticsEvent({ eventName: "checkout_started", planId: plan.id, userId: user.id, valueCents: Math.round(plan.monthlyUsd * 100), currency: "USD", metadata: { source: "stripe_checkout", ...(attribution ? { attribution } : {}) } }); } catch (analyticsError) { console.warn({ event: "analytics_record_failed", code: analyticsError.code || "analytics_error" }); }
      return send(response, 200, { url: session.url });
    } catch (error) { console.warn({ event: "stripe_checkout_failed", code: error.code || "stripe_checkout_error", status: error.status || 400 }); return send(response, error.status || 400, { error: error.message || "Checkout could not be started", code: error.code || "stripe_checkout_error" }); }
  }
  if (request.method === "POST" && pathname === "/api/billing/portal") {
    try {
      const { customer } = auth.billingCustomer(request);
      const session = await createBillingPortal({ customerId: customer?.stripe_customer_id });
      return send(response, 200, { url: session.url });
    } catch (error) { return send(response, error.status || 400, { error: error.message || "Billing portal unavailable", code: error.code || "billing_portal_error" }); }
  }
  if (request.method === "POST" && ["/api/auth/register", "/api/auth/login", "/api/auth/logout"].includes(pathname)) {
    try {
      const result = pathname === "/api/auth/logout" ? auth.logout(request, response) : pathname === "/api/auth/register" ? await auth.register(request, response, await readJson(request)) : await auth.login(request, response, await readJson(request));
      return send(response, 200, result);
    } catch (error) {
      console.warn({ event: "auth_request_failed", code: error.code || "auth_error", status: error.status || 400 });
      return send(response, error.status || 400, { error: error.message || "Authentication request failed", code: error.code || "auth_error" });
    }
  }
  try {
    if (request.method === "GET" && pathname === "/api/library") return send(response, 200, library.list(request));
    if (request.method === "POST" && pathname === "/api/pixelengine/prompt-assist") {
      auth.requireVerified(request, { csrf: true }); const body = await readJson(request, 20_000); const usage = auth.consumePromptAssist(request, 5);
      try {
        const result = await generatePixelEnginePrompt({ sourceName: body.sourceName, motion: body.motion, frames: Number(body.frames), canvas: Number(body.canvas), colors: Number(body.colors), request: body.request, constraints: body.constraints });
        return send(response, 200, { ...result, remaining: usage.remaining, exempt: usage.exempt });
      } catch (error) { if (!usage.exempt) auth.refundPromptAssist(usage.user.id, usage.usageDay); throw error; }
    }
    if (request.method === "POST" && pathname === "/api/projects") return send(response, 201, library.createProject(request, await readJson(request)));
    const assetProjectRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/project$/i);
    if (assetProjectRoute && request.method === "PATCH") return send(response, 200, library.assignAssetProject(request, assetProjectRoute[1], await readJson(request)));
    if (request.method === "POST" && pathname === "/api/themes") return send(response, 201, library.createTheme(request, await readJson(request)));
    if (request.method === "PUT" && pathname === "/api/themes/default") return send(response, 200, library.setDefaultTheme(request, (await readJson(request)).themeId ?? null));
    const themeRoute = pathname.match(/^\/api\/themes\/([0-9a-f-]{36})$/i);
    if (themeRoute && request.method === "PATCH") return send(response, 200, library.updateTheme(request, themeRoute[1], await readJson(request)));
    const themeRefRoute = pathname.match(/^\/api\/themes\/([0-9a-f-]{36})\/references$/i);
    if (themeRefRoute && request.method === "POST") return send(response, 201, library.addThemeReference(request, themeRefRoute[1], (await readJson(request)).assetId));
    if (request.method === "POST" && pathname === "/api/collections") return send(response, 201, library.createCollection(request, await readJson(request)));
    if (request.method === "POST" && pathname === "/api/asset-packs") return send(response, 201, library.createAssetPack(request, await readJson(request)));
    const packRetryRoute = pathname.match(/^\/api\/asset-packs\/([0-9a-f-]{36})\/items\/([0-9a-f-]{36})\/retry$/i);
    if (packRetryRoute && request.method === "POST") return send(response, 200, library.retryPackItem(request, packRetryRoute[1], packRetryRoute[2]));
    if (request.method === "POST" && pathname === "/api/tilesets") return send(response, 201, library.createTileset(request, await readJson(request)));
    const tilesetRetryRoute = pathname.match(/^\/api\/tilesets\/([0-9a-f-]{36})\/tiles\/([0-9a-f-]{36})\/retry$/i);
    if (tilesetRetryRoute && request.method === "POST") return send(response, 200, library.retryTilesetTile(request, tilesetRetryRoute[1], tilesetRetryRoute[2]));
    if (request.method === "POST" && pathname === "/api/animations") return send(response, 201, library.createAnimationClip(request, await readJson(request)));
    const animationClipDeleteRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})$/i);
    if (animationClipDeleteRoute && request.method === "DELETE") return send(response, 200, library.deleteAnimationClip(request, animationClipDeleteRoute[1]));
    if (request.method === "POST" && pathname === "/api/pixelengine/animations") {
      const user = auth.requireVerified(request, { csrf: true }); if (!pixelEngineEnabled()) throw new AuthError(503, "pixelengine_disabled", "Animation 3 is temporarily disabled by the site owner.");
      const body = await readJson(request, 8_000_000); const clipId = String(body.clipId || ""); const payload = pixelEnginePayload(body.request);
      // The clip is created by the client first so it remains a user-owned library record.
      if (!/^[0-9a-f-]{36}$/i.test(clipId)) throw new AuthError(400, "invalid_animation_clip", "Create the animation record before submitting it.");
      const ownedClip = library.list(request).animations.find((item) => item.id === clipId); if (!ownedClip) throw new AuthError(404, "not_found", "Animation record not found.");
      const access = mayGenerate(user); if (!access.ok) throw new AuthError(access.status, access.code, access.code === "generation_rate_limited" ? `Generation limit reached: ${RATE_LIMIT_MAX_REQUESTS} generations every ${Math.round(RATE_LIMIT_WINDOW_MS / 60_000)} minutes.` : "Generation is temporarily unavailable.");
      const idempotencyKey = request.headers["idempotency-key"]; const debit = auth.debitGeneration(request, idempotencyKey, CREDIT_COSTS.animation, { product: "animation", provider: "pixel-engine" });
      try {
        const started = await startPixelEngineAnimation(payload);
        if (!started?.api_job_id) throw new AuthError(502, "pixelengine_invalid_response", "PixelEngine did not return a job ID.");
        const baseModel = payload.mode === "keyframes" ? "ltx-keyframes-v1" : "pixel-engine-v1.1";
        const job = library.createPixelEngineJob(user, { clipId, apiJobId: started.api_job_id, model: `${baseModel}${payload.backgroundCleanup ? "+local-rmbg" : ""}`, prompt: payload.body.prompt, idempotencyKey, creditExempt: debit.exempt });
        return send(response, 202, pixelEngineJobResponse(job));
      } catch (error) { if (!debit.exempt) auth.refundGeneration(user.id, idempotencyKey); throw error; }
    }
    const pixelEngineJobRoute = pathname.match(/^\/api\/pixelengine\/animations\/([0-9a-f-]{36})$/i);
    if (pixelEngineJobRoute && request.method === "POST") {
      const { user, job } = library.getPixelEngineJob(request, pixelEngineJobRoute[1], true);
      return send(response, 200, await settlePixelEngineJob(request, user, job));
    }
    if (pixelEngineJobRoute && request.method === "DELETE") {
      const { user, job } = library.getPixelEngineJob(request, pixelEngineJobRoute[1], true);
      if (["success", "failure", "cancelled"].includes(job.status)) return send(response, 409, pixelEngineJobResponse(job));
      await cancelPixelEngineJob(job.api_job_id);
      const updated = library.updatePixelEngineJob(user.id, job.id, { status: "cancelling", cancelRequestedAt: Date.now() });
      return send(response, 202, pixelEngineJobResponse(updated));
    }
    const animationGeometryRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/geometry$/i);
    if (animationGeometryRoute && request.method === "POST") return send(response, 200, library.updateAnimationGeometry(request, animationGeometryRoute[1], await readJson(request)));
    const animationClipRegenerateRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/regenerate$/i);
    if (animationClipRegenerateRoute && request.method === "POST") return send(response, 200, library.regenerateAnimationClip(request, animationClipRegenerateRoute[1]));
    const animationSheetStartRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/sheet\/start$/i);
    if (animationSheetStartRoute && request.method === "POST") return send(response, 200, library.startAnimationSheet(request, animationSheetStartRoute[1]));
    const animationSheetFailRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/sheet\/fail$/i);
    if (animationSheetFailRoute && request.method === "POST") return send(response, 200, library.failAnimationSheet(request, animationSheetFailRoute[1], await readJson(request)));
    const animationRetryRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/frames\/([0-9a-f-]{36})\/retry$/i);
    if (animationRetryRoute && request.method === "POST") return send(response, 200, library.retryAnimationFrame(request, animationRetryRoute[1], animationRetryRoute[2]));
    const animationRegenerateRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/frames\/([0-9a-f-]{36})\/regenerate$/i);
    if (animationRegenerateRoute && request.method === "POST") return send(response, 200, library.regenerateAnimationFrame(request, animationRegenerateRoute[1], animationRegenerateRoute[2]));
    const animationAttachRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/frames\/([0-9a-f-]{36})\/attach$/i);
    if (animationAttachRoute && request.method === "POST") return send(response, 200, library.attachAnimationFrame(request, animationAttachRoute[1], animationAttachRoute[2], await readJson(request)));
    const animationKeyframeRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/frames\/([0-9a-f-]{36})\/keyframe$/i);
    if (animationKeyframeRoute && request.method === "PUT") return send(response, 200, library.setAnimationKeyframe(request, animationKeyframeRoute[1], animationKeyframeRoute[2], await readJson(request)));
    if (animationKeyframeRoute && request.method === "DELETE") return send(response, 200, library.clearAnimationKeyframe(request, animationKeyframeRoute[1], animationKeyframeRoute[2]));
    const animationInsertRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/frames$/i);
    if (animationInsertRoute && request.method === "POST") return send(response, 201, library.insertAnimationFrame(request, animationInsertRoute[1], await readJson(request)));
    const animationDeleteRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/frames\/([0-9a-f-]{36})$/i);
    if (animationDeleteRoute && request.method === "DELETE") return send(response, 200, library.deleteAnimationFrame(request, animationDeleteRoute[1], animationDeleteRoute[2]));
    const animationRetakeRoute = pathname.match(/^\/api\/animations\/([0-9a-f-]{36})\/retake$/i);
    if (animationRetakeRoute && request.method === "POST") return send(response, 200, library.retakeAnimationRange(request, animationRetakeRoute[1], await readJson(request)));
    if (request.method === "POST" && pathname === "/api/presets") return send(response, 201, library.createPreset(request, await readJson(request)));
    if (request.method === "POST" && pathname === "/api/assets") return send(response, 201, library.createAsset(request, await readJson(request)));
    if (request.method === "POST" && pathname === "/api/editor/uploads") return send(response, 201, await library.uploadEditorAsset(request));
    const editorRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/editor$/i);
    if (editorRoute && request.method === "GET") return send(response, 200, await library.editorInfo(request, editorRoute[1]));
    const editorImportRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/editor\/import$/i);
    if (editorImportRoute && request.method === "GET") return sendFile(response, 200, await library.fetchEditorAnimationImport(request, editorImportRoute[1]));
    const editorRevisionListRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/editor\/revisions$/i);
    if (editorRevisionListRoute && request.method === "POST") return send(response, 201, await library.saveEditorRevision(request, editorRevisionListRoute[1], await readJson(request, 32 * 1024 * 1024)));
    const editorRevisionRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/editor\/revisions\/([0-9a-f-]{36})$/i);
    if (editorRevisionRoute && request.method === "GET") return sendFile(response, 200, await library.fetchEditorRevision(request, editorRevisionRoute[1], editorRevisionRoute[2]));
    const editorCopyRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/editor\/copies$/i);
    if (editorCopyRoute && request.method === "POST") return send(response, 201, await library.copyEditorAsset(request, editorCopyRoute[1], await readJson(request, 32 * 1024 * 1024)));
    const fileRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/files\/(original|game-ready|thumbnail|animation)$/i);
    if (fileRoute && request.method === "PUT") return send(response, 201, await library.uploadFile(request, fileRoute[1], fileRoute[2]));
    if (fileRoute && request.method === "GET") return sendFile(response, 200, await library.fetchFile(request, fileRoute[1], fileRoute[2]));
    const animationExportRoute = pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/export\/(gif|spritesheet)$/i);
    if (animationExportRoute && request.method === "GET") {
      const source = await library.fetchFile(request, animationExportRoute[1], "animation");
      return sendDownload(response, await exportAnimation(source.bytes, animationExportRoute[2].toLowerCase()));
    }
  } catch (error) {
    console.warn({ event: "library_request_failed", code: error.code || "library_error", status: error.status || 400 });
    return send(response, error.status || 400, { error: error.message || "Library request failed", code: error.code || "library_error" });
  }
  if (request.method !== "POST" || !["/api/generate", "/api/edit"].includes(pathname)) return send(response, 404, { error: "Not found" });
  let debit = null;
  let idempotencyKey = null;
  let generationJob = null;
  // Once the asset and any collection context have been committed, a client
  // disconnect must not turn a successful paid generation into a free one.
  let generationCompleted = false;
  let packItem = null;
  let tilesetTile = null;
  let animationFrame = null;
  let turnaroundSource = null;
  try {
    const body = await readJson(request);
    // The public product uses one tested image stack. Ignore client-supplied
    // provider values so the choice cannot be changed through a crafted request.
    const providerName = "openai";
    const provider = getProvider(providerName);
    let recipe = normalizeRecipe(body.recipe);
    idempotencyKey = request.headers["idempotency-key"];
    const user = auth.requireVerified(request, { csrf: true });
    const access = mayGenerate(user);
    if (!access.ok) throw new AuthError(access.status, access.code, access.code === "generation_rate_limited" ? `Generation limit reached: ${RATE_LIMIT_MAX_REQUESTS} generations every ${Math.round(RATE_LIMIT_WINDOW_MS / 60_000)} minutes.` : "Generation is temporarily unavailable.");
    const action = pathname === "/api/generate" ? "generate" : "edit";
    const turnaround = body.turnaround == null ? null : normalizeTurnaround(body.turnaround);
    if (turnaround) {
      if (user.role !== "admin") throw new AuthError(403, "admin_required", "Sprite Turnaround is available to administrators only");
      if (action !== "edit") throw new AuthError(400, "invalid_turnaround_action", "Sprite turnarounds must use image editing");
      turnaroundSource = await library.turnaroundSource(user, turnaround.sourceAssetId);
      const sourceRecipe = turnaroundSource.asset.recipe || {};
      const sourceFileTarget = turnaroundSource.variant === "game-ready" && Number.isInteger(turnaroundSource.width) && Number.isInteger(turnaroundSource.height) && turnaroundSource.width >= 8 && turnaroundSource.width <= 256 && turnaroundSource.height >= 8 && turnaroundSource.height <= 256 ? { width: turnaroundSource.width, height: turnaroundSource.height } : null;
      const sourceTarget = sourceFileTarget || (sourceRecipe.target && Number.isInteger(sourceRecipe.target.width) && Number.isInteger(sourceRecipe.target.height) ? sourceRecipe.target : recipe.target);
      recipe = normalizeRecipe({
        ...sourceRecipe,
        ...recipe,
        assetType: ["character", "enemy", "npc"].includes(turnaroundSource.asset.kind) ? turnaroundSource.asset.kind : "character",
        subject: `${turnaroundSource.asset.name} · ${turnaround.targetDirection} turnaround`,
        view: turnaroundView(turnaround),
        pose: sourceRecipe.pose || "preserve the source pose exactly",
        target: sourceTarget,
        background: { mode: "transparent", color: "#FF00FF" },
        composition: { ...(sourceRecipe.composition || {}), fullBody: true, groundShadow: false },
        references: [],
        internalVariant: "sprite-turnaround",
        turnaround,
      });
    }
    const requestedVariant = String(body.pixelArtVariant || "").toLowerCase();
    const requestedPixelArtV3 = requestedVariant === "v3";
    const useTransparentAssetV2 = requestedVariant === "asset-transparent-v2";
    if (requestedPixelArtV3 && (action !== "generate" || recipe.assetType !== "character")) throw new AuthError(400, "invalid_pixel_art_variant", "Pixel art V3 is available for character generation only.");
    if (useTransparentAssetV2 && (action !== "generate" || !["item", "weapon", "prop", "environment", "building", "ui-icon"].includes(recipe.assetType))) throw new AuthError(400, "invalid_pixel_art_variant", "This asset generation flow is not available for the requested operation.");
    // V3 is the official character-generation pipeline. Apply it server-side
    // even to older clients that do not yet send pixelArtVariant.
    const usePixelArtV3 = action === "generate" && recipe.assetType === "character";
    if (usePixelArtV3) recipe = normalizeRecipe({ ...recipe, internalVariant: "v3-grid" });
    else if (useTransparentAssetV2) recipe = normalizeRecipe({ ...recipe, internalVariant: "asset-transparent-v2" });
    const creditCost = creditCostForGeneration({ action, body });
    debit = auth.debitGeneration(request, idempotencyKey, creditCost, { product: turnaround ? "sprite_turnaround" : body.tileset ? "tileset_tile" : body.assetPack ? "asset_pack_item" : action === "edit" ? "edit" : String(body.recipe?.assetType || "asset"), provider: providerName });
    const generationContexts = Number(Boolean(body.assetPack?.id && body.assetPack?.itemId)) + Number(Boolean(body.tileset?.id && body.tileset?.tileId)) + Number(Boolean(body.animation?.id && body.animation?.frameId)) + Number(Boolean(turnaround));
    if (generationContexts > 1) throw new AuthError(400, "invalid_generation_context", "Choose one generation context");
    if (body.assetPack?.id && body.assetPack?.itemId) packItem = library.reservePackItem(debit.user, body.assetPack.id, body.assetPack.itemId);
    if (body.tileset?.id && body.tileset?.tileId) tilesetTile = library.reserveTilesetTile(debit.user, body.tileset.id, body.tileset.tileId);
    if (body.animation?.id && body.animation?.frameId) { if (pathname !== "/api/edit") throw new AuthError(400, "invalid_animation_request", "Animation frames must edit a source sprite"); animationFrame = library.reserveAnimationFrame(debit.user, body.animation.id, body.animation.frameId); }
    const resolvedTheme = await library.resolveTheme(debit.user, body.themeId);
    if (resolvedTheme) {
      const settings = resolvedTheme.settings || {};
      recipe = normalizeRecipe({ ...recipe, styleTags: [...new Set([...resolvedTheme.styleTags, ...recipe.styleTags])].slice(0, 8), pixelScale: usePixelArtV3 || useTransparentAssetV2 ? recipe.pixelScale : settings.pixelScale || recipe.pixelScale, view: recipe.lockView ? recipe.view : settings.view || recipe.view, palette: { ...recipe.palette, ...(settings.palette || {}) }, subject: resolvedTheme.theme.direction ? `${recipe.subject}. Theme direction: ${resolvedTheme.theme.direction}` : recipe.subject, references: resolvedTheme.references });
    }
    if (body.continuityReferences != null) { const continuity = animationContinuityReferences(body.continuityReferences); if (continuity.length) recipe = normalizeRecipe({ ...recipe, references: [...continuity, ...recipe.references].slice(0, 5) }); }
    generationJob = library.createGenerationJob(debit.user, { provider: providerName, model: null, idempotencyKey });
    if (action === "edit" && !body.anchor?.base64 && !turnaroundSource) throw new Error("anchor.base64 is required for edits");
    const args = {
      recipe, tier: turnaround ? "final" : "draft", change: body.change,
      previousInteractionId: body.previousInteractionId || null,
      anchor: turnaroundSource || (body.anchor ? { bytes: Buffer.from(body.anchor.base64, "base64"), mimeType: body.anchor.mimeType, filename: body.anchor.filename } : undefined),
    };
    const result = usePixelArtV3 ? await generateCharacterV3(recipe) : useTransparentAssetV2 ? await generateTransparentAssetV2(recipe) : await provider[action](args);
    if (turnaround?.projection === "platformer") {
      const assessment = await assessPlatformerTurnaround(turnaroundSource.bytes, result.image);
      if (!assessment.changed) throw new AuthError(422, "turnaround_direction_not_changed", "The model kept the original facing direction");
    }
    const savedAsset = await library.saveGenerationResult(debit.user, generationJob, { provider: result.provider, model: result.model, recipe, bytes: result.image, mimeType: result.mimeType, themeId: body.themeId || null, collectionId: packItem?.pack.collection_id || tilesetTile?.tileset.collection_id || animationFrame?.clip.collection_id || null, parentAssetId: turnaroundSource?.asset.id || animationFrame?.clip.source_asset_id || null });
    if (packItem) library.completePackItem(debit.user, packItem.id, savedAsset.id);
    if (tilesetTile) library.completeTilesetTile(debit.user, tilesetTile.id, savedAsset.id);
    if (animationFrame) library.completeAnimationFrame(debit.user, animationFrame.id, savedAsset.id);
    try {
      auth.recordAnalyticsEvent({ eventName: "generation_completed", userId: debit.user.id, product: turnaround ? "sprite_turnaround" : body.tileset ? "tileset" : body.assetPack ? "asset_pack" : action === "edit" ? "edit" : String(body.recipe?.assetType || "asset"), metadata: { provider: result.provider, model: result.model } });
    } catch (analyticsError) { console.warn({ event: "analytics_record_failed", code: analyticsError.code || "analytics_error" }); }
    generationCompleted = true;
    send(response, 200, { provider: result.provider, model: result.model, mimeType: result.mimeType, requestId: result.requestId, interactionId: result.interactionId, creditsCharged: debit.exempt ? 0 : creditCost, asset: savedAsset, imageBase64: result.image.toString("base64") });
  } catch (error) {
    if (!generationCompleted && generationJob && debit) { try { library.failGenerationJob(debit.user, generationJob, error.code || "generation_failed"); } catch {} }
    if (!generationCompleted && packItem && debit) { try { library.failPackItem(debit.user, packItem.id, error.code || "generation_failed"); } catch {} }
    if (!generationCompleted && tilesetTile && debit) { try { library.failTilesetTile(debit.user, tilesetTile.id, error.code || "generation_failed"); } catch {} }
    if (!generationCompleted && animationFrame && debit) { try { library.failAnimationFrame(debit.user, animationFrame.id, error.code || "generation_failed"); } catch {} }
    if (!generationCompleted && debit && !debit.exempt && idempotencyKey) {
      try { auth.refundGeneration(debit.user.id, idempotencyKey); } catch (refundError) { console.error({ event: "credit_refund_failed", message: refundError.message }); }
    }
    console.error({ message: error.message, status: error.status, code: error.code, requestId: error.requestId });
    send(response, error.status || 400, { error: "Generation request failed", code: error.code || "request_error", requestId: error.requestId || null });
  }
}).listen(port, "0.0.0.0", () => console.log(`SpriteForge generator API listening on internal port ${port}`));
