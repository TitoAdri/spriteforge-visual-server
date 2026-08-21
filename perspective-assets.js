/* Shared perspective references used by every editor and the theme picker. */
const PERSPECTIVES = Object.freeze({
  "left-3-4": "/assets/showcase/perspectives/side.png",
  isometric: "/assets/showcase/perspectives/isometric.png",
  "top-down": "/assets/showcase/perspectives/top-down.png",
});

function applyPerspectiveReferences() {
  document.querySelectorAll(".perspective-picker [data-view], .theme-view-picker [data-theme-view]").forEach((card) => {
    const key = card.dataset.view || card.dataset.themeView;
    const source = PERSPECTIVES[key];
    const image = card.querySelector("img");
    if (source && image && image.getAttribute("src") !== source) image.src = source;
  });
}

new MutationObserver(applyPerspectiveReferences).observe(document.documentElement, { childList: true, subtree: true });
applyPerspectiveReferences();
