#!/usr/bin/env bash
# Read-only web.7 installation and runtime verification. No account/record writes.
set -euo pipefail
umask 077
[[ "$HOME" == /home/nuc ]] || { echo 'Run as nuc on the NUC.' >&2; exit 1; }
sudo -v
RAPS_CHECK=$(mktemp -d "$HOME/raps-web7-check-XXXXXXXX")
sudo docker exec -i -u postgres supabase-db psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 > "$RAPS_CHECK/guards.json" <<'SQL'
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
WITH functions AS (
  SELECT n.nspname AS schema,p.oid::regprocedure::text AS name,
    encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS source,
    (r.rolsuper OR r.rolbypassrls) AND r.rolname NOT IN ('anon','authenticated') AS trusted_owner,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
  WHERE (n.nspname='private' AND (starts_with(p.proname,'raps_account_') OR starts_with(p.proname,'raps_guard_') OR starts_with(p.proname,'raps_ops_') OR p.proname IN
    ('is_enterprise_admin','can_create_at_base','can_manage_base','can_oversee_base','can_manage_class','can_view_class','can_manage_event','can_grade_event','can_view_event','can_view_evaluation','can_edit_evaluation','can_view_participant','can_view_profile','can_view_membership')))
    OR (n.nspname='public' AND p.proname='class_closure_readiness')
), policies AS (
  SELECT tablename,policyname,permissive,roles,cmd,qual,with_check
  FROM pg_policies WHERE schemaname='public'
    AND (starts_with(policyname,'raps_account_guard_') OR starts_with(policyname,'raps_ops_guard_'))
), triggers AS (
  SELECT c.relname AS table_name,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal AND (starts_with(t.tgname,'raps_account_') OR starts_with(t.tgname,'raps_ops_'))
), tables AS (
  SELECT c.relname AS name,c.relrowsecurity AS rls,(r.rolsuper OR r.rolbypassrls) AND r.rolname NOT IN ('anon','authenticated') AS trusted_owner,
    has_table_privilege('anon',c.oid,'TRUNCATE') OR has_table_privilege('anon',c.oid,'REFERENCES') OR has_table_privilege('anon',c.oid,'TRIGGER') AS anon_nonrow_write,
    has_table_privilege('authenticated',c.oid,'TRUNCATE') OR has_table_privilege('authenticated',c.oid,'REFERENCES') OR has_table_privilege('authenticated',c.oid,'TRIGGER') AS authenticated_nonrow_write
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
  WHERE n.nspname='public' AND c.relname IN ('classes','evaluation_events','evaluations','participants','class_evaluators','event_evaluators','criterion_results','timer_results','profiles','memberships','access_requests','bases','majcoms','criteria','curriculum_versions','scenarios','audit_log','closed_class_archives')
), rubric AS (
  SELECT c.relname AS name, role_name,
    has_table_privilege(role_name,c.oid,'INSERT') OR has_table_privilege(role_name,c.oid,'UPDATE') OR has_table_privilege(role_name,c.oid,'DELETE') AS write
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN unnest(ARRAY['anon','authenticated']) role_name
  WHERE n.nspname='public' AND c.relname IN ('criteria','curriculum_versions')
), schemas AS (
  SELECT n.nspname AS name,role_name,has_schema_privilege(role_name,n.oid,'CREATE') AS create
  FROM pg_namespace n CROSS JOIN unnest(ARRAY['anon','authenticated']) role_name
  WHERE n.nspname IN ('public','private')
)
SELECT jsonb_build_object(
  'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.schema,f.name) FROM functions f),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.tablename,p.policyname) FROM policies p),
  'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.table_name,t.name) FROM triggers t),
  'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.name) FROM tables t),
  'rubric',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name,r.role_name) FROM rubric r),
  'schemas',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name,s.role_name) FROM schemas s)
);
COMMIT;
SQL
python3 - "$RAPS_CHECK/guards.json" <<'PY_CHECK'
import hashlib,json,sys
from pathlib import Path
# Generated from the reviewed PostgreSQL 17.6 enum/text fixtures.
expected = {'functions': ['61fbb6e5c8298421701cf6c228e33224ca70d032db9fa6f04fb70b62cf4fa529'],
 'policies': ['00abef0ab2613415030cf8dd2b89b4c1362c0dcc25e7b1b8017d9f0b3abfd2b6',
              '926b1c8606604ad9d97374103f3e08c6710a32b94421ce1d6de42654378a4889'],
 'rubric': ['ceef4b5aa114d07270a4a237cbdf3c502101650b50891190983493ac74a91b99'],
 'schemas': ['ce7503f0347bfbec3041cf030ea054631fe5e8924d4bce0c83d0251b84933495'],
 'tables': ['97702b8166a4bb8414eca4459dac8c495868d45202b01a22ccbcd6ec8d71e931'],
 'triggers': ['62ee8b0ee9e4779098f0f0cd58a9b97ce61d1bed60bfa166d1b3863bd21e7d21']}
actual=json.loads(Path(sys.argv[1]).read_text())
valid=True
for key,allowed in expected.items():
    digest=hashlib.sha256(json.dumps(actual.get(key),sort_keys=True,separators=(',',':')).encode()).hexdigest()
    matched=digest in allowed
    print('Database '+key+': '+('MATCH' if matched else 'DIFFERENT - review required'))
    valid=valid and matched
if not valid:
    print('Database verification incomplete. Private metadata:',sys.argv[1])
    raise SystemExit(1)
PY_CHECK
sudo docker inspect supabase-edge-functions | python3 -c '
import datetime,hashlib,json,pathlib,sys
c=json.load(sys.stdin)[0]
assert c["State"]["Running"], "Functions container is not running"
assert any(m["Source"]=="/home/nuc/supabase-project/volumes/functions" and m["Destination"]=="/home/deno/functions" for m in c["Mounts"]), "Unexpected function mount"
started=datetime.datetime.fromisoformat(c["State"]["StartedAt"].replace("Z","+00:00")).timestamp()
expected={"admin-invite-user":"88b2a00dcebb2501c554339787c34e567db5cc00528d1aca6b6a4038e2fc792e","admin-manage-user":"9b6f19b8b889d38daeee5f4f29fca1079a595c2e499aa74eef651bba0028ab6c"}
for name,digest in expected.items():
    p=pathlib.Path("/home/nuc/supabase-project/volumes/functions")/name/"index.ts"
    assert hashlib.sha256(p.read_bytes()).hexdigest()==digest, "Handler source differs from reviewed version"
    print(name+" file predates Functions start: "+str(p.stat().st_mtime<=started))
'
sudo docker exec -i -u postgres supabase-db psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL_ACL'
BEGIN READ ONLY;
DO $check$ BEGIN
  IF has_function_privilege('anon','public.request_closed_class_archive_deletion(uuid,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.request_closed_class_archive_deletion(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','private.class_closure_readiness(uuid)','EXECUTE')
    OR has_function_privilege('authenticated','private.class_closure_integrity(uuid)','EXECUTE')
    OR has_function_privilege('anon','private.class_closure_readiness(uuid)','EXECUTE')
    OR has_function_privilege('anon','private.class_closure_integrity(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'Archive/readiness execution privileges differ from reviewed guards'; END IF;
END; $check$;
COMMIT;
SQL_ACL
printf 'Archive/readiness execution privileges: MATCH\n'
RAPS_CURL=(curl --silent --show-error --connect-timeout 10 --max-time 30 --resolve raps-supabase.asuscomm.com:443:127.0.0.1)
RAPS_URL=https://raps-supabase.asuscomm.com/functions/v1
"${RAPS_CURL[@]}" --fail "$RAPS_URL/request-access" > "$RAPS_CHECK/catalog.json"
python3 - "$RAPS_CHECK/catalog.json" <<'PY_CATALOG'
import json,sys
x=json.load(open(sys.argv[1])); assert isinstance(x.get('bases'),list) and isinstance(x.get('majcoms'),list)
print('Public catalog: OK')
PY_CATALOG
for RAPS_FUNCTION in admin-invite-user admin-manage-user; do
  RAPS_STATUS=$("${RAPS_CURL[@]}" -H 'Content-Type: application/json' --data '{}' -o "$RAPS_CHECK/$RAPS_FUNCTION.json" -w '%{http_code}' "$RAPS_URL/$RAPS_FUNCTION")
  [[ "$RAPS_STATUS" == 401 ]]
  python3 - "$RAPS_CHECK/$RAPS_FUNCTION.json" "$RAPS_FUNCTION" <<'PY_ENDPOINT'
import json,sys
expected='INVITE_AUTH' if sys.argv[2]=='admin-invite-user' else 'ADMIN_AUTH'
assert json.load(open(sys.argv[1])).get('code')==expected
print(sys.argv[2]+': expected HTTP 401 and '+expected)
PY_ENDPOINT
done
printf 'Private verification metadata: %s\n' "$RAPS_CHECK"
