// Contract for the deterministic stage after a provider returns an image.
// The actual pixel operations will reuse/extend the existing browser grid core.
export const NORMALIZATION_STEPS = Object.freeze([
  "decode-png",
  "remove-chroma-key-background",
  "find-non-background-bounds",
  "expand-safe-padding",
  "align-pivot",
  "snap-to-target-grid-nearest-neighbor",
  "quantize-palette",
  "validate-canvas-and-alpha",
  "export-png-and-metadata",
]);

export function normalizationPlan(recipe) {
  return {
    steps: NORMALIZATION_STEPS,
    background: { color: recipe.background.color, tolerance: 24, feather: 0 },
    target: recipe.target,
    palette: recipe.palette.maxColors,
    pivot: recipe.assetType === "character" || recipe.assetType === "enemy" || recipe.assetType === "npc"
      ? { type: "feet-center" }
      : { type: "center" },
    resize: { algorithm: "nearest-neighbor", antialias: false },
    rejectIf: ["subject-touches-canvas-edge", "background-coverage-below-50-percent", "multiple-large-foreground-components", "inconsistent-pixel-scale-in-accessory"],
  };
}
