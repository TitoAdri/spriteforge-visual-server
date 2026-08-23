import { processPixelGrid, quantizePalette, snapToGrid } from "/pixel-grid-core.js";
import { characterCreatorMarkup, setupCharacterCreator } from "/character-creator.js?v=27";
import { assetGeneratorMarkup, setupAssetGenerator } from "/asset-generator.js?v=11";
import { appStudioMarkup, setupAppStudio } from "/app-studio.js?v=112";
import "/cost-display.js?v=6";
import "/perspective-assets.js?v=1";

const asset = (path) => `/assets/${path}`;

let characterFunnelTheme = null;
let characterFunnelThemes = [];

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
}[character]));

const nav = () => `
  <nav class="nav">
    <a class="brand" href="/" data-route="/">
      <img src="${asset("spriteforge-logo.png")}" alt="" /> <span>SpriteForge</span>
    </a>
    <div class="nav-links">
      <a href="/app" data-route="/app">App</a>
      <a href="/docs" data-route="/docs">Docs</a>
      <a href="/pixel-grid-detector" data-route="/pixel-grid-detector">Grid detector</a>
      <a href="/pricing" data-route="/pricing">Pricing</a>
    </div>
    <button class="nav-cta" type="button">Get started <span>→</span></button>
  </nav>`;

const footer = () => `
  <footer>
    <section class="footer-cta"><h2>Start creating for free</h2><p>40 free credits on your first account. No credit card required.</p><div><button>Start Creating</button></div></section>
    <div class="footer-bottom"><div class="brand"><img src="${asset("spriteforge-logo.png")}" alt="" /><b>SpriteForge</b><span>· AI sprite generation for game devs</span></div><div>Discord &nbsp; Terms &nbsp; Privacy &nbsp; Refunds &nbsp; Cookies &nbsp; © 2026 SpriteForge</div></div>
  </footer>`;

const footerNoDiscord = () => footer()
  .replace("Discord &nbsp; ", "")
  .replace("Terms &nbsp; Privacy &nbsp; Refunds &nbsp; Cookies", `<a href="/terms" data-route="/terms">Terms</a> &nbsp; <a href="/privacy" data-route="/privacy">Privacy</a> &nbsp; <a href="/refunds" data-route="/refunds">Refunds</a> &nbsp; <a href="/cookies" data-route="/cookies">Cookies</a>`);

const legalPage = (title, updated, sections) => `
  ${nav()}<main class="legal-page wrap"><header class="legal-heading"><span class="eyebrow">SPRITEFORGE · LEGAL</span><h1>${title}</h1><p>Last updated: ${updated}</p></header>
  <article class="legal-document">${sections.map(([heading, body]) => `<section><h2>${heading}</h2>${body}</section>`).join("")}</article>
  </main>${footerNoDiscord()}`;

const legalRoutes = {
  "/terms": () => legalPage("Terms of Service", "15 August 2026", [
    ["1. About SpriteForge", `<p>SpriteForge is an online workspace for creating and organising pixel-art game assets. These Terms govern use of <strong>spriteforge.xyz</strong> and the SpriteForge app.</p>`],
    ["2. Your account", `<p>You must provide accurate account information, keep your credentials confidential and be legally able to accept these Terms. You are responsible for activity performed through your account.</p>`],
    ["3. Your content and generated assets", `<p>You retain your rights in prompts, reference material and assets you upload, subject to the rights required to operate the service. You are responsible for ensuring that your prompts and references do not infringe others’ rights or violate applicable law.</p><p>Generative output may be imperfect, non-exclusive and may require human review. Do not rely on it for safety-critical, unlawful or rights-sensitive uses.</p>`],
    ["4. Acceptable use", `<p>Do not misuse the service, interfere with its security, attempt to access another account, submit unlawful or infringing material, or use it to create harmful, deceptive or illegal content.</p>`],
    ["5. Third-party AI providers", `<p>When you request a generation, SpriteForge may send the necessary prompt, settings and authorised reference images to an AI provider selected for that request. Provider availability and output quality are not guaranteed.</p>`],
    ["6. Changes and availability", `<p>We may change, suspend or discontinue features to protect the service, comply with law or improve the product. We will use reasonable efforts to communicate material changes when practical.</p>`],
    ["7. Contact", `<p>For questions about these Terms, contact <a href="mailto:legal@spriteforge.xyz">legal@spriteforge.xyz</a>.</p>`]
  ]),
  "/privacy": () => legalPage("Privacy Policy", "15 August 2026", [
    ["1. Controller and scope", `<p>SpriteForge is responsible for the personal data processed through this website and app. Contact: <a href="mailto:privacy@spriteforge.xyz">privacy@spriteforge.xyz</a>.</p>`],
    ["2. Data we process", `<p>We process account data (such as email address and securely hashed password), session and security data, prompts and generation settings, the assets and references you choose to store, and limited technical logs needed to secure and operate the service.</p>`],
    ["3. Why we use it", `<p>We use this data to create and secure accounts, provide generation and library features, prevent abuse, respond to support requests and comply with legal obligations. We process account and service data to perform our agreement with you, protect legitimate interests in security and reliability, or where required by law.</p>`],
    ["4. Processors and transfers", `<p>Generation requests can be processed by selected AI providers only when you initiate that generation. Hosting and infrastructure providers may process data on our behalf to operate the service. These providers may process data outside your country; appropriate safeguards are used where required.</p>`],
    ["5. Retention", `<p>We keep account and library data while your account is active, and keep limited security logs only for as long as reasonably necessary. You can request deletion of your account and associated data, subject to legal and security retention requirements.</p>`],
    ["6. Your rights", `<p>Depending on your location, you may have rights to access, correct, delete, restrict or export your data, object to certain processing, and complain to a data-protection authority. Contact us to exercise these rights.</p>`],
    ["7. Security", `<p>We use technical and organisational measures designed to protect data, including access controls and encrypted transport. No online service can guarantee absolute security.</p>`]
  ]),
  "/refunds": () => legalPage("Refund Policy", "15 August 2026", [
    ["Current status", `<p>SpriteForge does not currently offer paid subscriptions or paid credit purchases. No payment information is collected through the service at this time.</p>`],
    ["Future paid plans", `<p>Before paid plans or credit packs are offered, this page will be updated with the applicable price, tax, cancellation and refund terms. Those terms will be shown before checkout.</p>`],
    ["Support", `<p>If you believe a charge was made in error once payments are available, contact <a href="mailto:billing@spriteforge.xyz">billing@spriteforge.xyz</a> with the account email, transaction date and a description of the issue.</p>`]
  ]),
  "/cookies": () => legalPage("Cookie Policy", "15 August 2026", [
    ["What we use", `<p>SpriteForge currently uses only strictly necessary cookies: <code>spriteforge_session</code> to keep an authenticated session and <code>spriteforge_csrf</code> to protect requests against cross-site request forgery.</p>`],
    ["Why consent is not requested", `<p>These cookies are necessary for the website and authenticated app to function and cannot be disabled through the service. We do not currently use advertising, analytics or social-media cookies.</p>`],
    ["Managing cookies", `<p>You can delete or block cookies in your browser settings. Blocking necessary cookies may prevent sign-in and other core functions from working.</p>`],
    ["Changes", `<p>If we add optional cookies, we will update this page and request consent where required before setting them.</p>`]
  ])
};

const pricing = () => {
  const plans = [
    { id: "starter", name: "Starter", price: 9, credits: 700, description: "For early prototypes and a focused asset library.", features: ["Up to 233 character sprites", "233 standard assets or tiles", "28 complete animations", "5 saved themes"] },
    { id: "creator", name: "Creator", price: 19, credits: 1600, featured: true, description: "The practical monthly workspace for an active game project.", features: ["Up to 533 character sprites", "533 standard assets or tiles", "64 complete animations", "Premium style references (up to 5)"] },
    { id: "studio", name: "Studio", price: 39, credits: 3800, description: "For teams building a game world at production pace.", features: ["Up to 1,266 character sprites", "1,266 standard assets or tiles", "152 complete animations", "Premium style references and priority support"] },
  ];
  const costs = [
    ["Character / enemy / NPC", "3 credits", "Full game-ready sprite generation"],
    ["Asset", "3 credits", "Items, props, UI and variants"],
    ["Edit", "6 credits", "Refine an existing asset"],
    ["Asset pack", "6 credits each", "Charged per item that starts generating"],
    ["Tileset", "3 credits each", "Charged per generated tile"],
    ["Animation", "25 credits", "One game-ready animated sequence"],
    ["Prompt assistant", "Free", "Up to 5 assisted prompts per day"],
  ];
  return `${nav()}<main class="pricing-page"><header class="pricing-hero"><div class="eyebrow">SIMPLE, USAGE-BASED PRICING</div><h1>Credits for every pixel you ship.</h1><p>Start with 40 free credits. Paid plans refresh monthly and use one transparent Forge-credit schedule across the whole workspace.</p><div class="pricing-note"><i></i><span>Secure Stripe checkout. Payments are processed by Stripe.</span></div></header><section class="pricing-grid">${plans.map((plan) => `<article class="plan-card${plan.featured ? " featured" : ""}">${plan.featured ? `<span class="plan-badge">MOST POPULAR</span>` : ""}<h2>${plan.name}</h2><p>${plan.description}</p><div class="plan-price"><strong>$${plan.price}</strong><span>/ month</span></div><div class="plan-credits">${plan.credits.toLocaleString()} Forge credits<small>Credits refresh monthly. Unused credits do not roll over.</small></div><ul>${plan.features.map((feature) => `<li>${feature}</li>`).join("")}</ul><button type="button" data-plan-signup="${plan.id}">Choose ${plan.name} →</button></article>`).join("")}</section><section class="pricing-costs"><header><h2>What a Forge credit buys</h2><p>Credits are only deducted when a generation starts. Failed provider requests are automatically refunded; local pixel-grid and cleanup processing cost nothing.</p></header><div class="pricing-cost-table">${costs.map(([label, amount, detail]) => `<article><b>${label}</b><span>${amount}</span><small>${detail}</small></article>`).join("")}</div></section></main>${footerNoDiscord()}`;
};

const docs = () => `
  ${nav()}
  <main class="docs-page">
    <header class="docs-hero">
      <div><span class="eyebrow">SPRITEFORGE DOCUMENTATION</span><h1>Make game art with a repeatable workflow.</h1><p>Learn how to build characters, game assets, tilesets and animations that belong to the same world.</p></div>
      <a href="/app" data-route="/app" class="docs-hero-cta">Open SpriteForge <b>→</b></a>
    </header>
    <div class="docs-layout">
      <aside class="docs-sidebar" aria-label="Documentation navigation">
        <div class="docs-search"><span>⌕</span><input id="docs-search" type="search" placeholder="Search guides" autocomplete="off" /></div>
        <nav>
          <small>GETTING STARTED</small>
          <a class="active" href="#overview">Overview</a><a href="#workspace">Your workspace</a><a href="#credits">Credits and plans</a>
          <small>CREATE</small>
          <a href="#characters">Characters</a><a href="#assets">Asset generator</a><a href="#packs">Asset packs</a><a href="#tilesets">Tilesets</a><a href="#animation">Animation</a>
          <small>CONSISTENCY</small>
          <a href="#themes">Themes and references</a><a href="#prompting">Prompting well</a>
          <small>DELIVER</small>
          <a href="#library">Library and exports</a><a href="#help">Help and account</a>
        </nav>
      </aside>
      <article class="docs-content">
        <section id="overview" data-doc-section><span class="docs-kicker">INTRODUCTION</span><h2>Welcome to SpriteForge</h2><p class="docs-lede">SpriteForge is a game-art workspace: describe an asset, generate it as pixel art, keep the result in a private library and use the same visual direction across the rest of your game.</p><div class="docs-callout"><b>Start here</b><p>Create a theme first if you want a coherent project. If you are exploring, start with a character or an asset and save the results you want to reuse.</p></div><div class="docs-path"><span>1</span><div><b>Describe</b><small>Choose the tool that fits the job and write the brief.</small></div><span>2</span><div><b>Direct</b><small>Set view, pixel scale and an optional theme.</small></div><span>3</span><div><b>Ship</b><small>Review your game-ready export in My assets.</small></div></div></section>

        <section id="workspace" data-doc-section><span class="docs-kicker">GETTING STARTED</span><h2>Your workspace</h2><p>The home screen gives you one place for the tools, recent creations and your current art direction. The left rail stays available while you work, so you can move from an item to an animation without losing your library.</p><figure class="docs-shot docs-shot-home"><div class="shot-top"><i></i><b>SpriteForge</b><span>Home</span><span>My assets</span><span>Themes</span></div><div class="shot-home-body"><div><em>WELCOME BACK</em><strong>Build your game world.</strong><small>Start from a tool or continue from the library.</small><div class="shot-actions"><b>Character</b><b>Asset generator</b><b>Tileset</b></div></div><div class="shot-recents"><img src="${asset("showcase/character/idle.png")}"/><img src="${asset("showcase/pack/bushes.png")}"/><img src="${asset("showcase/pack/tree.png")}"/></div></div></figure><figcaption>SpriteForge workspace with tools, recent assets and themes.</figcaption></section>

        <section id="characters" data-doc-section><span class="docs-kicker">CREATE</span><h2>Create a character</h2><p>Use Character for an individual hero, enemy or NPC. Keep the brief focused on silhouette, clothing, pose and one or two recognizable details. The creator normalizes the result into a transparent, pixel-ready sprite before saving it.</p><ol class="docs-steps"><li><b>Write the character brief.</b> Name the role and the visual identifiers: “compact desert ranger, teal hood, brass goggles and a copper lantern.”</li><li><b>Choose the point of view.</b> Platformer, isometric and top-down tell the model how the sprite will be used.</li><li><b>Use a theme when consistency matters.</b> Its visual direction and tags are added to the request.</li></ol><figure class="docs-shot docs-shot-character"><div class="shot-form"><em>CHARACTER CREATOR</em><b>Character brief</b><p>A compact desert ranger with a teal hood, brass goggles and copper lantern.</p><b>Perspective</b><div class="shot-views"><span>Platformer</span><span>Isometric</span><span>Top-down</span></div><button>Generate character →</button></div><div class="shot-preview"><img src="${asset("showcase/character/idle.png")}"/><b>Ready for a new hero</b><small>Game-ready sprite preview</small></div></figure><figcaption>The character creator locks the visual direction before generation.</figcaption></section>

        <section id="assets" data-doc-section><span class="docs-kicker">CREATE</span><h2>Make individual game assets</h2><p>Asset generator is for objects rather than people: icons, inventory items, weapons, buildings, scenery and UI. Select the category first; it adjusts the composition rules in the request so, for example, an inventory item is not treated as an environment scene.</p><div class="docs-two"><div><h3>Good item briefs</h3><ul><li>“Small brass compass, cracked glass, cyan needle and leather loop.”</li><li>“Wooden treasure chest, iron bands, closed lid, front 3/4 view.”</li><li>“Three red heart health icon, clean UI silhouette, no text.”</li></ul></div><div class="docs-tip"><b>Keep one subject</b><p>Ask for one asset at a time. Avoid hands, shelves, scenery or a character holding it unless that scene is the asset you actually need.</p></div></div></section>

        <section id="packs" data-doc-section><span class="docs-kicker">CREATE</span><h2>Build an asset pack</h2><p>Use Asset pack for a related set: a potion family, market stall props or dungeon furniture. Define the shared material, mood and rules once, then describe each member of the set. Review each result independently in your library.</p><div class="docs-callout quiet"><b>A practical way to work</b><p>Make a theme for the whole game, then make a small asset pack for each location or faction. Reuse the same tags and scale for every pack.</p></div></section>

        <section id="tilesets" data-doc-section><span class="docs-kicker">CREATE</span><h2>Generate tilesets</h2><p>Tilesets are made for repeating game surfaces. Select the surface type, then describe material, wear and landmarks. SpriteForge instructs the generator to keep opposing edges compatible so a tile can be placed beside itself without an obvious seam.</p><figure class="docs-shot docs-shot-tile"><div class="tile-grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><img src="${asset("showcase/pack/tree.png")}"/></div><div><b>Tileset checklist</b><ul><li>Use one base material per tile.</li><li>Keep large motifs away from the seam.</li><li>Test a 3 × 3 repeat before shipping.</li></ul></div></figure><figcaption>Use the repeated preview to spot seams before exporting a tileset.</figcaption></section>

        <section id="animation" data-doc-section><span class="docs-kicker">CREATE</span><h2>Animate a sprite</h2><p>Animation starts with an approved library sprite. Choose a motion, describe the sequence as a complete action and select the required frame count. SpriteForge renders an animation output and can locally clean the known chroma background from the finished frames.</p><div class="docs-warning"><b>Make motion explicit</b><p>For an idle, describe breathing, weight shift and a return to the starting pose. For a walk, say which foot contacts, passes and returns. A concise start → extreme → recovery sequence is more dependable than “make it walk.”</p></div><figure class="docs-shot docs-shot-animation"><div class="shot-frames"><img src="${asset("showcase/character/idle.png")}"/><img src="${asset("showcase/character/idle.png")}"/><img src="${asset("showcase/character/idle.png")}"/><img src="${asset("showcase/character/idle.png")}"/></div><div><em>ANIMATION QUEUE</em><b>In-place idle loop</b><small>6 frames · transparent canvas · ready to export</small><button>Generate animation →</button></div></figure></section>

        <section id="themes" data-doc-section><span class="docs-kicker">CONSISTENCY</span><h2>Use themes to keep art together</h2><p>A theme stores a visual direction, selected tags, pixel scale, preferred view and—on eligible plans—up to five reference images. Select a default theme to automatically apply it in the creators, or choose another theme per request.</p><div class="docs-two"><div class="docs-theme-card"><em>ACTIVE THEME</em><h3>Twilight workshop</h3><p>Warm cast iron, moonlit steel and chunky, medium pixel clusters.</p><span>cozy</span><span>rpg</span><span>mystical</span></div><div><h3>References are stronger than tags alone</h3><p>Tags establish direction. A carefully chosen reference image also gives the model concrete signals for shape language, line weight and color relationships. Use only images you own or have permission to use.</p></div></div></section>

        <section id="prompting" data-doc-section><span class="docs-kicker">CONSISTENCY</span><h2>Prompt for useful pixel art</h2><div class="docs-prompt-grid"><div><small>INSTEAD OF</small><p>“A cool fantasy item.”</p></div><div><small>TRY</small><p>“Single iron lantern, hexagonal glass chamber, warm amber flame, front 3/4 view, compact silhouette.”</p></div></div><ul class="docs-checklist"><li>Lead with the subject and camera view.</li><li>Describe material, silhouette and 1–3 signature details.</li><li>Use a theme and keep its tags stable across a family of assets.</li><li>For sprites, ask for a single subject with no scenery or glow effects.</li></ul></section>

        <section id="library" data-doc-section><span class="docs-kicker">DELIVER</span><h2>Find and export your work</h2><p>Every successful generation is saved in My assets under your account. Open an asset to inspect it against a checkerboard background, adjust zoom and download the file you need.</p><div class="docs-two"><div><h3>Still assets</h3><p>Download as transparent PNG for Unity, Godot, GameMaker, Phaser or any workflow that accepts a standard sprite image.</p></div><div><h3>Animations</h3><p>Download the animation as animated WebP, GIF or a spritesheet when available. Use animated WebP in modern web tools; use a spritesheet for traditional game engines.</p></div></div></section>

        <section id="credits" data-doc-section><span class="docs-kicker">ACCOUNT</span><h2>Credits and plans</h2><p>Your account begins with 40 free Forge credits. The cost is shown before a generation begins; failed provider requests are automatically refunded. Local pixel-grid and cleanup processing does not consume credits.</p><a href="/pricing" data-route="/pricing" class="docs-inline-cta">View plans and credit costs →</a></section>

        <section id="help" data-doc-section><span class="docs-kicker">HELP</span><h2>Account and support</h2><p>Open the account menu in the lower-left of the app to see your credit balance, manage billing, open settings or reach support. Keep your password private and report an unexpected charge or account issue through Support.</p><div class="docs-callout"><b>Need a hand?</b><p>In the app, open your profile menu and choose <strong>Help &amp; support</strong>. Include the asset name and a screenshot when reporting a generation or export problem.</p></div></section>
      </article>
    </div>
  </main>
  ${footerNoDiscord()}`;

const gallery = [
  "examples/pixel-art-characters/gilded-knight/idle.webp",
  "examples/pixel-art-characters/royal-goblin/attack.webp",
  "examples/tiny-pixel-art/tiny_wiz_walk.webp",
  "examples/pixel-art-characters/warrior-cat/jump.webp",
  "examples/detailed-characters-anime/thumbs/samurai_cat.png",
  "examples/isometric-buildings/castle.webp",
  "examples/inventory-icons/sword.png",
  "examples/spell-icon-set/icons/icon_101.png",
];

const editorFeature = () => `
    <section class="editor-feature wrap" id="pixel-editor">
      <div class="editor-feature-copy">
        <div class="eyebrow">FOR ARTISTS, BY ARTISTS</div>
        <h2>Keep the spark.<br /><span>Shape every detail.</span></h2>
        <p class="lede">Generation gives you momentum. SpriteForge gives you the space to make the result unmistakably yours — from a single pixel to the rhythm of a full animation.</p>
        <p class="editor-feature-note">Open the SpriteForge Editor to refine silhouettes, adjust palettes, compare frames and make the small choices that turn a useful sprite into a signature one.</p>
        <div class="editor-feature-actions"><a class="hero-primary" href="/app" data-route="/app">Open the editor <b>→</b></a><a class="text-link" href="/docs#library" data-route="/docs">See the workflow <b>→</b></a></div>
        <div class="editor-feature-points"><span><b>01</b> Pixel-level control</span><span><b>02</b> Frame-by-frame animation</span><span><b>03</b> Your style, preserved</span></div>
      </div>
      <figure class="editor-feature-shot"><div class="editor-shot-glow"></div><img src="${asset("showcase/editor/animation-editor.png")}" alt="SpriteForge animation editor showing frame-by-frame pixel art editing" loading="lazy" /><figcaption><span>SPRITEFORGE EDITOR</span><b>Reference, edit, repeat.</b></figcaption></figure>
    </section>`;

const home = () => `
  ${nav()}
  <main class="marketing-home">
    <section class="marketing-hero">
      <div class="hero-glow"></div><div class="hero-grid"></div>
      <div class="marketing-hero-inner">
        <div class="eyebrow">AI GAME ART · BUILT FOR INDIE TEAMS</div>
        <h1>Forge a game world<br /><em>players remember.</em></h1>
        <p class="hero-copy">Create characters, props, tilesets and animations in one consistent pixel-art workspace. Describe what you need, then ship a clean, game-ready asset.</p>
        <form class="hero-character-cta" id="hero-character-form"><label for="hero-character-brief">What character should we forge first?</label><div><span class="hero-prompt-icon" aria-hidden="true">✦</span><input id="hero-character-brief" name="brief" maxlength="700" placeholder="A moonlit ranger with a teal cloak and brass goggles" autocomplete="off" required /><button type="submit">Create</button></div></form><div class="hero-animation-cta"><span>Or animate your own</span><label for="hero-animation-file">↑ Upload an image</label><input id="hero-animation-file" type="file" accept="image/png,image/jpeg,image/webp" hidden /><p id="hero-animation-error" role="alert" hidden></p></div><div class="hero-actions"><a class="hero-text-cta" href="/pricing" data-route="/pricing">View plans <b>→</b></a></div>
        <div class="trust-row"><span>✦ 40 free credits</span><span>▦ Grid-aware output</span><span>◈ Private library</span><span>✓ No card required</span></div>
      </div>
      <div class="hero-art" aria-label="SpriteForge pixel art examples"><div class="hero-art-card hero-art-main"><img src="${asset("examples/pixel-art-characters/gilded-knight/idle.webp")}" alt="Generated pixel art knight"/><span>Character · ready to ship</span></div><div class="hero-art-card hero-art-small"><img src="${asset("showcase/pack/tree.png")}" alt="Pixel art tree asset"/><span>Asset · 24 colors</span></div><div class="hero-art-card hero-art-tiny"><img src="${asset("examples/tiny-pixel-art/tiny_owl_idle.webp")}" alt="Pixel art owl"/><span>Theme · consistent</span></div></div>
    </section>
    <section class="proof-bar"><div class="wrap proof-inner"><span class="proof-label">A focused workflow for game makers</span><span>Characters</span><span>Props &amp; UI</span><span>Tilesets</span><span>Animation</span><span>Export-ready PNGs</span></div></section>
    <section class="benefit-section wrap" id="how-it-works"><div class="eyebrow">FROM IDEA TO PLAYABLE ASSET</div><h2>Everything you need to<br /><span>build a visual language.</span></h2><p class="lede">SpriteForge turns rough ideas into a repeatable art workflow—so every asset feels like it belongs in the same game.</p>
      <div class="benefit-grid"><article><div class="benefit-icon">✦</div><h3>Generate with direction</h3><p>Choose a perspective, pixel scale, tags and theme before you generate. Better inputs, more useful outputs.</p><a href="/character-creator" data-route="/character-creator">Create a character <b>→</b></a></article><article><div class="benefit-icon">▦</div><h3>Keep every pixel clean</h3><p>Transparent backgrounds, grid snapping and palette controls turn AI output into assets your engine can actually use.</p><a href="/pixel-grid-detector" data-route="/pixel-grid-detector">Try the free detector <b>→</b></a></article><article><div class="benefit-icon">◈</div><h3>Stay consistent as you scale</h3><p>Save themes and references once. Reuse the same visual direction across heroes, enemies, environments and UI.</p><a href="/pricing" data-route="/pricing">See plans <b>→</b></a></article></div>
    </section>
    <section class="workflow-v2 wrap"><div class="workflow-copy"><div class="eyebrow">A SIMPLE LOOP</div><h2>Describe.<br />Direct.<br /><span>Ship.</span></h2><p>Start with a clear brief. Refine the direction with a theme. Download the result from your private library and keep building.</p><a class="text-link" href="/docs" data-route="/docs">Read the workflow guide <b>→</b></a></div><div class="workflow-steps"><div><strong>01</strong><b>Describe</b><span>Tell us what to make</span></div><div><strong>02</strong><b>Direct</b><span>Lock style and scale</span></div><div><strong>03</strong><b>Ship</b><span>Export your game asset</span></div><div class="workflow-preview"><img src="${asset("showcase/pack-styles-sliced/originalpixel/chest_closed.png")}" alt="Pixel art treasure chest"/><span>Transparent PNG · ready</span></div></div></section>
    ${editorFeature()}
    <section class="showcase-v2"><div class="wrap"><div class="eyebrow">MADE FOR REAL GAME PROJECTS</div><h2>One workspace.<br /><span>Every kind of sprite.</span></h2><div class="feature-grid-v2"><article><small>CHARACTER CREATOR</small><h3>Make heroes that<br />belong together.</h3><p>Generate readable silhouettes, poses and expressions with a consistent point of view.</p><img src="${asset("examples/pixel-art-characters/gilded-knight/idle.webp")}" alt="Pixel art character sprite"/><a href="/character-creator" data-route="/character-creator">Explore characters <b>→</b></a></article><article><small>ASSET GENERATOR</small><h3>Fill your world<br />with detail.</h3><p>Props, buildings, icons and scenery with clear composition rules.</p><div class="mini-assets"><img src="${asset("showcase/pack/tree.png")}" alt="tree"/><img src="${asset("showcase/pack/bushes.png")}" alt="bushes"/><img src="${asset("showcase/pack-styles-sliced/originalpixel/torch.png")}" alt="torch"/></div><a href="/asset-generator" data-route="/asset-generator">Browse asset tools <b>→</b></a></article><article><small>ANIMATION</small><h3>Bring sprites<br />to life.</h3><p>Build readable loops and export animation formats for your engine.</p><img class="animation-art-v2" src="${asset("showcase/animator/blacksmith.webp")}" alt="Animated blacksmith sprite"/><a href="/app" data-route="/app">Open the workspace <b>→</b></a></article></div></div></section>
    <section class="gallery-v2 wrap"><div class="eyebrow">A LOOK AT THE WORKFLOW</div><h2>From first idea to final pixel.</h2><div class="gallery">${gallery.map((x, i) => `<div><img src="${asset(x)}" alt="SpriteForge pixel art example ${i + 1}" /></div>`).join("")}</div></section>
    <section class="theme-v2 wrap"><div><div class="eyebrow">PERSISTENT THEMES</div><h2>Set the tone once.<br /><span>Keep it everywhere.</span></h2><p class="lede">Create a reusable visual direction with tags, pixel scale and optional references. Your project stays recognisable even as the asset list grows.</p><a href="/docs#themes" data-route="/docs" class="text-link">Learn about themes <b>→</b></a></div><div class="theme-card-v2"><div class="theme-card-top"><i></i><i></i><i></i><span>ACTIVE THEME · V1</span></div><strong>Twilight workshop</strong><p>Warm cast iron, moonlit steel and crisp medium-scale pixels.</p><div><b>cozy</b><b>rpg</b><b>mystical</b></div><img src="${asset("examples/tiny-pixel-art/tiny_owl_idle.webp")}" alt="Theme preview owl"/></div></section>
    <section class="faq-v2 wrap"><div class="eyebrow">QUESTIONS, ANSWERED</div><h2>Ready when you are.</h2><details><summary>Do I need to be an artist? <b>+</b></summary><p>No. Choose a tool, describe the result in plain language and use the guided controls to set perspective, scale and style.</p></details><details><summary>Can I use the assets in my game? <b>+</b></summary><p>Your generated assets are saved to your private library for use in your projects, subject to our terms and your responsibility for uploaded references.</p></details><details><summary>What happens to my prompts and assets? <b>+</b></summary><p>Your workspace and library are private to your account. We only send the data needed to fulfil a generation request to the selected provider.</p></details></section>
  </main>${footerNoDiscord()}`;

const pixelDetector = () => `
  ${nav()}<main class="tool-page"><section class="tool-heading"><h1>Pixel Grid Detector</h1><p>Someone upscaled your pixel art and now it's 4x too big with blurry edges? Drop it here. We'll figure out the real resolution and give you a clean version back.</p></section>
  <section class="detector-window" id="grid-tool"><header><i></i><i></i><i></i><span id="grid-file-label">▦ &nbsp; Pixel grid detector</span></header><div class="dropzone" id="grid-dropzone"><div class="upload-mark">↥</div><h2>Drop an image here</h2><p>PNG, JPG, or WebP. Best results with nearest-neighbor upscaled sprites.</p><button id="grid-choose" type="button">⇧ &nbsp; Choose Image</button><input id="grid-file" type="file" accept="image/png,image/jpeg,image/webp" hidden /></div><div class="grid-status" id="grid-status" hidden></div><div class="grid-result" id="grid-result" hidden><div class="grid-success"><div><b id="grid-title">Detected pixel art</b><small id="grid-details"></small></div><button id="grid-reset" class="chip" type="button">Try another</button></div><div class="grid-compare"><figure><figcaption>Original</figcaption><canvas id="grid-original"></canvas></figure><figure><figcaption>Snapped</figcaption><canvas id="grid-output"></canvas></figure></div><div class="grid-controls"><span>Colors</span><div>${["Original", 8, 16, 24, 32, 48, 64, 128, 256].map((count) => `<button class="chip grid-palette${count === "Original" ? " active" : ""}" data-colors="${count === "Original" ? "original" : count}" type="button">${count}</button>`).join("")}</div></div><div class="grid-controls"><span>Grid</span><div>${["Auto", 8, 16, 24, 32, 48, 64, 128, 256].map((size) => `<button class="chip grid-size${size === "Auto" ? " active" : ""}" data-grid-size="${size === "Auto" ? "auto" : size}" type="button">${size === "Auto" ? "Auto" : `${size}×${size}`}</button>`).join("")}</div></div><div class="grid-actions"><span>Processed locally in your browser</span><button id="grid-download" type="button">Download PNG</button></div></div></section>
  <section class="before-after"><div><img src="${asset("pixelsnapper/before.png")}"/><p>Upscaled 4x, blurry</p></div><div><img src="${asset("pixelsnapper/after.png")}"/><p>Snapped back to true resolution</p></div></section>
  <section class="faq"><h2>Frequently asked questions</h2>${["Why does AI pixel art look blurry?", "What does the pixel grid detector do?", "What images work best?"].map((q) => `<details><summary>${q}<b>+</b></summary><p>Pixel artwork often arrives scaled or softened. This visual prototype will later include the local processing workflow.</p></details>`).join("")}</section></main>${footerNoDiscord()}`;

const tileset = () => `
  ${nav()}<main class="tool-page"><section class="tool-heading"><span>Free tool</span><h1>Tileset Base Generator</h1><p>Create a clean, game-ready starting grid for your next tileset. Upload an image and shape it into a consistent tile base.</p></section>
  <section class="detector-window tiles"><header><i></i><i></i><i></i><span>▦ &nbsp; Tileset base generator</span></header><div class="dropzone"><div class="tile-icon">▦</div><h2>Start with a reference image</h2><p>PNG, JPG, or WebP. Build clean tiles from a visual direction.</p><button>⇧ &nbsp; Choose Image</button></div></section>
  <section class="asset-strip wrap">${["pack-styles-sliced/originalpixel/shield.png","pack-styles-sliced/originalpixel/chest_closed.png","pack-styles-sliced/originalpixel/barrel.png","pack-styles-sliced/originalpixel/torch.png","pack-styles-sliced/originalpixel/slime.png"].map((x) => `<img src="${asset(`showcase/${x}`)}" />`).join("")}</section></main>${footerNoDiscord()}`;

function setupGridTool() {
  const input = document.querySelector("#grid-file");
  const choose = document.querySelector("#grid-choose");
  const dropzone = document.querySelector("#grid-dropzone");
  const status = document.querySelector("#grid-status");
  const resultPanel = document.querySelector("#grid-result");
  const originalCanvas = document.querySelector("#grid-original");
  const outputCanvas = document.querySelector("#grid-output");
  const state = { source: null, result: null, colors: null, gridSize: null };
  document.querySelector("#grid-image-modal")?.remove();
  const modal = document.createElement("div");
  modal.id = "grid-image-modal";
  modal.className = "grid-image-modal";
  modal.hidden = true;
  modal.innerHTML = `<div class="grid-modal-backdrop"></div><section class="grid-modal-card" role="dialog" aria-modal="true" aria-label="Image preview"><button id="grid-modal-close" type="button" aria-label="Close preview">×</button><div class="grid-modal-image"><canvas id="grid-modal-canvas"></canvas></div><p>Press ESC to close</p></section>`;
  document.body.append(modal);
  const modalCanvas = modal.querySelector("#grid-modal-canvas");
  const closeModal = () => { modal.hidden = true; };
  const openModal = (imageData, title, pixelated) => {
    canvasFromData(modalCanvas, imageData);
    const scale = Math.min((window.innerWidth * 0.88) / imageData.width, (window.innerHeight * 0.82) / imageData.height);
    modalCanvas.style.width = `${Math.max(imageData.width, Math.floor(imageData.width * scale))}px`;
    modalCanvas.style.height = `${Math.max(imageData.height, Math.floor(imageData.height * scale))}px`;
    modalCanvas.classList.toggle("pixelated-preview", pixelated);
    modal.hidden = false;
    modal.querySelector("#grid-modal-close").focus();
  };
  modal.querySelector(".grid-modal-image").addEventListener("click", (event) => { if (event.target !== modalCanvas) closeModal(); });

  const canvasFromData = (canvas, imageData) => {
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext("2d").putImageData(imageData, 0, 0);
  };
  const setStatus = (message, kind = "") => {
    status.hidden = !message;
    status.className = `grid-status ${kind}`;
    status.textContent = message;
  };
  const currentSnapped = () => {
    if (state.gridSize == null) return state.result.snapped;
    const shortestSide = Math.min(state.source.width, state.source.height);
    const cellSize = shortestSide / state.gridSize;
    const width = Math.max(1, Math.round(state.source.width / cellSize));
    const height = Math.max(1, Math.round(state.source.height / cellSize));
    return snapToGrid(state.source, { fractional: true, scaleX: state.source.width / width, scaleY: state.source.height / height, detectedWidth: width, detectedHeight: height, blockSize: cellSize, offsetX: 0, offsetY: 0 });
  };
  const showResult = () => {
    const snapped = currentSnapped();
    const output = state.colors == null ? snapped : quantizePalette(snapped, state.colors);
    canvasFromData(originalCanvas, state.source);
    canvasFromData(outputCanvas, output);
    originalCanvas.onclick = () => openModal(state.source, "Original image", false);
    outputCanvas.onclick = () => openModal(output, "Snapped pixel art", true);
    const { detection } = state.result;
    const gridLabel = state.gridSize == null ? "Detected" : "Forced grid";
    document.querySelector("#grid-title").textContent = `${gridLabel}: ${snapped.width}×${snapped.height} pixel artwork`;
    document.querySelector("#grid-details").textContent = `${state.source.width}×${state.source.height} → ${snapped.width}×${snapped.height} · Scale factor: ${(state.source.width / snapped.width).toFixed(2)}×`;
    document.querySelector("#grid-file-label").textContent = `▦  ${state.fileName}`;
    document.querySelectorAll(".grid-palette").forEach((button) => button.classList.toggle("active", button.dataset.colors === (state.colors == null ? "original" : String(state.colors))));
    document.querySelectorAll(".grid-size").forEach((button) => button.classList.toggle("active", button.dataset.gridSize === (state.gridSize == null ? "auto" : String(state.gridSize))));
    resultPanel.hidden = false;
    dropzone.hidden = true;
  };
  const processFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    state.fileName = file.name;
    setStatus("Looking for the grid…");
    dropzone.hidden = true;
    resultPanel.hidden = true;
    try {
      const url = URL.createObjectURL(file);
      const image = await new Promise((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = url; });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      state.source = context.getImageData(0, 0, canvas.width, canvas.height);
      await new Promise((resolve) => setTimeout(resolve, 20));
      state.result = processPixelGrid(state.source);
      if (!state.result.ok) { setStatus("Couldn't find a reliable pixel grid. Try a cleanly upscaled sprite.", "error"); dropzone.hidden = false; return; }
      state.colors = null;
      state.gridSize = null;
      setStatus("");
      showResult();
    } catch (error) { console.error(error); setStatus("This image could not be processed.", "error"); dropzone.hidden = false; }
  };
  choose.addEventListener("click", () => input.click());
  input.addEventListener("change", () => processFile(input.files[0]));
  ["dragenter", "dragover"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach((eventName) => dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove("dragging"); }));
  dropzone.addEventListener("drop", (event) => processFile(event.dataTransfer.files[0]));
  document.querySelector("#grid-reset").addEventListener("click", () => { state.source = null; state.result = null; state.gridSize = null; input.value = ""; resultPanel.hidden = true; dropzone.hidden = false; document.querySelector("#grid-file-label").textContent = "▦  Pixel grid detector"; });
  document.querySelectorAll(".grid-palette").forEach((button) => button.addEventListener("click", () => { state.colors = button.dataset.colors === "original" ? null : Number(button.dataset.colors); showResult(); }));
  document.querySelectorAll(".grid-size").forEach((button) => button.addEventListener("click", () => { state.gridSize = button.dataset.gridSize === "auto" ? null : Number(button.dataset.gridSize); showResult(); }));
  document.querySelector("#grid-download").addEventListener("click", () => outputCanvas.toBlob((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `pixelated_${outputCanvas.width}x${outputCanvas.height}.png`; link.click(); URL.revokeObjectURL(url); }, "image/png"));
  modal.querySelector("#grid-modal-close").addEventListener("click", closeModal);
  modal.querySelector(".grid-modal-backdrop").addEventListener("click", closeModal);
  modal.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
}

function openMarketingAuth(mode = "login") {
  document.querySelector(".marketing-auth-overlay")?.remove();
  const register = mode === "register";
  const overlay = document.createElement("div");
  overlay.className = "marketing-auth-overlay";
  overlay.innerHTML = `<section class="marketing-auth-dialog" role="dialog" aria-modal="true" aria-label="${register ? "Create account" : "Sign in"}"><button class="marketing-auth-close" type="button" aria-label="Close">×</button><span class="marketing-auth-kicker">SPRITEFORGE ACCOUNT</span><h2>${register ? "Create your workspace" : "Welcome back"}</h2><p>${register ? "Verify your email to activate your 40 free Forge credits." : "Sign in to access your private SpriteForge workspace."}</p><form><label>Email<input type="email" name="email" autocomplete="email" maxlength="254" required /></label><label>Password<input type="password" name="password" autocomplete="${register ? "new-password" : "current-password"}" minlength="12" maxlength="128" required /></label>${register ? `<label>Confirm password<input type="password" name="confirmPassword" autocomplete="new-password" minlength="12" maxlength="128" required /></label><input class="marketing-auth-honeypot" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />` : ""}<p class="marketing-auth-error" role="alert" hidden></p><button class="marketing-auth-submit" type="submit">${register ? "Create secure account" : "Sign in"} →</button><div class="marketing-auth-or"><span>OR</span></div><a class="marketing-google-auth" href="/api/auth/google" aria-label="Continue with Google"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.8 12.23c0-.71-.06-1.4-.19-2.05H12v3.88h5.49a4.7 4.7 0 0 1-2.03 3.08v2.52h3.27c1.91-1.76 3.07-4.35 3.07-7.43Z"/><path fill="#34A853" d="M12 22c2.75 0 5.06-.91 6.73-2.34l-3.27-2.52c-.91.61-2.07.97-3.46.97-2.66 0-4.91-1.8-5.72-4.22H2.9v2.6A10.16 10.16 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.28 13.89A6.1 6.1 0 0 1 5.96 12c0-.66.11-1.3.32-1.89v-2.6H2.9A10.02 10.02 0 0 0 1.84 12c0 1.61.39 3.14 1.06 4.49l3.38-2.6Z"/><path fill="#EA4335" d="M12 5.89c1.5 0 2.85.52 3.91 1.53l2.94-2.94C17.05 2.8 14.75 2 12 2a10.16 10.16 0 0 0-9.1 5.51l3.38 2.6C7.09 7.69 9.34 5.89 12 5.89Z"/></svg><span>Continue with Google</span></a><button class="marketing-auth-switch" type="button">${register ? "Already have an account? Sign in" : "New to SpriteForge? Create an account"}</button></form></section>`;
  const close = () => overlay.remove();
  if (!register) {
    const forgot = document.createElement("button"); forgot.type = "button"; forgot.className = "marketing-auth-forgot"; forgot.textContent = "Forgot your password?";
    forgot.addEventListener("click", () => { close(); history.pushState({}, "", "/reset-password"); render(); });
    overlay.querySelector("form")?.insertBefore(forgot, overlay.querySelector(".marketing-auth-error"));
  }
  overlay.querySelector(".marketing-auth-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.querySelector(".marketing-auth-switch").addEventListener("click", () => { close(); openMarketingAuth(register ? "login" : "register"); });
  overlay.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const error = form.querySelector(".marketing-auth-error"); const submit = form.querySelector("button[type=submit]");
    if (register && values.password !== values.confirmPassword) { error.hidden = false; error.textContent = "Passwords do not match."; return; }
    submit.disabled = true; submit.textContent = "Please wait…";
    try {
      const response = await fetch(`/api/auth/${register ? "register" : "login"}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: values.email, password: values.password, website: values.website || "" }) }); const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Authentication failed.");
      if (payload.user) { window.location.assign("/app"); return; }
      form.innerHTML = `<div class="marketing-auth-confirmed"><span class="marketing-auth-confirmed-icon" aria-hidden="true">✉</span><div><span class="marketing-auth-kicker">NEXT STEP</span><b>Check your inbox</b><p>We sent a secure verification link to <strong>${String(values.email).replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]))}</strong>. Click it to activate your account and receive your 40 free Forge credits.</p><small>It can take a minute. Check Spam or Promotions if it is not there.</small></div></div>`;
    } catch (errorValue) { error.hidden = false; error.textContent = errorValue.message || "Authentication failed."; submit.disabled = false; submit.textContent = register ? "Create account →" : "Sign in →"; }
  });
  document.body.append(overlay);
  if (register) overlay.querySelector(".marketing-auth-submit").textContent = "Create account →";
  overlay.querySelector("input[type=email]")?.focus();
}

function passwordResetMarkup() {
  return `<main class="verification-page"><section class="verification-card password-reset-card"><img src="/assets/spriteforge-logo.png" alt="SpriteForge" /><span class="eyebrow">SPRITEFORGE ACCOUNT</span><span class="verification-orb" aria-hidden="true">✦</span><h1>Choose a new password</h1><p>Use at least 12 characters. Your other sessions will be signed out for safety.</p><form id="password-reset-form"><label>New password<input type="password" name="password" minlength="12" maxlength="128" autocomplete="new-password" required /></label><label>Confirm password<input type="password" name="confirmPassword" minlength="12" maxlength="128" autocomplete="new-password" required /></label><p id="password-reset-error" role="alert" hidden></p><button class="verification-cta" type="submit">Update password <b>→</b></button></form><a class="verification-secondary" href="/" data-route="/">Back to SpriteForge</a></section></main>`;
}

function setupPasswordReset() {
  const form = document.querySelector("#password-reset-form"); if (!form) return;
  const token = new URLSearchParams(window.location.search).get("token") || "";
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(form)); const error = document.querySelector("#password-reset-error"); const submit = form.querySelector("button[type=submit]");
    if (values.password !== values.confirmPassword) { error.hidden = false; error.textContent = "Passwords do not match."; return; }
    submit.disabled = true; submit.textContent = "Updating…";
    try { const response = await fetch("/api/auth/password-reset/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: values.password }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Password reset failed"); form.innerHTML = `<p class="verification-success">Your password was updated. You can now sign in securely.</p><a class="verification-cta" href="/" data-route="/">Return to SpriteForge <b>→</b></a>`; }
    catch (errorValue) { error.hidden = false; error.textContent = errorValue.message || "Password reset failed."; submit.disabled = false; submit.textContent = "Update password →"; }
  });
}

async function openAppOrAuth(mode = "login") {
  try { const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }); const state = await response.json(); if (state?.user) { window.location.assign("/app"); return; } } catch { /* Show the sign-in dialog below. */ }
  openMarketingAuth(mode);
}

async function openCharacterFunnelThemePicker() {
  try {
    const response = await fetch("/api/library", { credentials: "same-origin", cache: "no-store" });
    if (response.status === 401 || response.status === 403) {
      openMarketingAuth("login");
      return;
    }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load your themes.");
    characterFunnelThemes = Array.isArray(payload.themes) ? payload.themes : [];
  } catch (error) {
    window.alert(error.message || "Could not load your themes.");
    return;
  }

  const activeThemeId = characterFunnelTheme?.id || "";
  const overlay = document.createElement("div");
  overlay.className = "studio-overlay";
  overlay.innerHTML = `<section class="studio-dialog studio-theme-picker-dialog" role="dialog" aria-modal="true" aria-label="Your themes"><header><div><span class="studio-kicker">YOUR THEMES</span><h2>Choose a visual direction</h2><p>Select the theme this generator should use.</p></div><div class="studio-theme-picker-actions">${activeThemeId ? `<button class="studio-theme-picker-clear" type="button">Remove theme</button>` : ""}<button data-modal-close type="button">×</button></div></header><div class="studio-theme-picker-list">${characterFunnelThemes.length ? characterFunnelThemes.map((theme) => `<button data-picker-theme="${escapeHtml(theme.id)}" class="${theme.id === activeThemeId ? "active" : ""}" type="button"><span><b>${escapeHtml(theme.name)}</b><small>${escapeHtml(theme.direction || "No direction yet.")}</small><em>${escapeHtml(Array.isArray(theme.styleTags) && theme.styleTags.length ? theme.styleTags.join(" · ") : "No tags")}</em></span>${theme.isDefault ? "<mark>Default</mark>" : ""}<i>→</i></button>`).join("") : `<div class="studio-theme-picker-empty"><b>No themes yet</b><span>Create a theme in your workspace first, then return here to reuse its visual direction.</span></div>`}</div></section>`;
  const close = () => overlay.remove();
  overlay.querySelector("[data-modal-close]")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  overlay.querySelectorAll("[data-picker-theme]").forEach((button) => button.addEventListener("click", () => {
    characterFunnelTheme = characterFunnelThemes.find((theme) => theme.id === button.dataset.pickerTheme) || null;
    close();
    render();
  }));
  overlay.querySelector(".studio-theme-picker-clear")?.addEventListener("click", () => {
    characterFunnelTheme = null;
    close();
    render();
  });
  document.body.append(overlay);
  overlay.querySelector("[data-picker-theme].active")?.focus();
}

function continuePendingCharacter() {
  const brief = localStorage.getItem("spriteforge_pending_character_brief");
  if (!brief) return false;
  localStorage.removeItem("spriteforge_pending_character_brief");
  window.location.assign(`/character-creator?brief=${encodeURIComponent(brief)}`);
  return true;
}

const pendingAnimationUploadId = "animation-source";
const pendingAnimationUploads = () => new Promise((resolve, reject) => {
  if (!window.indexedDB) { reject(new Error("Your browser cannot keep the image while signing in.")); return; }
  const request = window.indexedDB.open("spriteforge-pending", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("uploads", { keyPath: "id" });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error("Could not prepare the upload."));
});
const savePendingAnimationUpload = async (file) => {
  const database = await pendingAnimationUploads();
  await new Promise((resolve, reject) => { const transaction = database.transaction("uploads", "readwrite"); transaction.objectStore("uploads").put({ id: pendingAnimationUploadId, name: file.name, type: file.type, blob: file }); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error || new Error("Could not keep the image.")); });
  database.close();
};
const readPendingAnimationUpload = async () => {
  const database = await pendingAnimationUploads();
  const value = await new Promise((resolve, reject) => { const request = database.transaction("uploads", "readonly").objectStore("uploads").get(pendingAnimationUploadId); request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error || new Error("Could not read the pending image.")); });
  database.close(); return value;
};
const clearPendingAnimationUpload = async () => {
  const database = await pendingAnimationUploads();
  await new Promise((resolve, reject) => { const transaction = database.transaction("uploads", "readwrite"); transaction.objectStore("uploads").delete(pendingAnimationUploadId); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error || new Error("Could not clear the pending image.")); });
  database.close();
};
const pixelateAnimationSource = async (file) => {
  const bitmap = await createImageBitmap(file);
  const maximum = 512;
  const factor = Math.min(1, maximum / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * factor)); const height = Math.max(1, Math.round(bitmap.height * factor));
  const source = document.createElement("canvas"); source.width = width; source.height = height;
  const sourceContext = source.getContext("2d", { willReadFrequently: true }); sourceContext.imageSmoothingEnabled = true; sourceContext.drawImage(bitmap, 0, 0, width, height); bitmap.close?.();
  const sourceData = sourceContext.getImageData(0, 0, width, height); const snapped = processPixelGrid(sourceData, { colors: 32, minimumConfidence: 0.04 });
  let output = snapped.ok ? snapped.output : null;
  if (!output) { const longest = Math.max(width, height); const scale = Math.min(1, 96 / longest); const pixelWidth = Math.max(1, Math.round(width * scale)); const pixelHeight = Math.max(1, Math.round(height * scale)); const reduced = document.createElement("canvas"); reduced.width = pixelWidth; reduced.height = pixelHeight; const reducedContext = reduced.getContext("2d", { willReadFrequently: true }); reducedContext.imageSmoothingEnabled = true; reducedContext.drawImage(source, 0, 0, pixelWidth, pixelHeight); output = quantizePalette(reducedContext.getImageData(0, 0, pixelWidth, pixelHeight), 32, 0); }
  const result = document.createElement("canvas"); result.width = output.width; result.height = output.height; result.getContext("2d").putImageData(output, 0, 0);
  const blob = await new Promise((resolve) => result.toBlob(resolve, "image/png")); if (!blob) throw new Error("The image could not be converted to pixel art."); return blob;
};
const continuePendingAnimationUpload = async () => {
  let pending;
  try { pending = await readPendingAnimationUpload(); } catch { return false; }
  if (!pending?.blob) return false;
  try {
    const pixelArt = await pixelateAnimationSource(pending.blob); const name = pending.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim().slice(0, 160) || "Imported animation source";
    const csrf = document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith("spriteforge_csrf="))?.slice("spriteforge_csrf=".length) || "";
    const response = await fetch("/api/editor/uploads", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "image/png", "X-CSRF-Token": csrf, "X-Asset-Name": encodeURIComponent(name), "X-Asset-Kind": "prop", "X-SpriteForge-Pixel-Art": "1" }, body: pixelArt }); const payload = await response.json();
    if (!response.ok || !payload.asset?.id) throw new Error(payload.error || "The image could not be added to your library.");
    await clearPendingAnimationUpload(); window.location.assign(`/app?view=animation&animate=${encodeURIComponent(payload.asset.id)}`); return true;
  } catch (error) { try { await clearPendingAnimationUpload(); } catch {} localStorage.setItem("spriteforge_pending_animation_error", error.message || "The image could not be added."); return false; }
};

function render() {
  const path = window.location.pathname;
  if (window.__spriteforgeXPageViewPath !== path) {
    window.spriteforgeTrackX?.("PageView", {});
    window.spriteforgeTrackPageView?.(path);
    if (path === "/pricing") window.spriteforgeTrackPricing?.(path);
    window.__spriteforgeXPageViewPath = path;
  }
  if (path === "/reset-password") { document.querySelector("#app").innerHTML = passwordResetMarkup(); setupPasswordReset(); return; }
  if (path === "/app") {
    const root = document.querySelector("#app"); root.innerHTML = `<main class="app-route-loading" aria-live="polite">Checking your secure workspace…</main>`;
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }).then((response) => response.json()).then(async (state) => { if (state?.user) { const query = new URLSearchParams(window.location.search); if (query.get("signup") === "completed") { window.spriteforgeTrackX?.("SignUp", { status: "completed", conversion_id: query.get("signup_id") || undefined }); query.delete("auth"); query.delete("signup"); query.delete("signup_id"); history.replaceState({}, "", `/app${query.toString() ? `?${query}` : ""}`); } if (continuePendingCharacter()) return; if (await continuePendingAnimationUpload()) return; root.innerHTML = appStudioMarkup(); setupAppStudio({ initialAssetId: query.get("asset") || "", initialAnimationAssetId: query.get("animate") || "", initialEditorAssetId: query.get("edit") || "" }); return; } history.replaceState({}, "", "/"); render(); openMarketingAuth("login"); }).catch(() => { history.replaceState({}, "", "/"); render(); openMarketingAuth("login"); });
    return;
  }
  document.querySelector("#app").innerHTML = legalRoutes[path]?.() || (path === "/pricing" ? pricing() : path === "/docs" ? docs() : path === "/verify-email" ? `<main class="verification-page"><section class="verification-card"><img src="/assets/spriteforge-logo.png" alt="SpriteForge" /><span class="eyebrow">SPRITEFORGE ACCOUNT</span><span class="verification-orb" aria-hidden="true">✦</span><h1>Email verification</h1><p id="verify-email-status" data-state="loading">Verifying your email securely…</p><a class="verification-cta" href="/app" data-route="/app">Open workspace <b>→</b></a><small>Secure verification · Credits are granted once only.</small></section></main>` : path === "/app" ? appStudioMarkup() : path === "/pixel-grid-detector" ? pixelDetector() : path === "/tileset-base-generator" ? tileset() : path === "/character-creator" ? `${nav()}${characterCreatorMarkup({ theme: characterFunnelTheme, themes: characterFunnelThemes })}` : path === "/asset-generator" ? `${nav()}${assetGeneratorMarkup()}${footerNoDiscord()}` : home());
  document.querySelectorAll("[data-route]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); const href = link.getAttribute("href"); if (href === "/app") { openAppOrAuth("login"); return; } history.pushState({}, "", href); render(); window.scrollTo(0, 0); }));
  document.querySelectorAll(".footer-cta button").forEach((button) => button.addEventListener("click", () => openMarketingAuth("register")));
  document.querySelector("#hero-character-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const brief = document.querySelector("#hero-character-brief")?.value.trim();
    if (!brief) return;
    try {
      const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" });
      const state = await response.json();
      if (state?.user) { window.location.assign(`/character-creator?brief=${encodeURIComponent(brief)}`); return; }
    } catch { /* Authentication dialog is the safe fallback. */ }
    localStorage.setItem("spriteforge_pending_character_brief", brief);
    openMarketingAuth("register");
  });
  document.querySelector("#hero-animation-file")?.addEventListener("change", async (event) => {
    const input = event.currentTarget; const file = input.files?.[0]; const error = document.querySelector("#hero-animation-error"); if (!file) return;
    const validType = /^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!validType || file.size > 10 * 1024 * 1024) { if (error) { error.textContent = "Choose a PNG, JPG or WebP image smaller than 10 MiB."; error.hidden = false; } input.value = ""; return; }
    if (error) error.hidden = true;
    try {
      await savePendingAnimationUpload(file);
      const response = await fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }); const state = await response.json();
      if (state?.user) { window.location.assign("/app"); return; }
    } catch (cause) { if (error) { error.textContent = cause.message || "We could not prepare that image. Please try again."; error.hidden = false; } input.value = ""; return; }
    openMarketingAuth("register");
  });
  document.querySelectorAll("[data-plan-signup]").forEach((button) => button.addEventListener("click", async () => {
    const planId = button.dataset.planSignup;
    window.spriteforgeTrack?.("plan_selected", { path, planId, metadata: { placement: "pricing" } });
    try {
      const authResponse = await fetch("/api/auth/me", { credentials: "same-origin" }); const auth = await authResponse.json();
      if (!auth.user) { openMarketingAuth("register"); return; }
      const csrf = document.cookie.split(";").map((entry) => entry.trim()).find((entry) => entry.startsWith("spriteforge_csrf="))?.slice("spriteforge_csrf=".length) || "";
      button.disabled = true; const original = button.textContent; button.textContent = "Opening secure checkout…";
      const response = await fetch("/api/billing/checkout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ planId }) });
      const payload = await response.json(); if (!response.ok || !payload.url) throw new Error(payload.error || "Checkout is not ready yet");
      window.location.assign(payload.url);
    } catch (error) { button.disabled = false; button.textContent = `Choose ${planId[0].toUpperCase()}${planId.slice(1)} →`; window.alert(error.message || "Checkout could not be started."); }
  }));
  if (path === "/pixel-grid-detector") setupGridTool();
  if (path === "/character-creator") setupCharacterCreator({ theme: characterFunnelTheme, themes: characterFunnelThemes, onThemePicker: openCharacterFunnelThemePicker });
  if (path === "/asset-generator") setupAssetGenerator();
  if (path === "/verify-email") {
    const status = document.querySelector("#verify-email-status"); const token = new URLSearchParams(window.location.search).get("token");
    fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (response) => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Verification failed");
      status.textContent = "Verified — your 40 free Forge credits are ready."; status.dataset.state = "success"; window.spriteforgeTrackX?.("SignUp", { status: "completed", conversion_id: payload.user?.id || undefined }); history.replaceState({}, "", "/verify-email");
    }).catch((error) => { status.textContent = error.message || "This verification link is invalid or has expired."; status.dataset.state = "error"; });
  }
  if (path === "/docs") {
    const search = document.querySelector("#docs-search");
    const sections = [...document.querySelectorAll("[data-doc-section]")];
    const docLinks = [...document.querySelectorAll(".docs-sidebar a[href^='#']")];
    const setActiveDocLink = (id) => docLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${id}`));
    const syncDocsIndex = () => {
      const visibleSections = sections.filter((section) => !section.hidden);
      const current = [...visibleSections].reverse().find((section) => section.getBoundingClientRect().top <= 145) || visibleSections[0];
      if (current) setActiveDocLink(current.id);
    };
    search?.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      sections.forEach((section) => { section.hidden = Boolean(query) && !section.textContent.toLowerCase().includes(query); });
      syncDocsIndex();
    });
    docLinks.forEach((link) => link.addEventListener("click", () => {
      const id = link.getAttribute("href")?.slice(1);
      if (id) setActiveDocLink(id);
      requestAnimationFrame(syncDocsIndex);
    }));
    window.addEventListener("scroll", syncDocsIndex, { passive: true });
    syncDocsIndex();
  }
  const accountButton = document.querySelector(".nav-cta");
  if (accountButton) {
    fetch("/api/auth/me", { credentials: "same-origin", cache: "no-store" }).then((response) => response.json()).then((state) => {
      const signedIn = Boolean(state?.user);
      accountButton.classList.toggle("nav-account", signedIn);
      accountButton.innerHTML = signedIn ? `Open workspace <span>→</span>` : `Get started <span>→</span>`;
      accountButton.onclick = () => { if (signedIn) window.location.assign("/app"); else openMarketingAuth("register"); };
    }).catch(() => { accountButton.onclick = () => openMarketingAuth("register"); });
  }
}
window.addEventListener("popstate", render);
render();
