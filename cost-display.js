/* Keeps the public credit schedule visible and consistent across dynamically
   mounted generators. The server remains authoritative for the actual debit. */
const COST = Object.freeze({ character: 3, asset: 3, packItem: 6, tile: 3, animation: 25, turnaround: 6 });

const text = (node, value) => { if (node && node.textContent !== value) node.textContent = value; };
const ensureCreditBadge = (node, label) => {
  if (!node) return;
  const parent = node.parentElement;
  const existing = parent?.querySelector(".credit-inline-badge");
  if (/Forge credits/i.test(node.textContent)) { existing?.remove(); return; }
  if (!existing && parent) {
    const badge = document.createElement("b");
    badge.className = "credit-inline-badge";
    badge.textContent = label;
    parent.append(" ", badge);
  }
};
const addEstimate = (form, selector, className, html) => {
  if (!form || form.querySelector(`.${className}`)) return;
  const submit = form.querySelector(selector);
  if (!submit) return;
  const note = document.createElement("p");
  note.className = className;
  note.innerHTML = html;
  submit.before(note);
};

function refreshCosts(root = document) {
  addEstimate(root.querySelector("#creator-form"), ".creator-generate", "creator-cost", "<span>Estimated use</span><b>3 Forge credits</b><small>Charged when generation starts.</small>");
  addEstimate(root.querySelector("#asset-form"), ".asset-generate", "asset-cost", "<span>Estimated use</span><b>3 Forge credits</b><small>Charged only when generation starts.</small>");
  addEstimate(root.querySelector(".tileset-form"), ".tileset-create", "tileset-cost", "<span>Estimated use</span><b>3 Forge credits per tile</b><small>Charged as each tile starts.</small>");
  addEstimate(root.querySelector(".pack-form"), ".pack-create", "pack-cost", "<span>Estimated use</span><b>6 Forge credits per asset</b><small>Charged as each asset starts.</small>");
  addEstimate(root.querySelector("#turnaround-form"), ".turnaround-generate", "turnaround-cost", `<span>Estimated use</span><b>${COST.turnaround} Forge credits</b><small>Charged when reconstruction starts.</small>`);

  const packCount = root.querySelector("#pack-count");
  if (packCount) {
    const match = packCount.textContent.match(/(\d+)\s*assets?/i);
    const count = match ? Number(match[1]) : 1;
    text(packCount, `${count} asset${count === 1 ? "" : "s"} · ${count * COST.packItem} Forge credits when generated`);
  }
  const tileCount = root.querySelector("#tileset-count");
  if (tileCount) {
    const match = tileCount.textContent.match(/(\d+)\s*tiles?/i);
    const count = match ? Number(match[1]) : 1;
    text(tileCount, `${count} tile${count === 1 ? "" : "s"} · ${count * COST.tile} Forge credits when generated`);
  }
  ensureCreditBadge(tileCount, "3 Forge credits per tile");
  text(root.querySelector("#animation-cost"), `${COST.animation} Forge credits`);
  const a4Cost = root.querySelector(".a4-cost b");
  text(a4Cost, `${COST.animation} Forge credits`);
  const a4CostNote = root.querySelector(".a4-cost small");
  text(a4CostNote, "Charged only when generation starts.");
  const a4Submit = root.querySelector(".a4-submit b");
  if (a4Submit) text(a4Submit, "→");
  const cleanup = root.querySelector(".a4-clean small");
  if (cleanup) text(cleanup, "Remove the matte locally · no additional credits");
  const legacy = root.querySelector(".animation3-cost");
  if (legacy) text(legacy, `SpriteForge charges ${COST.animation} Forge credits per complete animation. Cleanup runs locally.`);
}

const observer = new MutationObserver(() => refreshCosts());
observer.observe(document.documentElement, { childList: true, subtree: true });
refreshCosts();
// Studio views are swapped in asynchronously; this inexpensive fallback also
// catches count changes made by their own setup functions.
window.setInterval(refreshCosts, 500);
