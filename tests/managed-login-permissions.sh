#!/usr/bin/env bash
# Synthetic, network-isolated PostgreSQL only. Never connects to the NUC.
set -euo pipefail
umask 077
RAPS_REPO=$(cd "$(dirname "$0")/.." && pwd)
RAPS_IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
RAPS_CONTAINER="raps-managed-login-test-$$"
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
  RAPS_DATABASE="managed_$RAPS_KIND"
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
  raps_psql -v phase=prepare < "$RAPS_REPO/tests/sql/managed-login-permission-fixture.sql" > "$RAPS_OUTPUT/prepare.log"
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_managed_login.sql" > "$RAPS_OUTPUT/migration.log"
  raps_psql -v phase=assertions < "$RAPS_REPO/tests/sql/managed-login-permission-fixture.sql" > "$RAPS_OUTPUT/assertions.log"
  if raps_psql < "$RAPS_REPO/supabase/migrations/20261018_managed_login.sql" > "$RAPS_OUTPUT/reapply.log" 2>&1; then
    printf 'Managed-login collision preflight unexpectedly succeeded.\n' >&2; exit 1
  fi
  printf '%s schema: managed credentials, role gates, old-token cutoff, expiry, reset serialization, throttling, and private ACL checks passed.\n' "$RAPS_KIND"
done

# Real sessions prove that an administrator revoked while the RPC is waiting for
# its authorization lock cannot complete a managed-account reset afterwards.
raps_psql > "$RAPS_OUTPUT/revoke.log" <<'SQL' &
begin;
set local role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000001',0);
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
raps_psql > "$RAPS_OUTPUT/race.log" <<'SQL'
set role service_role;
select test.expect_error($$select public.raps_managed_begin_reset('00000000-0000-0000-0000-000000000002',0,'00000000-0000-0000-0000-000000000021',repeat('f',64))$$,'42501');
SQL
wait "$RAPS_REVOKE_PID"
printf 'Concurrent revocation: a waiting managed-login service RPC loses administrator authority.\n'

# Membership expiry is rechecked against the clock after acquiring the lock,
# rather than the timestamp captured before the RPC began waiting.
raps_psql > "$RAPS_OUTPUT/expiry-lock.log" <<'SQL' &
begin;
select pg_advisory_xact_lock(hashtextextended('raps:membership-guard:v1',0));
update public.memberships set ends_at=clock_timestamp()+interval '1 second'
  where id='20000000-0000-0000-0000-000000000001';
commit;
begin;
select pg_advisory_xact_lock(hashtextextended('raps:membership-guard:v1',0));
\echo RAPS_EXPIRY_LOCK_HELD
select pg_sleep(3);
commit;
SQL
RAPS_EXPIRY_PID=$!
for RAPS_WAIT in {1..40}; do
  if rg -q '^RAPS_EXPIRY_LOCK_HELD$' "$RAPS_OUTPUT/expiry-lock.log"; then break; fi
  if [[ "$RAPS_WAIT" == 40 ]]; then printf 'Expiry test lock was not acquired.\n' >&2; exit 1; fi
  sleep 0.1
done
raps_psql > "$RAPS_OUTPUT/expiry-race.log" <<'SQL'
set role service_role;
select test.expect_error($$select public.raps_managed_begin_reset('00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000021',repeat('f',64))$$,'42501');
SQL
wait "$RAPS_EXPIRY_PID"
printf 'Concurrent expiry: a waiting managed-login service RPC loses expired administrator authority.\n'
