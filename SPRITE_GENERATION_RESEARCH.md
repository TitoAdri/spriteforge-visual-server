# Investigación de generación de sprites con GPT Image 2

Documento de trabajo para diseñar la futura funcionalidad de generación de personajes, props, tiles y spritesheets de SpriteForge. Investigado el 29 de julio de 2026. Las fuentes enlazadas son documentación oficial de OpenAI.

## Conclusión ejecutiva

`gpt-image-2` es una buena base para este producto: es el modelo de imagen recomendado para nuevas integraciones, genera y edita imágenes con buena adherencia a instrucciones y acepta imágenes de referencia con fidelidad alta por defecto. No obstante, no es un generador de spritesheets determinista: puede fallar al conservar exactamente la misma silueta, la alineación entre frames, el número de celdas o la transparencia.

La ruta de máxima calidad no es pedir directamente un spritesheet final y descargarlo. Es un flujo en dos fases:

1. **Crear y aprobar un ancla visual**: una sola pose limpia del personaje o recurso, con estilo, proporciones, paleta, vista y fondo muy controlados.
2. **Derivar y normalizar**: usar esa imagen como referencia para variantes/poses, y aplicar nuestra tubería local: eliminación de fondo, snap a malla, reducción de paleta, recorte, centrado, padding y empaquetado de frames.

Así se aprovecha el criterio visual de GPT Image 2 sin delegarle requisitos que deben ser exactos en un asset de juego.

## Hechos de plataforma que condicionan el producto

| Tema | Hallazgo | Implicación de producto |
| --- | --- | --- |
| Modelo | `gpt-image-2` es el modelo de imagen de referencia para generación y edición de calidad. | Usarlo para la experiencia de pago/final; evaluar `quality: low` para borradores. |
| API | Image API es la opción directa para una generación/edición; Responses API es mejor para una experiencia conversacional y de edición en varios turnos. | Primera versión: backend con Image API. Editor conversacional posterior: Responses API. |
| Referencias | En ediciones, procesa imágenes de entrada con fidelidad alta automáticamente; se pueden proporcionar varias. | Guardar el «character anchor» y usarlo en cada pose/variante. Coste de input mayor, pero menos drift. |
| Transparencia | GPT Image 2 **no admite** `background: transparent`. | No prometer PNG transparente nativo. Generar con color liso de clave y quitarlo localmente/servidor. |
| Tamaños | Cualquier tamaño válido: bordes múltiplos de 16, máximo 3840 px por borde, ratio máximo 3:1, entre 655.360 y 8.294.400 píxeles. Cuadrado suele ser lo más rápido. | Usar 1024×1024 para una pose o prop; 1536×1024 para hojas de varios elementos. Evitar más de 2K al inicio. |
| Calidad/coste | `low`, `medium`, `high`; `low` es la vía rápida para iterar. En 1024²: aprox. $0,006 / $0,053 / $0,211 respectivamente. | Dos modos UI: **Borrador** (`low`) y **Final** (`medium`; `high` opcional premium). |
| Limitaciones | Puede tardar hasta dos minutos en prompts complejos y no siempre mantiene consistencia o placement exacto. | Cola, cancelación visual, historial de versiones y aviso de que las animaciones se verifican/ajustan. |

Fuentes: [modelo GPT Image 2](https://developers.openai.com/api/docs/models/gpt-image-2), [guía de Image Generation](https://developers.openai.com/api/docs/guides/image-generation), [guía oficial de prompting](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide).

## Principio de calidad: generar grande, entregar pequeño y discreto

El API no genera un lienzo de 16×16 o 32×32 porque está por debajo de su mínimo de salida. Para pixel art, se debe generar a una resolución válida relativamente grande y después convertir:

```text
Prompt + parámetros → GPT Image 2 (imagen ancla) →
remover fondo / alfa → recortar y centrar →
snap a retícula → cuantizar paleta → inspección →
PNG individual o empaquetado spritesheet
```

El detector de malla y cuantización ya implementados en SpriteForge son una pieza esencial de ese resultado. La conversión debe emplear nearest-neighbor; no suavizar ni reescalar con interpolación bilineal.

### Resoluciones iniciales recomendadas

| Uso | Salida GPT | Conversión final habitual | Nota |
| --- | ---: | ---: | --- |
| Icono / item | 1024×1024 | 16², 24², 32², 48² | Una sola silueta, centrada. |
| Personaje vertical | 1024×1536 | 32×48, 48×72, 64×96 | Reservar padding alrededor. |
| Personaje de combate | 1024×1024 | 48², 64², 96² | Mejor base para cuatro direcciones separadas. |
| Tileset | 1536×1024 | tiles 16²/32² | No confiar en que las juntas sean perfectas; segmentar y revisar. |
| Hoja de animación exploratoria | 1536×1024 | 4–8 frames | Útil como referencia, no como exportación final automática sin validación. |

## Estructura de prompt que debe usar la interfaz

La guía oficial recomienda un orden estable: escena/fondo → sujeto → detalles principales → restricciones, con secciones cortas y legibles. Para producción debemos componer el prompt desde controles, no esconder toda la intención en un campo libre.

Plantilla base:

```text
Asset type:
[single game character / item icon / environment tile / concept sheet].

Subject:
[descripción visual concreta: especie, edad aparente, ropa, arma, materiales,
silhouette, elementos distintivos].

View and pose:
[front / left profile / 3-4 view; neutral idle; full body; feet visible].

Pixel-art direction:
Hand-crafted 2D pixel art for a video game. Crisp hard-edged clusters,
deliberate pixel placement, no anti-aliasing, limited [N]-color palette,
readable silhouette at [target] pixels tall.

Composition:
One complete subject, centered, with [X]% empty padding on every side.
Solid flat chroma-key background in #[HEX], no ground plane, no cast shadow.

Constraints:
No text, no watermark, no logo, no frame, no UI, no extra objects,
no duplicate limbs or characters, do not crop the subject.

Intended use:
This will be converted to a [W]×[H] game sprite after generation.
Prioritize a silhouette and color clusters that remain legible after downscaling.
```

### Por qué cada bloque existe

- **Tipo de asset** evita que el modelo trate el recurso como ilustración conceptual genérica.
- **Sujeto** debe describir rasgos observables y materiales, no solo etiquetas vagas como «guerrero cool».
- **Vista y pose** resuelve antes de la generación la ambigüedad más cara para sprites: orientación, encuadre y lectura de la silueta.
- **Dirección pixel-art** especifica bordes duros, clusters y ausencia de anti-aliasing; es más accionable que solo decir «pixel art».
- **Composición** protege el recorte automático y permite eliminar un único color de fondo.
- **Restricciones** reducen texto, marcos, objetos extra y recortes accidentales.
- **Uso final** dirige al modelo hacia legibilidad, no hacia detalle microscópico que desaparecerá al pixelizar.

No hay una sintaxis mágica: la documentación indica que párrafos, etiquetas o estructura tipo JSON funcionan cuando intención y restricciones son claras. Para el producto, el formato por secciones facilita depurar, reutilizar y versionar prompts.

## Prompts de partida

### 1. Personaje: ancla de estilo

```text
Asset type:
Single playable game character, character anchor for later animation.

Subject:
A compact desert ranger with a teal hooded cloak, brass goggles, tan scarf,
short leather boots and a small copper lantern on the belt. Warm brown skin,
one visible amber eye, and a calm determined expression. The lantern and the
triangular hood are the two signature silhouette features.

View and pose:
Full body, left-facing 3/4 view, neutral idle pose, arms relaxed, both feet
fully visible and level.

Pixel-art direction:
Hand-crafted 2D pixel art for a premium fantasy adventure game. Crisp hard
edge clusters, no blur, no gradients, no anti-aliasing, deliberately limited
palette of 24 colors. Strong readable silhouette at 48 pixels tall.

Composition:
One complete character, centered, 18% empty padding on all sides. Flat solid
background #FF00FF. No floor and no cast shadow.

Constraints:
No text, no watermark, no logo, no UI, no frame, no extra characters, no
cropping, no duplicate limbs.
```

### 2. Derivar una nueva pose a partir del ancla (edición)

Adjuntar el PNG ancla como **Image 1**. El prompt debe repetir los invariantes, incluso si parece redundante:

```text
Image 1 is the approved character anchor. Create one new sprite pose using
that exact character.

Change only the pose: a left-facing walk contact pose, left foot forward,
right arm slightly back, lantern stable at the belt.

Must remain unchanged: teal hood shape, brass goggles, tan scarf, copper
lantern, proportions, 24-color palette, hard-edged pixel clusters, left-facing
3/4 view, full body, centered composition and #FF00FF flat background.

No new accessory, no scenery, no shadow, no text, no crop, no redesign.
```

La pauta oficial es separar explícitamente lo que cambia de lo que debe permanecer, y reiterar los invariantes en cada edición para evitar drift.

### 3. Prop / item icon

```text
Asset type: single inventory item icon for a 2D fantasy game.
Subject: a small cobalt mana potion in a round glass vial, cork stopper,
golden wire around the neck, one bright cyan highlight.
Pixel-art direction: hand-crafted pixel art, crisp clusters, hard edges,
16-color palette, no anti-aliasing, legible at 24×24 pixels.
Composition: exactly one complete bottle, front 3/4 view, centered with 25%
padding, flat solid background #FF00FF.
Constraints: no hand, no surface, no glow beyond the bottle, no text, no UI,
no frame, no watermark.
```

### 4. Hoja exploratoria de animación (no exportar sin validación)

```text
Create a clean 2×2 contact sheet containing exactly four equal panels of the
same approved teal-hooded ranger: idle, walk contact, walk passing, and cast
spell. Every panel must use the same left-facing 3/4 view, body proportions,
outfit, 24-color palette and flat #FF00FF background. Each pose is full body,
centred within its own panel, with identical padding. Hand-crafted pixel art,
hard-edged clusters, no anti-aliasing. No labels, no panel borders, no text,
no scenery, no shadows.
```

Esto es útil para proponer movimiento, pero la aplicación debe detectar separadores, extraer cada panel y permitir sustituir/repetir frames individuales. Para una animación de producción, es más fiable derivar cada frame desde el ancla.

## Flujo recomendado de producto

### A. Generador de personaje/recurso individual (MVP de calidad)

1. Formulario guiado: tipo, descripción, estilo, orientación, pose, tamaño objetivo, paleta, fondo de clave y controles «Borrador / Final».
2. El backend construye el prompt completo y llama a `images.generate` con `model: "gpt-image-2"`, `size: "1024x1024"` o `"1024x1536"` y calidad seleccionada.
3. Mostrar versiones. El usuario elige una como **ancla**.
4. Procesado posterior: detectar/quitar fondo de clave tolerante, crop con margen, centrar por pies/base, snap a la malla elegida y cuantizar a la paleta elegida.
5. Preview ampliada, comparación antes/después, descarga PNG y guardar receta reproducible.

### B. Variantes consistentes

1. Enviar el ancla elegida mediante `images.edit` junto con un prompt de cambio mínimo.
2. Repetir los rasgos canónicos y la composición en cada petición.
3. Mantener un «character bible» serializado: ancla, paleta, altura de sprite, orientación, silueta, ropa/accesorios y restricciones.
4. Rechazar automáticamente resultados con fondo incorrecto, sujeto cortado o múltiples sujetos; dejar al usuario regenerar únicamente ese frame.

### C. Spritesheet y animación

No hacer del spritesheet generado por IA el único resultado. Ofrecer dos estrategias:

- **Recomendada — frames individuales:** generar/editar una pose por petición desde el mismo ancla; normalizar canvas y pivote; empaquetar localmente. Más llamadas, mucha más consistencia y control.
- **Rápida — hoja de conceptos:** generar una 2×2 o 4×2 como propuesta visual; segmentar; el usuario aprueba o regenera cada frame. No asumir que los frames ya están alineados.

El empaquetador debe pedir: ancho/alto de celda, número de columnas, separación, padding exterior, pivote (pies, centro, custom), orden de animación y exportación PNG + JSON de metadatos.

## Reglas de postprocesado imprescindibles

1. **Alfa:** como GPT Image 2 no entrega transparencia, quitar color de clave en nuestro servidor o navegador. Seleccionar por defecto magenta o verde poco presentes en el asset y usar tolerancia configurable. Mostrar máscara para corregir halos.
2. **Recorte seguro:** detectar el bounding box no-fondo, ampliar un margen fijo proporcional y nunca recortar pies/arma. Para personaje, alinear la base de los pies, no el centro geométrico.
3. **Malla primero, paleta después:** snap/downscale nearest-neighbor a la malla elegida; luego cuantizar colores. Cuantizar antes puede mezclar bordes que después se volverían a muestrear.
4. **Sin interpolación:** toda ampliación de preview y exportación debe usar nearest-neighbor (`image-rendering: pixelated`).
5. **Validación por frame:** comprobar dimensiones exactas, alfa/fondo, píxeles fuera de la celda, pivote y número de colores. Estas verificaciones son deterministas y no deben quedar en manos del modelo.
6. **Corrección dirigida:** cuando falle una parte, editar con máscara o regenerar solo el frame. Las máscaras sirven de guía, pero OpenAI advierte que no se siguen con precisión absoluta; no usarlas como única garantía geométrica.

## Interfaz sugerida

- **Modo Asset**: Character, Enemy, NPC, Item, Weapon, Tile, Prop, UI icon.
- **Brief guiado**: descripción, género/mundo, estilo, vista, pose, tamaño final, paleta, fondo y referencias.
- **Panel de consistencia** (cuando existe ancla): muestras de ancla/paleta y bloque de rasgos bloqueados.
- **Selector de calidad**: Draft (`low`) / Final (`medium`) / Ultra (`high`), con coste estimado y aviso de latencia.
- **Resultado en etapas**: Original IA → fondo retirado → snapped → paleta final → celda/pivote. Cada paso reversible.
- **Animación**: timeline de frames, botón «generar pose desde ancla», ghost/onion-skin y exportar spritesheet + JSON.
- **Historial**: prompt compuesto, parámetros, imagen ancla, versiones e ID de petición. Permite reproducir y evaluar.

## Coste, rendimiento y fiabilidad

- Iniciar ideación en `quality: low`; promover solo las candidatas seleccionadas a `medium`/`high`. La documentación presenta `low` como especialmente apto para iterar con menor latencia.
- No enviar referencias innecesarias: GPT Image 2 procesa siempre referencias a alta fidelidad, con coste de input asociado.
- Para el MVP, Image API reduce complejidad; no requiere mantener conversación. Usar Responses API cuando haya una edición conversacional real y contexto de varias iteraciones.
- Implementar límite de tamaño de upload, hash de imágenes y caché por receta para evitar re-generaciones idénticas.
- Persistir `x-request-id`, parámetros y error code. Reintentar automáticamente solo errores transitorios (`429`/`5xx`); no reintentar sin modificar una petición bloqueada o con error de usuario.
- La clave API debe vivir exclusivamente en el backend. El navegador envía el brief y recibe URLs/bytes firmados o alojados por nuestra aplicación; nunca la API key.

## Evals antes de lanzar

Crear un banco de al menos 40 briefs, dividido entre personajes, objetos, tiles y animaciones. Por cada resultado puntuar de 1 a 5:

1. legibilidad a tamaño objetivo;
2. silueta reconocible;
3. fidelidad a paleta/estilo;
4. fondo eliminado sin halos;
5. consistencia con el ancla;
6. ajuste a celda/pivote;
7. ausencia de artefactos (miembros extra, recortes, texto, frames mezclados);
8. coste y número de reintentos.

Métricas de lanzamiento sugeridas: ≥4/5 de media en legibilidad y consistencia para assets individuales, y ningún spritesheet automático publicado sin una validación de celda/pivote correcta. Medir tasa de regeneración por tipo de prompt para mejorar los presets, no solo la calidad media.

## Decisiones para la futura implementación

1. **Empezar por assets individuales + ancla + variantes**, no por una promesa de sprite animation perfecta en una llamada.
2. **El detector de malla, cuantización y empaquetador son producto central**, no meros extras: convierten arte IA flexible en asset utilizable.
3. **Fondo de clave y eliminación propia** desde el MVP, porque GPT Image 2 no tiene alfa transparente.
4. **Prompt builder visible y editable**: presets de calidad, pero siempre mostrar el prompt final para aprender de los resultados y dar control al usuario avanzado.
5. **Referencias/ancla persistentes** para personajes; cada pose nueva se crea como edición desde esa ancla.
6. **Validación y reparación por frame** en lugar de confiar ciegamente en una hoja completa.

## Evaluación de Nano Banana 2 (Gemini 3.1 Flash Image)

### Veredicto

**Sí, aporta facilidades concretas y debe evaluarse como proveedor alternativo prioritario para SpriteForge.** Para nuestro caso destaca especialmente en el flujo de personajes consistentes y de edición por pasos. Sin embargo, **no resuelve el problema determinista de un spritesheet**: la documentación no promete soporte específico de pixel art, rejilla de frames, pivotes, paleta limitada ni alfa transparente. Nuestra tubería de malla, paleta, recorte y empaquetado sigue siendo obligatoria.

No debe reemplazar GPT Image 2 sin una prueba comparativa: ambos proveedores tienen ventajas distintas y la calidad real debe medirse en nuestros prompts de personajes/props/animación, no en imágenes promocionales.

### Facilidades que sí ofrece

| Capacidad | Nano Banana 2 | Impacto para SpriteForge |
| --- | --- | --- |
| Identidad del modelo | `gemini-3.1-flash-image` (Nano Banana 2). Google lo recomienda como modelo generalista con equilibrio entre calidad, coste y latencia. | Buen candidato para el modo estándar del generador. |
| Referencias de personaje | Hasta **4** imágenes para mantener consistencia de personajes. | Podemos enviar ancla frontal, perfil, referencia de pose y paleta/ropa; es una ventaja explícita frente a un flujo que depende de una única ancla. |
| Referencias de objetos | Hasta **10** imágenes de objetos con alta fidelidad. | Útil para equipamiento modular, props y composición de un personaje con accesorios aprobados. |
| Edición multi-turn | `previous_interaction_id` mantiene el contexto de una interacción anterior. | Permite UX conversacional: “misma heroína, ahora vista izquierda” sin reconstruir todo el contexto en el prompt. Guardar ese ID por versión. |
| Resolución mínima | Admite salida de **512 px**, además de 1K, 2K y 4K. | Más eficiente para borradores que luego se llevarán a 16–128 px; aun así sigue siendo demasiado grande para un sprite final. |
| Aspect ratio | Control explícito de aspect ratio e image size. | Podemos usar retrato para personajes y landscape para hojas conceptuales sin calcular tamaños personalizados. |
| Secuencial | La documentación incluye arte secuencial/storyboards y recomienda referencias previas para vistas 360 del personaje. | Señal positiva para exploración de poses y hojas de animación. No equivale a garantía de frames alineados. |
| PNG | Genera PNG. | Compatible con nuestro postprocesado de color, alfa y spritesheet. |

Fuentes: [guía de Image Generation de Gemini](https://ai.google.dev/gemini-api/docs/image-generation), [documentación Firebase/Gemini sobre referencias y tamaños](https://firebase.google.com/docs/ai-logic/generate-images-gemini?hl=en), [anuncio técnico de Google](https://blog.google/innovation-and-ai/technology/developers-tools/build-with-nano-banana-2/).

### Límites y riesgos importantes

- Todas las imágenes generadas incluyen una marca de agua **SynthID**. Es una consideración de trazabilidad/comercial, aunque no debe confundirse con una marca visual de texto que podamos simplemente retirar.
- La documentación no enumera transparencia/alfa de salida ni una opción de `transparent background`. Por prudencia, mantener la estrategia de fondo de clave + eliminación propia hasta comprobarlo en una prueba API real.
- Tampoco documenta salida a tamaño de sprite, control de paleta ni un formato de sprite sheet. Pedir “4×4 frames idénticos y alineados” mejora el resultado, pero no garantiza píxeles de celda exactos.
- El modelo puede mantener consistencia con referencias, pero no sustituye las verificaciones de silueta, base de los pies, canvas, pivot y bounding box.
- Su capacidad de búsqueda/web grounding y de texto nítido no es relevante para sprites; no debemos pagar/activar complejidad por esas funciones en este flujo.

### Comparación orientada a nuestra funcionalidad

| Área | GPT Image 2 | Nano Banana 2 | Lectura práctica |
| --- | --- | --- | --- |
| Generación individual de alta calidad | Muy fuerte; modelo recomendado por OpenAI para nuevos flujos. | Muy fuerte; Google lo posiciona como su modelo generalista de imagen. | Empate a validar con nuestros estilos. |
| Edición y ancla de personaje | Edición con referencias de alta fidelidad, pero las garantías de número de personajes no se expresan como límite de producto. | Hasta 4 referencias de personaje, más contexto secuencial por `previous_interaction_id`. | Ventaja de Nano Banana 2 para personajes/poses persistentes. |
| Borradores baratos/rápidos | `quality: low` es una ruta clara para iterar. | Flash está diseñado para velocidad/volumen y ofrece 512 px. | Ambos válidos; medir coste y latencia reales. |
| Tamaño de salida | Tamaño libre dentro de reglas técnicas; mínimo ~0,65 MP. | Presets 512/1K/2K/4K con ratios. | Nano Banana 2 resulta más cómodo para presets, GPT Image 2 más flexible. |
| Transparencia | No soporta transparente. | No hay soporte documentado para transparencia. | Ninguno evita chroma key/removal. |
| Spritesheet exacto | No garantizado. | No garantizado; ejemplos de storyboard, no de assets de juego. | Ninguno reemplaza normalización y empaquetado propios. |
| API/UI conversacional | Responses API permite flujos multi-turn; Image API es directa. | Interactions API aporta `previous_interaction_id` de forma explícita. | Nano Banana 2 simplifica un editor por versiones; abstraer proveedor. |

### Recomendación técnica

Implementar un adaptador de proveedor, sin casar la UI con una API:

```text
generateAsset(recipe) -> provider.generate(recipe)
editAsset(anchor, recipe, change) -> provider.edit(...)
normalizeToSprite(image, recipe) -> nuestro procesado determinista
packFrames(frames, sheetSpec) -> PNG + JSON
```

La receta debe ser independiente del proveedor: `assetType`, prompt compuesto, referencias, tamaño de sprite final, paleta, fondo de clave, orientación, pose, pivote y opciones de hoja. Guardar además `provider`, `model`, parámetros específicos e ID de interacción/respuesta para reproducibilidad.

### Prueba de selección antes de integrar

Ejecutar el mismo set de 40 briefs con ambos modelos, sin cambiar nuestra normalización. Para cada categoría generar:

- 10 personajes ancla;
- 10 poses derivadas desde una ancla;
- 10 props/items;
- 10 hojas 2×2 exploratorias.

Comparar: coste por asset aprobado, latencia p50/p95, regeneraciones, legibilidad después de snap 32×32/48×48, consistencia de rasgos entre poses, fondo eliminable sin halos, porcentaje de celdas válidas y revisión humana ciega. Seleccionar por categoría: es posible que Nano Banana 2 gane en variantes de personaje y GPT Image 2 en arte individual, o viceversa.

**Decisión provisional:** mantener GPT Image 2 como referencia de calidad de la investigación previa y colocar Nano Banana 2 como primer candidato para el modo de personajes/animación asistida. No afirmar una ventaja definitiva hasta completar esa evaluación.

## Referencias oficiales

- [GPT Image 2 — modelo, endpoints y límites](https://developers.openai.com/api/docs/models/gpt-image-2)
- [Image generation — APIs, generación, ediciones, tamaños, formatos, limitaciones y errores](https://developers.openai.com/api/docs/guides/image-generation)
- [GPT Image Generation Models Prompting Guide — estructura, restricciones, iteración y consistencia](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)
- [Nano Banana image generation — Gemini API](https://ai.google.dev/gemini-api/docs/image-generation)
- [Nano Banana 2 — anuncio técnico de Google](https://blog.google/innovation-and-ai/technology/developers-tools/build-with-nano-banana-2/)
