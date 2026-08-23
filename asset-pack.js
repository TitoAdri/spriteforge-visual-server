import { processPixelGrid } from "/pixel-grid-core.js";
import { cropForeground, forceGrid, removeChromaBleed, removeChromaKey } from "/character-creator.js?v=18";
import { clearCreditUpgrade, showCreditUpgrade } from "/credit-alert.js?v=2";

const TYPES = {
  inventory: { label: "Inventory set", description: "Collectibles, consumables and loot", items: [["item", "A brass compass with a cyan needle"], ["item", "A small emerald healing potion"], ["weapon", "A weathered iron short sword"]] },
  "adventure-props": { label: "Adventure props", description: "Readable interactables for a level", items: [["prop", "An old oak treasure chest with iron bands"], ["prop", "A rope bridge signpost with a lantern"], ["environment", "A mossy stone shrine with roots"]] },
  scenery: { label: "Scenery kit", description: "Standalone environment elements", items: [["environment", "A moss-covered stone well"], ["environment", "A gnarled forest tree stump"], ["building", "A compact wooden market stall"]] },
  "ui-icons": { label: "UI icon set", description: "Clear game HUD symbols", items: [["ui-icon", "A bright emerald health potion icon"], ["ui-icon", "A gold coin inventory icon"], ["ui-icon", "A blue mana crystal icon"]] },
  custom: { label: "Custom pack", description: "Start from your own list", items: [["item", "A useful game item with a clear silhouette"]] },
};
const ASSET_TYPES = ["item", "weapon", "prop", "environment", "building", "ui-icon", "ui-panel"];
const TAGS = ["cozy", "rpg", "stardew-valley-like", "dark fantasy", "cute", "cyberpunk", "dungeon crawler", "handheld retro", "fantasy", "sci-fi", "medieval", "horror", "mystical", "whimsical", "roguelike", "adventure"];
const escape = (value) => String(value || "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const cookie = (name) => document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) || "";
const requestKey = () => globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

function itemRow(item, index) {
  return `<article class="pack-item-row" data-pack-item-row="${index}"><span class="pack-item-index">${index + 1}</span><select data-pack-item-type="${index}">${ASSET_TYPES.map((type) => `<option value="${type}" ${item.assetType === type ? "selected" : ""}>${type}</option>`).join("")}</select><input data-pack-item-brief="${index}" value="${escape(item.brief)}" maxlength="700" aria-label="Asset ${index + 1} brief" /><button type="button" data-pack-remove="${index}" aria-label="Remove asset ${index + 1}">×</button></article>`;
}

function packCard(pack) {
  const done = pack.items.filter((item) => item.status === "succeeded").length;
  const failed = pack.items.filter((item) => item.status === "failed").length;
  const queued = pack.items.filter((item) => item.status === "queued").length;
  const status = failed ? "Needs attention" : queued ? `${queued} queued` : done === pack.items.length ? "Complete" : "In progress";
  return `<article class="pack-card" data-pack="${pack.id}"><header><span>${escape(pack.pack_type.replaceAll("-", " "))}</span><b>${escape(pack.name)}</b><small>${done}/${pack.items.length} generated · ${status}</small></header><div class="pack-card-items">${pack.items.map((item) => `<div class="pack-card-item ${item.status}">${item.asset?.files?.["game-ready"]?.url ? `<img src="${item.asset.files["game-ready"].url}" alt="" />` : `<span>${item.status === "succeeded" ? "✓" : item.status === "failed" ? "!" : "✦"}</span>`}<small>${escape(item.brief)}</small></div>`).join("")}</div><footer><button type="button" data-pack-run="${pack.id}" ${queued ? "" : "disabled"}>${done ? "Resume queue" : "Generate pack"} →</button>${failed ? `<button type="button" class="pack-retry" data-pack-retry="${pack.id}">Retry failed</button>` : ""}</footer></article>`;
}

export const assetPackMarkup = ({ theme = null, packs = [] } = {}) => `<section class="studio-view studio-asset-pack-view"><header class="studio-topbar"><div><span class="studio-kicker">CREATE · ASSET PACK${theme ? ` · THEME: ${escape(theme.name.toUpperCase())}` : ""}</span><h1>Asset pack builder</h1><p>Plan a coherent set, then generate it one asset at a time into one private collection.</p></div><button data-studio-view="assets" class="studio-upload" type="button">View library →</button></header><section class="pack-builder" id="asset-pack-builder"><form class="pack-form"><label><span>Pack name</span><input name="name" maxlength="160" required value="New adventure kit" /></label><label><span>Pack type</span><select name="packType">${Object.entries(TYPES).map(([id, type]) => `<option value="${id}">${type.label} · ${type.description}</option>`).join("")}</select></label><label><span>Provider</span><select name="provider"><option value="openai" selected>GPT Image 2</option><option value="gemini">Nano Banana 2</option></select></label><label><span>Pixel scale</span><select name="pixelScale"><option value="uniform-coarse">Large pixels · bold</option><option value="uniform-medium" selected>Medium pixels · balanced</option><option value="uniform-fine">Small pixels · detailed</option></select></label><label><span>Default view</span><select name="view"><option value="left-3-4">3/4 game view</option><option value="front">Front</option><option value="top-down">Top-down</option><option value="isometric">Isometric</option></select></label><section><span>Style tags</span><input name="tags" maxlength="390" value="${escape(theme?.styleTags?.join(", ") || "")}" placeholder="cozy, rpg, warm" /><div class="pack-tags">${TAGS.map((tag) => `<button type="button" data-pack-tag="${tag}">${tag}</button>`).join("")}</div></section><section class="pack-items-field"><span>Pack contents <small id="pack-count">3 assets · 3 tokens when generated</small></span><div id="pack-items"></div><button class="pack-add" type="button" id="pack-add-item">+ Add asset</button></section><p class="pack-error" id="pack-error" hidden></p><button class="pack-create" type="submit">Create pack &amp; queue <b>→</b></button><small class="pack-note">Each asset is generated sequentially, charged only when it begins, and remains in the queue if you leave the page.</small></form><section class="pack-library"><header><span>YOUR ASSET PACKS</span><small>Collections are private to your account.</small></header><div class="pack-library-list">${packs.length ? packs.map(packCard).join("") : `<div class="pack-empty"><b>Your first pack starts here.</b><span>Choose a kit, refine its assets and generate them with one shared direction.</span></div>`}</div></section></section></section>`;

async function decode(base64, mimeType) {
  const image = new Image(); image.src = `data:${mimeType};base64,${base64}`; await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0); return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function saveGameReady(asset, imageData, csrf) {
  const canvas = document.createElement("canvas"); canvas.width = imageData.width; canvas.height = imageData.height; canvas.getContext("2d").putImageData(imageData, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The generated asset could not be normalized.");
  const response = await fetch(`/api/assets/${asset.id}/files/game-ready`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "image/png", "X-CSRF-Token": csrf }, body: blob });
  if (!response.ok) throw new Error("The generated asset could not be saved to its pack.");
}

export function setupAssetPack({ theme = null, packs = [], onChanged, onNotice } = {}) {
  const root = document.querySelector("#asset-pack-builder"); if (!root) return;
  const form = root.querySelector(".pack-form"); const itemsRoot = root.querySelector("#pack-items"); const error = root.querySelector("#pack-error");
  form.insertAdjacentHTML("afterbegin", '<input type="hidden" name="provider" value="openai" />');
  const fixedActions = document.createElement("div"); fixedActions.className = "pack-fixed-actions";
  const scrollFields = document.createElement("div"); scrollFields.className = "pack-form-scroll";
  const createButton = form.querySelector(".pack-create"); const note = form.querySelector(".pack-note");
  Array.from(form.children).forEach((child) => { if (child !== createButton && child !== note) scrollFields.append(child); });
  fixedActions.append(createButton, note); form.append(scrollFields, fixedActions);
  let items = TYPES.inventory.items.map(([assetType, brief]) => ({ assetType, brief })); let running = false;
  const setError = (message = "") => { error.hidden = !message; error.textContent = message; };
  const syncItems = () => { itemsRoot.innerHTML = items.map(itemRow).join(""); root.querySelector("#pack-count").textContent = `${items.length} asset${items.length === 1 ? "" : "s"} · ${items.length} token${items.length === 1 ? "" : "s"} when generated`; itemsRoot.querySelectorAll("[data-pack-remove]").forEach((button) => button.addEventListener("click", () => { if (items.length > 1) { items.splice(Number(button.dataset.packRemove), 1); syncItems(); } })); itemsRoot.querySelectorAll("[data-pack-item-type]").forEach((select) => select.addEventListener("change", () => { items[Number(select.dataset.packItemType)].assetType = select.value; })); itemsRoot.querySelectorAll("[data-pack-item-brief]").forEach((input) => input.addEventListener("input", () => { items[Number(input.dataset.packItemBrief)].brief = input.value; })); };
  const syncTags = () => { const input = form.elements.tags; const chosen = new Set(input.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean)); root.querySelectorAll("[data-pack-tag]").forEach((button) => button.classList.toggle("active", chosen.has(button.dataset.packTag))); };
  syncItems(); syncTags();
  form.elements.packType.addEventListener("change", () => { items = TYPES[form.elements.packType.value].items.map(([assetType, brief]) => ({ assetType, brief })); syncItems(); });
  form.elements.tags.addEventListener("input", syncTags);
  root.querySelectorAll("[data-pack-tag]").forEach((button) => button.addEventListener("click", () => { const input = form.elements.tags; const values = new Set(input.value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean)); if (values.has(button.dataset.packTag)) values.delete(button.dataset.packTag); else if (values.size < 8) values.add(button.dataset.packTag); input.value = [...values].join(", "); syncTags(); }));
  root.querySelector("#pack-add-item").addEventListener("click", () => { if (items.length < 12) { items.push({ assetType: "item", brief: "A useful game item with a clear silhouette" }); syncItems(); } });
  const request = async (url, method, body) => { const csrf = cookie("spriteforge_csrf"); if (!csrf) throw new Error("Sign in to create an asset pack."); const response = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Asset pack request failed."); return payload; };
  const runPack = async (pack, trigger = createButton) => {
    if (running) return; running = true; setError();
    try {
      for (const item of pack.items.filter((candidate) => candidate.status === "queued")) {
        const settings = pack.settings || {}; const size = item.asset_type === "building" ? 96 : item.asset_type === "ui-icon" ? 48 : 64;
        const body = { provider: pack.provider, tier: "draft", themeId: pack.theme_id || null, assetPack: { id: pack.id, itemId: item.id }, recipe: { assetType: item.asset_type, subject: item.brief, view: settings.view || "left-3-4", lockView: true, pose: "static asset presentation", target: { width: size, height: size }, palette: { maxColors: item.asset_type === "ui-icon" ? 16 : 24, mood: "production-ready game pixel art" }, pixelScale: settings.pixelScale || "uniform-medium", styleTags: pack.styleTags || [], composition: { paddingPercent: item.asset_type === "building" ? 10 : 18, fullBody: false, groundShadow: false }, lockedTraits: [] } };
        const csrf = cookie("spriteforge_csrf"); const response = await fetch("/api/generate", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf, "Idempotency-Key": requestKey() }, body: JSON.stringify(body) }); const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Generation request failed.");
        const source = cropForeground(await decode(payload.imageBase64, payload.mimeType)); const automatic = processPixelGrid(source, { minimumConfidence: 0.05 }); const snapped = automatic.ok ? automatic.snapped : forceGrid(source, 48); const clean = removeChromaBleed(removeChromaKey(snapped)); await saveGameReady(payload.asset, clean, csrf);
        window.spriteforgeTrackX?.("Generate", { conversion_id: payload.asset?.id || undefined }); onNotice?.(`Saved ${item.brief} to ${pack.name}.`); await onChanged?.();
      }
    } catch (cause) { const blocked = showCreditUpgrade(trigger, cause); const message = cause.message || "The pack queue stopped."; if (!blocked) { setError(message); onNotice?.(`Asset pack paused: ${message}`); await onChanged?.(); } } finally { running = false; }
  };
  form.addEventListener("submit", async (event) => { event.preventDefault(); try { clearCreditUpgrade(createButton); setError(); const values = Object.fromEntries(new FormData(form)); const pack = await request("/api/asset-packs", "POST", { name: values.name, packType: values.packType, provider: values.provider, themeId: theme?.id || null, styleTags: values.tags.split(",").map((tag) => tag.trim()).filter(Boolean), settings: { pixelScale: values.pixelScale, view: values.view }, items }); onNotice?.("Asset pack created. Starting its queue."); await runPack(pack, createButton); await onChanged?.(); } catch (cause) { if (!showCreditUpgrade(createButton, cause)) setError(cause.message || "The asset pack could not be created."); } });
  root.querySelectorAll("[data-pack-run]").forEach((button) => button.addEventListener("click", () => runPack(packs.find((pack) => pack.id === button.dataset.packRun), button)));
  root.querySelectorAll("[data-pack-retry]").forEach((button) => button.addEventListener("click", async () => { const pack = packs.find((item) => item.id === button.dataset.packRetry); try { for (const item of pack.items.filter((entry) => entry.status === "failed" || entry.status === "running")) await request(`/api/asset-packs/${pack.id}/items/${item.id}/retry`, "POST", {}); await onChanged?.(); onNotice?.("Failed items are queued again."); } catch (cause) { if (!showCreditUpgrade(button, cause)) setError(cause.message); } }));
}
