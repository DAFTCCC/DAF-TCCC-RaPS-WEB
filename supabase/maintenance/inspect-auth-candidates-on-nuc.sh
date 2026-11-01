#!/usr/bin/env bash
# Read-only Docker/Compose comparison. Private files contain secrets; do not paste them.
set -euo pipefail
umask 077
[[ "$HOME" == /home/nuc ]] || { echo 'Run as nuc on the NUC.' >&2; exit 1; }
sudo -v
python3 - <<'PY'
import json, os, pathlib, re, shlex, subprocess, tempfile
from decimal import Decimal

os.umask(0o077)
root = pathlib.Path('/home/nuc/supabase-project')
stage = pathlib.Path(tempfile.mkdtemp(prefix='raps-auth-check-', dir='/home/nuc'))

def run(args, name):
    p = subprocess.run(['sudo', '-n', 'docker', *args], stdin=subprocess.DEVNULL,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (stage/(name+'.stdout')).write_bytes(p.stdout)
    (stage/(name+'.stderr')).write_bytes(p.stderr)
    if p.returncode:
        raise RuntimeError('command failed')
    return json.loads(p.stdout)

try:
    current = run(['inspect', 'supabase-auth'], 'current-auth')[0]
    image = run(['image', 'inspect', current['Image']], 'current-image')[0]
except Exception:
    print('UNVERIFIED: cannot inspect current Auth and its local image.')
    print('Private diagnostic directory:', stage)
    raise SystemExit(1)

cfg, host = current['Config'], current['HostConfig']
network_cache = {}
daemon_cache = {}

def safe_name(x):
    return x if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', str(x)) else '<nonstandard name>'

def env_map(xs):
    return dict(x.split('=', 1) for x in (xs or []) if '=' in x)

def argv(v):
    return shlex.split(v) if isinstance(v, str) else list(v or [])

def duration(v):
    if isinstance(v, int):
        return v
    units = {'ns':1, 'us':1000, '\u00b5s':1000, 'ms':1000000, 's':1000000000,
             'm':60000000000, 'h':3600000000000}
    parts = re.findall(r'(\d+(?:\.\d+)?)(ns|us|\u00b5s|ms|s|m|h)', str(v))
    if ''.join(a+b for a,b in parts) != str(v):
        raise ValueError('unrecognized duration')
    return int(sum(Decimal(a)*units[b] for a,b in parts))

def bytes_value(v):
    if isinstance(v, int):
        return v
    m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*([kmgt]?)(?:i?b)?', str(v).lower())
    if not m:
        raise ValueError('unrecognized byte size')
    return int(Decimal(m[1])*(1024**('kmgt'.index(m[2])+1) if m[2] else 1))

def capset(xs):
    return sorted(str(x).upper().removeprefix('CAP_') for x in (xs or []))

def security(xs):
    return sorted('no-new-privileges:true' if x == 'no-new-privileges' else x for x in (xs or []))

def compare(name, files):
    differences, unknown = [], []
    def check(field, expected, actual):
        if expected != actual:
            differences.append(field)
    try:
        args = ['compose', '--project-directory', str(root), '--env-file', str(root/'.env'), '-p', 'supabase']
        for f in files:
            args += ['-f', str(root/f)]
        model = run(args+['config', '--format', 'json'], name+'-compose')
        svc = model['services']['auth']
        local_image = run(['image', 'inspect', svc['image']], name+'-image')[0]
        check('image ID', local_image['Id'], current['Image'])
        defaults = local_image['Config']
        expected_env = env_map(defaults.get('Env'))
        for k,v in (svc.get('environment') or {}).items():
            if v is None:
                expected_env.pop(k, None)
            else:
                expected_env[k] = str(v)
        actual_env = env_map(cfg.get('Env'))
        env_diff = sorted(safe_name(k) for k in expected_env.keys() | actual_env.keys()
                          if expected_env.get(k) != actual_env.get(k))
        if env_diff:
            differences.append('environment names: '+', '.join(env_diff))
        entry = svc.get('entrypoint')
        command = svc.get('command')
        check('entrypoint', argv(defaults.get('Entrypoint') if entry is None else entry), argv(cfg.get('Entrypoint')))
        check('command', argv(command if command is not None else ([] if entry is not None else defaults.get('Cmd'))), argv(cfg.get('Cmd')))
        for field, docker_field in [('user','User'), ('working_dir','WorkingDir')]:
            check(field, str(svc.get(field, defaults.get(docker_field) or '')), cfg.get(docker_field) or '')
        check('container_name', svc.get('container_name', current['Name'].lstrip('/')), current['Name'].lstrip('/'))
        if 'hostname' in svc:
            check('hostname', svc['hostname'], cfg.get('Hostname'))
        elif cfg.get('Hostname') and cfg['Hostname'] != current.get('Id','')[:12]:
            unknown.append('custom runtime hostname')
        check('domainname', svc.get('domainname') or '', cfg.get('Domainname') or '')
        labels = {**(defaults.get('Labels') or {}), **(svc.get('labels') or {})}
        expected_labels = {k:str(v) for k,v in labels.items() if not k.startswith('com.docker.compose.')}
        actual_labels = {k:str(v) for k,v in (cfg.get('Labels') or {}).items() if not k.startswith('com.docker.compose.')}
        check('custom labels', expected_labels, actual_labels)

        ports = {}
        for p in svc.get('ports') or []:
            if not isinstance(p, dict) or not str(p.get('published','')).isdigit():
                unknown.append('dynamic or unnormalized port mapping')
                continue
            key = str(p['target'])+'/'+p.get('protocol','tcp')
            ip = p.get('host_ip') or ''
            ports.setdefault(key, []).append(('' if ip == '0.0.0.0' else ip, str(p['published'])))
        actual_ports = {k:sorted(('' if (p.get('HostIp') or '') == '0.0.0.0' else p.get('HostIp') or '', p['HostPort'])
                               for p in v or []) for k,v in (host.get('PortBindings') or {}).items()}
        check('published ports', {k:sorted(v) for k,v in ports.items()}, actual_ports)
        exposed = set((defaults.get('ExposedPorts') or {}).keys()) | set(ports)
        exposed.update(str(p) if '/' in str(p) else str(p)+'/tcp' for p in svc.get('expose') or [])
        check('exposed ports', exposed, set((cfg.get('ExposedPorts') or {}).keys()))

        mounts = {x['Destination']: x for x in current.get('Mounts') or []}
        expected_targets = set((defaults.get('Volumes') or {}).keys())
        for v in svc.get('volumes') or []:
            if not isinstance(v, dict):
                unknown.append('unnormalized volume')
                continue
            target = v['target']; expected_targets.add(target)
            m = mounts.get(target, {})
            check('volume type', v['type'], m.get('Type'))
            check('volume read/write', not bool(v.get('read_only')), m.get('RW'))
            if v['type'] == 'bind':
                check('bind source', v.get('source'), m.get('Source'))
                check('bind propagation', (v.get('bind') or {}).get('propagation','rprivate'), m.get('Propagation') or 'rprivate')
                if set(v.get('bind') or {}) - {'create_host_path','propagation'}:
                    unknown.append('additional bind options')
            elif v['type'] == 'volume':
                if v.get('source'):
                    vd = (model.get('volumes') or {}).get(v['source'], {}) or {}
                    check('named volume', vd.get('name', 'supabase_'+v['source']), m.get('Name'))
                if v.get('volume'):
                    unknown.append('additional named-volume options')
            else:
                unknown.append('volume type requiring manual review')
        check('mounted targets', expected_targets, set(mounts))
        if svc.get('tmpfs') or host.get('Tmpfs'):
            unknown.append('tmpfs options')

        check('privileged', bool(svc.get('privileged')), bool(host.get('Privileged')))
        check('read_only', bool(svc.get('read_only')), bool(host.get('ReadonlyRootfs')))
        check('cap_add', capset(svc.get('cap_add')), capset(host.get('CapAdd')))
        check('cap_drop', capset(svc.get('cap_drop')), capset(host.get('CapDrop')))
        check('security_opt', security(svc.get('security_opt')), security(host.get('SecurityOpt')))
        check('init', bool(svc.get('init')), bool(host.get('Init')))
        for field, docker_field, default in [('pid','PidMode',''),('ipc','IpcMode','private'),
                                             ('userns_mode','UsernsMode',''),('cgroup_parent','CgroupParent','')]:
            check(field, svc.get(field, default), host.get(docker_field) or default)
        check('sysctls', svc.get('sysctls') or {}, host.get('Sysctls') or {})
        for key in ('Dns','DnsOptions','DnsSearch','ExtraHosts','Links','VolumesFrom','GroupAdd','UTSMode',
                    'StorageOpt','BlkioDeviceReadBps','BlkioDeviceWriteBps','BlkioDeviceReadIOps','BlkioDeviceWriteIOps'):
            if host.get(key):
                unknown.append('runtime '+key)
        if host.get('AutoRemove') or host.get('PublishAllPorts'):
            unknown.append('runtime automatic removal or port publishing')
        if host.get('Runtime') not in (None,'','runc','io.containerd.runc.v2'):
            unknown.append('custom runtime')
        restart = svc.get('restart','no')
        restart_name, _, retry = restart.partition(':')
        check('restart policy', (restart_name, int(retry or 0)),
              ((host.get('RestartPolicy') or {}).get('Name') or 'no', (host.get('RestartPolicy') or {}).get('MaximumRetryCount',0)))
        for field, docker_field in [('mem_limit','Memory'), ('memswap_limit','MemorySwap')]:
            if field in svc:
                check(field, bytes_value(svc[field]), host.get(docker_field) or 0)
            elif host.get(docker_field):
                unknown.append(field+' runtime limit')
        check('shm_size', bytes_value(svc.get('shm_size', 67108864)), host.get('ShmSize'))
        if svc.get('devices') or host.get('Devices') or svc.get('device_cgroup_rules') or host.get('DeviceCgroupRules'):
            unknown.append('device permissions')
        if svc.get('ulimits') or host.get('Ulimits'):
            unknown.append('ulimits')
        for key in ('CpuShares','NanoCpus','CpuQuota','CpuPeriod','CpusetCpus','CpusetMems','OomKillDisable','OomScoreAdj','PidsLimit'):
            if host.get(key):
                unknown.append('runtime '+key)

        logging = svc.get('logging') or {}
        actual_logging = host.get('LogConfig') or {}
        driver = logging.get('driver')
        if not driver:
            if 'logging' not in daemon_cache:
                daemon_cache['logging'] = run(['info','--format','{{json .LoggingDriver}}'], 'daemon-logging')
            driver = daemon_cache['logging']
        check('logging driver', driver, actual_logging.get('Type'))
        if logging:
            check('logging options', {k:str(v) for k,v in (logging.get('options') or {}).items()}, actual_logging.get('Config') or {})
        elif actual_logging.get('Config'):
            unknown.append('daemon logging options')

        health = dict(defaults.get('Healthcheck') or {})
        h = svc.get('healthcheck') or {}
        if h.get('disable'):
            health = {'Test':['NONE']}
        else:
            if 'test' in h: health['Test'] = h['test']
            for field, docker_field in [('interval','Interval'),('timeout','Timeout'),('start_period','StartPeriod'),('start_interval','StartInterval')]:
                if field in h: health[docker_field] = duration(h[field])
            if 'retries' in h: health['Retries'] = int(h['retries'])
        actual_health = cfg.get('Healthcheck') or {}
        check('healthcheck command', health.get('Test') or [], actual_health.get('Test') or [])
        if health.get('Test') != ['NONE']:
            for key in ('Interval','Timeout','StartPeriod','StartInterval','Retries'):
                check('healthcheck '+key, health.get(key) or 0, actual_health.get(key) or 0)

        actual_networks = (current.get('NetworkSettings') or {}).get('Networks') or {}
        if svc.get('network_mode'):
            check('network_mode', svc['network_mode'], host.get('NetworkMode'))
            if svc['network_mode'] not in ('host','none'):
                unknown.append('shared network namespace')
        else:
            desired = svc.get('networks') or {'default':None}
            names = set()
            for key, attach in desired.items():
                attach = attach or {}
                definition = (model.get('networks') or {}).get(key, {}) or {}
                net_name = definition.get('name', 'supabase_'+key); names.add(net_name)
                actual = actual_networks.get(net_name) or {}
                expected_aliases = {current['Name'].lstrip('/'), 'auth', *(attach.get('aliases') or [])}
                check('network aliases', expected_aliases, set(actual.get('Aliases') or []))
                ipam = actual.get('IPAMConfig') or {}
                for field,docker_field in [('ipv4_address','IPv4Address'),('ipv6_address','IPv6Address')]:
                    check('network '+field, attach.get(field) or '', ipam.get(docker_field) or '')
                if attach.get('link_local_ips') or ipam.get('LinkLocalIPs'):
                    check('network link-local IPs', sorted(attach.get('link_local_ips') or []), sorted(ipam.get('LinkLocalIPs') or []))
                if attach.get('mac_address'):
                    check('network MAC', attach['mac_address'], actual.get('MacAddress'))
                if set(attach) - {'aliases','ipv4_address','ipv6_address','link_local_ips','mac_address','priority','gw_priority'}:
                    unknown.append('additional network attachment options')
                if attach.get('priority') or attach.get('gw_priority'):
                    unknown.append('network gateway/attachment priority')
                if net_name not in network_cache:
                    network_cache[net_name] = run(['network','inspect',net_name], 'network-'+str(len(network_cache)))[0]
                net = network_cache[net_name]
                if not definition.get('external'):
                    for field,docker_field,default in [('driver','Driver','bridge'),('internal','Internal',False),
                                                      ('attachable','Attachable',False),('enable_ipv6','EnableIPv6',False)]:
                        check('used network '+field, definition.get(field,default), net.get(docker_field,default))
                    check('used network driver options', definition.get('driver_opts') or {}, net.get('Options') or {})
                    ni = definition.get('ipam') or {}; ai = net.get('IPAM') or {}
                    check('used network IPAM driver', ni.get('driver','default'), ai.get('Driver') or 'default')
                    check('used network IPAM options', ni.get('options') or {}, ai.get('Options') or {})
                    if ni.get('config'):
                        wanted = ni['config']; have = ai.get('Config') or []
                        check('used network IPAM entry count', len(wanted), len(have))
                        for index, entry in enumerate(wanted):
                            for field,docker_field in [('subnet','Subnet'),('ip_range','IPRange'),('gateway','Gateway'),('aux_addresses','AuxiliaryAddresses')]:
                                if field in entry:
                                    check('used network IPAM '+field, entry[field], (have[index] if index < len(have) else {}).get(docker_field))
                    if set(definition) - {'name','external','driver','driver_opts','internal','attachable','enable_ipv6','enable_ipv4','ipam','labels'}:
                        unknown.append('additional used network definition options')
                    if 'enable_ipv4' in definition:
                        if 'EnableIPv4' in net:
                            check('used network enable_ipv4', definition['enable_ipv4'], net['EnableIPv4'])
                        else: unknown.append('network IPv4 feature state')
            check('network attachments', names, set(actual_networks))

        checked = {'image','environment','command','entrypoint','user','working_dir','container_name','hostname','domainname','labels',
                   'ports','expose','volumes','tmpfs','privileged','read_only','cap_add','cap_drop','security_opt','init','pid','ipc',
                   'userns_mode','cgroup_parent','sysctls','restart','mem_limit','memswap_limit','shm_size','devices',
                   'device_cgroup_rules','ulimits','logging','healthcheck','network_mode','networks',
                   'depends_on','profiles','pull_policy','build'}
        unknown.extend('service option '+safe_name(k) for k in set(svc)-checked)
    except Exception:
        unknown.append('resolution or comparison failed; inspect private files locally')
    print(name+': '+('DIFFERENT' if differences else 'UNVERIFIED' if unknown else 'MATCH for checked Auth configuration'))
    for field in sorted(set(differences)):
        print('  DIFFERENT:', field)
    for field in sorted(set(unknown)):
        print('  UNVERIFIED:', field)

candidates = [('base-only',['docker-compose.yml'])]
for old in ('docker-compose.caddy.yml.before-family','docker-compose.caddy.yml.before-fieldready-20260924-053527'):
    if (root/old).is_file():
        candidates.append((old.removeprefix('docker-compose.'), ['docker-compose.yml',old]))
for name,files in candidates:
    compare(name,files)
print('Private diagnostic directory:', stage)
print('Do not paste files from this directory: they include server secrets.')
print('No configuration files or services were changed. MATCH covers Auth only; it does not restore or validate the other services in an old override.')
PY
