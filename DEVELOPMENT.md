# Local development and assessment checks

This is a static application. Serve the existing checkout with:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

There is no package installation or build step. Node.js is used for the regression checks; Python Playwright and Chromium are used for browser checks:

```sh
for suite in tests/*.test.cjs; do node "$suite" || exit 1; done
bash tests/account-permissions.sh
bash tests/operational-permissions.sh
bash tests/managed-login-permissions.sh
bash tests/reporting-archive-permissions.sh
bash tests/test-majcom-permissions.sh
bash tests/class-create-permissions.sh
python3 tests/test_reporting_archive_worker.py
python3 tests/browser-workflow.py
python3 tests/browser-phase-navigation.py
python3 tests/browser-responsive.py
python3 tests/browser-accessibility.py
python3 tests/browser-auth-layout.py
python3 tests/browser-auth-flows.py
python3 tests/browser-admin-accounts.py
python3 tests/browser-test-majcom.py
```

The evaluator workflow check serves the real frontend through in-memory request fulfillment with synthetic learners. It omits authentication/cloud scripts from the test page, blocks external requests, and injects its fixture adapter into the served script only. It does not change the application, authenticate to Supabase, or write production records.

The responsive suite measures phone, tablet, desktop, and short landscape layouts, including long class/student names and 200% text enlargement. It checks page/card overflow, text clipping, shared-row field alignment, touch targets, readable text, timer visibility, and roster/checklist navigation beneath sticky controls. Tables and phase tabs retain their own horizontal scrolling.

The accessibility suite exercises real application dialogs and their interaction with the actual authentication gate: persistent labels, descriptive control names, keyboard focus after rerendering, Tab containment, Escape behavior, and background isolation. The authentication layout suite renders the actual account screens with a synthetic SDK/catalog. The authentication flow suite exercises recovery, verified invitation links, signed-in password changes, and error paths against an isolated fake Auth service. All requests are intercepted; no account is created and no email or production request is sent. Browser checks save their reports and screenshots under `/tmp/raps-*`.

Automated browser checks use Chromium and synthetic data. They verify responsive layout, not physical iOS/Android font rendering, virtual-keyboard behavior, or field usability with gloves. Include those checks in the device pilot described below.

The phase-navigation check exercises the complete section list in all four
courses, including COM/DOC/EVAC, from the fixed bottom bar. It verifies jump
positions with pinned timers, horizontal scrolling/focus, finalized read-only
navigation, footer space, and a usable STOP control on short landscape screens.
Navigation selects a section of the existing class curriculum; it does not
switch an active assessment to another course.

The policy tests compare against the pre-change commit `be124a1d36af411ea4676eba283eb1b3b762cd14`. They protect the exact tier definitions and existing grading, timing, and authoritative lifecycle functions. Keep this reference fixed when testing this change. Any future standards update requires a separately reviewed baseline.

The role suites use real permission helpers, synthetic authenticated identities,
and separate PostgreSQL containers. SQL tests require Docker and a locally
available official `postgres:17.6` image; they expose no ports and contact no NUC
or production database. They verify both permitted and forbidden requests,
including direct database requests and previously permissive definer functions.
See [PERMISSIONS.md](PERMISSIONS.md) for the role matrix and deployment sequence.

The class-creation suite reproduces the `STABLE` class-read helper's snapshot
boundary during `INSERT ... RETURNING`, then verifies the browser's two-request
insert/read pattern and denied requests. It uses the reviewed account,
operational, managed-login, reporting-archive and TEST catalog migrations in an
isolated synthetic PostgreSQL database. See [web.9](WEB9-DEPLOYMENT.md) for the
frontend-only publication and deployed retest.

## Account lifecycle checks

Access remains administrator-approved. The public request endpoint records a request; the administrative invitation endpoint must authenticate the caller and authorize an active Enterprise Admin membership. The browser never holds an administrative/service-role key. A verified invitation or recovery link permits password setup for its verified user, while an active RaPS membership controls application access.

Test expired/reused links with an unrelated session already stored, sign-out during an in-flight identity lookup, password-update callbacks, and network/provider errors. A URL marker or cached identity must not authorize a password mutation. Error and cancellation paths must clear password/code fields and avoid false account-ready or email-delivered messages.

See [deployment and email configuration](DEPLOYMENT.md) for canonical URLs, SMTP/templates, server password policy, the access-request RPC migration, and function deployment. Synthetic tests cannot validate actual email delivery or deployed Auth policies; complete the authorized recipient checks there before treating production account onboarding as verified.

Web.8 also tests username provisioning, administrator-issued temporary passwords,
mandatory first-login changes, stale-session rejection, and one-time credential
display. The managed-login SQL suite checks direct browser-role requests and
definer-function paths against isolated PostgreSQL. See [web.8 deployment](WEB8-DEPLOYMENT.md)
for the separate NUC rollout and real-account checks.

## Evaluator workflow

- OBSERVE records an explicit PASS or FAIL immediately. Mark moment saves a diagnostic flag without selecting a grade or changing the denominator.
- Undo corrects the latest observation with an audit event. It cannot restore a result that conflicts with a subsequently triggered timing rule, an initiated linked timer, or a finalized record.
- REVIEW provides assistance markers, evidence, learner explanation, contributor hypotheses and confidence, related-episode labels, targeted practice, and coaching follow-up dates/outcomes.
- Partial diagnostic notes can be saved. Existing critical-failure classification and official finalization requirements remain in force.
- Official criterion text, critical designations, scoring thresholds, NT behavior, timing standards, and server claim/finalize/void rules are unchanged.
- Coaching outcomes are supplemental; recording independent practice does not change an official result. A new formal assessment follows the existing attempt rules.
- Practice history matches the exact training ID across classes already stored on the device. It does not merge cloud participants or establish identity automatically.
- Local save, cloud sync, and network availability are shown separately. An existing assessment can record locally during an outage; starting, finalizing, and voiding still require the server.

## Data compatibility and reporting

Observation markers use `evaluations.app_data.observations`. Existing `failureDetails` records contain supplemental coaching fields and continue to round-trip through JSONB. No table changes, result-enum changes, curriculum updates, or new secrets are required.

Unknown metadata is preserved. Older records without diagnostic fields remain readable, and unknown assistance is reported as unknown. Stored evidence is retained when an evaluator subsequently corrects a grade to PASS.

## Shared class trash

Enterprise deletion of an open class synchronizes `classes.status='archived'` and a deletion marker in the existing `app_data` JSONB. It hides the class across devices without deleting students or assessments. Restore is an explicit operation tied to the deletion and previous restoration markers; stale metadata uploads cannot undo it. Minimal conditional patches preserve unrelated server metadata. Existing local-only trash is migrated when the Enterprise user synchronizes the original device. A newer server restoration takes precedence over old local trash.

Delete and restore remain queued on the device until acknowledged. Trash shows each class's sync status, and removing a local copy is blocked while its deletion is unconfirmed. Return to the original device and use **Sync Classes**, then sync the second device. Devices also refresh classes on login, network return, window focus, and foreground return. Both devices must load the current release.

Pending delete/restore requests also have independent, user-scoped keys under `RAPS_CLASS_TRASH_OUTBOX:`. Whole-database writes from another tab cannot erase these keys. Recovery overlays lifecycle fields only, leaving roster and assessment state intact; acknowledgements remove only the matching request. Legacy trash is queued independently of the cloud collection and old sync flags. Class reads page until empty, including when the server caps responses below the requested range. A pull waits for an overlapping class push and fetches the lifecycle again before reporting success.

If a class was removed from both the original device's class list and its Trash before a shared deletion was recorded, that device has no deletion request to upload. Delete the remaining cloud copy once from a device where it is still visible and confirm the Trash row reaches **SYNCED**. The app does not infer deletion from a missing local or remote row, which could also represent access scope or an incomplete response.

Closed classes retain the existing audited archive-deletion workflow. The client checks for unfinished assessments before sharing a deletion; atomic exclusion of a simultaneous new assessment claim depends on the deployed server lifecycle functions. Isolated two-browser sync tests exercise the real client modules with a shared fake server, and the browser workflow checks the actual Delete, Home Restore, and remote-tombstone views without production access.

The separate NUC reporting archive retains full-row CSV/JSON snapshots for selected
classes. Its SQL and worker suites exercise explicit selection, active-work and
role guards, concurrent writes/revocation, lossless CSV values, private file modes,
checksums, durable writes, retry/cancellation, and completion only after proof
verification. Failed exports remain counted. Live classes are never selected or
archived by these tests.

Unfinalized exports are labeled PROVISIONAL. Finalized results use the stored server result. New CSV diagnostic columns are appended to existing columns and identify `TCCC_DIAGNOSTICS_1.0`; downstream consumers should select columns by header. Student PDFs include paginated coaching details.

Matched reassessment follows the same failed A1 criteria into finalized A2, showing retested coverage, independent/assisted/unknown passes, repeated failures, NT, and pending items. Contributor charts distinguish failed observations, learners affected, and explicitly linked episodes. These are descriptive evidence, not proof of a cause or durable retention.

## Calibration and field evaluation

Have program subject-matter experts select shared scripted performances or approved training videos covering clear passes, failures, critical errors, prompted performance, and equipment/setup problems. Use the same published curriculum version. Agree on reference judgments and observable anchors using the governing standards; do not invent new clinical passing rules.

Record case ID, curriculum version, criterion code, reference grade, each evaluator's independent grade, observation evidence, and the reason for disagreement. Discuss grading disagreements separately from contributor-hypothesis disagreements. Compare raw agreement and critical-error disagreements on the same cases; pass rates from different learner groups are not agreement measures.

For a formative usability pilot, counterbalance paper/current workflow and this interface across equivalent lanes. Include new and experienced evaluators, gloves, noise, varied lighting, phone/tablet, mistap correction, background/resume, and network loss. Measure missed/false critical observations, eyes-off-learner time, recording latency, timer error, debrief time, workload, and actual reuse. NASA-TLX or SUS may supplement observation when administered using their established protocols; they do not validate the TCCC grading instrument.

Backend changes to offline assessment ownership, cloud-wide learner identity, and deployed server scoring remain separate work requiring the actual function definitions and policy review. This change does not deploy database migrations or certify the app against a clinical assessment standard.
