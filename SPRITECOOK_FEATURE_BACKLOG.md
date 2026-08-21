# SpriteForge feature backlog from public SpriteCook documentation

Source review: 2026-07-29. This is a product backlog, not a claim that SpriteForge currently provides these features.

## Apply next

1. **Character flow: approve, revise, animate, export.** Keep the generated still as the approved source of truth, then add small revision prompts before animation.
2. **Perspective-first character creation.** Platformer, isometric and top-down selection must happen before generation because perspective changes are expensive and inconsistent later.
3. **Reusable style direction.** Persist selected style tags as a named Theme with palette, pixel scale, perspective and prompt instructions. Reuse it for characters, props and tiles.
4. **Reference library.** Save approved assets; support Use as Reference for a new asset and Edit for changing the same character's pose/outfit.
5. **Animation jobs.** Start with idle, walk, run, attack, jump, hurt and death. Support custom motion prompts, frame count, margins/anchor point and a transparent-background quality mode.
6. **Sprite-sheet output.** Generate even grids, individual frames, a looping preview, PNG atlas metadata and consistent feet anchors.
7. **Image editor.** Generic prompt-to-sprite for props, items, UI, backgrounds and enemies, with theme, palette, resolution, pixel scale and background controls.
8. **Tilesets and seamless textures.** Add perspective-aware tile generation, autotile layouts, tile dimensions and seamless-edge validation.
9. **Engine exports.** Begin with JSON atlas + PNG, then Godot AnimatedSprite2D and Unity importer exports. Phaser/GameMaker can consume the generic atlas.

## Quality and safety work

- Add Basic/Pro background cleanup: protected chroma component cleanup is Basic; later Pro should use a segmentation model or a provider-native alpha output when reliably available.
- Store settings and prompt provenance with every approved asset so later assets reproduce the same visual rules.
- Add validation previews: true size, transparent checkerboard, palette count, grid size, frame bounds and foot anchor.
- Keep generation rate/cost controls separate from the creative workflow.

## Evidence used

- SpriteCook documentation index: https://www.spritecook.ai/docs
- Character pipeline and perspective/animation selection: https://www.spritecook.ai/docs/guide-create-character
- Theme, palette and resolution workflow: https://www.spritecook.ai/docs/guide-generate-sprites
- Reference/Edit consistency workflow: https://www.spritecook.ai/docs/guide-advanced-creation
- Single-sprite animation, reframing and cleanup modes: https://www.spritecook.ai/docs/guide-animate-sprite
- Engine-ready sheet/export expectations: https://www.spritecook.ai/ai-sprite-sheet-generator
