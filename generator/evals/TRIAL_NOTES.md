# Trial notes

## Trial 01 — 29 July 2026

Scope: minimum-cost technical smoke test using `char-01` (anchor) and `pose-01` (derived walk contact), both on the `draft` tier. Images and non-secret request metadata are in `results/2026-07-29T14-20-50-662Z/`.

| Provider | Anchor | Derived pose | Result |
| --- | --- | --- | --- |
| GPT Image 2 | Completed (~23.4 s) | Completed (~25.0 s) | API integration and anchor-to-pose editing work. The identity, outfit and lantern are preserved well enough for a first candidate. It still needs deterministic background removal, snap, palette reduction and a human style review. |
| Nano Banana 2 | Initially blocked before generation | Not run (no anchor) | The API-key restriction was subsequently resolved. The first accepted request exposed an adapter mismatch: the Interactions endpoint rejected `image/png` for `response_format.mime_type` and accepted JPEG. The adapter now requests JPEG and converts it to PNG in the deterministic normalization stage. |

### Next actions

1. Run the exact same two-asset smoke test with Nano Banana 2 after the JPEG correction.
3. Review the four outputs blind using `RUBRIC.md`. Decide whether the visual direction of the GPT anchor is suitable before paying for the 40-brief A/B run.
4. Run an actual normalization preview (chroma key -> grid -> palette) for the selected anchor before expanding the test set.

## Trial 02 — 29 July 2026

Scope: Nano Banana 2 repeat of `char-01` and `pose-01`, draft tier, after correcting response parsing and JPEG output.

| Provider | Anchor | Derived pose | Result |
| --- | --- | --- | --- |
| Nano Banana 2 | Completed | Completed | Strong first result for this specific brief: much simpler pixel clusters than the GPT Image 2 candidate, clean chroma-key background, and strong identity retention across the walking pose. It is a JPEG source, so our normalization must remove the background before export to a final transparent PNG. |

Images and manifest: `results/2026-07-29T14-26-52-808Z/`. The current evidence filenames predate the extension correction; subsequent runs use `.jpg` for Gemini source output.

### Human-review finding

The lantern is rendered with a finer pixel scale than the character body. This is a rejection-level inconsistency for a game sprite even though the character identity and pose consistency are good. The prompt contract now explicitly requires a single pixel-block scale across accessories, and the review rubric includes `pixel scale` as a mandatory pass criterion.

## Trial 03 — 29 July 2026

Scope: Nano Banana 2 repeat of `char-01` and `pose-01` after adding the uniform pixel-scale constraint.

| Criterion | Result |
| --- | --- |
| Lantern pixel scale | Pass. The lantern now uses blocks comparable to the belt, clothing and boots; the prior micro-pixel detail is gone. |
| Character consistency | Pass. Hood, goggles, scarf, teal tunic and lantern remain coherent between idle and walking. |
| Remaining review points | The generated view is closer to a front/left hybrid than an exact left 3/4 view, and the final suitability still depends on our 48×72 normalization preview. |

Images and manifest: `results/2026-07-29T14-32-10-920Z/`.
