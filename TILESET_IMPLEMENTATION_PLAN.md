# Tilesets: plan de implementación

## Referencia investigada

El flujo autenticado actual de SpriteCook abre `Tileset` como una generación de pixel art compacta: parte de 32×32, permite modelo, referencias de estilo, tamaño, relación 1:1 y guardado en biblioteca. Es una base rápida, pero una IA por sí sola no ofrece una garantía verificable de continuidad entre bordes. Sus propios presets visibles priorizan direcciones reutilizables (por ejemplo, edificios isométricos y pequeños assets), no una prueba técnica de tiling.

La aspiración de SpriteForge debe ser: conservar esa simplicidad de entrada, pero convertirla en una cadena de producción confiable para mapas. Un tile no se considera listo solo porque “parezca” tileable: se debe normalizar y comprobar.

## Contrato del producto

Un **tileset** es una colección privada de 1–9 tiles cuadrados. Cada tile:

- tiene tamaño lógico explícito: 8, 16, 24, 32, 48, 64 o 128 px;
- usa pixel art opaco: nunca se aplica limpieza de croma, recorte de foreground ni alpha accidental;
- se genera de uno en uno bajo el mismo tema, tags, escala y dirección;
- se persiste con estados `queued`, `running`, `succeeded` o `failed`;
- tiene variante original y variante `game-ready` independiente;
- se valida mediante una previsualización repetida 3×3 y métricas de borde.

Esto permite suspender/reintentar un pack sin perder su colección ni cobrar por tiles que no hayan empezado.

## Modos iniciales

| Modo | Contenido inicial | Uso |
|---|---|---|
| Superficie continua | 1 tile de material | Suelo, pared, tierra, madera, techo. Máxima garantía de repetición. |
| Variaciones de terreno | 4 superficies compatibles | Evitar repetición visual en césped, piedra o arena. Cada variante es tileable por sí misma. |
| Suelo de mazmorra | 4 variaciones de piedra | Centro, grietas, musgo y pequeños restos; sin borde direccional. |
| Agua / lava | 4 variaciones | Corrientes suaves sin objeto central, pensadas para repetirse. |
| Interior | 4 materiales | Madera, piedra, alfombra y decoración sutil. |
| Personalizado | 1 tile editable | Para cualquier material o textura repetible. |

Los modos de transición compleja —autotiles con vecinos de materiales diferentes, esquinas y paredes conectadas— se muestran como evolución posterior. La primera versión no afirma falsamente compatibilidad entre dos materiales dispares.

## Garantía técnica de tiling

1. Pedir al modelo una textura cuadrada sin objeto central, texto, marco, padding, sombras ni iluminación emitida.
2. Detectar y reconstruir la malla de píxeles localmente; si no se detecta, reducir por nearest-neighbor al tamaño solicitado.
3. Cuantizar opcionalmente la paleta sin introducción de transparencia.
4. Aplicar reparación cíclica de bordes: los bordes opuestos comparten exactamente el mismo color y se suavizan en una banda pequeña desde el interior. Así el PNG final repite de forma determinista, incluso si la IA falló en la junta.
5. Medir la diferencia de color a través de ambos wrap seams. El resultado expone `seam score`, número de pares reparados y estado `seamless verified`.
6. Mostrar el tile repetido 3×3, no solo aislado. Es la comprobación visual más útil para un usuario no artista.

La reparación es apropiada para materiales y texturas. Si elimina información de una textura con gran objeto central, el usuario debe regenerar o elegir otro brief: por eso el prompt lo prohíbe de origen.

## Prompting

Todos los tiles incluyen estas reglas, además del tema:

- “single square seamless material tile”;
- “the left/right and top/bottom edges must match as a periodic texture”;
- “fill the full tile; no transparent canvas, frame, empty margin or background matte”;
- “no central hero object, symbols, text, borders, highlights, glow, cast shadow or directional lighting”;
- “readable limited-palette pixel clusters, uniform pixel scale”.

El tamaño se expresa tanto como resolución final como grid lógico; la IA recibe una dirección de escala numérica igual que Character y Asset Generator.

## Datos y seguridad

- Tablas: `tilesets` y `tileset_tiles`, vinculadas al usuario, tema y colección privada.
- API: creación y reintento con sesión, CSRF, validación estricta de tipo/tamaño/brief y comprobación de propiedad.
- El endpoint de generación reserva el tile después del débito y antes de llamar al proveedor; si falla, marca el tile fallido y devuelve el crédito por el mismo mecanismo de Asset Pack.
- Cada tile consume un token solo al iniciarse. No se cobra por una cola pendiente.

## Límites conocidos y siguiente fase

- Una IA no garantiza topología de autotile entre *materiales distintos*. La primera entrega garantiza continuidad del tile consigo mismo y mantiene variaciones coherentes por tema.
- La siguiente fase añadirá editor de bordes, extractor/slicer de sheets y reglas de conectividad (N/E/S/W + esquina) para autotiles reales.
- Antes de declarar “game-ready”, conviene añadir un corpus de pruebas visuales: césped, roca, agua, lava, suelo de madera y paredes de mazmorra con Nano Banana 2 y GPT Image 2.
