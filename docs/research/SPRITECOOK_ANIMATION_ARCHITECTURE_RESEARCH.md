# SpriteCook Animation: arquitectura observada y propuesta para SpriteForge

Fecha de revisión: 11 de agosto de 2026.

## Objetivo

Determinar por qué el flujo de animación de SpriteCook conserva mejor la identidad que nuestra primera versión, y traducirlo a una arquitectura propia sin asumir acceso a su backend ni copiar implementación propietaria.

Este documento separa expresamente tres niveles de certeza:

- **Confirmado:** comportamiento documentado o visible en la aplicación.
- **Contrato observado:** forma de las peticiones construidas por el cliente web; no revela el modelo servidor.
- **Inferencia:** explicación técnica probable a partir de esos comportamientos.

## 1. Lo confirmado públicamente

SpriteCook ofrece tres operaciones distintas:

1. **Animate Sprite:** recibe un sprite fuente y una descripción de movimiento, y produce una animación completa.
2. **Frame Animation:** toma el frame 1 como ancla, permite colocar referencias en posiciones concretas y genera los huecos restantes.
3. **Frame Editor / Retake:** permite conservar frames aprobados y regenerar solamente una parte.

Restricciones y controles visibles:

- sprites pixel art de hasta 256×256;
- de 2 a 16 frames para pixel art;
- frame fuente, prompt de movimiento, prompt negativo, seed y eliminación de fondo;
- hasta 8 referencias en el editor, aunque recomiendan normalmente entre 2 y 4;
- margen compartido, margen seguro, alineación, posición, espejo y canvas power-of-two;
- todos los frames se llevan a un canvas común antes de animar;
- salida animada y spritesheet.

Fuentes: [Animate a Sprite](https://www.spritecook.ai/docs/guide-animate-sprite), [Frame Animation](https://www.spritecook.ai/docs/guide-frame-animation), [Frame Editor](https://www.spritecook.ai/docs/guide-frame-editor), [Framing & Alignment](https://www.spritecook.ai/docs/guide-framing-alignment) y [API](https://www.spritecook.ai/api-docs).

## 2. Contratos observados en el cliente

La aplicación separa tres trabajos de servidor:

- `animate`: sprite fuente + movimiento + número de frames + configuración visual;
- `keyframes`: sprite fuente + referencias completas indexadas + total de frames;
- `retake`: animación existente + intervalo continuo que se debe rehacer.

Antes de un trabajo con keyframes, el cliente:

1. calcula los límites máximos de las referencias;
2. elige un único tamaño de canvas;
3. aplica a cada referencia la misma política de margen, alineación, recorte y power-of-two;
4. verifica que todas las imágenes resultantes tengan dimensiones idénticas;
5. envía cada referencia con su índice temporal y fuerza de condicionamiento.

La selección de operación sigue aproximadamente esta jerarquía:

- si existen ediciones explícitas de frames, usa keyframes;
- si se selecciona un intervalo continuo de una animación existente, usa retake;
- si hay frames de referencia, usa keyframes;
- en otro caso, crea una animación nueva.

Los ajustes de canvas se guardan por asset y modo de animación. Esto evita recalcular encuadre, escala y pivote de una manera diferente en cada intento.

## 3. Inferencia sobre el backend

### Alta confianza

SpriteCook **no parece hacer una petición independiente de generación de imagen por cada frame**. El resultado llega como una secuencia coherente y sus tres endpoints trabajan con una animación como unidad. Es probable que utilice un modelo especializado de animación o image-to-video, más una capa propia de normalización de pixel art.

La consistencia proviene de cuatro mecanismos combinados:

1. condicionamiento temporal conjunto;
2. ancla de identidad en el sprite fuente;
3. referencias colocadas en posiciones temporales conocidas;
4. un canvas, encuadre y pivote compartidos.

### Confianza media

El pipeline probable es:

1. decodificar y normalizar el sprite;
2. componerlo sobre un matte neutro para el modelo;
3. generar una secuencia latente completa o rellenar temporalmente entre keyframes;
4. eliminar el fondo frame a frame;
5. estabilizar encuadre, escala y pivote;
6. normalizar píxel, paleta y transparencia;
7. empaquetar WebP/GIF/spritesheet.

`retake` probablemente realiza inpainting temporal o regeneración condicionada del intervalo, manteniendo los frames exteriores como fronteras. Que solo admita un intervalo continuo es una señal fuerte de este diseño.

### No confirmado

No es posible determinar desde el cliente:

- el modelo exacto;
- si es propio, ajustado o servido por un tercero;
- las pérdidas o datos utilizados;
- si la normalización de pixel art ocurre antes, después o en ambas fases;
- el grado de intervención determinista frente al generativo.

## 4. Por qué Animation 1 de SpriteForge falla actualmente

Nuestra primera implementación pide imágenes de frames de manera esencialmente independiente. Aunque se reenvíe el sprite fuente y se endurezca el prompt, el modelo puede reinterpretar identidad, proporciones, escala, iluminación o silueta en cada llamada.

Esto produce los fallos observados:

- personajes distintos entre frames;
- escalas y posiciones incompatibles;
- frames diminutos o encuadres variables;
- animaciones que vibran en lugar de articularse;
- coste multiplicado por el número de frames;
- imposibilidad de regenerar un intervalo conservando continuidad real.

No se corrige definitivamente añadiendo más texto al prompt. Es un problema de arquitectura y condicionamiento temporal.

## 5. Arquitectura propuesta para Animation 1

### 5.1 Contrato persistente

Cada clip debe guardar:

- source asset y versión;
- modo, prompt, negative prompt, seed y tema;
- frame count, FPS y loop;
- canvas compartido, escala, alineación y pivote;
- estado de cada frame: vacío, referencia, generando, listo, fallido o marcado para rehacer;
- procedencia y versión de cada frame;
- intervalos de regeneración.

### 5.2 Preprocesador único

Toda fuente o referencia debe atravesar exactamente el mismo normalizador:

1. transparencia limpia;
2. bounds alfa;
3. canvas objetivo compartido;
4. safe margin;
5. alineación y pivote;
6. nearest-neighbor;
7. validación de dimensiones, paleta y escala.

No se debe mandar una referencia si no coincide píxel por píxel en dimensiones de canvas con las demás.

### 5.3 Tres operaciones de producto

#### Generate sequence

Fuente + motion prompt -> secuencia completa. Debe utilizar un proveedor capaz de procesar movimiento temporal en una sola operación; no una llamada de imagen independiente por frame.

#### Fill keyframes

Fuente + 1–8 keyframes indexados -> generación de huecos. Los frames fijados no se modifican. La UI debe permitir subir, elegir de biblioteca, reordenar e insertar.

#### Retake range

Animación existente + rango continuo + corrección -> solo se reemplaza ese intervalo. Los frames anterior y posterior actúan como fronteras temporales.

### 5.4 Postprocesado determinista

Después de la IA:

- separación de frames;
- background cleanup protegido;
- detección de escala/grid común para todo el clip;
- estabilización de pivote y baseline;
- normalización de paleta opcional común;
- rechazo automático de frames con tamaño, silueta o identidad fuera de tolerancia;
- exportación sin interpolación de imagen.

## 6. Estrategia de proveedor

### Camino recomendado

Evaluar un proveedor de image-to-video o generación de secuencia que acepte imagen inicial y, preferiblemente, frames de inicio/fin o referencias. La salida de vídeo no se utilizaría directamente: se muestrea a los frames objetivo y se normaliza como pixel art.

### Fallback mientras se valida proveedor

Para no bloquear el producto:

1. generar únicamente 1–3 poses clave con IA;
2. pedir al usuario que apruebe/corrija las poses;
3. interpolar movimiento localmente solo cuando la geometría lo permita;
4. usar la generación local Animation 2 para rigs compatibles;
5. reservar generación por frame independiente como modo experimental, claramente marcado.

Este fallback no resuelve cofres que se abren, oclusiones complejas o miembros ocultos; por eso no sustituye al generador temporal.

## 7. Mejoras sobre SpriteCook

- separar explícitamente referencias de **identidad**, **pose** y **estilo**;
- mostrar qué frames están bloqueados y cuáles puede cambiar la IA;
- validador visual de pivote, baseline y silueta antes de cobrar/aprobar;
- comparar retake con original mediante onion skin y diferencia alfa;
- conservar todas las versiones y permitir volver atrás;
- escoger automáticamente entre rig local y generación temporal según el tipo de movimiento;
- mostrar una estimación de coste antes de ejecutar;
- registrar métricas de identidad, jitter, loop closure y píxeles fuera de paleta.

## 8. Plan de implementación

### Fase A — editor y datos

- timeline persistente;
- upload/biblioteca de keyframes;
- canvas compartido y validaciones;
- estados por frame y reintentos;
- selección de intervalo para retake.

### Fase B — adapter temporal

- interfaz interna común `generateSequence`, `fillKeyframes`, `retakeRange`;
- primer proveedor temporal detrás del adapter;
- jobs asíncronos, progreso y cancelación segura;
- coste transaccional e idempotencia.

### Fase C — normalización y evaluación

- background removal y grid por secuencia;
- baseline/pivot lock;
- scoring de identidad y jitter;
- rechazo o regeneración automática de frames defectuosos;
- pruebas con personajes, cofres, puertas, efectos y elementos de escenario.

### Fase D — producción

- export WebP, GIF, PNG sheet y JSON;
- presets por tipo de asset;
- retake y versionado completo;
- métricas de calidad y coste por proveedor.

## 9. Criterio de aceptación

Una animación no se considera apta porque “se mueve”. Debe cumplir:

- misma identidad y accesorios en todos los frames;
- baseline estable salvo movimiento vertical intencional;
- escala y canvas constantes;
- ciclo cerrado cuando `loop=true`;
- ausencia de halos, agujeros y píxeles semitransparentes accidentales;
- silueta legible y movimiento semánticamente correcto;
- regeneración parcial sin alterar frames bloqueados.

