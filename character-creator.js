import { processPixelGrid, quantizePalette, snapToGrid } from "/pixel-grid-core.js";
import { clearCreditUpgrade, showCreditUpgrade } from "/credit-alert.js?v=2";

const GRID_SIZES = [8, 16, 24, 32, 48, 64, 128, 256];
const PALETTE_SIZES = [8, 16, 24, 32, 48, 64, 128, 256];
const STYLE_TAGS = [
  "cozy", "rpg", "stardew-valley-like", "dark fantasy", "cute", "cyberpunk", "dungeon crawler", "handheld retro",
  "fantasy", "sci-fi", "medieval", "post-apocalyptic", "horror", "mystical", "whimsical", "cute but eerie",
  "farm sim", "roguelike", "metroidvania", "soulslike", "jrpg", "adventure", "platformer", "arcade"
];

export const characterCreatorMarkup = ({ embedded = false, theme = null, themes = [] } = {}) => {
  const tag = embedded ? "section" : "main";
  return `
  <${tag} class="creator-page${embedded ? " creator-page-embedded" : ""}">
    <section class="creator-intro creator-intro-compact"><span>Individual character generator</span></section>
    <section class="creator-shell" id="character-creator">
      <form class="creator-controls" id="creator-form">
        <label class="creator-field creator-brief"><span>Character brief</span><textarea id="creator-subject" required maxlength="700">A compact desert ranger with a teal hood, brass goggles, tan scarf and copper lantern</textarea><small>Describe defining shapes, clothing and signature accessories.</small></label>
        <section class="creator-field creator-theme-control"><span>Active theme</span><div class="creator-theme-card"><button class="creator-theme-select" id="creator-theme-select" type="button"><span><b>${theme?.name || "No theme selected"}</b><small id="creator-theme-description">${theme ? "Theme direction, tags and premium references will be used." : "Choose a saved theme to apply its visual direction."}</small></span><em>Change theme →</em></button></div><small>Click the theme to browse your saved visual directions.</small></section>
        <label class="creator-field"><span>Pixel scale reference</span><select id="creator-pixel-scale"><option value="uniform-coarse">Large pixels · bold / retro</option><option value="uniform-medium" selected>Medium pixels · balanced</option><option value="uniform-fine">Small pixels · detailed</option></select><small>Directs the AI to use one consistent pixel-block size across the whole character.</small></label>
        <div class="creator-field"><span>Perspective</span><div class="perspective-picker" role="radiogroup" aria-label="Character perspective"><button class="perspective-card active" data-view="left-3-4" type="button" role="radio" aria-checked="true"><img src="/assets/showcase/character/idle.png" alt="" /><b>Platformer</b><small>Side view · 3/4</small></button><button class="perspective-card iso" data-view="isometric" type="button" role="radio" aria-checked="false"><img src="/assets/examples/isometric-buildings/castle.webp" alt="" /><b>Isometric</b><small>Angled world view</small></button><button class="perspective-card top" data-view="top-down" type="button" role="radio" aria-checked="false"><img src="/assets/pixelsnapper/after.png" alt="" /><b>Top-down</b><small>Overhead gameplay</small></button></div><small>Choose this before generating; it is locked into the character's prompt.</small></div>
        <label class="creator-field"><span>Pose</span><select id="creator-pose"><option value="neutral idle pose">Idle</option><option value="left-facing walk contact pose">Walk contact</option><option value="spell-cast pose">Cast spell</option><option value="guard stance">Guard</option></select></label>
        <div class="creator-field"><span>Style tags</span><input id="creator-style-tags" maxlength="390" placeholder="Write your own: cozy, rpg, warm" value="${theme?.styleTags?.join(", ") || ""}" /><div class="style-tag-picker" aria-label="Style tags">${STYLE_TAGS.map((styleTag) => `<button class="style-tag" data-style-tag="${styleTag}" type="button" aria-pressed="false">${styleTag}</button>`).join("")}</div><small>Choose up to eight suggestions or add your own tags. Reuse the same set across characters for a consistent visual direction.</small></div>
        <button class="creator-generate" id="creator-generate" type="submit">Generate character <b>→</b></button>
        <p class="creator-local-note">AI generation is remote. Background removal, malla and palette processing happen locally in your browser.</p>
      </form>
      <section class="creator-stage" aria-live="polite">
        <div class="creator-empty" id="creator-empty"><div>✦</div><h2>Ready for a new hero</h2><p>Choose the art direction and generate an individual character sprite.</p></div>
        <div class="creator-loading" id="creator-loading" hidden><div class="creator-orbit"></div><h2>Drawing your character…</h2><p id="creator-loading-copy">Building clean pixel clusters.</p></div>
        <div class="creator-error" id="creator-error" hidden></div>
        <div class="creator-result" id="creator-result" hidden>
          <div class="creator-result-head"><div><span>GENERATED → NORMALIZED</span><h2 id="creator-result-title">Character sprite</h2></div><div class="creator-result-head-actions"><button id="creator-download" type="button">Download PNG</button></div></div>
          <div class="creator-compare"><figure><figcaption>AI original <small>chroma background</small></figcaption><canvas id="creator-original"></canvas></figure><figure><figcaption>Game-ready <small id="creator-output-meta"></small></figcaption><canvas id="creator-output"></canvas></figure></div>
          <div class="creator-tools"><div class="creator-tool-row"><span>Colors</span><div>${["Original", ...PALETTE_SIZES].map((value) => `<button class="chip creator-palette${value === "Original" ? " active" : ""}" data-colors="${value === "Original" ? "original" : value}" type="button">${value}</button>`).join("")}</div></div><div class="creator-tool-row"><span>Grid</span><div>${["Auto", ...GRID_SIZES].map((value) => `<button class="chip creator-grid-size${value === "Auto" ? " active" : ""}" data-grid-size="${value === "Auto" ? "auto" : value}" type="button">${value === "Auto" ? "Auto" : `${value}×${value}`}</button>`).join("")}</div></div></div>
          <div class="creator-result-actions"><span id="creator-result-note">Transparent PNG · centered on feet</span><div class="creator-result-next-actions"><button id="creator-edit" type="button">Edit pixel art →</button><button id="creator-view-app" type="button">View in app →</button><button id="creator-animate" type="button">Animate →</button></div></div>
        </div>
      </section>
    </section>
  </${tag}>`;
};

function put(canvas, imageData) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d").putImageData(imageData, 0, 0);
}

function removeChromaBleed(source) {
  const output = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  const { width, height, data } = output;
  const queued = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const colorAt = (pixel) => {
    const index = pixel * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };
  const isBackgroundFamily = (pixel) => {
    const [red, green, blue, alpha] = colorAt(pixel);
    if (alpha < 32) return false;
    const distance = Math.hypot(red - 255, green, blue - 255);
    const largest = Math.max(red, blue);
    const magentaHue = largest > 18 && blue >= red * 0.72 && red >= blue * 0.4 && green < (red + blue) * 0.34;
    return distance < 215 || magentaHue;
  };
  const isChromaSeed = (pixel) => {
    const [red, green, blue, alpha] = colorAt(pixel);
    return alpha >= 32 && Math.hypot(red - 255, green, blue - 255) < 100;
  };
  const enqueue = (pixel) => {
    if (!queued[pixel] && isBackgroundFamily(pixel)) { queued[pixel] = 1; queue[tail++] = pixel; }
  };
  // Seed every unmistakably chroma-key pixel, including enclosed background
  // gaps. A purple accessory is protected unless it is connected to one.
  for (let pixel = 0; pixel < width * height; pixel += 1) if (isChromaSeed(pixel)) enqueue(pixel);
  while (head < tail) {
    const pixel = queue[head++];
    const index = pixel * 4;
    data[index] = 0; data[index + 1] = 0; data[index + 2] = 0; data[index + 3] = 0;
    const x = pixel % width, y = Math.floor(pixel / width);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (!offsetX && !offsetY) continue;
      const nextX = x + offsetX, nextY = y + offsetY;
      if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) enqueue(nextY * width + nextX);
    }
  }
  return output;
}

function removeChromaKey(source) {
  return removeChromaBleed(source);
}

function getBounds(imageData) {
  const { data, width, height } = imageData;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] < 32) continue;
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) throw new Error("The generated image did not contain a usable foreground.");
  return { left, top, right, bottom };
}

function cropForeground(source) {
  const cleared = removeChromaBleed(removeChromaKey(source));
  const box = getBounds(cleared);
  const padding = Math.max(8, Math.round(Math.max(box.right - box.left + 1, box.bottom - box.top + 1) * 0.07));
  const x = Math.max(0, box.left - padding), y = Math.max(0, box.top - padding);
  const width = Math.min(cleared.width - x, box.right - box.left + 1 + padding * 2);
  const height = Math.min(cleared.height - y, box.bottom - box.top + 1 + padding * 2);
  const output = new ImageData(Math.round(width), Math.round(height));
  for (let row = 0; row < output.height; row += 1) for (let column = 0; column < output.width; column += 1) {
    const from = ((Math.round(y) + row) * cleared.width + Math.round(x) + column) * 4;
    const to = (row * output.width + column) * 4;
    output.data.set(cleared.data.subarray(from, from + 4), to);
  }
  return output;
}

function forceGrid(source, gridSize) {
  const shortest = Math.min(source.width, source.height);
  const cellSize = shortest / gridSize;
  const width = Math.max(1, Math.round(source.width / cellSize));
  const height = Math.max(1, Math.round(source.height / cellSize));
  return snapToGrid(source, { fractional: true, scaleX: source.width / width, scaleY: source.height / height, detectedWidth: width, detectedHeight: height, blockSize: cellSize, offsetX: 0, offsetY: 0 });
}

function applyTransparencyMask(imageData, mask) {
  if (!mask) return imageData;
  const output = new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height);
  for (let y = 0; y < output.height; y += 1) for (let x = 0; x < output.width; x += 1) {
    const left = Math.floor((x * mask.width) / output.width);
    const right = Math.max(left + 1, Math.ceil(((x + 1) * mask.width) / output.width));
    const top = Math.floor((y * mask.height) / output.height);
    const bottom = Math.max(top + 1, Math.ceil(((y + 1) * mask.height) / output.height));
    let visible = 0, total = 0;
    for (let maskY = top; maskY < Math.min(mask.height, bottom); maskY += 1) for (let maskX = left; maskX < Math.min(mask.width, right); maskX += 1) {
      total += 1;
      if (mask.data[(maskY * mask.width + maskX) * 4 + 3] > 32) visible += 1;
    }
    // A manual low-resolution cell must contain a meaningful part of the
    // already-clean automatic silhouette. This rejects one-cell matte halos.
    if (!total || visible / total < 0.12) {
      const index = (y * output.width + x) * 4;
      output.data[index] = 0; output.data[index + 1] = 0; output.data[index + 2] = 0; output.data[index + 3] = 0;
    }
  }
  return output;
}

async function decodeImage(base64, mimeType) {
  const image = new Image();
  image.src = `data:${mimeType};base64,${base64}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function cookie(name) {
  return document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

export function setupCharacterCreator({ onSaved, theme = null, themes = [], onThemePicker, variant = "v3" } = {}) {
  const root = document.querySelector("#character-creator");
  if (!root) return;
  const form = root.querySelector("#creator-form");
  const fixedActions = document.createElement("div");
  fixedActions.className = "creator-fixed-actions";
  const scrollFields = document.createElement("div");
  scrollFields.className = "creator-form-scroll";
  const generateButton = form.querySelector("#creator-generate");
  const localNote = form.querySelector(".creator-local-note");
  const briefFromLanding = new URLSearchParams(window.location.search).get("brief");
  if (briefFromLanding?.trim()) form.querySelector("#creator-subject").value = briefFromLanding.trim().slice(0, 700);
  Array.from(form.children).forEach((child) => { if (child !== generateButton && child !== localNote) scrollFields.append(child); });
  fixedActions.append(generateButton, localNote);
  form.append(scrollFields, fixedActions);
  const empty = root.querySelector("#creator-empty");
  const loading = root.querySelector("#creator-loading");
  const error = root.querySelector("#creator-error");
  const result = root.querySelector("#creator-result");
  const output = root.querySelector("#creator-output");
  const state = { source: null, auto: null, autoMask: null, gridSize: null, colors: null, view: theme?.settings?.view || "left-3-4", styleTags: new Set(theme?.styleTags || []) };
  let finalImage = null;
  let savedAssetId = null;
  const setState = (state, message = "") => {
    empty.hidden = state !== "empty"; loading.hidden = state !== "loading"; result.hidden = state !== "result"; error.hidden = state !== "error";
    if (state === "error") error.textContent = message;
  };
  const renderGameReady = () => {
    if (!state.source) return;
    const rawSnapped = state.gridSize == null ? (state.auto?.snapped || forceGrid(state.source, 48)) : forceGrid(state.source, state.gridSize);
    const snapped = state.gridSize == null ? rawSnapped : applyTransparencyMask(rawSnapped, state.autoMask);
    // V3 requests native transparency from GPT Image 2. Preserve its alpha
    // and only apply the grid/palette normalization locally.
    const cleaned = variant === "v3" ? snapped : removeChromaBleed(removeChromaKey(snapped));
    finalImage = state.colors == null ? cleaned : quantizePalette(cleaned, state.colors, 16);
    if (variant !== "v3") finalImage = removeChromaBleed(removeChromaKey(finalImage));
    put(output, finalImage);
    const automatic = state.gridSize == null;
    const confidence = state.auto?.detection ? ` · ${(state.auto.detection.confidence * 100).toFixed(0)}% confidence` : " · fallback 48×48";
    root.querySelector("#creator-result-title").textContent = `${automatic ? "Detected" : "Forced"}: ${snapped.width}×${snapped.height} character sprite`;
    root.querySelector("#creator-output-meta").textContent = `${state.colors == null ? "original colors" : `${state.colors} colors`} · transparent${automatic ? confidence : ""}`;
    root.querySelectorAll(".creator-palette").forEach((button) => button.classList.toggle("active", button.dataset.colors === (state.colors == null ? "original" : String(state.colors))));
    root.querySelectorAll(".creator-grid-size").forEach((button) => button.classList.toggle("active", button.dataset.gridSize === (state.gridSize == null ? "auto" : String(state.gridSize))));
  };
  root.querySelectorAll(".perspective-card").forEach((button) => button.addEventListener("click", () => {
    state.view = button.dataset.view;
    root.querySelectorAll(".perspective-card").forEach((card) => { const active = card === button; card.classList.toggle("active", active); card.setAttribute("aria-checked", String(active)); });
  }));
  root.querySelectorAll(".perspective-card").forEach((card) => { const active = card.dataset.view === state.view; card.classList.toggle("active", active); card.setAttribute("aria-checked", String(active)); });
  const tagsInput = root.querySelector("#creator-style-tags");
  const setTagsFromInput = () => {
    state.styleTags = new Set(tagsInput.value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).slice(0, 8));
    root.querySelectorAll(".style-tag").forEach((button) => { const active = state.styleTags.has(button.dataset.styleTag); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
  };
  const syncTagsInput = () => { tagsInput.value = [...state.styleTags].join(", "); setTagsFromInput(); };
  root.querySelectorAll(".style-tag").forEach((button) => button.addEventListener("click", () => {
    const tag = button.dataset.styleTag;
    if (state.styleTags.has(tag)) state.styleTags.delete(tag);
    else if (state.styleTags.size < 8) state.styleTags.add(tag);
    else { error.textContent = "Choose up to eight style tags for one generation."; error.hidden = false; return; }
    syncTagsInput();
  }));
  tagsInput.addEventListener("input", setTagsFromInput);
  setTagsFromInput();
  root.querySelector("#creator-theme-select")?.addEventListener("click", () => onThemePicker?.());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearCreditUpgrade(generateButton);
    const body = { provider: "openai", tier: "draft", themeId: theme?.id || null, ...(variant === "v3" ? { pixelArtVariant: "v3" } : {}), recipe: { assetType: "character", subject: root.querySelector("#creator-subject").value.trim(), view: state.view, pose: root.querySelector("#creator-pose").value, target: variant === "v3" ? { width: 32, height: 48 } : { width: 64, height: 96 }, palette: { maxColors: 32, mood: "premium game pixel art" }, pixelScale: root.querySelector("#creator-pixel-scale").value, styleTags: [...state.styleTags], lockedTraits: [] } };
    setState("loading");
    try {
      const csrfToken = cookie("spriteforge_csrf");
      if (!csrfToken) throw new Error("Sign in to create and save a character.");
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
      const response = await fetch("/api/generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.code === "generator_disabled" ? "Generation is temporarily disabled by the site owner." : payload.code === "generation_rate_limited" ? payload.error || "Generation limit reached: 10 generations every 5 minutes." : payload.error || "The generation request failed.");
      const original = await decodeImage(payload.imageBase64, payload.mimeType);
      // V3 receives a full-canvas checker scaffold. Cropping before detection
      // would remove the registration canvas and make the detector infer a
      // different grid from the remaining subject.
      state.source = variant === "v3" ? original : cropForeground(original);
      state.auto = processPixelGrid(state.source, { minimumConfidence: 0.05 });
      if (!state.auto.ok) state.auto = null;
      state.autoMask = state.auto ? (variant === "v3" ? state.auto.snapped : removeChromaBleed(removeChromaKey(state.auto.snapped))) : null;
      state.gridSize = null;
      state.colors = null;
      put(root.querySelector("#creator-original"), original);
      root.querySelector("#creator-result-note").textContent = "Transparent PNG";
      renderGameReady();
      if (payload.asset?.id && finalImage) {
        const canvas = document.createElement("canvas"); put(canvas, finalImage);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (blob) {
          const save = await fetch(`/api/assets/${payload.asset.id}/files/game-ready`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "image/png", "X-CSRF-Token": csrfToken }, body: blob });
          if (!save.ok) throw new Error("The character was generated, but its game-ready version could not be saved.");
        }
      }
      setState("result");
      savedAssetId = payload.asset?.id || null;
      window.spriteforgeTrackX?.("Generate", { conversion_id: payload.asset?.id || undefined });
      onSaved?.(payload.asset);
    } catch (err) { console.error(err); if (!showCreditUpgrade(generateButton, err)) setState("error", err.message || "The character could not be generated."); }
  });
  root.querySelector("#creator-view-app").addEventListener("click", () => {
    if (!savedAssetId) return;
    window.location.assign(`/app?asset=${encodeURIComponent(savedAssetId)}`);
  });
  root.querySelector("#creator-edit")?.addEventListener("click", () => {
    if (!savedAssetId) return;
    window.location.assign(`/app?edit=${encodeURIComponent(savedAssetId)}`);
  });
  root.querySelector("#creator-animate").addEventListener("click", () => {
    if (!savedAssetId) return;
    window.location.assign(`/app?animate=${encodeURIComponent(savedAssetId)}`);
  });
  root.querySelectorAll(".creator-palette").forEach((button) => button.addEventListener("click", () => { state.colors = button.dataset.colors === "original" ? null : Number(button.dataset.colors); renderGameReady(); }));
  root.querySelectorAll(".creator-grid-size").forEach((button) => button.addEventListener("click", () => { state.gridSize = button.dataset.gridSize === "auto" ? null : Number(button.dataset.gridSize); renderGameReady(); }));
  root.querySelector("#creator-download").addEventListener("click", () => {
    if (!finalImage) return;
    const canvas = document.createElement("canvas"); put(canvas, finalImage);
    canvas.toBlob((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `sprite_${finalImage.width}x${finalImage.height}.png`; link.click(); URL.revokeObjectURL(url); }, "image/png");
  });
}

export { cropForeground, forceGrid, removeChromaBleed, removeChromaKey };
