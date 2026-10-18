"""Run with python3 -m unittest discover -s tests -p test_web8_deployer.py."""
import hashlib
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'supabase/maintenance/deploy-web8-on-nuc.sh'
SOURCE = SCRIPT.read_text().split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]
DEPLOY = types.ModuleType('web8_deployer')
exec(compile(SOURCE, str(SCRIPT), 'exec'), DEPLOY.__dict__)


class Web8DeploymentTests(unittest.TestCase):
    def test_real_migrations_keep_one_outer_transaction(self):
        for name in DEPLOY.MIGRATIONS:
            data = (ROOT / 'supabase/migrations' / name).read_bytes()
            body = DEPLOY.migration_body(data)
            self.assertNotIn('\ncommit;', body.lower())
            self.assertIn('create function', body.lower())

    def test_unexpected_migration_boundary_stops_before_execution(self):
        for data in (b'create table x(a int);', b'begin;\ncommit;\nselect 1;', b'begin;\nbegin;\ncommit;'):
            with self.subTest(data=data), self.assertRaises(ValueError):
                DEPLOY.migration_body(data)

    def test_migration_and_ledger_commit_together(self):
        calls = []
        def database(query, _stage):
            calls.append(query)
            return 'f' if len(calls) == 1 else ''
        with patch.object(DEPLOY, 'sql', side_effect=database):
            DEPLOY.apply_migration('example.sql', b'begin;\ncreate function example();\ncommit;\n', 'managed', Path('/private'))
        query = calls[-1]
        self.assertEqual(query.lower().count('\ncommit;'), 1)
        self.assertLess(query.index('create function example'), query.index('insert into private.raps_web8_deployments'))
        self.assertIn(hashlib.sha256(b'begin;\ncreate function example();\ncommit;\n').hexdigest(), query)
        self.assertIn('pg_advisory_xact_lock', query)

    def test_resume_skips_only_when_source_and_catalog_both_match(self):
        source = b'begin;\ncommit;\n'
        ledger = {'source_sha256': DEPLOY.sha(source), 'catalog_sha256': 'catalog'}
        with patch.object(DEPLOY, 'sql', side_effect=['t', json.dumps(ledger), 'catalog']) as database:
            DEPLOY.apply_migration('example.sql', source, 'managed', Path('/private'))
        self.assertEqual(database.call_count, 3)
        self.assertTrue(all('insert into private.raps_web8_deployments' not in c.args[0] for c in database.call_args_list))

    def test_resume_refuses_source_drift(self):
        ledger = {'source_sha256': 'different', 'catalog_sha256': 'catalog'}
        with patch.object(DEPLOY, 'sql', side_effect=['t', json.dumps(ledger)]), self.assertRaises(ValueError):
            DEPLOY.apply_migration('example.sql', b'begin;\ncommit;\n', 'managed', Path('/private'))

    def test_resume_refuses_installed_definition_drift(self):
        source = b'begin;\ncommit;\n'
        ledger = {'source_sha256': DEPLOY.sha(source), 'catalog_sha256': 'catalog'}
        with patch.object(DEPLOY, 'sql', side_effect=['t', json.dumps(ledger), 'changed']), self.assertRaises(ValueError):
            DEPLOY.apply_migration('example.sql', source, 'archive', Path('/private'))

    def test_fingerprint_covers_existing_helpers_and_both_archive_recovery_actions(self):
        self.assertIn('raps_ops_memberships', DEPLOY.fingerprint('managed'))
        for item in ['cancel_class_reporting_archive', 'raps_fail_reporting_archive', 'raps_reporting_archive_%', 'p.proacl', 't.tgenabled', 'pg_get_constraintdef']:
            self.assertIn(item, DEPLOY.fingerprint('archive'))

    def test_private_stage_and_writes_refuse_symlinks_or_overwrites(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            private = root / 'private'
            DEPLOY.private_dir(private)
            self.assertEqual(private.stat().st_mode & 0o777, 0o700)
            target = private / 'secret'
            DEPLOY.write_private(target, b'private')
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            with self.assertRaises(FileExistsError):
                DEPLOY.write_private(target, b'replace')
            link = root / 'link'
            link.symlink_to(private)
            with self.assertRaises(ValueError):
                DEPLOY.private_dir(link)

    def test_command_failure_never_prints_sensitive_stderr(self):
        result = types.SimpleNamespace(returncode=1, stderr=b'secret row or key', stdout=b'')
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(DEPLOY.subprocess, 'run', return_value=result), self.assertRaisesRegex(RuntimeError, 'private diagnostic') as caught:
                DEPLOY.run(['example'], stage=Path(temporary))
            self.assertNotIn('secret', str(caught.exception))
            logs = list(Path(temporary).glob('error-*.txt'))
            self.assertEqual(logs[0].read_bytes(), result.stderr)
            self.assertEqual(logs[0].stat().st_mode & 0o777, 0o600)

    def test_an_unauthenticated_success_response_does_not_pass(self):
        for response in [b'{"code":"MANAGED_AUTH"}\n200', b'{"code":"OTHER"}\n401']:
            with patch.object(DEPLOY, 'run', return_value=response), self.assertRaises(ValueError):
                DEPLOY.endpoint('managed-login', {'action': 'status'}, 401, 'MANAGED_AUTH', None)

    def test_no_live_accounts_or_class_actions_are_in_readiness_checks(self):
        for forbidden in ["'action': 'create_user'", "'action': 'reset_password'", "'--process-selected'", 'request_class_reporting_archive(']:
            self.assertNotIn(forbidden, SOURCE)
        self.assertIn("'restart', '--no-deps', 'functions'", SOURCE)
        self.assertNotIn("'up'", SOURCE)

    def test_source_mismatch_stops_before_sudo_backups_or_migrations(self):
        argv = ['deployer', str(SCRIPT), '--source-commit', 'a' * 40]
        with patch.object(DEPLOY.sys, 'argv', argv), \
             patch.object(DEPLOY.pwd, 'getpwuid', return_value=types.SimpleNamespace(pw_name='nuc')), \
             patch.object(DEPLOY.Path, 'home', return_value=DEPLOY.HOME), \
             patch.object(DEPLOY, 'fetch', return_value=b'different helper'), \
             patch.object(DEPLOY, 'run') as command, self.assertRaisesRegex(ValueError, 'differs'):
            DEPLOY.main()
        command.assert_not_called()

    def test_functions_inspection_refuses_service_or_mount_retargeting(self):
        config_files = ','.join(str(DEPLOY.PROJECT / name) for name in ['docker-compose.yml', 'docker-compose.isolation.yml'])
        valid = {'Config': {'Labels': {'com.docker.compose.project': 'supabase',
                 'com.docker.compose.service': 'functions', 'com.docker.compose.project.config_files': config_files}},
                 'Mounts': [{'Type': 'bind', 'Source': str(DEPLOY.PROJECT / 'volumes/functions'),
                             'Destination': '/home/deno/functions'}], 'State': {'Running': True}}
        with patch.object(DEPLOY, 'run', return_value=json.dumps([valid]).encode()):
            self.assertEqual(DEPLOY.inspect_functions(None), valid)
        for field, value in [('com.docker.compose.project', 'other'),
                             ('com.docker.compose.service', 'auth'),
                             ('com.docker.compose.project.config_files', config_files + ',old-caddy.yml')]:
            modified = json.loads(json.dumps(valid))
            modified['Config']['Labels'][field] = value
            with patch.object(DEPLOY, 'run', return_value=json.dumps([modified]).encode()), self.assertRaises(ValueError):
                DEPLOY.inspect_functions(None)
        valid['Mounts'][0]['Source'] = '/some/other/functions'
        with patch.object(DEPLOY, 'run', return_value=json.dumps([valid]).encode()), self.assertRaises(ValueError):
            DEPLOY.inspect_functions(None)


if __name__ == '__main__':
    unittest.main()
