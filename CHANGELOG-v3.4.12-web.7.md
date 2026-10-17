# v3.4.12-web.7

- Add Enterprise **Remove Local Copy** to **Manage Training** for active, trashed, and closed classes. Removal requires exact confirmed metadata, roster, and grading content, retains other tabs' unsent work, and prevents automatic re-download until explicit reload.
- Enforce current role memberships, dates, installation/MAJCOM scope, evaluator ownership, and explicit assignments across navigation, reports, exports, administration, and synchronization. Preserve unsent legacy records with unknown ownership for recovery.
- Bind asynchronous requests to the initiating account and token. Clear stale screens after account changes and reject continuations after access changes.
- Verify existing-account identity against Auth before assigning access. Harden administrative request validation, revocation checks, account deletion, and partial-failure reporting.
- Add database guards against stale creator/assignment access, cross-scope relationships, membership escalation, profile identity changes, and direct lifecycle writes. Keep standardized criteria and curriculum read-only to browser roles.
- Include isolated role, account, synchronization, and PostgreSQL regression suites and document the role matrix in [PERMISSIONS.md](PERMISSIONS.md).

JTS criteria, scoring thresholds, timing standards, and clinical grading algorithms are unchanged. The database migrations and updated administrative functions require separate deployment on the existing NUC; website publication does not apply them. Production email delivery and real-device role checks remain deployment checks.

Validation on 2026-10-17: all 601 Node tests passed with no skipped tests;
both isolated PostgreSQL 17.6 suites passed for enum and text schemas, including
concurrent revocation and migration preflights. Intercepted Chromium checks
passed 24 evaluator-workflow groups, 40 authentication-flow groups, 11
accessibility groups, 87 responsive layouts, and 572 account-layout checks,
with no unexpected requests or page errors.
