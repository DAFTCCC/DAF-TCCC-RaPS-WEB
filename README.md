# DAF-TCCC-WEB — v3.4.12-web.8

Evaluator workflow updates add immediate failure capture with audited Undo, deferred observation review, evidence-based coaching plans, persistent learner identity, stable timer controls, and daylight display. JTS criterion definitions and existing grading/timing policies are unchanged.

See [development and assessment checks](DEVELOPMENT.md) for local startup, regression tests, diagnostic data compatibility, and a calibration/field-evaluation plan. Existing authenticated Supabase synchronization remains in use; lifecycle actions require the server.

Enterprise Administrators can create **username logins with temporary passwords**. A username user must choose a new password before accessing RaPS; recovery uses an administrator-issued temporary password. Existing email accounts retain invitations and email recovery. See [web.8 deployment](WEB8-DEPLOYMENT.md) for the required NUC database and function updates before using these features.

Enterprise Class Operations can request a **NUC CSV archive** for selected classes. The worker saves and verifies private CSV files before excluding the class from Enterprise, MAJCOM, and installation dashboards. Removing a local copy keeps shared server records; shared trash is now excluded from reporting totals.

**TEST** is a peer MAJCOM with practice copies of all 73 installations. Select TEST
for practice classes and separate TEST reporting; default Enterprise live totals
exclude those records. Existing installation relationships and role permissions
remain in use.

Web.7 adds a separate Enterprise **Remove Local Copy** action under **Manage
Training**, with exact synchronization checks and explicit reload. It also
hardens membership expiry, role scope, account approval, and account switching.
See the [role matrix and deployment requirements](PERMISSIONS.md); the website
and NUC database/function updates are separate deployments.

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
- authorized records synchronize with Supabase; working records are also stored on the device.

Clinical criteria, timers, scoring threshold, critical-failure logic, MAJCOM/base metadata, reports, local storage, and existing functionality remain synchronized with APK v3.0.0 unless explicitly changed by the v3 field request.

## Deployment
Use GitHub Pages:
- **Source:** Deploy from a branch
- **Branch:** `main`
- **Folder:** `/(root)`

No Node/npm/Gradle workflow is required for the web repository.

**Contact: John Garcia**
