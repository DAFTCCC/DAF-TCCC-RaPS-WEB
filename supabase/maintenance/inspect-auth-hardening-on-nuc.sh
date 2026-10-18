#!/usr/bin/env bash
# Read-only diagnosis after the Auth-only installer stopped at verification.
set -euo pipefail
umask 077
[[ "$HOME" == /home/nuc ]] || { echo 'Run as nuc on the NUC.' >&2; exit 1; }
[[ $# == 1 ]] || { echo 'Usage: inspect-auth-hardening-on-nuc.sh AUTH_APPLY_DIRECTORY' >&2; exit 1; }
sudo -v
python3 - "$1" <<'PY'
import copy, json, os, pathlib, re, subprocess, sys, tempfile, urllib.request

os.umask(0o077)
root = pathlib.Path('/home/nuc/supabase-project')
source = pathlib.Path(sys.argv[1])
stage = pathlib.Path(tempfile.mkdtemp(prefix='raps-auth-verify-', dir='/home/nuc'))
override = root/'docker-compose.raps-web7-auth.yml'
prefix = ['sudo','-n','env','COMPOSE_REMOVE_ORPHANS=false','COMPOSE_IGNORE_ORPHANS=true','docker']
phase = 'read the saved installation evidence'
checks = []

def run(args, name):
    p = subprocess.run(prefix+args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (stage/(name+'.stdout')).write_bytes(p.stdout)
    (stage/(name+'.stderr')).write_bytes(p.stderr)
    if p.returncode:
        raise RuntimeError('command failed; retain private diagnostics')
    return json.loads(p.stdout)

def safe_name(value):
    value = str(value)
    return value if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.:-]{0,127}', value) else '<nonstandard field>'

def shape(value):
    if value is None:
        return 'null'
    if isinstance(value, (list,dict)):
        return ('empty ' if not value else '')+('list' if isinstance(value,list) else 'object')
    return {str:'string',bool:'boolean',int:'integer',float:'number'}.get(type(value),'other')

def differing_fields(left, right, path=''):
    if isinstance(left, dict) and isinstance(right, dict):
        result = []
        dynamic_maps = {'Labels','DriverOpts','Config','services','networks','volumes','configs','secrets',
                        'labels','driver_opts','options','sysctls','Sysctls','StorageOpt'}
        dynamic = path.rsplit('.',1)[-1] in dynamic_maps
        for index,key in enumerate(sorted(left.keys() | right.keys()),1):
            field = '<entry '+str(index)+'>' if dynamic else safe_name(key)
            name = path+'.'+field if path else field
            if key not in left or key not in right:
                result.append(name)
            else:
                result.extend(differing_fields(left[key], right[key], name))
        return result
    return [] if left == right else [(path or '<whole value>')+' ('+shape(left)+' -> '+shape(right)+')']

def report(label, expected, actual):
    matched = expected == actual
    checks.append(matched)
    print(label+': '+('MATCH' if matched else 'DIFFERENT'))
    if not matched and isinstance(expected, dict) and isinstance(actual, dict):
        for field in differing_fields(expected, actual):
            print('  Field:', field)

def env_map(c):
    entries = c['Config'].get('Env') or []
    result = dict(x.split('=',1) for x in entries)
    if len(result) != len(entries):
        raise ValueError('duplicate environment names')
    return result

def stable_config(c):
    result = copy.deepcopy(c['Config'])
    result.pop('Env',None)
    result.pop('Image',None)
    if result.get('Hostname') == c['Id'][:12]:
        result['Hostname'] = '<automatic>'
    result['Labels'] = {k:v for k,v in (result.get('Labels') or {}).items()
                        if not k.startswith('com.docker.compose.')}
    return result

def stable_networks(c):
    return {name:{'NetworkID':value.get('NetworkID'),'Aliases':sorted(value.get('Aliases') or []),
                  'IPAMConfig':value.get('IPAMConfig') or {},'Links':sorted(value.get('Links') or []),
                  'DriverOpts':value.get('DriverOpts') or {}}
            for name,value in c['NetworkSettings']['Networks'].items()}

def network_mode_kind(c):
    mode = c['HostConfig'].get('NetworkMode')
    if mode in ('host','none','bridge','default',''):
        return mode or 'unset'
    if mode is None:
        return 'unset'
    if mode.startswith('container:'):
        return 'shared container namespace'
    networks = c['NetworkSettings']['Networks']
    if mode in networks:
        return 'attached network name'
    if any(mode == n.get('NetworkID') for n in networks.values()):
        return 'attached network ID'
    return 'other'

def healthy(c):
    if not c['State']['Running']:
        return False
    test = (c['Config'].get('Healthcheck') or {}).get('Test')
    if test and test != ['NONE']:
        return c['State'].get('Health',{}).get('Status') == 'healthy'
    port = int(env_map(c).get('GOTRUE_API_PORT') or 9999)
    if not 0 < port < 65536:
        return False
    addresses = [n.get('IPAddress') or ('['+n['GlobalIPv6Address']+']' if n.get('GlobalIPv6Address') else '')
                 for n in c['NetworkSettings']['Networks'].values()]
    if c['HostConfig'].get('NetworkMode') == 'host':
        addresses = ['127.0.0.1']
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for address in filter(None,addresses):
        try:
            with opener.open('http://'+address+':'+str(port)+'/health',timeout=3) as response:
                if response.status == 200:
                    return True
        except Exception:
            pass
    return False

try:
    if not source.is_dir() or source.is_symlink():
        raise ValueError('expected installation evidence directory')
    before = json.loads((source/'before-auth.stdout').read_text())[0]
    saved_after = json.loads((source/'after-auth.stdout').read_text())[0]
    baseline = json.loads((source/'before-base.stdout').read_text())
    minimum = max(12,int(env_map(before).get('GOTRUE_PASSWORD_MIN_LENGTH') or 0))
    changes = {'GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_PASSWORD_MIN_LENGTH':str(minimum)}
    expected_env = env_map(before) | changes
    expected_model = copy.deepcopy(baseline)
    expected_model['services']['auth'].setdefault('environment',{}).update(changes)
    phase = 'inspect the current Auth container'
    current = run(['inspect','supabase-auth'],'current-auth')[0]
    report('Auth container running',True,bool(current['State']['Running']))
    report('Auth container recreated',True,current['Id'] != before['Id'])
    report('Same immutable Auth image',before['Image'],current['Image'])
    labels = current['Config'].get('Labels') or {}
    report('Expected Compose project and service',('supabase','auth'),
           (labels.get('com.docker.compose.project'),labels.get('com.docker.compose.service')))
    report('Public signup disabled',True,env_map(current).get('GOTRUE_DISABLE_SIGNUP') == 'true')
    print('Expected password minimum:',minimum)
    report('Password minimum setting',str(minimum),env_map(current).get('GOTRUE_PASSWORD_MIN_LENGTH'))
    report('All Auth environment settings',expected_env,env_map(current))
    report('Container configuration',stable_config(before),stable_config(current))
    report('Host configuration',before['HostConfig'],current['HostConfig'])
    report('Mounts',sorted(before['Mounts'],key=lambda m:m['Destination']),
           sorted(current['Mounts'],key=lambda m:m['Destination']))
    previous_networks, current_networks = stable_networks(before), stable_networks(current)
    report('Network attachment names',set(previous_networks),set(current_networks))
    for index,name in enumerate(sorted(previous_networks.keys() | current_networks.keys()),1):
        report('Network attachment '+str(index),previous_networks.get(name),current_networks.get(name))
    print('Host network mode representation:',network_mode_kind(before),'->',network_mode_kind(current))
    report('Compose file list',[str(root/'docker-compose.yml'),str(override)],
           labels.get('com.docker.compose.project.config_files','').split(','))
    for name,attach in (baseline['services']['auth'].get('networks') or {}).items():
        if attach and attach.get('mac_address'):
            net_name = baseline['networks'][name].get('name','supabase_'+name)
            report('Configured network MAC',attach['mac_address'],
                   current['NetworkSettings']['Networks'].get(net_name,{}).get('MacAddress'))
    report('Same container as saved after restart',saved_after['Id'],current['Id'])
    for section in ('Config','HostConfig','Mounts'):
        report('Unchanged since saved restart: '+section,saved_after[section],current[section])
    phase = 'resolve the current base and Auth override'
    args = ['compose','--project-directory',str(root),'--env-file',str(root/'.env'),'-p','supabase',
            '-f',str(root/'docker-compose.yml'),'-f',str(override),'config','--format','json']
    report('Resolved Compose model',expected_model,run(args,'current-model'))
    phase = 'check Auth process health'
    report('Auth process healthy',True,healthy(current))
    print('All exact checks passed:',str(all(checks)).lower())
    print('Private diagnostic directory:',stage)
    print('Only field names and check results were printed. Do not paste private diagnostic files.')
    print('No configuration files or services were changed.')
except BaseException:
    print('Diagnostic stopped during:',phase,file=sys.stderr)
    print('Private diagnostic directory:',stage,file=sys.stderr)
    print('No configuration files or services were changed. Do not paste private diagnostic files.',file=sys.stderr)
    raise SystemExit(1)
raise SystemExit(0 if all(checks) else 1)
PY
