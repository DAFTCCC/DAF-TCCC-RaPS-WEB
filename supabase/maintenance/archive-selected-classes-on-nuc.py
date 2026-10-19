#!/usr/bin/env python3
"""Retain explicitly requested classes as verified private CSV/JSON on the NUC.

Default action lists queued class IDs. Actual work requires --class-id UUID for
each chosen class and --process-selected. No server row or CSV is ever deleted.
"""
import argparse
import csv
import datetime as dt
from decimal import Decimal
import hashlib
import io
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
import tempfile
import uuid


TABLES = {
    'classes', 'evaluation_events', 'evaluations', 'participants',
    'class_evaluators', 'event_evaluators', 'criterion_results', 'timer_results',
    'curriculum_versions', 'criteria', 'bases', 'majcoms',
}
COMMAND = ['sudo', '-n', 'docker', 'exec', '-i', '-u', 'postgres',
           'supabase-db', 'psql', '-X', '-qAt', '-U', 'postgres', '-d',
           'postgres', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off']


def require_nuc_context():
    home = Path('/home/nuc')
    if pwd.getpwuid(os.geteuid()).pw_name != 'nuc' or Path.home() != home:
        raise RuntimeError('Run this worker as nuc with HOME=/home/nuc, without sudo')
    return home


def compact(value):
    # PostgreSQL numeric values may exceed binary floating-point precision. Keep
    # them JSON numbers in CSV cells, including inside nested app_data values.
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError('archive numbers must be finite')
        return str(value)
    if isinstance(value, dict):
        return '{' + ','.join(compact(key) + ':' + compact(value[key])
                              for key in sorted(value)) + '}'
    if isinstance(value, list):
        return '[' + ','.join(compact(item) for item in value) + ']'
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def database(sql):
    # Capture even failures privately; PostgreSQL errors may contain row values.
    result = subprocess.run(COMMAND, input=sql, text=True, capture_output=True,
                            timeout=120, check=False)
    if result.returncode:
        error = RuntimeError('database operation failed')
        error.private_detail = result.stderr
        raise error
    return result.stdout.strip()


def sql_string(value):
    return "'" + str(value).replace("'", "''") + "'"


def csv_cell(value):
    if value is None:
        return ''
    # JSON encodes every non-null value losslessly in the CSV cell. Strings are
    # JSON quoted as well, so spreadsheet formulas never start with =,+,-,@.
    # The manifest documents this convention; json.loads(cell) reverses it.
    return compact(value)


def csv_bytes(table):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(table['columns'])
    for row in table['rows']:
        writer.writerow([csv_cell(row.get(column)) for column in table['columns']])
    return stream.getvalue().encode('utf-8')


def validate_snapshot(snapshot, class_id):
    if not isinstance(snapshot, dict) or set(snapshot) != TABLES:
        raise ValueError('unsupported archive table set')
    for table in snapshot.values():
        if (not isinstance(table, dict) or set(table) != {'columns', 'rows'}
                or not isinstance(table['columns'], list) or not table['columns']
                or any(not isinstance(v, str) for v in table['columns'])
                or len(set(table['columns'])) != len(table['columns'])
                or not isinstance(table['rows'], list)
                or any(not isinstance(row, dict) or set(row) != set(table['columns'])
                       for row in table['rows'])):
            raise ValueError('unsupported archive row contract')
    classes = snapshot['classes']['rows']
    if len(classes) != 1 or classes[0].get('id') != class_id:
        raise ValueError('archive class identity differs')


def private_directory(path):
    if path.is_symlink():
        raise ValueError('archive directory is a symlink')
    try:
        path.mkdir(mode=0o700)
    except FileExistsError:
        pass
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid()
            or stat.S_IMODE(info.st_mode) & 0o077):
        raise ValueError('archive directory must be private and owned by this user')


def durable_write(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def read_private(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as source:
        info = os.fstat(source.fileno())
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid()
                or stat.S_IMODE(info.st_mode) & 0o077):
            raise ValueError('archive file permissions differ')
        return source.read()


def verify_archive(directory, source_text, class_id, request_id):
    snapshot = json.loads(source_text, parse_float=Decimal)
    validate_snapshot(snapshot, class_id)
    manifest_bytes = read_private(directory / 'manifest.json')
    manifest = json.loads(manifest_bytes)
    if (manifest.get('format') != 'raps-selected-class-archive-v1'
            or manifest.get('class_id') != class_id
            or manifest.get('request_id') != request_id
            or manifest.get('source_sha256') != digest(source_text.encode('utf-8'))
            or manifest.get('csv_encoding') != 'UTF-8; header is column name; non-null cells are JSON values; empty cell is SQL NULL'):
        raise ValueError('archive manifest differs')
    expected = {'source.json': source_text.encode('utf-8')}
    expected.update({name + '.csv': csv_bytes(table) for name, table in snapshot.items()})
    if set(manifest.get('files', {})) != set(expected):
        raise ValueError('archive file list differs')
    for name, data in expected.items():
        if read_private(directory / name) != data:
            raise ValueError('archive bytes differ')
        if manifest['files'][name] != {'sha256': digest(data), 'size_bytes': len(data)}:
            raise ValueError('archive checksum differs')
    counts = {name: len(table['rows']) for name, table in snapshot.items()}
    if manifest.get('record_counts') != counts:
        raise ValueError('archive counts differ')
    # Reject unexpected files/symlinks instead of accidentally trusting them.
    if {entry.name for entry in directory.iterdir()} != set(expected) | {'manifest.json'}:
        raise ValueError('unexpected archive entries')
    return digest(manifest_bytes), counts


def archive_export(root, envelope):
    job, source_text = envelope['job'], envelope['source_text']
    class_id = str(uuid.UUID(job['class_id']))
    request_id = str(uuid.UUID(job['request_id']))
    if job['status'] not in ('requested', 'failed'):
        raise ValueError('request is not queued')
    if digest(source_text.encode('utf-8')) != envelope['source_sha256']:
        raise ValueError('source checksum differs')
    snapshot = json.loads(source_text, parse_float=Decimal)
    validate_snapshot(snapshot, class_id)
    requested_at = dt.datetime.fromisoformat(job['requested_at'].replace('Z', '+00:00'))
    if requested_at.tzinfo is None:
        raise ValueError('request timestamp must include timezone')
    folder = requested_at.astimezone(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '_' + request_id
    private_directory(root)
    class_root = root / class_id
    private_directory(class_root)
    final = class_root / folder
    if not os.path.lexists(final):
        temporary = Path(tempfile.mkdtemp(prefix='.pending-', dir=class_root))
        files = {'source.json': source_text.encode('utf-8')}
        files.update({name + '.csv': csv_bytes(table) for name, table in snapshot.items()})
        for name, data in files.items():
            durable_write(temporary / name, data)
        manifest = {
            'format': 'raps-selected-class-archive-v1', 'class_id': class_id,
            'request_id': request_id, 'requested_at': job['requested_at'],
            'source_sha256': envelope['source_sha256'],
            'csv_encoding': 'UTF-8; header is column name; non-null cells are JSON values; empty cell is SQL NULL',
            'record_counts': {name: len(table['rows']) for name, table in snapshot.items()},
            'files': {name: {'sha256': digest(data), 'size_bytes': len(data)}
                      for name, data in files.items()},
        }
        durable_write(temporary / 'manifest.json', (compact(manifest) + '\n').encode('utf-8'))
        sync_directory(temporary)
        verify_archive(temporary, source_text, class_id, request_id)
        # The worker's exclusive per-class filesystem lock prevents a competing
        # worker from replacing this destination. Never overwrite existing work.
        if os.path.lexists(final):
            raise ValueError('archive destination appeared concurrently')
        os.rename(temporary, final)
        sync_directory(class_root)
        sync_directory(root)
    private_directory(final)
    manifest_hash, counts = verify_archive(final, source_text, class_id, request_id)
    # Repeat the durability barrier even for an existing destination: a previous
    # attempt may have renamed it successfully and then failed a directory fsync.
    # Synchronize the home directory too, which persists a newly created root.
    for directory in (final, class_root, root, root.parent):
        sync_directory(directory)
    return str(final.relative_to(root)), manifest_hash, counts


def run_class(root, class_id):
    import fcntl
    private_directory(root)
    lock_path = root / ('.lock-' + class_id)
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'a+') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        envelope_text = database("begin read only; select jsonb_build_object('job',to_jsonb(a),"
            "'source_text',s.value::text,'source_sha256',encode(sha256(convert_to(s.value::text,'UTF8')),'hex')) "
            "from public.class_reporting_archives a cross join lateral "
            "(select private.raps_reporting_archive_snapshot(a.class_id) value) s "
            "where a.class_id=" + sql_string(class_id) + "::uuid; commit;")
        if not envelope_text:
            raise ValueError('selected class has no archive request')
        envelope = json.loads(envelope_text)
        if envelope['job']['status'] == 'archived':
            # Shared participant records may legitimately have changed since
            # retention. Verify the saved snapshot against its committed proof.
            job = envelope['job']
            requested = dt.datetime.fromisoformat(job['requested_at'].replace('Z', '+00:00'))
            expected = class_id + '/' + requested.astimezone(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '_' + str(uuid.UUID(job['request_id']))
            if job.get('archive_relative_path') != expected:
                raise ValueError('committed archive path differs')
            private_directory(root / class_id)
            folder = root / expected
            private_directory(folder)
            saved = read_private(folder / 'source.json').decode('utf-8')
            manifest_hash, counts = verify_archive(folder, saved, class_id, job['request_id'])
            if (digest(saved.encode('utf-8')) != job.get('source_sha256')
                    or manifest_hash != job.get('manifest_sha256')
                    or counts != job.get('record_counts')):
                raise ValueError('committed archive proof differs')
            print(class_id + ': retained CSV files verified; already excluded from reporting')
            return
        job = envelope['job']
        phase = 'export_failed'
        try:
            relative, manifest_hash, counts = archive_export(root, envelope)
            # Bytes are reopened and checked again before the only reporting-state
            # mutation. The SQL function independently checks source and row counts.
            verify_archive(root / relative, envelope['source_text'], class_id, job['request_id'])
            phase = 'finalize_failed'
            database('begin; set local lock_timeout=\'10s\'; select private.raps_complete_reporting_archive('
                     + ','.join(sql_string(v) for v in [class_id, job['request_id'], envelope['source_sha256'],
                       manifest_hash, relative]) + ',' + sql_string(compact(counts)) + '::jsonb); commit;')
        except Exception as error:
            if 'Archive source changed' in getattr(error, 'private_detail', ''):
                phase = 'source_changed'
            try:
                # A lost COMMIT acknowledgement must never downgrade a completed
                # request. SQL fences this by generation and unfinished status.
                database('begin; set local lock_timeout=\'10s\'; select private.raps_fail_reporting_archive('
                         + ','.join(sql_string(v) for v in [class_id, job['request_id'], phase]) + '); commit;')
            except Exception:
                pass  # Original exception remains available in the private log.
            raise
        print(class_id + ': CSV files verified; excluded from reporting')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--class-id', action='append', default=[], help='explicit queued class UUID; repeat to select more')
    parser.add_argument('--process-selected', action='store_true', help='write verified private CSV and complete only selected requests')
    args = parser.parse_args()
    home = require_nuc_context()
    os.umask(0o077)
    root = home / 'raps-training-archives'
    if not args.process_selected:
        if args.class_id:
            parser.error('--class-id requires --process-selected')
        queued = database("begin read only; select coalesce(jsonb_agg(jsonb_build_object('class_id',class_id,"
            "'status',status,'requested_at',requested_at) order by requested_at),'[]'::jsonb) "
            "from public.class_reporting_archives where status in ('requested','failed'); commit;")
        print(queued)
        print('No changes. Select class IDs explicitly with --process-selected --class-id UUID.')
        return 0
    if not args.class_id or len(args.class_id) > 25:
        parser.error('select between 1 and 25 class IDs explicitly')
    try:
        selected = list(dict.fromkeys(str(uuid.UUID(value)) for value in args.class_id))
    except ValueError:
        parser.error('each class ID must be a UUID')
    failed = False
    for class_id in selected:
        try:
            run_class(root, class_id)
        except Exception as error:
            failed = True
            private_directory(root)
            log = root / ('failure-' + class_id + '-' + uuid.uuid4().hex + '.txt')
            durable_write(log, (type(error).__name__ + ': ' + str(error) + '\n'
                                + getattr(error, 'private_detail', '')).encode('utf-8'))
            # No row values or filenames with student data leave the NUC.
            print(class_id + ': completion not confirmed; check request status and private worker log')
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('Worker stopped; no archive completion was confirmed. Keep private evidence on the NUC.', file=sys.stderr)
        sys.exit(1)
