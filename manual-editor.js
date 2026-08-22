const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const csrf = () => document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith("spriteforge_csrf="))?.slice("spriteforge_csrf=".length) || "";
const uuid = () => crypto.randomUUID();

const chooser = (assets) => `<section class="manual-editor-chooser" data-editor-chooser>
  <div class="manual-editor-chooser-head"><div><span>MANUAL EDITOR</span><h2>Choose a pixel art asset</h2><p>Continue an asset from your private library or upload a new image.</p></div><button data-editor-chooser-close type="button" aria-label="Close">×</button></div>
  <label class="manual-editor-search">⌕ <input data-editor-search type="search" placeholder="Search your assets…" /></label>
  <div class="manual-editor-assets">${assets.filter((item) => /^[0-9a-f-]{36}$/i.test(item.id)).map((item) => `<button data-editor-asset="${escapeHtml(item.id)}" type="button"><span class="checker"><img src="${escapeHtml(item.image?.startsWith("/") ? item.image : `/assets/${item.image}`)}" alt="" /></span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.type)} · ${escapeHtml(item.project)}</small></span></button>`).join("") || `<p class="manual-editor-empty">No assets yet. Upload a PNG, JPG or WebP to begin.</p>`}</div>
  <form class="manual-editor-upload" data-editor-upload><div><b>Upload a new image</b><small>PNG, JPG or WebP · maximum 10 MiB</small></div><label class="manual-editor-file">Choose image<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required /></label><input name="name" maxlength="160" placeholder="Asset name" required /><select name="kind" aria-label="Asset type"><option value="character">Character</option><option value="prop" selected>Asset / prop</option><option value="tile">Tile</option><option value="ui-icon">UI icon</option><option value="reference">Reference</option></select><button type="submit">Upload and edit →</button><p data-editor-upload-error role="alert" hidden></p></form>
</section>`;

export const manualEditorMarkup = ({ assets = [], assetId = "" } = {}) => `<section class="studio-view manual-editor-view" data-manual-editor data-asset-id="${escapeHtml(assetId)}">
  <header class="manual-editor-toolbar">
    <div class="manual-editor-identity"><div><span class="manual-editor-kicker">ADMIN TOOL · PIXEL EDITOR</span><b>Manual editor</b></div><span data-editor-asset-name>${assetId ? "Loading asset…" : "No asset selected"}</span></div>
    <div class="manual-editor-tools"><button data-editor-choose type="button">Change asset</button><button data-editor-history-toggle type="button">History</button><button class="manual-editor-save" data-editor-save type="button" disabled>Save</button><button data-editor-save-copy type="button" disabled>Save as new</button></div>
    <span class="manual-editor-status" data-editor-status>No changes</span>
  </header>
  <div class="manual-editor-history" data-editor-history hidden><header><b>Revision history</b><button data-editor-history-close type="button">×</button></header><div data-editor-history-list><p>No saved revisions yet.</p></div></div>
  <div class="manual-editor-mobile"><h2>Editor available on desktop</h2><p>Open SpriteForge on a screen at least 1024 px wide to use the full manual editor.</p></div>
  <div class="manual-editor-stage" data-editor-stage><div class="manual-editor-loading" data-editor-loading><span></span><b>${assetId ? "Loading your editable asset…" : "Choose an asset to start editing"}</b></div><iframe data-editor-frame src="/pixel-editor/index.html?v=3" title="SpriteForge pixel art editor"></iframe></div>
  <div class="manual-editor-picker" data-editor-picker ${assetId ? "hidden" : ""}>${chooser(assets)}</div>
</section>`;

export function setupManualEditor({ assets = [], initialAssetId = "", onNavigate, onChanged, onNotice } = {}) {
  const root = document.querySelector("[data-manual-editor]");
  if (!root) return null;
  const frame = root.querySelector("[data-editor-frame]");
  const loading = root.querySelector("[data-editor-loading]");
  const status = root.querySelector("[data-editor-status]");
  const picker = root.querySelector("[data-editor-picker]");
  const history = root.querySelector("[data-editor-history]");
  const historyList = root.querySelector("[data-editor-history-list]");
  const saveButton = root.querySelector("[data-editor-save]");
  const copyButton = root.querySelector("[data-editor-save-copy]");
  const pendingSnapshots = new Map();
  let assetId = initialAssetId;
  let info = null;
  let ready = false;
  let initialized = false;
  let dirty = false;
  let saving = false;
  let destroyed = false;

  const notice = (message) => onNotice?.(message);
  const setStatus = (message, state = "idle") => { status.textContent = message; status.dataset.state = state; };
  const setDirty = (value) => { dirty = value; saveButton.disabled = !value || saving || !assetId; copyButton.disabled = saving || !assetId; setStatus(value ? "Unsaved changes" : "No changes", value ? "dirty" : "idle"); };
  const post = (type, payload = {}) => frame.contentWindow?.postMessage({ source: "spriteforge-editor-shell", type, ...payload }, window.location.origin);
  const sourceUrl = (asset) => asset?.files?.["game-ready"]?.url || asset?.files?.animation?.url || asset?.files?.original?.url || "";

  const renderHistory = () => {
    const revisions = info?.revisions || [];
    historyList.innerHTML = revisions.length ? revisions.map((revision, index) => `<button data-editor-revision="${escapeHtml(revision.id)}" type="button"><span><b>${index === 0 ? "Current · " : ""}Revision ${revision.number}</b><small>${revision.width}×${revision.height} · ${revision.frameCount} frame${revision.frameCount === 1 ? "" : "s"}</small></span><time>${new Date(revision.createdAt).toLocaleString()}</time></button>`).join("") : "<p>No saved revisions yet.</p>";
    historyList.querySelectorAll("[data-editor-revision]").forEach((button) => button.addEventListener("click", async () => {
      try { const response = await fetch(`/api/assets/${assetId}/editor/revisions/${button.dataset.editorRevision}`, { credentials: "same-origin", cache: "no-store" }); if (!response.ok) throw new Error("Revision could not be loaded"); post("spriteforge:load-document", { document: await response.text() }); history.hidden = true; setDirty(true); notice("Revision loaded. Save to make it current."); } catch (error) { notice(error.message); }
    }));
  };

  const initialize = async () => {
    if (!ready || initialized || !assetId) return;
    initialized = true;
    try {
      const response = await fetch(`/api/assets/${assetId}/editor`, { credentials: "same-origin", cache: "no-store" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Asset could not be opened"); info = payload;
      root.querySelector("[data-editor-asset-name]").textContent = `Asset: ${payload.asset.name}`; renderHistory();
      let document = null;
      if (payload.currentRevision) { const revisionResponse = await fetch(`/api/assets/${assetId}/editor/revisions/${payload.currentRevision.id}`, { credentials: "same-origin", cache: "no-store" }); if (!revisionResponse.ok) throw new Error("Editable document could not be loaded"); document = await revisionResponse.text(); }
      post("spriteforge:init", { document, sourceUrl: document ? null : sourceUrl(payload.asset), name: payload.asset.name });
    } catch (error) { initialized = false; loading.innerHTML = `<b>${escapeHtml(error.message)}</b>`; setStatus("Could not load", "error"); }
  };

  const requestSnapshot = () => new Promise((resolve, reject) => {
    const requestId = uuid(); const timeout = window.setTimeout(() => { pendingSnapshots.delete(requestId); reject(new Error("The editor did not return a snapshot in time.")); }, 35000);
    pendingSnapshots.set(requestId, { resolve: (payload) => { clearTimeout(timeout); resolve(payload); }, reject: (error) => { clearTimeout(timeout); reject(error); } }); post("spriteforge:request-snapshot", { requestId });
  });

  const save = async (asCopy = false) => {
    if (saving || !assetId) return;
    saving = true; saveButton.disabled = true; copyButton.disabled = true; setStatus("Saving…", "saving");
    try {
      const snapshot = await requestSnapshot();
      let url = `/api/assets/${assetId}/editor/revisions`; let name = "";
      if (asCopy) { name = window.prompt("Name for the new asset", `${info?.asset?.name || "Asset"} — edit`)?.trim() || ""; if (!name) throw new Error("Save as New was cancelled."); url = `/api/assets/${assetId}/editor/copies`; }
      const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ ...snapshot, name: name || undefined }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "The edit could not be saved");
      const copiedAssetId = asCopy ? payload.asset.id : "";
      if (copiedAssetId) assetId = copiedAssetId;
      const refreshed = await fetch(`/api/assets/${assetId}/editor`, { credentials: "same-origin", cache: "no-store" }); info = await refreshed.json(); root.querySelector("[data-editor-asset-name]").textContent = `Asset: ${info.asset.name}`; renderHistory(); setDirty(false); setStatus("Saved", "saved"); await onChanged?.(); notice(asCopy ? "New edited asset saved." : "Pixel art saved.");
      if (copiedAssetId) window.setTimeout(() => onNavigate?.(copiedAssetId), 0);
    } catch (error) { if (error.message !== "Save as New was cancelled.") notice(error.message); setStatus(dirty ? "Unsaved changes" : "No changes", dirty ? "dirty" : "idle"); }
    finally { saving = false; saveButton.disabled = !dirty; copyButton.disabled = !assetId; }
  };

  const onMessage = (event) => {
    if (event.origin !== window.location.origin || event.source !== frame.contentWindow || event.data?.source !== "spriteforge-pixel-editor") return;
    const message = event.data;
    if (message.type === "spriteforge:ready") { ready = true; initialize(); }
    else if (message.type === "spriteforge:loaded") { loading.hidden = true; setDirty(false); copyButton.disabled = false; }
    else if (message.type === "spriteforge:dirty") setDirty(true);
    else if (message.type === "spriteforge:snapshot") { const pending = pendingSnapshots.get(message.requestId); if (pending) { pendingSnapshots.delete(message.requestId); pending.resolve(message); } }
    else if (message.type === "spriteforge:error") { const pending = pendingSnapshots.get(message.requestId); if (pending) { pendingSnapshots.delete(message.requestId); pending.reject(new Error(message.message)); } else notice(message.message); }
  };
  window.addEventListener("message", onMessage);
  const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
  window.addEventListener("beforeunload", beforeUnload);

  root.querySelector("[data-editor-choose]").addEventListener("click", () => { picker.hidden = false; });
  root.querySelector("[data-editor-history-toggle]").addEventListener("click", () => { history.hidden = !history.hidden; });
  root.querySelector("[data-editor-history-close]").addEventListener("click", () => { history.hidden = true; });
  root.querySelector("[data-editor-save]").addEventListener("click", () => save(false)); root.querySelector("[data-editor-save-copy]").addEventListener("click", () => save(true));
  picker.querySelector("[data-editor-chooser-close]").addEventListener("click", () => { if (assetId) picker.hidden = true; });
  picker.querySelector("[data-editor-search]").addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); picker.querySelectorAll("[data-editor-asset]").forEach((button) => { button.hidden = !button.innerText.toLowerCase().includes(query); }); });
  picker.querySelectorAll("[data-editor-asset]").forEach((button) => button.addEventListener("click", () => { if (dirty && !window.confirm("Discard unsaved editor changes?")) return; onNavigate?.(button.dataset.editorAsset); }));
  picker.querySelector("[data-editor-upload]").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const file = form.elements.file.files[0]; const error = form.querySelector("[data-editor-upload-error]"); const submit = form.querySelector("button[type=submit]"); error.hidden = true;
    if (!file || file.size > 10 * 1024 * 1024) { error.hidden = false; error.textContent = "Choose an image smaller than 10 MiB."; return; }
    submit.disabled = true; submit.textContent = "Uploading…";
    try { const response = await fetch("/api/editor/uploads", { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type, "X-CSRF-Token": csrf(), "X-Asset-Name": encodeURIComponent(form.elements.name.value.trim()), "X-Asset-Kind": form.elements.kind.value }, body: file }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Upload failed"); onNavigate?.(payload.asset.id); }
    catch (cause) { error.hidden = false; error.textContent = cause.message; submit.disabled = false; submit.textContent = "Upload and edit →"; }
  });

  if (!assetId) loading.hidden = false;
  return {
    hasUnsavedChanges: () => dirty,
    destroy: () => { if (destroyed) return; destroyed = true; window.removeEventListener("message", onMessage); window.removeEventListener("beforeunload", beforeUnload); for (const pending of pendingSnapshots.values()) pending.reject(new Error("Editor closed")); pendingSnapshots.clear(); },
  };
}
