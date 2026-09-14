import { clearCreditUpgrade, showCreditUpgrade } from "/frontend/credit-alert.js?v=2";

const MOTIONS = {
  idle: { title: "Idle", frames: 6, prompt: "Create an in-place idle loop. The character breathes subtly, shifts weight once, keeps both feet planted on the same ground line, then returns exactly to the starting pose. Preserve identity, scale and facing direction." },
  walk: { title: "Walk", frames: 8, prompt: "Create an in-place side-view walk cycle. Alternate left and right foot contact clearly, with opposite arm swings. Keep the character's bottom pivot on one ground line and finish on a seamless loop." },
  run: { title: "Run", frames: 8, prompt: "Create a readable in-place run cycle with clear alternating strides, opposing arms and a stable character scale. The first and final frame must loop seamlessly." },
  custom: { title: "Custom", frames: 8, prompt: "Describe the full motion: starting pose, key extremes, recovery and ending pose. Preserve the character identity, facing direction and pixel-art style." },
};
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const cookie = (name) => document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const sourceUrl = (asset) => asset?.files?.["game-ready"]?.url || asset?.files?.original?.url || "";
const requestKey = () => { const bytes = new Uint8Array(24); if (!globalThis.crypto?.getRandomValues) throw new Error("Your browser cannot create a secure generation request."); globalThis.crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); };
const animationSourceId = (item) => item?.parent_asset_id || item?.recipe?.sourceAssetId || "";
const animationResultMarkup = (item) => {
  const animationUrl = item.files.animation.url;
  const sourceId = animationSourceId(item);
  return `<article class="a4-result-card"><div class="a4-result-preview checker"><img src="${escape(animationUrl)}" alt="${escape(item.name)}" /></div><div class="a4-result-info"><span>READY · SPRITEFORGE ANIMATION</span><h2>${escape(item.name)}</h2><p>Your animated WebP is ready in your library.</p><small>Game-ready animation · transparent background</small><div class="a4-result-actions"><a class="a4-result-download" href="${escape(animationUrl)}" download>Download animation</a><button class="a4-result-edit" data-a4-edit="${escape(item.id)}" type="button">Edit pixel art →</button><button class="a4-result-view" data-a4-view-app="${escape(item.id)}" type="button">View in app →</button><button class="a4-result-again" data-a4-again="${escape(sourceId)}" type="button" ${sourceId ? "" : "disabled title=\"Source sprite unavailable\""}>Animate again →</button></div></div></article>`;
};

export const animation4Markup = ({ assets = [], animations = [], jobs = [] } = {}) => {
  const sources = assets.filter((asset) => sourceUrl(asset) && !["frame", "animation", "spritesheet", "tileset", "tile", "reference"].includes(asset.kind));
  // The saved output asset is the source of truth: it also covers clips created before
  // outputAssetId was recorded in their settings.
  const completed = assets.filter((item) => item.kind === "animation" && item.files?.animation?.url);
  return `<section class="a4-view"><header class="a4-head"><div><span>ANIMATE · PIXEL ENGINE</span><h1>Animate a sprite</h1><p>Select a library sprite, describe one motion, then receive a cleaned game-ready animation.</p></div><button data-studio-view="assets" type="button">My assets →</button></header><section class="a4-shell"><form class="a4-panel"><div class="a4-step"><b>1</b><div><label>Choose a sprite</label><small>From your private library</small></div><button class="a4-upload" data-a4-upload data-library-import data-library-import-return="animation" type="button">↑ Upload</button></div><div class="a4-sources">${sources.length ? sources.slice(0, 12).map((asset, index) => `<button class="a4-source ${index === 0 ? "active" : ""}" data-a4-source="${asset.id}" type="button"><img src="${sourceUrl(asset)}" alt="" /><span>${escape(asset.name)}</span></button>`).join("") : `<p>No compatible sprite yet. Create or upload one first.</p>`}</div><div class="a4-step"><b>2</b><div><label>Describe the motion</label><small>Pixel Engine creates the complete loop jointly.</small></div></div><textarea name="prompt" maxlength="3000">${MOTIONS.idle.prompt}</textarea><details class="a4-avoid"><summary>Avoid unwanted changes</summary><input name="negative" value="blurry, anti-aliasing, gradients, duplicate character, extra limbs, cropped body, camera motion, text, watermark, particles, glow, motion blur" maxlength="1200" /></details><div class="a4-motions">${Object.entries(MOTIONS).map(([key, motion], index) => `<button data-a4-motion="${key}" class="${index === 0 ? "active" : ""}" type="button"><b>${motion.title}</b><small>${motion.frames} frames</small></button>`).join("")}</div><div class="a4-options"><label>Frames<select name="frames">${[2,4,6,8,10,12,14,16].map((value) => `<option value="${value}" ${value === 6 ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Colors<select name="colors">${[12,16,20,24,32,48].map((value) => `<option value="${value}" ${value === 24 ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Canvas<select name="canvas">${[64,96,128,160,192,256].map((value) => `<option value="${value}" ${value === 128 ? "selected" : ""}>${value}px</option>`).join("")}</select></label></div><label class="a4-clean"><input name="cleanup" type="checkbox" checked /><span><b>Background cleanup</b><small>Remove the matte after generation · +2 Pixel Engine credits</small></span></label><p class="a4-error" hidden></p><button class="a4-submit" type="submit" ${sources.length ? "" : "disabled"}>Generate animation <b>20–22 credits →</b></button></form><section class="a4-stage"><div class="a4-stage-head"><span>GENERATED ANIMATION</span><small>Remote generation · usually around 90 seconds</small></div><div class="a4-live" hidden><div class="a4-live-top"><b data-a4-status>QUEUED</b><button data-a4-cancel type="button">Cancel</button></div><div class="a4-spinner"><i></i><i></i><i></i><i></i></div><h2 data-a4-title>Preparing animation</h2><p data-a4-detail>Your source sprite is being prepared.</p><progress data-a4-progress max="1" value="0"></progress></div><div class="a4-empty" ${completed.length ? "hidden" : ""}><b>Your completed animations appear here.</b><span>Each output is saved to your private library as an animated WebP.</span></div><div class="a4-results">${completed.map(animationResultMarkup).join("")}</div></section></section></section>`;
};

export function setupAnimation4({ assets = [], jobs = [], theme = null, onChanged, onNotice, initialAssetId = "" } = {}) {
  const root = document.querySelector(".a4-view"); if (!root) return;
  const rawNotice = onNotice;
  onNotice = (message) => rawNotice?.(String(message).replace(/pixel\s*engine/ig, "SpriteForge Animation"));
  root.querySelector(".a4-head span").textContent = "ANIMATE · SPRITEFORGE";
  root.querySelectorAll(".a4-step small")[1].textContent = "SpriteForge builds the complete loop as one coherent sequence.";
  root.querySelectorAll(".a4-results article span").forEach((label) => { label.textContent = "READY · SPRITEFORGE ANIMATION"; });
  const form = root.querySelector(".a4-panel"); const error = root.querySelector(".a4-error"); const sourceButtons = [...root.querySelectorAll("[data-a4-source]")]; let sourceId = sourceButtons.find((button) => button.dataset.a4Source === initialAssetId)?.dataset.a4Source || sourceButtons[0]?.dataset.a4Source || ""; sourceButtons.forEach((button) => button.classList.toggle("active", button.dataset.a4Source === sourceId)); let motion = "idle"; let job = null; let timer = null;
  const motionStep = [...root.querySelectorAll(".a4-step")].find((step) => step.textContent.includes("Describe the motion"));
  const promptAssist = document.createElement("button");
  promptAssist.className = "a4-prompt-assist"; promptAssist.type = "button"; promptAssist.innerHTML = "Prompt assistant <b>✦</b>";
  motionStep?.append(promptAssist);
  const assistantModal = document.createElement("section");
  assistantModal.className = "a4-assistant-modal"; assistantModal.hidden = true;
  assistantModal.innerHTML = `<div class="a4-assistant-backdrop" data-a4-assist-close></div><div class="a4-assistant-card" role="dialog" aria-modal="true" aria-labelledby="a4-assist-title"><header><div><span>GPT-5.6 LUNA · PIXELENGINE DIRECTOR</span><h2 id="a4-assist-title">Shape the motion</h2><p>Describe the gameplay intent. The assistant converts it into a complete temporal instruction for PixelEngine.</p></div><button type="button" aria-label="Close" data-a4-assist-close>×</button></header><label><span>What should happen?</span><textarea data-a4-assist-request maxlength="900" placeholder="For example: a cautious two-step walk, holding the lantern steady while the scarf trails slightly."></textarea></label><label><span>Optional constraints</span><input data-a4-assist-constraints maxlength="500" placeholder="For example: no travel across canvas; keep both feet readable." /></label><div class="a4-assist-status"><span>Up to 5 requests per day</span><small data-a4-assist-remaining></small></div><p class="a4-assist-error" hidden></p><section class="a4-assist-result" hidden><span>GENERATED MOTION PROMPT</span><p data-a4-assist-prompt></p><small data-a4-assist-summary></small></section><footer><button type="button" class="a4-assist-generate">Generate prompt</button><button type="button" class="a4-assist-use" hidden>Use this prompt →</button></footer></div>`;
  root.append(assistantModal);
  assistantModal.querySelector("header span").textContent = "GPT-5.6 LUNA · MOTION DIRECTOR";
  assistantModal.querySelector("header p").textContent = "Describe the gameplay intent. The assistant turns it into a production-ready temporal instruction for SpriteForge Animation.";
  root.querySelector(".a4-clean small").textContent = "Remove the known magenta matte locally · included";
  root.querySelector(".a4-clean small").textContent = "Remove the known magenta matte locally · no Pixel Engine credits";
  root.querySelector(".a4-submit b").textContent = "20 credits →";
  root.querySelector(".a4-submit b").textContent = "→";
  const cost = document.createElement("p");
  cost.className = "a4-cost";
  cost.innerHTML = "<span>Estimated use</span><b>20 PixelEngine credits</b><small>One complete temporal animation. Cleanup runs locally.</small>";
  root.querySelector(".a4-error").before(cost);
  root.querySelector(".a4-clean small").textContent = "Remove the known magenta matte locally · included";
  cost.innerHTML = "<span>Estimated use</span><b>20 Forge credits</b><small>One complete temporal animation. Cleanup runs locally.</small>";
  const fixedActions = document.createElement("div");
  fixedActions.className = "a4-fixed-actions";
  const scrollFields = document.createElement("div");
  scrollFields.className = "a4-form-scroll";
  const submitButton = form.querySelector(".a4-submit");
  Array.from(form.children).forEach((child) => { if (child !== submitButton && child !== cost && child !== error) scrollFields.append(child); });
  fixedActions.append(cost, error, submitButton);
  form.append(scrollFields, fixedActions);
  const request = async (url, options = {}) => { const { headers: extraHeaders = {}, ...rest } = options; const response = await fetch(url, { credentials: "same-origin", ...rest, headers: { "Content-Type": "application/json", "X-CSRF-Token": cookie("spriteforge_csrf"), ...extraHeaders } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Pixel Engine request failed."); return data; };
  const closePromptAssistant = () => { assistantModal.hidden = true; promptAssist.focus(); };
  const assistantError = assistantModal.querySelector(".a4-assist-error");
  const assistantResult = assistantModal.querySelector(".a4-assist-result");
  const assistantGenerate = assistantModal.querySelector(".a4-assist-generate");
  const assistantUse = assistantModal.querySelector(".a4-assist-use");
  let assisted = null;
  promptAssist.addEventListener("click", () => { assistantModal.hidden = false; assistantModal.querySelector("[data-a4-assist-request]").focus(); });
  assistantModal.querySelectorAll("[data-a4-assist-close]").forEach((button) => button.addEventListener("click", closePromptAssistant));
  assistantModal.addEventListener("keydown", (event) => { if (event.key === "Escape") closePromptAssistant(); });
  assistantGenerate.addEventListener("click", async () => {
    const requestText = assistantModal.querySelector("[data-a4-assist-request]").value.trim();
    const constraints = assistantModal.querySelector("[data-a4-assist-constraints]").value.trim();
    if (!requestText) { assistantError.hidden = false; assistantError.textContent = "Describe the motion first."; return; }
    try {
      assistantGenerate.disabled = true; assistantGenerate.textContent = "Directing motion…"; assistantError.hidden = true;
      const source = assets.find((item) => item.id === sourceId);
      const generated = await request("/api/pixelengine/prompt-assist", { method: "POST", body: JSON.stringify({ sourceName: source?.name || "approved source sprite", motion, frames: Number(form.frames.value), canvas: Number(form.canvas.value), colors: Number(form.colors.value), request: requestText, constraints }) });
      assisted = generated; assistantResult.hidden = false; assistantUse.hidden = false;
      assistantModal.querySelector("[data-a4-assist-prompt]").textContent = generated.prompt;
      assistantModal.querySelector("[data-a4-assist-summary]").textContent = generated.summary;
      assistantModal.querySelector("[data-a4-assist-remaining]").textContent = generated.exempt ? "Administrator · unlimited" : `${generated.remaining} remaining today`;
    } catch (cause) { assistantError.hidden = false; assistantError.textContent = cause.message || "The prompt assistant is unavailable."; }
    finally { assistantGenerate.disabled = false; assistantGenerate.textContent = "Generate prompt"; }
  });
  assistantUse.addEventListener("click", () => { if (!assisted) return; form.prompt.value = assisted.prompt; form.negative.value = assisted.negativePrompt; closePromptAssistant(); onNotice?.("PixelEngine motion prompt applied."); });
  const fail = (message = "") => { error.hidden = !message; error.textContent = String(message).replace(/pixel\s*engine/ig, "SpriteForge Animation"); };
  const imageBase64 = async (url) => { const response = await fetch(url, { credentials: "same-origin" }); if (!response.ok) throw new Error("The source sprite could not be loaded."); const blob = await response.blob(); return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(blob); }); };
  const live = root.querySelector(".a4-live"); const show = (state) => { live.hidden = false; const status = String(state.status || "queued").toUpperCase(); live.querySelector("[data-a4-status]").textContent = status === "QUEUED" ? "PREPARING" : status; live.querySelector("[data-a4-title]").textContent = state.status === "pending" ? "Generating your complete sequence…" : "Preparing your animation"; live.querySelector("[data-a4-detail]").textContent = state.error || (state.model?.includes("+local-rmbg") ? "Cleaning the known magenta matte locally and preserving transparent pixels…" : "The model is sampling all frames as one coherent animation."); live.querySelector("[data-a4-progress]").value = Number(state.progress || 0); };
  const stop = () => { if (timer) clearTimeout(timer); timer = null; };
  const poll = async () => { if (!job) return; try { const state = await request(`/api/pixelengine/animations/${job.id}`, { method: "POST", body: "{}" }); show(state); if (["success", "failure", "cancelled"].includes(state.status)) { stop(); if (state.status === "success") { job = null; live.hidden = true; onNotice?.("Animation saved to your library."); await onChanged?.(); } else { job = null; fail(state.error || "Pixel Engine did not complete this animation."); } return; } timer = setTimeout(poll, 3500); } catch (cause) { fail(cause.message || "Could not check the animation status."); stop(); } };
  root.querySelectorAll("[data-a4-source]").forEach((button) => button.addEventListener("click", () => { sourceId = button.dataset.a4Source; root.querySelectorAll("[data-a4-source]").forEach((item) => item.classList.toggle("active", item === button)); }));
  root.querySelectorAll("[data-a4-view-app]").forEach((button) => button.addEventListener("click", () => { window.location.assign(`/app?asset=${encodeURIComponent(button.dataset.a4ViewApp)}`); }));
  root.querySelectorAll("[data-a4-edit]").forEach((button) => button.addEventListener("click", () => { window.location.assign(`/app?edit=${encodeURIComponent(button.dataset.a4Edit)}`); }));
  root.querySelectorAll("[data-a4-again]").forEach((button) => button.addEventListener("click", () => { const nextSourceId = button.dataset.a4Again; if (!nextSourceId) return; sourceId = nextSourceId; sourceButtons.forEach((item) => item.classList.toggle("active", item.dataset.a4Source === sourceId)); root.querySelector(".a4-submit")?.scrollIntoView({ behavior: "smooth", block: "center" }); form.requestSubmit(); }));
  root.querySelectorAll("[data-a4-motion]").forEach((button) => button.addEventListener("click", () => { motion = button.dataset.a4Motion; const preset = MOTIONS[motion]; form.prompt.value = preset.prompt; form.frames.value = preset.frames; root.querySelectorAll("[data-a4-motion]").forEach((item) => item.classList.toggle("active", item === button)); }));
  root.querySelector("[data-a4-cancel]").addEventListener("click", async () => { if (!job) return; await request(`/api/pixelengine/animations/${job.id}`, { method: "DELETE", body: "{}" }); stop(); job = null; live.hidden = true; });
  const pending = jobs.find((item) => !["success", "failure", "cancelled"].includes(item.status)); if (pending) { job = pending; show(job); poll(); }
  form.addEventListener("submit", async (event) => { event.preventDefault(); const source = assets.find((item) => item.id === sourceId); if (!source) return fail("Choose a source sprite."); const submit = root.querySelector(".a4-submit"); let clip = null; try { submit.disabled = true; clearCreditUpgrade(submit); fail(); const values = Object.fromEntries(new FormData(form)); const frames = Number(values.frames); const fps = motion === "idle" ? 6 : motion === "walk" ? 8 : 10; const base64 = await imageBase64(sourceUrl(source)); clip = await request("/api/animations", { method: "POST", body: JSON.stringify({ sourceAssetId: source.id, themeId: theme?.id || null, name: `${source.name} · ${MOTIONS[motion].title}`, motion, provider: "pixel-engine", styleTags: theme?.styleTags || [], settings: { frameCount: frames, fps, margin: 0, loop: ["idle","walk","run"].includes(motion), pixelEngine: true }, frames: Array.from({ length: frames }, (_, index) => ({ prompt: index ? `${MOTIONS[motion].title} frame ${index + 1}` : "Source frame", durationMs: Math.round(1000 / fps) })) }) }); job = await request("/api/pixelengine/animations", { method: "POST", headers: { "Idempotency-Key": requestKey() }, body: JSON.stringify({ clipId: clip.id, request: { mode: "animate", image: base64, prompt: values.prompt.trim(), negativePrompt: values.negative.trim(), outputFrames: frames, colors: Number(values.colors), backgroundCleanup: Boolean(form.cleanup.checked), matteColor: "#ff00ff", transform: { canvasSize: Number(values.canvas), fillMethod: "transparent", offsetX: 0, offsetY: 0 } } }) }); show(job); poll(); } catch (cause) { if (clip && !job) request(`/api/animations/${clip.id}`, { method: "DELETE", body: "{}" }).catch(() => {}); if (!showCreditUpgrade(submit, cause)) fail(cause.message || "Animation could not start."); } finally { submit.disabled = false; } });
}
