#!/usr/bin/env bash
# Read-only exposure inventory. Raw evidence stays private on the NUC.
set -euo pipefail
umask 077
[[ "$HOME" == /home/nuc ]] || { echo 'Run as nuc on the NUC.' >&2; exit 1; }
[[ $# == 0 ]] || { echo 'Usage: inspect-nuc-exposure.sh' >&2; exit 1; }
sudo -v
python3 -u - <<'PY'
import ipaddress, json, os, pathlib, re, shlex, shutil, subprocess, tempfile

os.umask(0o077)
stage = pathlib.Path(tempfile.mkdtemp(prefix='raps-nuc-exposure-',dir='/home/nuc'))
host = 'raps-supabase.asuscomm.com'
docker = ['docker','--host','unix:///var/run/docker.sock']
missing = []

def executable(name):
    found = shutil.which(name)
    if found:
        return found
    for directory in ('/usr/sbin','/sbin','/usr/bin','/bin'):
        candidate = pathlib.Path(directory)/name
        if candidate.is_file():
            return str(candidate)
    return None

def run(args,name,privileged=True,timeout=25):
    try:
        p = subprocess.run((['sudo','-n'] if privileged else [])+args,
                           stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,
                           env={**os.environ,'LC_ALL':'C'},timeout=timeout)
        code,out,err = p.returncode,p.stdout,p.stderr
    except subprocess.TimeoutExpired as error:
        code,out,err = 124,error.stdout or b'',error.stderr or b''
    except OSError:
        code,out,err = 127,b'',b'Command unavailable\n'
    (stage/(name+'.stdout')).write_bytes(out)
    (stage/(name+'.stderr')).write_bytes(err)
    if code:
        missing.append(name)
    return code,out.decode('utf-8','replace')

def name(value):
    text = str(value or '')
    return text if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:/@+-]{0,200}',text) else '<other>'

def address(value):
    text = str(value or '')
    if text in ('','*','0.0.0.0','::','[::]'):
        return text or '*','all interfaces'
    bare = text.strip('[]').split('%',1)[0]
    try:
        parsed = ipaddress.ip_address(bare)
    except ValueError:
        return '<unparsed>','unverified address'
    kind = 'loopback' if parsed.is_loopback else 'link-local' if parsed.is_link_local else 'global address' if parsed.is_global else 'private address'
    return str(parsed),kind

def listeners(text,family):
    count = 0
    for line in text.splitlines():
        columns = line.split()
        if len(columns)<6 or columns[0] not in ('tcp','udp'):
            continue
        endpoint = columns[4]
        if ':' not in endpoint:
            continue
        bound,port = endpoint.rsplit(':',1)
        if not port.isdecimal():
            continue
        bound,kind = address(bound)
        owners = sorted(set(name(x) for x in re.findall(r'\("([^"\n]+)"',line)))
        print(' ',columns[0],family,bound+':'+port,'('+kind+')','service='+(','.join(owners) or 'unidentified'))
        count += 1
    return count

def container_summary(c):
    print(' ',name(c.get('name','').lstrip('/')),'state='+name(c.get('state')),
          'image='+name(str(c.get('image','')).rsplit('/',1)[-1]),
          'network='+name(c.get('network_mode')),'project='+name(c.get('project')))
    actual = c.get('ports') or {}
    requested = c.get('requested_ports') or {}
    for target,bindings in sorted(actual.items()):
        for mapping in bindings or []:
            bound,kind = address(mapping.get('HostIp'))
            port = str(mapping.get('HostPort',''))
            print('   Published:',bound+':'+(port if port.isdecimal() else '<other>'),
                  '->',name(target),'('+kind+')')
    if not any(actual.values()):
        print('   Published ports: none recorded'+(' (host networking shares host listeners)' if c.get('network_mode')=='host' else ''))
    if set(requested)-set(actual):
        print('   Requested/runtime port mapping discrepancy: review private evidence')
    mounts = c.get('mounts') or []
    socket_paths = {'/var/run/docker.sock','/run/docker.sock','/run/containerd/containerd.sock','/var/run/containerd/containerd.sock'}
    socket_mount = any(m.get('Source') in socket_paths or m.get('Destination') in socket_paths for m in mounts)
    root_mount = any(m.get('Type')=='bind' and m.get('Source')=='/' for m in mounts)
    if c.get('privileged') or socket_mount or root_mount:
        print('   Host-control indicators: privileged='+str(bool(c.get('privileged'))).lower(),
              'management-socket-mount='+str(socket_mount).lower(),'host-root-mount='+str(root_mount).lower())

def firewall_summary(text,family):
    table = ''
    for line in text.splitlines():
        if line.startswith('*'):
            table = line[1:]
        elif table=='filter' and line.startswith(':'):
            fields = line.split()
            chain = fields[0][1:]
            if chain in ('INPUT','FORWARD','DOCKER-USER'):
                print(' ',family,name(chain),'policy='+name(fields[1]))
        elif table=='filter' and line.startswith('-A '):
            try:
                fields = shlex.split(line)
            except ValueError:
                continue
            if len(fields)<2 or fields[1] not in ('INPUT','FORWARD','DOCKER-USER','ufw-user-input','ufw-user-forward'):
                continue
            pieces = []
            # Print only packet-selector metadata. Comments and string matches stay private.
            allowed = {'-s','-d','-p','-i','-o','-j','-g','--dport','--dports','--sport','--sports','--ctstate','--state','--dst-type','--src-type'}
            for index,item in enumerate(fields[:-1]):
                if item in allowed:
                    value = fields[index+1]
                    safe = value if re.fullmatch(r'[A-Za-z0-9_./:,!*+-]{1,200}',value) else '<other>'
                    inversion = '! ' if index and fields[index-1]=='!' else ''
                    pieces.append(inversion+item+' '+safe)
            print(' ',family,name(fields[1]),' '.join(pieces),'[other match details remain private]')

def route_summary(path,code,headers,body):
    status = code.strip() if re.fullmatch(r'\d{3}',code.strip()) else 'unavailable'
    lower_headers = headers.lower()
    media = 'HTML' if re.search(r'(?im)^content-type:\s*text/html',headers) else 'JSON' if re.search(r'(?im)^content-type:\s*[^\r\n]*json',headers) else 'other/unknown'
    indicators = []
    low = body.lower()
    if '<html' in low and any(x in low for x in ('supabase studio','supabase dashboard','/project/default')):
        indicators.append('Studio-like HTML')
    try:
        data = json.loads(body)
    except (ValueError,TypeError):
        data = None
    if isinstance(data,dict):
        if isinstance(data.get('openapi'),str) or isinstance(data.get('swagger'),str):
            indicators.append('API description')
        if path in ('/pg/version','/api/platform/pg-meta/default/version') and any(k in data for k in ('version','version_number','version_string')):
            indicators.append('version metadata')
        if path=='/graphql/v1' and isinstance(data.get('errors'),list):
            indicators.append('GraphQL error envelope')
    challenge = bool(re.search(r'(?im)^www-authenticate:\s*basic(?:\s|$)',headers))
    blocked = 'unauthenticated request blocked' if status in ('401','403') else 'redirect; destination kept private' if status.startswith('3') else 'review response classification'
    print(' ',path,'HTTP '+status,media,'Basic-challenge='+str(challenge).lower(),
          '; '.join(indicators) or 'no fixed body indicator','('+blocked+')')

try:
    print('NUC exposure inventory: read-only; no service or firewall changes.')
    print('Private evidence directory:',stage)
    print('\nHOST LISTENERS (bindings do not prove internet reachability)')
    for family in ('4','6'):
        code,text = run(['ss','-H','-lntup','-'+family],'listeners-ipv'+family)
        if code or not listeners(text,'IPv'+family):
            print('  IPv'+family+': '+('unavailable' if code else 'no parsed TCP/UDP listeners'))

    print('\nHOST INTERFACE ADDRESSES AND FORWARDING')
    code,text = run(['ip','--json','address','show','up'],'interface-addresses')
    if not code:
        for interface in json.loads(text):
            interface_name = interface.get('ifname','')
            for entry in interface.get('addr_info') or []:
                bound,kind = address(entry.get('local'))
                virtual = interface_name.startswith(('docker','br-','veth'))
                if kind in ('loopback','link-local') or (virtual and kind!='global address'):
                    continue
                print(' ',name(interface_name),bound,'('+kind+')')
    else:
        print('  Interface addresses unavailable.')
    code,text = run(['ip','--json','route','show','default'],'default-route')
    if not code:
        for route in json.loads(text):
            if route.get('gateway'):
                gateway,kind = address(route['gateway'])
                print('  Default gateway:',gateway,'interface='+name(route.get('dev')),'('+kind+')')
    keys = ('net.ipv4.ip_forward','net.ipv6.conf.all.forwarding','net.ipv6.bindv6only','net.ipv6.conf.all.disable_ipv6')
    code,text = run(['sysctl',*keys],'forwarding-flags')
    for line in text.splitlines():
        key,_,value = line.partition(' = ')
        if key in keys and value in ('0','1'):
            print(' ',key+'='+value)

    print('\nRUNNING CONTAINERS AND PUBLISHED PORTS')
    code,ids = run(docker+['ps','-q','--no-trunc'],'container-ids')
    ids = ids.split() if not code else []
    if ids and all(re.fullmatch(r'[0-9a-f]{12,64}',x) for x in ids):
        fmt = '{"name":{{json .Name}},"state":{{json .State.Status}},"image":{{json .Config.Image}},"network_mode":{{json .HostConfig.NetworkMode}},"privileged":{{json .HostConfig.Privileged}},"ports":{{json .NetworkSettings.Ports}},"requested_ports":{{json .HostConfig.PortBindings}},"mounts":{{json .Mounts}},"project":{{json (index .Config.Labels "com.docker.compose.project")}}}'
        code,text = run(docker+['inspect','--format',fmt,*ids],'container-network-metadata')
        if not code:
            for line in text.splitlines():
                container_summary(json.loads(line))
        else:
            print('  Running-container metadata unavailable; private error retained.')
    else:
        print('  No running containers found or local Docker unavailable.')

    print('\nFIREWALL EVIDENCE')
    ufw = executable('ufw')
    if ufw:
        code,text = run([ufw,'status','verbose'],'ufw-status')
        if not code:
            for line in text.splitlines():
                clean = line.partition('#')[0].strip()
                if clean.startswith(('Status:','Default:')) or re.search(r'\b(?:ALLOW|DENY|REJECT|LIMIT)\b',clean):
                    if re.fullmatch(r'[A-Za-z0-9 .:/()_\[\],!+-]{1,240}',clean):
                        print('  UFW:',clean)
        else:
            print('  UFW status unavailable; private evidence retained.')
    else:
        missing.append('ufw-not-installed')
        print('  UFW not installed; other firewall evidence is still required.')
    for tool,family in (('iptables-save','IPv4'),('ip6tables-save','IPv6')):
        found = executable(tool)
        if found:
            code,text = run([found],tool)
            if not code:
                firewall_summary(text,family)
            else:
                print(' ',family,'iptables rules unavailable.')
        else:
            missing.append(tool+'-not-installed')
            print(' ',family,'iptables command not installed; rules unverified by this tool.')
    nft = executable('nft')
    if nft:
        code,text = run([nft,'--json','list','ruleset'],'nft-ruleset')
        if not code:
            data = json.loads(text)
            bases = [x['chain'] for x in data.get('nftables',[]) if 'chain' in x and x['chain'].get('hook') in ('input','forward')]
            for chain in bases:
                print('  nft base chain:',name(chain.get('family')),name(chain.get('table')),name(chain.get('name')),
                      'hook='+name(chain.get('hook')),'policy='+name(chain.get('policy')))
            if not bases:
                print('  No nft input/forward base chains recorded.')
            print('  nft per-rule behavior is not evaluated here; expressions are saved privately.')
        else:
            print('  nft rules unavailable; private error retained.')
    else:
        missing.append('nft-not-installed')
        print('  nft command not installed; rules unverified by this tool.')
    print('  UFW, Docker forwarding, IPv6, and router rules must be assessed together.')

    print('\nSSH DEFAULTS FROM DISK (Match rules and running-process overrides can differ)')
    sshd = executable('sshd')
    if sshd:
        code,text = run([sshd,'-T'],'sshd-defaults')
        if not code:
            selected = {'port','listenaddress','permitrootlogin','passwordauthentication','kbdinteractiveauthentication',
                        'pubkeyauthentication','authenticationmethods','permitemptypasswords','maxauthtries','logingracetime',
                        'maxstartups','allowtcpforwarding','x11forwarding','allowagentforwarding','gatewayports','permittunnel'}
            for line in text.splitlines():
                key,_,value = line.partition(' ')
                if key in selected:
                    safe = value if re.fullmatch(r'[A-Za-z0-9 .,:@/\[\]_*+-]{1,200}',value) else '<other>'
                    print(' ',key+'='+safe)
                elif key in ('allowusers','allowgroups','denyusers','denygroups'):
                    print(' ',key+'=configured (names kept private)')
        else:
            print('  sshd -T unavailable; private error retained.')
    else:
        missing.append('sshd-not-installed')
        print('  OpenSSH server command not found.')

    print('\nUNAUTHENTICATED HTTPS ROUTES THROUGH LOCAL GATEWAY')
    print('  Loopback only, normal TLS checks, no credentials, no redirects, no record queries.')
    for index,path in enumerate(('/','/project/default','/pg/version','/api/platform/pg-meta/default/version',
                                 '/rest/v1/','/graphql/v1','/auth/v1/health','/storage/v1/status')):
        header_file,body_file = stage/('route-'+str(index)+'.headers'),stage/('route-'+str(index)+'.body')
        args = ['curl','--disable','--silent','--show-error','--noproxy','*','--resolve',host+':443:127.0.0.1',
                '--connect-timeout','3','--max-time','8','--max-filesize','262144',
                '--dump-header',str(header_file),'--output',str(body_file),'--write-out','%{http_code}',
                'https://'+host+path]
        code,text = run(args,'route-'+str(index),privileged=False,timeout=12)
        if code:
            print(' ',path,'UNVERIFIED: request failed or response exceeded limit (details private)')
            continue
        route_summary(path,text,header_file.read_text(errors='replace'),body_file.read_text(errors='replace'))

    print('\nCollection complete. No exposure verdict is inferred from a listener or HTTP status alone.')
    print('Router port forwards, UPnP mappings, IPv6 inbound rules, and outside-network reachability remain unverified.')
    print('Unavailable/limited checks:',', '.join(name(x) for x in missing) or 'none')
    print('Paste console output only. Keep the private evidence directory on the NUC:',stage)
except Exception:
    print('Collection stopped; retain the private evidence directory:',stage)
    print('No configuration files, services, accounts, or firewall rules were changed.')
    raise SystemExit(1)
PY
