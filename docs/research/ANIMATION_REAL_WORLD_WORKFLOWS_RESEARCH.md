# Animación de sprites: flujos reales y alternativa al modelo generalista

Fecha de revisión: 11 de agosto de 2026

## Motivo de esta revisión

Las pruebas reales de SpriteForge con Nano Banana 2 han mostrado que ni una hoja generada de una sola vez ni el flujo `pose guide + sprite de identidad` producen animaciones vendibles de forma fiable.

Los últimos resultados presentan tres fallos recurrentes:

- deriva de identidad: cambian cara, proporciones, ropa y accesorios;
- deriva de escala: cada pose ocupa una cantidad distinta del canvas;
- falsa animación: el modelo redibuja poses parecidas, pero no construye un ciclo con arcos, apoyo, peso y continuidad.

Esto no se resuelve añadiendo más prohibiciones al prompt. Un modelo generalista de imagen interpreta cada salida como una ilustración nueva. No dispone de un rig persistente, huesos, correspondencia entre partes ni una representación temporal del ciclo.

## Cómo lo hace la gente en la práctica

### 1. Esqueleto primero, píxeles después

El flujo con mejores resultados repetibles separa movimiento y apariencia:

1. se estima o dibuja un esqueleto sobre el sprite;
2. se anima ese esqueleto o se aplica una plantilla de movimiento;
3. el modelo recibe en cada frame la pose exacta y el sprite original como identidad;
4. se reutilizan frames correctos como `init images` y se corrigen zonas concretas mediante inpainting;
5. se fuerza la misma paleta, canvas y pivote.

PixelLab expone este flujo directamente mediante `estimate-skeleton` y `animate-with-skeleton`. Su editor permite corregir el esqueleto, reutilizar animaciones esqueléticas entre personajes y combinar referencia, frames iniciales, máscaras, inpainting y paleta forzada. No es solamente una técnica de prompt: la pose entra como estructura de control.

Fuentes:

- [PixelLab: Animate with skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton)
- [PixelLab API](https://api.pixellab.ai/)
- [PixelLab API y precios](https://www.pixellab.ai/pixellab-api)

La comunidad de pixel art describe el mismo cambio de proceso: dejar de estirar o redibujar directamente el sprite y resolver primero la acción con un esqueleto simple. En flujos de Stable Diffusion se utiliza OpenPose/ControlNet o un rig de Blender para proporcionar las poses; la IA se encarga después del acabado visual.

### 2. Rig 3D y render a sprite

Otro método habitual es crear un modelo 3D sencillo, riggearlo, aplicar animaciones y renderizarlo desde cámaras fijas. El render se reduce o se usa como guía para el acabado en Aseprite.

Ventajas:

- identidad, anatomía, cámara y volumen deterministas;
- cualquier movimiento puede reutilizarse;
- ocho direcciones y cambios de equipo son más controlables.

Inconvenientes:

- requiere modelo, rig, pesos, materiales y una cadena de render;
- el resultado necesita una fase de estilización/pixelado;
- es demasiado complejo para ser el flujo principal de un usuario no artista.

Es una opción sólida a largo plazo para personajes premium o un servicio interno, pero no la mejor primera integración.

### 3. Cutout/puppet 2D

El personaje se segmenta en cabeza, torso, brazos, piernas y accesorios. Las piezas se unen a un rig 2D, como Spine, y se deforman sin volver a generar la identidad.

Ventaja principal: conserva exactamente los píxeles originales. Desventajas: necesita segmentación y capas ocultas; las rotaciones amplias exponen huecos y puede tener apariencia de marioneta. Es útil para idles, UI animada y personajes con articulaciones sencillas, pero no sustituye un ciclo dibujado para ataques o giros complejos.

El trabajo `SPRITETOMESH` investiga precisamente la automatización de la conversión de un sprite plano a una malla compatible con animación esquelética 2D: [SPRITETOMESH](https://arxiv.org/abs/2602.21153).

### 4. Modelo entrenado específicamente para sprites

La literatura especializada confirma que la arquitectura necesaria separa identidad, pose y tiempo. El trabajo *Sprite Sheet Generation using a Diffusion Model* adapta componentes de Animate Anyone/Sprite Sheet Diffusion:

- una red de referencia para apariencia;
- una guía de pose semejante a ControlNet;
- un módulo temporal que relaciona los frames;
- entrenamiento específico sobre acciones y sprites procesados.

El experimento utilizó 94 acciones, 845 frames y 30.000 pasos de entrenamiento en una NVIDIA L40S. Esto demuestra por qué una sucesión de llamadas de edición a Gemini no equivale a un animador: le faltan la condición estructural, el módulo temporal y el entrenamiento de dominio.

Fuentes:

- [Sprite Sheet Generation using a Diffusion Model](https://marcovolino.github.io/docs/papers/2025-wong-cvmp.pdf)
- [Sprite Sheet Diffusion](https://arxiv.org/abs/2412.03685)
- [Animate Anyone](https://arxiv.org/abs/2311.17117)
- [Follow-Your-Pose v2](https://arxiv.org/abs/2406.03035)

## Evidencia de comunidad

Las experiencias públicas son coherentes con nuestras pruebas:

- los modelos generales pueden crear un diseño inicial, pero no mantienen de manera fiable cortes, dimensiones e identidad entre frames;
- ControlNet/OpenPose o un rig se usan para fijar la pose;
- incluso herramientas especializadas necesitan regeneración selectiva y acabado manual en personajes principales;
- generar un personaje por frame mediante texto produce créditos desperdiciados y resultados difíciles de alinear.

Fuentes comunitarias —útiles como experiencia práctica, no como garantía técnica—:

- [Consistencia y animación de sprites](https://www.reddit.com/r/aigamedev/comments/1svc3z0/how_to_generate_dozens_of_characters_in_the_exact/)
- [Por qué los modelos generales fallan con spritesheets](https://www.reddit.com/r/aigamedev/comments/1qpfxd2/how_to_generate_consistent_pixel_art_assets/)
- [Experiencias reales con generadores de animación](https://www.reddit.com/r/aigamedev/comments/1tvzr0n/ive_spent_6_months_building_a_character_animation/)
- [Pose conditioning con OpenPose](https://www.reddit.com/r/generativeAI/comments/1u93l6l/struggling_with_asset_consistency_and_animation/)
- [Estado práctico de la generación de assets](https://www.reddit.com/r/aigamedev/comments/1tlq4vg/current_state_of_art_asset_generation/)

## Evaluación de opciones para SpriteForge

| Enfoque | Identidad | Movimiento | Automatización | Infraestructura | Encaje actual |
|---|---:|---:|---:|---:|---:|
| Nano Banana/GPT Image por frame | baja | baja-media | alta | API actual | no apto como modo final |
| Hoja completa con modelo general | baja-media | media | alta | API actual | impredecible |
| PixelLab con esqueleto | alta esperada | alta | alta | API externa | mejor siguiente prueba |
| Rig cutout 2D | exacta | media | media | procesamiento propio | modo secundario futuro |
| Rig 3D → render → pixel art | muy alta | muy alta | media | pipeline 3D/GPU | opción premium futura |
| Modelo propio pose-temporal | potencialmente muy alta | muy alta | alta | GPU + dataset + MLOps | largo plazo |

## Recomendación inmediata

SpriteForge debería dejar Nano Banana y GPT Image para crear personajes y assets estáticos, pero no utilizarlos como motor principal de Animation.

La prueba siguiente debe integrar PixelLab en un modo experimental:

1. normalizar el asset a un canvas cuadrado de 32, 64 o 128 píxeles sin reescalarlo de forma destructiva;
2. ejecutar `estimate-skeleton` una sola vez y guardar el esqueleto junto al asset;
3. aplicar plantillas propias para idle, walk, run, attack, jump, hurt y death;
4. enviar referencia, esqueleto por frame, paleta del asset y, cuando proceda, frames iniciales/inpainting a `animate-with-skeleton`;
5. validar identidad, silueta, escala, pivote, alpha y continuidad antes de cobrar o publicar el resultado;
6. permitir corrección manual del esqueleto solamente cuando la estimación tenga baja confianza;
7. conservar regeneración selectiva: un frame defectuoso no obliga a rehacer el clip completo.

Los dos ejemplos actuales caben en un canvas 128×128. No se debe estirar el sprite para llenarlo; se centra en X y se alinea al pivote inferior.

## Coste estimado de la prueba

Según los precios publicados actualmente por PixelLab:

- estimación del esqueleto: aproximadamente **0,0051 USD**, una vez por personaje;
- animación con esqueleto a 128×128: aproximadamente **0,01572 USD**;
- primer movimiento de un personaje: aproximadamente **0,0208 USD**;
- movimientos posteriores reutilizando el esqueleto: aproximadamente **0,0157 USD** cada uno.

También existe `animate-character` v3, alrededor de 0,0145 USD por dirección a 128×128, y `animate-with-text-v3`, que acepta frame inicial y final. Para nuestra prueba, `animate-with-skeleton` es preferible porque expone el control que ahora nos falta.

Los importes son estimaciones del proveedor y deben verificarse con el campo `usage` de cada respuesta antes de fijar el precio en tokens.

## Prueba de aceptación propuesta

Probar tres siluetas diferentes:

- humano compacto con accesorios pequeños;
- criatura no humana con extremidades visibles;
- personaje alto con arma o capa.

Para cada uno: idle de 4 frames, walk de 6 u 8 y attack de 6. Un clip solo se considera apto si:

- conserva cara, ropa, accesorios y paleta;
- no cambia más de un 3 % la altura aparente salvo crouch/jump;
- mantiene el mismo pivote de pies;
- presenta poses claramente diferentes y un arco de movimiento legible;
- el primer y último estado forman un loop sin salto;
- no requiere redibujar manualmente más de un frame de cada cuatro.

Si PixelLab no supera esta prueba, la siguiente opción no debe ser volver a ajustar prompts de Gemini. Se debe evaluar un rig 2D automático o un backend propio con ReferenceNet/IP-Adapter, ControlNet/OpenPose y módulo temporal en infraestructura GPU.

## Decisión de producto

El modo generalista actual debe permanecer marcado como experimental o desactivado para usuarios finales: consume créditos sin ofrecer calidad predecible. Animation se debería reabrir como producto vendible solamente después de superar el conjunto de aceptación anterior.
