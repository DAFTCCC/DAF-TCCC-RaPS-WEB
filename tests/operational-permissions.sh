#!/usr/bin/env bash
# Network-isolated, synthetic PostgreSQL tests. Never connects to the NUC.
set -euo pipefail
RAPS_REPO=$(cd "$(dirname "$0")/.." && pwd)
RAPS_IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
RAPS_CONTAINER="raps-operational-test-$$"
RAPS_OUTPUT=$(mktemp -d)
trap 'docker rm -f "$RAPS_CONTAINER" >/dev/null 2>&1 || true; rm -rf "$RAPS_OUTPUT"' EXIT
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
  RAPS_DATABASE="ops_$RAPS_KIND"
  docker exec "$RAPS_CONTAINER" createdb -U postgres "$RAPS_DATABASE"
  if [[ "$RAPS_KIND" == enum ]]; then
    raps_psql -v role_type=public.fixture_role -v status_type=public.fixture_status \
      < "$RAPS_REPO/tests/sql/account-permission-fixture.sql" > "$RAPS_OUTPUT/fixture.log"
  else
    sed '/^create role /d' "$RAPS_REPO/tests/sql/account-permission-fixture.sql" |
      raps_psql -v role_type=text -v status_type=text > "$RAPS_OUTPUT/fixture.log"
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_OUTPUT/accounts.log"
  if [[ "$RAPS_KIND" == enum ]]; then
    RAPS_OPS_STATUS=public.fixture_operational_status
    RAPS_OPS_RESULT=public.fixture_result
  else
    RAPS_OPS_STATUS=text
    RAPS_OPS_RESULT=text
  fi
  raps_psql -v phase=baseline -v ops_status="$RAPS_OPS_STATUS" -v ops_result="$RAPS_OPS_RESULT" < "$RAPS_REPO/tests/sql/operational-permission-fixture.sql" > "$RAPS_OUTPUT/baseline.log"
  if [[ "$RAPS_KIND" == enum ]]; then
    # Clone only the isolated synthetic fixture. Unknown deployed contracts must
    # abort before changing existing helpers or installing any partial guards.
    docker exec "$RAPS_CONTAINER" createdb -U postgres -T "$RAPS_DATABASE" ops_bad_contract
    docker exec "$RAPS_CONTAINER" psql -X -U postgres -d ops_bad_contract -v ON_ERROR_STOP=1 \
      -c 'alter table public.classes drop column app_data;' > /dev/null
    if docker exec -i "$RAPS_CONTAINER" psql -X -U postgres -d ops_bad_contract -v ON_ERROR_STOP=1 \
      < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/bad-contract.log" 2>&1; then
      printf 'Unsupported operational schema unexpectedly accepted.\n' >&2; exit 1
    fi
    docker exec "$RAPS_CONTAINER" psql -X -U postgres -d ops_bad_contract -v ON_ERROR_STOP=1 \
      -c "select test.assert(to_regprocedure('private.raps_ops_memberships()') is null,'unknown schema installs no partial operational guards');" > /dev/null
    docker exec "$RAPS_CONTAINER" createdb -U postgres -T "$RAPS_DATABASE" ops_bad_owner
    docker exec "$RAPS_CONTAINER" psql -X -U postgres -d ops_bad_owner -v ON_ERROR_STOP=1 \
      -c 'alter function public.class_closure_readiness(uuid) owner to authenticated;' > /dev/null
    if docker exec -i "$RAPS_CONTAINER" psql -X -U postgres -d ops_bad_owner -v ON_ERROR_STOP=1 \
      < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/bad-owner.log" 2>&1; then
      printf 'Untrusted readiness function ownership unexpectedly accepted.\n' >&2; exit 1
    fi
    docker exec "$RAPS_CONTAINER" psql -X -U postgres -d ops_bad_owner -v ON_ERROR_STOP=1 \
      -c "select test.assert(to_regprocedure('private.raps_ops_memberships()') is null,'untrusted function owner installs no partial operational guards');" > /dev/null
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/migration.log"
  raps_psql -v phase=assertions < "$RAPS_REPO/tests/sql/operational-permission-fixture.sql" > "$RAPS_OUTPUT/assertions.log"
  if raps_psql < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/reapply.log" 2>&1; then
    printf 'Migration collision unexpectedly succeeded.\n' >&2; exit 1
  fi
  printf '%s schema: operational authorization, historical bypasses, clinical-RPC preservation, and collision checks passed.\n' "$RAPS_KIND"
done
