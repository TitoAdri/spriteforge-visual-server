# Asset Generator research and implementation notes

## What consistently works

- Treat each result as one production asset, not as a miniature illustration: one object, one purpose, a prescribed camera/view and no surrounding scene.
- State the functional silhouette explicitly. A weapon needs grip and working end; a building needs roof, entrance and base; an icon needs a recognisable pictogram.
- Lock output constraints that models otherwise invent: no characters, hands, shelves, landscapes, labels, text, UI screenshots, glows, cast shadows or duplicate objects.
- Ask for hard-edged clusters, a single pixel-block scale and a limited palette. This is especially important for small accessories and thin objects, where generative models tend to introduce micro-detail.
- Generate with a high-resolution model output, then normalize to the target grid and palette locally. This makes output comparable across providers and avoids making the remote model do exact pixel arithmetic.

## Asset modes

| Mode | Production need | Prompt-specific controls |
| --- | --- | --- |
| Item | Inventory or collectible | Readable material and interaction point; no hand or shelf. |
| Weapon / tool | Equipable object | Complete silhouette, deliberate angle, no character or sheath. |
| Prop | Interactable world object | Clear base, one object, no scene dressing. |
| Scenery | Tree, rock, sign, shrine, lamp | Full footprint and compact silhouette, no landscape. |
| Building | Standalone structure | Roof, walls, entrance and base; no surroundings. |
| UI icon | Game control / status pictogram | Front-on, bold shape, no letters or UI chrome. |

## Model and references

Google documents that Nano Banana image models accept image inputs and recommends detailed natural-language image descriptions rather than disconnected keywords; it also supports reference images for image generation and editing. GPT Image can receive visual inputs through image editing endpoints. Our implementation sends premium Theme references directly to both providers when they exist rather than attempting to replace them with text tags. [Google image-generation guide](https://ai.google.dev/gemini-api/docs/image-generation), [Google prompting guide](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [OpenAI image API reference](https://platform.openai.com/docs/api-reference/images).

## Product decisions

- Themes remain the consistency layer: visual direction is appended to the generation subject, style tags are merged, default view/pixel rules override the base recipe, and premium references are sent as images.
- Modes compile into separate backend prompt rules. The UI alone must not be trusted to control generation behavior.
- A dedicated Tile / Tileset flow should later be built separately: true seamless assets need different normalization because they are opaque and should not have their matte removed.
