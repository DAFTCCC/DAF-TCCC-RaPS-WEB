#!/usr/bin/env bash
# Download this helper from a reviewed immutable commit and verify its published
# SHA-256 before execution. --source-commit must name that same commit.
set -euo pipefail
umask 077
exec python3 - "$0" "$@" <<'PY'
import argparse
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request

PROJECT = Path('/home/nuc/supabase-project')
HOME = Path('/home/nuc')
REPOSITORY = 'https://raw.githubusercontent.com/DAFTCCC/DAF-TCCC-RaPS-WEB/'
HELPER = 'supabase/maintenance/deploy-web8-on-nuc.sh'
MIGRATIONS = ['20261018_managed_login.sql', '20261018_class_reporting_archives.sql']
HANDLERS = ['managed-login', 'admin-invite-user', 'admin-manage-user']
WORKER = 'supabase/maintenance/archive-selected-classes-on-nuc.py'
DB = ['sudo', '-n', 'docker', 'exec', '-i', '-u', 'postgres', 'supabase-db',
      'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    value = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def private_dir(path):
    if path.is_symlink():
        raise ValueError('Private directory may not be a symlink')
    path.mkdir(mode=0o700, exist_ok=True)
    info = path.stat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise ValueError('Private directory owner or permissions differ')
    sync_directory(path.parent)


def write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    sync_directory(path.parent)


def run(command, *, input=None, stage=None, output=None):
    # Raw database/Compose errors can contain row values or secrets. Keep all
    # diagnostics private instead of including subprocess exceptions on stdout.
    if output is not None:
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as destination:
            result = subprocess.run(command, input=input, stdout=destination, stderr=subprocess.PIPE, timeout=1800)
            destination.flush()
            os.fsync(destination.fileno())
        sync_directory(Path(output).parent)
    else:
        result = subprocess.run(command, input=input, capture_output=True, timeout=120)
    if result.returncode:
        if stage:
            write_private(stage / ('error-' + str(time.time_ns()) + '.txt'), result.stderr)
        raise RuntimeError('A command failed; inspect the private diagnostic file')
    return result.stdout if output is None else b''


def sql(query, stage):
    return run(DB, input=query.encode(), stage=stage).decode().strip()


def fetch(commit, relative):
    request = urllib.request.Request(REPOSITORY + commit + '/' + relative,
                                     headers={'User-Agent': 'RaPS-reviewed-web8-deployment'})
    with urllib.request.urlopen(request, timeout=60) as response:
        # Bound all release files, including the Python archive worker.
        data = response.read(4 * 1024 * 1024 + 1)
        if len(data) > 4 * 1024 * 1024:
            raise ValueError('Release file exceeds the deployment limit')
        return data


def fingerprint(kind):
    if kind == 'managed':
        functions = "(n.nspname='private' and (p.proname like 'raps_login_%' or p.proname in ('raps_ops_memberships','raps_account_is_enterprise_admin','raps_account_can_view_membership'))) or (n.nspname='public' and p.proname like 'raps_managed_%')"
        tables = "n.nspname='private' and (c.relname like 'raps_managed_%' or c.relname like 'raps_login_%')"
        policies = "p.polname='raps_managed_login_session'"
        triggers = "t.tgname='raps_login_session_write'"
    else:
        functions = "(n.nspname='private' and (p.proname like 'raps_reporting_archive_%' or p.proname in ('raps_complete_reporting_archive','raps_fail_reporting_archive'))) or (n.nspname='public' and p.proname in ('request_class_reporting_archive','cancel_class_reporting_archive'))"
        tables = "(n.nspname='public' and c.relname='class_reporting_archives') or (n.nspname='private' and c.relname='class_reporting_archive_audit')"
        policies = "c.relname='class_reporting_archives' and n.nspname='public'"
        triggers = "t.tgname like 'raps_reporting_archive_%'"
    # A digest of deployed code, ACLs, owners, table contracts, policies and
    # triggers. It deliberately contains no account or training rows.
    return """select encode(sha256(convert_to(jsonb_build_object(
      'functions',(select coalesce(jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl,r.rolname) order by n.nspname,p.oid::regprocedure::text),'[]') from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.prokind='f' and (%s)),
      'tables',(select coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl,r.rolname,
        (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
        (select jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
        (select jsonb_agg(pg_get_indexdef(i.indexrelid) order by ci.relname) from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=c.oid)) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where c.relkind='r' and (%s)),
      'policies',(select coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,p.polname,p.polpermissive,p.polcmd,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) order by n.nspname,c.relname,p.polname),'[]') from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where %s),
      'triggers',(select coalesce(jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname),'[]') from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (%s))
    )::text,'UTF8')),'hex')""" % (functions, tables, policies, triggers)


LEDGER = """
create table if not exists private.raps_web8_deployments (
  migration text primary key, source_sha256 text not null,
  catalog_sha256 text not null, applied_at timestamptz not null default clock_timestamp());
alter table private.raps_web8_deployments enable row level security;
revoke all on private.raps_web8_deployments from public,anon,authenticated,service_role;
"""


def migration_body(data):
    text = data.decode('utf-8')
    starts = list(re.finditer(r'(?mi)^begin;\s*$', text))
    ends = list(re.finditer(r'(?mi)^commit;\s*$', text))
    if len(starts) != 1 or len(ends) != 1 or text[ends[0].end():].strip() or starts[0].start() >= ends[0].start():
        raise ValueError('Migration transaction boundaries differ; review this helper')
    return text[:starts[0].start()] + text[starts[0].end():ends[0].start()]


def apply_migration(name, data, kind, stage):
    present = sql("begin read only; select to_regclass('private.raps_web8_deployments') is not null; commit;", stage)
    existing = None
    if present == 't':
        value = sql("begin read only; select row_to_json(d) from private.raps_web8_deployments d where migration=" + literal(name) + '; commit;', stage)
        if value:
            existing = json.loads(value)
    expected = sha(data)
    if existing:
        if existing['source_sha256'] != expected or sql('begin read only; ' + fingerprint(kind) + '; commit;', stage) != existing['catalog_sha256']:
            raise ValueError('Installed migration differs from its private deployment ledger; inspect before resuming')
        print(name + ': installed definitions MATCH; skipped')
        return
    # Migration preflight rejects existing untracked feature objects. Store its
    # ledger entry in the same transaction, including after a lost COMMIT reply.
    query = "begin; set local lock_timeout='10s'; select pg_advisory_xact_lock(hashtextextended('raps:web8-deploy',0));\n"
    query += LEDGER + migration_body(data)
    query += '\ninsert into private.raps_web8_deployments(migration,source_sha256,catalog_sha256) values ('
    query += literal(name) + ',' + literal(expected) + ',(' + fingerprint(kind) + '));\ncommit;'
    sql(query, stage)
    print(name + ': applied and recorded')


def inspect_functions(stage):
    value = json.loads(run(['sudo', '-n', 'docker', 'inspect', 'supabase-edge-functions'], stage=stage))[0]
    labels = value['Config']['Labels']
    expected = ','.join(str(PROJECT / name) for name in ['docker-compose.yml', 'docker-compose.isolation.yml'])
    if labels.get('com.docker.compose.project') != 'supabase' or labels.get('com.docker.compose.service') != 'functions' or labels.get('com.docker.compose.project.config_files') != expected:
        raise ValueError('Functions Compose identity differs; inspect before deploying')
    source = PROJECT / 'volumes/functions'
    if not any(m.get('Type') == 'bind' and m.get('Source') == str(source) and m.get('Destination') == '/home/deno/functions' for m in value['Mounts']):
        raise ValueError('Functions bind mount differs; inspect before deploying')
    if not value['State'].get('Running'):
        raise ValueError('Functions is not running before deployment')
    return value


def handler_hashes(stage):
    result = {}
    root = PROJECT / 'volumes/functions'
    if root.is_symlink():
        raise ValueError('Functions directory may not be a symlink')
    for name in HANDLERS:
        directory = root / name
        path = directory / 'index.ts'
        if directory.is_symlink() or path.is_symlink():
            raise ValueError('Handler path may not be a symlink')
        if path.exists():
            if not path.is_file():
                raise ValueError('Handler destination is not a regular file')
            result[name] = run(['sudo', '-n', 'sha256sum', str(path)], stage=stage).decode().split()[0]
        else:
            result[name] = None
    return result


def endpoint(path, body, expected_status, expected_code, stage):
    command = ['curl', '--disable', '--silent', '--show-error', '--noproxy', '*', '--resolve',
      'raps-supabase.asuscomm.com:443:127.0.0.1', '--connect-timeout', '5', '--max-time', '30',
      '--max-filesize', '65536', '--write-out', '\n%{http_code}',
      'https://raps-supabase.asuscomm.com/functions/v1/' + path]
    if body is not None:
        command += ['--header', 'Content-Type: application/json', '--data', json.dumps(body)]
    output = run(command, stage=stage).decode()
    payload, status = output.rsplit('\n', 1)
    result = json.loads(payload)
    if status != str(expected_status) or expected_code and result.get('code') != expected_code:
        raise ValueError('Endpoint readiness check failed for ' + path)
    if path == 'request-access' and (not isinstance(result.get('bases'), list) or not isinstance(result.get('majcoms'), list)):
        raise ValueError('Public catalog contract differs')
    print(path + ': readiness MATCH')


def main():
    parser = argparse.ArgumentParser(description='Deploy reviewed web.8 server files; never creates users or archives classes.')
    parser.add_argument('helper_path')
    parser.add_argument('--source-commit', required=True, help='reviewed immutable 40-character commit containing this exact helper')
    parser.add_argument('--resume-stage', help='private stage printed by a previous attempt for this same commit')
    args = parser.parse_args()
    os.umask(0o077)
    if not re.fullmatch('[0-9a-f]{40}', args.source_commit):
        parser.error('--source-commit must be a full lowercase immutable commit')
    if pwd.getpwuid(os.geteuid()).pw_name != 'nuc' or Path.home() != HOME:
        parser.error('Run as the nuc user, without sudo bash; the helper requests sudo only for Docker')
    # Verify release provenance before trusting downloaded SQL or installing files.
    if fetch(args.source_commit, HELPER) != Path(args.helper_path).read_bytes():
        raise ValueError('The running helper differs from the selected commit')
    stage = Path(args.resume_stage) if args.resume_stage else Path(tempfile.mkdtemp(prefix='raps-web8-', dir=HOME))
    if stage.parent != HOME or not re.fullmatch('raps-web8-[A-Za-z0-9_-]+', stage.name):
        raise ValueError('Resume stage must be the original direct /home/nuc/raps-web8-* directory')
    private_dir(stage)
    print('Private deployment stage: ' + str(stage), flush=True)
    try:
        marker = stage / 'source-commit.txt'
        if marker.exists():
            if marker.is_symlink() or marker.read_text().strip() != args.source_commit:
                raise ValueError('Resume stage belongs to a different release')
        else:
            if args.resume_stage:
                raise ValueError('Resume stage lacks its source commit; inspect instead of adopting it')
            write_private(marker, (args.source_commit + '\n').encode())
        run(['sudo', '-v'], stage=stage)
        before = inspect_functions(stage)
        for name in ['docker-compose.yml', 'docker-compose.isolation.yml', '.env']:
            if not (PROJECT / name).is_file() or (PROJECT / name).is_symlink():
                raise ValueError('Required current Compose file is missing or is a symlink')
        release = stage / 'release'
        private_dir(release)
        files = ['supabase/migrations/' + name for name in MIGRATIONS]
        files += ['supabase/functions/' + name + '/index.ts' for name in HANDLERS] + [WORKER]
        downloaded = {}
        for relative in files:
            data = fetch(args.source_commit, relative)
            target = release / relative.replace('/', '__')
            if target.exists():
                if target.is_symlink() or target.read_bytes() != data:
                    raise ValueError('Saved release differs; keep this stage and inspect')
            else:
                write_private(target, data)
            downloaded[relative] = data
        manifest = {name: sha(data) for name, data in downloaded.items()}
        manifest_path = stage / 'release-sha256.json'
        manifest_bytes = (json.dumps(manifest, sort_keys=True, indent=2) + '\n').encode()
        if manifest_path.exists():
            if manifest_path.is_symlink() or manifest_path.read_bytes() != manifest_bytes:
                raise ValueError('Saved release manifest differs')
        else:
            write_private(manifest_path, manifest_bytes)
        backed_up = stage / 'backups-complete.json'
        if not backed_up.exists():
            # Reject partial previous backups; they must never become a resume
            # point after database changes. No automatic restore is attempted.
            if any((stage / name).exists() for name in ['database-before.dump', 'functions-before.tar.gz', 'config-before.tar.gz']):
                raise ValueError('A partial backup exists; inspect it and start a new stage before any mutations')
            required = int(sql("begin read only; select pg_database_size(current_database()); commit;", stage))
            if shutil.disk_usage(stage).free < max(512 * 1024 * 1024, required * 2):
                raise ValueError('Insufficient private backup disk space; free space before deployment')
            write_private(stage / 'functions-inspect-before.json', json.dumps(before).encode())
            write_private(stage / 'handlers-before.json', json.dumps(handler_hashes(stage), sort_keys=True).encode())
            run(['sudo', '-n', 'docker', 'exec', '-u', 'postgres', 'supabase-db', 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'], stage=stage, output=stage / 'database-before.dump')
            run(['sudo', '-n', 'tar', '-C', str(PROJECT), '-czf', '-', 'volumes/functions'], stage=stage, output=stage / 'functions-before.tar.gz')
            run(['sudo', '-n', 'tar', '-C', str(PROJECT), '-czf', '-', 'docker-compose.yml', 'docker-compose.isolation.yml', '.env'], stage=stage, output=stage / 'config-before.tar.gz')
            backups = {name: file_sha(stage / name) for name in ['database-before.dump', 'functions-before.tar.gz', 'config-before.tar.gz']}
            write_private(backed_up, json.dumps(backups, sort_keys=True).encode())
        else:
            for name, checksum in json.loads(backed_up.read_text()).items():
                path = stage / name
                if path.is_symlink() or file_sha(path) != checksum:
                    raise ValueError('A private backup differs; inspect before resuming')
        saved_handlers = json.loads((stage / 'handlers-before.json').read_text())
        for name, current_hash in handler_hashes(stage).items():
            if current_hash not in (saved_handlers[name], manifest['supabase/functions/' + name + '/index.ts']):
                raise ValueError('A handler changed since this stage was backed up; inspect before overwriting it')
        for name, kind in zip(MIGRATIONS, ['managed', 'archive']):
            apply_migration(name, downloaded['supabase/migrations/' + name], kind, stage)
        for name in HANDLERS:
            destination = PROJECT / 'volumes/functions' / name
            run(['sudo', '-n', 'mkdir', '-p', str(destination)], stage=stage)
            source = release / ('supabase/functions/' + name + '/index.ts').replace('/', '__')
            run(['sudo', '-n', 'install', '-m', '0644', str(source), str(destination / 'index.ts')], stage=stage)
            actual = run(['sudo', '-n', 'sha256sum', str(destination / 'index.ts')], stage=stage).decode().split()[0]
            if actual != manifest['supabase/functions/' + name + '/index.ts']:
                raise ValueError('Installed handler checksum differs')
        tools = HOME / 'raps-tools'
        private_dir(tools)
        worker_dir = tools / ('web8-' + args.source_commit)
        private_dir(worker_dir)
        installed_worker = worker_dir / 'archive-selected-classes-on-nuc.py'
        if installed_worker.exists():
            if installed_worker.is_symlink() or installed_worker.read_bytes() != downloaded[WORKER]:
                raise ValueError('Pinned installed archive worker differs')
        else:
            write_private(installed_worker, downloaded[WORKER])
        # Restart the existing container: no Auth, DB, Caddy, networking, image,
        # environment or unrelated service configuration is recreated.
        run(['sudo', '-n', 'docker', 'compose', '-p', 'supabase', '-f', str(PROJECT / 'docker-compose.yml'),
             '-f', str(PROJECT / 'docker-compose.isolation.yml'), 'restart', '--no-deps', 'functions'], stage=stage)
        for _ in range(30):
            after = inspect_functions(stage)
            if after['Id'] != before['Id'] or after['Image'] != before['Image']:
                raise ValueError('Functions container or immutable image changed unexpectedly')
            health = after['State'].get('Health', {}).get('Status')
            if health in (None, 'healthy'):
                break
            time.sleep(2)
        else:
            raise ValueError('Functions health check did not become healthy')
        endpoint('request-access', None, 200, None, stage)
        endpoint('managed-login', {'action': 'status'}, 401, 'MANAGED_AUTH', stage)
        endpoint('admin-invite-user', {}, 401, 'INVITE_AUTH', stage)
        endpoint('admin-manage-user', {}, 401, 'ADMIN_AUTH', stage)
        print('Web.8 server deployment verified. No users were created and no classes were archived.')
        print('Read-only archive queue: python3 ' + str(installed_worker))
        print('Keep the private backups. Publish the matching frontend after this verification.')
    except Exception:
        print('Deployment stopped. Keep the private stage; do not restore or rerun migrations blindly.', file=sys.stderr)
        print('Resume only with this same reviewed helper, source commit and --resume-stage ' + str(stage), file=sys.stderr)
        raise


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Deliberately print only our generic diagnostics, never command output.
        print('Stopped: ' + (str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
PY
