#!/usr/bin/env bash
# Network-isolated PostgreSQL test for 20261101_offline_field_finalization.sql.
# Never connects to the NUC. Uses Docker (postgres:17.6) by default, or an
# existing throwaway local server when RAPS_PG_SOCKET (and optionally
# RAPS_PG_PORT) points at it. The local server's roles anon/authenticated are
# dropped and recreated, so never point it at a real database cluster.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
DB=raps_offline_finalization
if [[ -n "${RAPS_PG_SOCKET:-}" ]]; then
  PORT=${RAPS_PG_PORT:-5432}
  run() { psql -X -q -h "$RAPS_PG_SOCKET" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 "$@"; }
  run -d postgres -c "drop database if exists $DB" -c "drop role if exists anon" -c "drop role if exists authenticated" -c "create database $DB"
  sql() { run -d "$DB"; }
else
  IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
  NAME="raps-offline-test-$$"
  trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
  docker run --rm -d --name "$NAME" --network none --tmpfs /var/lib/postgresql/data:rw,size=256m \
    -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
  for i in {1..30}; do docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  docker exec "$NAME" createdb -U postgres "$DB"
  sql() { docker exec -i "$NAME" psql -X -q -U postgres -d "$DB" -v ON_ERROR_STOP=1; }
fi
sql < "$REPO/tests/sql/offline-finalization-fixture.sql" >/dev/null
sql < "$REPO/supabase/migrations/20261101_offline_field_finalization.sql" >/dev/null 2>&1
sql < "$REPO/tests/sql/offline-finalization-assertions.sql" 2>&1 | sed -n 's/.*NOTICE:  //p; /PASSED/p'
