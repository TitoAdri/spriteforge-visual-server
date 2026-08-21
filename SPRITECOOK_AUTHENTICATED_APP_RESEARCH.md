# Auditoría de SpriteCook autenticado

Investigación realizada el 30 de julio de 2026 dentro de una sesión de usuario, sin generar assets, gastar créditos, subir archivos ni modificar ningún asset. Este documento complementa `REFERENCE_LIBRARY_AND_THEMES_RESEARCH.md`: aquí se distinguen las observaciones directas de la aplicación privada de las propuestas para SpriteForge.

## Hallazgos confirmados en la aplicación privada

### Panel principal

- El dashboard muestra créditos, número de assets, prompt libre, selector de tipo `Create as: Auto`, historial de prompts y un botón para añadir imagen de referencia antes de crear.
- Los flujos destacados son Character, Asset Pack, Asset Generator, Tileset, Seamless Texture y Animation.
- Los assets recientes se pueden reabrir directamente como trabajo en curso.
- La comunidad se muestra como una entrada a presets populares, no como sustituto de la biblioteca privada.

### Biblioteca de assets

La biblioteca privada tiene una jerarquía simple y útil:

- `All Assets`, `Unorganized`, proyectos y colecciones.
- Búsqueda, orden, densidad cómoda/compacta y selección múltiple.
- Filtros: recientes, favoritos, animaciones, personajes, transparentes, ediciones y assets procedentes de packs.
- Cada tarjeta muestra nombre, fecha, tipo y proyecto. Una generación examinada expone modelo, formato, resolución y fondo en su detalle.

Esto convierte la generación en una biblioteca de producción, no en una simple galería de imágenes.

### Detalle de un asset

El detalle de un sprite aislado ofrece zoom, ajuste a pantalla, modo 1:1, fondo de visualización, descarga, favorito, visibilidad y acciones de compartir. Su panel lateral divide las operaciones en tres familias:

| Familia | Acciones observadas | Valor de producto |
| --- | --- | --- |
| Generar | **Use these settings**, Generate variations, Use as reference, Edit with this image, Animate | Reutiliza el trabajo aprobado sin obligar a reconstruir el flujo. |
| Ajustar | Crop, Resize, Recolour, Remove background, Undo background removal, Edge cleanup, Slicer, Advanced editor | Permite corregir lo suficiente antes de recurrir a otra generación. |
| Verificar | preview, tamaño, formato, fondo, modelo y prompt copiable | Hace inspeccionable la procedencia y la salida final. |

Las etiquetas visibles son muy claras: “Use as reference — Inspire the next generation” y “Edit with this image — Modify with a new prompt”. Esta separación debe preservarse: una referencia abre una familia estética, mientras que editar mantiene un asset concreto como punto de partida.

### Selector de referencias en el compositor

El botón `Add reference image` abre un diálogo con dos rutas:

1. subir o arrastrar una imagen nueva;
2. seleccionar cualquier asset existente de SpriteCook.

El selector no obliga a salir de la composición ni a buscar manualmente una URL. Esta integración biblioteca → compositor es la pieza más importante que debemos replicar.

### Creador de personajes

El primer paso acepta descripción, upload o selección de un asset reciente. El paso de estilo/perspectiva muestra:

- estilo `Pixel art` (y una alternativa `Detailed`, deshabilitada cuando la referencia es píxel);
- tarjetas visuales, no desplegables, para Platformer, Isometric y Top-Down;
- texto de confirmación: la animación seguirá la perspectiva elegida.

Esto valida la dirección ya aplicada en SpriteForge: las opciones visuales de perspectiva reducen ambigüedad y deben ocurrir antes de generar/animar.

### Biblioteca de presets

La biblioteca se abre sobre el dashboard y contiene pestañas Official, Community, Favorites y Mine. Incluye:

- búsqueda;
- orden Popular/New;
- filtros de estilo (All, Pixel art, Detailed) y modo (Assets, Textures, Tilesets, UI);
- tarjeta con preview, autor, número de usos, guardados, enlaces, favorito y, si existe, reporte;
- detalle con carrusel de ejemplos, descripción, reportar, copiar enlace y aplicar preset.

El detalle de un preset observado expone una configuración reproducible: `Prompt`, `Theme`, `Model`, `Format`, `Size` y `Background`. El ejemplo concreto usaba un tema textual independiente: “3x3 grid of 9 tiny creatures”, modelo Nano Banana Pro, pixel art, 64×64 y fondo transparente.

**Matiz importante:** la documentación pública anterior indicaba que el tema no se hornea en presets; la UI actual sí lo muestra como un campo del preset. Para SpriteForge, debemos resolver esta contradicción de UX de forma explícita: el preset puede traer una *sugerencia* de tema, pero aplicar un preset no debería sustituir silenciosamente el tema activo del proyecto.

## Qué copiar de forma casi literal

1. Biblioteca con proyectos, colecciones, filtros de producción y tarjetas con proyecto/tipo.
2. Diálogo único de referencias: upload o asset existente, desde el propio compositor.
3. Ficha de asset con acciones nombradas por intención: usar ajustes, generar variaciones, usar referencia, editar y animar.
4. Separación visual entre acciones generativas y operaciones locales de preparación de sprite.
5. Presets con pestañas propias/comunidad/favoritos, filtros, ejemplos, detalle, enlace y moderación.
6. Tarjetas visuales para perspectivas y dependencia explícita entre perspectiva y futuro spritesheet/animación.

## Qué mejorar en SpriteForge en vez de copiar ciegamente

### Tema persistente y versionado

SpriteCook hace visible un campo `Theme`, pero desde la UI examinada no aparece una biblioteca de temas versionados con alcance de proyecto. SpriteForge debe ofrecerla:

- un único tema activo por proyecto;
- versiones inmutables que cada asset referencia;
- paleta, escala de píxel, malla, perspectiva, reglas de contorno/sombreado y referencias de estilo;
- aplicación del preset con una decisión clara: `mantener tema actual` (por defecto) o `usar la sugerencia del preset`.

### Referencia de estilo frente a identidad

La acción `Use as reference` es sencilla, pero el usuario necesita saber qué quedará fijado. SpriteForge debe presentar dos carriles:

- **Identidad**: máximo un asset; silueta, equipo y colores del mismo personaje.
- **Estilo**: hasta dos assets; densidad, sombreado, paleta y proporción.

No deben ser la misma selección implícita. Cada asset guardará el papel de las referencias usadas.

### Procedencia inspeccionable

La ficha de SpriteForge deberá incluir, además de modelo/tamaño/fondo:

- tema + versión;
- prompt final compuesto y recipe estructurada;
- referencias y roles;
- malla detectada/elegida y paleta resultante;
- cadena de ancestros (`base → variante → edición → frame`).

Esto es esencial para repetir una familia de personajes, depurar un mal resultado y exportar un proyecto.

### Calidad game-ready antes de aprobar

Las operaciones de SpriteCook (recolor, crop, background removal, edge cleanup) son las correctas, pero SpriteForge debe añadir un estado `Pending review` antes de marcar un asset como referencia aprobada. Las validaciones mínimas son transparencia, halo de croma, tamaño de malla, límite de colores, recorte y ancla de pies para personajes.

### No publicar referencias por accidente

Las tarjetas de presets comunitarios admiten enlace, favoritos y reporte. Si SpriteForge añade comunidad, una publicación debe declarar y comprobar si incluye prompt, tema y/o imágenes de referencia. Por defecto los presets y las referencias deben ser privados.

## Backlog priorizado derivado de esta auditoría

### P0 — Consistencia útil para una alfa privada

1. Proyecto + tema activo en Character Creator.
2. Guardar una generación aprobada en biblioteca con original, normalizado, parámetros y tema/versionado.
3. Selector `Añadir referencia`: biblioteca existente + upload; roles Style/Identity.
4. Acciones Use settings, Use as style reference y Create variant/Edit.
5. Vista de ficha con descarga, transparencia/malla/paleta y procedencia.

### P1 — Flujo de producción

1. Colecciones, búsqueda, filtros de transparente/personaje/edición y selección múltiple.
2. Herramientas locales: crop, resize, recolour, background cleanup, edge cleanup y slicer.
3. Presets propios que guarden controles técnicos con opción explícita de conservar tema.
4. Validación game-ready y aprobación antes de que un asset pueda ser referencia.

### P2 — Compartir y escala

1. Presets favoritos, públicos y moderables.
2. Proyectos colaborativos, control de acceso y almacenamiento de objetos con URLs firmadas.
3. Paquetes exportables de tema + paleta + referencias autorizadas.
4. Evaluación de consistencia de una familia mediante métricas de paleta, densidad, proporción y ancla.

## Criterios de diseño que no debemos perder

- Ninguna acción de “usar” sobrescribe sin aviso el prompt, el tema activo o las referencias del usuario.
- Un preset sirve para controles reutilizables; un tema sirve para dirección artística persistente; una referencia aporta evidencia visual. Son entidades distintas.
- Una variante de personaje conserva un padre y una identidad; un nuevo enemigo hereda como mucho el tema y estilo.
- Una referencia se deriva del PNG normalizado y validado, nunca del resultado con fondo de croma o halo pendiente de limpiar.
- Las acciones caras (generar, variaciones, animar) deben indicar crédito/coste antes de ejecutarse; las operaciones locales no deben consumir API.

## Próximo paso recomendado

Implementar primero la Fase P0 de forma privada y sin comunidad: esquema de proyecto/tema/asset, almacenamiento seguro y selector de referencia con roles. Es la base que hace que las etiquetas actuales de SpriteForge dejen de ser sólo texto y se conviertan en consistencia acumulativa.

