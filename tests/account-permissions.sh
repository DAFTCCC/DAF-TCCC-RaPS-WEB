#!/usr/bin/env bash
# Isolated synthetic database only; no ports, credentials, or production access.
set -euo pipefail
umask 077
RAPS_REPO=$(cd "$(dirname "$0")/.." && pwd)
RAPS_TEST_IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
RAPS_TEST_CONTAINER="raps-rbac-test-$$"
RAPS_TEST_OUTPUT=$(mktemp -d)
cleanup() {
  docker rm -f "$RAPS_TEST_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$RAPS_TEST_OUTPUT"
}
trap cleanup EXIT
if ! docker image inspect "$RAPS_TEST_IMAGE" >/dev/null 2>&1; then
  printf 'Missing local test image. Run docker pull %s first.\n' "$RAPS_TEST_IMAGE" >&2
  exit 1
fi
docker run --rm -d --name "$RAPS_TEST_CONTAINER" --network none \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,size=256m \
  -e POSTGRES_HOST_AUTH_METHOD=trust "$RAPS_TEST_IMAGE" >/dev/null
for RAPS_WAIT in {1..30}; do
  if docker exec "$RAPS_TEST_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  if [[ "$RAPS_WAIT" == 30 ]]; then printf 'Test database did not start.\n' >&2; exit 1; fi
  sleep 1
done

raps_psql() {
  docker exec -i "$RAPS_TEST_CONTAINER" psql -X -U postgres -d "$RAPS_DATABASE" -v ON_ERROR_STOP=1 "$@"
}
for RAPS_KIND in enum text; do
  RAPS_DATABASE="raps_$RAPS_KIND"
  docker exec "$RAPS_TEST_CONTAINER" createdb -U postgres "$RAPS_DATABASE"
  # Roles are cluster-wide, so define them only in the first fixture database.
  if [[ "$RAPS_KIND" == enum ]]; then
    raps_psql -v role_type=public.fixture_role -v status_type=public.fixture_status \
      < "$RAPS_REPO/tests/sql/account-permission-fixture.sql" > "$RAPS_TEST_OUTPUT/fixture.log"
  else
    sed '/^create role /d' "$RAPS_REPO/tests/sql/account-permission-fixture.sql" |
      raps_psql -v role_type=text -v status_type=text > "$RAPS_TEST_OUTPUT/fixture.log"
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_access_request_submission.sql" > "$RAPS_TEST_OUTPUT/submission.log"
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_TEST_OUTPUT/migration.log"
  raps_psql < "$RAPS_REPO/tests/sql/account-permission-assertions.sql" > "$RAPS_TEST_OUTPUT/assertions.log"
  if raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_TEST_OUTPUT/reapply.log" 2>&1; then
    printf 'Guard collision preflight unexpectedly succeeded.\n' >&2; exit 1
  fi
  # Capture the actual catalog with the read-only audit, then prove the transaction
  # did not modify it. This also checks the audit syntax against PostgreSQL 17.
  raps_psql -qAt < "$RAPS_REPO/supabase/maintenance/20261017_role_permission_audit.sql" > "$RAPS_TEST_OUTPUT/audit-before.jsonl"
  raps_psql -qAt < "$RAPS_REPO/supabase/maintenance/20261017_role_permission_audit.sql" > "$RAPS_TEST_OUTPUT/audit-after.jsonl"
  cmp "$RAPS_TEST_OUTPUT/audit-before.jsonl" "$RAPS_TEST_OUTPUT/audit-after.jsonl"
  python3 - "$RAPS_TEST_OUTPUT/audit-before.jsonl" <<'PY'
import json, pathlib, sys
reports=[json.loads(line) for line in pathlib.Path(sys.argv[1]).read_text().splitlines() if line.strip()]
assert {row['section'] for row in reports} == {'database','roles','relations','policies','columns','functions','triggers','constraints'}
PY
  printf '%s role/status schema: behavioral checks, collision preflight, and read-only audit passed.\n' "$RAPS_KIND"
done

# Two real sessions: a caller whose administrator role is revoked while its
# definer RPC waits must not retain authority from the statement's old snapshot.
raps_psql > "$RAPS_TEST_OUTPUT/revoke.log" <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update public.memberships set active=false,ends_at=now() where id='20000000-0000-0000-0000-000000000002';
\echo RAPS_REVOCATION_LOCK_HELD
select pg_sleep(3);
commit;
SQL
RAPS_REVOKE_PID=$!
for RAPS_WAIT in {1..30}; do
  if rg -q '^RAPS_REVOCATION_LOCK_HELD$' "$RAPS_TEST_OUTPUT/revoke.log"; then break; fi
  if [[ "$RAPS_WAIT" == 30 ]]; then printf 'Revocation test did not acquire its lock.\n' >&2; exit 1; fi
  sleep 0.1
done
raps_psql > "$RAPS_TEST_OUTPUT/race.log" <<'SQL'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000013')$$,'42501');
reset role;
select test.assert((select count(*)=0 from public.memberships where user_id='00000000-0000-0000-0000-000000000013'),'revoked caller cannot assign during an in-flight RPC');
SQL
wait "$RAPS_REVOKE_PID"
printf 'Concurrent revocation: an in-flight definer RPC loses administrator authority.\n'

RAPS_DATABASE=raps_bad_schema
docker exec "$RAPS_TEST_CONTAINER" createdb -U postgres "$RAPS_DATABASE"
sed '/^create role /d' "$RAPS_REPO/tests/sql/account-permission-fixture.sql" |
  raps_psql -v role_type=text -v status_type=text > "$RAPS_TEST_OUTPUT/bad-fixture.log"
raps_psql -c 'alter table public.memberships drop column active;' > /dev/null
if raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_TEST_OUTPUT/bad-contract.log" 2>&1; then
  printf 'Unknown schema preflight unexpectedly succeeded.\n' >&2; exit 1
fi
raps_psql -c "select test.assert(to_regprocedure('private.raps_account_is_enterprise_admin()') is null,'unknown schema rolled back before creating guards');" > /dev/null
raps_psql -c 'alter table public.memberships add column active boolean not null default true; alter table public.memberships disable row level security;' > /dev/null
if raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_TEST_OUTPUT/no-rls.log" 2>&1; then
  printf 'Disabled RLS preflight unexpectedly succeeded.\n' >&2; exit 1
fi
raps_psql -c "select test.assert(to_regprocedure('private.raps_account_is_enterprise_admin()') is null,'disabled RLS rolled back before creating guards');" > /dev/null
printf 'Unknown schema and disabled-RLS preflights abort without installing partial guards.\n'
raps_psql -c "alter table public.memberships enable row level security; update public.memberships set active=false where role='enterprise_admin';" > /dev/null
if raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_TEST_OUTPUT/no-admin.log" 2>&1; then
  printf 'Missing valid administrator preflight unexpectedly succeeded.\n' >&2; exit 1
fi
raps_psql -c "select test.assert(to_regprocedure('private.raps_account_is_enterprise_admin()') is null,'missing administrator preflight leaves no partial guards');" > /dev/null
printf 'Missing active global administrator preflight aborts without locking out existing access.\n'
