import { processPixelGrid, quantizePalette } from "/pixel-grid-core.js";
import { cropForeground, forceGrid, removeChromaBleed, removeChromaKey } from "/character-creator.js?v=17";

const GRID_SIZES = [8, 16, 24, 32, 48, 64, 128, 256];
const PALETTE_SIZES = [8, 16, 24, 32, 48, 64];
const STYLE_TAGS = ["cozy", "rpg", "stardew-valley-like", "dark fantasy", "cute", "cyberpunk", "dungeon crawler", "handheld retro", "fantasy", "sci-fi", "medieval", "post-apocalyptic", "horror", "mystical", "whimsical", "cute but eerie", "farm sim", "roguelike", "metroidvania", "soulslike", "jrpg", "adventure", "platformer", "arcade"];

const MODES = [
  { id: "item", type: "item", title: "Item", subtitle: "Inventory & collectibles", image: "/assets/examples/inventory-icons/sword.png", brief: "A small brass compass with a glowing blue needle and worn leather loop", view: "left-3-4", size: 48, tags: ["rpg", "adventure"] },
  { id: "weapon", type: "weapon", title: "Weapon / tool", subtitle: "Equipable silhouette", image: "/assets/examples/inventory-icons/sword.png", brief: "A weathered copper lantern staff with a crystal core", view: "left-3-4", size: 64, tags: ["fantasy", "rpg"] },
  { id: "prop", type: "prop", title: "Gameplay prop", subtitle: "Interactable objects", image: "/assets/examples/pixel-art-characters/royal-goblin/attack.webp", brief: "An old oak treasure chest with iron bands, keyhole and a folded map beside it", view: "left-3-4", size: 64, tags: ["rpg", "dungeon crawler"] },
  { id: "environment", type: "environment", title: "Scenery", subtitle: "World elements", image: "/assets/examples/tiny-pixel-art/tiny_owl_idle.webp", brief: "A mossy stone shrine with a small hanging lantern and roots around the base", view: "left-3-4", size: 72, tags: ["fantasy", "mystical"] },
  { id: "building", type: "building", title: "Building", subtitle: "Standalone structures", image: "/assets/examples/isometric-buildings/castle.webp", brief: "A compact witch's apothecary with crooked roof, glowing windows and a wooden sign", view: "isometric", size: 96, tags: ["fantasy", "cozy"] },
  { id: "ui-icon", type: "ui-icon", title: "UI icon", subtitle: "Game controls & status", image: "/assets/examples/spell-icon-set/icons/icon_101.png", brief: "A bold emerald potion icon for a fantasy game health menu", view: "front", size: 48, tags: ["rpg", "handheld retro"] },
];

const modeFor = (id) => MODES.find((mode) => mode.id === id) || MODES[0];
const put = (canvas, imageData) => { canvas.width = imageData.width;
canvas.height = imageData.height;
canvas.getContext("2d").putImageData(imageData, 0, 0);
};
const cookie = (name) => document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const generationKey = () => globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now().toString(36)}${Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join("")}`;

async function decodeImage(base64, mimeType) {
  const image = new Image();
image.src = `data:${mimeType};base64,${base64}`;
await image.decode();
  const canvas = document.createElement("canvas");
canvas.width = image.naturalWidth;
canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export const assetGeneratorMarkup = ({ embedded = false, theme = null } = {}) => {
  const tag = embedded ? "section" : "main";
  return `<${tag} class="asset-page${embedded ? " asset-page-embedded" : ""}"><section class="asset-intro"><span>Specialized game asset generator</span><h1>Make <em>production-ready assets</em><br />for your game world</h1><p>Choose the asset job first. The generator changes composition, view and prompt rules so each result reads as a usable game resource.</p></section><section class="asset-shell" id="asset-generator"><form class="asset-controls" id="asset-form"><div class="asset-theme-summary ${theme ? "" : "is-empty"}"><span>ACTIVE THEME</span><b>${theme?.name || "No theme selected"}</b><small>${theme ? "Direction, tags and premium references are inherited." : "Create or select a Theme for stronger consistency."}</small></div><div class="asset-field"><span>What are you making?</span><div class="asset-mode-grid">${MODES.map((mode, index) => `<button class="asset-mode ${index === 0 ? "active" : ""}" data-asset-mode="${mode.id}" type="button" aria-pressed="${index === 0}"><img src="${mode.image}" alt="" /><b>${mode.title}</b><small>${mode.subtitle}</small></button>`).join("")}</div><small id="asset-mode-hint">One standalone collectible or inventory object — no hand, shelf or scene.</small></div><label class="asset-field"><span>Asset brief</span><textarea id="asset-subject" required maxlength="700">${MODES[0].brief}</textarea><small>Describe its function, material, silhouette and signature details. The selected mode supplies the technical composition rules.</small></label><label class="asset-field"><span>Provider</span><select id="asset-provider"><option value="openai" selected>GPT Image 2</option><option value="gemini">Nano Banana 2</option></select><small>Draft quality is used to keep each asset economical.</small></label><label class="asset-field"><span>Pixel scale reference</span><select id="asset-pixel-scale"><option value="uniform-coarse">Large pixels · bold / retro</option><option value="uniform-medium" selected>Medium pixels · balanced</option><option value="uniform-fine">Small pixels · detailed</option></select></label><label class="asset-field"><span>View</span><select id="asset-view"><option value="front">Front</option><option value="left-3-4" selected>3/4 game view</option><option value="top-down">Top-down</option><option value="isometric">Isometric</option></select><small>Each mode starts with the most useful view, but you remain in control.</small></label><div class="asset-field"><span>Style tags</span><input id="asset-style-tags" maxlength="390" placeholder="Write your own: cozy, rpg, warm" value="${theme?.styleTags?.join(", ") || ""}" /><div class="asset-tag-picker">${STYLE_TAGS.map((styleTag) => `<button class="asset-tag" data-asset-tag="${styleTag}" type="button" aria-pressed="false">${styleTag}</button>`).join("")}</div><small>Choose up to eight suggestions or add your own tags.</small></div><button class="asset-generate" type="submit">Generate asset <b>→</b></button><p class="asset-local-note">AI creation happens remotely. Background cleanup, grid detection and palette conversion happen locally in your browser.</p></form><section class="asset-stage" aria-live="polite"><div class="asset-empty" id="asset-empty"><div>✧</div><h2>Ready for a useful asset</h2><p>Select a production role. Each mode is optimized for its own composition instead of using a generic art prompt.</p></div><div class="asset-loading" id="asset-loading" hidden><div></div><h2>Building your asset…</h2><p id="asset-loading-copy">Locking a clean gameplay silhouette.</p></div><div class="asset-error" id="asset-error" hidden></div><div class="asset-result" id="asset-result" hidden><div class="asset-result-head"><div><span>GENERATED → NORMALIZED</span><h2 id="asset-result-title">Game asset</h2></div><button id="asset-reset" type="button">New asset</button></div><div class="asset-compare"><figure><figcaption>AI original <small>chroma background</small></figcaption><canvas id="asset-original"></canvas></figure><figure><figcaption>Game-ready <small id="asset-output-meta"></small></figcaption><canvas id="asset-output"></canvas></figure></div><div class="asset-tools"><div><span>Colors</span>${["Original", ...PALETTE_SIZES].map((value) => `<button class="asset-chip asset-palette${value === "Original" ? " active" : ""}" data-asset-colors="${value === "Original" ? "original" : value}" type="button">${value}</button>`).join("")}</div><div><span>Grid</span>${["Auto", ...GRID_SIZES].map((value) => `<button class="asset-chip asset-grid${value === "Auto" ? " active" : ""}" data-asset-grid="${value === "Auto" ? "auto" : value}" type="button">${value === "Auto" ? "Auto" : `${value}×${value}`}</button>`).join("")}</div></div><footer><span id="asset-note">Transparent PNG · processed locally</span><button id="asset-download" type="button">Download PNG</button></footer></div></section></section></${tag}>`;
};

export function setupAssetGenerator({ theme = null, onSaved } = {}) {
  const root = document.querySelector("#asset-generator");
if (!root) return;
  const form = root.querySelector("#asset-form"), empty = root.querySelector("#asset-empty"), loading = root.querySelector("#asset-loading"), error = root.querySelector("#asset-error"), result = root.querySelector("#asset-result"), output = root.querySelector("#asset-output");
  const providerSelect = root.querySelector("#asset-provider");
  if (providerSelect) {
    providerSelect.innerHTML = '<option value="openai" selected>GPT Image 2 · Low draft</option>';
    providerSelect.disabled = true;
    providerSelect.setAttribute("aria-label", "Provider fijo: GPT Image 2 en calidad low");
  }
  const fixedActions = document.createElement("div");
  fixedActions.className = "asset-fixed-actions";
  const scrollFields = document.createElement("div");
  scrollFields.className = "asset-form-scroll";
  const generateButton = form.querySelector(".asset-generate");
  const localNote = form.querySelector(".asset-local-note");
  Array.from(form.children).forEach((child) => { if (child !== generateButton && child !== localNote) scrollFields.append(child); });
  fixedActions.append(generateButton, localNote);
  form.append(scrollFields, fixedActions);
  const state = { mode: MODES[0], tags: new Set(theme?.styleTags || []), source: null, auto: null, grid: null, colors: null };
let finalImage = null;
  const setScreen = (screen, message = "") => { empty.hidden = screen !== "empty";
loading.hidden = screen !== "loading";
result.hidden = screen !== "result";
error.hidden = screen !== "error";
if (screen === "error") error.textContent = message;
};
  const tagsInput = root.querySelector("#asset-style-tags");
  const syncTagButtons = () => root.querySelectorAll(".asset-tag").forEach((button) => { const active = state.tags.has(button.dataset.assetTag);
button.classList.toggle("active", active);
button.setAttribute("aria-pressed", String(active));
});
  const setTagsFromInput = () => { state.tags = new Set(tagsInput.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 8));
syncTagButtons();
};
  const syncTagsInput = () => { tagsInput.value = [...state.tags].join(", ");
syncTagButtons();
};
  const render = () => { if (!state.source) return;
const snapped = state.grid == null ? (state.auto?.snapped || forceGrid(state.source, state.mode.size)) : forceGrid(state.source, state.grid);
let clean = removeChromaBleed(removeChromaKey(snapped));
if (state.colors != null) clean = quantizePalette(clean, state.colors, 16);
finalImage = removeChromaBleed(removeChromaKey(clean));
put(output, finalImage);
root.querySelector("#asset-result-title").textContent = `${state.grid == null ? "Detected" : "Forced"}: ${finalImage.width}×${finalImage.height} ${state.mode.title.toLowerCase()}`;
root.querySelector("#asset-output-meta").textContent = `${state.colors == null ? "original colors" : `${state.colors} colors`} · transparent`;
root.querySelectorAll(".asset-palette").forEach((button) => button.classList.toggle("active", button.dataset.assetColors === (state.colors == null ? "original" : String(state.colors))));
root.querySelectorAll(".asset-grid").forEach((button) => button.classList.toggle("active", button.dataset.assetGrid === (state.grid == null ? "auto" : String(state.grid))));
};
  root.querySelectorAll(".asset-mode").forEach((button) => button.addEventListener("click", () => { state.mode = modeFor(button.dataset.assetMode);
root.querySelectorAll(".asset-mode").forEach((item) => { const active = item === button;
item.classList.toggle("active", active);
item.setAttribute("aria-pressed", String(active));
});
root.querySelector("#asset-subject").value = state.mode.brief;
root.querySelector("#asset-view").value = state.mode.view;
root.querySelector("#asset-mode-hint").textContent = state.mode.id === "building" ? "One complete standalone building — roof, walls, entrance and base, with no landscape." : state.mode.id === "ui-icon" ? "One bold front-facing pictogram — no letters, numbers, button chrome or interface panel." : `One standalone ${state.mode.title.toLowerCase()} — optimized for a clean readable silhouette.`;
}));
  root.querySelectorAll(".asset-tag").forEach((button) => button.addEventListener("click", () => { const tag = button.dataset.assetTag;
if (state.tags.has(tag)) state.tags.delete(tag);
else if (state.tags.size < 8) state.tags.add(tag);
else { setScreen("error", "Choose up to eight style tags for one generation.");
return;
} syncTagsInput();
}));
  tagsInput.addEventListener("input", setTagsFromInput);
setTagsFromInput();
  form.addEventListener("submit", async (event) => { event.preventDefault();
const csrf = cookie("spriteforge_csrf");
if (!csrf) { setScreen("error", "Sign in to create and save an asset.");
return;
} const size = state.mode.size;
const body = { provider: root.querySelector("#asset-provider").value, tier: "draft", themeId: theme?.id || null, recipe: { assetType: state.mode.type, subject: root.querySelector("#asset-subject").value.trim(), view: root.querySelector("#asset-view").value, lockView: true, pose: "static asset presentation", target: { width: size, height: size }, palette: { maxColors: state.mode.type === "ui-icon" ? 16 : 24, mood: "production-ready game pixel art" }, pixelScale: root.querySelector("#asset-pixel-scale").value, styleTags: [...state.tags], composition: { paddingPercent: state.mode.type === "building" ? 10 : 18, fullBody: false, groundShadow: false }, lockedTraits: [] } };
setScreen("loading");
try { const response = await fetch("/api/generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, "Idempotency-Key": generationKey() }, body: JSON.stringify(body) });
const payload = await response.json();
if (!response.ok) throw new Error(payload.code === "generator_disabled" ? "Generation is temporarily disabled by the site owner." : payload.code === "generation_rate_limited" ? payload.error || "Generation limit reached: 10 generations every 5 minutes." : payload.code === "idempotency_required" ? "The request could not be initialised securely. Please try again." : payload.error || "The generation request failed.");
const original = await decodeImage(payload.imageBase64, payload.mimeType);
state.source = cropForeground(original);
state.auto = processPixelGrid(state.source, { minimumConfidence: 0.05 });
if (!state.auto.ok) state.auto = null;
state.grid = null;
state.colors = null;
put(root.querySelector("#asset-original"), original);
root.querySelector("#asset-note").textContent = `Transparent PNG · ${payload.provider === "gemini" ? "Nano Banana 2" : "GPT Image 2"} · processed locally`;
render();
if (payload.asset?.id && finalImage) { const canvas = document.createElement("canvas");
put(canvas, finalImage);
const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
if (blob) { const saved = await fetch(`/api/assets/${payload.asset.id}/files/game-ready`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "image/png", "X-CSRF-Token": csrf }, body: blob });
if (!saved.ok) throw new Error("The asset was generated, but its game-ready version could not be saved.");
} } setScreen("result");
window.spriteforgeTrackXOnce?.("Generate", { conversion_id: payload.asset?.id || undefined });
onSaved?.(payload.asset);
} catch (cause) { console.error(cause);
setScreen("error", cause.message || "The asset could not be generated.");
} });
  root.querySelector("#asset-reset").addEventListener("click", () => setScreen("empty"));
root.querySelectorAll(".asset-palette").forEach((button) => button.addEventListener("click", () => { state.colors = button.dataset.assetColors === "original" ? null : Number(button.dataset.assetColors);
render();
}));
root.querySelectorAll(".asset-grid").forEach((button) => button.addEventListener("click", () => { state.grid = button.dataset.assetGrid === "auto" ? null : Number(button.dataset.assetGrid);
render();
}));
root.querySelector("#asset-download").addEventListener("click", () => { if (!finalImage) return;
const canvas = document.createElement("canvas");
put(canvas, finalImage);
canvas.toBlob((blob) => { const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = `${state.mode.id}_${finalImage.width}x${finalImage.height}.png`;
link.click();
URL.revokeObjectURL(url);
}, "image/png");
});
}
