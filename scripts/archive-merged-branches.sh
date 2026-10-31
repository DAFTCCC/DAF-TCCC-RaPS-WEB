#!/usr/bin/env bash
# Archive stale remote branches as tags, then delete the branches.
#
#   ./scripts/archive-merged-branches.sh                       dry run (default, changes nothing)
#   ./scripts/archive-merged-branches.sh --apply               archive the 37 fully merged branches
#   ./scripts/archive-merged-branches.sh --apply --superseded  also archive the 15 superseded ones
#
# Each branch tip is pushed as tag archive/<branch> BEFORE the branch is
# deleted. Restore a branch with:
#   git push origin refs/tags/archive/<branch>:refs/heads/<branch>
#
# Never touched: main, v3.4.12-offline-field-ops, codex/nuc-web7-rollout.
# See docs/REPOSITORY-BASELINE.md section 3.
set -u

APPLY=0; SUPERSEDED=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --superseded) SUPERSEDED=1 ;;
    *) echo "Unknown option: $arg"; exit 2 ;;
  esac
done

MERGED=(
  backup/pre-selfhosted-cutover
  codex/account-self-service codex/checklist-unresolved-navigation
  codex/evaluator-workflow-v3.4.12 codex/field-beta-briefing
  codex/freeze-finalized-elapsed codex/permission-hardening
  codex/persistent-phase-navigation codex/responsive-usability
  codex/simplify-fail-coaching codex/stable-review-header
  codex/sync-class-deletions codex/username-onboarding-dashboard
  codex/verify-class-deletion-sync feature/admin-reactivate-delete
  feature/cloud-class-sync feature/cloud-class-sync-v1
  feature/full-grading-sync-v1 feature/invite-activation-v1
  feature/multi-user-admin-v1 feature/roster-event-sync-v1
  fix/enterprise-class-rls fix/enterprise-layout-majcom-grouping
  fix/enterprise-ui-342 fix/invite-error-visibility
  fix/membership-starts-at fix/supabase-catalog-seed
  maintenance-phase7fb2-authoritative-close
  phase-7l-web12-metadata-fingerprint phase-7n-f1-default-acl-owner-fix
  phase-7n-f1-default-privilege-hardening phase-7n-f1-privilege-hardening
  phase6/enterprise-operations-dashboard phase6/majcom-manager-dashboard
  phase6/program-manager-my-base ui/center-section-tabs-com
  ui/swap-tta-cuf-timer-order
)
SUPERSEDED_LIST=(
  fix/pwa-update-reliability-web4 fix/phase7h-void-tombstone-web5
  fix/phase7i-sync-consistency-web6 fix/phase7k-closed-pull-only-web7
  fix/phase7l-conflict-recovery-web8 fix/phase7l-monotonic-recovery-web9
  fix/phase7l-class-conflict-web10
  phase-7d-closed-class-retention-20260926 phase-7e-single-active-evaluation-20260926
  phase-7f-c-server-authoritative-close-20260926 phase-7f-ui-close-auth-20260926
  phase-7g-v3.4.11-20260927 phase-7g-v3.4.11-web.2-20260927 phase-7g-v3.4.11-web.3-20260927
  revert-2-feature/cloud-class-sync
)
PROTECTED=" main v3.4.12-offline-field-ops codex/nuc-web7-rollout "

git fetch --quiet origin '+refs/heads/*:refs/remotes/origin/*' --tags || { echo "FAIL: fetch"; exit 1; }

archive() {  # $1 branch, $2 require-merged (1/0)
  local b="$1" sha
  case "$PROTECTED" in *" $b "*) echo "SKIP  $b (protected)"; return ;; esac
  sha=$(git rev-parse --verify --quiet "refs/remotes/origin/$b") || { echo "SKIP  $b (no longer exists)"; return; }
  if [ "$2" = 1 ] && ! git merge-base --is-ancestor "$sha" origin/main; then
    echo "SKIP  $b (gained commits not in main since audit — review manually)"; return
  fi
  if git rev-parse --verify --quiet "refs/tags/archive/$b" >/dev/null; then
    [ "$(git rev-parse "refs/tags/archive/$b^{commit}")" = "$sha" ] || { echo "SKIP  $b (archive tag exists at a different commit)"; return; }
  fi
  if [ "$APPLY" = 0 ]; then echo "WOULD archive/$b -> ${sha:0:7}, then delete branch"; return; fi
  git tag -f "archive/$b" "$sha" >/dev/null &&
  git push --quiet origin "refs/tags/archive/$b" &&
  git push --quiet origin --delete "$b" &&
  echo "PASS  $b -> archive/$b (${sha:0:7})" || echo "FAIL  $b (branch left in place)"
}

for b in "${MERGED[@]}"; do archive "$b" 1; done
if [ "$SUPERSEDED" = 1 ]; then for b in "${SUPERSEDED_LIST[@]}"; do archive "$b" 0; done; fi
[ "$APPLY" = 0 ] && echo "Dry run only. Re-run with --apply to make changes."
