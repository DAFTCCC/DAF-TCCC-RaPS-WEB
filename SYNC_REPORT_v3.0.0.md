# Synchronization Report — APK v3.0.0 ↔ Web v3.0.0-web.1

Byte-identical shared files:
- `tiers.js`
- `styles.css`
- `branding.js`
- `installations.js`

`app.js` is APK v3.0.0 evaluator/data logic plus web-only service-worker registration and persistent-storage request.

Platform-specific files:
- `index.html` (Web/PWA wording + versioned static URLs)
- `version.js`
- `sw.js`
- `manifest.webmanifest`

No clinical criteria, timer, scoring, RCA/performance-contributor, MAJCOM/base, or analytics divergence is introduced by the web sync.
