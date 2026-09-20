# Web/PWA Deployment — v3.0.1-web.1

This is a static GitHub Pages site. Place the repository files directly at the repository root.

Settings → Pages:
- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/(root)**

The PWA service worker caches the evaluator shell for offline reopening after it has been loaded/installed. Records remain in browser-local storage; no application record is transmitted by v3.0.1-web.1.
