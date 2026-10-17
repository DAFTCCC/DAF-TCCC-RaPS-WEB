# RaPS role permissions

Roles come from current, active memberships, with their installation or MAJCOM
scope. A display label, the highest-ranked role, a profile email, and a cached
administrator identity do not authorize a server operation. Multiple memberships
grant their own scopes; a role at one installation does not grant it elsewhere.

| Action | Evaluator | Program Manager | MAJCOM Manager | Enterprise Admin |
| --- | --- | --- | --- | --- |
| Read training records | Own or explicitly assigned classes | Assigned installation | Assigned MAJCOM | Enterprise |
| Create classes | Assigned installation | Assigned installation | Requires a separate operational membership | Enterprise |
| Manage class metadata and roster | Own classes at assigned installation | Assigned installation | Requires a separate operational membership | Enterprise |
| Record assessments | Own/assigned event, with evaluator claim | Authorized event, with evaluator claim | Explicit evaluator assignment and claim | Evaluator claim; background sync does not overwrite another evaluator |
| Verify and close a class | No | Assigned installation | Requires a separate Program Manager membership | Enterprise |
| Delete or restore shared class trash | No | No | No | Yes, subject to lifecycle and synchronization checks |
| Remove a synced device copy | No | No | No | Yes, after exact class/roster/grading verification |
| Invite users, assign roles, review requests | No | No | No | Yes |
| Delete accounts | No | No | No | Other inactive accounts without retained operational history |
| Set/reset own password | Authenticated account or verified recovery link | Same | Same | Same |
| Modify standardized criteria/curriculum | No browser access | No browser access | No browser access | Trusted deployment/migration only |

Explicit class/event assignments can permit assessment work across installation
boundaries. They do not grant class administration or account administration.
The participant must already be visible through an authorized existing
assessment or the caller's installation access. Assignment alone does not make
every participant at another installation readable. The existing schema has no
separate participant-to-class enrollment relation; a new foreign roster needs
an authorized home-installation workflow before an assigned evaluator can
claim its first assessment.
Official criteria, scoring thresholds, timing standards, and claim/finalize/void
grading algorithms are unchanged.

Existing server administrative overrides for active assessments remain subject
to the hardened Enterprise check, parent lifecycle restrictions, and existing
auditing. Normal evaluator controls and background grading uploads require the
claim's evaluator; they do not silently use an administrator override.

## Device copies and shared deletion

**Remove Local Copy** under **Manage Training** removes the working copy from that
browser, including a closed class's device copy. It does not request deletion of
the shared class or its retained archive. Shared trash and archive-deletion
requests remain separate Enterprise actions.

Removal requires confirmed metadata, roster, and grading fingerprints, with no
pending delete/restore action, unresolved conflict, or assessment in progress.
The app checks actual content, not just a SYNCED badge. A failed storage write
keeps the local copy. A device exclusion prevents automatic synchronization from
immediately downloading it again; an explicit reload restores the server copy.
Another tab's unsent work is preserved.

Older unsent records without a verifiable creator remain on the device for
recovery. Signing in as another user does not claim those records or publish
them under that user's account. Enterprise recovery exports preserve the
original identifiers; restoring a backup does not duplicate existing classes.

## Identity, expiry, and offline work

Account administration, class management, and server synchronization require a
connected identity with currently valid memberships. Expired, future, malformed,
inactive, or incorrectly scoped memberships are rejected. Administrative reads
and writes bind to the initiating account; late responses after sign-out or an
account change cannot populate the next user's screens or continue a workflow.

During a temporary outage, an authorized evaluator can read cached training and
continue their own previously claimed assessment while the cached membership is
still valid. Starting, finalizing, voiding, and closing records require the
server. A disconnected device cannot discover a server-side revocation until it
reconnects; the server independently rejects revoked access. Browser storage is
a device cache, not a replacement for database authorization.

Account approval verifies the recipient's ID and email against Auth before
granting existing-account access. Public profile email is not an account identity
proof. Password recovery and verified email links do not grant a RaPS role.

## Deployment and verification

The website, Edge functions, and database permissions are separate deployments.
Merging the website alone does not install the database guards.

1. Back up the existing NUC database, functions, and Compose configuration.
2. Capture the deployed policies with
   `supabase/maintenance/capture-role-permissions.sh` and review the result.
3. Apply `20261017_account_permission_guards.sql`, then
   `20261017_operational_permission_guards.sql` using the database migration
   process. Their contract checks stop on unsupported schemas or duplicate
   installation. Do not run unrelated historical migrations.
4. Deploy the updated `admin-invite-user` and `admin-manage-user` functions.
   Retain handler authentication and the canonical GitHub Pages return URL.
5. Disable public Auth sign-up and enforce the server password minimum from
   [DEPLOYMENT.md](DEPLOYMENT.md). The supplied NUC configuration showed
   `GOTRUE_DISABLE_SIGNUP=false`; the required value is `true`. Recreate only the
   Auth service using its own recorded Compose files, then verify the running
   setting. These are server settings, separate from website publication.
6. Publish web.7 and confirm that both devices load that version.
7. Verify real accounts for every role: allowed scope, another scope, expired and
   revoked memberships, explicit evaluator assignment, sign-out during a pending
   request, invitation/approval, and local-copy removal/reload.

`tests/permissions.test.cjs` checks the client role matrix.
`tests/local-copy-permissions.test.cjs` checks cache-removal data safety.
The account and operational SQL suites run against isolated PostgreSQL fixtures;
the browser suites use synthetic learners and intercepted network requests.
They do not claim that the NUC has received unmerged migrations or that production
email delivery has been verified.
