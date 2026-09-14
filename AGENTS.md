# SpriteForge — mapa técnico del proyecto

SpriteForge es una aplicación web para crear, normalizar, organizar y exportar arte pixelado para videojuegos. Este documento es el punto de entrada para una persona o IA sin contexto previo: explica qué vive en cada carpeta, cómo se conectan las piezas y dónde tocar según la tarea.

> **Regla principal:** el navegador solo renderiza la interfaz. Autenticación, créditos, pagos, claves de proveedores, almacenamiento privado y permisos se resuelven exclusivamente en `generator/`.

## Vista rápida

```text
Usuario
  │ HTTPS
  ▼
Traefik / Coolify (TLS y enrutado)
  ▼
spriteforge-visual (Nginx, frontend estático)
  ├─ HTML/CSS/JS del sitio
  └─ /api/* ────────────────────────────────┐
                                             ▼
                              spriteforge-generator-api (Node 22)
                              ├─ SQLite: usuarios, sesiones, créditos,
                              │  biblioteca, proyectos, temas y facturación
                              ├─ /data/assets: binarios privados
                              ├─ OpenAI GPT Image: generación de imágenes
                              ├─ Stripe: checkout, portal y webhook firmado
                              ├─ Resend: verificación y recuperación de cuenta
                              └─ Google OAuth: inicio de sesión externo
```

- **Frontend:** contenedor Nginx `spriteforge-visual`.
- **API:** contenedor Node `spriteforge-generator-api`, puerto interno `3002`.
- **Persistencia:** volumen `generator/data:/data`. No borrar: contiene base SQLite y archivos de usuarios.
- **Modelo público actual:** GPT Image (`gpt-image-2`). La API fuerza OpenAI aunque el cliente intente enviar otro proveedor.

### GitHub y flujo de trabajo

La carpeta local del proyecto es la fuente de código. Los secretos, datos de usuarios y configuración de cada entorno deben mantenerse fuera del repositorio.

Para trabajar desde otra máquina con acceso al repositorio:

```powershell
git clone https://github.com/adrianmartosm/spriteforge-visual-server.git
cd spriteforge-visual-server
Copy-Item generator/.env.example generator/.env
# Completar generator/.env con las claves reales del entorno
docker compose up -d --build
```

Flujo habitual para publicar cambios en GitHub (confirmar primero cuál es la rama activa; no asumir que siempre es `main`):

```powershell
git status
git add -A
git commit -m "Describe el cambio"
git push origin <rama-activa>
```

Publicar en GitHub y desplegar son pasos distintos. El mecanismo de despliegue puede usar una copia de los archivos sin metadatos `.git`, por lo que un `push` no garantiza que el entorno se reconstruya automáticamente.

No subir nunca `generator/.env`, `generator/data/`, bases SQLite, backups ni resultados generados. El repositorio los excluye mediante `.gitignore`. Cada entorno debe conservar sus secretos y su volumen de datos fuera del checkout; una actualización de código no debe sobrescribirlos.

## Arranque local y despliegue

### Requisitos

- Docker y Docker Compose.
- Node.js 22 si se ejecuta la API fuera de Docker (`node:sqlite` es necesario).
- `generator/.env` con valores válidos para las integraciones que se quieran habilitar. No se versiona ni se debe copiar en tickets, chats o frontend.

### Desarrollo/local

Desde la raíz del repositorio:

```powershell
docker compose up -d --build
```

El compose inicia frontend y API. En un despliegue con proxy, TLS termina en el proxy y el frontend envía `/api/*` a `generator-api:3002`, nunca a una IP fija.

Comprobaciones rápidas:

```powershell
curl http://localhost:3002/health
docker compose ps
node --test generator/test/*.test.mjs
```

### Despliegue

El entorno puede usar Docker Compose y un reverse proxy. Antes de actualizar, comprobar cómo se sincroniza el checkout y transferir únicamente los archivos necesarios; no copiar secretos ni datos persistentes.

```bash
cd /ruta/del/proyecto
docker compose build --pull=false spriteforge-visual generator-api
docker compose up -d spriteforge-visual generator-api
docker compose ps
```

Las credenciales y claves de despliegue viven fuera del repositorio. Antes de sustituir archivos, guardar una copia en el sistema de backups del entorno. Confirmar también que `generator/.env` existe y que `generator/data` sigue montado; ninguno debe copiarse ni sobrescribirse.

Para cambios solo de interfaz basta reconstruir `spriteforge-visual`. Si una funcionalidad toca rutas, prompts, autorización o persistencia, reconstruir también `generator-api`. Tras el arranque, comprobar los contenedores, `/health`, los logs recientes y que el dominio público sirve los nuevos módulos; usar parámetros `?v=` para invalidar caché cuando cambie JavaScript o CSS estático.

### Backups

- Script: `ops/backup-auth-db.sh`.
- Hace una instantánea SQLite consistente y empaqueta `/data/assets`.
- El entorno de producción guarda copias fuera del repositorio y conserva la política de retención definida por el operador.
- Para restaurar una biblioteca hacen falta **la base y los assets del mismo backup**.

## Estructura del repositorio

### Raíz: frontend, landing y herramientas locales

| Ruta | Responsabilidad |
| --- | --- |
| `index.html` | Documento base, importaciones CSS/JS y parámetros de versión para evitar caché. |
| `frontend/app.js` | Router SPA ligero y landing/marketing, precios, docs, legales, modal de login y funnel de Character Creator. |
| `frontend/site-analytics.js` | Métricas first-party de navegación y embudo; puente opcional a GA4 con consentimiento. |
| `frontend/app-studio.js` | Workspace `/app`: home, biblioteca, proyectos, temas, perfil, ajustes, soporte y visor de assets. |
| `frontend/app-studio.css` | Layout principal del workspace y barra lateral. |
| `frontend/glass-forge-production.css` | Hoja de estilos compilada que se carga en producción. |
| `frontend/responsive.css` | Reglas móviles históricas; modificar solo si la hoja activa las reutiliza. |
| `frontend/modal.css`, `frontend/app-viewer.css` | Fuentes de estilos de modales y visor de assets/animaciones. |
| `frontend/pricing.css`, `frontend/legal.css`, `frontend/docs.css` | Fuentes de estilos de precios, legales y documentación pública. |
| `frontend/cost-display.js`, `frontend/cost-display.css` | Presentación consistente de coste de créditos en editores. |
| `frontend/pixel-grid-core.js` | Procesado local de grid, snapping y cuantización; no gasta créditos. |
| `frontend/grid.css` | Estilos del detector público `/pixel-grid-detector`. |
| `frontend/character-creator.js`, `frontend/creator*.css` | Creador de personaje y normalización/controles de grid en funnel. |
| `frontend/asset-generator.js`, `frontend/asset-generator.css` | Creador de objetos, iconos, props, edificios y escenario. |
| `frontend/manual-editor.js`, `frontend/manual-editor.css` | Shell SpriteForge del editor manual: selector/upload, toolbar, historial, guardado y puente seguro con Piskel. |
| `pixel-editor/` | Piskel 0.15.2-SNAPSHOT vendorizado (commit `a6b9c02daefceb10093f71e92d52d16920ccb16e`), servido sin CDN. Incluye licencia y avisos de terceros. |
| `frontend/tileset.js`, `frontend/tileset.css` | Editor/generador de tilesets. |
| `frontend/asset-pack.js`, `frontend/asset-pack.css` | Constructor de packs; beta y visible solo a administradores. |
| `frontend/sprite-turnaround.js` | Generador admin para reconstruir otra orientación de un sprite de biblioteca. |
| `frontend/animation4.js`, `frontend/animation4.css` | Flujo público de animación. Las implementaciones anteriores viven en `archive/animation-experiments/` y son solo histórico. |
| `frontend/perspective-assets.js` | Recursos de perspectiva compartidos por creadores. |
| `assets/` | Logo, favicon, ejemplos, imágenes de showcase y recursos visuales estáticos. |
| `robots.txt`, `sitemap.xml` | SEO básico. |
| `nginx.conf` | Nginx estático, cabeceras de seguridad y proxy `/api/`. |
| `Dockerfile`, `docker-compose.yml` | Imágenes, servicios y etiquetas Traefik/Coolify. |

### `generator/`: backend y estado privado

| Ruta | Responsabilidad |
| --- | --- |
| `src/server.mjs` | Punto de entrada HTTP: rutas, validación, autorización, rate limit, cobro/devolución de créditos y módulos. |
| `src/auth.mjs` | Usuarios, scrypt + pepper, sesiones, CSRF, verificación, recuperación, Google OAuth, límites de registro, ledger y eventos Stripe. |
| `src/library.mjs` | Biblioteca: assets, archivos, proyectos, temas, referencias, colecciones, packs, tilesets, clips y jobs. |
| `src/billing-catalog.mjs` | Fuente única de planes y costes de créditos. |
| `src/stripe.mjs` | Checkout, portal y validación HMAC del webhook de Stripe. |
| `src/email.mjs` | Emails HTML de Resend. |
| `src/prompt-builder.mjs`, `src/recipes.mjs` | Recetas, validación y construcción de prompts. Los cambios de perspectiva controlados necesitan una rama especializada para no heredar bloqueos incompatibles del editor genérico. |
| `src/turnaround.mjs` | Validación compartida de proyección, direcciones y opciones de Sprite Turnaround. |
| `src/providers/openai.mjs` | Adaptador GPT Image usado por el producto. |
| `src/providers/gemini.mjs` | Adaptador de investigación/compatibilidad; no es el proveedor público forzado. |
| `src/providers/pixelengine.mjs` | Integración histórica/experimental. No reactivar sin revisar coste, proveedor y UI. |
| `src/local-background-cleanup.mjs` | Limpieza de matte magenta en outputs históricos. |
| `src/animation-export.mjs` | Exporta GIF y spritesheet. |
| `src/animation/` | Núcleo experimental de rig/skeleton y plantillas de movimiento. |
| `src/auth-admin.mjs`, `bootstrap-admin.sh` | Herramientas de administrador; ejecutar solo en entorno seguro. |
| `test/`, `evals/` | Tests y evaluación/investigación. `evals` no forma parte de una solicitud pública. |
| `data/` (no versionado) | En producción se monta como `/data`: SQLite y assets privados. |

Los documentos de `docs/research/` y `docs/TO_DO_LIST.md` documentan investigación y backlog. Son útiles como contexto, pero el código actual es la fuente de verdad para proveedores, precios y flujos.

## Rutas de interfaz y relación con módulos

No hay React/Vue ni build step: Nginx sirve módulos ES directamente. El router público vive en `frontend/app.js`.

| Ruta | Qué muestra | Código principal |
| --- | --- | --- |
| `/` | Landing/marketing, SEO y CTA del primer personaje. | `frontend/app.js`, `frontend/glass-forge-production.css` |
| `/app` | Workspace autenticado. | `frontend/app-studio.js`, `frontend/app-studio.css` |
| `/app?edit=<assetId>` | Editor manual de un asset privado. | `frontend/manual-editor.js`, `pixel-editor/` |
| `/character-creator` | Funnel fuera de `/app`; acepta el brief de la landing. | `frontend/app.js`, `frontend/character-creator.js` |
| `/asset-generator` | Generador de assets individuales. | `frontend/asset-generator.js` |
| `/tileset-base-generator` | Generador de tilesets. | `frontend/tileset.js` |
| `/pixel-grid-detector` | Detector/normalizador local de grid. | `frontend/app.js`, `frontend/pixel-grid-core.js` |
| `/pricing` | Planes y costes de `GET /api/billing/catalog`. | `frontend/app.js`, `frontend/glass-forge-production.css` |
| `/docs` | Documentación de producto. | `frontend/app.js`, `frontend/glass-forge-production.css` |
| `/verify-email`, `/reset-password` | Flujos de cuenta. | `frontend/app.js` + API auth |
| `/terms`, `/privacy`, `/refunds`, `/cookies` | Legales. | `frontend/app.js`, `frontend/glass-forge-production.css` |

En `/app`, `frontend/app-studio.js` monta el shell lateral y cambia vistas internas:

- **Home:** compositor rápido; envía el texto a Character, Asset Generator, Tileset o Animation.
- **My assets:** biblioteca privada.
- **Projects:** agrupación simple de assets.
- **Themes:** dirección visual persistente, tags, perspectiva, escala y hasta cinco referencias para planes elegibles.
- **Editores:** Character, Asset Generator, Manual Editor, Tileset y Animation. Asset Pack y Presets son beta/admin; Sprite Turnaround es una herramienta exclusivamente admin.
- **Visor:** zoom y exportación; en assets estáticos permite saltar a Animation y asignar proyecto.

## Flujos importantes

### Registro, login y sesión

1. El cliente llama `/api/auth/register` o `/api/auth/login`.
2. `auth.mjs` valida credenciales, aplica límite de red y escribe usuario/sesión en SQLite.
3. Para contraseña, Resend envía un token de verificación de un uso y 24 horas.
4. Hasta verificar email, la cuenta no puede generar ni usar créditos.
5. Sesión y CSRF van en cookies; operaciones con estado exigen CSRF y mismo origen.
6. Google OAuth entra por `/api/auth/google` y vuelve por `/api/auth/google/callback`.

Al tocar auth, revisar juntos `auth.mjs`, `email.mjs`, modales de `frontend/app.js` y estado de cuenta de `frontend/app-studio.js`. Nunca relajar una validación solo en frontend.

### Generación de un asset

1. El editor crea una receta: `subject`, tipo, perspectiva, pixel scale, tags y tema.
2. `POST /api/generate` llega a `server.mjs` con clave de idempotencia.
3. API exige usuario verificado, generador habilitado, rate limit y saldo.
4. `billing-catalog.mjs` calcula coste y `auth.mjs` descuenta de forma atómica/idempotente.
5. `library.mjs` resuelve tema y referencias.
6. `providers/openai.mjs` llama GPT Image y devuelve bytes.
7. `library.mjs` guarda asset, archivos privados y relaciones.
8. Ante fallo antes de completar, se marca job y devuelve crédito.
9. El cliente muestra resultado y My assets lo lista.

El proveedor que envía el navegador se ignora deliberadamente: `server.mjs` fija OpenAI para impedir que una petición fabricada altere modelo o costes.

### Grid y normalización

Grid, snap y paleta se procesan sobre todo en navegador mediante `pixel-grid-core.js`; no consumen créditos. Los creadores muestran original y game-ready, mientras `library.mjs` persiste archivos privados definitivos.

### Temas y referencias

Un tema se crea en `/api/themes`, se marca predeterminado en `/api/themes/default` y se resuelve inmediatamente antes de generar. Combina dirección visual, tags, escala, vista, paleta y referencias con la receta.

Las referencias son assets del propio usuario y se añaden mediante `/api/themes/:id/references`. La UI puede bloquearlas según plan, pero la autorización importante debe vivir en backend/library.

### Biblioteca, proyectos y exportación

- `GET /api/library` devuelve datos solo de la sesión actual.
- Proyectos: `POST /api/projects` y `PATCH /api/assets/:id/project`.
- Binarios privados: `/api/assets/:id/files/{original|game-ready|thumbnail|animation}` tras verificar propiedad.
- Exportación de animaciones: `/api/assets/:id/export/gif` y `/api/assets/:id/export/spritesheet`.

La interfaz pública de animación es `frontend/animation4.js`. Las implementaciones archivadas en `archive/animation-experiments/` no forman parte del runtime y deben tratarse como histórico.

### Editor manual de pixel art

`pixel-editor/` contiene una compilación local de [Piskel](https://github.com/piskelapp/piskel), distribuida bajo Apache 2.0. `frontend/manual-editor.js` la monta en un `iframe` del mismo origen y solo acepta mensajes cuyo origen y `contentWindow` coinciden. Piskel conserva capas, frames y paletas en su documento serializado; el backend guarda además PNG game-ready y GIF cuando hay más de un frame.

- Lectura: `GET /api/assets/:id/editor` y `GET /api/assets/:id/editor/revisions/:revisionId`.
- Guardado: `POST /api/assets/:id/editor/revisions`; conserva las últimas 20 revisiones.
- Derivado: `POST /api/assets/:id/editor/copies`; crea un hijo mediante `parent_asset_id`.
- Upload inicial: `POST /api/editor/uploads`; admite PNG, JPG o WebP de hasta 10 MiB.
- Seguridad: propiedad por sesión, CSRF en mutaciones, petición máxima de 32 MiB, documento máximo de 12 MiB, imágenes de 10 MiB, 1024×1024, 256 frames y 64 capas.

Antes de desplegar cambios del editor hay que ejecutar un backup coherente de SQLite y `/data/assets`, y desplegar frontend y backend juntos.

### Stripe y créditos

1. Pricing lee `/api/billing/catalog`.
2. Checkout: `POST /api/billing/checkout` para usuario verificado.
3. La redirección de éxito no concede créditos.
4. `/api/stripe/webhook` valida el cuerpo crudo con `STRIPE_WEBHOOK_SECRET`.
5. `auth.processStripeEvent` evita eventos duplicados y actualiza cliente, suscripción y grants.
6. `/api/billing/status` muestra estado; `/api/billing/portal` abre gestión Stripe.

Fuente única de costes: `generator/src/billing-catalog.mjs`.

| Acción | Coste actual |
| --- | ---: |
| Personaje/enemigo/NPC | 3 créditos |
| Asset individual | 3 créditos |
| Ítem de asset pack | 6 créditos |
| Tile de tileset | 3 créditos |
| Edición | 6 créditos |
| Animación | 25 créditos |

Planes definidos en código: Starter `$9 / 700`, Creator `$19 / 1.600`, Studio `$39 / 3.800`. Si se modifica un valor, revisar a la vez catálogo, Price ID de Stripe, marketing y pruebas de webhook.

### Métricas y conversiones

El sitio registra métricas first-party en la tabla SQLite `analytics_events`. No se guardan emails, IPs ni agentes de usuario; el navegador solo usa un identificador temporal por pestaña para distinguir sesiones anónimas. Los eventos actuales son:

- `page_view`: navegación de la SPA.
- `pricing_viewed`: visita de `/pricing`.
- `plan_selected`: clic en elegir Starter, Creator o Studio.
- `checkout_started`: Stripe creó correctamente una sesión de checkout.
- `signup_verified`: email verificado correctamente.
- `character_prompt_submitted`: alguien escribió un prompt en el CTA del hero y pulsó `Create`.
- `character_funnel_converted`: ese intento terminó en una cuenta creada/verificada; el resumen deduplica el intento mediante un identificador anónimo local.
- `animation_upload_submitted`: alguien subió una imagen desde el CTA de animación.
- `animation_funnel_converted`: ese upload terminó en una cuenta creada/verificada.
- `generation_completed`: generación de imagen o animación guardada.
- `purchase_completed` / `subscription_renewed`: grant de factura confirmado por webhook de Stripe.

El resumen está protegido para administradores:

```text
GET /api/analytics/summary
GET /api/analytics/summary?from=2026-08-01&to=2026-09-01
```

Si una visita llega con parámetros UTM, `site-analytics.js` conserva la atribución de último toque en el navegador y la adjunta a los eventos de navegación y embudo. Se aceptan `utm_source`, `utm_medium`, `utm_campaign`, `utm_ad`, `utm_audience`, `utm_term`, `utm_content` y `utm_id`. El resumen devuelve esas agrupaciones en `byAttribution`, separadas por evento. La atribución también viaja al Checkout de Stripe para que las compras y renovaciones confirmadas puedan conservar la campaña de origen.

La respuesta incluye totales, desglose por plan, serie diaria, `characterFunnel` y `animationFunnel`. Ambos bloques tienen `promptSubmissions`, `promptPeople`, `accountsCreated`, `convertedPeople` y `conversionRate`. El frontend envía eventos a `POST /api/analytics/events`; ese endpoint está limitado, valida el origen y solo acepta los eventos de navegación y funnel permitidos.

GA4 está preparado pero desactivado por defecto. Para activarlo, poner el Measurement ID `G-...` en el `meta[name="ga-measurement-id"]` de `index.html` y conceder `localStorage.spriteforge_analytics_consent = "granted"` desde el banner de consentimiento de la web. El puente usa `page_view`, `select_item` y `begin_checkout`; los eventos de registro, generación y compra siguen teniendo como fuente de verdad el servidor.

## Datos y dependencias

`auth.mjs` abre `SPRITEFORGE_AUTH_DB_PATH` (por defecto `/data/spriteforge-auth.db`) en SQLite WAL. `library.mjs` usa esa misma base y el directorio `SPRITEFORGE_ASSET_STORAGE_PATH`.

```text
users ──< sessions
  ├──< credit_ledger
  ├──< stripe_customers / stripe_credit_grants
  ├──< projects ──< assets ──< asset_files
  ├──< themes ──< theme_references ── assets
  ├──< collections
  ├──< asset_packs / asset_pack_items
  ├──< tilesets / tileset_tiles
  ├──< animation_clips / animation_frames
  └──< generation_jobs
```

No editar SQLite manualmente salvo mantenimiento y backup probado. Cambios de saldo deben pasar por el ledger, no por `UPDATE` directo.

### Variables de entorno

Se configuran en `generator/.env` o en variables seguras de Coolify. No poner valores en frontend ni documentación.

| Grupo | Variables |
| --- | --- |
| API/almacenamiento | `SPRITEFORGE_PORT`, `SPRITEFORGE_AUTH_DB_PATH`, `SPRITEFORGE_ASSET_STORAGE_PATH`, `SPRITEFORGE_GENERATOR_ENABLED` |
| Sesiones | `SPRITEFORGE_SESSION_SECRET`, `SPRITEFORGE_PASSWORD_PEPPER`, `SPRITEFORGE_AUTH_REQUIRE_HTTPS` |
| URL pública | `SPRITEFORGE_PUBLIC_URL`, `SPRITEFORGE_APP_ORIGIN` |
| OpenAI | `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` |
| Google OAuth | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` |
| Email/Resend | `RESEND_API_KEY`, `SPRITEFORGE_EMAIL_FROM` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_CREATOR`, `STRIPE_PRICE_STUDIO` |
| Legacy/experimental | `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`, `PIXEL_ENGINE_API_KEY`, `SPRITEFORGE_PIXELENGINE_ENABLED` |

También hay límites de generación en `server.mjs`: `SPRITEFORGE_GENERATION_RATE_LIMIT_WINDOW_MS` y `SPRITEFORGE_GENERATION_RATE_LIMIT_MAX`.

## Cómo abordar una tarea nueva

### Cambio visual

1. Identificar ruta y módulo: `frontend/app.js` para pública, `frontend/app-studio.js` para `/app`, o editor concreto.
2. Empezar por CSS específico; revisar `frontend/glass-forge-production.css` si es un token global; `frontend/glass-forge-production.css` solo para móvil.
3. Mantener desktop y móvil separados.
4. Si la caché impide validar un JS/CSS actualizado, cambiar el `?v=` correspondiente en `index.html` o importación de `frontend/app.js`.

### Cambio en generación

1. Empezar en `generator/src/server.mjs` y localizar endpoint.
2. Revisar `recipes.mjs`, `prompt-builder.mjs` y adaptador de proveedor.
3. Confirmar coste en `billing-catalog.mjs` y débito server-side antes del proveedor.
4. Mantener devolución ante fallo e idempotencia.
5. Confirmar que resultado queda persistido con propietario correcto por `library.mjs`.

Para herramientas basadas en una imagen privada existente, enviar al backend el identificador del asset en vez de confiar en bytes aportados por el navegador. El servidor debe verificar rol y propiedad, resolver la variante `game-ready` u original, usarla como ancla y guardar el resultado con relación al asset padre. Una herramienta admin debe ocultarse en `frontend/app-studio.js`, pero además exigir el rol en la API.

### Cambio en cuentas/pagos

1. Revisar `auth.mjs` y `stripe.mjs` antes de tocar UI.
2. No aceptar saldo, plan, usuario ni coste enviados por el navegador.
3. Stripe webhook firmado, no `?checkout=success`, es la autoridad.
4. Probar Stripe test mode antes de activar un Price/clave live.

### Cambio de datos

1. Revisar esquema y migraciones condicionales en `auth.mjs`/`library.mjs`.
2. Toda migración de columna/tabla debe ser idempotente.
3. Ejecutar `ops/backup-auth-db.sh` antes de operaciones materiales.
4. Verificar propiedad del usuario en cada endpoint nuevo.

## Verificación antes de entregar

- Probar sesión normal y admin si hay controles beta.
- Probar escritorio y móvil si hay UI/CSS.
- Probar usuario sin verificar y verificado si se toca generación.
- Probar saldo insuficiente, fallo de proveedor e idempotencia si se toca cobro.
- Probar acceso de otro usuario si hay lectura/escritura de biblioteca.
- Ejecutar tests Node y comprobar `/health` y `docker compose ps`.

## Precauciones operativas

- No incluir `generator/.env`, SQLite, `/data/assets` ni logs con tokens en frontend, imágenes o repo.
- Mantener reglas de `nginx.conf` que bloquean `/generator/`, dotfiles y extensiones de DB/secretos.
- Rotar claves de OpenAI, Stripe, Resend, Google y proveedores experimentales si aparecen en chat, commit o captura.
- El admin puede ser `credit_exempt`; probar ambas ramas al cambiar cobros.
- No confiar en botones ocultos: servidor valida sesión, CSRF, email verificado, rol y propiedad.
- Algunos README/planes históricos de `generator/` conservan cifras antiguas. Para operación actual usar `billing-catalog.mjs`, `server.mjs` y el `.env` de producción.

## Orden recomendado de lectura para un agente nuevo

1. Este `AGENTS.md`.
2. `docker-compose.yml` y `nginx.conf`.
3. `frontend/app.js` y `frontend/app-studio.js`.
4. Editor específico de la tarea.
5. `generator/src/server.mjs`.
6. `auth.mjs`, `library.mjs` y `billing-catalog.mjs` antes de tocar usuarios, datos o créditos.
7. CSS específico y `frontend/glass-forge-production.css` si afecta a móvil.

Con ese recorrido se localiza casi cualquier funcionalidad sin depender del historial del proyecto.
