# v3.4.12-web.14

- Fix **Remove Student** being disabled for every student whenever any evaluation on the device was unfinished. Removal is now blocked only for a student with a started (including finalized or voided) assessment, or in a closed class, and the button and alert state that reason.
- Synchronize student removal. Removing a student from a cloud class queues a withdrawal on the device (identifiers only; survives offline periods, reloads, and other tabs). Roster sync records it on the participant row (`withdrawnAt`, `withdrawnBy`, `withdrawalRequestedBy`, `withdrawnDeviceId`, `withdrawnFromClassId`), merges with the existing participant data, verifies it with the server, and only then clears the queue. Participant rows are never deleted.
- Every device honors withdrawals: pulls drop withdrawn students, unstarted evaluation shells cannot bring them back, and a stale device cannot resurrect a withdrawn student by re-uploading its roster.
- Assessment evidence always outranks a removal. If an assessment was already started for the student on another device, the server-side check refuses the withdrawal, the student is restored, and a **Roster Update** notice explains why. A withdrawn student who still has a started local assessment is reinstated with `reinstatedAt`, `reinstatedBy`, and `previousWithdrawnAt` recorded.

No database migration is required: roster managers already have participant update permission, and the existing participant audit trigger records each withdrawal. JTS criteria, scoring, timing standards, and grading algorithms are unchanged.

Known limitation: the started-assessment check runs in the client before the withdrawal is written. A database-level guard that rejects withdrawing a participant with started evaluations is planned once the live schema has been captured from the NUC.

Validation on 2026-10-31: all 791 Node tests passed (11 new roster-withdrawal tests, each confirmed to fail on web.13). New Chromium test `tests/browser-remove-student.py` passed 4 checks and was confirmed to fail on web.13 at the reported defect. Existing Chromium suites passed: evaluator workflow, accessibility, phase navigation, unresolved navigation, and auth layout, with no unexpected requests or page errors. `browser-responsive.py` reports the same single 5px info-card overflow at 390px width as web.13; it is unrelated to this change.
