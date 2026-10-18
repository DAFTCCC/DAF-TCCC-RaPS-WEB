"""Synthetic retention-worker tests. No NUC, Docker, or external network access."""
import contextlib
import csv
from decimal import Decimal
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest import mock

MODULE = Path(__file__).resolve().parents[1] / 'supabase/maintenance/archive-selected-classes-on-nuc.py'
spec = importlib.util.spec_from_file_location('raps_archive_worker', MODULE)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
CLASS_ID = '40000000-0000-0000-0000-000000000101'
REQUEST_ID = 'a0000000-0000-0000-0000-000000000101'


def envelope():
    snapshot = {name: {'columns': ['id', 'value'], 'rows': []} for name in worker.TABLES}
    snapshot['classes']['rows'] = [{'id': CLASS_ID, 'value': '=NOT_A_FORMULA(1)'}]
    snapshot['participants']['rows'] = [
        {'id': 'p1', 'value': None}, {'id': 'p2', 'value': ''},
        {'id': 'p3', 'value': 'Unicode 🩺, quoted "value"\nnew line'},
        {'id': 'p4', 'value': {'nested': [True, 0, -1.5, None]}},
    ]
    source = worker.compact(snapshot)
    return {'job': {'class_id': CLASS_ID, 'request_id': REQUEST_ID,
                    'requested_at': '2026-10-18T01:02:03+00:00', 'status': 'requested'},
            'source_text': source, 'source_sha256': worker.digest(source.encode())}


class ArchiveWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'retained'
        self.previous_umask = os.umask(0o077)
        self.addCleanup(os.umask, self.previous_umask)

    def exported(self):
        evidence = envelope()
        relative, manifest_hash, counts = worker.archive_export(self.root, evidence)
        return evidence, self.root / relative, manifest_hash, counts

    def test_export_is_lossless_private_and_hashed(self):
        evidence, folder, manifest_hash, counts = self.exported()
        self.assertEqual(folder.relative_to(self.root).as_posix(),
                         CLASS_ID + '/20261018T010203Z_' + REQUEST_ID)
        manifest = json.loads((folder / 'manifest.json').read_bytes())
        self.assertEqual(manifest_hash, hashlib.sha256((folder / 'manifest.json').read_bytes()).hexdigest())
        self.assertEqual(set(manifest['files']), {'source.json'} | {name + '.csv' for name in worker.TABLES})
        self.assertEqual(counts['classes'], 1)
        self.assertEqual(counts['participants'], 4)
        for table, original in json.loads(evidence['source_text']).items():
            with (folder / (table + '.csv')).open(newline='') as handle:
                rows = list(csv.reader(handle))
            self.assertEqual(rows[0], original['columns'])
            decoded = [{key: json.loads(value) if value else None for key, value in zip(rows[0], row)}
                       for row in rows[1:]]
            self.assertEqual(decoded, original['rows'])
        self.assertEqual(worker.csv_cell('=SUM(1,2)')[0], '"')
        for path in [self.root, self.root / CLASS_ID, folder]:
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700)
        for path in folder.iterdir():
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertEqual(worker.verify_archive(folder, evidence['source_text'], CLASS_ID, REQUEST_ID),
                         (manifest_hash, counts))

    def test_existing_archive_is_reverified_without_overwrite(self):
        evidence, folder, manifest_hash, counts = self.exported()
        before = {p.name: (p.stat().st_ino, p.stat().st_mtime_ns, p.read_bytes()) for p in folder.iterdir()}
        self.assertEqual(worker.archive_export(self.root, evidence),
                         (str(folder.relative_to(self.root)), manifest_hash, counts))
        self.assertEqual(before, {p.name: (p.stat().st_ino, p.stat().st_mtime_ns, p.read_bytes()) for p in folder.iterdir()})

    def test_postgres_numeric_precision_is_retained_as_json_numbers(self):
        evidence = envelope()
        snapshot = json.loads(evidence['source_text'])
        snapshot['participants']['rows'][0]['value'] = Decimal('0.123456789123456789123456789')
        snapshot['participants']['rows'][1]['value'] = {
            'large': Decimal('1.00000000000000000001E+100'),
            'small': [Decimal('-2.123456789123456789E-99')],
        }
        evidence['source_text'] = worker.compact(snapshot)
        evidence['source_sha256'] = worker.digest(evidence['source_text'].encode())
        relative, _, _ = worker.archive_export(self.root, evidence)
        with (self.root / relative / 'participants.csv').open(newline='') as handle:
            rows = list(csv.DictReader(handle))
        precise = json.loads(rows[0]['value'], parse_float=Decimal)
        nested = json.loads(rows[1]['value'], parse_float=Decimal)
        self.assertIsInstance(precise, Decimal)
        self.assertEqual(precise, snapshot['participants']['rows'][0]['value'])
        self.assertEqual(nested, snapshot['participants']['rows'][1]['value'])
        for invalid in (Decimal('NaN'), Decimal('Infinity'), float('inf')):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                worker.compact(invalid)

    def test_bad_existing_files_never_overwritten(self):
        evidence, folder, _, _ = self.exported()
        target = folder / 'participants.csv'
        target.write_bytes(b'preserve corrupt evidence')
        with self.assertRaisesRegex(ValueError, 'archive bytes differ'):
            worker.archive_export(self.root, evidence)
        self.assertEqual(target.read_bytes(), b'preserve corrupt evidence')

    def test_manifest_hash_count_identity_and_file_set_are_checked(self):
        cases = [lambda x: x['files']['classes.csv'].update(sha256='0' * 64),
                 lambda x: x['record_counts'].update(classes=2),
                 lambda x: x.update(request_id='a0000000-0000-0000-0000-000000000102'),
                 lambda x: x['files'].update({'unknown.csv': {'sha256': '0' * 64, 'size_bytes': 0}})]
        for change in cases:
            with self.subTest(change=change):
                evidence, folder, _, _ = self.exported()
                original = (folder / 'manifest.json').read_bytes()
                altered = json.loads(original)
                change(altered)
                (folder / 'manifest.json').write_text(worker.compact(altered))
                with self.assertRaises(ValueError):
                    worker.verify_archive(folder, evidence['source_text'], CLASS_ID, REQUEST_ID)
                (folder / 'manifest.json').write_bytes(original)

    def test_rejects_public_file_extra_entry_and_symlink(self):
        evidence, folder, _, _ = self.exported()
        target = folder / 'source.json'
        target.chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'permissions'):
            worker.verify_archive(folder, evidence['source_text'], CLASS_ID, REQUEST_ID)
        target.chmod(0o600)
        (folder / 'unexpected').write_bytes(b'')
        with self.assertRaisesRegex(ValueError, 'unexpected'):
            worker.verify_archive(folder, evidence['source_text'], CLASS_ID, REQUEST_ID)
        (folder / 'unexpected').unlink()
        original = target.read_bytes()
        target.unlink()
        other = self.root / 'outside'
        other.write_bytes(original)
        target.symlink_to(other)
        with self.assertRaises(OSError):
            worker.verify_archive(folder, evidence['source_text'], CLASS_ID, REQUEST_ID)

    def test_rejects_symlinked_root_and_insecure_directory(self):
        actual = Path(self.temp.name) / 'actual'
        actual.mkdir(mode=0o700)
        self.root.symlink_to(actual, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'symlink'):
            worker.archive_export(self.root, envelope())
        self.root.unlink()
        self.root.mkdir(mode=0o755)
        self.root.chmod(0o755)
        with self.assertRaisesRegex(ValueError, 'private'):
            worker.archive_export(self.root, envelope())

    def test_source_identity_and_contract_fail_before_creating_archive(self):
        invalid = []
        value = envelope(); value['source_sha256'] = '0' * 64; invalid.append(value)
        value = envelope(); value['job']['class_id'] = '40000000-0000-0000-0000-000000000102'; invalid.append(value)
        value = envelope(); value['job']['status'] = 'archived'; invalid.append(value)
        value = envelope(); value['job']['requested_at'] = '2026-10-18T01:02:03'; invalid.append(value)
        for change in [lambda x: x.pop('participants'),
                       lambda x: x['participants'].update(columns=['id', 'id']),
                       lambda x: x['participants']['rows'][0].update(unexpected=True)]:
            value = envelope(); snapshot = json.loads(value['source_text']); change(snapshot)
            value['source_text'] = worker.compact(snapshot)
            value['source_sha256'] = worker.digest(value['source_text'].encode()); invalid.append(value)
        for value in invalid:
            with self.subTest(value=value['job']):
                with self.assertRaises(ValueError):
                    worker.archive_export(self.root, value)
                self.assertFalse(self.root.exists())

    def test_durable_files_and_directories_precede_database_completion(self):
        evidence = envelope()
        ordering = []
        directories = []
        real_fsync = os.fsync
        real_sync_directory = worker.sync_directory
        def sync(fd):
            ordering.append('directory-fsync' if stat.S_ISDIR(os.fstat(fd).st_mode) else 'file-fsync')
            return real_fsync(fd)
        def sync_directory(path):
            real_sync_directory(path)
            directories.append(path)
        def database(sql):
            if sql.startswith('begin read only;'):
                return json.dumps(evidence)
            self.assertIn('raps_complete_reporting_archive', sql)
            self.assertEqual(ordering.count('file-fsync'), len(worker.TABLES) + 2)
            self.assertGreaterEqual(ordering.count('directory-fsync'), 3)
            folder = self.root / CLASS_ID / ('20261018T010203Z_' + REQUEST_ID)
            self.assertEqual(directories[-4:], [folder, self.root / CLASS_ID, self.root, self.root.parent])
            worker.verify_archive(folder, evidence['source_text'], CLASS_ID, REQUEST_ID)
            ordering.append('database-completion')
            return ''
        with mock.patch.object(worker, 'database', side_effect=database), mock.patch.object(os, 'fsync', side_effect=sync), mock.patch.object(worker, 'sync_directory', side_effect=sync_directory), contextlib.redirect_stdout(io.StringIO()):
            worker.run_class(self.root, CLASS_ID)
        self.assertEqual(ordering[-1], 'database-completion')

    def test_retry_after_rename_and_failed_fsync_repeats_full_durability_barrier(self):
        evidence = envelope()
        class_root = self.root / CLASS_ID
        folder = class_root / ('20261018T010203Z_' + REQUEST_ID)
        real_sync_directory = worker.sync_directory
        completions = []
        durable_directories = []
        retrying = False
        original_files = None
        def database(sql):
            if sql.startswith('begin read only;'):
                return json.dumps(evidence)
            if 'raps_fail_reporting_archive' in sql:
                evidence['job']['status'] = 'failed'
                return ''
            self.assertIn('raps_complete_reporting_archive', sql)
            self.assertTrue(retrying, 'Failed first attempt must not complete')
            self.assertEqual(durable_directories, [folder, class_root, self.root, self.root.parent])
            self.assertEqual(original_files, {p.name: (p.stat().st_ino, p.read_bytes()) for p in folder.iterdir()})
            completions.append(sql)
            return ''
        def interrupted_sync(path):
            if path == class_root and folder.is_dir():
                raise OSError('Synthetic directory fsync failure after successful rename')
            return real_sync_directory(path)
        with mock.patch.object(worker, 'database', side_effect=database), mock.patch.object(worker, 'sync_directory', side_effect=interrupted_sync):
            with self.assertRaisesRegex(OSError, 'after successful rename'):
                worker.run_class(self.root, CLASS_ID)
        self.assertEqual(completions, [])
        self.assertEqual(evidence['job']['status'], 'failed')
        self.assertTrue(folder.is_dir())
        self.assertFalse(any(path.name.startswith('.pending-') for path in class_root.iterdir()))
        original_files = {p.name: (p.stat().st_ino, p.read_bytes()) for p in folder.iterdir()}
        retrying = True
        def retry_sync(path):
            real_sync_directory(path)
            durable_directories.append(path)
        with mock.patch.object(worker, 'database', side_effect=database), mock.patch.object(worker, 'sync_directory', side_effect=retry_sync), mock.patch.object(worker, 'durable_write', side_effect=AssertionError('Retry must preserve existing files')), contextlib.redirect_stdout(io.StringIO()) as output:
            worker.run_class(self.root, CLASS_ID)
        self.assertEqual(len(completions), 1)
        self.assertIn('CSV files verified; excluded from reporting', output.getvalue())

    def test_write_or_fsync_failure_never_completes_database(self):
        for failure in ('write', 'fsync'):
            with self.subTest(failure=failure):
                root = self.root / failure
                self.root.mkdir(mode=0o700, exist_ok=True)
                db = mock.Mock(return_value=json.dumps(envelope()))
                target = mock.patch.object(worker, 'durable_write', side_effect=OSError('disk full')) if failure == 'write' else mock.patch.object(os, 'fsync', side_effect=OSError('disk unavailable'))
                with mock.patch.object(worker, 'database', db), target:
                    with self.assertRaises(OSError):
                        worker.run_class(root, CLASS_ID)
                self.assertEqual(db.call_count, 2)
                self.assertIn('raps_fail_reporting_archive', db.call_args.args[0])
                self.assertNotIn('raps_complete_reporting_archive', db.call_args.args[0])
                self.assertFalse(any(path.name.startswith('2026') for path in root.rglob('*')))

    def test_concurrent_worker_lock_denies_processing(self):
        import fcntl
        self.root.mkdir(mode=0o700)
        with (self.root / ('.lock-' + CLASS_ID)).open('a+') as held:
            fcntl.flock(held.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            with mock.patch.object(worker, 'database') as db:
                with self.assertRaises(BlockingIOError):
                    worker.run_class(self.root, CLASS_ID)
                db.assert_not_called()

    def test_already_completed_job_reverifies_original_retention_not_current_shared_rows(self):
        evidence, folder, manifest_hash, counts = self.exported()
        evidence['job'].update(status='archived', manifest_sha256=manifest_hash,
                               source_sha256=evidence['source_sha256'], record_counts=counts,
                               archive_relative_path=str(folder.relative_to(self.root)))
        changed = json.loads(evidence['source_text'])
        changed['participants']['rows'][0]['value'] = 'Current shared participant changed'
        evidence['source_text'] = worker.compact(changed)
        evidence['source_sha256'] = worker.digest(evidence['source_text'].encode())
        db = mock.Mock(return_value=json.dumps(evidence))
        with mock.patch.object(worker, 'database', db), mock.patch.object(worker, 'archive_export') as export, contextlib.redirect_stdout(io.StringIO()) as output:
            worker.run_class(self.root, CLASS_ID)
        self.assertEqual(db.call_count, 1)
        export.assert_not_called()
        self.assertIn('retained CSV files verified', output.getvalue())

    def test_completed_job_missing_or_corrupt_retention_fails_without_database_mutation(self):
        evidence, folder, manifest_hash, counts = self.exported()
        evidence['job'].update(status='archived', manifest_sha256=manifest_hash,
                               source_sha256=evidence['source_sha256'], record_counts=counts,
                               archive_relative_path=str(folder.relative_to(self.root)))
        (folder / 'participants.csv').unlink()
        db = mock.Mock(return_value=json.dumps(evidence))
        with mock.patch.object(worker, 'database', db):
            with self.assertRaises(FileNotFoundError):
                worker.run_class(self.root, CLASS_ID)
        self.assertEqual(db.call_count, 1)

    def test_finalize_failure_marks_only_original_request_with_safe_error_code(self):
        evidence = envelope()
        calls = []
        error = RuntimeError('database operation failed')
        error.private_detail = 'ERROR: Archive source changed\nSecret row information'
        def database(sql):
            calls.append(sql)
            if len(calls) == 1:
                return json.dumps(evidence)
            if 'raps_complete_reporting_archive' in sql:
                raise error
            self.assertIn('raps_fail_reporting_archive', sql)
            self.assertIn(REQUEST_ID, sql)
            self.assertIn("'source_changed'", sql)
            self.assertNotIn('Secret row information', sql)
            return ''
        with mock.patch.object(worker, 'database', side_effect=database):
            with self.assertRaises(RuntimeError) as result:
                worker.run_class(self.root, CLASS_ID)
        self.assertIs(result.exception, error)
        self.assertEqual(len(calls), 3)

    def test_default_lists_only_and_processing_requires_explicit_ids(self):
        db = mock.Mock(return_value='[]')
        with mock.patch('sys.argv', ['worker']), mock.patch.object(worker, 'require_nuc_context', return_value=Path(self.temp.name)), mock.patch.object(worker, 'database', db), mock.patch.object(worker, 'run_class') as run, contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(worker.main(), 0)
        run.assert_not_called()
        self.assertIn('begin read only;', db.call_args.args[0])
        invalid_arguments = [['--process-selected'], ['--class-id', CLASS_ID],
                             ['--process-selected', '--class-id', '../../bad'],
                             ['--process-selected'] + ['--class-id', CLASS_ID] * 26]
        for args in invalid_arguments:
            with self.subTest(args=args), mock.patch('sys.argv', ['worker'] + args), mock.patch.object(worker, 'require_nuc_context', return_value=Path(self.temp.name)), mock.patch.object(worker, 'database') as db, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as result:
                    worker.main()
                self.assertEqual(result.exception.code, 2)
                db.assert_not_called()

    def test_failure_is_logged_privately_without_console_row_values(self):
        error = RuntimeError('synthetic sensitive row value')
        error.private_detail = 'synthetic secret database output'
        argv = ['worker', '--process-selected', '--class-id', CLASS_ID, '--class-id', CLASS_ID]
        with mock.patch('sys.argv', argv), mock.patch.object(worker, 'require_nuc_context', return_value=Path(self.temp.name)), mock.patch.object(worker, 'run_class', side_effect=error) as run, contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(worker.main(), 1)
        self.assertEqual(run.call_count, 1)
        self.assertNotIn('sensitive', output.getvalue())
        self.assertNotIn('secret', output.getvalue())
        logs = list((Path(self.temp.name) / 'raps-training-archives').glob('failure-*'))
        self.assertEqual(len(logs), 1)
        self.assertEqual(stat.S_IMODE(logs[0].stat().st_mode), 0o600)
        self.assertIn('synthetic secret', logs[0].read_text())

    def test_nuc_context_uses_actual_os_identity_and_fixed_home(self):
        with mock.patch.object(worker.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_name='nuc')) as account, mock.patch.object(worker.os, 'geteuid', return_value=1001), mock.patch.object(Path, 'home', return_value=Path('/home/nuc')):
            self.assertEqual(worker.require_nuc_context(), Path('/home/nuc'))
        account.assert_called_once_with(1001)

    def test_root_or_wrong_home_stops_main_before_database_or_file_changes(self):
        for username, home in [('root', '/home/nuc'), ('nuc', '/root'), ('nuc', self.temp.name)]:
            with self.subTest(username=username, home=home), mock.patch('sys.argv', ['worker', '--process-selected', '--class-id', CLASS_ID]), mock.patch.object(worker.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_name=username)), mock.patch.object(Path, 'home', return_value=Path(home)), mock.patch.object(worker, 'database') as db, mock.patch.object(worker, 'run_class') as run, mock.patch.object(worker, 'private_directory') as directory, mock.patch.object(worker.os, 'umask') as umask:
                with self.assertRaisesRegex(RuntimeError, 'Run this worker as nuc'):
                    worker.main()
                db.assert_not_called()
                run.assert_not_called()
                directory.assert_not_called()
                umask.assert_not_called()


if __name__ == '__main__':
    unittest.main()
