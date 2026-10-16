# v3.4.12-web.3

Fixes classes deleted on one device remaining visible on another. Class sync previously compared only metadata and could report a deletion as synced without sending or applying it. Restore from Home also failed to queue the restored class reliably.

Open-class deletion now uses reversible shared Enterprise Trash with visible sync status. Explicit restoration synchronizes across devices; stale metadata, old queued deletions, and overlapping local delete/restore requests cannot undo a newer action. Existing local-only trash is migrated from the original Enterprise device during synchronization. Trash updates preserve unrelated server metadata, students, and assessments. Background roster and grading writes stop for deleted classes, and receiving a remote deletion exits the obsolete class view.

Class sync refreshes when returning to the app. Local removal is blocked until a shared deletion is confirmed. PWA asset and cache versions are refreshed so both devices can load the fix.

No schema migration is required. Standardized grading criteria, scoring, timing, and authoritative assessment functions are unchanged. Closed classes retain the audited archive-deletion workflow. Tests use isolated synthetic server/browser fixtures; authenticated production synchronization remains an end-user smoke check after deployment.

Validation: 310 automated checks and 19 browser workflow groups pass. The sync tests cover legacy local trash, stale devices, overlapping delete/restore requests, and class completion during conditional writes. Browser checks report zero external requests and page errors.
