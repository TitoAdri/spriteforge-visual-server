# Biblioteca de referencias y temas persistentes

Investigación y diseño de implementación para SpriteForge. Revisado el 29 de julio de 2026.

## Decisión de producto

La consistencia real no debe depender sólo de repetir un prompt. Cada generación debe pertenecer a un **proyecto**, usar opcionalmente un **tema activo** y poder tomar uno o varios **assets de referencia** con un papel explícito. El resultado guarda siempre su procedencia para poder crear variantes y familias de assets reproducibles.

La separación propuesta es importante:

| Concepto | Para qué sirve | Debe incluir |
| --- | --- | --- |
| Tema | Dirección artística estable de un juego o colección | etiquetas, paleta, escala de píxel, reglas de sombreado, perspectiva por defecto y referencias de estilo |
| Referencia de estilo | Hace que assets distintos parezcan pertenecer al mismo juego | densidad de píxel, paleta, contorno, proporciones y sombreado |
| Referencia de identidad | Conserva *el mismo* personaje u objeto | silueta, ropa, colores distintivos, accesorios y rasgos bloqueados |
| Edición | Cambia un asset existente sin perder su identidad | asset padre + instrucción de cambio |
| Preset | Atajo reutilizable de controles de generación | proveedor/modelo, tamaño, fondo, limpieza, malla, paleta y modo; no el brief del usuario |

Un tema no es un preset y un preset no debe sustituir una referencia. El tema dirige la estética; la referencia aporta evidencia visual; el preset evita reconfigurar controles.

## Qué hace SpriteCook públicamente

La documentación pública de SpriteCook describe estos mecanismos:

- Cada imagen de la biblioteca tiene acciones `Ref`, `Edit` y `Use`. `Ref` usa una imagen como guía de estilo para un asset nuevo; `Edit` conserva el mismo personaje y cambia pose, ropa, colores o detalles; `Use` copia los ajustes de generación de la imagen.
- Su referencia analiza densidad de píxel, paleta, sombreado y proporciones. Recomienda construir una cadena: crear base, editar poses y reutilizar poses aprobadas como referencias.
- Un tema permanece activo incluso al usar una referencia, por lo que ambos mecanismos se complementan.
- Los presets guardan modelo, relación/tamaño, paleta, fondo y eliminación de fondo, recorte, referencias de estilo, modo pixel-perfect y referencia/imagen de edición. El prompt y el tema se mantienen deliberadamente por generación, no se hornean en el preset.
- La biblioteca de presets se organiza en oficiales, comunidad, favoritos y propios. Los presets pueden ser privados o publicados; al publicar, las imágenes de referencia/edición quedan expuestas.

Fuentes: [creación avanzada](https://www.spritecook.ai/docs/guide-advanced-creation), [generar sprites](https://www.spritecook.ai/docs/guide-generate-sprites), [presets](https://www.spritecook.ai/blog/presets), [API](https://www.spritecook.ai/api-docs) y [uso de referencias](https://www.spritecook.ai/docs/use-reference).

No debemos prometer una reproducción determinista de una IA sólo por tener un tema: los proveedores no garantizan una semilla estable ni interpretan las referencias de la misma manera. La combinación de referencia, reglas guardadas y validación posterior reduce mucho la variación, pero no la elimina.

## Diseño recomendado para SpriteForge

### 1. Proyectos y tema activo

Un proyecto agrupa los assets de un juego. Tendrá exactamente un `activeThemeId` opcional. El selector de tema se muestra en Character Creator, Editor, Tiles y Sprite Sheets, no sólo en personajes.

Crear un tema debe permitir:

- Nombre, descripción breve y notas de dirección artística.
- Etiquetas existentes (`cozy`, `rpg`, `stardew-valley-like`, etc.) más etiquetas personalizadas.
- Paleta objetivo y máximo de colores; permitir fijar una paleta exacta posteriormente.
- Escala de píxel preferida, política de malla (`auto` o fija), resolución y perspectiva por defecto.
- Reglas de contorno, sombreado, contraste y composición.
- Política de fondo: transparente preferido o fondo de croma protegido para el flujo actual de limpieza.
- De cero a dos referencias de estilo aprobadas.

El tema debe ser editable y versionado. Los assets existentes conservan la versión que se usó al generarlos; cambiar el tema no modifica el pasado silenciosamente.

### 2. Biblioteca de assets y referencias

Cada generación aprobada se puede guardar en la biblioteca con original del proveedor, PNG normalizado y una miniatura. La ficha debe incluir:

- nombre, tipo (`character`, `prop`, `enemy`, `tile`, `frame`), etiquetas y proyecto;
- proveedor, modelo, prompt final, parámetros y versión del tema;
- dimensiones original/final, malla detectada/elegida, paleta y resultado de limpieza de fondo;
- asset padre, si deriva de una edición o variante;
- referencias consumidas y sus roles.

Acciones mínimas de cada tarjeta:

- **Usar ajustes**: carga controles técnicos, sin copiar el brief ni reemplazar el tema activo.
- **Usar como estilo**: añade la tarjeta a las referencias de estilo de la siguiente generación.
- **Crear variante / editar**: fija esa tarjeta como identidad, abre el brief de cambio y preserva los traits bloqueados.
- **Comparar**: muestra original, normalizado y metadatos, útil para detectar cambios de malla/paleta.

No mezclar en una misma lista visual las referencias de estilo y de identidad. En el compositor deben existir dos zonas claramente rotuladas:

`Identidad: 0–1` · `Estilo: 0–2`.

Más referencias no significa más consistencia: demasiadas instrucciones visuales compiten entre sí. Empezar con un máximo de una identidad y dos estilos.

### 3. Reglas de precedencia del prompt

El backend construirá el prompt de forma estructurada, nunca concatenando sólo texto libre:

1. Reglas no negociables de salida: sprite aislado, sin halo/partículas/luz ambiental, fondo conforme a la política, malla y paleta objetivo.
2. Si hay edición/identidad: silueta, vestuario, accesorios, colores y rasgos que deben sobrevivir.
3. Referencias de estilo: densidad de píxel, proporción, contorno, sombreado y lenguaje de color.
4. Tema activo: dirección artística persistente y defaults del proyecto.
5. Brief, pose, perspectiva y cambios solicitados en esta generación.

El tema y las etiquetas son una dirección, no una instrucción para copiar literalmente una obra o artista. La UI puede aceptar `stardew-valley-like` como etiqueta de trabajo, pero el prompt interno debe traducirla a atributos observables (cálido, legible, sombreado simple, paleta terrenal, etc.) y no pedir una copia exacta.

### 4. Flujo de usuario propuesto

1. Crear proyecto y tema: por ejemplo «RPG bosque otoñal, 24 colores, píxel medio, plataforma».
2. Generar y aprobar el personaje base. Guardarlo como `Hero base`.
3. Desde esa tarjeta, elegir **Crear variante** para idle, caminar, atacar o cambiar equipamiento. La identidad queda fijada.
4. Para un enemigo nuevo, conservar el tema y usar sólo referencias de estilo; no usar el héroe como identidad.
5. Revisar la normalización, ajustar malla/paleta si hace falta y guardar el asset aprobado con su procedencia.
6. Cuando una configuración técnica se repite, guardar un preset privado. Al aplicar un preset, mostrar una opción explícita «mantener tema activo» (activada por defecto).

## Modelo de datos inicial

En la primera implementación no se deben guardar imágenes base64 en la base de datos. Guardar binarios en almacenamiento de objetos o en volumen privado y metadatos en la base de datos.

```json
{
  "theme": {
    "id": "theme_forest_rpg_v1",
    "projectId": "project_01",
    "name": "Forest RPG",
    "version": 1,
    "styleTags": ["cozy", "rpg"],
    "promptDirection": "Warm readable fantasy sprites...",
    "pixelScale": "medium",
    "grid": { "mode": "auto", "width": null, "height": null },
    "palette": { "maxColors": 24, "colors": [] },
    "defaults": { "view": "left-3-4", "background": "protected-chroma" },
    "styleReferenceAssetIds": ["asset_style_01"]
  },
  "asset": {
    "id": "asset_hero_idle_01",
    "projectId": "project_01",
    "themeId": "theme_forest_rpg_v1",
    "themeVersion": 1,
    "kind": "character",
    "originalObjectKey": "assets/.../original.png",
    "normalizedObjectKey": "assets/.../game-ready.png",
    "parentAssetId": "asset_hero_base_01",
    "generation": { "provider": "nano-banana", "model": "...", "recipe": {}, "prompt": "..." },
    "normalization": { "grid": [48, 72], "paletteSize": 24, "background": "transparent" },
    "referenceLinks": [
      { "assetId": "asset_hero_base_01", "role": "identity" },
      { "assetId": "asset_style_01", "role": "style" }
    ]
  }
}
```

El `prompt` guardado ha de ser el texto final enviado al proveedor, y la `recipe` el objeto estructurado antes de construirlo. Esto permite depuración y una exportación de procedencia sin depender de la UI histórica.

## API y arquitectura a implementar

La aplicación actual puede conservar el procesamiento de malla, paleta y transparencia en el navegador. La biblioteca, el almacenamiento y las llamadas al proveedor deben permanecer en servidor.

Endpoints de una futura API privada:

- `POST/GET /api/projects`
- `GET/POST/PATCH/DELETE /api/projects/:id/themes`
- `POST /api/assets/upload` y `GET /api/assets?projectId=...`
- `GET/PATCH/DELETE /api/assets/:id`
- `POST /api/assets/:id/derive` para crear una variante/edición conservando provenance
- `POST/DELETE /api/assets/:id/references` para roles `style` e `identity`
- `GET/POST/PATCH/DELETE /api/presets`
- `POST /api/generate` con `projectId`, `themeId`, `referenceAssetIds` y `editAssetId`; el servidor resuelve archivos y permisos, no acepta URL arbitrarias.

Para una alfa de propietario único puede usarse SQLite/Postgres pequeño y un volumen Docker privado. Para multiusuario, migrar imágenes a almacenamiento compatible con S3, URLs firmadas de corta duración, límites de tamaño/MIME, hashes para deduplicación y control de acceso por `projectId`. Borrar un proyecto debe planificar borrado de metadatos y objetos; una referencia no puede dejar colgando un asset sin avisar.

No abrir una biblioteca persistente sin autenticación en el servidor público actual: cualquier visitante podría leer, alterar o consumir referencias privadas. Primero se necesita al menos una identidad de propietario o un modo de biblioteca local del navegador.

## Fases sugeridas

### Fase 0 — Diseño local sin riesgo

- UI de tema activo, selector de referencias y tarjetas de biblioteca en `IndexedDB`.
- Guardar sólo metadatos y PNGs elegidos localmente; sin exposición pública ni cambio de API.
- Añadir al prompt las etiquetas/tema actuales y mostrar exactamente qué fuentes se aplicarán.

### Fase 1 — Alfa privada persistente

- Proyecto único del propietario, temas CRUD versionados y biblioteca privada en servidor.
- Guardar automáticamente el resultado y su procedencia tras pulsar «Guardar en biblioteca».
- Acciones Usar ajustes, Usar como estilo y Crear variante.
- Límites de número/tamaño de referencias y panel de borrado.

### Fase 2 — Consistencia de personaje

- Referencia de identidad y edición visual reales, no sólo prompt textual.
- Traits bloqueados editables (paleta, casco, capa, arma, proporciones).
- Vista de comparación y pruebas de regresión de personaje base frente a variantes.

### Fase 3 — Equipos y distribución

- Cuentas, proyectos compartidos, permisos y almacenamiento de objetos.
- Presets privados/favoritos; publicación sólo con confirmación inequívoca de que las referencias se harán públicas.
- Importación/exportación de un paquete de tema (`JSON + paleta + referencias autorizadas`).

## Criterios de aceptación

- Cambiar de tema no altera ningún asset guardado; cada asset muestra el tema y versión con que nació.
- Una variante creada desde un personaje guarda relación de padre e identidad; un enemigo creado con el mismo tema no la hereda.
- El generador recibe como máximo una referencia de identidad y dos de estilo, con roles visibles en la petición registrada.
- «Usar ajustes» no sobrescribe brief, tema ni referencias activas sin confirmación.
- Un asset puede descargarse aunque se borre después su tema; la procedencia almacenada sigue legible.
- Los PNG game-ready no conservan el croma de la composición de fondo; la normalización ocurre antes de crear cualquier referencia reutilizable.
- Ninguna imagen, prompt o referencia privada puede ser consultada sin permisos del proyecto.

## Mejoras propias respecto al patrón observado

- **Versionado de tema y provenance completo**: evita que el usuario pierda el porqué de una buena generación.
- **Roles de referencia separados**: evita tratar la imagen de un héroe como estilo y copiar accidentalmente su identidad a todos los enemigos.
- **Política de salida verificable**: validaciones de transparencia, número de colores, malla, tamaño y ancla de pies antes de aprobar un asset.
- **Paquetes de tema portables**: útiles para rehacer un proyecto en otro navegador o compartir una dirección artística sin publicar toda la biblioteca.
- **Métricas de consistencia futuras**: panel de evaluación que compare paleta, escala de píxel, proporción y ancla de los assets de una colección; debe informar, no bloquear una decisión creativa.

