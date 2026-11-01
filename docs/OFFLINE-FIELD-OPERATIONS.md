# Offline field operations (3.4.13)

RaPS supports a full field day without connectivity. For example, one class of
18 students might have 3 instructors, each with a phone. Everyone syncs in the
morning, evaluates offline all day, returns, syncs, and closes the class.

## Field procedure

**Morning (connected)**
1. Each instructor opens RaPS on the phone they will use all day and signs in.
   Install RaPS to the Home Screen; this matters on iPhone (see Limitations).
2. Open the class and tap **Sync Classes**. The class, roster, and curriculum are
   now on the phone, and the phone is registered for the class on the server.

**During evaluations (no connection)**
1. **Start A1** works offline. The record is saved the moment it starts and shows
   **OFFLINE · NOT YET SYNCED**.
2. Grade normally. **Review / Finalize** seals the record on the phone and makes
   it read-only, with the status **FINALIZED · AWAITING SYNC**. Records survive
   closing the app and restarting the phone.
3. **Retest after an A1 FAIL** must be done by a different instructor:
   - If the retesting instructor's phone shows the A1 FAIL, tap
     **Start A2 Retest**. The A1 instructor sees this button locked as
     **A2: Different Evaluator Required**.
   - If the A1 was graded on another phone that has not synced, tap
     **Retest (A1 on other phone)**. The retest is recorded now, and the server
     verifies the A1 FAIL and the different instructor when the phones sync.
4. Coordinate who evaluates which student. If two phones grade the same student
   and attempt, the first phone to sync becomes the official record. The second
   phone keeps its copy as **SYNC CONFLICT · REVIEW**. Nothing is overwritten.

**After evaluations (connected)**
1. The Program Manager opens the class and taps **Prepare to Close**.
2. Every instructor taps **Sync Classes**. Each phone uploads its records one at
   a time, in a fixed order. **GRADE SYNCED** appears only after the server has
   claimed, verified, and finalized the record and confirmed its field times.
3. The class screen lists every phone with its status, for example
   **✓ Synced 14:02** or **⏳ 2 items on device**. A phone that has checked in
   can no longer start evaluations for the class.
4. If a retest shows **RETEST · WAITING FOR A1 SYNC**, the A1 phone has not synced
   yet. Have that instructor sync, then sync the retest phone again.
5. **Verify & Close Class** succeeds only when every phone has checked in clean.
   The server enforces this.

**Lost, broken, or wiped phone.** A Program Manager can tap
**Release lost phone** and record a reason. The release is audited. Any records
that existed only on that phone are not included in the class. If the phone
comes back with records, it blocks closure again until it syncs.

**Sync conflicts.** Tap **Review Sync Conflict**. For a duplicate attempt,
choose to keep the server record. The phone's copy is first archived on the
phone (it is included in backups) and exported as a JSON file for the Program
Manager. Other conflict types stay read-only on the phone for review and can
also be exported.

## What happens during sync (per record)

1. **Claim:** the server registers the evaluation under its original ID. This
   step is idempotent, so a repeat returns the same record.
2. **Upload:** criterion results, timers, and field evidence (field start,
   field finish, and field result) are sent.
3. **Finalize:** the server validates the evidence and derives the official
   PASS/FAIL. This step is skipped if an earlier interrupted sync already did it.
4. **Confirm:** `confirm_offline_evaluation_audit` checks that the field times
   and result match what was uploaded before finalization, then sets the
   official start time to the real field start. Server claim and verification
   times are kept separately.
5. **Adopt:** the phone takes the canonical server record.

If any step fails, the record stays sealed on the phone and retries on the next
Sync Classes. Records are processed oldest first, with Attempt 1 before
Attempt 2. Each finalization releases that instructor's one-active-evaluation
lock before the next record is claimed.

## Server rules (migration `20261101_offline_field_finalization.sql`)

- Attempt 2 needs a finalized Attempt 1 FAIL and a different evaluator. A
  trigger on `evaluations` enforces this for new attempts and for changes to the
  evaluator or attempt number.
- `class_device_checkins` and `class_closure_requests` can be written only
  through RPCs. Class members can read them.
- `close_class_with_device_gate` is the only close path for browser sessions.
  Execute permission on `close_class_authoritatively` is revoked from
  `authenticated`.

Tests: `tests/offline-finalization.sh` runs 37 PostgreSQL assertions,
`tests/offline-field-scenario.test.cjs` simulates the three-phone field day, and
`tests/browser-offline-evaluation.py` and `tests/browser-offline-startup.py`
exercise the browser behavior.

## Deployment order

1. Back up the production database.
2. Run the read-only capture of the deployed `claim_evaluation_authoritatively`,
   `finalize_evaluation_authoritatively`, and `close_class_authoritatively`
   definitions. Confirm that their behavior matches the contract this release
   relies on:
   - the claim is idempotent and returns `alreadyClaimed` for the same ID and
     evaluator;
   - the claim rejects another evaluator's attempt with
     `evaluation_owned_by_other_evaluator`;
   - finalize returns `finalized`, `result`, and `completedAt`.
3. Apply the migration to a staging copy and run the two-phone acceptance tests.
4. Apply the migration to production, then merge the frontend immediately.
   Frontends older than 3.4.13 cannot close classes after the migration, because
   their direct close call is refused. 3.4.13 cannot close classes without the
   migration either: it reports that the server needs the update. Both failures
   are safe, and no records are lost.

## Limitations

- **iPhone storage:** Safari may clear data for websites that are not installed
  and go unused for about a week. Install RaPS to the Home Screen and sync after
  every field day.
- **One browser per phone:** each browser profile is a separate registered
  device. Use the same installed app all day.
- **Clearing site data or wiping the phone** deletes unsynced records. That is
  what the release-with-reason path is for.
- **Conflict copies** stay on the phone and in the exported file. They are not
  uploaded to the server.
- **Server functions:** the deployed claim and finalize functions are not yet
  under version control. Step 2 of the deployment order verifies them.
