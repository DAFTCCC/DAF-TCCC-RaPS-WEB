# Web.8: username accounts and verified NUC CSV archives

Deploy the backend from the reviewed feature commit **before merging its frontend into `main`**. GitHub Pages publishes `main`; the new dashboards require the archive table and clear their reports if its permissions or schema are unavailable. Installing website files cannot migrate the NUC database or deploy its functions.

This release adds username-only accounts with administrator-assisted recovery. It also fixes shared-trash classes appearing in scoped dashboard totals and adds selected-class CSV archival. Existing email accounts continue to use email sign-in and recovery.

## Review and install the backend

Use the exact full commit and SHA-256 supplied with the reviewed release. Download [deploy-web8-on-nuc.sh](supabase/maintenance/deploy-web8-on-nuc.sh) from that immutable commit, check its SHA-256, then execute it as user `nuc` with `--source-commit` set to that same full commit. The helper downloads its own source from the commit and requires an exact match before accepting any release files. A branch name, `main`, or a shortened commit is rejected. Do not execute a URL whose source or checksum has not been reviewed.

The release handoff should contain a ready-to-paste command with the real commit and checksum. They are supplied after the release files are committed; this guide deliberately does not publish a runnable command with placeholder trust values.

Prerequisites on this NUC:

- `/home/nuc/supabase-project` with its current `docker-compose.yml`, `docker-compose.isolation.yml`, `.env`, and Functions bind mount.
- Running `supabase-db` and `supabase-edge-functions` containers, Compose project `supabase`, Functions service `functions`. The Functions container must record exactly those two Compose files.
- The already-deployed web.7 account and operational permission guards. Public signup remains disabled and the Auth password minimum remains at least 12. This helper does not recreate Auth.
- Python 3, curl, Docker Compose, sudo access and enough private disk space for a complete database backup and configuration/function archives. Keep the database and Auth version used by the tested deployment.
- Existing Functions server environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the existing `RAPS_SITE_URL`. Keep these server secrets out of browser configuration and support messages.

The helper creates a private `/home/nuc/raps-web8-*` stage, saves a complete custom-format database backup, backs up all existing Functions and the two current Compose files plus `.env`, and records checksums. Directories use `0700`; backup, ledger metadata and diagnostic files use `0600`. These backups contain account, training and configuration data. Keep them on the NUC; do not paste or upload them.

It then installs only these new migrations, in this order:

1. `20261018_managed_login.sql`
2. `20261018_class_reporting_archives.sql`

Each migration and its private deployment ledger entry commit in one database transaction. The ledger stores the SQL hash and a digest of installed function definitions, ACLs, table contracts, policies and triggers. A retry skips a migration only when both match. Existing feature objects without a matching ledger, changed definitions, unsupported schemas and unexpected permissions stop the rollout for inspection. Do not apply the old account/operational migrations again.

Next it installs the matching `managed-login`, `admin-invite-user` and `admin-manage-user` handlers, and pins the archive worker under `/home/nuc/raps-tools/web8-<full commit>/`. It restarts **only the existing Functions container**, through its base/isolation Compose service, preserving the container and immutable image. No Auth, database, Caddy, router or FieldReady service is recreated. The helper verifies container identity and health, the public organizational catalog, and the expected unauthenticated `401` responses from all three account handlers.

The helper does not create test users, send invitations, request archives or process class data. Endpoint readiness checks prove routing and authentication rejection; they do not prove every authenticated production flow.

## If deployment stops

Keep the printed private stage. Inspect the generic console result and private diagnostics locally. Do not restore the database, rerun migrations manually or replace configuration files blindly.

Retry with the **same verified helper and source commit**, adding `--resume-stage` followed by the original stage path. A completed backup and its hashes must still match; installed migrations must match their ledger; handler files must match either their saved original hash or the selected release. A partial backup before any mutation requires inspection and a fresh stage. The helper does not adopt partial backups or automatically roll back database changes.

If stopped after migration commit but before function readiness, resume to finish handler installation and restart. A lost commit response is safe to inspect and resume because the ledger commits with the migration. If a migration preflight reports an unsupported deployed contract, capture only the requested metadata checks for review; do not weaken its guards to force installation.

After **Web.8 server deployment verified** appears, merge the matching reviewed frontend PR into `main`. Let GitHub Pages publish the complete release, refresh the app and confirm its About/update version is `3.4.12-web.8`. Existing cached web.7 pages can remain open during backend installation; refresh them after the matching frontend is published.

## Create and recover username accounts

An active Enterprise Administrator opens **Create Username Login**, enters the person's display name, a unique username, and the approved role/scope, then chooses **Create User & Temporary Password**. Usernames contain 3–32 lowercase letters, digits, periods, underscores or hyphens, starting with a letter or digit.

The temporary password is shown once in a dialog. Copy it only to send privately to the intended person; closing the dialog, changing identity or waiting five minutes clears the displayed value. It expires after 24 hours. The person signs in using the username, enters that temporary password and chooses a different password before opening training data. Passwords require at least 12 characters and at most 72 UTF-8 bytes. Completion requires signing in again with the chosen password; old setup/reset sessions cannot open operational data.

Username accounts have no user-facing recovery email. For recovery, an Enterprise Administrator verifies the person, selects their username under **Username Account Recovery**, and issues a new temporary password. This invalidates prior managed sessions and repeats mandatory password setup. Do not create duplicate accounts to solve a forgotten password. Administrators cannot use this control to reset their own account or remove the last usable administrator; retain another established administrator as the recovery path. A partial password operation can remain blocked until an administrator safely retries after its recovery interval.

If provisioning fails after creating the Auth identity but before registering its managed account, that banned identity can still reserve the username without appearing in the recovery selector. Stop and have the server administrator inspect the private account state, or deliberately choose a different username for the intended new account. Do not delete Auth identities blindly. Registered accounts left in `issuing` or `changing` can be recovered through an administrator retry after five minutes.

Keep existing email users on the existing email invitation/reset flow. Internal identity addresses used by username accounts are implementation details and are not mailboxes.

## Local copies, shared trash and NUC archives

| Action | Effect |
| --- | --- |
| **Remove Local Copy** | Removes this device's copy. The shared class remains on the NUC and appears in authorized dashboards. |
| Shared trash | Marks the shared class deleted. Normal dashboards exclude it and its descendant activity. Existing restore rules still apply. |
| **Archive to NUC CSV** | Requests a private, verified export for one selected shared class. After the NUC worker completes, all normal scoped dashboards exclude the class and its descendant activity. |

Previously removed local copies are not automatically archived. The local-copy action recorded no instruction to change shared reporting; an administrator must explicitly select those shared classes now. No bulk cleanup is inferred from their absence on a device.

In **Enterprise → Class Operations**, sync current work first, select the intended class, choose **Archive to NUC CSV**, and enter a reason. Finalize or void active attempts before requesting an archive. The request freezes the selected class's server training records while it is queued; it does not immediately remove report totals. Shared participant records remain available to other classes.

The **NUC CSV Archive Queue and History** panel records requested, failed and completed work. Requested and failed classes remain counted until the worker has durably written and verified the export. If a request is incorrect, cancel the pending/failed request through its queue control to release the class. A failed request may be explicitly retried, creating a fresh request generation; older export files are retained.

## Run the selected-class archive worker

The deployment helper prints the exact installed worker path. Running `python3` followed by that path, without any options, is read-only: it lists queued class IDs and status, without exporting student records. Run as user `nuc`, without `sudo python3`; use `sudo -v` first if necessary so the worker can execute its database command.

To export, use that same pinned path with `--process-selected --class-id` followed by a queued class UUID. Repeat `--class-id UUID` to select up to 25 reviewed classes. The worker never processes all queued classes implicitly. Match each UUID to the class shown in Enterprise before executing it; an explicit selection is the authorization to export that class.

Successful exports are retained at:

```text
/home/nuc/raps-training-archives/<class UUID>/<UTC request timestamp>_<request UUID>/
```

Each private folder contains 12 CSV tables, a lossless `source.json` snapshot and a `manifest.json` with file hashes, counts and encoding. Even empty tables retain their column headers. To preserve data types and protect spreadsheet use, each non-null CSV cell contains a JSON value; an empty cell represents SQL `NULL`. Strings therefore include JSON quotes. `json.loads(cell)` reverses a nonempty cell; the manifest documents this convention.

The worker writes and synchronizes the files, verifies every file's bytes and checksums, then asks the database to confirm the source snapshot and row counts still match. Only then does it record `archived` and exclude the class from reports. It preserves source database rows, identifiers, historical attribution and every export; it performs no hard deletion. This satisfies dashboard removal while retaining training evidence. It is not a database retention/purge tool or a replacement for off-device backups.

On worker failure, keep all folders and private logs. Dashboard totals remain until completion is confirmed. A filesystem or database failure may leave a complete export awaiting confirmation; inspect status before retrying. If shared participant values changed, explicitly retry the failed request to create a new export generation. Never edit its manifest or remove previous CSV folders to force acceptance. A completed archive is reverified against its saved database proof on repeat processing; it is not silently overwritten or unarchived.

## Field verification

With authorized test accounts and selected test classes, verify:

1. Create a scoped username account, deliver its temporary password privately, complete first-login setup on a second device, and sign in again. Check the intended role/base/MAJCOM; a temporary session must not read training data.
2. Issue a recovery temporary password, confirm an old session no longer reads server data, complete setup again, and confirm normal scoped access. Test an incorrect and an expired temporary password without sharing credentials or tokens.
3. Confirm email accounts retain sign-in, invitation and password-recovery behavior. Non-administrators cannot create users or reset managed passwords.
4. Confirm shared-trash classes disappear from Enterprise, MAJCOM and Program totals, while a class removed only locally remains until deliberately archived.
5. Request a test-class archive. Confirm it remains counted while queued; run only its selected UUID on the NUC; inspect the private files locally; refresh all three dashboard scopes and confirm its totals disappear while unrelated classes remain.
6. Check the archive history panel still identifies the completed class. Confirm queued/archived records resist mutation and no clinical grading results changed.

Development tests use synthetic accounts and training rows. They do not create production accounts, inspect live student data, deliver passwords or prove physical disk durability after hardware failure. Production field testing and an independent backup of retained CSVs remain owner-operated steps.
