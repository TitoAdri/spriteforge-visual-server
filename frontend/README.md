# Frontend

The browser application is intentionally build-free: Nginx serves these ES modules and styles directly. `app.js` is the SPA entry point and `glass-forge-production.css` is the stylesheet loaded by `index.html`.

The other modules are kept together here so the repository root can stay focused on deployment and project documentation. Imports use `/frontend/...` URLs because the site is served from the repository root.
