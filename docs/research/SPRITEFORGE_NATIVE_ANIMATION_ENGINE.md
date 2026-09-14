# SpriteForge Native Animation Engine

Diseño técnico para un motor propio de animación de pixel art condicionado por esqueletos. No depende de PixelLab ni de otra API de sprites.

Fecha: 11 de agosto de 2026

## 1. Alcance y límites de la investigación

PixelLab no publica pesos, dataset ni arquitectura de su modelo. Por tanto, no es posible conocer ni copiar su implementación interna. Sí podemos observar su contrato público, su editor y el proceso que recomienda, y reconstruir una solución original con técnicas publicadas.

### Comportamiento público observado

Su flujo contiene:

- estimación automática de un esqueleto desde el sprite;
- corrección manual de joints;
- plantillas por vista, dirección y movimiento;
- transferencia del esqueleto de una animación existente;
- generación de pocos frames por iteración;
- modos `freeze 1 → generate 2` y `freeze 2 → generate 1`;
- imagen de referencia con peso configurable;
- imágenes iniciales con fuerza progresiva;
- máscaras de inpainting para cambiar solo partes concretas;
- paleta objetivo y colores forzados;
- copia/protección de cabeza cuando el movimiento no la necesita;
- reutilización del rig y de las plantillas.

Fuente principal: [PixelLab Animate with skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton).

### Inferencia razonable, no confirmada

La combinación anterior es compatible con un modelo de difusión especializado con condición de pose, un encoder de referencia, entradas de init/inpainting y entrenamiento sobre sprites. No debemos afirmar que PixelLab use ControlNet, IP-Adapter o una arquitectura concreta. Esos componentes son candidatos para nuestro sistema porque están publicados y resuelven el mismo contrato.

## 2. Principio del motor propio

La unidad de trabajo deja de ser “genera otra imagen del personaje” y pasa a ser:

```text
Identidad inmutable
  + geometría corporal exacta
  + pose objetivo
  + frames aprobados
  + máscara editable
  + paleta/indexación
  → 1–3 frames nuevos validados
```

El motor se divide en una capa determinista y otra generativa. El modelo nunca decide canvas, pivote, longitud de miembros, orden temporal ni qué regiones debe conservar.

## 3. Arquitectura

### 3.1 Orquestador web

El backend actual de SpriteForge sigue gestionando usuarios, créditos, assets y clips. Añadirá trabajos asíncronos:

- `POST /api/native-animation/rigs/estimate`
- `PUT /api/native-animation/rigs/:id`
- `POST /api/native-animation/clips`
- `POST /api/native-animation/clips/:id/generate-window`
- `POST /api/native-animation/frames/:id/inpaint`
- `POST /api/native-animation/frames/:id/approve`

La web no habla directamente con el worker de GPU. El orquestador firma cada trabajo, valida propiedad y límites, y recibe resultados por una cola privada.

### 3.2 Normalizador de sprite

Entrada: PNG transparente o salida game-ready.

Produce:

- canvas lógico de 32, 64, 96, 128 o 256;
- máscara alpha limpia;
- escala de píxel detectada;
- pivote inferior y bounding box;
- paleta ordenada y versión indexada;
- mapa de bordes;
- regiones candidatas: cabeza, torso, extremidades y accesorios.

Las escalas 96 y 256 son extensiones nuestras; el modelo se puede entrenar primero en 64/128.

### 3.3 Rig estimator

Modelo ligero de keypoints entrenado para sprites, no OpenPose genérico. Salida `spriteforge-skeleton-v1`:

- 17 joints humanoides;
- confianza y visibilidad por joint;
- tipo corporal y lateralidad;
- anchors opcionales para arma, escudo, capa, cola, alas y prop sostenido;
- regiones protegidas sugeridas;
- mapa de calor para mostrar incertidumbre.

OpenPose y DW-Pose fallan con proporciones exageradas y ropa que oculta extremidades; el propio trabajo Sprite Sheet Diffusion observa esta limitación y recurre a anotaciones manuales cuando la estimación falla.

Para criaturas se usarán rigs declarativos diferentes (`biped`, `quadruped`, `flying`, `slime`, `mechanical`) en vez de forzar siempre un humano.

### 3.4 Motion compiler

Las plantillas no almacenan imágenes, sino:

- jerarquía del rig;
- rotación relativa por hueso;
- desplazamiento del root;
- curvas de easing;
- contactos con el suelo;
- arcos de manos, armas y accesorios;
- eventos temporales (`contact`, `impact`, `apex`, `release`);
- regiones que pueden moverse y regiones protegidas.

Se retargetean al cuerpo real conservando exactamente las longitudes de huesos. La base de este compilador ya está creada en `generator/src/animation/skeleton-core.mjs` y `motion-templates.mjs`.

### 3.5 Renderer pose-conditioned

#### MVP de entrenamiento

Base reproducible:

- un U-Net/DiT de difusión inicializado desde un modelo abierto cuya licencia permita uso comercial;
- encoder de referencia semejante a ReferenceNet/IP-Adapter para identidad;
- pose guider tipo ControlNet que recibe heatmaps y líneas de huesos;
- canal alpha explícito;
- condición de paleta;
- entrada de init image y máscara;
- generación conjunta de una ventana de 2–4 frames con atención temporal.

Se entrena en dos fases siguiendo el hallazgo de Sprite Sheet Diffusion:

1. `pose-to-image`: referencia + pose → frame;
2. `pose-to-window`: referencia + poses + frames congelados → ventana coherente.

La segunda fase congela gran parte del renderer y entrena atención/módulo temporal.

#### Modelo nativo posterior

Para superar a herramientas que generan una imagen grande y luego la pixelan:

- difusión o flow matching directamente a 64/128 px;
- alpha como variable independiente;
- embeddings de índices de paleta;
- pérdida de grid/pixel clusters;
- pérdidas de consistencia de identidad, huesos, edges y temporalidad;
- decodificador sin interpolación bilinear.

Esto evita que el modelo interprete los píxeles como textura o ruido de alta frecuencia.

### 3.6 Identity lock determinista

Mejora importante sobre un renderer puramente generativo:

- la cara/casco se copia del frame fuente cuando su transformación es solo traslación o rotación pequeña;
- props rígidos se transforman con nearest-neighbor desde anchors;
- solo se genera la zona de unión y las partes realmente articuladas;
- se mantiene una tabla de colores de identidad reservados;
- se detectan cambios no autorizados en emblemas, ojos, arma y accesorios.

El usuario podrá desbloquear la cabeza cuando la acción requiera giro o expresión.

### 3.7 Freeze, init e inpainting

El generador trabajará en ventanas pequeñas:

- primera pasada: frame 0 congelado → genera frames 1–2;
- siguiente: frames 1–2 congelados → genera frame 3;
- revisión: solo se regenera la región marcada de un frame;
- la fuerza del init aumenta automáticamente al acercarse al resultado aprobado.

No se encadena ciegamente la imagen anterior. Todos los pasos mantienen la referencia original y la geometría del rig.

### 3.8 Validador y selector de candidatos

Cada petición genera 2–4 candidatos baratos. Se puntúan antes de mostrarlos:

- error entre skeleton objetivo y skeleton reestimado;
- error de longitudes corporales;
- DINO/CLIP de identidad sobre regiones, no sobre el canvas completo;
- distancia de paleta y colores reservados;
- variación de silueta esperada frente a mera vibración;
- estabilidad del pivote y contacto de pies;
- alpha, sujetos duplicados y componentes desconectados;
- optical flow/continuidad con los frames vecinos;
- cierre del loop.

Se conserva el mejor candidato y se solicita juicio humano solo si no supera umbrales. Esto convierte los fallos en retries internos, no en créditos perdidos por el usuario.

## 4. Dataset propio

### 4.1 Registro necesario

Cada ejemplo debe contener:

```json
{
  "character_id": "...",
  "reference_frame": "...",
  "target_frame": "...",
  "skeleton": "...",
  "motion": "walk",
  "phase": "contact-left",
  "view": "side",
  "direction": "right",
  "palette": ["#..."],
  "protected_masks": ["head", "weapon"],
  "pivot": { "x": 0.5, "y": 0.94 },
  "pixel_scale": 2
}
```

### 4.2 Fuentes legales

- assets encargados expresamente para entrenamiento;
- paquetes con licencia que autorice entrenamiento y redistribución del modelo;
- sprites generados por un pipeline 3D/2D propio;
- contribuciones voluntarias con consentimiento explícito;
- assets de usuarios solo mediante opt-in separado y revocable.

No se debe entrenar con sprites extraídos de juegos ni asumir que una licencia de uso en juegos permite entrenamiento.

### 4.3 Escala del dataset

El artículo Sprite Sheet Diffusion consiguió una prueba prometedora con 619 pares, pero mostró sobreajuste. Objetivo por fases:

- prototipo: 10.000–25.000 pares, 300+ identidades;
- beta: 100.000+ pares, 2.000+ identidades;
- producción: 500.000+ frames diversos y balanceados por rig, vista y acción.

La diversidad de personajes importa más que multiplicar frames casi idénticos del mismo personaje.

### 4.4 Generación sintética

Para obtener esqueletos exactos:

- rigs 2D de piezas vectoriales/pixeladas;
- modelos 3D simples con cámaras ortográficas;
- bibliotecas propias de mocap/curvas procedurales;
- render a distintas proporciones, prendas y oclusiones;
- conversión a paletas y escalas de píxel variadas.

Después se mezcla con pixel art humano para evitar el aspecto rígido del render sintético.

## 5. Entrenamiento y evaluación

### Pérdidas

- difusión/flow matching base;
- pose heatmap loss;
- perceptual identity loss por región;
- palette/index loss;
- alpha boundary loss;
- bone-length consistency;
- temporal feature/flow loss;
- loop closure loss;
- penalización de duplicados y regiones protegidas alteradas.

### Separación de datos

Train/validation/test se separan por `character_id`, nunca por frame. Si un mismo personaje aparece en train y test, las métricas de identidad quedan invalidadas.

### Evals obligatorios

- personajes nunca vistos;
- cuerpos humanos, chibi, criaturas y mecánicos;
- props pequeños, capas, armas y elementos luminosos;
- 4/8 direcciones;
- idle, walk, run, attack, jump, hurt y death;
- tests adversariales con colores cercanos al fondo y oclusiones.

La aceptación combina métricas automáticas con revisión ciega de animadores.

## 6. Infraestructura

El Hetzner/Coolify actual continúa alojando la web, base de datos, archivos y cola. No es adecuado para inferencia de difusión si no tiene GPU.

El motor requiere un worker GPU bajo nuestro control:

```text
Coolify API → Redis/Postgres queue → SpriteForge GPU worker
                                   → object storage privado
                                   → callback firmado
```

El worker se empaqueta en Docker con PyTorch, Diffusers/entorno propio y pesos versionados. Puede estar en un servidor GPU dedicado o en una máquina de desarrollo durante el prototipo; no consume una API de generación externa.

Configuración inicial razonable:

- desarrollo/fine-tuning: 24 GB VRAM como mínimo práctico para adapters y lotes pequeños;
- entrenamiento temporal: 48–80 GB VRAM o gradient checkpointing/multi-GPU;
- inferencia: 16–24 GB VRAM tras optimización/quantization;
- web CPU separada del worker.

## 7. Mejoras respecto al flujo público de PixelLab

1. **Longitudes óseas bloqueadas matemáticamente**, no solo sugeridas por una imagen de pose.
2. **Rigs para criaturas y accesorios**, además del humano estándar.
3. **Identity lock regional determinista** para cabeza, emblemas y props rígidos.
4. **Selección automática de candidatos** y retry interno antes de cobrar.
5. **Confidence-aware UI:** solo pide corregir joints dudosos.
6. **Motion compiler con contactos/eventos**, útil para exportar a motores.
7. **Validación de loop y pivote** integrada.
8. **Modelo de salida nativa en grid y alpha**, no simple downscale.
9. **Versionado reproducible:** modelo, rig, plantilla, seed y parámetros guardados por frame.
10. **Corrección localizada sin destruir frames aprobados.**

## 8. Fases de implementación

### Fase 0 — ya iniciada

- esquema `spriteforge-skeleton-v1`;
- compilador/retargeting determinista;
- plantillas iniciales idle y walk;
- tests de conservación de huesos, loop y determinismo.

### Fase 1 — editor y pipeline sin modelo nuevo

- overlay editable de joints en canvas;
- importar/exportar rigs;
- ampliar plantillas;
- máscaras protegidas y anchors;
- preview esquelético antes de gastar GPU;
- persistencia de rigs y versiones en la biblioteca.

### Fase 2 — baseline self-hosted

- desplegar baseline pose-to-image abierto en una GPU propia;
- entrenar ControlNet/adapter de pose con dataset inicial;
- referencia de identidad e inpainting;
- comparar contra nuestras pruebas actuales.

### Fase 3 — temporal y freeze windows

- entrenamiento de ventanas 2–4 frames;
- frames congelados y máscara por frame;
- candidate ranking y retry;
- editor de regeneración selectiva.

### Fase 4 — modelo nativo de pixel art

- renderer de 64/128 px con alpha/paleta;
- rigs no humanos;
- ocho direcciones;
- optimización y autoscaling de workers.

## 9. Criterio para abandonar el baseline

No se publicará como función de pago hasta que, en un test de personajes no vistos:

- al menos 90 % de frames preserve identidad y accesorios sin retoque;
- al menos 85 % siga la pose objetivo;
- al menos 90 % mantenga pivote y escala;
- un clip de 4 frames necesite menos de una corrección localizada de media;
- idle no se pueda resolver mediante vibración global;
- walk y attack sean reconocibles sin conocer el prompt.

## 10. Referencias técnicas

- [PixelLab: Animate with skeleton](https://www.pixellab.ai/docs/tools/animate-with-skeleton)
- [PixelLab: init image strength](https://www.pixellab.ai/docs/options/init-image)
- [Sprite Sheet Diffusion](https://arxiv.org/abs/2412.03685)
- [ControlNet](https://github.com/lllyasviel/ControlNet)
- [HumanSD](https://arxiv.org/abs/2304.04269)
- [SPRITETOMESH](https://arxiv.org/abs/2602.21153)
- [Generating Pixel Art Character Sprites using GANs](https://arxiv.org/abs/2208.06413)
- [ComfyUI sprite pose workflow](https://github.com/Tidwell32/comfyui-sprite-generator)
