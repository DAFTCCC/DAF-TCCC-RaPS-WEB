# NUC web.7 rollout

Run `deploy-web7-on-nuc.sh` as the existing `nuc` account on NUC #1. It targets
the reviewed deployment layout and stops if its Compose labels differ. The
script pins the merged application source at `c7226cf34d452efbfa3ff27d64a18490fe9b1642`.

The script verifies downloads, creates private backups, preflights both database
migrations with a rollback, installs them in one transaction, and recreates only
the functions and Auth services. It does not send email or create test accounts.
The migrations intentionally reject repeat installation; preserve the printed
stage directory if an operation fails. It does not restore the database on a
service failure, which could discard records written since the backup.

Auth gains a persistent `docker-compose.raps-web7-auth.yml` override. Future
Auth recreations must retain all three files:

```sh
sudo docker compose --project-directory /home/nuc/supabase-project \
  --env-file /home/nuc/supabase-project/.env -p supabase \
  -f /home/nuc/supabase-project/docker-compose.yml \
  -f /home/nuc/supabase-project/docker-compose.caddy.yml \
  -f /home/nuc/supabase-project/docker-compose.raps-web7-auth.yml \
  up -d --force-recreate --no-deps --pull never --no-build auth
```

The functions service continues to use the base and isolation files. Use each
running service's recorded Compose files; the two override sets differ.
Complete real-account role checks and verify web.7 on the devices after the
script's database, Auth, and unauthenticated endpoint checks pass.
