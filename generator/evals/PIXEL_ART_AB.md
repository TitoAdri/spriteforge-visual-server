# Internal pixel-art prompt experiment

This experiment is intentionally disconnected from SpriteForge's public routes and UI. The production V1 prompt remains in `src/prompt-builder.mjs` and is protected by a byte-for-byte regression test.

## Variants

- `v1`: the current production prompt and text-to-image endpoint.
- `v2`: the internal structured prompt with an intended medium-scale grid reference, one shared integer block rhythm, limited-cell detail rules, and palette-wide color-cast exclusions. In this experiment, `target=32x48` means the final grid is `32×48`; the raw model output is preserved.
- `v2-grid`: the same V2 prompt sent through the image-edit endpoint with a neutral checker scaffold. The scaffold assigns one checker cell to each intended logical pixel. This is experimental because GPT Image does not expose ControlNet-style grid conditioning.
- `v3`: a full-canvas grid edit. It chooses the smallest valid GPT Image 2 canvas that maps every requested logical pixel to one equal square block. For `32x48`, the request is `672x1008`, each cell is `21x21`, and the subject has an explicit coarse-detail budget.

The extra text-only V2 arm is useful even when the headline comparison is V1 versus V2-grid: it reveals whether an improvement came from the prompt or from the image scaffold.

## Prepare a comparison without provider calls

```powershell
node generator/evals/run-pixel-art-ab.mjs `
  "--subject=A moonlit ranger with a teal cloak and brass goggles" `
  --target=64x96 `
  --maxColors=32
```

This is a dry run by default. It writes the exact prompts, the optional scaffold and a manifest under `generator/evals/results/pixel-art-ab/`.

## Generate paid samples

Add `--execute=true` only after a comparison is explicitly requested. Keep the subject, target, palette, tier, model and all other recipe fields identical across variants.

```powershell
node generator/evals/run-pixel-art-ab.mjs `
  "--subject=A moonlit ranger with a teal cloak and brass goggles" `
  --target=64x96 `
  --maxColors=32 `
  --execute=true
```

The runner writes the raw model output. V1 and V2 use the existing 1024px square plan; V3 uses its exact full-grid canvas. It does not manufacture a lower-resolution image. The detector/normalizer is responsible for inferring the actual returned grid and making only the smallest cleanup correction needed.

Review each output for:

1. palette-wide yellow/ochre/sepia cast;
2. adherence to one exact logical grid, without mixed pixel sizes or sub-grid marks;
3. silhouette readability at native target resolution;
4. prompt fidelity and subject quality.

Do not promote V2 to public traffic from this runner. A production rollout should happen only after repeated blind comparisons across subjects with and without naturally warm materials.
