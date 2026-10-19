#!/usr/bin/env bash
# Network-isolated synthetic PostgreSQL only. No NUC, ports, or credentials.
set -euo pipefail
umask 077
RAPS_REPO=$(cd "$(dirname "$0")/.." && pwd)
RAPS_IMAGE=${RAPS_RBAC_TEST_IMAGE:-postgres:17.6}
RAPS_CONTAINER="raps-test-catalog-$$"
RAPS_OUTPUT=$(mktemp -d)
cleanup() {
  RAPS_RESULT=$?
  if [[ "$RAPS_RESULT" != 0 && -f "$RAPS_OUTPUT/current.log" ]]; then
    tail -40 "$RAPS_OUTPUT/current.log" >&2
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
RAPS_MIGRATION="$RAPS_REPO/supabase/migrations/20261019_test_majcom_catalog.sql"
# Import the helper's pure query builder only; its main deployment entrypoint
# is never called and the generated SQL is executed solely in this container.
python3 - "$RAPS_REPO/supabase/maintenance/deploy-web8-on-nuc.sh" "$RAPS_OUTPUT" <<'PY'
import pathlib, sys
helper = pathlib.Path(sys.argv[1])
source = helper.read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
namespace = {'__name__': 'synthetic_deployment_fingerprints'}
exec(compile(source, str(helper), 'exec'), namespace)
for kind in ('managed', 'archive', 'test'):
    pathlib.Path(sys.argv[2], kind + '-fingerprint.sql').write_text(namespace['fingerprint'](kind) + ';\n')
PY
for RAPS_KIND in enum text; do
  RAPS_DATABASE="test_catalog_$RAPS_KIND"
  docker exec "$RAPS_CONTAINER" createdb -U postgres "$RAPS_DATABASE"
  if [[ "$RAPS_KIND" == enum ]]; then
    raps_psql -v role_type=public.fixture_role -v status_type=public.fixture_status \
      < "$RAPS_REPO/tests/sql/account-permission-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
    RAPS_OPS_STATUS=public.fixture_operational_status
    RAPS_OPS_RESULT=public.fixture_result
    RAPS_CATALOG_CODE_TYPE='varchar(80)'
    RAPS_CATALOG_NAME_TYPE='varchar(200)'
  else
    sed '/^create role /d' "$RAPS_REPO/tests/sql/account-permission-fixture.sql" |
      raps_psql -v role_type=text -v status_type=text > "$RAPS_OUTPUT/current.log" 2>&1
    RAPS_OPS_STATUS=text
    RAPS_OPS_RESULT=text
    RAPS_CATALOG_CODE_TYPE=text
    RAPS_CATALOG_NAME_TYPE=text
  fi
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_account_permission_guards.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql -v phase=baseline -v ops_status="$RAPS_OPS_STATUS" -v ops_result="$RAPS_OPS_RESULT" \
    < "$RAPS_REPO/tests/sql/operational-permission-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql < "$RAPS_REPO/supabase/migrations/20261017_operational_permission_guards.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  # Install the previous web.8 migrations too, so runtime ledger compatibility
  # is checked against their actual objects rather than empty fingerprints.
  raps_psql > "$RAPS_OUTPUT/current.log" 2>&1 <<'SQL'
alter table public.audit_log add column actor_user_id uuid, add column entity_type text,
  add column entity_id uuid, add column new_value jsonb;
alter table public.participants add column app_data jsonb not null default '{}';
alter table public.evaluations add column app_data jsonb not null default '{}';
alter table public.evaluations add column started_at timestamptz;
SQL
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_managed_login.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql < "$RAPS_REPO/supabase/migrations/20261018_class_reporting_archives.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  raps_psql -v phase=prepare -v catalog_code_type="$RAPS_CATALOG_CODE_TYPE" -v catalog_name_type="$RAPS_CATALOG_NAME_TYPE" \
    < "$RAPS_REPO/tests/sql/test-majcom-catalog-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  for RAPS_FINGERPRINT_KIND in managed archive; do
    raps_psql -qAt < "$RAPS_OUTPUT/$RAPS_FINGERPRINT_KIND-fingerprint.sql" > "$RAPS_OUTPUT/$RAPS_FINGERPRINT_KIND-before.txt"
  done
  if [[ "$RAPS_KIND" == enum ]]; then
    RAPS_BASELINE_DATABASE=$RAPS_DATABASE
    # Each rejected contract uses a cloned local synthetic database. Assertions
    # prove the failure leaves no partially installed TEST catalog or mapping.
    for RAPS_CASE in unknown_command unknown_base duplicate_command duplicate_base invalid_code code_overflow name_overflow no_admin missing_guard disabled_guard mapping_collision; do
      RAPS_DATABASE="test_catalog_bad_$RAPS_CASE"
      docker exec "$RAPS_CONTAINER" createdb -U postgres -T "$RAPS_BASELINE_DATABASE" "$RAPS_DATABASE"
      case "$RAPS_CASE" in
        unknown_command) RAPS_BAD_SQL="insert into public.majcoms(code,name) values ('TEST','Untrusted preexisting TEST');" ;;
        unknown_base) RAPS_BAD_SQL="insert into public.bases(code,name,majcom_id) values ('TEST-PHYSICAL-1','Untrusted existing base','10000000-0000-0000-0000-000000000001');" ;;
        duplicate_command) RAPS_BAD_SQL="insert into public.majcoms(code,name) values ('LIVE-1','Duplicate code');" ;;
        duplicate_base) RAPS_BAD_SQL="insert into public.bases(code,name,majcom_id) values ('PHYSICAL-1','Duplicate code','10000000-0000-0000-0000-000000000001');" ;;
        invalid_code) RAPS_BAD_SQL="update public.bases set code=' invalid code' where code='PHYSICAL-1';" ;;
        code_overflow) RAPS_BAD_SQL="alter table public.bases alter column code type varchar(10);" ;;
        name_overflow) RAPS_BAD_SQL="alter table public.bases alter column name type varchar(16);" ;;
        no_admin) RAPS_BAD_SQL="update public.memberships set active=false where role::text='enterprise_admin';" ;;
        missing_guard) RAPS_BAD_SQL="drop policy raps_ops_guard_select on public.classes;" ;;
        disabled_guard) RAPS_BAD_SQL="alter table public.evaluations disable trigger raps_ops_evaluation_identity;" ;;
        mapping_collision) RAPS_BAD_SQL="create table private.raps_test_installations (untrusted boolean);" ;;
      esac
      raps_psql -c "$RAPS_BAD_SQL" > "$RAPS_OUTPUT/current.log" 2>&1
      if raps_psql < "$RAPS_MIGRATION" > "$RAPS_OUTPUT/current.log" 2>&1; then
        printf 'TEST catalog unexpectedly accepted %s.\n' "$RAPS_CASE" >&2; exit 1
      fi
      if [[ "$RAPS_CASE" != unknown_command ]]; then
        raps_psql -c "select test.assert(not exists (select 1 from public.majcoms where code='TEST'),'rejected contract creates no TEST command');" > "$RAPS_OUTPUT/current.log" 2>&1
      fi
      if [[ "$RAPS_CASE" != mapping_collision ]]; then
        raps_psql -c "select test.assert(to_regclass('private.raps_test_installations') is null,'rejected contract installs no private mapping');" > "$RAPS_OUTPUT/current.log" 2>&1
      fi
    done
    # Also test the complete checked-in physical catalog rather than just the
    # small authorization fixture: 73 physical installations become 73 copies.
    RAPS_DATABASE=test_catalog_full_seed
    docker exec "$RAPS_CONTAINER" createdb -U postgres -T "$RAPS_BASELINE_DATABASE" "$RAPS_DATABASE"
    raps_psql -c 'truncate public.majcoms cascade;' > "$RAPS_OUTPUT/current.log" 2>&1
    python3 - "$RAPS_REPO/supabase/seed-raps-catalog.sql" <<'PY' | raps_psql > "$RAPS_OUTPUT/current.log" 2>&1
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
print(source.split('-- Published RaPS curriculum versions', 1)[0] + '\ncommit;')
PY
    raps_psql -c "insert into public.memberships(user_id,role) values ('00000000-0000-0000-0000-000000000001','enterprise_admin');" > "$RAPS_OUTPUT/current.log" 2>&1
    raps_psql < "$RAPS_MIGRATION" > "$RAPS_OUTPUT/current.log" 2>&1
    raps_psql -c "select test.assert((select count(*)=73 from private.raps_test_installations) and (select count(*)=146 from public.bases) and (select count(*)=12 from public.majcoms),'complete physical catalog gets one TEST copy per installation');" > "$RAPS_OUTPUT/current.log" 2>&1
    RAPS_DATABASE=$RAPS_BASELINE_DATABASE
  fi
  raps_psql < "$RAPS_MIGRATION" > "$RAPS_OUTPUT/current.log" 2>&1
  for RAPS_FINGERPRINT_KIND in managed archive; do
    raps_psql -qAt < "$RAPS_OUTPUT/$RAPS_FINGERPRINT_KIND-fingerprint.sql" > "$RAPS_OUTPUT/$RAPS_FINGERPRINT_KIND-after.txt"
    cmp "$RAPS_OUTPUT/$RAPS_FINGERPRINT_KIND-before.txt" "$RAPS_OUTPUT/$RAPS_FINGERPRINT_KIND-after.txt"
  done
  raps_psql -qAt < "$RAPS_OUTPUT/test-fingerprint.sql" > "$RAPS_OUTPUT/test-fingerprint-before.txt"
  raps_psql -qAt < "$RAPS_OUTPUT/test-fingerprint.sql" > "$RAPS_OUTPUT/test-fingerprint-after.txt"
  cmp "$RAPS_OUTPUT/test-fingerprint-before.txt" "$RAPS_OUTPUT/test-fingerprint-after.txt"
  python3 - "$RAPS_OUTPUT/test-fingerprint-after.txt" <<'PY'
import pathlib, re, sys
assert re.fullmatch('[0-9a-f]{64}\\n', pathlib.Path(sys.argv[1]).read_text())
PY
  raps_psql -v phase=assertions < "$RAPS_REPO/tests/sql/test-majcom-catalog-fixture.sql" > "$RAPS_OUTPUT/current.log" 2>&1
  if raps_psql < "$RAPS_MIGRATION" > "$RAPS_OUTPUT/current.log" 2>&1; then
    printf 'Once-only TEST catalog collision unexpectedly succeeded.\n' >&2; exit 1
  fi
  printf '%s schema: TEST catalog, ordinary role/RLS reads and writes, claim contexts, explicit sharing, unchanged clinical functions, compatible deployment fingerprints, and once-only collision checks passed.\n' "$RAPS_KIND"
done
printf 'Full 73-installation catalog and 11 fail-closed preflight cases passed.\n'
