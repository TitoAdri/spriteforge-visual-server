# SpriteForge — backlog hacia producto vendible

Documento vivo. Última actualización: 30 de julio de 2026.

## Estado actual

- Sitio público y área `/app` desplegados en `https://spriteforge.xyz`.
- Pixel Grid Detector funciona localmente en el navegador: detección, malla manual, paleta, descarga y vista ampliada.
- Character Creator genera y normaliza cuando el generador está habilitado; actualmente está apagado por coste y seguridad.
- El flujo de composición de fondo protegido y limpieza de croma se encuentra implementado para la normalización game-ready.
- Base de autenticación, sesiones y créditos desplegada, pero **bloqueada de forma intencionada mientras el sitio sólo tenga HTTP por IP**.
- Modo de autenticación HTTP de pruebas temporalmente activo en la IP actual. No es apto para usuarios reales, pagos ni datos valiosos; debe desactivarse al activar HTTPS.
- La interfaz App incluye prototipos navegables de biblioteca, proyectos, temas, referencias, presets y detalle de asset. Todavía no son persistentes.

## Principios no negociables

- No activar registro, login, generación de pago ni créditos sobre HTTP.
- El proveedor de IA y sus claves nunca llegan al navegador.
- Un débito de tokens debe ser atómico, trazable e idempotente.
- Un asset aprobado debe guardar procedencia: proveedor, modelo, recipe, prompt final, tema/versionado, referencias, malla y paleta.
- Las referencias de identidad y las referencias de estilo son entidades distintas.
- El procesamiento de malla, paleta y transparencia se hace localmente cuando sea viable; el servidor sólo asume lo imprescindible.

---

## P0 — Seguridad y lanzamiento técnico

### HTTPS, red y operaciones

- [ ] Asociar un dominio al servicio en Coolify y activar certificado TLS válido.
- [ ] Confirmar que el dominio carga por HTTPS y fuerza redirección HTTP → HTTPS.
- [ ] Retirar la exposición pública directa de `:3001`; dejar el servicio accesible sólo por el proxy HTTPS de Coolify o en loopback.
- [ ] Configurar correctamente la cadena de proxy confiable para `X-Forwarded-Proto`; nunca confiar en una cabecera enviada directamente por Internet.
- [ ] Verificar que las cookies `__Host-` se emiten, son `Secure`, `HttpOnly`, `SameSite` y no llegan por HTTP.
- [ ] Crear el administrador mediante `generator/bootstrap-admin.sh` desde una terminal interactiva, sin compartir contraseña en chat ni argumentos de shell.
- [ ] Guardar secretos de sesión, pepper y APIs en secretos de Coolify/gestor de secretos, no como configuración visible ni en Git.
- [ ] Configurar backups cifrados y probados del volumen `generator/data` (base de usuarios y ledger).
- [ ] Añadir alertas de proceso caído, espacio de disco, reinicios, errores 5xx y picos de peticiones.
- [ ] Añadir rotación documentada de secretos que invalide sesiones de forma controlada.

### Autenticación y cuentas

- [ ] Probar manualmente registro, login, logout, expiración de sesión, CSRF, bloqueo de intentos e idempotencia bajo HTTPS.
- [ ] Implementar verificación de email antes de permitir compras o generación de pago.
- [ ] Elegir proveedor de correo transaccional y configurar SPF, DKIM y DMARC del dominio.
- [ ] Implementar recuperación de contraseña con token de un solo uso, expiración y rate limit.
- [ ] Implementar cambio de contraseña, cierre de todas las sesiones y gestión de dispositivos/sesiones activas.
- [ ] Añadir MFA para administrador antes de abrir la plataforma a clientes.
- [ ] Añadir OAuth de Google como identidad vinculable al modelo `user_identities`; posteriormente GitHub/Discord si aporta valor.
- [ ] Escribir política de contraseñas, términos, privacidad, borrado de cuenta y exportación de datos.
- [ ] Realizar revisión de seguridad externa antes de aceptar pagos.

### Créditos y generación

- [ ] Conectar Character Creator al estado autenticado y enviar CSRF + idempotency key al generar.
- [ ] Mostrar saldo real y coste antes de confirmar cada generación.
- [ ] Definir tabla de costes por proveedor/modelo/tamaño/calidad y versionarla en servidor.
- [ ] Registrar una generación con estado (`queued`, `running`, `succeeded`, `failed`, `refunded`) para que un timeout no produzca cargos duplicados.
- [ ] Añadir límites por usuario y por IP, cola de trabajos y concurrencia máxima global.
- [ ] Probar debit/refund ante error de proveedor, timeout, desconexión y reintento.
- [ ] Crear consola de administrador: usuarios, saldo, ledger, ajustes manuales auditados, rate limits y bloqueo de cuenta.
- [ ] Mantener `SPRITEFORGE_GENERATOR_ENABLED=false` hasta completar los puntos anteriores y activar sólo desde consola.

---

## P1 — Biblioteca, proyectos, temas y referencias persistentes

### Persistencia de producto

- [x] Añadir entidades de proyecto, tema, asset, referencia, preset, colección y generación a la base de datos.
- [ ] Sustituir los datos de demostración actuales de `/app` por datos reales del usuario autenticado.
- [x] Crear almacenamiento privado para originales, PNG normalizados y miniaturas; nunca guardar base64 de imágenes en la base de datos.
- [ ] Usar URLs firmadas, límites de MIME/tamaño, hashes para deduplicación y borrado de objetos al eliminar un proyecto.
- [ ] Implementar subida de referencias con validación de formato, dimensiones y límite de peso.
- [ ] Guardar cada asset aprobado con su original, versión game-ready, metadata y enlace al padre si es variante.

### Temas persistentes

- [ ] CRUD de temas por proyecto: nombre, versión, etiquetas, prompt direction, perspectiva, escala, malla, paleta, reglas de contorno/sombreado y política de fondo.
- [ ] Mantener un tema activo por proyecto y conservar la versión exacta usada por cada asset.
- [ ] Permitir referencias de estilo aprobadas dentro de un tema (máximo dos).
- [ ] Mostrar qué partes de un prompt provienen del tema, las referencias y el brief del usuario.
- [ ] Importar/exportar paquete de tema (`JSON`, paleta y referencias autorizadas).

### Referencias y variantes

- [ ] Selector de referencias real desde biblioteca y upload, no sólo interfaz.
- [ ] Separar claramente `Style references: 0–2` de `Identity reference: 0–1`.
- [ ] Implementar “Use settings”, “Use as style reference” y “Create variant / edit” con metadata real.
- [ ] Guardar traits bloqueados de identidad: silueta, vestuario, accesorios, arma, colores y proporción.
- [ ] Crear grafo de procedencia: base → variante → edición → animación/spritesheet.
- [ ] Vista de comparación: original, normalizado, malla, paleta y diferencias frente a la referencia base.

---

## P2 — Generación de assets game-ready

### Character Creator

- [ ] Conectar las tarjetas de perspectiva a generación real: platformer, isometric y top-down.
- [ ] Persistir etiquetas de estilo y temas en la recipe del backend.
- [ ] Implementar escala visual entendible para usuario: píxel grueso, medio, fino y preview de objetivo.
- [ ] Añadir selector de resolución/malla final con auto-detección y opción manual.
- [ ] Guardar la respuesta del proveedor como original y ejecutar normalización antes de permitir aprobación.
- [ ] Añadir regeneración de variaciones con coste y procedencia clara.
- [ ] Añadir editor de cambios de personaje: “misma identidad, nueva pose/equipamiento/expresión”.

### Calidad de imagen y normalización

- [ ] Consolidar y probar el pipeline: composición de croma protegido → limpieza → recorte → detección de malla → snap → paleta → transparencia final.
- [ ] Crear tests con corpus de fondos fucsia, personajes con accesorios morados, huecos internos, brillos y anti-aliasing.
- [ ] Añadir modo avanzado de eliminación de fondo (segmentación o alpha nativo) sólo si mejora al croma protegido sin borrar partes del personaje.
- [ ] Añadir detección/advertencia de halo, color de fondo residual, transparencia semitransparente, exceso de colores y malla incoherente.
- [ ] Añadir validación de ancla de pies y margen de sprite para personajes.
- [ ] Refinar prompts de ambos proveedores para prohibir aura, bloom, partículas, rayos y luz emitida no solicitada.
- [ ] Mantener una batería de evaluaciones Nano Banana 2 / GPT Image 2 con briefs, resultados, coste y rúbrica.

### Otras herramientas

- [ ] Convertir Asset Generator en flujo funcional para props, UI, enemigos, fondos e iconos.
- [ ] Implementar Asset Pack: lista de assets, consistencia de tema, estados de trabajo y revisión individual.
- [x] Implementar Tileset: colecciones persistentes, tamaño de tile, cola por tile, reparación de bordes opuestos y previsualización 3×3. Falta la fase de autotiles de transición entre materiales distintos.
- [ ] Completar Tileset Base Generator o marcarlo honestamente como “próximamente”; ahora es sólo interfaz.
- [ ] Añadir editor de asset: crop, resize, recolour, cleanup, slicer y preview sobre fondos; decidir qué se hace local y qué requiere servidor.

---

## P3 — Animación, spritesheets y exportación

- [x] Definir arquitectura del motor nativo de animación sin APIs de sprites externas (`SPRITEFORGE_NATIVE_ANIMATION_ENGINE.md`).
- [x] Crear esquema de esqueleto, retargeting determinista y plantillas iniciales idle/walk con tests.
- [ ] Implementar editor visual de joints, confianza, regiones protegidas y anchors de accesorios.
- [ ] Persistir rigs versionados por asset y permitir importar/exportar `spriteforge-skeleton-v1`.
- [ ] Construir dataset legal pose/reference/target separado por identidad y herramientas de anotación.
- [ ] Entrenar baseline propio pose-to-image con referencia, pose guider, alpha, paleta, init e inpainting.
- [ ] Añadir entrenamiento temporal por ventanas, frames congelados y selección automática de candidatos.
- [ ] Desplegar worker GPU privado desacoplado del servidor web de Coolify.
- [ ] Desactivar como producto final la animación mediante modelos generalistas hasta superar los evals de identidad y movimiento.
- [ ] Diseñar flujo de animación desde un asset aprobado: idle, walk, run, attack, jump, hurt y death.
- [x] Definir contrato de frame: número de frames, looping, márgenes, ancla de pies, dirección y transparencia.
- [x] Implementar generación y regeneración selectiva de frames antes de ensamblar spritesheet.
- [ ] Ampliar el Animation Studio ya funcional con drag-to-reorder, duración editable, duplicar/eliminar, upload de keyframes y onion skin manual.
- [ ] Slicer real para dividir una imagen en assets o frames.
- [x] Exportar PNG spritesheet horizontal + JSON genérico con rects, pivote, duración, FPS y loop.
- [ ] Exportar primero a Godot (`SpriteFrames`/atlas) y Unity; documentar Phaser/GameMaker mediante JSON genérico.
- [ ] Validar dimensiones consistentes, alpha, ancla y límites de textura antes de exportar.

---

## P4 — Experiencia de producto y comercialización

### Interfaz y accesibilidad

- [ ] Revisar todas las rutas de `/app`: Projects, Themes, Presets, detalle de asset y herramientas aún contienen datos/UI de demostración.
- [ ] Añadir estados vacíos, loading, error, offline, cuota agotada y mantenimiento.
- [ ] Revisar responsive móvil, teclado, focus visible, lector de pantalla y contraste.
- [ ] Localizar de forma coherente la interfaz: inglés/español y formato de créditos.
- [ ] Permitir guardar/recuperar borradores de brief en el navegador y después en cuenta.
- [ ] Mantener una guía de diseño propia; inspirarse en patrones de producto, no reutilizar código ni recursos propietarios de terceros.

### Pagos y planes

- [ ] Elegir proveedor de pagos (Stripe recomendado por madurez) y modelo: paquetes, suscripción, créditos mensuales y recargas.
- [ ] Crear productos/precios, checkout, portal de cliente, recibos e impuestos según jurisdicción.
- [ ] Consumir webhooks de pago con firma verificada e idempotencia; nunca acreditar tokens desde el cliente.
- [ ] Ledger separado por compra, bonus, devolución, gasto y ajuste administrativo.
- [ ] Mostrar historial de tokens, vencimiento si aplica y factura.
- [ ] Implementar límites antifraude, revisiones manuales y política de reembolso.

### Legal, soporte y lanzamiento

- [ ] Términos de uso, política de privacidad, cookies, reembolsos y política de contenido.
- [ ] Política sobre propiedad/uso comercial de assets generados y sobre referencias subidas por usuario.
- [ ] Página de estado, soporte/contacto, reporte de contenido y canal de incidencias.
- [ ] Analítica respetuosa con consentimiento y sin capturar prompts/imágenes privadas por defecto.
- [ ] Prueba beta cerrada con usuarios reales, seguimiento de coste por asset útil y tasa de aprobación.
- [ ] Auditoría de rendimiento/coste y plan de escalado antes de campaña de pago.

---

## Investigación ya disponible

- `SPRITEFORGE_NATIVE_ANIMATION_ENGINE.md` — arquitectura propia de rig, modelo, dataset, entrenamiento, worker y evaluación.
- `ANIMATION_REAL_WORLD_WORKFLOWS_RESEARCH.md` — análisis de flujos prácticos y evidencia externa.
- `SPRITE_GENERATION_RESEARCH.md` — prompting, evaluación y proveedores de imagen.
- `SPRITECOOK_FEATURE_BACKLOG.md` — panorama de funcionalidades observadas públicamente.
- `REFERENCE_LIBRARY_AND_THEMES_RESEARCH.md` — diseño de temas/referencias persistentes.
- `SPRITECOOK_AUTHENTICATED_APP_RESEARCH.md` — auditoría del producto autenticado: biblioteca, presets, assets y acciones.

## Próxima tarea recomendada

**Persistir biblioteca, proyectos, temas y assets del usuario (P1)**. Es el siguiente bloque de valor real que no depende de activar generación ni de tener dominio HTTPS, y convierte la interfaz App en un producto utilizable antes de abrir el acceso público.
