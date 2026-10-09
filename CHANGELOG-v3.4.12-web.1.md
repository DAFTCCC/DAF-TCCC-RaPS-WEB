# RaPS v3.4.12-web.1 — Offline Field Operations

## Purpose
Correct the field-critical defect where a cached class/roster could be viewed offline but a new assessment could not be started or finalized without Supabase connectivity.

## Changes
- Start Assessment now supports a verified cached evaluator identity while disconnected.
- Offline starts retain a client UUID, field start time, evaluator identity, and device identity.
- Evaluations can be fully graded and finalized while disconnected.
- Offline finalization is locally immutable and labeled pending authoritative server verification.
- Reconnect processing claims/uploads/finalizes pending evaluations sequentially, oldest first.
- Existing server uniqueness and evaluator-lock protections remain in force.
- Reconnect conflicts stop the queue and require review; no silent overwrite is permitted.
- Pull sync skips pending offline records so older server shells cannot overwrite unsynchronized field work.
- Locally finalized records remain server-side in_progress until the authoritative finalize RPC validates them.
- Offline-only accidental starts can be voided locally before they ever reach the server.
- Class view includes OFFLINE READY / NOT OFFLINE READY status.
- PWA cache/version bumped for release isolation.

## Required acceptance test
1. Sign in online and sync a class/roster.
2. Confirm OFFLINE READY.
3. Disconnect network.
4. Start, grade, and finalize Student 1.
5. Start, grade, and finalize Student 2.
6. Close and reopen RaPS while still offline.
7. Confirm both records remain intact and read-only.
8. Complete another student offline.
9. Reconnect.
10. Confirm automatic sequential claim/upload/server-finalize.
11. Verify UUIDs, field timestamps, criteria, timers, and results are preserved.
12. Verify no duplicate evaluations.
13. Deliberately create a two-device same-student/attempt collision and confirm SYNC CONFLICT with no silent overwrite.

## Deployment
This build is isolated on branch `v3.4.12-offline-field-ops`. Do not merge to `main` until disconnected acceptance testing passes.
