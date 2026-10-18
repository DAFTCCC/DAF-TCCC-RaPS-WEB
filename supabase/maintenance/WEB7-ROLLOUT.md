# NUC web.7 rollout

Run `deploy-web7-on-nuc.sh` as the existing `nuc` account on NUC #1. It targets
the reviewed deployment layout and stops if its Compose labels differ. The
script pins the merged application source at `c7226cf34d452efbfa3ff27d64a18490fe9b1642`.

Recorded container labels do not prove that the original Compose files still
exist. Preflight checks require all recorded files on disk before backups or
migrations. If a file is missing, recover its original contents from a private
backup and validate them against the running service before attempting a
recreation. Do not substitute an empty override or use only the base file.
An archive produced by a failed `tar` command is incomplete and is not a
complete configuration backup.

After the missing configuration is recovered and validated, a failure that
occurred before migration installation can reuse the prior release files with
`bash deploy-web7-on-nuc.sh --resume-stage /home/nuc/raps-web7-XXXXXXXX`.
Every file is checked again against its pinned hash. A fresh attempt directory
keeps new backups separate from the original stage. Existing guard policies
stop execution; this option does not repeat or skip installed migrations.

When the original Auth override is unavailable, `--defer-auth` installs only
the database guards and functions using their existing base/isolation files.
It does not change or recreate Auth, require its missing override, or claim
that signup/password-policy hardening passed. The backed-up configuration file
list is saved beside the archive. Complete Auth recovery separately after
validating a replacement against its running configuration; do not rerun the
database migrations to finish that remaining step.

If the installer reports existing guards, run `verify-web7-on-nuc.sh` instead
of applying the migrations again. It compares the guarded function definitions,
policies, triggers, table protections, and effective browser privileges with
the reviewed PostgreSQL 17.6 enum/text fixtures. It checks the installed handler
hashes, startup timestamps, and unauthenticated endpoints without changing
records or services. A handler timestamp result of `False` requires review of
the running Functions worker; successful read-only requests alone do not prove
that a previously cached handler was refreshed.

`inspect-auth-candidates-on-nuc.sh` compares the base configuration and both
known historical Caddy candidates against the running Auth container. It only
prints differing setting names. Its private diagnostic directory contains
resolved secrets and must remain private. `MATCH` describes the checked Auth
settings; it does not recover the missing override, validate other services in
a historical file, or authorize a whole-stack recreation.

The script verifies downloads, creates private backups, preflights both database
migrations with a rollback, installs them in one transaction, and recreates only
the functions and Auth services. It does not send email or create test accounts.
The migrations intentionally reject repeat installation; preserve the printed
stage directory if an operation fails. It does not restore the database on a
service failure, which could discard records written since the backup.

After a successful base-only Auth comparison, `harden-auth-on-nuc.sh` can finish
the Auth settings separately. Pass the private diagnostic directory from that
approved comparison. The helper checks that both the container and resolved
base configuration still match the captured evidence, and that the proposed
configuration changes only signup and password-minimum settings. It backs up
the configuration privately and recreates only Auth. It does not rerun database
migrations or replace administrative handlers.

If this helper stops during post-recreation verification, preserve its private
`raps-auth-apply-*` directory. Auth may already be healthy with the new settings.
Run `inspect-auth-hardening-on-nuc.sh /home/nuc/raps-auth-apply-XXXXXXXX`
with the reported directory before retrying the installer. This read-only
diagnostic compares the current container with the saved before/after evidence,
checks the two settings and process health, and resolves the current Compose
model. Its console output names differing fields and value types; private
diagnostic files retain configuration values and must not be shared. It does
not relax comparisons, recreate services, or roll back configuration.

Docker can store unused `HostConfig.Dns`, `DnsOptions`, and `DnsSearch` fields as
either `null` or empty lists after a recreation. Both mean no container-specific
DNS override. Verification accepts this representation difference for these
three fields only; missing keys, nonempty DNS lists (including their order), and
all other host configuration differences still fail. The original pre-install
evidence and the current-versus-saved restart checks remain exact. When these
three empty DNS representations are the only differences and all other checks
pass, the Auth update is complete; no additional service restart is needed.

This verified base-only path uses the base file and a persistent
`docker-compose.raps-web7-auth.yml` override. Future Auth recreations must retain
both files and keep orphan removal disabled:

```sh
sudo env COMPOSE_REMOVE_ORPHANS=false COMPOSE_IGNORE_ORPHANS=true \
  docker compose --project-directory /home/nuc/supabase-project \
  --env-file /home/nuc/supabase-project/.env -p supabase \
  -f /home/nuc/supabase-project/docker-compose.yml \
  -f /home/nuc/supabase-project/docker-compose.raps-web7-auth.yml \
  up -d --force-recreate --no-deps --pull never --no-build auth
```

The functions service continues to use the base and isolation files. Use each
running service's recorded Compose files; the override sets differ. The original
full installer still requires its historical Caddy file; do not use that path
to repeat migrations after completing the verified Auth-only step.
Complete real-account role checks and verify web.7 on the devices after the
script's database, Auth, and unauthenticated endpoint checks pass.
