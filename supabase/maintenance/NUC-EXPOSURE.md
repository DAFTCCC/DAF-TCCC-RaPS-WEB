# NUC exposure assessment

Run `bash inspect-nuc-exposure.sh` as the existing `nuc` account on NUC #1.
The collector requires sudo for host metadata. It makes no service, firewall,
application, account, or router changes. It does not install packages, read
student records, send emails, or perform a port scan.

It records:

- TCP/UDP listeners for IPv4 and IPv6, with process names rather than command lines.
- Host interface addresses, the default gateway (a router-management address
  candidate), and forwarding flags.
- Running containers' published ports, network modes, and selected host-control
  indicators. Docker inspection requests only selected metadata; environment
  values and container logs are not requested.
- UFW status, full private iptables/nft evidence, and filtered console summaries.
  Selected iptables rule order and selector inversions are retained. Other
  matches and custom-chain behavior require review of further filtered evidence.
- Selected SSH defaults from disk. Per-connection Match blocks, daemon command
  overrides, and configuration changes not loaded by the daemon can differ.
- Eight unauthenticated, bounded HTTPS GETs through the local gateway for the
  existing RaPS hostname. The paths cover Studio indicators and service
  metadata/health, without querying record tables or submitting a GraphQL
  operation. Requests use normal TLS verification, ignore curl configuration
  files and proxies, carry no credentials, and do not follow redirects.

The collector writes a new mode-0700 `raps-nuc-exposure-*` directory under
`/home/nuc`; evidence files are private. Share only the console output.
Raw firewall rules, SSH output, response headers/bodies, and diagnostic errors
remain on the NUC. Do not publish or paste those files.

A listener or Docker wildcard binding does not establish internet reachability.
UFW alone also does not establish that Docker forwarding is blocked. Assess
input and forwarding chains, Docker publications, IPv6, and router settings
together. Native nft expressions are captured privately but not evaluated by
the collector. A summary is evidence for review, not a firewall verdict.

An unauthenticated Studio frontend does not prove access to its privileged
backend. HTTP 401/403 blocks the specific request; redirects, generic HTML, and
404/405 need interpretation. The local probes establish local gateway behavior,
not outside-network reachability.

After collection, inspect router port forwarding, DMZ, UPnP, and IPv6 inbound
settings. Record mappings that target NUC #1 (`192.168.50.202`) and verify
selected services from outside the LAN. Check both IP families where available.
Do not infer public exposure from a test on the NUC or the same Wi-Fi network.

Before remediation, map any affected port to RaPS, FieldReady, gateway, and
administration dependencies. Preserve a working private administration path
before restricting SSH. Do not enable a firewall, remove port mappings, recreate
the entire stack, or alter the separate FieldReady stack blindly. Apply changes
to confirmed exposure and verify both access restrictions and application health.

Run the isolated collector regressions with:

```sh
python3 supabase/maintenance/test-nuc-exposure.py
```

## Initial NUC findings

The supplied inventories from `raps-nuc-exposure-83tab6si` and
`raps-nuc-exposure-eu7fia9n` show the same exposure-relevant state:

| Evidence | Interpretation |
| --- | --- |
| Router table shows TCP 80 and 443 forwarded to NUC `192.168.50.202`; DMZ off | Both web ports are configured for the gateway. Verify the HTTP-to-HTTPS redirect and outside-network reachability before changing either rule. |
| Initial router table showed TCP 8443 redirected to router `192.168.50.1:8443` | Owner disabled WAN web administration; the mapping disappeared, local router access continued, and the owner reported the public 8443 connection test failed as expected. |
| Router UPnP enabled; all pasted mappings labeled `VSERVER` | No UPnP-labeled mapping appears in the supplied table. Enabled UPnP can permit later automatic mappings. |
| Router IPv6 connection type reported Disabled | No router IPv6 connection is configured according to the owner; the NUC summary also shows no global IPv6 address. |
| Database/pooler host ports use `127.0.0.1`; database containers publish no ports | No direct non-loopback database publication is shown. This does not assess database access through authorized APIs. |
| Studio and metadata probes return HTTP 401 with a Basic challenge | Those unauthenticated local gateway requests are blocked. The administration routes still exist behind HTTPS. |
| `/storage/v1/status` returns HTTP 200 | A status endpoint response; no record disclosure was demonstrated. |
| SSH TCP 22 and Samba TCP 139/445 bind IPv4/IPv6 wildcard addresses | Host administration and file sharing are available to reachable networks, subject to filtering. The reported router rule does not establish WAN access to them. |
| UFW inactive; INPUT policies ACCEPT; no input rules shown by the filtered summary | No host input restriction is demonstrated. Full rule behavior and network paths require review before remediation. |
| SSH defaults permit passwords; root password login prohibited | Confirm the running connection's settings and working key access before changing SSH authentication. |
| No global IPv6 address appears in the interface summary | This inventory does not show a current global host IPv6 address. Router IPv6 configuration and future address assignment remain separate checks. |
| FieldReady ingress binds LAN TCP 18080 | Preserve the gateway-to-FieldReady dependency when restricting host/Docker traffic. |

Two unauthenticated HTTPS metadata/health requests from the cloud assessment
environment failed before an origin HTTP response was obtained. They do not
verify external reachability or establish that the NUC is unavailable.

## Router remediation

The owner confirmed **Enable Web Access from WAN** was selected Yes while
managing the router locally at `192.168.50.1`. They disabled it through the ASUS
interface, accepted the warning about remote ASUS app/Alexa/IFTTT control, and
confirmed both that the 8443 mapping disappeared and that local router access
still worked. NUC ports 80/443 were to remain unchanged.

The owner then reported all three requested mobile-data/private-browser checks
matched the expected results:

- `https://raps-supabase.asuscomm.com:8443` failed to connect.
- `/functions/v1/request-access` returned the public bases/MAJCOMs catalog.
- `/pg/version` required credentials or returned Unauthorized; the test did not
  require a router or application login.

These are owner-reported checks from outside the LAN. They verify the tested
gateway behavior after the router change, not an exhaustive port scan or a
complete authenticated RaPS/FieldReady workflow.

Outstanding assessment steps:

1. Verify the gateway's HTTP-to-HTTPS redirect, since TCP 80 is also forwarded.
   The completed outside-network checks used HTTPS. Preserve NUC ports 80/443
   while reviewing redirect and certificate-renewal dependencies.
2. Confirm whether Samba is needed and how administrators access the NUC before
   preparing host restrictions. Test a separate SSH key-only connection before
   disabling password login. Preserve a private recovery path.
3. Reduce confirmed unnecessary exposure with narrowly scoped rules, account
   for Docker forwarding separately, and verify both RaPS and FieldReady health.
4. Review whether enabled UPnP is needed; it can permit future automatic
   mappings even though none were labeled UPnP in the supplied snapshot.

The owner applied the router WAN-administration change. No NUC service,
firewall, account, or application change has been applied by this assessment.
