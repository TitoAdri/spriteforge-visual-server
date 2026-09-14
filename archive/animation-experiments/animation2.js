import { RIG_JOINTS, RIG_PARENTS, MOTION2, alphaBounds, autoRig, deformSprite, motionRigs } from "/animation2-core.js?v=7";

const escape = (value) => String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
const sourceUrl = (item) => item?.image?.startsWith("/") ? item.image : `/assets/${item?.image || "showcase/avatars/outlined/tinyslime24.png"}`;
const eligible = (item) => Boolean(item?.image) && !["frame", "animation", "spritesheet", "tileset", "tile", "pack"].includes(item.kind);

const sourceCard = (item, active) => `<button class="animation2-source ${active ? "active" : ""}" data-animation2-source="${item.id}" type="button"><span><img src="${sourceUrl(item)}" alt=""/></span><b>${escape(item.name)}</b><small>${escape(item.type || item.kind || "asset")}</small></button>`;

export function animation2Markup({ assets = [] } = {}) {
  const sources = assets.filter(eligible);
  return `<section class="studio-view studio-animation2-view">
    <header class="studio-topbar"><div><span class="studio-kicker">CREATE · ANIMATION 2 · LOCAL LAB</span><h1>Skeleton animation lab</h1><p>Rig one approved sprite, pose deterministic keyframes and preview a local pixel-preserving deformation.</p></div><button data-studio-view="animation" class="studio-upload" type="button">Open Animation 1 →</button></header>
    <section class="animation2-shell">
      <aside class="animation2-controls">
        <section class="animation2-field"><span>Source sprite</span>${sources.length ? `<div class="animation2-sources">${sources.slice(0, 12).map((item, index) => sourceCard(item, index === 0)).join("")}</div>` : `<div class="animation2-empty">Generate or upload a character first.</div>`}<small>The image is processed locally. Nothing is generated or uploaded.</small></section>
        <section class="animation2-field"><span>Motion template</span><div class="animation2-motions">${Object.entries(MOTION2).map(([id, motion], index) => `<button class="${index === 0 ? "active" : ""}" data-animation2-motion="${id}" type="button"><i>${id === "idle" ? "♙" : id === "walk" ? "→" : "✦"}</i><b>${motion.title}</b><small>${id === "custom" ? "Build your own poses" : `${motion.frames} keyframes · ${motion.fps} FPS`}</small></button>`).join("")}</div></section>
        <section class="animation2-field"><span>Edit mode</span><div class="animation2-mode"><button class="active" data-animation2-mode="rig" type="button"><b>1 · Fit rig</b><small>Place joints on the approved sprite.</small></button><button data-animation2-mode="pose" type="button"><b>2 · Edit pose</b><small>Adjust the selected keyframe.</small></button></div></section>
        <div class="animation2-actions"><button data-animation2-auto type="button">Auto-place rig</button><button data-animation2-reset type="button">Reset selected pose</button></div>
        <label class="animation2-toggle"><input data-animation2-overlay type="checkbox" checked/><span>Show skeleton overlay</span></label>
        <label class="animation2-toggle"><input data-animation2-ground-lock type="checkbox" checked/><span>Lock feet to ground</span></label>
        <div class="animation2-info"><b>Zero generation tokens</b><span>This prototype rotates existing pixel regions around bones. A future local repair model will only inpaint damaged joints and occlusions.</span></div>
        <p class="animation2-error" data-animation2-error hidden></p>
      </aside>
      <section class="animation2-workbench">
        <header><div><span class="studio-kicker">RIG → KEYFRAME → DEFORMED SPRITE</span><h2 data-animation2-title>Preparing local rig…</h2></div><div><button data-animation2-play type="button">▶ Play</button><button data-animation2-frame-download type="button">Download frame</button><button data-animation2-sheet type="button">Export sheet</button></div></header>
        <div class="animation2-zoombar"><span>CANVAS ZOOM</span><button data-animation2-zoom-out type="button" aria-label="Zoom out">−</button><button data-animation2-zoom-fit type="button">Fit</button><b data-animation2-zoom-label>1×</b><button data-animation2-zoom-in type="button" aria-label="Zoom in">+</button><small>Integer zoom keeps every pixel crisp. Scroll inside a panel to pan.</small></div>
        <div class="animation2-stages">
          <article><header><b data-animation2-editor-label>SOURCE + RIG</b><small>Drag the joint handles</small></header><div class="animation2-canvas-wrap checker"><canvas data-animation2-editor></canvas></div></article>
          <article><header><b>DEFORMED FRAME</b><small>Local nearest-neighbour result</small></header><div class="animation2-canvas-wrap checker"><canvas data-animation2-output></canvas></div></article>
        </div>
        <section class="animation2-timeline"><header><span>KEYFRAMES</span><div><small>Select a frame, then use Edit pose.</small><button data-animation2-add-frame type="button" hidden>+ Add keyframe</button><button data-animation2-remove-frame type="button" hidden>Remove</button></div></header><div data-animation2-frames></div></section>
        <footer><span><i></i> Identity pixels preserved</span><span><i></i> Bone lengths locked while posing</span><span><i></i> Bottom pivot remains visible</span></footer>
      </section>
    </section>
  </section>`;
}

const descendants = (joint) => RIG_JOINTS.filter((candidate) => {
  let parent = RIG_PARENTS[candidate];
  while (parent) { if (parent === joint) return true; parent = RIG_PARENTS[parent]; }
  return false;
});

const putImage = (canvas, image) => {
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d", { alpha: true }); context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
};

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image(); image.onload = () => {
    const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { willReadFrequently: true }); context.imageSmoothingEnabled = false; context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const original = context.getImageData(0, 0, canvas.width, canvas.height); const box = alphaBounds(original); const padding = Math.max(4, Math.ceil(Math.max(box.width, box.height) * .12)); const left = Math.max(0, box.left - padding); const top = Math.max(0, box.top - padding); const right = Math.min(canvas.width - 1, box.right + padding); const bottom = Math.min(canvas.height - 1, box.bottom + padding);
    resolve(context.getImageData(left, top, right - left + 1, bottom - top + 1));
  }; image.onerror = () => reject(new Error("The source sprite could not be loaded.")); image.src = url;
});

const drawRig = (canvas, rig, selected = "") => {
  const context = canvas.getContext("2d");
  const scale = Math.max(1, Math.min(canvas.width, canvas.height) / 80);
  context.save(); context.lineCap = "round"; context.lineJoin = "round"; context.lineWidth = Math.max(1, scale * 1.25); context.strokeStyle = "#8b80ff";
  for (const joint of RIG_JOINTS) { const parent = RIG_PARENTS[joint]; if (!parent) continue; context.beginPath(); context.moveTo(rig[parent].x, rig[parent].y); context.lineTo(rig[joint].x, rig[joint].y); context.stroke(); }
  for (const joint of RIG_JOINTS) { context.beginPath(); context.arc(rig[joint].x, rig[joint].y, Math.max(1.8, scale * 2.15), 0, Math.PI * 2); context.fillStyle = joint === selected ? "#fff5a8" : joint === "root" ? "#ff966f" : "#63e0bc"; context.fill(); context.lineWidth = Math.max(.75, scale * .7); context.strokeStyle = "#0a0d14"; context.stroke(); }
  context.restore();
};

export function setupAnimation2({ assets = [], onNotice } = {}) {
  const root = document.querySelector(".studio-animation2-view"); if (!root) return;
  const sources = assets.filter(eligible); const editor = root.querySelector("[data-animation2-editor]"); const output = root.querySelector("[data-animation2-output]"); const frameList = root.querySelector("[data-animation2-frames]");
  let source = sources[0] || null, sourceImage = null, sourceRig = null, frameRigs = [], frameImages = [], motion = "idle", frameIndex = 0, mode = "rig", selectedJoint = "", dragging = false, playing = false, timer = null, zoom = 1;
  const error = (message = "") => { const node = root.querySelector("[data-animation2-error]"); node.hidden = !message; node.textContent = message; };
  const title = () => { root.querySelector("[data-animation2-title]").textContent = source ? `${source.name} · ${MOTION2[motion].title} · frame ${frameIndex + 1}/${frameRigs.length || MOTION2[motion].frames}` : "Choose a source sprite"; root.querySelector("[data-animation2-editor-label]").textContent = mode === "rig" ? "SOURCE + RIG" : "KEYFRAME POSE"; };
  const currentRig = () => mode === "rig" ? sourceRig : frameRigs[frameIndex];
  const renderEditor = () => {
    if (!sourceImage || !currentRig()) return;
    const background = mode === "rig" ? sourceImage : frameImages[frameIndex]; putImage(editor, background);
    if (root.querySelector("[data-animation2-overlay]").checked) drawRig(editor, currentRig(), selectedJoint);
    title();
  };
  const applyZoom = () => { for (const canvas of [editor, output]) { if (!canvas.width || !canvas.height) continue; canvas.style.width = `${canvas.width * zoom}px`; canvas.style.height = `${canvas.height * zoom}px`; } root.querySelector("[data-animation2-zoom-label]").textContent = `${zoom}×`; };
  const fitZoom = () => { if (!sourceImage) return; const wrap = output.closest(".animation2-canvas-wrap"); const availableWidth = Math.max(120, wrap.clientWidth - 34); const availableHeight = Math.max(180, wrap.clientHeight - 34); zoom = Math.max(1, Math.min(16, Math.floor(Math.min(availableWidth / sourceImage.width, availableHeight / sourceImage.height)))); applyZoom(); };
  const renderOutput = () => { if (!frameImages[frameIndex]) return; putImage(output, frameImages[frameIndex]); applyZoom(); };
  const renderTimeline = () => {
    frameList.innerHTML = frameImages.map((_, index) => `<button class="${index === frameIndex ? "active" : ""}" data-animation2-frame="${index}" type="button"><span>${index + 1}</span><canvas></canvas><b>${index === 0 ? "Source pose" : "Keyframe"}</b></button>`).join("");
    frameList.querySelectorAll("button").forEach((button) => { putImage(button.querySelector("canvas"), frameImages[Number(button.dataset.animation2Frame)]); button.addEventListener("click", () => { stop(); frameIndex = Number(button.dataset.animation2Frame); selectedJoint = ""; renderAll(false); }); });
    const custom = motion === "custom", add = root.querySelector("[data-animation2-add-frame]"), remove = root.querySelector("[data-animation2-remove-frame]");
    add.hidden = !custom; remove.hidden = !custom; remove.disabled = frameRigs.length <= 1;
  };
  const groundLocked = () => root.querySelector("[data-animation2-ground-lock]").checked;
  const rebuildImages = () => { frameImages = frameRigs.map((rig) => deformSprite(sourceImage, sourceRig, rig, { lockGround: groundLocked() })); };
  const renderAll = (timeline = true) => { renderEditor(); renderOutput(); if (timeline) renderTimeline(); else frameList.querySelectorAll("button").forEach((button, index) => button.classList.toggle("active", index === frameIndex)); title(); };
  const resetMotion = () => { const box = alphaBounds(sourceImage); frameRigs = motionRigs(sourceRig, motion, Math.max(1, box.height)); frameIndex = 0; rebuildImages(); renderAll(); };
  const loadSource = async (item) => {
    stop(); source = item; error(); root.querySelectorAll("[data-animation2-source]").forEach((button) => button.classList.toggle("active", button.dataset.animation2Source === item.id));
    root.querySelector("[data-animation2-title]").textContent = "Loading sprite locally…";
    try { sourceImage = await loadImage(sourceUrl(item)); const saved = localStorage.getItem(`spriteforge-rig:${item.id}`); sourceRig = saved ? JSON.parse(saved) : autoRig(sourceImage); resetMotion(); requestAnimationFrame(fitZoom); }
    catch (cause) { error(cause.message || "The source could not be prepared."); }
  };
  const stop = () => { playing = false; if (timer) clearInterval(timer); timer = null; const button = root.querySelector("[data-animation2-play]"); if (button) button.textContent = "▶ Play"; };
  const play = () => { if (playing) return stop(); playing = true; root.querySelector("[data-animation2-play]").textContent = "Ⅱ Pause"; timer = setInterval(() => { frameIndex += 1; if (frameIndex >= frameImages.length) { if (!MOTION2[motion].loop) { frameIndex = frameImages.length - 1; stop(); } else frameIndex = 0; } renderAll(false); }, Math.round(1000 / MOTION2[motion].fps)); };
  const pointer = (event) => { const rect = editor.getBoundingClientRect(); return { x: (event.clientX - rect.left) * editor.width / rect.width, y: (event.clientY - rect.top) * editor.height / rect.height, radius: 13 * editor.width / rect.width }; };
  const nearest = ({ x, y, radius }) => { let found = "", distance = radius ** 2; for (const joint of RIG_JOINTS) { const candidate = currentRig()[joint]; const next = (candidate.x - x) ** 2 + (candidate.y - y) ** 2; if (next < distance) { distance = next; found = joint; } } return found; };
  editor.addEventListener("pointerdown", (event) => { if (!currentRig()) return; stop(); const at = pointer(event); selectedJoint = nearest(at); if (!selectedJoint) return; dragging = true; editor.setPointerCapture(event.pointerId); renderEditor(); });
  editor.addEventListener("pointermove", (event) => {
    if (!dragging || !selectedJoint) return; const at = pointer(event); const rig = currentRig(); const before = { ...rig[selectedJoint] }; let after = { x: Math.max(0, Math.min(editor.width - 1, at.x)), y: Math.max(0, Math.min(editor.height - 1, at.y)) };
    if (mode === "pose" && RIG_PARENTS[selectedJoint]) { const parent = rig[RIG_PARENTS[selectedJoint]]; const sourceParent = sourceRig[RIG_PARENTS[selectedJoint]], sourceChild = sourceRig[selectedJoint]; const length = Math.hypot(sourceChild.x - sourceParent.x, sourceChild.y - sourceParent.y); const dx = after.x - parent.x, dy = after.y - parent.y, magnitude = Math.max(.001, Math.hypot(dx, dy)); after = { x: parent.x + dx / magnitude * length, y: parent.y + dy / magnitude * length }; }
    const dx = after.x - before.x, dy = after.y - before.y; rig[selectedJoint] = after;
    if (selectedJoint === "root" || mode === "pose") for (const child of descendants(selectedJoint)) rig[child] = { x: rig[child].x + dx, y: rig[child].y + dy };
    if (mode === "rig") { localStorage.setItem(`spriteforge-rig:${source.id}`, JSON.stringify(sourceRig)); frameRigs = motionRigs(sourceRig, motion, alphaBounds(sourceImage).height); rebuildImages(); }
    else frameImages[frameIndex] = deformSprite(sourceImage, sourceRig, frameRigs[frameIndex], { lockGround: groundLocked() });
    renderAll();
  });
  const release = () => { dragging = false; }; editor.addEventListener("pointerup", release); editor.addEventListener("pointercancel", release);
  root.querySelectorAll("[data-animation2-source]").forEach((button) => button.addEventListener("click", () => loadSource(sources.find((item) => item.id === button.dataset.animation2Source))));
  root.querySelectorAll("[data-animation2-motion]").forEach((button) => button.addEventListener("click", () => { stop(); motion = button.dataset.animation2Motion; root.querySelectorAll("[data-animation2-motion]").forEach((item) => item.classList.toggle("active", item === button)); if (sourceImage) resetMotion(); }));
  const poseMode = () => { mode = "pose"; selectedJoint = ""; root.querySelectorAll("[data-animation2-mode]").forEach((item) => item.classList.toggle("active", item.dataset.animation2Mode === "pose")); };
  root.querySelector("[data-animation2-add-frame]").addEventListener("click", () => {
    if (motion !== "custom" || !sourceImage) return;
    if (frameRigs.length >= 16) return onNotice?.("Custom animations support up to 16 keyframes.");
    stop(); const insertion = frameIndex + 1; frameRigs.splice(insertion, 0, structuredClone(frameRigs[frameIndex])); frameIndex = insertion; poseMode(); rebuildImages(); renderAll(); onNotice?.("Keyframe added. Drag the rig to create the next pose.");
  });
  root.querySelector("[data-animation2-remove-frame]").addEventListener("click", () => {
    if (motion !== "custom" || frameRigs.length <= 1) return;
    stop(); frameRigs.splice(frameIndex, 1); frameIndex = Math.max(0, Math.min(frameIndex, frameRigs.length - 1)); rebuildImages(); renderAll();
  });
  root.querySelectorAll("[data-animation2-mode]").forEach((button) => button.addEventListener("click", () => { mode = button.dataset.animation2Mode; selectedJoint = ""; root.querySelectorAll("[data-animation2-mode]").forEach((item) => item.classList.toggle("active", item === button)); renderEditor(); }));
  root.querySelector("[data-animation2-overlay]").addEventListener("change", renderEditor);
  root.querySelector("[data-animation2-ground-lock]").addEventListener("change", () => { if (!sourceImage) return; rebuildImages(); renderAll(); });
  root.querySelector("[data-animation2-auto]").addEventListener("click", () => { if (!sourceImage) return; sourceRig = autoRig(sourceImage); localStorage.setItem(`spriteforge-rig:${source.id}`, JSON.stringify(sourceRig)); resetMotion(); onNotice?.("Rig placed automatically. Drag joints to correct it."); });
  root.querySelector("[data-animation2-reset]").addEventListener("click", () => { if (!sourceImage) return; const defaults = motionRigs(sourceRig, motion, alphaBounds(sourceImage).height); frameRigs[frameIndex] = defaults[frameIndex]; frameImages[frameIndex] = deformSprite(sourceImage, sourceRig, frameRigs[frameIndex], { lockGround: groundLocked() }); renderAll(); });
  root.querySelector("[data-animation2-play]").addEventListener("click", play);
  root.querySelector("[data-animation2-zoom-out]").addEventListener("click", () => { zoom = Math.max(1, zoom - 1); applyZoom(); });
  root.querySelector("[data-animation2-zoom-in]").addEventListener("click", () => { zoom = Math.min(16, zoom + 1); applyZoom(); });
  root.querySelector("[data-animation2-zoom-fit]").addEventListener("click", fitZoom);
  const download = (canvas, filename) => canvas.toBlob((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.hidden = true; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }, "image/png");
  root.querySelector("[data-animation2-frame-download]").addEventListener("click", () => { if (source) download(output, `${source.name.replace(/[^a-z0-9]+/gi,"_").toLowerCase()}_${motion}_${frameIndex + 1}.png`); });
  root.querySelector("[data-animation2-sheet]").addEventListener("click", () => { if (!sourceImage) return; const sheet = document.createElement("canvas"); sheet.width = sourceImage.width * frameImages.length; sheet.height = sourceImage.height; const context = sheet.getContext("2d"); frameImages.forEach((image, index) => { const frame = document.createElement("canvas"); putImage(frame, image); context.drawImage(frame, index * sourceImage.width, 0); }); download(sheet, `${source.name.replace(/[^a-z0-9]+/gi,"_").toLowerCase()}_${motion}_animation2.png`); });
  if (source) loadSource(source); else title();
}
