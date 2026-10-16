# Local development and assessment checks

This is a static application. Serve the existing checkout with:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

There is no package installation or build step. Node.js is used for the regression checks; Python Playwright and Chromium are used for browser checks:

```sh
node --test tests/*.test.cjs
python3 tests/browser-workflow.py
```

The browser check serves the real frontend through in-memory request fulfillment with synthetic learners. It omits authentication/cloud scripts from the test page, blocks external requests, and injects its fixture adapter into the served script only. It does not change the application, authenticate to Supabase, or write production records.

The policy tests compare against the pre-change commit `be124a1d36af411ea4676eba283eb1b3b762cd14`. They protect the exact tier definitions and existing grading, timing, and authoritative lifecycle functions. Keep this reference fixed when testing this change. Any future standards update requires a separately reviewed baseline.

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

Closed classes retain the existing audited archive-deletion workflow. The client checks for unfinished assessments before sharing a deletion; atomic exclusion of a simultaneous new assessment claim depends on the deployed server lifecycle functions. This release does not change those functions or deploy a database migration. Isolated two-browser sync tests exercise the real client modules with a shared fake server, and the browser workflow checks the actual Delete, Home Restore, and remote-tombstone views without production access.

Unfinalized exports are labeled PROVISIONAL. Finalized results use the stored server result. New CSV diagnostic columns are appended to existing columns and identify `TCCC_DIAGNOSTICS_1.0`; downstream consumers should select columns by header. Student PDFs include paginated coaching details.

Matched reassessment follows the same failed A1 criteria into finalized A2, showing retested coverage, independent/assisted/unknown passes, repeated failures, NT, and pending items. Contributor charts distinguish failed observations, learners affected, and explicitly linked episodes. These are descriptive evidence, not proof of a cause or durable retention.

## Calibration and field evaluation

Have program subject-matter experts select shared scripted performances or approved training videos covering clear passes, failures, critical errors, prompted performance, and equipment/setup problems. Use the same published curriculum version. Agree on reference judgments and observable anchors using the governing standards; do not invent new clinical passing rules.

Record case ID, curriculum version, criterion code, reference grade, each evaluator's independent grade, observation evidence, and the reason for disagreement. Discuss grading disagreements separately from contributor-hypothesis disagreements. Compare raw agreement and critical-error disagreements on the same cases; pass rates from different learner groups are not agreement measures.

For a formative usability pilot, counterbalance paper/current workflow and this interface across equivalent lanes. Include new and experienced evaluators, gloves, noise, varied lighting, phone/tablet, mistap correction, background/resume, and network loss. Measure missed/false critical observations, eyes-off-learner time, recording latency, timer error, debrief time, workload, and actual reuse. NASA-TLX or SUS may supplement observation when administered using their established protocols; they do not validate the TCCC grading instrument.

Backend changes to offline assessment ownership, cloud-wide learner identity, and deployed server scoring remain separate work requiring the actual function definitions and policy review. This change does not deploy database migrations or certify the app against a clinical assessment standard.
