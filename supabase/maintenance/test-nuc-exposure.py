#!/usr/bin/env python3
"""Exercise the read-only collector with synthetic evidence; never invokes host tools.

Run: python3 supabase/maintenance/test-nuc-exposure.py
"""
import ast
import contextlib
import io
import ipaddress
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest


SOURCE = Path(__file__).with_name('inspect-nuc-exposure.sh')
SECRET = 'PRIVATE_CREDENTIAL_DO_NOT_PRINT'
HOST = 'raps-supabase.asuscomm.com'
ID = 'a' * 64
SECOND_ID = 'b' * 64


def embedded_python():
    shell = SOURCE.read_text()
    return shell.split("<<'PY'\n", 1)[1].rsplit('\nPY', 1)[0]


def container_fixture():
    return {
        'name': '/supabase-auth', 'state': 'running', 'image': 'supabase/gotrue:v2',
        'network_mode': 'supabase_default', 'project': 'supabase', 'privileged': False,
        'ports': {'9999/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '9999'}]},
        'requested_ports': {'9999/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '9999'}]},
        'mounts': [],
    }


class SyntheticHost:
    """Strict fake process boundary: unrecognized or mutating commands fail the test."""
    def __init__(self, stage):
        self.stage = stage
        self.calls = []
        self.violations = []
        self.containers = [container_fixture()]
        self.fail = set()
        self.timeouts = set()
        self.routes = {}
        self.available = True
        self.partial_routes = set()

    def run(self, argv, **kwargs):
        self.calls.append((argv, kwargs))
        try:
            return self._run(argv, kwargs)
        except AssertionError as error:
            self.violations.append(str(error))
            raise

    def _run(self, argv, kwargs):
        assert kwargs['stdin'] == subprocess.DEVNULL, 'A command can read interactive input'
        assert kwargs['stdout'] == subprocess.PIPE and kwargs['stderr'] == subprocess.PIPE
        assert 0 < kwargs['timeout'] <= 25, 'Missing/broad timeout'
        assert kwargs['env']['LC_ALL'] == 'C'
        privileged = argv[:2] == ['sudo', '-n']
        args = argv[2:] if privileged else argv
        tool = Path(args[0]).name
        output = ''
        if tool == 'ss':
            assert privileged and args[1:3] == ['-H', '-lntup']
            assert args[3:] in (['-4'], ['-6'])
            output = ('tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=12,fd=3))\n'
                      'udp UNCONN 0 0 127.0.0.1:53 0.0.0.0:* users:(("resolver",pid=13,fd=4))\n'
                      if args[-1] == '-4' else
                      'tcp LISTEN 0 128 [::]:443 [::]:* users:(("caddy",pid=14,fd=5))\n')
        elif tool == 'docker':
            assert privileged and args[1:3] == ['--host', 'unix:///var/run/docker.sock']
            if args[3:] == ['ps', '-q', '--no-trunc']:
                output = '\n'.join((ID, SECOND_ID)[:len(self.containers)]) + '\n'
            else:
                assert args[3:5] == ['inspect', '--format']
                fmt = args[5]
                assert '.Config.Env' not in fmt and '{{json .Config}}' not in fmt
                assert args[6:] == [ID, SECOND_ID][:len(self.containers)]
                output = '\n'.join(json.dumps(c) for c in self.containers)
        elif tool == 'ufw':
            assert privileged and args[1:] == ['status', 'verbose']
            output = 'Status: active\nDefault: deny (incoming), allow (outgoing), deny (routed)\n22/tcp ALLOW IN 192.168.50.0/24 # ' + SECRET + '\n'
        elif tool in ('iptables-save', 'ip6tables-save'):
            assert privileged and len(args) == 1
            output = ('*filter\n:INPUT DROP [0:0]\n:FORWARD DROP [0:0]\n:DOCKER-USER - [0:0]\n'
                      '-A INPUT ! -s 192.168.50.0/24 -p tcp --dport 22 -j DROP\n'
                      '-A DOCKER-USER -s 192.168.50.0/24 -p tcp --dport 9999 -m comment --comment "' + SECRET + '" -j ACCEPT\nCOMMIT\n')
        elif tool == 'nft':
            assert privileged and args[1:] == ['--json', 'list', 'ruleset']
            output = json.dumps({'nftables': [{'chain': {'family': 'inet', 'table': 'filter',
                'name': 'input', 'hook': 'input', 'policy': 'drop', 'comment': SECRET}}]})
        elif tool == 'sshd':
            assert privileged and args[1:] == ['-T']
            output = 'port 22\npermitrootlogin no\npasswordauthentication no\nallowusers ' + SECRET + '\nbanner /private/' + SECRET + '\n'
        elif tool == 'ip':
            assert privileged
            if args[1:] == ['--json', 'address', 'show', 'up']:
                output = json.dumps([{'ifname': 'eth0', 'addr_info': [
                    {'family': 'inet', 'local': '192.168.50.202', 'scope': 'global'},
                    {'family': 'inet6', 'local': '2001:4860::202', 'scope': 'global'}]}])
            else:
                assert args[1:] == ['--json', 'route', 'show', 'default']
                output = json.dumps([{'dst':'default','gateway':'192.168.50.1','dev':'eth0'}])
        elif tool == 'sysctl':
            assert privileged and '-w' not in args
            assert set(args[1:]) <= {'-n', 'net.ipv4.ip_forward', 'net.ipv6.conf.all.forwarding',
                                    'net.ipv6.bindv6only', 'net.ipv6.conf.all.disable_ipv6'}
            output = '\n'.join(key + ' = 0' for key in args[1:]) + '\n'
        elif tool == 'curl':
            assert not privileged
            assert args[1] == '--disable', 'User curl config can inject options'
            allowed_flags = {'--disable', '--silent', '--show-error', '--noproxy', '--resolve',
                             '--connect-timeout', '--max-time', '--max-filesize', '--dump-header',
                             '--output', '--write-out'}
            assert all(value in allowed_flags for value in args[1:] if value.startswith('-'))
            assert '--noproxy' in args and args[args.index('--noproxy') + 1] == '*'
            assert args[args.index('--resolve') + 1] == HOST + ':443:127.0.0.1'
            assert args[args.index('--connect-timeout') + 1] == '3'
            assert args[args.index('--max-time') + 1] == '8'
            assert args[args.index('--max-filesize') + 1] == '262144'
            assert args[args.index('--write-out') + 1] == '%{http_code}'
            assert not set(args) & {'-k', '--insecure', '-L', '--location', '--location-trusted',
                                   '-u', '--user', '-H', '--header', '-d', '--data', '-X', '--request'}
            assert args[-1].startswith('https://' + HOST + '/')
            path = args[-1].removeprefix('https://' + HOST)
            assert path in {'/', '/project/default', '/pg/version', '/api/platform/pg-meta/default/version',
                            '/rest/v1/', '/graphql/v1', '/auth/v1/health', '/storage/v1/status'}
            for flag in ('--dump-header', '--output'):
                destination = Path(args[args.index(flag) + 1])
                assert destination.parent == self.stage, 'Writes outside private evidence stage'
            status, headers, body = self.routes.get(path, ('401', 'Content-Type: application/json\n', '{"message":"' + SECRET + '"}'))
            Path(args[args.index('--dump-header') + 1]).write_text(headers)
            Path(args[args.index('--output') + 1]).write_text(body)
            output = status
            if path in self.partial_routes:
                return SimpleNamespace(returncode=63, stdout=status.encode(), stderr=(SECRET + ' oversized response').encode())
        else:
            raise AssertionError('Unexpected tool: ' + tool)
        if tool in self.timeouts:
            raise subprocess.TimeoutExpired(argv, kwargs['timeout'], output=SECRET.encode(), stderr=SECRET.encode())
        if tool in self.fail:
            return SimpleNamespace(returncode=127, stdout=SECRET.encode(), stderr=SECRET.encode())
        return SimpleNamespace(returncode=0, stdout=output.encode(), stderr=b'')


def collect(configure=None):
    """Load functions and the real main try block without executing its host prologue."""
    with tempfile.TemporaryDirectory(prefix='raps-exposure-test-') as directory:
        stage = Path(directory) / 'evidence'
        stage.mkdir(mode=0o700)
        fake = SyntheticHost(stage)
        if configure:
            configure(fake)
        module = ast.parse(embedded_python())
        functions = [node for node in module.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
        main = [node for node in module.body if isinstance(node, ast.Try)]
        assert len(main) == 1, 'Expected one full-driver try block'
        namespace = dict(ipaddress=ipaddress, json=json, os=os, pathlib=__import__('pathlib'), re=re,
                         shlex=shlex, shutil=SimpleNamespace(which=lambda n: '/usr/sbin/' + n if fake.available else None),
                         subprocess=SimpleNamespace(run=fake.run, DEVNULL=subprocess.DEVNULL, PIPE=subprocess.PIPE,
                                                    TimeoutExpired=subprocess.TimeoutExpired),
                         tempfile=tempfile, stage=stage, host=HOST,
                         docker=['docker', '--host', 'unix:///var/run/docker.sock'], missing=[])
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(SOURCE), 'exec'), namespace)
        # Stop filesystem fallback from finding the test machine's real tools.
        if not fake.available:
            namespace['executable'] = lambda _: None
        console = io.StringIO()
        previous = os.umask(0o077)
        status = 0
        try:
            with contextlib.redirect_stdout(console):
                try:
                    exec(compile(ast.Module(body=main, type_ignores=[]), str(SOURCE), 'exec'), namespace)
                except SystemExit as error:
                    status = error.code
        finally:
            os.umask(previous)
        files = {p.name: (stat.S_IMODE(p.stat().st_mode), p.read_bytes()) for p in stage.iterdir() if p.is_file()}
        return SimpleNamespace(console=console.getvalue(), status=status, files=files, fake=fake,
                               stage_mode=stat.S_IMODE(stage.stat().st_mode))


class CollectorTests(unittest.TestCase):
    def assert_safe(self, result):
        self.assertEqual(result.fake.violations, [])
        self.assertNotIn(SECRET, result.console)
        self.assertNotIn('exposure: PASS', result.console)
        self.assertNotIn('internet exposure: safe', result.console.lower())
        self.assertEqual(result.stage_mode, 0o700)
        self.assertTrue(result.files)
        self.assertTrue(all(mode == 0o600 for mode, _ in result.files.values()))

    def test_full_collection_uses_only_read_only_commands_and_private_evidence(self):
        result = collect()
        self.assert_safe(result)
        self.assertEqual(result.status, 0)
        self.assertIn('Collection complete.', result.console)
        self.assertIn('remain unverified', result.console)
        self.assertIn('all interfaces', result.console)
        self.assertIn('[::]:443', result.console)
        self.assertIn('0.0.0.0:22', result.console)
        self.assertIn('2001:4860::202 (global address)', result.console)
        self.assertIn('Default gateway: 192.168.50.1 interface=eth0', result.console)
        self.assertIn('service=sshd', result.console)
        self.assertIn('policy=DROP', result.console)
        self.assertIn('names kept private', result.console)
        self.assertTrue(any(SECRET.encode() in raw for _, raw in result.files.values()))
        self.assertEqual(sum(Path(args[2] if args[:2] == ['sudo', '-n'] else args[0]).name == 'curl'
                             for args, _ in result.fake.calls), 8)

    def test_failed_commands_never_turn_into_successful_evidence(self):
        result = collect(lambda fake: fake.fail.update({'ss', 'docker', 'ufw', 'iptables-save',
                                                       'ip6tables-save', 'nft', 'sshd', 'curl', 'ip', 'sysctl'}))
        self.assert_safe(result)
        self.assertIn('IPv4: unavailable', result.console)
        self.assertIn('IPv6: unavailable', result.console)
        self.assertIn('UNVERIFIED: request failed', result.console)
        self.assertNotIn('Unavailable/limited checks: none', result.console)
        self.assertNotIn('HTTP 401', result.console)

    def test_firewall_inverse_selector_is_preserved_without_comment_contents(self):
        result = collect()
        self.assert_safe(result)
        self.assertIn('INPUT ! -s 192.168.50.0/24 -p tcp --dport 22 -j DROP', result.console)
        self.assertNotIn('--comment', result.console)

    def test_absent_optional_tools_report_limits_instead_of_a_security_verdict(self):
        def configure(fake):
            fake.available = False
        result = collect(configure)
        self.assert_safe(result)
        self.assertEqual(result.status, 0)
        self.assertIn('UFW not installed', result.console)
        self.assertIn('OpenSSH server command not found', result.console)
        self.assertIn('rules must be assessed together', result.console)
        self.assertNotIn('nft base chain:', result.console)
        self.assertNotIn('Unavailable/limited checks: none', result.console)

    def test_timeouts_and_oversize_bodies_are_explicitly_unverified(self):
        def configure(fake):
            fake.timeouts.add('ss')
            fake.partial_routes.add('/project/default')
        result = collect(configure)
        self.assert_safe(result)
        self.assertIn('IPv4: unavailable', result.console)
        self.assertIn('/project/default UNVERIFIED:', result.console)
        self.assertNotIn('/project/default HTTP', result.console)

    def test_host_network_and_host_control_mounts_are_visible(self):
        def configure(fake):
            c = container_fixture()
            c.update(name='/host-service', network_mode='host', ports={}, requested_ports={},
                     privileged=True, mounts=[{'Type': 'bind', 'Source': '/var/run/docker.sock',
                     'Destination': '/var/run/docker.sock'}, {'Type': 'bind', 'Source': '/', 'Destination': '/host'}])
            fake.containers.append(c)
        result = collect(configure)
        self.assert_safe(result)
        self.assertIn('host networking shares host listeners', result.console)
        self.assertIn('privileged=true management-socket-mount=true host-root-mount=true', result.console)

    def test_untrusted_metadata_headers_bodies_and_comments_do_not_escape(self):
        def configure(fake):
            c = fake.containers[0]
            c.update(name='/bad\n' + SECRET, image='repo/bad\n' + SECRET,
                     project='bad\n' + SECRET, network_mode='bad\n' + SECRET)
            c['ports'] = {'bad\n' + SECRET: [{'HostIp': SECRET, 'HostPort': SECRET}]}
            fake.routes['/'] = ('200', 'Content-Type: text/html\nSet-Cookie: ' + SECRET + '\n',
                                 '<html>Supabase Studio ' + SECRET + '</html>')
            fake.routes['/project/default'] = ('302', 'Location: https://example.invalid/?token=' + SECRET + '\n', SECRET)
        result = collect(configure)
        self.assert_safe(result)
        self.assertIn('<other>', result.console)
        self.assertIn('<unparsed>', result.console)
        self.assertIn('Studio-like HTML', result.console)
        self.assertIn('redirect; destination kept private', result.console)

    def test_unauthenticated_200_is_classified_without_claiming_administrator_access(self):
        def configure(fake):
            fake.routes['/'] = ('200', 'Content-Type: text/html\n', '<html>Supabase Studio</html>')
            fake.routes['/rest/v1/'] = ('200', 'Content-Type: application/json\n', '{"openapi":"3.0.0"}')
            fake.routes['/pg/version'] = ('200', 'Content-Type: application/json\n', '{"version":"17.6"}')
        result = collect(configure)
        self.assert_safe(result)
        self.assertIn('Studio-like HTML', result.console)
        self.assertIn('API description', result.console)
        self.assertIn('version metadata', result.console)
        self.assertIn('review response classification', result.console)
        self.assertNotIn('administrator access confirmed', result.console.lower())
        self.assertNotIn('admin access confirmed', result.console.lower())

    def test_401_and_403_are_request_blocks_with_basic_challenge_classification(self):
        def configure(fake):
            fake.routes['/'] = ('401', 'WWW-Authenticate: Basic realm="' + SECRET + '"\n', SECRET)
            fake.routes['/project/default'] = ('403', 'Content-Type: application/json\n', '{"token":"' + SECRET + '"}')
        result = collect(configure)
        self.assert_safe(result)
        self.assertRegex(result.console, r'/ HTTP 401 .*Basic-challenge=true.*unauthenticated request blocked')
        self.assertRegex(result.console, r'/project/default HTTP 403 .*unauthenticated request blocked')

    def test_shell_wrapper_is_private_and_never_runs_an_external_configuration_write(self):
        shell = SOURCE.read_text().split("<<'PY'\n", 1)[0]
        self.assertIn('umask 077', shell)
        self.assertIn('sudo -v', shell)
        self.assertIn('[[ $# == 0 ]]', shell)
        self.assertNotRegex(shell, r'\b(?:tee|sed|chmod|chown|systemctl|iptables|ufw)\b')
        module = ast.parse(embedded_python())
        self.assertTrue(any(isinstance(node, ast.Expr) and isinstance(node.value, ast.Call)
                            and isinstance(node.value.func, ast.Attribute) and node.value.func.attr == 'umask'
                            for node in module.body))


if __name__ == '__main__':
    unittest.main(verbosity=2)
