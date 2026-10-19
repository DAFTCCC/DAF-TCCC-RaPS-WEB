#!/usr/bin/env bash
# Network-isolated synthetic PostgreSQL only. Never connects to the NUC.
set -euo pipefail
umask 077
RAPS_REPO=$(cd "$(dirname "$0")/.." && pwd)
RAPS_IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
RAPS_CONTAINER="raps-class-create-test-$$"
RAPS_OUTPUT=$(mktemp -d)
cleanup() {
  RAPS_RESULT=$?
  if [[ "$RAPS_RESULT" != 0 && -f "$RAPS_OUTPUT/current.log" ]]; then
    tail -50 "$RAPS_OUTPUT/current.log" >&2
  fi
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
  RAPS_DATABASE="class_create_$RAPS_KIND"
  docker exec "$RAPS_CONTAINER" createdb -U postgres "$RAPS_DATABASE"
  if [[ "$RAPS_KIND" == enum ]]; then
    raps_psql -v role_type=public.fixture_role -v status_type=public.fixture_status \
      < "$RAPS_REPO/tests/sql/account-permission-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
    RAPS_OPS_STATUS=public.fixture_operational_status
    RAPS_OPS_RESULT=public.fixture_result
  else
    sed '/^create role /d' "$RAPS_REPO/tests/sql/account-permission-fixture.sql" |
      raps_psql -v role_type=text -v status_type=text > "$RAPS_OUTPUT/current.log" 2>&1
    RAPS_OPS_STATUS=text
    RAPS_OPS_RESULT=text
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql -v phase=baseline -v ops_status="$RAPS_OPS_STATUS" -v ops_result="$RAPS_OPS_RESULT" \
    < "$RAPS_REPO/tests/sql/operational-permission-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  # Match the deployed web.8 credential/archive/catalog guards, rather than
  # replacing authorization with a permissive fake or widening SELECT policy.
  raps_psql > "$RAPS_OUTPUT/current.log" 2>&1 <<'SQL'
alter table public.audit_log add column actor_user_id uuid, add column entity_type text,
  add column entity_id uuid, add column new_value jsonb;
alter table public.participants add column app_data jsonb not null default '{}';
alter table public.evaluations add column app_data jsonb not null default '{}';
alter table public.evaluations add column started_at timestamptz;
SQL
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_managed_login.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_class_reporting_archives.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql -v phase=prepare -v catalog_code_type=text -v catalog_name_type=text \
    < "$RAPS_REPO/tests/sql/test-majcom-catalog-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql < "$RAPS_REPO/supabase/migrations/20261019_test_majcom_catalog.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql < "$RAPS_REPO/tests/sql/class-create-permission-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  printf '%s schema: class INSERT RETURNING failure, separate protected read, TEST/live scope, ownership, revocation, and credential gates passed.\n' "$RAPS_KIND"
done
