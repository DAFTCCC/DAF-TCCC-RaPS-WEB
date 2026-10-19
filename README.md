# DAF-TCCC-WEB — v3.4.12-web.12

Web.12 removes the reassessment date/time and retention follow-up due date/time
inputs from **Observation & Coaching**. Coaching outcomes and practice/reassessment
plans remain available, and follow-up outcomes save without a date. Previously
saved records retain their historical information. This is a frontend-only
update with no NUC changes.

Web.11 repeats the full phase row directly above the checklist's bottom **Next
Unresolved** button. An incomplete finalization review marks blocking sections,
criteria and timers in red with reason labels and clickable locations. Highlights
clear as the existing requirements are satisfied. The scoring and finalization
rules are unchanged. This is a frontend-only update with no NUC changes.

Web.10 adds a persistent bottom phase bar in every ASM, CLS, CMC, and CPP
assessment. It repeats the course's full section list, including COM, DOC and
EVAC, highlights the current phase, and opens the selected checklist below the
sticky timers. Swipe the bar horizontally on small screens. The class's course,
grading and timer rules remain unchanged. Publish through the normal GitHub
Pages frontend update; no NUC changes are required.

Web.9 fixes first class upload/assessment startup when the database's restrictive
read policy cannot see the new row during `INSERT ... RETURNING`. The browser
inserts and verifies the saved revision in separate authenticated requests;
existing permission rules remain in force. See [web.9 publication and retest](WEB9-DEPLOYMENT.md).

Use the [instructor break-it beta kit](briefing/field-beta/README.md) for the
leadership presentation, hands-on challenges and feedback forms. Complete the
owner's deployed start/sync check before inviting the instructor cohort.

Evaluator workflow updates add immediate failure capture with audited Undo, deferred observation review, evidence-based coaching plans, persistent learner identity, stable timer controls, and daylight display. JTS criterion definitions and existing grading/timing policies are unchanged.

See [development and assessment checks](DEVELOPMENT.md) for local startup, regression tests, diagnostic data compatibility, and a calibration/field-evaluation plan. Existing authenticated Supabase synchronization remains in use; lifecycle actions require the server.

Enterprise Administrators can create **username logins with temporary passwords**. A username user must choose a new password before accessing RaPS; recovery uses an administrator-issued temporary password. Existing email accounts retain invitations and email recovery. See [web.8 deployment](WEB8-DEPLOYMENT.md) for the required NUC database and function updates before using these features.

Enterprise Class Operations can request a **NUC CSV archive** for selected classes. The worker saves and verifies private CSV files before excluding the class from Enterprise, MAJCOM, and installation dashboards. Removing a local copy keeps shared server records; shared trash is now excluded from reporting totals.

**TEST** is an additional supported-MAJCOM choice using the same 73 physical
installations and ordinary training workflow. All MAJCOMs includes TEST.
Assigned installation roles still control access. Previously deployed duplicate
TEST-base records remain readable for compatibility; new classes use existing
installations. See [web.9](WEB9-DEPLOYMENT.md) for the correction and retained data.

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
