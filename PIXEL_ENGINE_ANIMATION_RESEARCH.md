# PixelEngine: investigación técnica e implicaciones para SpriteForge

Fecha: 12 de agosto de 2026

## Conclusión ejecutiva

PixelEngine no anima sprites generando cada pose mediante llamadas independientes a un modelo de imágenes. Su producto principal es un **modelo temporal image-to-video especializado en animación 2D**, condicionado por:

- una imagen inicial;
- una descripción temporal completa del movimiento;
- una longitud objetivo de 2 a 16 frames en el modo pixel;
- opcionalmente una semilla, un prompt negativo y una configuración de paleta.

El modelo produce la secuencia como una unidad temporal. Después, PixelEngine reduce el resultado de alta resolución a la resolución nativa del sprite, cuantiza los colores, empaqueta los frames y, opcionalmente, ejecuta la retirada de fondo como una operación separada.

Esto explica por qué mantiene identidad y movimiento mucho mejor que nuestros experimentos con GPT Image o Nano Banana: esos modelos resuelven una imagen o edición cada vez y no poseen un estado temporal conjunto.

SpriteCook usa PixelEngine como proveedor de animación. No parece haber desarrollado internamente el modelo que produce el movimiento; su valor está principalmente en la generación del personaje, los presets, la preparación del canvas, la orquestación, la retirada de fondo, la biblioteca y el editor.

## Lo que está confirmado

### Modelo de animación

- `pixel-engine-v1.1` acepta PNG de hasta 256×256.
- Genera entre 2 y 16 frames, siempre un número par.
- Recibe la imagen inicial, el prompt, `negative_prompt`, número de frames, semilla, formato de salida y control de colores/paleta.
- Devuelve WebP animado, GIF o un spritesheet PNG horizontal.
- Cada frame conserva exactamente las dimensiones de la imagen de entrada.
- La generación típica tarda alrededor de 60–90 segundos.
- El creador informó de inferencia sobre una NVIDIA L40S y estimó que el modelo podría ejecutarse con unos 16 GB de VRAM, aunque no lo había probado.
- El modelo no genera directamente en resolución pixel. El creador confirmó que genera grande y reduce posteriormente.
- El creador reconoce que los resultados originales contienen ruido y que sus demostraciones iniciales tuvieron limpieza manual.

### Modelo de keyframes

PixelEngine dispone de un modelo/arquitectura diferente para interpolación condicionada por keyframes:

- acepta uno o más keyframes en posiciones arbitrarias;
- cada keyframe puede tener una fuerza entre 0 y 1;
- todos se colocan sobre un canvas compartido;
- genera entre 3 y 20 frames;
- admite modo pixel o detallado.

No es simplemente el endpoint normal con más imágenes: el creador indicó que entrenó un modelo con una arquitectura nueva para esta función.

### Preprocesado

- Detecta si la entrada es pixel art real.
- Su herramienta Pixelate detecta la malla, reduce a resolución nativa y cuantiza colores.
- Permite ampliar el canvas, desplazar el sprite, invertirlo y elegir relleno sólido, transparente o extensión de bordes.
- El propio PixelEngine señala que el espacio disponible forma parte del condicionamiento visual: un personaje ajustado al borde produce movimientos comprimidos.
- La pose inicial también condiciona la animación. Pedir una carrera desde una pose neutra obliga al modelo a incorporar esa pose al ciclo y suele empeorar el resultado.

### Postprocesado

- El modelo genera con el alfa aplanado sobre un color mate.
- La transparencia no nace del modelo: el fondo se elimina después con otro endpoint.
- La cuantización por número de colores parece hacerse por frame. Su propia guía advierte de parpadeo de color al usar límites altos.
- La API permite forzar una paleta común, aunque lo marca como experimental.
- Los spritesheets son tiras horizontales: ancho = frames × ancho del frame.

### Relación con SpriteCook

Evidencias convergentes:

- PixelEngine incluye públicamente a SpriteCook entre los productos que utilizan su tecnología.
- El creador de PixelEngine declaró que SpriteCook utiliza su modelo como proveedor de animaciones.
- El creador de SpriteCook describió públicamente su stack: genera la imagen inicial con Nano Banana y usa PixelEngine como proveedor de animación.
- Los límites publicados por SpriteCook coinciden con PixelEngine: pixel art, máximo 256×256 y proporciones entre 1:2 y 2:1.
- SpriteCook ofrece selección de frames, reframing, prompts mejorados, retirada de fondo y spritesheet: todas son abstracciones directas de parámetros o endpoints publicados por PixelEngine.

## Arquitectura interna inferida

Las siguientes partes son inferencias, no afirmaciones del proveedor.

### Núcleo generativo probable

La explicación más compatible con las pruebas es un modelo de difusión de vídeo image-to-video, probablemente un fine-tune completo o un adaptador fuerte sobre una familia abierta tipo Wan/LTX, entrenado con secuencias de sprites y captions de movimiento.

Razones:

- recibe primer frame + texto y produce una secuencia completa;
- tarda 60–90 segundos en una L40S;
- podría caber en aproximadamente 16 GB durante inferencia;
- genera internamente a resolución alta;
- el creador habla de mucho cómputo de entrenamiento y distingue expresamente su solución de los modelos de imagen;
- la cantidad de frames es flexible por buckets pares;
- los artefactos descritos son característicos de image-to-video: miembros que aparecen/desaparecen, objetos que saltan y ruido temporal.

No hay evidencia pública suficiente para identificar el modelo base exacto. Afirmar que es Wan 2.2 sería especulación. En conversaciones públicas se lo preguntaron directamente y el creador no lo reveló.

### Pipeline probable de `/animate`

1. Validación de tamaño, formato y créditos.
2. Aplanado del alfa sobre `matte_color`.
3. Aplicación de `transform` sobre un canvas cuadrado.
4. Ampliación por nearest-neighbor o preprocesado equivalente hasta la resolución de inferencia.
5. Codificación de imagen inicial y prompt temporal.
6. Muestreo conjunto de toda la secuencia mediante el modelo temporal.
7. Selección/remuestreo del número de frames solicitado.
8. Reducción a las dimensiones originales.
9. Cuantización por frame o contra una paleta indicada.
10. Empaquetado en WebP/GIF/spritesheet.
11. Retirada de fondo opcional como segundo trabajo.

### Infraestructura probable

La ruta pública `functions/v1`, el sistema de jobs, las reservas de créditos y las ejecuciones asíncronas apuntan a:

- funciones de API ligeras y base de datos para autenticación, saldo y jobs;
- una cola de trabajos;
- workers GPU bajo demanda;
- contenedores calientes reutilizados para batches.

La propia documentación confirma que el batch ejecuta trabajos secuencialmente dentro de un mismo contenedor GPU caliente. El proveedor concreto de GPU no está confirmado públicamente.

## Cómo funciona probablemente SpriteCook

1. Genera el personaje estático con Nano Banana/GPT Image.
2. Lo normaliza a pixel art verdadero y lo limita a 256×256.
3. Prepara canvas, margen, alineación y pose según perspectiva/movimiento.
4. Convierte presets como Idle/Walk/Run/Attack en prompts temporalmente densos.
5. Envía cada movimiento a PixelEngine, posiblemente mediante integración mayorista.
6. Descarga el WebP o spritesheet.
7. Ejecuta Basic/Pro background removal.
8. Guarda cada animación en su biblioteca y permite regenerar/editar frames.

El coste publicado también encaja: PixelEngine cobra 20 créditos por `/animate`; SpriteCook cobra aproximadamente 24 tokens por animación, dejando margen para orquestación, almacenamiento, limpieza y beneficio.

## Por qué nuestros enfoques anteriores fallaron

### GPT Image / Nano Banana por frame

- Cada llamada resuelve una imagen independiente.
- El frame anterior ayuda como referencia visual, pero no impone una trayectoria temporal completa.
- El modelo prioriza una imagen atractiva frente a locomoción físicamente correcta.
- La escala, identidad, oclusiones y alternancia de piernas pueden derivar entre llamadas.
- La composición del spritesheet dentro de una sola imagen tampoco da al modelo una pérdida temporal especializada.

### Rig local 2D

- Conserva identidad, pero solo deforma píxeles existentes.
- No puede inventar regiones ocultas, cambiar orden de oclusión ni representar correctamente cambios topológicos, como abrir un cofre.
- Es útil como editor/corrector, no como motor generativo general.

### Veo

- Sí tiene coherencia temporal, pero está entrenado para vídeo convencional.
- Produce demasiados frames, antialiasing, movimiento continuo y deriva visual para un spritesheet pequeño.
- La conversión posterior a pixel art puede conservar el movimiento, pero no garantiza poses discretas limpias ni una paleta estable.

## Estrategia recomendada para SpriteForge

### Fase 1: integrar PixelEngine como proveedor

Es la vía más rápida para alcanzar o superar funcionalmente a SpriteCook sin entrenar todavía un modelo.

Flujo propuesto:

1. Normalización local mediante nuestro detector de malla.
2. Recorte del contenido y canvas adaptativo según el movimiento.
3. Derivación automática de una paleta global desde el sprite.
4. Prompt temporal por preset, incluyendo lateralidad y contactos de pies.
5. Llamada a `/animate` con `output_format: spritesheet`.
6. Eliminación de fondo con nuestro sistema de fondo protegido, evitando pagar el endpoint adicional cuando sea posible.
7. Registro temporal del pivote/pies.
8. Cuantización conjunta de toda la secuencia, no independiente por frame.
9. Validadores automáticos y reintento selectivo.
10. Editor integrado para retoques.

Antes de integrar debemos solicitar una clave de PixelEngine y, para producción, negociar su tarifa API plana para aplicaciones.

### Fase 2: ventajas propias sobre PixelEngine/SpriteCook

Podemos añadir mejoras que su documentación deja sin resolver:

- **Paleta temporal global:** extraer una única paleta del sprite y asignarla coherentemente en todos los frames.
- **Estabilización del pivote:** detectar pies/masa y corregir desplazamientos involuntarios en X/Y.
- **Validador de locomoción:** comprobar alternancia izquierda/derecha, contactos y amplitud del paso.
- **Validador de identidad:** comparar silueta, histograma, accesorios y tamaño contra la fuente.
- **Limpieza temporal de alfa:** máscara conjunta con conectividad temporal para evitar halos y agujeros.
- **Selección automática de canvas:** margen distinto para idle, walk, jump, attack y custom.
- **Selección/reintento inteligente:** generar 2–3 variantes solo cuando la puntuación automática sea baja.
- **Keyframes asistidos:** generar o editar poses de contacto y enviarlas a `/keyframes` para acciones difíciles.
- **Editor local:** conservar Animation 2 como herramienta de ajuste de poses y píxeles tras la generación.

### Fase 3: modelo propio

Solo tiene sentido después de validar demanda y recopilar datos con licencia.

Pipeline de entrenamiento razonable:

1. Dataset licenciado de animaciones pixel art con acciones y perspectivas etiquetadas.
2. Separación por clips y eliminación estricta de duplicados entre train/validation.
3. Construcción de pares: primer frame + caption temporal → secuencia completa.
4. Buckets de 4/6/8/10/12/16 frames y tamaños de personaje.
5. Upscale nearest-neighbor a la resolución del modelo de vídeo.
6. Fine-tune/LoRA de un modelo I2V abierto antes de considerar entrenamiento completo.
7. Pérdidas o validadores auxiliares para identidad, primer frame, loop, transparencia y estabilidad de pivote.
8. Postprocesado temporal propio.

La alternativa más realista no es entrenar “muchos modelos”: un único modelo I2V para `/animate`, más adelante otro modelo condicionado por keyframes si el producto lo justifica.

## Riesgos y limitaciones observadas

- PixelEngine admite que algunos resultados necesitan 3–4 intentos.
- Las demostraciones iniciales fueron limpiadas a mano; no todo el output es directamente production-ready.
- La pose inicial puede condicionar demasiado el ciclo.
- El resultado cambia mucho por uno o pocos píxeles de padding.
- Cuantizar cada frame por separado produce flicker.
- La retirada de fondo se realiza después y puede introducir bordes o perder detalles.
- El proveedor retiene los archivos solo 24 horas; SpriteForge debe descargarlos y almacenarlos inmediatamente.
- Usar PixelEngine crea dependencia de proveedor. Conviene encapsularlo detrás de nuestra interfaz `AnimationProvider` y conservar la posibilidad de sustituirlo.

## Fuentes principales

- https://pixelengine.ai/docs/introduction
- https://pixelengine.ai/docs/api-reference
- https://pixelengine.ai/guides/animate
- https://pixelengine.ai/guides/pixelate
- https://pixelengine.ai/guides/reframe
- https://pixelengine.ai/
- https://www.spritecook.ai/docs/guide-animate-sprite
- https://www.spritecook.ai/docs/guide-frame-animation
- https://www.spritecook.ai/docs/guide-framing-alignment

## Auditoria publica ampliada (12 de agosto de 2026)

Esta seccion separa expresamente hechos observables de hipotesis. No se ha usado una cuenta, una clave de API ni ningun endpoint privado.

### Hallazgo nuevo: el sistema de keyframes esta identificado como LTX

El JavaScript que PixelEngine entrega publicamente al navegador contiene su tabla de costes por modelo. En ella aparecen estos identificadores:

- `pixel-engine-v1.1`: 20 creditos;
- `frame-engine-v1.1`: 20 creditos;
- `pixel-engine-v1.2`: 20 creditos;
- `ltx-keyframes-v1`: 24 creditos.

La presencia literal de `ltx-keyframes-v1`, unida al comportamiento documentado del endpoint de keyframes, permite concluir con **confianza muy alta** que esta funcion se apoya en LTX-Video o en una derivacion entrenada sobre esa familia. LTX permite condicionar una generacion con varias imagenes colocadas en frames arbitrarios, asignar fuerza al condicionamiento, escoger el numero de frames y realizar LoRA o fine-tuning completo. Es practicamente el mismo contrato conceptual que expone PixelEngine.

Esto no demuestra que `pixel-engine-v1.1` tambien sea LTX. PixelEngine usa nombres diferentes para ambos motores y el creador describio keyframes como una arquitectura nueva. El motor normal puede compartir familia, puede usar otro modelo temporal o puede ser una version anterior muy modificada.

`pixel-engine-v1.2` no figura todavia en la documentacion publica consultada. Su aparicion en el cliente indica preparacion o despliegue parcial, no disponibilidad publica confirmada.

### Lo que revelan las salidas publicas

Se descargaron y analizaron cuatro GIF publicos del propio sitio: 6, 6, 8 y 10 frames. Todos se empaquetan a 120 ms por frame (8,33 FPS), aunque el creador describio sus primeras demos como animaciones de 10 FPS. Por ello la duracion del GIF debe considerarse una opcion de empaquetado, no el ritmo interno del modelo.

Observaciones:

- la imagen de entrada es el primer frame;
- los frames siguientes forman fases discretas de una accion, no ediciones independientes;
- el modelo entrega exactamente longitudes variables, en vez de un video fijo mostrado siempre completo;
- las siluetas, oclusiones y efectos cambian conjuntamente a traves del tiempo;
- el numero de colores cambia entre frames cuando no se fuerza paleta;
- el fondo transparente de las demos es posterior al modelo;
- acciones pequenas y personajes de menos de unos 60 px son los casos mas fiables.

La explicacion mas probable es que toda la secuencia se muestrea conjuntamente en espacio latente y despues se selecciona o decodifica a la longitud solicitada. No hay evidencia suficiente para decidir si el modelo genera exactamente N latentes temporales o genera una secuencia interna mas densa y la submuestrea.

### Infraestructura confirmada desde la respuesta publica

La API publica esta delante de Cloudflare y se ejecuta en Supabase Edge Runtime/Deno. Sus respuestas exponen una metrica de profundidad de cola. Esto refuerza esta arquitectura:

1. cliente web;
2. funcion Edge ligera para autenticacion, saldo, validacion y creacion del job;
3. base de datos/cola persistente;
4. worker GPU independiente;
5. almacenamiento temporal del resultado;
6. polling o callback para recuperar el trabajo.

No hay indicios publicos fiables del proveedor de GPU. Tampoco aparecieron referencias significativas a RunPod, Modal, Replicate o ComfyUI en los bundles examinados.

### Huella publica del creador

El creador es Todd Grilliot (`@GrilliotTodd`; usuario de Reddit `melonboy55`). La busqueda en GitHub y Hugging Face no encontro un repositorio publico suyo con el modelo, pesos, dataset o pipeline. Las declaraciones publicas mas utiles son:

- aprendio buena parte del proceso leyendo papers de Meta, ByteDance y otros autores;
- es un desarrollador de software con larga experiencia, no partia de una carrera academica en ML;
- insiste en especializar el problema en vez de entrenar un modelo general;
- no afirma haber entrenado desde cero y reconoce que fine-tuning o continual pretraining evitan reinventar el modelo base;
- mantiene deliberadamente en secreto la arquitectura/base por propiedad intelectual;
- considera publicar los pesos de una version antigua cuando exista una sucesora;
- PixelEngine 1.1 se publico primero como producto y despues como API;
- Retro Diffusion combina su salida cruda con preprocesado, postprocesado y otros modelos;
- SpriteCook consume el modelo mediante la API.

Por tanto, la lectura correcta de "I trained my own model" es **modelo propio especializado**, no necesariamente foundation model entrenado desde cero.

### Hipotesis tecnica revisada

#### Keyframes: confianza muy alta

- Base LTX-Video 13B/2B o una variante contemporanea.
- Fine-tune completo o LoRA fuerte con secuencias 2D/pixel-art.
- Condicionamiento de varias imagenes en indices temporales concretos.
- Generacion a resolucion de video y reduccion posterior.
- Posible entrenamiento adicional para longitudes muy cortas y composicion estatica.

No se puede determinar publicamente si usa 2B, 13B, FP8, distilled o una bifurcacion propia. Que el creador estime 16 GB de VRAM es compatible con variantes cuantizadas o pequenas, pero no identifica una concreta.

#### Animacion normal: confianza media

- Foundation model I2V abierto, no un generador de imagenes por frame.
- Primer frame limpio como condicion temporal.
- Fine-tune/continued training sobre clips cortos de animacion 2D.
- Captions que describen trayectoria completa: pose inicial, anticipacion, contacto, extremo, recuperacion y loop.
- Buckets de longitud y resolucion; el producto restringe a numeros pares.
- Inferencia grande, reduccion inteligente, cuantizacion y retirada de fondo.

LTX y Wan son candidatos tecnicamente compatibles, pero no existe evidencia bastante para elegir uno como base de `pixel-engine-v1.1`. La unica atribucion de familia realmente respaldada es `ltx-keyframes-v1`.

### Que replicaria primero

El prototipo mas informativo para SpriteForge no seria otra cadena GPT/Nano Banana. Seria:

1. LTX-Video 0.9.8 I2V como baseline reproducible.
2. Entradas escaladas 4x-8x por nearest-neighbor, con 15-25 % de margen segun accion.
3. Clips de 4/6/8/10 frames a 8-10 FPS efectivos.
4. Primer frame condicionado sin ruido.
5. LoRA sobre un dataset pequeno pero licenciado y muy limpio de idle/walk/run/attack.
6. Muestreo conjunto de la secuencia.
7. Reduccion a malla detectada y una sola paleta para el clip completo.
8. Correccion de pivote, conectividad alfa y alternancia de piernas.
9. Ranking automatico de 2-3 candidatos solo cuando falle el validador.
10. Keyframes LTX para acciones donde el usuario aporta poses esenciales.

Esta prueba permitiria medir identidad, locomocion, coste y limpieza antes de financiar un fine-tune completo. Tambien nos da una via propia sin depender de modelos cerrados por imagen.

### Matriz de certeza

| Afirmacion | Certeza |
| --- | --- |
| Es un modelo temporal que genera la secuencia conjuntamente | Alta |
| Genera grande y reduce a pixel art despues | Confirmada por el creador |
| Usa 16-24 colores como rango habitual de postprocesado | Confirmada por el creador |
| Keyframes usa la familia LTX | Muy alta; identificador publico `ltx-keyframes-v1` |
| El motor normal usa LTX | Desconocida |
| El motor normal usa Wan 2.2 | Desconocida |
| Es un foundation model entrenado desde cero | Muy improbable, no confirmado |
| Usa Supabase Edge + cola + workers GPU separados | Alta |
| Usa RunPod/Modal/Replicate/ComfyUI | Sin evidencia |
| `pixel-engine-v1.2` existe en el cliente | Confirmada |
| `pixel-engine-v1.2` esta disponible publicamente | No confirmada |

### Fuentes adicionales

- https://github.com/Lightricks/LTX-Video
- https://github.com/Lightricks/LTX-Video-Trainer
- https://huggingface.co/Lightricks/LTX-Video
- https://www.reddit.com/r/aigamedev/comments/1r34exm/i_trained_my_own_pixel_art_animation_model_lemme/
- https://www.reddit.com/r/comfyui/comments/1r34g1i/been_working_on_this_for_a_while_now/
- Huella publica en X del creador: https://x.com/GrilliotTodd
- Bundle publico conservado para auditoria local en `generator/evals/pixelengine-public/chunks/chunk-0.js`.
- Declaraciones públicas del creador de PixelEngine en r/aigamedev y r/comfyui, febrero–abril de 2026.
