import { characterCreatorMarkup, setupCharacterCreator } from "/character-creator.js?v=25";
import { assetGeneratorMarkup, setupAssetGenerator } from "/asset-generator.js?v=9";
import { assetPackMarkup, setupAssetPack } from "/asset-pack.js?v=5";
import { tilesetMarkup, setupTileset } from "/tileset.js?v=5";
import { animation4Markup, setupAnimation4 } from "/animation4.js?v=7";
import { manualEditorMarkup, setupManualEditor } from "/manual-editor.js?v=1";

const asset = (path) => `/assets/${path}`;
const readableName = (value) => {
  let decoded = String(value || "");
  // Older PixelEngine records may have been URI-encoded more than once.
  for (let attempt = 0; attempt < 4 && /%[0-9a-f]{2}/i.test(decoded); attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return decoded;
};
const escape = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));

let assets = [
  { id: "knight", name: "Gilded Knight", type: "Character", project: "Twilight Keep", image: "examples/pixel-art-characters/gilded-knight/idle.webp", date: "Today", meta: "64×96 · PNG", model: "Nano Banana 2", background: "Transparent" },
  { id: "goblin", name: "Royal Goblin", type: "Character", project: "Twilight Keep", image: "examples/pixel-art-characters/royal-goblin/attack.webp", date: "Yesterday", meta: "64×64 · PNG", model: "GPT Image 2", background: "Transparent" },
  { id: "owl", name: "Lantern Owl", type: "Asset", project: "Forest Village", image: "examples/tiny-pixel-art/tiny_owl_idle.webp", date: "Jul 28", meta: "32×32 · PNG", model: "Nano Banana 2", background: "Transparent" },
  { id: "castle", name: "Moonstone Castle", type: "Tileset", project: "Twilight Keep", image: "examples/isometric-buildings/castle.webp", date: "Jul 27", meta: "256×256 · PNG", model: "Nano Banana 2", background: "Transparent" },
  { id: "sword", name: "Copper Sword", type: "Asset", project: "Forest Village", image: "examples/inventory-icons/sword.png", date: "Jul 26", meta: "48×48 · PNG", model: "GPT Image 2", background: "Transparent" },
  { id: "icon", name: "Spell Icons", type: "Pack", project: "Forest Village", image: "examples/spell-icon-set/icons/icon_101.png", date: "Jul 25", meta: "128×128 · PNG", model: "Nano Banana 2", background: "Transparent" },
];
let workspaceThemes = [];
let activeThemeId = "";
let projects = [];
let assetProjectFilter = "all";
let assetKindFilter = "all";
let assetPacks = [];
let tilesets = [];
let animations = [];
let pixelEngineJobs = [];

const presets = [
  { name: "Tiny woodland creatures", author: "SpriteForge", type: "Assets", image: "examples/tiny-pixel-art/tiny_owl_idle.webp", theme: "Warm tiny pixel fantasy", uses: 243, saved: 18, model: "Nano Banana 2", size: "64×64" },
  { name: "Isometric fantasy buildings", author: "Community", type: "Tilesets", image: "examples/isometric-buildings/castle.webp", theme: "Readable isometric stonework", uses: 161, saved: 12, model: "Nano Banana 2", size: "256×256" },
  { name: "Game inventory icons", author: "Community", type: "UI", image: "examples/inventory-icons/sword.png", theme: "Crisp readable iconography", uses: 98, saved: 8, model: "GPT Image 2", size: "64×64" },
  { name: "Moonlit spell effects", author: "SpriteForge", type: "Assets", image: "examples/spell-icon-set/icons/icon_101.png", theme: "Dark arcane blue highlights", uses: 74, saved: 5, model: "Nano Banana 2", size: "96×96" },
];

const icon = (value) => `<span class="studio-icon" aria-hidden="true">${value}</span>`;

const imageSource = (item) => item.image?.startsWith("/") ? item.image : asset(item.image);
const assetCard = (item) => `<button class="studio-asset-card" data-asset="${escape(item.id)}" type="button">
  <span class="studio-thumb checker"><img src="${escape(imageSource(item))}" alt="" /></span><span class="studio-asset-copy"><b>${escape(item.name)}</b><small>${escape(item.type)} · ${escape(item.project)}</small><small>${escape(item.date)}</small></span><span class="studio-card-more">•••</span>
</button>`;

const studioSidebar = () => `<aside class="studio-sidebar">
  <a class="studio-logo" href="/app" data-route="/app"><img src="/assets/spriteforge-logo.png" alt="" /><span>SpriteForge</span></a>
  <nav class="studio-primary" aria-label="App navigation">
    <button class="is-active" data-studio-view="home">${icon("✦")}<span>Home</span></button>
    <button data-studio-view="assets">${icon("▦")}<span>My assets</span></button>
    <button data-studio-view="projects">${icon("◇")}<span>Projects</span></button>
    <button data-studio-view="themes">${icon("◐")}<span>Themes</span></button>
    <button data-studio-view="presets" data-beta-feature="presets">${icon("⌘")}<span>Presets <small>(beta)</small></span></button>
  </nav>
  <div class="studio-sidebar-rule"></div>
  <p class="studio-sidebar-label">CREATE</p>
  <nav class="studio-primary studio-tools">
    <button data-studio-tool="Character">${icon("♙")}<span>Character</span></button>
    <button data-studio-tool="Asset Pack" data-beta-feature="asset-pack">${icon("▦")}<span>Asset pack <small>(beta)</small></span></button>
    <button data-studio-tool="Asset Generator">${icon("✧")}<span>Asset generator</span></button>
    <button data-studio-tool="Tileset">${icon("▤")}<span>Tileset</span></button>
    <button data-studio-tool="Animation">${icon("▷")}<span>Animation</span></button>
    <button data-studio-tool="Manual Editor">${icon("✎")}<span>Manual editor</span></button>
  </nav>
  <div class="studio-sidebar-bottom"><a href="/" data-route="/">${icon("←")}<span>Marketing site</span></a><button class="studio-user" data-auth-action="login" type="button"><span>→</span><b>Sign in</b>${icon("⌄")}</button></div>
</aside>`;

const composer = () => `<section class="studio-composer"><button class="studio-reference-open" type="button" aria-label="Add reference">${icon("▧")}</button>
  <input id="studio-prompt" placeholder="What do you want to make?" autocomplete="off" />
  <div class="studio-composer-footer"><label class="studio-generator-select"><select id="studio-generator-select" class="studio-type-select" aria-label="Choose a generator"><option value="Character" selected>Character</option><option value="Asset Generator">Asset Generator</option><option value="Tileset">Tileset</option><option value="Animation">Animation</option></select></label><button class="studio-history" type="button" aria-label="Create from prompt" title="Create from prompt">↶</button></div>
  <div class="studio-references" hidden></div>
</section>`;

const homeView = () => `<section class="studio-view studio-home-view">
  <header class="studio-topbar"><div><h1>Welcome back, creator</h1><p><b>6 assets</b><span>·</span><b>Private workspace</b><span>·</span><b>Generation paused</b></p></div><button class="studio-updates" type="button">✦ What's new <i></i></button></header>
  ${composer()}
  <section class="studio-tool-launcher"><p class="studio-kicker">OR START FROM A TOOL</p><div>${[
    ["Character", "Create a consistent hero", "♙"], ["Asset Pack", "Build a small collection", "▦"], ["Asset Generator", "Make a single game asset", "✧"], ["Tileset", "Build maps and surfaces", "▤"], ["Animation", "Generate a complete animated sprite", "◉"]
  ].map(([title,copy,glyph]) => `<button data-studio-tool="${title}"${title === "Asset Pack" ? ` data-beta-feature="asset-pack"` : ""} type="button"><span>${glyph}</span><b>${title}${title === "Asset Pack" ? " <small>(beta)</small>" : ""}</b><small>${copy}</small></button>`).join("")}</div></section>
  <section class="studio-section"><div class="studio-section-title"><div><span class="studio-kicker">RECENT ASSETS</span><h2>Continue creating</h2></div><button data-studio-view="assets" type="button">View library →</button></div><div class="studio-recent-grid">${assets.slice(0,4).map(assetCard).join("")}</div></section>
  <section class="studio-theme-banner"><div class="studio-theme-art"><img src="${asset("examples/tiny-pixel-art/tiny_owl_idle.webp")}" alt="" /></div><div><span class="studio-kicker">ACTIVE THEME · V1</span><h2>Twilight fantasy</h2><p>Warm iron, blue moonlight and crisp medium-scale pixels. Every asset inherits this direction unless you change it.</p><button data-studio-view="themes" type="button">Open theme →</button></div><div class="studio-theme-spec"><span>24 colors</span><span>Auto grid</span><span>Platformer</span></div></section>
</section>`;

const activeTheme = () => workspaceThemes.find((theme) => theme.id === activeThemeId) || null;
const characterView = () => { const theme = activeTheme(); return `<section class="studio-view studio-character-view"><header class="studio-topbar"><div><span class="studio-kicker">CREATE · CHARACTER${theme ? ` · THEME: ${theme.name.toUpperCase()}` : ""}</span><h1>Character creator</h1><p>Create a character, normalize it to a game-ready sprite, then save it in your private library.</p></div><button data-studio-view="assets" class="studio-upload" type="button">View library →</button></header>${characterCreatorMarkup({ embedded: true, theme, themes: workspaceThemes })}</section>`; };
const assetGeneratorView = () => { const theme = activeTheme(); return `<section class="studio-view studio-asset-generator-view"><header class="studio-topbar"><div><span class="studio-kicker">CREATE · ASSET GENERATOR${theme ? ` · THEME: ${theme.name.toUpperCase()}` : ""}</span><h1>Asset generator</h1><p>Generate standalone game objects, buildings, scenery and UI icons with task-specific production rules.</p></div><button data-studio-view="assets" class="studio-upload" type="button">View library →</button></header>${assetGeneratorMarkup({ embedded: true, theme })}</section>`; };
const assetPackView = () => assetPackMarkup({ theme: activeTheme(), packs: assetPacks });
const tilesetView = () => tilesetMarkup({ theme: activeTheme(), tilesets });
const animationView = () => animation4Markup({ theme: activeTheme(), assets, animations, jobs: pixelEngineJobs });
const manualEditorView = (assetId = "") => manualEditorMarkup({ assets, assetId });

const liveThemesView = () => { const theme = activeTheme() || workspaceThemes[0]; return `<section class="studio-view"><header class="studio-topbar"><div><span class="studio-kicker">PERSISTENT ART DIRECTION</span><h1>Themes</h1><p>Reusable visual direction. Tags are available to every user; image references are premium.</p></div><button class="studio-upload" data-theme-create type="button">+ New theme</button></header>${workspaceThemes.length ? `<div class="studio-theme-workbench"><section class="studio-theme-list">${workspaceThemes.map((item) => `<button data-theme-select="${item.id}" class="${item.id === theme?.id ? "active" : ""}"><i></i><span><b>${item.name}${item.isDefault ? `<mark>Default</mark>` : ""}</b><small>${item.references.length}/5 premium references · ${item.styleTags.join(", ") || "no tags"}</small></span><em>v${item.version}</em></button>`).join("")}</section><section class="studio-theme-detail"><div class="studio-theme-detail-title"><div><span class="studio-kicker">${theme.isDefault ? "DEFAULT CREATOR THEME" : "THEME"} · VERSION ${theme.version}</span><h2>${theme.name}</h2><p>${theme.direction || "No direction yet."}</p></div><button data-theme-edit="${theme.id}" type="button">Edit theme</button></div><div class="studio-theme-rules"><article><span>STYLE TAGS</span><p>${theme.styleTags.map((tag) => `<b>${tag}</b>`).join("") || "No tags"}</p></article><article><span>PIXEL RULES</span><p>${theme.settings.pixelScale || "Medium pixels"} · ${theme.settings.view || "left 3/4"}</p></article><article><span>STYLE REFERENCES</span><p>${theme.references.length}/5 · Premium</p></article><article><span>USE IN CREATOR</span><button class="studio-default-theme ${theme.isDefault ? "active" : ""}" data-theme-default="${theme.id}" type="button" aria-pressed="${theme.isDefault}">${theme.isDefault ? "✓ Default theme" : "Set as default"}</button><small>${theme.isDefault ? "Applied automatically when Character Creator opens." : "Make this the automatic starting theme."}</small></article></div><div class="studio-theme-reference"><span class="studio-kicker">STYLE REFERENCES · PREMIUM</span><div>${theme.references.length ? theme.references.map((ref) => `<span class="checker"><img src="${ref.url || asset("showcase/avatars/outlined/tinyslime24.png")}" alt="" /></span>`).join("") : `<p><b>No reference images</b><small>Add up to five approved assets for stronger visual consistency.</small></p>`}<button data-theme-reference="${theme.id}" type="button">Add reference</button></div></div></section></div>` : `<section class="studio-theme-empty"><div class="studio-theme-empty-orb">✦</div><span class="studio-kicker">YOUR FIRST ART DIRECTION</span><h2>Give every asset a shared visual language.</h2><p>Start with a few style tags and a short description. You can add premium visual references later for stronger consistency.</p><button data-theme-create type="button">Create your first theme →</button><small>Examples: Cozy farming RPG · Dark dungeon crawler · Handheld retro</small></section>`}</section>`; };

const assetsView = () => {
  const visibleAssets = assets.filter((item) => assetProjectFilter === "all" || (assetProjectFilter === "unorganized" ? !item.projectId : item.projectId === assetProjectFilter));
  const projectCounts = new Map(projects.map((project) => [project.id, assets.filter((item) => item.projectId === project.id).length]));
  const selectedProject = projects.find((project) => project.id === assetProjectFilter);
  const projectLabel = assetProjectFilter === "unorganized" ? "Unorganized" : selectedProject?.name || "All assets";
  return `<section class="studio-view studio-assets-view"><header class="studio-topbar"><div><span class="studio-kicker">LIBRARY</span><h1>My assets</h1><p>${projectLabel === "All assets" ? "Approved artwork and work in progress, organized by project." : `Assets in ${escape(projectLabel)}.`}</p></div><button class="studio-upload" data-project-create type="button">+ New project</button></header><div class="studio-library-layout"><aside class="studio-library-nav"><button class="${assetProjectFilter === "all" ? "active" : ""}" data-project-filter="all">All assets <b>${assets.length}</b></button><button class="${assetProjectFilter === "unorganized" ? "active" : ""}" data-project-filter="unorganized">Unorganized <b>${assets.filter((item) => !item.projectId).length}</b></button><p>PROJECTS</p>${projects.map((project) => `<button class="${assetProjectFilter === project.id ? "active" : ""}" data-project-filter="${escape(project.id)}">${escape(project.name)} <b>${projectCounts.get(project.id) || 0}</b></button>`).join("")}<button class="studio-new-project" data-project-create type="button">+ New project</button></aside><div class="studio-library-main"><div class="studio-library-toolbar"><label>${icon("⌕")}<input id="studio-asset-search" placeholder="Search assets…" /></label><div class="studio-filter-row"><button class="${assetKindFilter === "all" ? "active" : ""}" data-filter="all">All</button><button class="${assetKindFilter === "Character" ? "active" : ""}" data-filter="Character">Characters</button><button class="${assetKindFilter === "Asset" ? "active" : ""}" data-filter="Asset">Assets</button><button class="${assetKindFilter === "Tileset" ? "active" : ""}" data-filter="Tileset">Tilesets</button><button class="${assetKindFilter === "Pack" ? "active" : ""}" data-filter="Pack">Packs</button><button class="${assetKindFilter === "Animation" ? "active" : ""}" data-filter="Animation">Animations</button></div><span class="studio-library-count">${visibleAssets.length} ${visibleAssets.length === 1 ? "asset" : "assets"}</span></div><div class="studio-assets-grid">${visibleAssets.length ? visibleAssets.map(assetCard).join("") : `<div class="studio-library-empty"><div>${icon("◇")}</div><h2>No assets here yet</h2><p>Generate an asset, then assign it to this project from its viewer.</p><button data-studio-tool="Asset Generator" type="button">Create an asset →</button></div>`}</div></div></div></section>`;
};

const projectsView = () => `<section class="studio-view studio-projects-view"><header class="studio-topbar"><div><span class="studio-kicker">ORGANIZE</span><h1>Projects</h1><p>Group your sprites, assets, tilesets and animations in private workspaces.</p></div><button class="studio-upload" data-project-create type="button">+ New project</button></header>${projects.length ? `<div class="studio-project-grid">${projects.map((project) => { const projectAssets = assets.filter((item) => item.projectId === project.id); const preview = projectAssets[0]; return `<button class="studio-project-card" data-project-filter="${escape(project.id)}" type="button"><span class="studio-project-art">${preview ? `<img src="${escape(imageSource(preview))}" alt="" />` : `<span>${icon("◇")}</span>`}</span><b>${escape(project.name)}</b><small>${projectAssets.length} ${projectAssets.length === 1 ? "asset" : "assets"}${project.description ? ` · ${escape(project.description)}` : ""}</small><span>Open project →</span></button>`; }).join("")}</div>` : `<section class="studio-project-empty"><div class="studio-project-empty-icon">◇</div><span class="studio-kicker">YOUR PRIVATE WORKSPACES</span><h2>Create your first project</h2><p>Projects are simple folders for keeping related game art together. Give one a name and add assets from their viewers.</p><button data-project-create type="button">Create project →</button></section>`}</section>`;

const themesView = () => `<section class="studio-view"><header class="studio-topbar"><div><span class="studio-kicker">PERSISTENT ART DIRECTION</span><h1>Themes</h1><p>Reusable rules for consistent characters, worlds and interface art.</p></div><button class="studio-upload" type="button">+ New theme</button></header><div class="studio-theme-workbench"><section class="studio-theme-list"><button class="active"><i></i><span><b>Twilight fantasy</b><small>Active in Twilight Keep</small></span><em>v1</em></button><button><i class="green"></i><span><b>Forest village</b><small>Cozy, clean and warm</small></span><em>v3</em></button><button><i class="violet"></i><span><b>Arcane ruins</b><small>High contrast spellwork</small></span><em>v1</em></button></section><section class="studio-theme-detail"><div class="studio-theme-detail-title"><div><span class="studio-kicker">ACTIVE THEME · VERSION 1</span><h2>Twilight fantasy</h2><p>Readable heroic pixel art for a side-view adventure.</p></div><button type="button">Edit theme</button></div><div class="studio-theme-rules"><article><span>STYLE TAGS</span><p><b>rpg</b><b>dark fantasy</b><b>cozy</b></p></article><article><span>PIXEL RULES</span><p>Medium scale · Auto grid · crisp outline</p></article><article><span>PALETTE</span><p class="studio-swatches"><i></i><i></i><i></i><i></i><i></i><small>24 colors</small></p></article><article><span>DEFAULT VIEW</span><p>Platformer · left 3/4</p></article></div><div class="studio-theme-reference"><span class="studio-kicker">STYLE REFERENCES</span><div><span class="checker"><img src="${asset("examples/pixel-art-characters/gilded-knight/idle.webp")}" alt="" /></span><p><b>Gilded Knight</b><small>Approved reference · proportions, contour and palette direction</small></p><button type="button">Manage references</button></div></div></section></div></section>`;

const presetsView = () => `<section class="studio-view"><header class="studio-topbar"><div><span class="studio-kicker">REUSABLE SETUPS</span><h1>Preset library</h1><p>Technical generation settings that you can apply without losing your active theme.</p></div><button class="studio-upload" type="button">+ Save current preset</button></header><div class="studio-preset-controls"><div><button class="active">Official</button><button>Community</button><button>Favorites</button><button>Mine</button></div><label>${icon("⌕")}<input id="studio-preset-search" placeholder="Search presets" /></label></div><div class="studio-preset-filters"><span>STYLE</span><button class="active">All</button><button>Pixel art</button><button>Detailed</button><span>MODE</span><button class="active">All</button><button>Assets</button><button>Tilesets</button><button>UI</button></div><div class="studio-preset-grid">${presets.map((preset,index) => `<button class="studio-preset-card" data-preset="${index}" type="button"><span class="studio-preset-image"><img src="${asset(preset.image)}" alt="" /></span><span class="studio-preset-badge">${preset.author}</span><span class="studio-preset-more">ⓘ</span><b>${preset.name}</b><small>${preset.type} · ${preset.size}</small><footer><span>↗ ${preset.uses}</span><span>♡ ${preset.saved}</span></footer></button>`).join("")}</div></section>`;

const settingsView = (user) => `<section class="studio-view studio-settings-view"><header class="studio-topbar"><div><span class="studio-kicker">ACCOUNT</span><h1>Settings</h1><p>Manage your workspace identity, plan and billing preferences.</p></div></header><div class="studio-settings-grid"><section><span class="studio-kicker">ACCOUNT</span><h2>${escape(user.email)}</h2><p>Your account is secured with a password and protected session.</p><dl><div><dt>Plan</dt><dd>${user.creditExempt ? "Administrator" : user.plan ? `${user.plan[0].toUpperCase()}${user.plan.slice(1)} · active` : "Free"}</dd></div><div><dt>Forge credits</dt><dd>${user.creditExempt ? "Unlimited" : user.credits}</dd></div><div><dt>Style references</dt><dd>${user.referencePremium ? "Premium enabled" : "Available on Creator and Studio"}</dd></div></dl></section><section><span class="studio-kicker">BILLING</span><h2>Subscription</h2><p>Payments and invoices are securely managed by Stripe.</p>${user.plan && !user.creditExempt ? `<button data-account-billing type="button">Manage billing in Stripe →</button>` : `<button data-account-upgrade type="button">Choose a plan →</button>`}</section><section><span class="studio-kicker">SUPPORT</span><h2>Need a hand?</h2><p>Find practical help, report an issue or contact us about your account.</p><button data-account-support type="button">Open support →</button></section></div></section>`;

const supportView = () => `<section class="studio-view studio-settings-view"><header class="studio-topbar"><div><span class="studio-kicker">HELP CENTER</span><h1>Support</h1><p>We are here to help you get sprites into your game without friction.</p></div></header><div class="studio-settings-grid studio-support-grid"><section><span class="studio-kicker">GETTING STARTED</span><h2>Creating assets</h2><p>Use Character, Asset generator, Tileset or Animation from the left navigation. Your completed work is stored in My assets.</p><button data-account-home type="button">Go to workspace →</button></section><section><span class="studio-kicker">BILLING</span><h2>Plans and payments</h2><p>Subscriptions and invoices are handled through Stripe. Plan credits refresh after a successful monthly payment.</p><button data-account-upgrade type="button">View plans →</button></section><section><span class="studio-kicker">CONTACT</span><h2>Talk to us</h2><p>For account, billing or technical issues, include your account email and a short description.</p><a href="mailto:support@spriteforge.xyz">support@spriteforge.xyz →</a></section></div></section>`;

const studioShell = () => `<div class="studio-shell">${studioSidebar()}<main class="studio-main"><div id="studio-content"></div></main><div class="studio-toast" role="status" aria-live="polite"></div><div class="studio-modal-root"></div></div>`;

export const appStudioMarkup = () => studioShell();

export function setupAppStudio({ initialAssetId = "", initialAnimationAssetId = "", initialEditorAssetId = "" } = {}) {
  const root = document.querySelector(".studio-shell");
  const content = root.querySelector("#studio-content");
  const modalRoot = root.querySelector(".studio-modal-root");
  const toast = root.querySelector(".studio-toast");
  let view = "home";
  let animationSourceId = initialAnimationAssetId;
  let editorAssetId = initialEditorAssetId;
  let activeManualEditor = null;
  let selectedReferences = [];
  let authState = { user: null, available: false, httpsRequired: true };
  // Keep a Home composer request alive while the authentication modal is open.
  // This lets a visitor choose a generator and enter a prompt before signing in.
  let pendingComposerIntent = null;
  let libraryLoaded = false;
  const notify = (message) => { toast.textContent = message; toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2600); };
  const generatorView = (generator) => ({ Character: "character", "Asset Generator": "asset-generator", Tileset: "tileset", Animation: "animation" }[generator] || "character");
  const prefillEditorPrompt = (editorView, promptText) => {
    const value = String(promptText || "").trim().slice(0, 700);
    if (!value) return;
    const selectors = {
      character: ["#creator-subject"],
      "asset-generator": ["#asset-subject"],
      tileset: ["[data-tileset-brief='0']"],
      animation: ['textarea[name="prompt"]'],
    }[editorView] || [];
    const field = selectors.map((selector) => content.querySelector(selector)).find(Boolean);
    if (!field) return;
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
  };
  const setView = (next, promptText = "") => {
    if (view === "manual-editor" && next !== "manual-editor" && activeManualEditor?.hasUnsavedChanges() && !window.confirm("Discard unsaved editor changes?")) return;
    activeManualEditor?.destroy(); activeManualEditor = null;
    if ((next === "presets" || next === "asset-pack") && !authState.user?.creditExempt) { notify("This beta workspace is available to administrators only."); next = "home"; }
    view = next;
    content.innerHTML = next === "assets" ? assetsView() : next === "projects" ? projectsView() : next === "themes" ? liveThemesView() : next === "presets" ? presetsView() : next === "settings" ? settingsView(authState.user) : next === "support" ? supportView() : next === "character" ? characterView() : next === "asset-generator" ? assetGeneratorView() : next === "asset-pack" ? assetPackView() : next === "tileset" ? tilesetView() : next === "animation" ? animationView() : next === "manual-editor" ? manualEditorView(editorAssetId) : homeView();
    root.querySelectorAll("[data-studio-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.studioView === view));
    const activeTool = ({ character: "Character", "asset-generator": "Asset Generator", "asset-pack": "Asset Pack", tileset: "Tileset", animation: "Animation", "manual-editor": "Manual Editor" })[view] || "";
    root.querySelectorAll("[data-studio-tool]").forEach((button) => button.classList.toggle("is-active", button.dataset.studioTool === activeTool));
    wireView();
    if (next === "character") setupCharacterCreator({ theme: activeTheme(), themes: workspaceThemes, onThemePicker: () => openThemePicker("character"), onSaved: async () => { await loadLibrary(); notify("Character saved to your private library."); } });
    if (next === "asset-generator") setupAssetGenerator({ theme: activeTheme(), onSaved: async () => { await loadLibrary(); notify("Asset saved to your private library."); } });
    if (next === "asset-pack") setupAssetPack({ theme: activeTheme(), packs: assetPacks, onChanged: loadLibrary, onNotice: notify });
    if (next === "tileset") setupTileset({ theme: activeTheme(), tilesets, onChanged: loadLibrary, onNotice: notify });
    if (next === "animation") setupAnimation4({ theme: activeTheme(), assets, jobs: pixelEngineJobs, initialAssetId: animationSourceId, onChanged: loadLibrary, onNotice: notify });
    if (next === "manual-editor") activeManualEditor = setupManualEditor({ assets, initialAssetId: editorAssetId, onNavigate: (id) => { editorAssetId = id; history.replaceState({}, "", `/app?edit=${encodeURIComponent(id)}`); setView("manual-editor"); }, onChanged: loadLibrary, onNotice: notify });
    wireEditorThemeControl(next);
    if (promptText) window.setTimeout(() => prefillEditorPrompt(next, promptText), 0);
  };
  const closeModal = () => { modalRoot.innerHTML = ""; };
  const updateAuthControl = () => {
    const button = root.querySelector(".studio-user");
    if (!button) return;
    root.querySelectorAll("[data-beta-feature]").forEach((element) => {
      const enabled = Boolean(authState.user?.creditExempt);
      element.hidden = !enabled;
      element.setAttribute("aria-hidden", enabled ? "false" : "true");
    });
    if (authState.user) {
      const initials = authState.user.email.slice(0, 2).toUpperCase();
      button.dataset.authAction = "account";
      const plan = authState.user.plan ? ` · ${String(authState.user.plan).replace(/^./, (letter) => letter.toUpperCase())}` : "";
      button.innerHTML = `<span>${initials}</span><b>${authState.user.creditExempt ? "Admin · ∞ credits" : `${authState.user.credits} credits${plan}`}</b>${icon("⌄")}`;
    } else {
      button.dataset.authAction = "login";
      button.innerHTML = `<span>→</span><b>${authState.httpsRequired ? "Secure sign in" : "Sign in"}</b>${icon("⌄")}`;
    }
  };
  const refreshAuth = async () => {
    try { const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }); authState = await response.json(); } catch { authState = { user: null, available: false, httpsRequired: true }; }
    updateAuthControl();
    if (authState.user) await loadLibrary();
  };
  const loadLibrary = async () => {
    try {
      const response = await fetch("/api/library", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load library");
      const data = await response.json();
      workspaceThemes = (data.themes || []).map((theme) => ({ ...theme, references: Array.isArray(theme.references) ? theme.references : [], styleTags: Array.isArray(theme.styleTags) ? theme.styleTags : [], settings: theme.settings || {} })); if (!workspaceThemes.some((theme) => theme.id === activeThemeId)) activeThemeId = data.defaultThemeId || ""; if (!activeThemeId && data.defaultThemeId) activeThemeId = data.defaultThemeId;
      projects = data.projects || [];
      assetPacks = data.assetPacks || [];
      tilesets = data.tilesets || [];
      animations = data.animations || [];
      pixelEngineJobs = data.pixelEngineJobs || [];
      const projectNames = new Map(data.projects.map((project) => [project.id, project.name]));
      assets = data.assets.map((item) => ({
        id: item.id, name: readableName(item.name),
        kind: item.kind, files: item.files, recipe: item.recipe, parent_asset_id: item.parent_asset_id,
        type: item.kind === "character" ? "Character" : item.kind === "animation" ? "Animation" : item.kind === "tileset" || item.kind === "tile" ? "Tileset" : item.kind === "pack" ? "Pack" : "Asset",
        projectId: item.project_id || "",
        project: projectNames.get(item.project_id) || "Unorganized",
        image: item.files.animation?.url || item.files["game-ready"]?.url || item.files.original?.url || "showcase/avatars/outlined/tinyslime24.png",
        date: new Date(item.updated_at).toLocaleDateString(), meta: "Private asset",
        model: item.kind === "animation" ? "SpriteForge Animation" : "GPT Image",
        background: item.files["game-ready"] || item.files.animation ? "Transparent" : "Original",
      }));
      libraryLoaded = true;
      if (view === "assets" || view === "home" || view === "asset-pack" || view === "tileset" || view === "animation") setView(view);
    } catch { if (libraryLoaded) notify("Your library could not be refreshed."); }
  };
  const openAuth = (mode = "login") => {
    const register = mode === "register";
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-auth-dialog" role="dialog" aria-modal="true" aria-label="${register ? "Create account" : "Sign in"}"><header><div><span class="studio-kicker">SPRITEFORGE ACCOUNT</span><h2>${register ? "Create your workspace" : "Welcome back"}</h2><p>${register ? "Verify your email to activate your 40 free credits." : "Sign in to manage projects and generate sprites."}</p></div><button data-modal-close type="button">×</button></header>${authState.httpsRequired ? `<div class="studio-auth-https"><b>Secure access is pending HTTPS</b><p>Passwords and paid credits are never enabled over an unencrypted HTTP connection. Attach a domain with TLS in Coolify to activate account access.</p></div>` : `<form class="studio-auth-form"><label>Email<input type="email" name="email" autocomplete="email" required maxlength="254" /></label><label>Password<input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="12" maxlength="128" /></label>${register ? `<label>Confirm password<input type="password" name="confirmPassword" autocomplete="new-password" required minlength="12" maxlength="128" /></label><input class="studio-honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" /><p class="studio-auth-note">Your 40 free credits unlock after email verification.</p>` : ""}<p class="studio-auth-error" role="alert" hidden></p><button type="submit">${register ? "Create secure account" : "Sign in"} →</button><div class="studio-auth-or"><span>OR</span></div><a class="studio-google-auth" href="/api/auth/google" aria-label="Continue with Google"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.23c0-.71-.06-1.4-.19-2.05H12v3.88h5.49a4.7 4.7 0 0 1-2.03 3.08v2.52h3.27c1.91-1.76 3.07-4.35 3.07-7.43Z"/><path fill="#34A853" d="M12 22c2.75 0 5.06-.91 6.73-2.34l-3.27-2.52c-.91.61-2.07.97-3.46.97-2.66 0-4.91-1.8-5.72-4.22H2.9v2.6A10.16 10.16 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.28 13.89A6.1 6.1 0 0 1 5.96 12c0-.66.11-1.3.32-1.89v-2.6H2.9A10.02 10.02 0 0 0 1.84 12c0 1.61.39 3.14 1.06 4.49l3.38-2.6C7.09 7.69 9.34 5.89 12 5.89c1.5 0 2.85.52 3.91 1.53l2.94-2.94C17.05 2.8 14.75 2 12 2a10.16 10.16 0 0 0-9.1 5.51l3.38 2.6C7.09 7.69 9.34 5.89 12 5.89Z"/></svg><span>Continue with Google</span></a><button class="studio-auth-switch" data-auth-switch="${register ? "login" : "register"}" type="button">${register ? "Already have an account? Sign in" : "New to SpriteForge? Create an account"}</button></form>`}</section></div>`;
    wireModal();
    const form = modalRoot.querySelector(".studio-auth-form");
    if (!register && form) {
      const forgot = document.createElement("button"); forgot.type = "button"; forgot.className = "studio-auth-forgot"; forgot.textContent = "Forgot your password?";
      forgot.addEventListener("click", () => { closeModal(); window.location.assign("/reset-password"); });
      form.insertBefore(forgot, form.querySelector(".studio-auth-error"));
    }
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form));
      const error = form.querySelector(".studio-auth-error");
      if (register && values.password !== values.confirmPassword) { error.hidden = false; error.textContent = "Passwords do not match."; return; }
      const submit = form.querySelector("button[type=submit]"); submit.disabled = true; submit.textContent = "Please wait…";
      try {
        const response = await fetch(`/api/auth/${register ? "register" : "login"}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.email, password: values.password }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Authentication failed");
        authState = { ...authState, user: payload.user || null, available: true, httpsRequired: false }; updateAuthControl(); if (payload.user) await loadLibrary(); closeModal(); notify(register ? "Check your inbox: verify your email to activate the account and receive 40 credits." : "Signed in successfully.");
        if (!register && payload.user && pendingComposerIntent) {
          const intent = pendingComposerIntent;
          pendingComposerIntent = null;
          setView(generatorView(intent.target), intent.promptText);
        }
        if (register && payload.user) await startPendingCheckout();
      } catch (errorValue) { error.hidden = false; error.textContent = errorValue.message || "Authentication failed."; submit.disabled = false; submit.textContent = register ? "Create secure account →" : "Sign in →"; }
    });
  };
  const openReferences = () => {
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-reference-dialog" role="dialog" aria-modal="true" aria-label="Add reference"><header><div><span class="studio-kicker">REFERENCE LIBRARY</span><h2>Add a reference</h2><p>Choose an approved asset or upload a new image.</p></div><button data-modal-close type="button">×</button></header><button class="studio-reference-upload" type="button">${icon("↑")}<b>Upload a new image</b><small>Drop a PNG, JPG or WebP here</small></button><p class="studio-dialog-label">YOUR APPROVED ASSETS</p><div class="studio-reference-grid">${assets.slice(0,4).map((item) => `<button data-reference-id="${item.id}" class="${selectedReferences.some((reference) => reference.id === item.id) ? "selected" : ""}" type="button"><span class="checker"><img src="${imageSource(item)}" alt="" /></span><b>${item.name}</b><small>${item.type} · ${item.project}</small></button>`).join("")}</div><footer><span>${selectedReferences.length}/2 style references selected</span><button class="studio-confirm-references" type="button">Use selected references →</button></footer></section></div>`;
    wireModal();
  };
  const projectRequest = async (url, method, body) => {
    const response = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify(body || {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Project request failed");
    return data;
  };
  const openProjectEditor = () => {
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-project-dialog" role="dialog" aria-modal="true" aria-label="Create project"><header><div><span class="studio-kicker">NEW PROJECT</span><h2>Create a project</h2><p>Give your workspace a name, then add assets to it from their viewers.</p></div><button data-modal-close type="button">×</button></header><form class="studio-auth-form studio-project-form"><label>Project name<input name="name" maxlength="160" placeholder="e.g. Moonlit village" autocomplete="off" required /></label><p class="studio-auth-error" role="alert" hidden></p><button type="submit">Create project →</button></form></section></div>`;
    wireModal();
    const form = modalRoot.querySelector(".studio-project-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type=submit]"); const error = form.querySelector(".studio-auth-error");
      submit.disabled = true; submit.textContent = "Creating…";
      try {
        await projectRequest("/api/projects", "POST", { name: new FormData(form).get("name") });
        closeModal(); await loadLibrary(); setView("projects"); notify("Project created. Add assets from any viewer.");
      } catch (value) { error.hidden = false; error.textContent = value.message || "Could not create project."; submit.disabled = false; submit.textContent = "Create project →"; }
    });
  };
  const openProjectAssignment = (item) => {
    const current = projects.find((project) => project.id === item.projectId);
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-project-picker-dialog" role="dialog" aria-modal="true" aria-label="Add asset to project"><header><div><span class="studio-kicker">ORGANIZE ASSET</span><h2>Add to project</h2><p>Choose one of your projects for <b>${escape(item.name)}</b>.</p></div><button data-modal-close type="button">×</button></header>${projects.length ? `<div class="studio-project-picker">${projects.map((project) => `<button data-assign-project="${escape(project.id)}" class="${project.id === current?.id ? "active" : ""}" type="button"><span class="studio-project-picker-icon">◇</span><span><b>${escape(project.name)}</b><small>${assets.filter((asset) => asset.projectId === project.id).length} assets</small></span><i>${project.id === current?.id ? "✓" : "→"}</i></button>`).join("")}<button class="studio-project-picker-clear" data-assign-project="" type="button"><span>×</span><span><b>Remove from project</b><small>Keep this asset unorganized</small></span><i>${current ? "→" : ""}</i></button></div>` : `<div class="studio-project-picker-empty"><div>${icon("◇")}</div><h3>No projects yet</h3><p>Create a project first, then you can assign this asset to it.</p><button data-project-create-from-assign type="button">Create project →</button></div>`}</section></div>`;
    wireModal();
    modalRoot.querySelectorAll("[data-assign-project]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try { await projectRequest(`/api/assets/${encodeURIComponent(item.id)}/project`, "PATCH", { projectId: button.dataset.assignProject || null }); closeModal(); await loadLibrary(); notify(button.dataset.assignProject ? `Added to ${projects.find((project) => project.id === button.dataset.assignProject)?.name || "project"}.` : "Removed from project."); }
      catch (error) { notify(error.message || "Could not update project."); button.disabled = false; }
    }));
    modalRoot.querySelector("[data-project-create-from-assign]")?.addEventListener("click", () => { closeModal(); openProjectEditor(); });
  };
  const openAsset = (id) => {
    const item = assets.find((asset) => asset.id === id); if (!item) return;
    const fileUrl = item.files?.animation?.url || item.files?.["game-ready"]?.url || item.files?.original?.url || imageSource(item);
    const isAnimation = Boolean(item.files?.animation);
    const extension = isAnimation ? (item.files.animation.mimeType === "image/gif" ? "gif" : "webp") : "png";
    const filename = `${String(item.name || "spriteforge-asset").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "spriteforge-asset"}.${extension}`;
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-asset-dialog" role="dialog" aria-modal="true" aria-label="${escape(item.name)}"><header><button data-modal-close type="button">&larr; Back</button><div class="studio-asset-dialog-actions"><button type="button" aria-label="Favorite">♡</button>${isAnimation ? `<details class="studio-download-menu"><summary>&#8681; Export animation</summary><div><a href="${fileUrl}" download="${filename}">Animated ${extension.toUpperCase()}</a><a href="/api/assets/${item.id}/export/gif" download="${filename.replace(/\.(?:webp|gif)$/, ".gif")}">GIF</a><a href="/api/assets/${item.id}/export/spritesheet" download="${filename.replace(/\.(?:webp|gif)$/, "-spritesheet.png")}">PNG spritesheet</a></div></details>` : `<a class="studio-asset-download" href="${fileUrl}" download="${filename}">&#8681; Download PNG</a>`}<button data-modal-close type="button" aria-label="Close">×</button></div></header><div class="studio-asset-detail"><section class="studio-asset-preview checker"><img src="${fileUrl}" alt="${escape(item.name)}" /><div class="studio-zoom" aria-label="Preview zoom"><button data-studio-zoom-out type="button" aria-label="Zoom out">&minus;</button><b data-studio-zoom-label>1:1</b><button data-studio-zoom-in type="button" aria-label="Zoom in">+</button></div></section><aside><span class="studio-kicker">${escape(item.type)}</span><h2>${escape(item.name)}</h2><p class="studio-detail-meta">${escape(item.meta)} · ${escape(item.background)} · ${escape(item.model)}</p><div class="studio-action-group"><span>ORGANIZE</span><button data-action-project="${escape(item.id)}" type="button">Add to project <small>Group this asset in your library</small></button></div><div class="studio-action-group"><span>GENERATE</span><button type="button">Use these settings <small>Apply technical controls</small></button><button type="button">Generate variations <small>Same direction, new outputs</small></button><button data-action-reference="${item.id}" type="button">Use as style reference <small>Inspire the next asset</small></button><button type="button">Create variant / edit <small>Preserve character identity</small></button><button type="button">Animate <small>Open animation flow</small></button></div><div class="studio-action-group"><span>GAME-READY</span><button type="button">Crop <small>Trim transparent edges</small></button><button type="button">Resize &amp; grid <small>Change dimensions or pixel scale</small></button><button type="button">Recolour <small>Quantise or choose palette</small></button><button type="button">Background cleanup <small>Remove backdrop and edge bleed</small></button><button type="button">Slicer <small>Split into multiple assets</small></button></div></aside></div></section></div>`;
    // The asset viewer is intentionally focused: keep the proven download and
    // zoom controls, while removing the placeholder action rail whose buttons
    // do not perform an operation yet.
    const assetDialog = modalRoot.querySelector(".studio-asset-dialog");
    const assetDetail = assetDialog?.querySelector(".studio-asset-detail");
    const assetHeader = assetDialog?.querySelector("header");
    const actionRail = assetHeader?.querySelector(".studio-asset-dialog-actions");
    const preview = assetDetail?.querySelector(".studio-asset-preview");
    if (assetDialog && assetDetail && assetHeader && actionRail && preview) {
      const title = document.createElement("div");
      title.className = "studio-viewer-title";
      const kicker = document.createElement("span");
      kicker.className = "studio-kicker";
      kicker.textContent = item.type || "Asset";
      const heading = document.createElement("h2");
      heading.textContent = item.name || "SpriteForge asset";
      title.append(kicker, heading);
      assetHeader.insertBefore(title, actionRail);

      const downloadControl = actionRail.querySelector(".studio-asset-download, .studio-download-menu");
      if (downloadControl?.matches(".studio-download-menu")) {
        const summary = downloadControl.querySelector("summary");
        if (summary) summary.textContent = "⇩ Download";
      }
      const openPixelEditor = () => {
        editorAssetId = item.id;
        history.replaceState({}, "", `/app?edit=${encodeURIComponent(item.id)}`);
        closeModal();
        setView("manual-editor");
      };
      actionRail.innerHTML = "";
      const editButton = document.createElement("button");
      editButton.className = "studio-viewer-edit";
      editButton.type = "button";
      editButton.textContent = "Edit pixel art";
      editButton.addEventListener("click", openPixelEditor);
      actionRail.append(editButton);
      if (!isAnimation) {
        const animateButton = document.createElement("button");
        animateButton.className = "studio-viewer-animate";
        animateButton.type = "button";
        animateButton.textContent = "Animate";
        animateButton.addEventListener("click", () => {
          animationSourceId = item.id;
          closeModal();
          setView("animation");
        });
        actionRail.append(animateButton);
      }
      const zoom = preview.querySelector(".studio-zoom");
      const toolbar = document.createElement("div");
      toolbar.className = "studio-viewer-toolbar";
      const toolbarLabel = document.createElement("span");
      toolbarLabel.className = "studio-viewer-toolbar-label";
      toolbarLabel.textContent = isAnimation ? "Animation preview" : "Sprite preview";
      toolbar.append(toolbarLabel);
      if (zoom) toolbar.append(zoom);
      const toolbarEditButton = document.createElement("button");
      toolbarEditButton.className = "studio-viewer-edit studio-viewer-toolbar-edit";
      toolbarEditButton.type = "button";
      toolbarEditButton.textContent = "Edit pixel art";
      toolbarEditButton.addEventListener("click", openPixelEditor);
      toolbar.append(toolbarEditButton);
      if (downloadControl) toolbar.append(downloadControl);
      const projectButton = assetDetail.querySelector("[data-action-project]");
      if (projectButton) {
        projectButton.className = "studio-viewer-project";
        const projectAction = item.projectId ? "Change project" : "Add to project";
        projectButton.innerHTML = `<span class="studio-project-action-icon" aria-hidden="true">◇</span><span>${projectAction}</span>`;
        projectButton.setAttribute("aria-label", projectAction);
        projectButton.addEventListener("click", () => openProjectAssignment(item));
        toolbar.append(projectButton);
      }
      assetDetail.append(toolbar);
      assetDetail.querySelector("aside")?.remove();
    }
    wireModal();
  };  const openPreset = (index) => {
    const preset = presets[index];
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-preset-dialog" role="dialog" aria-modal="true" aria-label="${preset.name}"><header><div><span class="studio-kicker">${preset.author.toUpperCase()} PRESET</span><h2>${preset.name}</h2><p>Reusable setup · ${preset.uses} uses · ${preset.saved} saved</p></div><button data-modal-close type="button">×</button></header><div class="studio-preset-detail"><img src="${asset(preset.image)}" alt="" /><div><p>${preset.theme}. Designed as a dependable starting point, then adapted to the active project.</p><dl><div><dt>Theme suggestion</dt><dd>${preset.theme}</dd></div><div><dt>Model</dt><dd>${preset.model}</dd></div><div><dt>Format</dt><dd>Pixel art</dd></div><div><dt>Size</dt><dd>${preset.size}</dd></div><div><dt>Background</dt><dd>Transparent</dd></div></dl><label class="studio-keep-theme"><input type="checkbox" checked /> Keep active theme: Twilight fantasy</label><button class="studio-apply-preset" type="button">Use this preset →</button></div></div></section></div>`;
    wireModal();
  };
  const csrf = () => document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith("spriteforge_csrf="))?.slice("spriteforge_csrf=".length) || "";
  const openCheckoutSuccess = (plan) => {
    const planCredits = { Starter: 700, Creator: 1600, Studio: 3800 };
    const credits = authState.user?.creditExempt ? "∞" : (planCredits[plan] ?? authState.user?.credits ?? 0);
    modalRoot.innerHTML = `<div class="studio-overlay studio-checkout-overlay"><section class="studio-dialog studio-checkout-success" role="dialog" aria-modal="true" aria-label="Payment confirmed"><div class="studio-success-sparkles" aria-hidden="true">✦ &nbsp;✧&nbsp; ✦</div><span class="studio-kicker">PAYMENT CONFIRMED</span><h2>Welcome to ${escape(plan)}.</h2><p>Thank you for supporting SpriteForge. Your workspace has been upgraded and your credits are ready to forge.</p><div class="studio-success-credit"><b>${credits}</b><span>Forge credits ready</span></div><button data-checkout-continue type="button">Start creating →</button><button class="studio-success-secondary" data-modal-close type="button">Continue to workspace</button></section></div>`;
    wireModal();
    modalRoot.querySelector("[data-checkout-continue]")?.addEventListener("click", () => { closeModal(); setView("home"); });
  };
  const acknowledgeCheckout = async () => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("checkout") !== "success") return;
    const checkoutSessionId = query.get("session_id") || "";
    query.delete("checkout"); query.delete("session_id");
    history.replaceState({}, "", `/app${query.toString() ? `?${query}` : ""}`);
    notify("Payment completed — thank you for supporting SpriteForge. Confirming your plan…");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await refreshAuth();
      if (authState.user?.plan || authState.user?.creditExempt) {
        const plan = authState.user.creditExempt ? "Administrator" : `${authState.user.plan[0].toUpperCase()}${authState.user.plan.slice(1)}`;
        openCheckoutSuccess(plan);
        const planValues = { Starter: 9, Creator: 19, Studio: 39 };
        window.spriteforgeTrackX?.("Purchase", { value: planValues[plan] || 0, currency: "USD", conversion_id: checkoutSessionId || undefined });
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
    }
    notify("Payment completed — thank you. Your plan will appear as soon as Stripe confirms it.");
  };
  const startPendingCheckout = async () => {
    const query = new URLSearchParams(window.location.search); const planId = query.get("plan");
    if (!planId) return;
    query.delete("auth"); query.delete("plan"); history.replaceState({}, "", `/app${query.toString() ? `?${query}` : ""}`);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify({ planId }) });
      const data = await response.json(); if (!response.ok || !data.url) throw new Error(data.error || "Checkout is not ready yet");
      window.location.assign(data.url);
    } catch (error) { notify(error.message || "Checkout could not be started."); }
  };
  const themeRequest = async (url, method, body) => { const response = await fetch(url, { method, credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Theme request failed"); return data; };
  const closeAccountMenu = () => root.querySelector(".studio-account-menu")?.remove();
  const openAccountMenu = () => {
    if (!authState.user) { openAuth("login"); return; }
    if (root.querySelector(".studio-account-menu")) { closeAccountMenu(); return; }
    const user = authState.user;
    const plan = user.creditExempt ? "Administrator" : user.plan ? `${user.plan[0].toUpperCase()}${user.plan.slice(1)}` : "Free";
    const canUpgrade = !user.creditExempt && user.plan !== "studio";
    const bottom = root.querySelector(".studio-sidebar-bottom");
    bottom.insertAdjacentHTML("beforeend", `<div class="studio-account-menu" role="menu"><div class="studio-account-menu-header"><span>${escape(user.email)}</span><b>${user.creditExempt ? "∞ credits" : `${user.credits} credits`} · ${plan}</b></div>${!user.emailVerified && !user.creditExempt ? `<button data-account-resend-verify type="button">✉ <span>Resend verification</span></button>` : ""}<button data-account-settings type="button">⚙ <span>Settings</span></button><button data-account-support type="button">? <span>Help & support</span></button>${canUpgrade ? `<button data-account-upgrade type="button">↗ <span>Upgrade plan</span></button>` : ""}<hr /><button class="studio-account-signout" data-account-logout type="button">← <span>Sign out</span></button></div>`);
  };
  const openBillingPortal = async () => {
    try {
      const response = await fetch("/api/billing/portal", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: "{}" });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "Billing portal is unavailable.");
      window.location.assign(data.url);
    } catch (error) { notify(error.message || "Billing portal is unavailable."); }
  };
  const signOut = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-CSRF-Token": csrf() } });
      if (!response.ok) throw new Error("Could not sign out safely.");
      window.location.assign("/");
    } catch (error) { notify(error.message || "Could not sign out safely."); }
  };
  const openThemePicker = (targetView = view) => {
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-theme-picker-dialog" role="dialog" aria-modal="true" aria-label="Your themes"><header><div><span class="studio-kicker">YOUR THEMES</span><h2>Choose a visual direction</h2><p>Select the theme this editor should use for this generation.</p></div><div class="studio-theme-picker-actions">${activeThemeId ? `<button class="studio-theme-picker-clear" type="button">Remove theme</button>` : ""}<button data-modal-close type="button">×</button></div></header><div class="studio-theme-picker-list">${workspaceThemes.length ? workspaceThemes.map((item) => `<button data-picker-theme="${item.id}" class="${item.id === activeThemeId ? "active" : ""}" type="button"><span><b>${escape(item.name)}</b><small>${escape(item.direction || "No direction yet.")}</small><em>${escape(item.styleTags.join(" · ") || "No tags")}</em></span>${item.isDefault ? `<mark>Default</mark>` : ""}<i>→</i></button>`).join("") : `<div class="studio-theme-picker-empty"><b>No themes yet</b><span>Create a theme first to reuse its visual direction across your editors.</span></div>`}</div></section></div>`;
    wireModal();
    modalRoot.querySelectorAll("[data-picker-theme]").forEach((button) => button.addEventListener("click", () => { activeThemeId = button.dataset.pickerTheme; closeModal(); setView(targetView); }));
    modalRoot.querySelector(".studio-theme-picker-clear")?.addEventListener("click", () => { activeThemeId = ""; closeModal(); setView(targetView); });
  };
  const editorThemeControlMarkup = (theme) => `<button class="studio-editor-theme-control ${theme ? "" : "is-empty"}" data-editor-theme-picker type="button"><span class="studio-kicker">ACTIVE THEME</span><b>${escape(theme?.name || "No theme selected")}</b><small>${escape(theme ? "Direction, tags and references will be inherited." : "Choose a saved Theme for stronger consistency.")}</small><em>Change theme →</em></button>`;
  const wireEditorThemeControl = (editorView) => {
    if (editorView === "character") return;
    const theme = activeTheme();
    if (editorView === "asset-generator") {
      const summary = root.querySelector(".asset-theme-summary");
      if (!summary) return;
      summary.classList.add("studio-editor-theme-control");
      summary.dataset.editorThemePicker = "";
      summary.setAttribute("role", "button");
      summary.setAttribute("tabindex", "0");
      if (!summary.querySelector("em")) summary.insertAdjacentHTML("beforeend", `<em>Change theme →</em>`);
      const open = () => openThemePicker(editorView);
      summary.addEventListener("click", open);
      summary.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
      return;
    }
    const hostSelector = editorView === "asset-pack" ? ".pack-form-scroll" : editorView === "tileset" ? ".tileset-form-scroll" : editorView === "animation" ? ".a4-form-scroll" : "";
    const host = hostSelector ? root.querySelector(hostSelector) : null;
    if (!host || host.querySelector("[data-editor-theme-picker]")) return;
    host.insertAdjacentHTML("afterbegin", editorThemeControlMarkup(theme));
    const control = host.querySelector("[data-editor-theme-picker]");
    control?.addEventListener("click", () => openThemePicker(editorView));
  };
  const setDefaultTheme = async (themeId) => {
    try {
      await themeRequest("/api/themes/default", "PUT", { themeId });
      activeThemeId = themeId || "";
      await loadLibrary();
      setView("themes");
      notify(themeId ? "Default theme updated." : "Default theme removed.");
    } catch (error) { notify(error.message); }
  };
  const openThemeEditor = (theme = null) => {
    const creating = !theme;
    const suggestedTags = [
      "cozy", "rpg", "stardew-valley-like", "dark fantasy", "cute", "cyberpunk", "dungeon crawler", "handheld retro",
      "fantasy", "sci-fi", "medieval", "post-apocalyptic", "horror", "mystical", "whimsical", "cute but eerie",
      "farm sim", "roguelike", "metroidvania", "soulslike", "JRPG", "adventure", "platformer", "arcade"
    ];
    const selectedTags = new Set(theme?.styleTags || []);
    const view = theme?.settings?.view || "left-3-4";
    const viewCard = (value, title, subtitle, image) => `<button class="theme-view-card ${view === value ? "active" : ""}" data-theme-view="${value}" type="button" role="radio" aria-checked="${view === value}"><img src="${image}" alt="" /><b>${title}</b><small>${subtitle}</small></button>`;
    modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-theme-dialog" role="dialog" aria-modal="true"><header><div><span class="studio-kicker">${creating ? "NEW THEME" : "EDIT THEME"}</span><h2>${creating ? "Set the visual direction" : theme.name}</h2><p>These rules will be inherited by Character Creator.</p></div><button data-modal-close type="button">×</button></header><form class="studio-auth-form studio-theme-form"><label>Theme name<input name="name" maxlength="160" value="${theme?.name || ""}" placeholder="e.g. Cozy forest adventure" required /></label><label>Visual direction<textarea name="direction" maxlength="3000" placeholder="Warm, readable pixel art with soft forest colors and clean outlines.">${theme?.direction || ""}</textarea></label><label>Style tags <input name="tags" value="${theme?.styleTags?.join(", ") || ""}" placeholder="Write your own: cozy, rpg, warm" /></label><div class="studio-theme-tag-list" aria-label="Suggested style tags">${suggestedTags.map((tag) => `<button type="button" data-theme-tag="${tag}" class="${selectedTags.has(tag) ? "active" : ""}">${tag}</button>`).join("")}</div><small class="studio-theme-help">Choose as many suggestions as you need, or add custom tags in the field above.</small><div class="studio-theme-form-row"><label>Pixel scale<select name="pixelScale"><option value="uniform-coarse">Large pixels</option><option value="uniform-medium">Medium pixels</option><option value="uniform-fine">Small pixels</option></select></label></div><div class="studio-theme-view-field"><span>Default view</span><input name="view" type="hidden" value="${view}" /><div class="theme-view-picker" role="radiogroup" aria-label="Default asset view">${viewCard("left-3-4", "Platformer", "Side view · 3/4", "/assets/showcase/character/idle.png")}${viewCard("isometric", "Isometric", "Angled world view", "/assets/examples/isometric-buildings/castle.webp")}${viewCard("top-down", "Top-down", "Overhead gameplay", "/assets/pixelsnapper/after.png")}</div><small class="studio-theme-help">New characters start with this perspective. You can still change it in the creator.</small></div><p class="studio-auth-error" hidden></p><button type="submit">${creating ? "Create theme" : "Save changes"} →</button></form></section></div>`;
    wireModal();
    const form = modalRoot.querySelector("form");
    const referenceBlock = document.createElement("section");
    referenceBlock.className = "studio-theme-form-references";
    const referencePremium = Boolean(authState.user?.referencePremium);
    const referenceCount = Array.isArray(theme?.references) ? theme.references.length : 0;
    referenceBlock.innerHTML = referencePremium ? `<div><span class="studio-kicker">IMAGE REFERENCES · PREMIUM</span><b>${referenceCount}/5 visual references</b><small>${theme ? "Attach approved library images to keep future generations consistent." : "Save the Theme first, then attach up to five approved library images."}</small></div>${theme ? `<button class="studio-theme-manage-references" type="button">Manage references →</button>` : `<span class="studio-theme-reference-pending">Available after creating this Theme</span>`}` : `<div><span class="studio-kicker">IMAGE REFERENCES · PREMIUM</span><b>Locked on your current plan</b><small>Reference images are a premium feature. Upgrade to Creator or Studio to attach up to five images per Theme.</small></div><button data-account-upgrade class="studio-theme-upgrade-references" type="button">View premium plans →</button>`;
    modalRoot.querySelector(".studio-auth-error")?.before(referenceBlock);
    referenceBlock.querySelector(".studio-theme-manage-references")?.addEventListener("click", () => { closeModal(); openThemeReferencePicker(theme); });
    form.pixelScale.value = theme?.settings?.pixelScale || "uniform-medium";
    const syncTagButtons = () => {
      const tags = new Set(form.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean));
      form.querySelectorAll("[data-theme-tag]").forEach((button) => button.classList.toggle("active", tags.has(button.dataset.themeTag)));
    };
    form.querySelectorAll("[data-theme-tag]").forEach((button) => button.addEventListener("click", () => {
      const tags = form.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
      const tag = button.dataset.themeTag;
      form.tags.value = tags.includes(tag) ? tags.filter((item) => item !== tag).join(", ") : [...tags, tag].join(", ");
      syncTagButtons();
    }));
    form.tags.addEventListener("input", syncTagButtons);
    form.querySelectorAll("[data-theme-view]").forEach((button) => button.addEventListener("click", () => {
      form.view.value = button.dataset.themeView;
      form.querySelectorAll("[data-theme-view]").forEach((card) => { const active = card === button; card.classList.toggle("active", active); card.setAttribute("aria-checked", String(active)); });
    }));
    form.addEventListener("submit", async (event) => { event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const body = { name: values.name, direction: values.direction, styleTags: values.tags.split(",").map((tag) => tag.trim()).filter(Boolean), settings: { pixelScale: values.pixelScale, view: values.view } }; try { const saved = creating ? await themeRequest("/api/themes", "POST", body) : await themeRequest(`/api/themes/${theme.id}`, "PATCH", body); activeThemeId = saved.id || theme.id; closeModal(); await loadLibrary(); setView("themes"); notify(creating ? "Theme created and active." : "Theme updated."); } catch (error) { const message = form.querySelector(".studio-auth-error"); message.hidden = false; message.textContent = error.message; } });
  };
  const createTheme = () => openThemeEditor();
  const editTheme = (theme) => openThemeEditor(theme);
  const openThemeReferencePicker = (theme) => {
    const premium = Boolean(authState.user?.referencePremium);
    const current = Array.isArray(theme?.references) ? theme.references : [];
    const selected = new Set(current.map((reference) => reference.id));
    const available = assets.filter((item) => item.files?.gameReady || item.files?.original || imageSource(item));
    const render = () => {
      const remaining = Math.max(0, 5 - selected.size);
      modalRoot.innerHTML = `<div class="studio-overlay"><section class="studio-dialog studio-theme-reference-picker" role="dialog" aria-modal="true" aria-label="Theme image references"><header><div><span class="studio-kicker">THEME REFERENCES · PREMIUM</span><h2>Keep the look consistent</h2><p>${premium ? "Choose up to five approved assets. Their shapes, palette and pixel language guide future generations." : "Reference images are a premium feature. Upgrade to Creator or Studio to attach up to five visual references to each theme."}</p></div><button data-modal-close type="button">×</button></header>${premium ? `<div class="studio-theme-reference-picker-meta"><b>${selected.size}/5 selected</b><span>${remaining ? `Select ${remaining} more or confirm your choices.` : "Reference limit reached."}</span></div><div class="studio-theme-reference-choice-grid">${available.length ? available.map((item) => { const isSelected = selected.has(item.id); const disabled = !isSelected && selected.size >= 5; return `<button class="studio-theme-reference-choice ${isSelected ? "selected" : ""}" data-theme-reference-asset="${escape(item.id)}" type="button" ${disabled ? "disabled" : ""}><span class="checker"><img src="${escape(imageSource(item))}" alt="" /></span><span><b>${escape(item.name)}</b><small>${escape(item.type || "Asset")}</small></span><i>${isSelected ? "✓" : "+"}</i></button>`; }).join("") : `<div class="studio-theme-reference-picker-empty"><b>Your library is empty</b><span>Generate or upload an asset first, then return here to use it as a style reference.</span></div>`}</div><footer><span>Only assets from your private library can be used.</span><button class="studio-confirm-theme-references" type="button" ${selected.size === current.length ? "disabled" : ""}>Use selected references →</button></footer>` : `<div class="studio-premium-reference-lock"><div class="studio-premium-reference-lock-icon">◇</div><h3>Unlock visual references</h3><p>Tags describe a style; reference images show it. Premium plans let you attach up to five approved images to every theme for much stronger consistency.</p><button data-account-upgrade type="button">View premium plans →</button></div>`}</section></div>`;
      wireModal();
      modalRoot.querySelectorAll("[data-theme-reference-asset]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.themeReferenceAsset; if (selected.has(id)) selected.delete(id); else if (selected.size < 5) selected.add(id); render(); }));
      modalRoot.querySelector(".studio-confirm-theme-references")?.addEventListener("click", async () => {
        const additions = [...selected].filter((id) => !current.some((reference) => reference.id === id));
        const confirm = modalRoot.querySelector(".studio-confirm-theme-references"); if (confirm) { confirm.disabled = true; confirm.textContent = "Saving references…"; }
        try { for (const assetId of additions) await themeRequest(`/api/themes/${theme.id}/references`, "POST", { assetId }); await loadLibrary(); closeModal(); setView("themes"); notify(additions.length ? `${additions.length} style reference${additions.length === 1 ? "" : "s"} added.` : "Theme references are up to date."); } catch (error) { notify(error.message); if (confirm) { confirm.disabled = false; confirm.textContent = "Use selected references →"; } }
      });
    };
    render();
  };
  const addThemeReference = (theme) => openThemeReferencePicker(theme);
  const wireModal = () => {
    modalRoot.querySelectorAll("[data-modal-close]").forEach((button) => button.addEventListener("click", closeModal));
    modalRoot.querySelector(".studio-overlay")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal(); });
    modalRoot.querySelectorAll("[data-reference-id]").forEach((button) => button.addEventListener("click", () => { const item = assets.find((asset) => asset.id === button.dataset.referenceId); selectedReferences = selectedReferences.some((reference) => reference.id === item.id) ? selectedReferences.filter((reference) => reference.id !== item.id) : [...selectedReferences, item].slice(-2); openReferences(); }));
    modalRoot.querySelector(".studio-confirm-references")?.addEventListener("click", () => { closeModal(); setView("home"); notify(`${selectedReferences.length || "No"} reference${selectedReferences.length === 1 ? "" : "s"} ready for the next generation.`); });
    modalRoot.querySelector(".studio-apply-preset")?.addEventListener("click", () => { closeModal(); notify("Preset applied. Your active theme remains unchanged."); });
    modalRoot.querySelectorAll("[data-auth-switch]").forEach((button) => button.addEventListener("click", () => openAuth(button.dataset.authSwitch)));
    modalRoot.querySelectorAll("[data-action-reference]").forEach((button) => button.addEventListener("click", () => { const item = assets.find((asset) => asset.id === button.dataset.actionReference); selectedReferences = [item]; closeModal(); setView("home"); notify(`${item.name} is now a style reference.`); }));
    const zoomLabel = modalRoot.querySelector("[data-studio-zoom-label]"); const zoomOut = modalRoot.querySelector("[data-studio-zoom-out]"); const zoomIn = modalRoot.querySelector("[data-studio-zoom-in]"); const previewImage = modalRoot.querySelector(".studio-asset-preview > img");
    if (zoomLabel && zoomOut && zoomIn && previewImage) { let scale = 2.5; const renderZoom = () => { previewImage.style.transform = `scale(${scale})`; zoomLabel.textContent = `${scale.toFixed(1)}:1`; }; zoomOut.addEventListener("click", () => { scale = Math.max(0.5, scale - 0.5); renderZoom(); }); zoomIn.addEventListener("click", () => { scale = Math.min(8, scale + 0.5); renderZoom(); }); renderZoom(); }
  };
  const wireView = () => {
    content.querySelectorAll("[data-asset]").forEach((button) => button.addEventListener("click", () => openAsset(button.dataset.asset)));
    content.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => openPreset(button.dataset.preset)));
    content.querySelector(".studio-reference-open")?.addEventListener("click", openReferences);
    const prompt = content.querySelector("#studio-prompt");
    const generate = content.querySelector(".studio-history");
    prompt?.addEventListener("input", () => { generate.disabled = !prompt.value.trim(); });
    const generatorSelect = content.querySelector("#studio-generator-select");
    const submitComposer = () => {
      const promptText = prompt?.value.trim() || "";
      if (!promptText) { prompt?.focus(); return; }
      const target = generatorSelect?.value || "Character";
      if (!authState.user) { pendingComposerIntent = { target, promptText }; openAuth("login"); return; }
      setView(generatorView(target), promptText);
    };
    generate?.addEventListener("click", submitComposer);
    prompt?.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submitComposer(); } });
    content.querySelector("#studio-asset-search")?.addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); content.querySelectorAll(".studio-asset-card").forEach((card) => card.hidden = !card.innerText.toLowerCase().includes(query)); });
    content.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => { assetKindFilter = button.dataset.filter || "all"; content.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button)); content.querySelectorAll(".studio-asset-card").forEach((card) => card.hidden = assetKindFilter !== "all" && !card.innerText.includes(assetKindFilter)); }));
    content.querySelectorAll("[data-project-create]").forEach((button) => button.addEventListener("click", openProjectEditor));
    content.querySelectorAll("[data-project-filter]").forEach((button) => button.addEventListener("click", () => { assetProjectFilter = button.dataset.projectFilter || "all"; setView("assets"); }));
    content.querySelector("#studio-preset-search")?.addEventListener("input", (event) => { const query = event.target.value.toLowerCase(); content.querySelectorAll(".studio-preset-card").forEach((card) => card.hidden = !card.innerText.toLowerCase().includes(query)); });
    content.querySelectorAll("[data-studio-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.studioView)));
    content.querySelectorAll("[data-studio-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.studioTool)));
    content.querySelectorAll("[data-theme-create]").forEach((button) => button.addEventListener("click", createTheme));
    content.querySelectorAll("[data-theme-select]").forEach((button) => button.addEventListener("click", () => { activeThemeId = button.dataset.themeSelect; setView("themes"); }));
    content.querySelectorAll("[data-theme-edit]").forEach((button) => button.addEventListener("click", () => editTheme(workspaceThemes.find((theme) => theme.id === button.dataset.themeEdit))));
    content.querySelectorAll("[data-theme-default]").forEach((button) => button.addEventListener("click", () => setDefaultTheme(button.classList.contains("active") ? null : button.dataset.themeDefault)));
    content.querySelectorAll("[data-theme-reference]").forEach((button) => button.addEventListener("click", () => addThemeReference(workspaceThemes.find((theme) => theme.id === button.dataset.themeReference))));
    if (view === "themes") {
      const premium = Boolean(authState.user?.referencePremium);
      content.querySelectorAll("[data-theme-reference]").forEach((button) => {
        button.classList.toggle("is-locked", !premium);
        button.innerHTML = premium ? "＋ Add reference" : "◇ Premium references";
        button.setAttribute("aria-label", premium ? "Add a theme reference image" : "Premium feature: theme reference images");
        button.title = premium ? "Choose up to five approved assets" : "Available on Creator and Studio plans";
      });
      content.querySelectorAll(".studio-theme-reference").forEach((section) => {
        if (!section.querySelector(".studio-reference-access-note")) {
          const note = document.createElement("small"); note.className = "studio-reference-access-note"; note.textContent = premium ? "Premium: up to five approved images per theme." : "Premium feature · upgrade to attach up to five reference images."; section.append(note);
        }
      });
    }
  };
  const openTool = (tool, promptText = "") => { if (tool === "Character" || tool === "Asset Generator" || tool === "Asset Pack" || tool === "Tileset" || tool === "Animation" || tool === "Manual Editor") { if (!authState.user) openAuth("login"); else setView(tool === "Character" ? "character" : tool === "Asset Generator" ? "asset-generator" : tool === "Asset Pack" ? "asset-pack" : tool === "Tileset" ? "tileset" : tool === "Animation" ? "animation" : "manual-editor", promptText); } else notify(`${tool} is designed and ready for its functional phase.`); };
  root.querySelectorAll("[data-studio-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.studioView)));
  root.querySelectorAll("[data-studio-tool]").forEach((button) => button.addEventListener("click", () => openTool(button.dataset.studioTool)));
  root.addEventListener("click", (event) => { const trigger = event.target.closest("[data-auth-action]"); if (!trigger) return; if (trigger.dataset.authAction === "login") openAuth("login"); else notify(authState.user?.creditExempt ? "Administrator account · unlimited credits" : `${authState.user?.credits || 0} credits available${authState.user?.plan ? ` · ${authState.user.plan} plan active` : ""}`); });
  root.addEventListener("click", (event) => {
    const authTrigger = event.target.closest("[data-auth-action='account']");
    if (!authTrigger) return;
    event.stopImmediatePropagation();
    openAccountMenu();
  }, true);
  root.addEventListener("click", (event) => {
    const authTrigger = event.target.closest("[data-auth-action='account']");
    if (authTrigger) { openAccountMenu(); return; }
    const action = event.target.closest("[data-account-settings],[data-account-support],[data-account-upgrade],[data-account-billing],[data-account-home],[data-account-logout],[data-account-resend-verify]");
    if (action) {
      closeAccountMenu();
      if (action.hasAttribute("data-account-resend-verify")) {
        fetch("/api/auth/verify-email/resend", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf() }, body: "{}" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); notify("Verification email sent. Check your inbox."); }).catch((error) => notify(error.message || "Could not send verification email."));
      } else if (action.hasAttribute("data-account-settings")) setView("settings");
      else if (action.hasAttribute("data-account-support")) setView("support");
      else if (action.hasAttribute("data-account-upgrade")) window.location.assign("/pricing");
      else if (action.hasAttribute("data-account-billing")) openBillingPortal();
      else if (action.hasAttribute("data-account-home")) setView("home");
      else if (action.hasAttribute("data-account-logout")) signOut();
      return;
    }
    if (!event.target.closest(".studio-user, .studio-account-menu")) closeAccountMenu();
  });
  setView("home");
  refreshAuth().then(() => {
    if (authState.user && initialEditorAssetId) {
      setView("manual-editor");
      return;
    }
    if (authState.user && initialAnimationAssetId) {
      setView("animation");
      return;
    }
    if (authState.user && initialAssetId) {
      setView("assets");
      openAsset(initialAssetId);
      return;
    }
    if (!authState.user && new URLSearchParams(window.location.search).get("auth") === "register") openAuth("register");
    else acknowledgeCheckout();
  });
}
