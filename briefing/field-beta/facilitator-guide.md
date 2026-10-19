# RaPS field beta: facilitator guide

**Audience:** leadership, MAJCOM managers, site Program Managers and pilot facilitators.  
**Proposal:** one week at 2–3 sites; one Program Manager (PM) and two instructors per site. Use the TEST supported MAJCOM, ordinary authorized installations and synthetic learners. TEST uses the same NUC; coordinate the testing window with its owner.

## Purpose and decision

Run a controlled, formative pilot: ask instructors to try to break the workflow, identify confusing behavior, and provide reproducible feedback. Determine whether RaPS supports observation and debriefing under realistic conditions. The paper/current official process remains authoritative. This pilot does not certify the grading instrument or establish operational deployment readiness.

Development checks passed across Node, browser and isolated SQL suites. The matching frontend was merged to `main` at `104aaae9031cbe4c361022ebd380ff169bfca2c9`; the NUC owner verified backend release `8a9d138`. A reported class-start RLS failure was reproduced for both ordinary and TEST classes. Web.9 fixes the shared insert/read sequence and removes the separate TEST picker/reporting behavior. Publication and an actual retry of the reported class remain required before launch.

## Before inviting participants

The pilot owner records the following evidence with the site PM:

1. **Release:** each pilot browser/PWA shows `3.4.12-web.9` in About/update. Include existing installations, not just a fresh browser.
2. **Accounts:** use individual accounts with the ordinary installation roles needed for the beta; never share credentials. Use dedicated browser profiles where practical. On a second device, complete temporary-password setup, sign in again, recover the account, and confirm the old session loses server access. Verify allowed installation scope and denied unrelated scope. Test actual email recovery if email accounts participate. Retain a second established administrator for recovery.
3. **Reference lane:** two instructors independently assess the same SME-approved scripted performance. Record curriculum/version, criterion-level reference judgments, timers and expected result. Sync, inspect the second device and verify the server-finalized result and exported evidence. Test competing claims without overwriting the first instructor.
4. **Retention owners:** the NUC owner demonstrates the existing automatic closed-class archive worker and checks a closed synthetic class's archive status. Separately, identify who runs the selected-class reporting archive worker; demonstrate one selected synthetic-class export and its verified files. Queueing an export is not completion.
5. **Recovery:** identify the backup owner and recovery location. Rehearse restoration into an isolated target, including retained CSVs, before retaining meaningful records or expanding the pilot. Also assign handling for lost/shared devices and cached records before any real learner data is used. Do not restore over production as a test.

If a gate fails, resolve it or reduce scope explicitly before launch. Record evidence, owner and date; do not substitute “deployment succeeded” for the checks above.

<!-- pagebreak -->

## Launch: 60 minutes, followed by hands-on testing

- **0–10 minutes:** explain purpose, TEST boundary, indicators, expected safeguards, stop conditions and support route. Keep the demonstration short.
- **10–50 minutes:** instructors attempt four assigned challenge-card missions, including the five-minute free-exploration mission. Pair testers where needed; record help and blocked/not-run tasks honestly.
- **50–60 minutes:** collect evidence, hear one friction point and one thing to keep from each tester, and assign follow-up missions and owners.

The launch introduces the workflow. Do not promise completion of all eight testing missions within 60 minutes. Continue hands-on work during the week, with a short daily PM check-in and an end-of-week review.

## Eight extended missions

1. **Access and scope:** sign in/out, recover access and inspect permitted TEST records. Oversight alone does not grant assessment editing.
2. **Observe, correct and review:** record approved judgments, mark a moment, undo a mistap and save partial review/coaching notes. Markers and coaching do not change official grades.
3. **Network loss:** claim online, disconnect, record locally, reconnect and verify exact entries on another device. Starting, finalizing, voiding and closing require the server; cached authorization must remain valid.
4. **Timers and interruptions:** compare with an external clock; test background/resume and screen lock. Actual reload is separate: an active recovered timer requires VOID with a reason and a new instance. Repeat the approved performance; do not reconstruct a valid elapsed time.
5. **Display and input stress:** long fictitious names/notes, rotation, keyboard, text enlargement, gloves, light and noise. Record hidden controls and accidental taps.
6. **Two-device work:** try competing claims, stale views and facilitator-prepared conflicts. Keep one active claim per evaluator; finalize or void before changing assessments.
7. **Final results and identity:** use a planned SME case with enough time for existing requirements. Reconcile stored results/exports/TEST totals and verify final fields are read-only. Local training-ID matching does not establish cloud-wide learner identity.
8. **Free exploration:** follow the instructor's usual workflow with ordinary interface actions. Collect one friction point, one useful feature and reproducible evidence.

The Enterprise owner separately demonstrates local-copy removal, shared Trash/Restore and selected-class archival. Queued/failed exports remain counted; verified completion changes reporting totals. Do not delete archives or clear storage to force a result.

Use actual supported phones/tablets, gloves, varied light and ordinary interruptions. Counterbalance paper/app order across equivalent lanes when practical. Record what happened, including successful recovery; do not treat every deliberate restriction as a defect.

<!-- pagebreak -->

## Feedback and incident handling

For each finding, capture mission, device/OS/browser or PWA, app version, role/TEST scope, connectivity, exact steps, expected/actual behavior, repeatability and recovery. Use synthetic identifiers. Attach redacted screenshots when useful; exclude passwords, tokens, recovery links and real learner information.

**Support route:** instructor → site PM → pilot owner; the pilot owner coordinates Enterprise/NUC support. PMs maintain the issue log and communicate workarounds. All MAJCOMs includes TEST; choose ordinary scoped filters and reconcile the named synthetic cases. TEST is a supported training label, not a new access grant. Retained duplicate TEST-base accounts are not automatically moved; review any physical-installation grant with the Enterprise owner. Instructors should not change server configuration or create duplicate accounts to bypass recovery.

Pause affected testing immediately for unexpected access, lost evidence, another evaluator's work being overwritten, or a falsely finalized score. Preserve the device and current state; note time and steps. Recover/export state with support before clearing browser storage, reinstalling or repeatedly retrying. Continue official assessment through the established process. Resume the affected mission only after the pilot owner reviews the failure and recovery evidence.

## End-of-week decision

Report counts with denominators: participants/sites/devices completing each mission; claims attempted/accepted/rejected; outage recoveries attempted/verified; finalized results compared/matching; timer comparisons; access violations; evidence-loss events; and findings resolved/open/retested. Include missed critical observations, mistaps, recording delay, debrief effort and instructor comments.

Proposed gates are operational decisions, not validated clinical thresholds: complete preflight at every participating site; compare every pilot-finalized result with its reference; investigate every mismatch; and leave no unresolved critical access, evidence-loss or false-score finding. Leadership may extend a limited TEST pilot for usability gaps with an owner and retest date. Scale only after recovery evidence and critical fixes are reviewed.

## References

- [Development checks, field evaluation and known boundaries](../../DEVELOPMENT.md)
- [Roles, scope, offline access and recovery](../../PERMISSIONS.md)
- [Web.9 publication and startup retest](../../WEB9-DEPLOYMENT.md)
- [Web.8 backend and selected-class archives](../../WEB8-DEPLOYMENT.md)
- [Account/email deployment](../../DEPLOYMENT.md)
- [Timer and lifecycle source](../../app.js): `timerNeedsRecovery`, `elapsedSafe`, `gradingDuration`, `timerAction`, `visibilitychange`, `renderClosedArchiveStatus`.
