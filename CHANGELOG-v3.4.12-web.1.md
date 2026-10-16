# v3.4.12-web.1

Evaluator observation and coaching improvements, preserving the existing JTS criterion definitions, grading thresholds, timing standards, NT rules, and server claim/finalize/void behavior.

- Immediate FAIL capture and diagnostic moment markers, with audited Undo and local-storage failure recovery.
- Deferred observation review: evidence, learner explanation, assistance markers, contributor hypotheses/confidence, related episodes, practice plans, and reassessment/retention follow-up.
- Stable active timer controls, compact OBSERVE layout, persistent learner/attempt identity, daylight display, and distinct local-save/cloud/network indicators.
- Backward-compatible diagnostic JSONB persistence and local practice history using an explicitly matching training ID. No participant merges or database migrations.
- Draft exports labeled PROVISIONAL; finalized outcomes remain server-authoritative. CSV diagnostic columns are appended with a diagnostic schema version; PDF coaching details paginate.
- Matched criterion reassessment and separate observation, learner, and explicitly linked episode counts.
- Updated PWA cache and asset versions.

Validation: 275 Node checks, 15 isolated browser workflow groups, and anonymous browser/PWA startup and offline-shell checks passed. A seven-page coaching PDF was generated and visually inspected. Authenticated live Supabase operations were not run.

See [DEVELOPMENT.md](DEVELOPMENT.md) for tests and the evaluator calibration/field-evaluation plan. Backend offline ownership changes, cloud-wide learner matching, and formal assessment validation require separate server or program review.
