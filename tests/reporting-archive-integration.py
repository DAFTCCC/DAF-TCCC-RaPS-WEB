"""Run the real worker against only the network-isolated synthetic PG fixture."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import re
import sys
import tempfile
import types
from unittest import mock

source = Path(__file__).resolve().parents[1] / 'supabase/maintenance/archive-selected-classes-on-nuc.py'
spec = importlib.util.spec_from_file_location('archive_integration_worker', source)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
container, dbname = sys.argv[1:]
if not container.startswith('raps-reporting-archive-test-') or dbname not in ('reporting_enum', 'reporting_text'):
    raise SystemExit('Only isolated synthetic reporting fixtures are supported')
worker.COMMAND = ['docker', 'exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres',
                  '-d', dbname, '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off']
real_database = worker.database
class_id = '40000000-0000-0000-0000-000000000105'


def request(selected):
    real_database("begin; set local role authenticated; select set_config('request.jwt.claim.sub',"
                  "'00000000-0000-0000-0000-000000000001',true); "
                  "select public.request_class_reporting_archive('" + selected + "','Synthetic end-to-end retention'); commit;")


def job(selected):
    return json.loads(real_database("begin read only; select to_jsonb(a) from public.class_reporting_archives a "
                                    "where class_id='" + selected + "'; commit;"))


def contents(folder):
    return {p.name: (p.stat().st_ino, p.read_bytes()) for p in folder.iterdir()}


with tempfile.TemporaryDirectory() as directory:
    root = Path(directory) / 'archives'
    try:
        worker.run_class(root, class_id)
    except ValueError as error:
        assert str(error) == 'selected class has no archive request'
    else:
        raise AssertionError('An explicit class without a request was processed')
    request(class_id)
    original = job(class_id)

    # Another class may legitimately update a shared participant after the export
    # snapshot. The independent SQL proof must fail without hiding this class.
    def changed_source_database(sql):
        if 'raps_complete_reporting_archive' in sql:
            real_database("update public.participants set display_name='Shared row changed before completion' "
                          "where id='70000000-0000-0000-0000-000000000001'")
        return real_database(sql)
    with mock.patch.object(worker, 'database', side_effect=changed_source_database):
        try:
            worker.run_class(root, class_id)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Changed source was accepted')
    failed = job(class_id)
    assert failed['status'] == 'failed' and failed['worker_error'] == 'source_changed'
    old_folder, = [p for p in (root / class_id).iterdir() if not p.name.startswith('.')]
    old_contents = contents(old_folder)
    assert original['request_id'] in old_folder.name
    request(class_id)
    retry = job(class_id)
    assert retry['request_id'] != original['request_id'] and retry['status'] == 'requested'
    with contextlib.redirect_stdout(io.StringIO()) as console:
        worker.run_class(root, class_id)
    assert 'CSV files verified; excluded from reporting' in console.getvalue()
    proof = job(class_id)
    assert proof['status'] == 'archived'
    assert contents(old_folder) == old_contents
    folder = root / proof['archive_relative_path']
    assert folder != old_folder
    source_text = (folder / 'source.json').read_text()
    manifest_hash, counts = worker.verify_archive(folder, source_text, class_id, proof['request_id'])
    assert manifest_hash == proof['manifest_sha256']
    assert counts == proof['record_counts']
    assert worker.digest(source_text.encode()) == proof['source_sha256']
    snapshot = json.loads(source_text)
    assert snapshot['classes']['rows'][0]['name'] == 'Unrelated work remains editable'
    assert snapshot['participants']['rows'][0]['display_name'] == 'Shared row changed before completion'
    assert len(snapshot['evaluations']['rows']) == 1
    assert len(snapshot['criterion_results']['rows']) == 1
    assert len(snapshot['timer_results']['rows']) == 1
    before = contents(folder)
    real_database("update public.participants set display_name='Shared row changed after retention' "
                  "where id='70000000-0000-0000-0000-000000000001'")
    with contextlib.redirect_stdout(io.StringIO()) as console:
        worker.run_class(root, class_id)
    assert 'retained CSV files verified' in console.getvalue()
    assert before == contents(folder)
    assert real_database("select count(*) from private.class_reporting_archive_audit where class_id='"
                         + class_id + "' and action='archived'") == '1'

    # A COMMIT may succeed even when its acknowledgement is lost. The subsequent
    # failure call must preserve the archived proof and its immutable files.
    ack_class = '40000000-0000-0000-0000-000000000106'
    def lost_ack_database(sql):
        result = real_database(sql)
        if 'raps_complete_reporting_archive' in sql:
            raise RuntimeError('Synthetic commit acknowledgement lost')
        return result
    with mock.patch.object(worker, 'database', side_effect=lost_ack_database):
        try:
            worker.run_class(root, ack_class)
        except RuntimeError:
            pass
        else:
            raise AssertionError('Lost acknowledgement was not simulated')
    ack_proof = job(ack_class)
    assert ack_proof['status'] == 'archived' and ack_proof['worker_error'] is None
    assert real_database("select count(*) from private.class_reporting_archive_audit where class_id='"
                         + ack_class + "' and action='failed'") == '0'
    with contextlib.redirect_stdout(io.StringIO()) as console:
        worker.run_class(root, ack_class)
    assert 'retained CSV files verified' in console.getvalue()

    # Retention loss must be reported on later checks, never silently recreated
    # from changed shared records or represented as successful verification.
    (folder / 'participants.csv').unlink()
    try:
        worker.run_class(root, class_id)
    except FileNotFoundError:
        pass
    else:
        raise AssertionError('Missing retained file was accepted')
    assert job(class_id)['status'] == 'archived'
    assert not (folder / 'participants.csv').exists()
print('Real worker integration: source-change failure/retry retains old CSV, committed proofs match new CSV, lost commit acknowledgement is fenced, missing files fail closed.')

# Execute the actual rollout helper's catalog queries against real PostgreSQL,
# including both migrations. No account/training rows enter those digests.
deploy_file = source.with_name('deploy-web8-on-nuc.sh')
deploy_source = deploy_file.read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
deploy = types.ModuleType('reporting_deploy_fingerprint')
exec(compile(deploy_source, str(deploy_file), 'exec'), deploy.__dict__)
for kind in ('archive', 'managed'):
    fingerprint = real_database('begin read only; ' + deploy.fingerprint(kind) + '; commit;')
    assert re.fullmatch('[0-9a-f]{64}', fingerprint), 'Invalid actual PostgreSQL catalog digest'
    assert fingerprint == real_database(deploy.fingerprint(kind)), 'Unchanged catalog digest differs'
print('Real PostgreSQL catalog queries: archive and managed deployment fingerprints return stable SHA-256 digests.')
