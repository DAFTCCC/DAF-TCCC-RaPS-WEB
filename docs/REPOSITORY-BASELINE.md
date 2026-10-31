# Repository baseline audit — 2026-10-31

Read-only audit of `DAFTCCC/DAF-TCCC-RaPS-WEB` taken at `main` = `0434be2`
(`3.4.12-web.13`). Nothing on GitHub was deleted or rewritten to produce it.

## 1. Test baseline

| Suite | Result on `main` 0434be2 |
|---|---|
| `node --test tests/*.test.cjs` (Node 22.23) | **780 / 780 pass** |
| `node --check *.js` | all pass |
| Browser suites (`tests/*.py`) | not run — need a browser and a live stack |
| Database suites (`tests/*.sh`, `tests/sql/*`) | not run — need a database |

Before this branch, `.github/workflows/work` was an empty one-byte file, so no
tests ran on pull requests. `.github/workflows/ci.yml` now runs the Node suite
on every pull request and every push to `main`. It uses no secrets and never
contacts the NUC.

## 2. Database functions missing from source control (critical)

The frontend on `main` calls these RPCs:

| RPC | Defined in any branch? |
|---|---|
| `claim_evaluation_authoritatively` | **No** |
| `finalize_evaluation_authoritatively` | **No** |
| `void_evaluation_authoritatively` | **No** |
| `close_class_authoritatively` | **No** |
| `request_closed_class_archive_deletion` | Yes — `supabase/migrations/20261017_operational_permission_guards.sql` |
| `confirm_offline_evaluation_audit` (offline branch only) | Yes, but in `database/` on `v3.4.12-offline-field-ops`, not `supabase/migrations/` |

All 59 branches were searched. The four lifecycle functions exist only in the
production database. Likewise, no audit trigger for `classes` or `evaluations`
exists in the repository. The repository therefore cannot rebuild the database,
and the server's evaluation lifecycle rules cannot be reviewed.

**Next action:** extract their definitions read-only from `supabase-db` on the
NUC and commit them as a baseline migration.

## 3. Branch inventory

There are 59 remote branches besides `HEAD`.

### 3a. Fully merged into `main` — safe to archive (37)

Every commit on these branches is reachable from `main`, so deleting them loses
nothing. `scripts/archive-merged-branches.sh` tags each tip as
`archive/<branch>` before deleting the branch, which makes the deletion
reversible.

```
backup/pre-selfhosted-cutover        (keep as a tag; it is a recovery marker)
codex/account-self-service           codex/checklist-unresolved-navigation
codex/evaluator-workflow-v3.4.12     codex/field-beta-briefing
codex/freeze-finalized-elapsed       codex/permission-hardening
codex/persistent-phase-navigation    codex/responsive-usability
codex/simplify-fail-coaching         codex/stable-review-header
codex/sync-class-deletions           codex/username-onboarding-dashboard
codex/verify-class-deletion-sync     feature/admin-reactivate-delete
feature/cloud-class-sync             feature/cloud-class-sync-v1
feature/full-grading-sync-v1         feature/invite-activation-v1
feature/multi-user-admin-v1          feature/roster-event-sync-v1
fix/enterprise-class-rls             fix/enterprise-layout-majcom-grouping
fix/enterprise-ui-342                fix/invite-error-visibility
fix/membership-starts-at             fix/supabase-catalog-seed
maintenance-phase7fb2-authoritative-close
phase-7l-web12-metadata-fingerprint  phase-7n-f1-default-acl-owner-fix
phase-7n-f1-default-privilege-hardening
phase-7n-f1-privilege-hardening      phase6/enterprise-operations-dashboard
phase6/majcom-manager-dashboard      phase6/program-manager-my-base
ui/center-section-tabs-com           ui/swap-tta-cuf-timer-order
```

### 3b. Not merged, but content largely present in `main` — superseded (14)

These September phase-7 branches each conflict with `main`. Their work reached
`main` through a different route than a normal merge, and parts were rewritten
afterwards. The percentages below show the share of each branch's added JS
lines (25 or more characters) that appear verbatim in `main`.

| Branch | Present in main |
|---|---|
| fix/pwa-update-reliability-web4 | 96% |
| phase-7g-v3.4.11-20260927 | 94% |
| phase-7f-c-server-authoritative-close-20260926 | 91% |
| fix/phase7h-void-tombstone-web5 | 89% |
| fix/phase7l-conflict-recovery-web8 | 89% |
| phase-7g-v3.4.11-web.3-20260927 | 86% |
| fix/phase7l-class-conflict-web10 | 84% |
| fix/phase7l-monotonic-recovery-web9 | 80% |
| phase-7d-closed-class-retention-20260926 | 78% |
| phase-7e-single-active-evaluation-20260926 | 76% |
| phase-7g-v3.4.11-web.2-20260927 | 76% |
| fix/phase7i-sync-consistency-web6 | 60% — review |
| fix/phase7k-closed-pull-only-web7 | 41% — review |
| phase-7f-ui-close-auth-20260926 | 33% (6 lines) — review |

**Recommendation:** archive all 14 as tags. Anything later found missing can be
recovered from `archive/<branch>`. The three marked "review" deserve a quick
look first, because main may have intentionally replaced that logic or may
have dropped it.

### 3c. Not merged — active or unique work (3)

| Branch | Status | Recommendation |
|---|---|---|
| `v3.4.12-offline-field-ops` | 52 commits ahead and 27 behind; conflicts in 9 core files; about 850 changed lines | **Keep.** Use it as the reference for re-implementing the offline work on current `main`. Do not merge it as-is. |
| `codex/nuc-web7-rollout` | 12 commits; merges cleanly; adds only `supabase/maintenance/*` (NUC exposure assessment, auth hardening scripts and docs) | **Review and merge.** It holds the previous security inventory and should be in `main`. |
| `revert-2-feature/cloud-class-sync` | 1 commit, 186 behind; reverts the catalog seed | **Archive.** It is obsolete. |

## 4. Version-label collisions

Both lines use `3.4.12-web.N` for unrelated code. The offline branch's `web.10`
predates and differs from anything on `main`. From now on, build labels should
be unique per line. For example, development builds could carry a suffix such
as `3.4.13-dev.<n>+<shortsha>`, and only `main` would mint release numbers. The
team should agree on this convention before the next release.

## 5. Open items not done in this branch

- **Vendor supabase-js.** `index.html` loads the unpinned
  `@supabase/supabase-js@2` from jsDelivr. Because it is cross-origin, the
  service worker never caches it. This blocks a reliable offline cold start.
  The fix is to pin a version, save it as `vendor/supabase-js-<ver>.min.js`,
  add it to the service worker shell, remove jsDelivr from the CSP, and bump
  the build. It was not done here because the authoring environment could not
  download the file.
- **Remove the obsolete CSP entry.** The CSP still allows the old hosted
  project, `bplevsfvpwrkgafizvao.supabase.co`. Bundle this with the vendoring
  change.
- **Move the offline migration.** The offline branch's migration lives in
  `database/` and should move to `supabase/migrations/` when that work is
  re-applied.
