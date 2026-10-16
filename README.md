# DAF-TCCC-WEB — v3.4.12-web.4

Evaluator workflow updates add immediate failure capture with audited Undo, deferred observation review, evidence-based coaching plans, persistent learner identity, stable timer controls, and daylight display. JTS criterion definitions and existing grading/timing policies are unchanged.

See [development and assessment checks](DEVELOPMENT.md) for local startup, regression tests, diagnostic data compatibility, and a calibration/field-evaluation plan. Existing authenticated Supabase synchronization remains in use; lifecycle actions require the server.

Static GitHub Pages / installable PWA synchronized to **APK v3.0.0**.

## v3.0 field-driven changes
- segmented **OBSERVE | REVIEW** evaluator modes,
- PASS / FAIL / NT only; blank = unresolved,
- safe legacy N/O migration,
- simplified failure modes,
- **Primary Performance Contributor** terminology/categories,
- performance-when-tested separated from Tested / NT exposure,
- simplified exports,
- simplified startup safeguards,
- **EVALUATE / MANAGE TRAINING / READINESS / PROGRAM** navigation,
- larger operational typography and responsive controls,
- local future-sync metadata only — no external transmission.

Clinical criteria, timers, scoring threshold, critical-failure logic, MAJCOM/base metadata, reports, local storage, and existing functionality remain synchronized with APK v3.0.0 unless explicitly changed by the v3 field request.

## Deployment
Use GitHub Pages:
- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/(root)`

No Node/npm/Gradle workflow is required for the web repository.

**Contact: John Garcia**
