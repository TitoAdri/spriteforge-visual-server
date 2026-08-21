const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const imageOf = (asset) => asset?.files?.["game-ready"]?.url || asset?.files?.original?.url || "";

export const animationEditorMarkup = () => `<div class="animation-sequence-overlay" id="animation-sequence-dialog" hidden>
  <section class="animation-sequence-dialog" role="dialog" aria-modal="true" aria-label="Animation keyframes and retake">
    <header><div><span>SEQUENCE EDITOR</span><h2 data-sequence-title>Animation</h2><p>Lock approved keyframes, insert timing positions, or regenerate one continuous range.</p></div><button data-sequence-close type="button">×</button></header>
    <div class="animation-sequence-body" data-sequence-body></div>
  </section>
</div>`;

export function setupAnimationEditor({ clips = [], assets = [], request, onSetKeyframe, onChanged, onNotice, onError } = {}) {
  document.querySelector("#animation-sequence-dialog")?.remove();
  document.body.insertAdjacentHTML("beforeend", animationEditorMarkup());
  const overlay = document.querySelector("#animation-sequence-dialog");
  const body = overlay.querySelector("[data-sequence-body]"); let clip = null; let selectedFrameId = ""; let selectedAssetId = ""; let busy = false;
  const eligible = assets.filter((asset) => imageOf(asset) && !["animation", "spritesheet", "reference", "tile", "tileset", "pack"].includes(asset.kind));
  const selectedFrame = () => clip?.frames.find((frame) => frame.id === selectedFrameId) || clip?.frames[0];
  const close = () => { if (!busy) overlay.hidden = true; };
  const run = async (work, success) => { if (busy) return; busy = true; overlay.classList.add("busy"); try { await work(); onNotice?.(success); overlay.hidden = true; await onChanged?.(); } catch (error) { onError?.(error.message || "Sequence update failed."); } finally { busy = false; overlay.classList.remove("busy"); } };
  const render = () => {
    if (!clip) return; const frame = selectedFrame(); selectedFrameId = frame.id; const startOptions = clip.frames.slice(1).map((item) => `<option value="${item.position}">${item.position + 1}</option>`).join("");
    body.innerHTML = `<section class="animation-sequence-rail"><span>YOUR TIMELINE</span><div>${clip.frames.map((item) => `<button class="${item.id === frame.id ? "active" : ""} ${item.isLocked ? "locked" : ""}" data-sequence-frame="${item.id}" type="button"><i>${imageOf(item.asset) ? `<img src="${imageOf(item.asset)}" alt=""/>` : "+"}</i><b>${item.position + 1}</b><small>${item.role === "source" ? "Source" : item.role === "keyframe" ? "Keyframe · locked" : item.status}</small></button>`).join("")}</div></section>
      <div class="animation-sequence-columns"><section><header><div><span>SELECTED POSITION</span><h3>Frame ${frame.position + 1}</h3></div><em>${frame.role === "source" ? "Identity anchor" : frame.role === "keyframe" ? "Approved keyframe" : "AI-generated slot"}</em></header><p>${frame.role === "source" ? "The source is permanently locked and defines identity." : "Choose one of your assets to lock it here as a normalized pose reference."}</p><div class="animation-sequence-actions"><button data-sequence-insert type="button">+ Insert after</button><button data-sequence-delete type="button" ${frame.position === 0 || clip.frames.length <= 2 ? "disabled" : ""}>Delete position</button>${frame.role === "keyframe" ? `<button class="danger" data-sequence-clear type="button">Remove keyframe</button>` : ""}</div></section>
      <section><header><div><span>KEYFRAME LIBRARY</span><h3>Your assets</h3></div><em>Normalized on attach</em></header>${frame.position === 0 ? `<div class="animation-sequence-info">Select any later frame to attach a reference.</div>` : `<div class="animation-keyframe-library">${eligible.slice(0, 24).map((asset) => `<button class="${asset.id === selectedAssetId ? "active" : ""}" data-sequence-asset="${asset.id}" type="button"><i><img src="${imageOf(asset)}" alt=""/></i><b>${esc(asset.name)}</b><small>${esc(asset.kind)}</small></button>`).join("")}</div><button class="animation-sequence-primary" data-sequence-attach type="button" ${selectedAssetId ? "" : "disabled"}>Use as locked keyframe</button>`}</section></div>
      <section class="animation-retake"><header><div><span>RETAKE RANGE</span><h3>Regenerate a continuous interval</h3></div><em>Locked keyframes are preserved</em></header><p>Frames just outside the range and approved keyframes are sent as temporal references.</p><div><label>From<select data-retake-start>${startOptions}</select></label><label>To<select data-retake-end>${startOptions}</select></label><button data-sequence-retake type="button">Queue retake</button></div></section>`;
    const start = body.querySelector("[data-retake-start]"); const end = body.querySelector("[data-retake-end]"); if (start && end) { start.value = String(Math.max(1, frame.position || 1)); end.value = start.value; start.addEventListener("change", () => { if (Number(end.value) < Number(start.value)) end.value = start.value; }); }
    body.querySelectorAll("[data-sequence-frame]").forEach((button) => button.addEventListener("click", () => { selectedFrameId = button.dataset.sequenceFrame; selectedAssetId = ""; render(); }));
    body.querySelectorAll("[data-sequence-asset]").forEach((button) => button.addEventListener("click", () => { selectedAssetId = button.dataset.sequenceAsset; render(); }));
    body.querySelector("[data-sequence-insert]")?.addEventListener("click", () => run(() => request("POST", `/api/animations/${clip.id}/frames`, { afterPosition: frame.position }), "A new queued frame was inserted."));
    body.querySelector("[data-sequence-delete]")?.addEventListener("click", () => run(() => request("DELETE", `/api/animations/${clip.id}/frames/${frame.id}`), "The frame position was removed."));
    body.querySelector("[data-sequence-clear]")?.addEventListener("click", () => run(() => request("DELETE", `/api/animations/${clip.id}/frames/${frame.id}/keyframe`), "The keyframe was unlocked and queued for generation."));
    body.querySelector("[data-sequence-attach]")?.addEventListener("click", () => { const asset = assets.find((item) => item.id === selectedAssetId); if (asset) run(() => onSetKeyframe(clip, frame, asset), "The normalized asset is now a locked keyframe."); });
    body.querySelector("[data-sequence-retake]")?.addEventListener("click", () => { const from = Number(start.value); const to = Number(end.value); if (to < from) return onError?.("The end frame must not precede the start frame."); run(() => request("POST", `/api/animations/${clip.id}/retake`, { start: from, end: to }), `Frames ${from + 1}–${to + 1} are queued for retake.`); });
  };
  overlay.querySelector("[data-sequence-close]").addEventListener("click", close); overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); }); document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !overlay.hidden) close(); });
  return { open(clipId) { clip = clips.find((item) => item.id === clipId); if (!clip) return; selectedFrameId = clip.frames.find((frame) => frame.position > 0)?.id || clip.frames[0]?.id; selectedAssetId = ""; overlay.querySelector("[data-sequence-title]").textContent = clip.name; render(); overlay.hidden = false; } };
}
