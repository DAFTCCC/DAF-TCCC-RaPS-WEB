# Web.9: first class upload and assessment start

Web.9 fixes a browser synchronization failure reported when beginning an
assessment in a new TEST class. The class upload requested `INSERT ... RETURNING`.
The restrictive class read policy calls a `STABLE` permission helper that queries
the classes table; its statement snapshot does not yet contain the inserted row.
An otherwise authorized insert was rejected by `raps_ops_guard_select`, before
RaPS could claim or create the local assessment.

The browser now inserts without requesting a returned row, then reads the saved
revision in a separate authenticated request. It checks that the readable
revision matches the upload before acknowledging sync. A denied/missing read or
intervening change blocks assessment startup and preserves local data for retry
or conflict review.

## TEST catalog correction

TEST is an ordinary **Supported MAJCOM / Command** choice, with the same 73
physical installation IDs, training locations, class form, and assessment flow.
It has no separate training engine or permission mode. All MAJCOMs includes TEST
under the same dashboard rules as other commands.

The supported command is stored in class metadata; it does not change the
installation's parent command or grant access. Evaluator/PM memberships and
explicit assignments continue to authorize records at their assigned bases.
MAJCOM cloud reports retain their ordinary parent-installation scope. A TEST
MAJCOM-manager membership does not grant visibility into every host command's
records simply because a class supports TEST.

The prior rollout created duplicate TEST-* base rows. This patch removes them
from new class/location and new access-grant choices, while retaining lookup,
editing, memberships and server data for existing records. It does not delete
or reparent those rows or silently move accounts. An account assigned only to a
legacy duplicate base remains scoped there until an administrator reviews and
grants access to an ordinary installation. Moving that membership automatically
could grant access to real training records, so this patch does not do so.

## Deployment

This is a frontend-only patch on the verified web.8 backend. Merge the reviewed
change and let the normal GitHub Pages deployment publish it. No NUC migration,
permission change, Auth restart, account recreation or database restore is needed.

On each participating browser/PWA:

1. Finish or safely preserve any active assessment and unsynced work before
   updating. Do not clear browser storage or reinstall to obtain the update.
2. Use the app update/reload flow and confirm **3.4.12-web.9** in the app.
3. Sign in with an authorized installation evaluator/PM (or Enterprise
   administrator). Confirm the intended base and open the previously blocked
   class, including an existing legacy TEST class if that is the reported case.
4. Retry **Begin Assessment** once. Confirm the server claim succeeds, one local
   attempt is created, and the class/roster cloud status is synchronized. If the
   server reports an existing active assessment, inspect it before retrying.
5. Record a distinctive synthetic observation/note, sync, and check it from a
   second authorized device. Verify an unrelated scoped account remains blocked.
6. Create a second synthetic class with supported MAJCOM **TEST** and an ordinary
   assigned installation. Repeat start/sync and compare with a regular-MAJCOM
   class at that same installation. No duplicate base or extra role is needed.

Do not widen permissions or disable RLS to work around the error. The existing
role, claim, grading, timer and finalization rules remain in force. If the same
error persists on web.9, keep the class and browser state, report the exact alert,
role/installation and time to the pilot owner; inspect deployed permissions
before attempting any server change.

## Validation and beta decision

All 718 Node regression checks pass. The regression covers the exact insert/read
request pattern and its failure, retry and concurrent-change paths. An isolated PostgreSQL check exercises the
reviewed permission rules with synthetic identities and records. These checks
do not authenticate to the NUC or establish that the reported class has been
successfully retried there.

Hold the instructor cohort until the owner completes the deployed start/sync
check above. Use the [beta kit](briefing/field-beta/README.md) for the remaining
account, physical-device, outage, retention and recovery checks.
