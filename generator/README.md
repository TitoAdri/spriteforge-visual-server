# SpriteForge generation kit

Preparación local para evaluar e implementar generación de assets de juego con dos proveedores:

- **OpenAI GPT Image 2** (`gpt-image-2`)
- **Google Nano Banana 2** (`gemini-3.1-flash-image`)

Nada de esta carpeta está conectado a la web pública ni realiza llamadas sin que se proporcionen claves. Las claves se leen únicamente de variables de entorno en el backend o el ejecutor de evaluación.

## Contenido

- `src/prompt-builder.mjs`: convierte una receta de asset en un prompt de producción consistente.
- `src/recipes.mjs`: esquema, presets y validación de recetas independientes de proveedor.
- `src/providers/`: adaptadores de OpenAI y Gemini, con una respuesta normalizada.
- `src/server.mjs`: API local mínima que mantendrá las claves fuera del navegador.
- `evals/briefs.json`: banco A/B inicial de 40 briefs.
- `evals/run-evaluation.mjs`: ejecutor de las pruebas cuando existan credenciales.
- `evals/RUBRIC.md`: rúbrica de revisión humana y métricas.

## Inicio cuando existan claves

1. Copiar `.env.example` a `.env` y completar solo las claves que se vayan a usar.
2. Ejecutar las pruebas de contrato y prompts:

   ```powershell
   node --test generator/test/*.test.mjs
   ```

3. Ejecutar un proveedor o ambos. No se guardan secretos en recetas, logs ni resultados:

   ```powershell
   $env:OPENAI_API_KEY = "..."
   node generator/evals/run-evaluation.mjs --provider=openai --tier=draft

   $env:GEMINI_API_KEY = "..."
   node generator/evals/run-evaluation.mjs --provider=gemini --tier=draft
   ```

4. Para ejecutar ambos y producir manifiestos comparables:

   ```powershell
   node generator/evals/run-evaluation.mjs --provider=both --tier=draft
   ```

El evaluador guarda únicamente imágenes y manifiestos en `generator/evals/results/` (ignorado por Git). Después se hace revisión humana con la rúbrica. El modo `final` usa configuraciones de mayor coste y se debe ejecutar sobre los candidatos aprobados, no sobre los 40 briefs de golpe.

## Arquitectura de integración

```text
Browser -> /api/generate (nuestro backend) -> provider adapter -> proveedor IA
                                              -> receta + imagen ancla
Browser <- asset normalizado <- postprocess <- fondo/alfa + grid + paleta
```

La API pública del backend trabaja con una receta neutral. El modelo específico, ID de interacción y parámetros del proveedor se guardan como metadatos de versión; nunca se exponen claves al navegador.

## Límites deliberados de esta primera base

- Aún no está incorporada al `docker-compose.yml` ni desplegada: evita activar una superficie de gasto antes de recibir y probar las claves.
- La eliminación de fondo, normalización por pivote y empaquetado están definidos como contrato en `normalization-spec.mjs`; se conectarán al motor de imagen al implementar el editor.
- El ejecutor no puntúa estética automáticamente. Genera evidencia y manifiestos para evaluación humana ciega; esa decisión no debe automatizarse sin un eval validado.
