#!/usr/bin/env bash
# Auth-only continuation after a verified base-only configuration comparison.
set -euo pipefail
umask 077
[[ "$HOME" == /home/nuc ]] || { echo 'Run as nuc on the NUC.' >&2; exit 1; }
[[ $# -le 1 ]] || { echo 'Usage: harden-auth-on-nuc.sh [VERIFIED_EVIDENCE_DIRECTORY]' >&2; exit 1; }
sudo -v
python3 - "${1:-/home/nuc/raps-auth-check-v55wnke_}" <<'PY'
import copy, datetime, json, os, pathlib, shlex, subprocess, sys, tempfile, time, urllib.request

os.umask(0o077)
root = pathlib.Path('/home/nuc/supabase-project')
evidence = pathlib.Path(sys.argv[1])
stage = pathlib.Path(tempfile.mkdtemp(prefix='raps-auth-apply-', dir='/home/nuc'))
override = root/'docker-compose.raps-web7-auth.yml'
phase = 'validate the saved evidence'
mutated = False
prefix = ['sudo','-n','env','COMPOSE_REMOVE_ORPHANS=false','COMPOSE_IGNORE_ORPHANS=true','docker']

def command(args, name, data=None):
    p = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (stage/(name+'.stdout')).write_bytes(p.stdout)
    (stage/(name+'.stderr')).write_bytes(p.stderr)
    if p.returncode:
        raise RuntimeError('command failed; inspect private diagnostic files')
    return p.stdout

def docker(args, name):
    return json.loads(command(prefix+args, name))

def compose(files):
    args = ['compose','--project-directory',str(root),'--env-file',str(root/'.env'),'-p','supabase']
    for path in files:
        args += ['-f',str(path)]
    return args

def model(files, name):
    return docker(compose(files)+['config','--format','json'], name)

def inspect(name, require_running=True):
    c = docker(['inspect','supabase-auth'], name)[0]
    assert not require_running or c['State']['Running'], 'Auth must be running'
    labels = c['Config']['Labels']
    assert labels['com.docker.compose.project']=='supabase' and labels['com.docker.compose.service']=='auth'
    return c

def signature(c):
    return {k:c[k] for k in ('Id','Config','HostConfig','Mounts')} | {
        'networks':c['NetworkSettings']['Networks']}

def env_map(c):
    entries = c['Config'].get('Env') or []
    result = dict(x.split('=',1) for x in entries)
    assert len(result)==len(entries), 'Duplicate environment names require manual review'
    return result

def assert_image(c, source, name):
    image = docker(['image','inspect',source['services']['auth']['image']], name)[0]
    assert image['Id']==c['Image'], 'The configured local image must match running Auth'

def stable_config(c):
    result = copy.deepcopy(c['Config'])
    result.pop('Env',None)
    result.pop('Image',None)  # The immutable image ID is checked separately.
    if result.get('Hostname')==c['Id'][:12]:
        result['Hostname']='<automatic>'
    result['Labels'] = {k:v for k,v in (result.get('Labels') or {}).items()
                        if not k.startswith('com.docker.compose.')}
    return result

def stable_networks(c):
    return {name:{'NetworkID':value.get('NetworkID'),'Aliases':sorted(value.get('Aliases') or []),
                  'IPAMConfig':value.get('IPAMConfig') or {},'Links':sorted(value.get('Links') or []),
                  'DriverOpts':value.get('DriverOpts') or {}}
            for name,value in c['NetworkSettings']['Networks'].items()}

def process_health(c):
    if not c['State']['Running']:
        return False
    test = (c['Config'].get('Healthcheck') or {}).get('Test')
    if test and test!=['NONE']:
        return c['State'].get('Health',{}).get('Status')=='healthy'
    port = int(env_map(c).get('GOTRUE_API_PORT') or 9999)
    assert 0 < port < 65536
    addresses = [n.get('IPAddress') or ('['+n['GlobalIPv6Address']+']' if n.get('GlobalIPv6Address') else '')
                 for n in c['NetworkSettings']['Networks'].values()]
    addresses = [a for a in addresses if a]
    if c['HostConfig'].get('NetworkMode')=='host':
        addresses = ['127.0.0.1']
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for address in addresses:
        try:
            with opener.open('http://'+address+':'+str(port)+'/health',timeout=3) as response:
                if response.status==200:
                    (stage/'health-response.txt').write_bytes(response.read(65536))
                    return True
        except Exception:
            pass
    return False

try:
    assert evidence.is_dir() and not evidence.is_symlink(), 'Expected a verified evidence directory'
    saved = json.loads((evidence/'current-auth.stdout').read_text())[0]
    saved_model = json.loads((evidence/'base-only-compose.stdout').read_text())
    before = inspect('before-auth')
    assert signature(before)==signature(saved), 'Auth changed since the saved comparison'
    baseline = model([root/'docker-compose.yml'],'before-base')
    assert baseline==saved_model, 'Base configuration changed since the saved comparison'
    assert_image(before,baseline,'before-image')
    assert not os.path.lexists(override), 'The Auth override already exists; inspect installation state'
    old_env = env_map(before)
    minimum = max(12,int(old_env.get('GOTRUE_PASSWORD_MIN_LENGTH') or 0))
    changes = {'GOTRUE_DISABLE_SIGNUP':'true','GOTRUE_PASSWORD_MIN_LENGTH':str(minimum)}
    expected_env = old_env | changes
    expected_model = copy.deepcopy(baseline)
    expected_model['services']['auth'].setdefault('environment',{}).update(changes)
    staged_override = stage/'auth-hardening.yml'
    staged_override.write_text(json.dumps({'services':{'auth':{'environment':changes}}})+'\n')
    (stage/'evidence-source.txt').write_text(str(evidence)+'\n')
    phase = 'back up the current configuration'
    for filename in ('docker-compose.yml','.env'):
        command(['sudo','-n','cat',str(root/filename)],filename+'-before')
    phase = 'validate the two-setting override'
    assert model([root/'docker-compose.yml',staged_override],'staged-model')==expected_model
    phase = 'check for configuration drift before installation'
    assert signature(inspect('recheck-auth'))==signature(before)
    assert model([root/'docker-compose.yml'],'recheck-base')==baseline
    assert_image(before,baseline,'recheck-image')
    phase = 'create the private Auth override without overwriting any file'
    writer = "import os,sys; fd=os.open(sys.argv[1],os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); f=os.fdopen(fd,'wb'); f.write(sys.stdin.buffer.read()); f.flush(); os.fsync(f.fileno()); f.close()"
    mutated = True
    command(['sudo','-n','python3','-c',writer,str(override)],'install-override',staged_override.read_bytes())
    assert model([root/'docker-compose.yml',override],'persistent-model')==expected_model
    phase = 'recreate Auth only'
    up = compose([root/'docker-compose.yml',override])+['up','-d','--force-recreate','--no-deps','--pull','never','--no-build','auth']
    command(prefix+up,'auth-recreate')
    phase = 'wait for Auth process health'
    deadline = time.monotonic()+60
    while True:
        after = inspect('after-auth', require_running=False)
        if process_health(after):
            break
        if time.monotonic()>=deadline:
            raise RuntimeError('Auth health did not pass within 60 seconds')
        time.sleep(2)
    phase = 'verify the recreated Auth configuration'
    assert after['Id']!=before['Id'] and after['Image']==before['Image']
    assert env_map(after)==expected_env
    assert stable_config(after)==stable_config(before)
    assert after['HostConfig']==before['HostConfig']
    assert sorted(after['Mounts'],key=lambda m:m['Destination'])==sorted(before['Mounts'],key=lambda m:m['Destination'])
    assert stable_networks(after)==stable_networks(before)
    assert after['Config']['Labels']['com.docker.compose.project.config_files'].split(',')==[str(root/'docker-compose.yml'),str(override)]
    for name,attach in (baseline['services']['auth'].get('networks') or {}).items():
        if attach and attach.get('mac_address'):
            net_name=baseline['networks'][name].get('name','supabase_'+name)
            assert after['NetworkSettings']['Networks'][net_name]['MacAddress']==attach['mac_address']
    print('Auth public sign-up disabled: true')
    print('Auth minimum password length:',minimum)
    print('Auth process health: OK; existing configuration preserved apart from these two settings.')
    print('Private backups and verification files:',stage)
    print('Future Auth recreations must use these two files:',root/'docker-compose.yml',override)
    print('Future Auth command:',shlex.join(prefix+up))
except BaseException:
    print('Stopped during:',phase,file=sys.stderr)
    print('Private backups and diagnostic files:',stage,file=sys.stderr)
    if mutated:
        print('Auth override installation was attempted. Inspect the saved state before retrying; no automatic rollback was attempted.',file=sys.stderr)
    else:
        print('Auth configuration and services were not changed.',file=sys.stderr)
    raise SystemExit(1)
PY
