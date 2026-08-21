# Rúbrica A/B de SpriteForge

Evaluar a ciegas: ocultar proveedor, modelo y prompt antes de puntuar. Cada imagen recibe una nota 1–5 por criterio.

| Criterio | 1 | 3 | 5 |
| --- | --- | --- | --- |
| Legibilidad a tamaño final | Irreconocible después de snap | Se entiende con esfuerzo | Silueta y rasgos se leen inmediatamente |
| Dirección pixel-art | Pintura/borroso, anti-aliasing visible | Algunos clusters correctos | Clusters limpios y apropiados para postproceso |
| Fidelidad al brief | Omite rasgos clave | Cumple el sujeto principal | Cumple sujeto, pose, vista, composición y restricciones |
| Fondo y recorte | Fondo complejo o sujeto cortado | Fondo mayormente uniforme | Fondo de clave limpio, sujeto completo con padding |
| Paleta | Demasiados tonos sin jerarquía | Reducible con pérdidas | Ya organizada en grupos de color legibles |
| Escala de píxel | Microdetalle o dithering en partes aisladas | Alguna inconsistencia menor | Una única escala de clusters en cuerpo, cara y accesorios |
| Consistencia (solo poses/hojas) | Rediseña el personaje | Mantiene algunos rasgos | Mantiene identidad, ropa, proporciones y orientación |
| Preparación de frame (solo poses/hojas) | No segmentable/alineable | Requiere corrección significativa | Canvas, base y padding razonables |

Además registrar por resultado: latencia, coste informado por proveedor, número de intentos, error/retry, fondo eliminado (sí/no), artefactos (texto, watermark visual, miembro extra, crop, duplicado), y decisión `reject | candidate | approved`.

## Umbrales

- Asset individual pasa a candidato: media ≥ 4, ninguna nota < 3 en legibilidad/fidelidad/fondo/escala de píxel.
- Pose pasa: media ≥ 4 y consistencia ≥ 4.
- Hoja exploratoria pasa: cada panel segmentable; no se publica como final sin validar cada frame.
- Un proveedor gana una categoría solo con una diferencia ≥ 0,35 de media y al menos 10 ejemplos de esa categoría.
