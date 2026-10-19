#!/usr/bin/env bash
# Synthetic, network-isolated PostgreSQL only. Never connects to the NUC.
set -euo pipefail
umask 077
RAPS_REPO=$(cd "$(dirname "$0")/.." && pwd)
RAPS_IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
RAPS_CONTAINER="raps-reporting-archive-test-$$"
RAPS_OUTPUT=$(mktemp -d)
cleanup() {
  docker rm -f "$RAPS_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$RAPS_OUTPUT"
}
trap cleanup EXIT
docker image inspect "$RAPS_IMAGE" >/dev/null
docker run --rm -d --name "$RAPS_CONTAINER" --network none \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=256m \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$RAPS_IMAGE" >/dev/null
for RAPS_WAIT in {1..30}; do
  if docker exec "$RAPS_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [[ "$RAPS_WAIT" == 30 ]]; then printf 'Test database did not start.\n' >&2; exit 1; fi
  sleep 1
done
raps_psql() { docker exec -i "$RAPS_CONTAINER" psql -X -U postgres -d "$RAPS_DATABASE" -v ON_ERROR_STOP=1 "$@"; }
for RAPS_KIND in enum text; do
  RAPS_DATABASE="reporting_$RAPS_KIND"
  docker exec "$RAPS_CONTAINER" createdb -U postgres "$RAPS_DATABASE"
  if [[ "$RAPS_KIND" == enum ]]; then
    raps_psql -v role_type=public.fixture_role -v status_type=public.fixture_status \
      < "$RAPS_REPO/tests/sql/account-permission-fixture.sql" > "$RAPS_OUTPUT/fixture.log"
    RAPS_OPS_STATUS=public.fixture_operational_status
    RAPS_OPS_RESULT=public.fixture_result
  else
    sed '/^create role /d' "$RAPS_REPO/tests/sql/account-permission-fixture.sql" |
      raps_psql -v role_type=text -v status_type=text > "$RAPS_OUTPUT/fixture.log"
    RAPS_OPS_STATUS=text
    RAPS_OPS_RESULT=text
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_OUTPUT/account.log"
  raps_psql -v phase=baseline -v ops_status="$RAPS_OPS_STATUS" -v ops_result="$RAPS_OPS_RESULT" \
    < "$RAPS_REPO/tests/sql/operational-permission-fixture.sql" > "$RAPS_OUTPUT/operational-fixture.log"
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/operational.log"
  raps_psql -v phase=prepare < "$RAPS_REPO/tests/sql/reporting-archive-permission-fixture.sql" > "$RAPS_OUTPUT/prepare.log"
  # Match the rollout order: managed credential guards first, archive second.
  raps_psql -v phase=prepare < "$RAPS_REPO/tests/sql/managed-login-permission-fixture.sql" > "$RAPS_OUTPUT/managed-prepare.log"
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_managed_login.sql" > "$RAPS_OUTPUT/managed-migration.log"
  if [[ "$RAPS_KIND" == enum ]]; then
    docker exec "$RAPS_CONTAINER" createdb -U postgres -T "$RAPS_DATABASE" reporting_bad_contract
    docker exec "$RAPS_CONTAINER" psql -X -U postgres -d reporting_bad_contract -v ON_ERROR_STOP=1 \
      -c 'alter table public.participants drop column app_data;' > /dev/null
    if docker exec -i "$RAPS_CONTAINER" psql -X -U postgres -d reporting_bad_contract -v ON_ERROR_STOP=1 \
      < "$RAPS_REPO/supabase/migrations/20261018_class_reporting_archives.sql" > "$RAPS_OUTPUT/bad-contract.log" 2>&1; then
      printf 'Incomplete roster contract unexpectedly accepted.\n' >&2; exit 1
    fi
    docker exec "$RAPS_CONTAINER" psql -X -U postgres -d reporting_bad_contract -v ON_ERROR_STOP=1 \
      -c "select test.assert(to_regclass('public.class_reporting_archives') is null and to_regprocedure('private.raps_reporting_archive_guard()') is null,'unsupported roster installs no partial archive objects');" > /dev/null
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_class_reporting_archives.sql" > "$RAPS_OUTPUT/migration.log"
  raps_psql -v phase=assertions < "$RAPS_REPO/tests/sql/reporting-archive-permission-fixture.sql" > "$RAPS_OUTPUT/assertions.log"
  if raps_psql < "$RAPS_REPO/supabase/migrations/20261018_class_reporting_archives.sql" > "$RAPS_OUTPUT/reapply.log" 2>&1; then
    printf 'Reporting-archive collision preflight unexpectedly succeeded.\n' >&2; exit 1
  fi
  raps_psql < "$RAPS_REPO/tests/sql/reporting-archive-managed-fixture.sql" > "$RAPS_OUTPUT/managed-assertions.log"
  printf '%s schema: archive role/scoped reads, active-work rejection, source proof, retained rows and all seven linked write guards passed.\n' "$RAPS_KIND"
  printf '%s schema: temporary/old managed credentials denied archive reads and RPCs; active and legacy Enterprise access preserved; clinical definitions unchanged.\n' "$RAPS_KIND"
done

# A real writer holding the shared class lock must complete before enqueue can
# inspect active work. The waiting request must see the newly active evaluation.
raps_psql > "$RAPS_OUTPUT/writer.log" <<'SQL' &
begin;
update public.classes set name='Writer lock fixture' where id='40000000-0000-0000-0000-000000000108';
insert into public.evaluation_events(id,class_id,base_id,created_by,curriculum_version_id)
values('50000000-0000-0000-0000-000000000108','40000000-0000-0000-0000-000000000108','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001');
insert into public.evaluations(event_id,participant_id,evaluator_id,curriculum_version_id,status)
values('50000000-0000-0000-0000-000000000108','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','in_progress');
\echo RAPS_WRITER_LOCK_HELD
select pg_sleep(3);
commit;
SQL
RAPS_WRITER_PID=$!
for RAPS_WAIT in {1..40}; do
  if rg -q '^RAPS_WRITER_LOCK_HELD$' "$RAPS_OUTPUT/writer.log"; then break; fi
  if [[ "$RAPS_WAIT" == 40 ]]; then printf 'Writer test lock was not acquired.\n' >&2; exit 1; fi
  sleep 0.1
done
raps_psql > "$RAPS_OUTPUT/writer-race.log" <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000108','concurrent active work')$$,'55000');
SQL
wait "$RAPS_WRITER_PID"

# A writer waiting behind an accepted request must recheck queue state after
# acquiring the same lock, even when it began before the enqueue committed.
raps_psql > "$RAPS_OUTPUT/request.log" <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000109','concurrent writer guard');
\echo RAPS_REQUEST_LOCK_HELD
select pg_sleep(3);
commit;
SQL
RAPS_REQUEST_PID=$!
for RAPS_WAIT in {1..40}; do
  if rg -q '^RAPS_REQUEST_LOCK_HELD$' "$RAPS_OUTPUT/request.log"; then break; fi
  if [[ "$RAPS_WAIT" == 40 ]]; then printf 'Archive request test lock was not acquired.\n' >&2; exit 1; fi
  sleep 0.1
done
raps_psql > "$RAPS_OUTPUT/request-race.log" <<'SQL'
select test.expect_error($$update public.classes set name='Waiting writer' where id='40000000-0000-0000-0000-000000000109'$$,'55000');
SQL
wait "$RAPS_REQUEST_PID"

# Membership revocation wins over an enqueue waiting for its authorization lock.
raps_psql > "$RAPS_OUTPUT/revoke.log" <<'SQL' &
begin;
update public.memberships set active=false where id='20000000-0000-0000-0000-000000000002';
\echo RAPS_REVOCATION_LOCK_HELD
select pg_sleep(3);
commit;
SQL
RAPS_REVOKE_PID=$!
for RAPS_WAIT in {1..40}; do
  if rg -q '^RAPS_REVOCATION_LOCK_HELD$' "$RAPS_OUTPUT/revoke.log"; then break; fi
  if [[ "$RAPS_WAIT" == 40 ]]; then printf 'Revocation test lock was not acquired.\n' >&2; exit 1; fi
  sleep 0.1
done
raps_psql > "$RAPS_OUTPUT/revoke-race.log" <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000105','revoked caller')$$,'42501');
SQL
wait "$RAPS_REVOKE_PID"
printf 'Concurrent sessions: active work, queued-write guard and administrator revocation passed.\n'
python3 "$RAPS_REPO/tests/reporting-archive-integration.py" "$RAPS_CONTAINER" "$RAPS_DATABASE"
