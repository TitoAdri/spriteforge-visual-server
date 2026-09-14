# Animation: investigación y plan de implementación

## Objetivo

Animation debe convertir un sprite aprobado —personaje, prop, elemento de escenario o UI— en un clip revisable y exportable. El sistema no debe tratar cada frame como una generación aislada: todos los frames parten de la misma imagen ancla, conservan canvas, escala, paleta y pivote, y quedan vinculados al usuario y al asset original.

## Hallazgos de SpriteCook

SpriteCook separa dos flujos:

- **Animate**: un sprite y una descripción de movimiento producen un clip rápido. Admite 2–16 frames, prompts negativos, selección de limpieza de fondo y ajuste de framing.
- **Frame Animation**: timeline editable, referencias en frames concretos, prompts por frame, reordenación, regeneración parcial y onion skin.

Sus recomendaciones más importantes son: sprite pixel art de hasta 256×256, poco margen salvo movimientos amplios, canvas compartido entre frames, safe margin, alineación bottom/center para personajes, power-of-two opcional, y entre 2 y 4 keyframes en movimientos complejos. Fuentes: [Animate a Sprite](https://www.spritecook.ai/docs/guide-animate-sprite), [Frame Animation](https://www.spritecook.ai/docs/guide-frame-animation), [Frame Editor](https://www.spritecook.ai/docs/guide-frame-editor) y [Framing & Alignment](https://www.spritecook.ai/docs/guide-framing-alignment).

## Investigación técnica

### Consistencia visual

La literatura de animación generativa coincide en que la referencia visual y una guía explícita de pose/movimiento son las dos piezas centrales. *Animate Anyone* usa una red de referencia para conservar apariencia y una guía de pose para controlar movimiento; *Motion-I2V* separa la predicción de movimiento de la síntesis visual; *Sprite Sheet Diffusion* trata explícitamente la consistencia de personaje entre poses. Aunque SpriteForge usa modelos generalistas de imagen, el principio se puede trasladar:

1. el sprite original se usa como ancla en **todos** los frames;
2. cada frame recibe una fase temporal concreta, no solo “walk”;
3. no se encadenan ediciones frame 1 → 2 → 3, porque acumularían deriva;
4. el resultado se normaliza contra la misma geometría del frame ancla.

Referencias: [Animate Anyone](https://arxiv.org/abs/2311.17117), [Motion-I2V](https://arxiv.org/abs/2401.15977), [Sprite Sheet Diffusion](https://arxiv.org/abs/2412.03685).

### Proveedores existentes

- GPT Image 2 ofrece generación y edición con imágenes de entrada de alta fidelidad. La edición se debe pedir como un cambio localizado: modificar solo la pose y conservar identidad, diseño, colores, perspectiva y escala. [Modelo GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2).
- Nano Banana 2 está orientado a generación y edición, procesa múltiples referencias y destaca en consistencia; la guía oficial recomienda describir explícitamente qué cambia y qué debe conservarse. [Guía de imagen de Gemini](https://ai.google.dev/gemini-api/docs/image-generation).

Para ambos proveedores, la base del clip será una edición de imagen. Las referencias premium del Theme se pueden añadir después del ancla, pero la identidad procede siempre del sprite original.

## Contrato del clip

Un clip contiene:

- asset fuente obligatorio y privado;
- movimiento, provider, tema y tags;
- 2–16 frames; el primero reutiliza el sprite fuente y no consume token;
- FPS, loop, duración individual, margen, alineación y canvas power-of-two;
- estado persistente por frame: `source`, `queued`, `running`, `succeeded` o `failed`;
- relación de procedencia `source asset → animation clip → frame assets`;
- PNG original y PNG game-ready por frame.

Cada frame generado consume un token al comenzar. Un clip de 8 frames cuesta 7 tokens. Si se alcanza el límite de 10 generaciones/5 minutos, la cola se detiene y los frames restantes continúan en `queued`.

## Presets de movimiento

Los presets no son solo etiquetas; definen fases temporales:

- **Idle**: neutral → inhale/rise → settle → neutral.
- **Walk**: contact → down → passing → up → opposite contact → opposite passing.
- **Run**: contact → compression → passing → airborne → opposite contact → airborne.
- **Attack**: anticipation → wind-up → strike → follow-through → recovery.
- **Jump**: crouch → takeoff → ascent → apex → descent → landing.
- **Hurt**: neutral → impact → recoil → settle.
- **Death**: hit → loss of balance → fall → ground/rest.
- **Custom**: el usuario describe el movimiento; se interpola en fases numeradas.

Los movimientos cíclicos repiten una fase compatible con el frame inicial sin duplicarlo físicamente al final.

## Normalización determinista

1. El sprite fuente se coloca en un canvas compartido según margen y alineación.
2. Ese canvas, no el recorte original, se manda como ancla al proveedor.
3. El fondo croma se elimina **antes** de reconstruir la malla.
4. Se detecta la cuadrícula y se reconstruye con nearest-neighbor.
5. Se mide el bounding box y se escala cada frame a la altura de referencia.
6. Todos los frames se colocan bottom-center, manteniendo un pivote de pies estable.
7. Se valida: dimensiones idénticas, alpha válido, foreground no vacío y margen seguro.

Esto no elimina toda deriva anatómica, pero impide jitter de canvas, variaciones de tamaño y desplazamientos que sí podemos corregir de forma determinista.

## Interfaz inicial

- selector visual de assets personales compatibles;
- presets de movimiento con iconos y explicación;
- frames, FPS, loop, margen, power-of-two, provider y prompt;
- coste visible antes de crear;
- timeline persistente con estados y regeneración selectiva;
- reproducción dentro del navegador a FPS real;
- exportación de spritesheet PNG horizontal y JSON genérico con rects, duración, pivote y loop.

La primera versión prioriza un flujo estable y exportable. Upload de keyframes, drag-to-reorder, onion skin manual y paquetes nativos de Unity/Godot quedan definidos como segunda fase, porque requieren rutas de upload/edición y una UI de timeline más profunda.

## Seguridad y persistencia

- Tablas `animation_clips` y `animation_frames`, vinculadas al usuario, asset fuente, colección y tema.
- Creación, retry y regenerate protegidos con sesión, CSRF y comprobación de propiedad.
- El servidor solo permite reservar frames del usuario y obliga a usar `/api/edit` para Animation.
- Los créditos se cargan por frame y se reembolsan con el mecanismo idempotente existente cuando el proveedor falla.
- El generador global sigue gobernado por `SPRITEFORGE_GENERATOR_ENABLED`; con valor `false`, los clips pueden crearse pero no consumen API.

## Fase siguiente

1. keyframes subidos o elegidos desde biblioteca;
2. prompt y duración editables por frame;
3. drag-to-reorder y duplicación;
4. onion skin con desplazamiento manual por frame;
5. comparación de identidad/paleta y alertas de drift;
6. exportadores Godot `SpriteFrames`, Unity AnimationClip y Phaser atlas JSON;
7. generación batch/sheet para reducir coste, seguida de slicer con detección de solapamientos.

## Revisión de calidad: agosto de 2026

Las primeras pruebas reales mostraron dos fallos distintos. Encadenar `frame 1 → frame 2 → frame 3` mejoró la identidad, pero el texto pedía *el cambio más pequeño posible* y convirtió Idle en una vibración. Además, normalizar cada salida a un canvas power-of-two creó spritesheets 64×128 con mucho espacio vertical para personajes de unos 59×69 píxeles.

Cambios aplicados:

- cada pose vuelve a partir del sprite aprobado, que actúa como modelo de identidad inmutable;
- las instrucciones exigen una silueta claramente distinta y prohíben resolver el movimiento trasladando o deformando el personaje completo;
- Idle usa dos poses clave por defecto: exhalación neutral e inhalación extrema con movimiento secundario de accesorios;
- canvas power-of-two pasa a ser opt-in; sigue disponible para motores que lo requieran;
- progreso visible por clip, spinner por hueco de frame y estados inmediatos durante la petición;
- el preview calcula un único factor entero de ampliación, conservando el aspect ratio y el pixel-perfect scaling.

Segunda revisión tras evaluar la identidad: las peticiones independientes seguían redibujando pequeños detalles. El flujo se ha sustituido por `coherent-sheet-v1`:

- una sola edición genera todas las key poses simultáneamente en una cuadrícula explícita;
- el sprite aprobado entra como referencia de identidad y la primera celda debe reproducirlo;
- el navegador divide la hoja, reconstruye la malla y calcula una única escala común para todas las poses;
- cada frame conserva el mismo canvas y pivote bottom-center, pero no se reescala por separado;
- los frames resultantes se guardan como assets privados vinculados al clip y al sprite padre;
- la operación completa consume una generación, con independencia del número de poses;
- si falla la hoja o su división, los frames quedan marcados como fallidos y no como falsos resultados válidos.

Las pruebas reales mostraron que Gemini puede incumplir incluso una cuadrícula explícita: introdujo dos personajes en una celda, escalas incompatibles y una celda colapsada en bloques. Por ello `coherent-sheet-v1` deja de tratar la hoja como arte final. El flujo actual es `validated-pose-guide-v1`:

1. una llamada produce únicamente un plan visual de poses;
2. se validan por celda número de bandas verticales, área, anchura y conservación mínima de complejidad cromática;
3. si una celda contiene dos sujetos, escala extrema o pérdida de detalle, se rechaza toda la planificación antes de renderizar frames finales;
4. cada pose válida se envía como segunda referencia junto al sprite aprobado;
5. el prompt asigna al sprite original toda la identidad y a la segunda imagen únicamente articulación y silueta corporal;
6. los resultados finales se normalizan contra el canvas y pivote aprobados.

Este modo cuesta una llamada de planificación más una llamada por frame nuevo. Es más caro que aceptar directamente una hoja, pero responde a la recomendación oficial de proporcionar una referencia de pose para posturas complejas y evita guardar como assets finales los errores estructurales observados.

La base técnica coincide con *Animate Anyone*: la consistencia de apariencia y el control espacial/temporal son problemas diferentes, resueltos allí con una red de referencia, pose guider y modelado temporal. ControlNet demuestra igualmente que pose, bordes y segmentación son controles espaciales útiles. Los endpoints generalistas actuales no exponen pose conditioning, por lo que la mejora inmediata consiste en key poses explícitas; la vía de máxima calidad futura es una hoja coherente en una sola generación o un backend especializado con pose/skeleton conditioning.

Referencias adicionales:

- [Gemini image generation: character consistency, reference images and sequential art](https://ai.google.dev/gemini-api/docs/image-generation)
- [Animate Anyone](https://arxiv.org/abs/2311.17117)
- [ControlNet](https://arxiv.org/abs/2302.05543)
