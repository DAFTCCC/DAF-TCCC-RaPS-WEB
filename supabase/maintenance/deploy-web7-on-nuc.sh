#!/usr/bin/env bash
# Run on NUC #1 as nuc. Installs only the merged RaPS web.7 backend changes.
set -euo pipefail
umask 077
[[ "$HOME" == /home/nuc ]] || { echo 'Run this as the nuc account.' >&2; exit 1; }
RAPS_PREVIOUS_STAGE=''
RAPS_DEFER_AUTH=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --resume-stage)
      [[ $# -ge 2 ]] || { echo '--resume-stage requires a directory.' >&2; exit 1; }
      RAPS_PREVIOUS_STAGE=$2
      [[ -d "$RAPS_PREVIOUS_STAGE" && ! -L "$RAPS_PREVIOUS_STAGE" ]] || { echo 'The previous stage must be an existing directory.' >&2; exit 1; }
      shift 2 ;;
    --defer-auth) RAPS_DEFER_AUTH=true; shift ;;
    *) echo 'Usage: deploy-web7-on-nuc.sh [--resume-stage DIRECTORY] [--defer-auth]' >&2; exit 1 ;;
  esac
done
RAPS_PROJECT=/home/nuc/supabase-project
# Each attempt retains its own backups; a resumed download never overwrites the
# original dump or the incomplete configuration archive from an earlier attempt.
RAPS_STAGE=$(mktemp -d "$HOME/raps-web7-XXXXXXXX")
RAPS_OVERRIDE="$RAPS_PROJECT/docker-compose.raps-web7-auth.yml"
trap 'printf "Stopped at line %s. Private files: %s\nKeep this stage; do not rerun migrations or restore the database blindly.\n" "$LINENO" "$RAPS_STAGE" >&2' ERR
RAPS_SOURCE=https://raw.githubusercontent.com/DAFTCCC/DAF-TCCC-RaPS-WEB/c7226cf34d452efbfa3ff27d64a18490fe9b1642
while read -r RAPS_HASH RAPS_FILE; do
  RAPS_LOCAL=${RAPS_FILE##*/}
  if [[ "$RAPS_FILE" == */admin-*/index.ts ]]; then
    RAPS_LOCAL="$(basename "$(dirname "$RAPS_FILE")").ts"
  fi
  if [[ -n "$RAPS_PREVIOUS_STAGE" ]]; then
    cp -- "$RAPS_PREVIOUS_STAGE/$RAPS_LOCAL" "$RAPS_STAGE/$RAPS_LOCAL"
  else
    curl --fail --silent --show-error --location --connect-timeout 10 --max-time 90 \
      "$RAPS_SOURCE/$RAPS_FILE" -o "$RAPS_STAGE/$RAPS_LOCAL"
  fi
  printf '%s  %s\n' "$RAPS_HASH" "$RAPS_STAGE/$RAPS_LOCAL" | sha256sum --check --status
done <<'FILES'
be1052486b6776aac556d0e3cb89e871139dbd15f9efa3ec2399937b8e30854f supabase/migrations/20261017_account_permission_guards.sql
f61ccb47b944b62408b67abd937db8867c47e2c9c5ab5435877d74bd28390af7 supabase/migrations/20261017_operational_permission_guards.sql
88b2a00dcebb2501c554339787c34e567db5cc00528d1aca6b6a4038e2fc792e supabase/functions/admin-invite-user/index.ts
9b6f19b8b889d38daeee5f4f29fca1079a595c2e499aa74eef651bba0028ab6c supabase/functions/admin-manage-user/index.ts
98034a5bae27d0c08ce668b52452485ee506f24888bdf65cf7c6073ced9d2986 supabase/maintenance/20261017_role_permission_audit.sql
FILES
sudo -v
if [[ "$RAPS_DEFER_AUTH" == false ]]; then
  [[ ! -e "$RAPS_OVERRIDE" && ! -L "$RAPS_OVERRIDE" ]]
fi
RAPS_CONFIG_FILES=(docker-compose.yml docker-compose.isolation.yml .env)
if [[ "$RAPS_DEFER_AUTH" == false ]]; then RAPS_CONFIG_FILES+=(docker-compose.caddy.yml); fi
# Container labels record original paths even after a file has been removed.
# Require every recorded input before starting backups or database installation.
raps_require_configs() {
  for RAPS_FILE in "${RAPS_CONFIG_FILES[@]}"; do
    if ! sudo test -f "$RAPS_PROJECT/$RAPS_FILE"; then
      printf 'Required configuration is missing: %s\nRecover the original file before recreating its service.\n' "$RAPS_PROJECT/$RAPS_FILE" >&2
      return 1
    fi
  done
}
raps_require_configs
for RAPS_FUNCTION in admin-invite-user admin-manage-user; do
  RAPS_TARGET="$RAPS_PROJECT/volumes/functions/$RAPS_FUNCTION"
  [[ ! -L "$RAPS_TARGET" && ! -L "$RAPS_TARGET/index.ts" ]]
done
sudo docker inspect supabase-edge-functions supabase-auth | python3 -c '
import json,sys
p="/home/nuc/supabase-project/"
expected={"/supabase-edge-functions":("functions","docker-compose.isolation.yml"),"/supabase-auth":("auth","docker-compose.caddy.yml")}
for c in json.load(sys.stdin):
    service,override=expected[c["Name"]]; labels=c["Config"]["Labels"]
    assert labels["com.docker.compose.project"]=="supabase", "Unexpected Compose project"
    assert labels["com.docker.compose.service"]==service, "Unexpected Compose service"
    assert labels["com.docker.compose.project.config_files"].split(",")==[p+"docker-compose.yml",p+override], "Unexpected Compose files"
    assert c["State"]["Running"], "Required service is not running"
    if service=="functions":
        assert any(m["Source"]==p+"volumes/functions" and m["Destination"]=="/home/deno/functions" for m in c["Mounts"]), "Unexpected function mount"
'
if [[ "$RAPS_DEFER_AUTH" == false ]]; then
  RAPS_MIN=$(sudo docker inspect supabase-auth | python3 -c 'import json,sys; e=dict(x.split("=",1) for x in json.load(sys.stdin)[0]["Config"]["Env"]); print(max(12,int(e.get("GOTRUE_PASSWORD_MIN_LENGTH") or 0)))')
fi
printf '%s\n' "$RAPS_STAGE" > "$HOME/.raps-web7-stage"
raps_psql() { sudo docker exec -i -u postgres supabase-db psql -X -qAt -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }
RAPS_EXISTING_GUARDS=$(raps_psql -c "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND (policyname LIKE 'raps_account_guard_%' OR policyname LIKE 'raps_ops_guard_%');")
[[ "$RAPS_EXISTING_GUARDS" == 0 ]] || { printf 'Permission guards already exist; inspect the completed migration state before resuming.\n' >&2; false; }
sudo docker exec -u postgres supabase-db pg_dump -U postgres -d postgres -Fc > "$RAPS_STAGE/database-before.dump"
sudo docker exec -i -u postgres supabase-db pg_restore -l < "$RAPS_STAGE/database-before.dump" > "$RAPS_STAGE/database-before.toc"
[[ -s "$RAPS_STAGE/database-before.toc" ]]
sudo tar -czf - -C "$RAPS_PROJECT/volumes" functions > "$RAPS_STAGE/functions-before.tar.gz"
sudo tar --dereference -czf - -C "$RAPS_PROJECT" "${RAPS_CONFIG_FILES[@]}" > "$RAPS_STAGE/config-before.tar.gz"
printf '%s\n' "${RAPS_CONFIG_FILES[@]}" > "$RAPS_STAGE/config-backup-files.txt"
raps_psql < "$RAPS_STAGE/20261017_role_permission_audit.sql" > "$RAPS_STAGE/catalog-before.jsonl"
cat > "$RAPS_STAGE/protected-hashes.sql" <<'SQL'
SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||') '||md5(pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE (n.nspname='public' AND p.proname IN ('claim_evaluation_authoritatively','finalize_evaluation_authoritatively','void_evaluation_authoritatively','close_class_authoritatively'))
   OR (n.nspname='private' AND p.proname IN ('class_closure_readiness','class_closure_integrity'))
ORDER BY n.nspname,p.proname,p.oid;
SQL
raps_psql < "$RAPS_STAGE/protected-hashes.sql" > "$RAPS_STAGE/protected-before.txt"
[[ $(wc -l < "$RAPS_STAGE/protected-before.txt") -eq 6 ]]
python3 - "$RAPS_STAGE" <<'PY'
import pathlib,sys
stage=pathlib.Path(sys.argv[1]); bodies=[]
for name in ('20261017_account_permission_guards.sql','20261017_operational_permission_guards.sql'):
    lines=(stage/name).read_text().splitlines(keepends=True)
    assert lines.count('begin;\n')==1 and lines.count('commit;\n')==1, 'Unexpected transaction boundaries'
    bodies.append(''.join(line for line in lines if line not in ('begin;\n','commit;\n')))
body='BEGIN;\n'+'\n'.join(bodies)+'\n'
(stage/'guards-install.sql').write_text(body+'COMMIT;\n')
(stage/'guards-preflight.sql').write_text(body+'ROLLBACK;\n')
PY
raps_psql < "$RAPS_STAGE/guards-preflight.sql" > "$RAPS_STAGE/preflight.log" 2>&1 || { tail -n 25 "$RAPS_STAGE/preflight.log" >&2; false; }
raps_psql < "$RAPS_STAGE/guards-install.sql" > "$RAPS_STAGE/install.log" 2>&1 || { tail -n 25 "$RAPS_STAGE/install.log" >&2; false; }
for RAPS_FUNCTION in admin-invite-user admin-manage-user; do
  RAPS_TARGET="$RAPS_PROJECT/volumes/functions/$RAPS_FUNCTION"
  [[ ! -L "$RAPS_TARGET" && ! -L "$RAPS_TARGET/index.ts" ]]
  sudo install -d -m 0755 "$RAPS_TARGET"
  sudo install -m 0644 "$RAPS_STAGE/$RAPS_FUNCTION.ts" "$RAPS_TARGET/index.ts"
done
sudo docker compose --project-directory "$RAPS_PROJECT" --env-file "$RAPS_PROJECT/.env" -p supabase \
  -f "$RAPS_PROJECT/docker-compose.yml" -f "$RAPS_PROJECT/docker-compose.isolation.yml" \
  up -d --force-recreate --no-deps --pull never --no-build functions
if [[ "$RAPS_DEFER_AUTH" == false ]]; then
  printf 'services:\n  auth:\n    environment:\n      GOTRUE_DISABLE_SIGNUP: "true"\n      GOTRUE_PASSWORD_MIN_LENGTH: "%s"\n' "$RAPS_MIN" > "$RAPS_STAGE/auth-hardening.yml"
  sudo install -m 0600 "$RAPS_STAGE/auth-hardening.yml" "$RAPS_OVERRIDE"
  sudo docker compose --project-directory "$RAPS_PROJECT" --env-file "$RAPS_PROJECT/.env" -p supabase \
    -f "$RAPS_PROJECT/docker-compose.yml" -f "$RAPS_PROJECT/docker-compose.caddy.yml" -f "$RAPS_OVERRIDE" \
    up -d --force-recreate --no-deps --pull never --no-build auth
  sudo docker inspect supabase-auth | python3 -c 'import json,sys; e=dict(x.split("=",1) for x in json.load(sys.stdin)[0]["Config"]["Env"]); assert e.get("GOTRUE_DISABLE_SIGNUP")=="true" and int(e.get("GOTRUE_PASSWORD_MIN_LENGTH") or 0)>=12, "Auth hardening is not active"'
fi
raps_psql < "$RAPS_STAGE/protected-hashes.sql" > "$RAPS_STAGE/protected-after.txt"
cmp -s "$RAPS_STAGE/protected-before.txt" "$RAPS_STAGE/protected-after.txt"
raps_psql > "$RAPS_STAGE/database-check.log" <<'SQL'
DO $check$ BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'raps_account_guard_%' AND permissive='RESTRICTIVE')<>10
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'raps_ops_guard_%' AND permissive='RESTRICTIVE')<>80
    OR (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgname IN ('raps_account_membership_write','raps_account_access_review','raps_account_profile_write','raps_ops_class_identity','raps_ops_event_identity','raps_ops_participant_identity','raps_ops_evaluation_identity','raps_ops_criterion_identity','raps_ops_timer_identity'))<>9
    OR has_function_privilege('anon','public.request_closed_class_archive_deletion(uuid,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Installed permission verification failed'; END IF;
END; $check$;
SQL
raps_psql < "$RAPS_STAGE/20261017_role_permission_audit.sql" > "$RAPS_STAGE/catalog-after.jsonl"
raps_wait() {
  for RAPS_TRY in {1..30}; do
    if sudo docker inspect "$1" | python3 -c 'import json,sys; c=json.load(sys.stdin)[0]; sys.exit(0 if c["State"]["Running"] and c["State"].get("Health",{}).get("Status","healthy")=="healthy" else 1)'; then return 0; fi
    sleep 2
  done
  return 1
}
raps_wait supabase-edge-functions
if [[ "$RAPS_DEFER_AUTH" == false ]]; then raps_wait supabase-auth; fi
RAPS_CURL=(curl --silent --show-error --connect-timeout 10 --max-time 30 --resolve raps-supabase.asuscomm.com:443:127.0.0.1)
RAPS_URL=https://raps-supabase.asuscomm.com/functions/v1
"${RAPS_CURL[@]}" --fail --retry 10 --retry-delay 2 --retry-connrefused "$RAPS_URL/request-access" > "$RAPS_STAGE/catalog-smoke.json"
python3 - "$RAPS_STAGE/catalog-smoke.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1])); assert isinstance(x.get('bases'),list) and isinstance(x.get('majcoms'),list), 'Public catalog failed'
PY
for RAPS_FUNCTION in admin-invite-user admin-manage-user; do
  RAPS_STATUS=$("${RAPS_CURL[@]}" -H 'Content-Type: application/json' --data '{}' -o "$RAPS_STAGE/$RAPS_FUNCTION-smoke.json" -w '%{http_code}' "$RAPS_URL/$RAPS_FUNCTION")
  [[ "$RAPS_STATUS" == 401 ]]
  python3 - "$RAPS_STAGE/$RAPS_FUNCTION-smoke.json" "$RAPS_FUNCTION" <<'PY'
import json,sys
expected='INVITE_AUTH' if sys.argv[2]=='admin-invite-user' else 'ADMIN_AUTH'
assert json.load(open(sys.argv[1])).get('code')==expected, 'Unexpected administrative handler response'
PY
done
if [[ "$RAPS_DEFER_AUTH" == true ]]; then
  printf 'RaPS web.7 database and functions installed; permission and endpoint checks passed.\nAuth was not changed; signup and password-policy hardening remain pending.\nPrivate backups and logs: %s\n' "$RAPS_STAGE"
else
  printf 'RaPS web.7 backend installed; database, Auth settings, and unauthenticated endpoint checks passed.\nPrivate backups and logs: %s\n' "$RAPS_STAGE"
  printf 'Future Auth recreations must retain the third Compose file: %s\n' "$RAPS_OVERRIDE"
fi
