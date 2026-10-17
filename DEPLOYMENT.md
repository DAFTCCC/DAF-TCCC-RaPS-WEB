# Web/PWA and account deployment

The frontend is a static GitHub Pages site. In **Settings → Pages**, select **Deploy from a branch**, `main`, and `/(root)`. Deploy the release files together so the HTML, scripts, and service worker use the same version. There is no frontend build step.

The app stores working records on the device and synchronizes authorized records with Supabase. Reopening a cached shell offline does not make account administration, password changes, or server assessment actions available offline.

## Account and email configuration

Keep public sign-up disabled. A person requests access; an Enterprise Admin approves the request or invites them directly and assigns the approved role and scope. The person follows the invitation to set their own password. Requesting access, verifying an email link, or setting a password does not itself grant a RaPS role.

For an existing account, assign any missing approved access through **Assign Access to Existing Account**, then use **Send Setup / Reset Email**. This sends a recovery link for the existing account; it does not create a duplicate account or change its memberships. Users can also request their own recovery link from **Forgot password?**.

Configure the following in the deployed Auth service and Edge Function environment. For self-hosted Supabase, edit the host's secret environment/configuration and restart the affected services; frontend GitHub Pages deployment cannot change these settings.

| Setting | Required value |
| --- | --- |
| `API_EXTERNAL_URL` | The public HTTPS Supabase API base URL, reachable from the recipient's device. This is different from the app URL. |
| `SITE_URL` / `GOTRUE_SITE_URL` | The canonical public app URL, including its deployment path and trailing slash. |
| `RAPS_SITE_URL` | The same canonical app URL, supplied to `admin-invite-user`. For example, `https://your-host.example/DAF-TCCC-RaPS-WEB/`; do not omit the repository path on GitHub Pages. |
| `ADDITIONAL_REDIRECT_URLS` / `GOTRUE_URI_ALLOW_LIST` | Allow the exact invitation and recovery destinations under that app URL, including `?raps_activation=1` and any configured `type` query. Include an `index.html` form only if users actually open that address. Avoid unrestricted production wildcards. |
| `DISABLE_SIGNUP` / `GOTRUE_DISABLE_SIGNUP` | `true`; use the administrator invitation flow. |
| `GOTRUE_PASSWORD_MIN_LENGTH` | At least `12`, matching the app's minimum. Set any additional password policy on the Auth server. |
| SMTP configuration | A working SMTP host, port, credentials, sender address, and sender name. The standard self-hosted Compose variables are `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, and `SMTP_SENDER_NAME`; they map to the corresponding `GOTRUE_SMTP_*` settings. |

The names on either side of `/` represent the standard Compose variable and Auth service variable where applicable. Check the installed Supabase Compose file and Auth version for the actual mapping. Do not put SMTP passwords, a service-role key, or administrative credentials in `supabase-config.js` or any frontend file. The frontend configuration contains only the public API URL and publishable key.

Use the default invitation and recovery templates' `{{ .ConfirmationURL }}` links, or a custom link to the canonical app URL carrying `token_hash={{ .TokenHash }}` and the matching `type=invite` or `type=recovery`. A custom template must preserve the app's deployment path. Do not replace the verification link with a bare `?raps_activation=1` URL: that marker alone is not proof of email verification. Treat complete invitation/recovery URLs as secrets; do not paste them into logs or support tickets.

If secure password change requires a fresh email code on your Auth server, retain that policy. The app supports sending a reauthentication code and including it with the password update. A signed-in user must also enter their current password. A forgotten password uses the recovery email flow instead.

## Deploy the account endpoints

The deployment requires the existing RaPS schema, profile creation behavior, membership/admin policies, and audit table. Apply the reviewed `supabase/migrations/20261017_access_request_submission.sql` migration before deploying `request-access`; it adds a service-role-only submission RPC over the existing access-request table. It does not create accounts or grant roles. Apply it through the environment's normal migration process; do not run unrelated historical SQL blindly against an existing database.

Deploy these checked-in functions with server-side `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` available. Supply `RAPS_SITE_URL` to the invitation function. The public request endpoint returns the organizational catalog and accepts pending requests. Protect it with gateway/IP rate limits; per-email duplicate handling does not prevent automated abuse.

Deploy the updated `admin-invite-user` function before publishing the web.6 frontend. The updated UI requires its explicit email-acceptance result; an older function will produce a service-contract error rather than a success message.

Access assignment, email requests, and review-status updates are separate operations. If another administrator reviews the same request concurrently, completion can report an incomplete approval after access or email succeeded. Review the account's memberships and request status before retrying; approval across these services is not transactional.

For a Supabase CLI-managed project, after authenticating and linking the intended project:

```sh
supabase functions deploy request-access --no-verify-jwt
supabase functions deploy admin-invite-user --no-verify-jwt
```

`request-access` must accept unauthenticated requests. The invitation function validates the caller's bearer token with Auth and requires an active Enterprise Admin membership inside the handler. Disabling legacy gateway JWT verification allows deployments using publishable keys; it does not remove that handler authorization. Never expose an administrative handler that lacks this server-side check.

For a self-hosted deployment, use the host's Edge Runtime deployment procedure instead of assuming CLI hosted-project commands will reach it. Install the corresponding function directories, configure routing/JWT verification for these endpoints, provide the server environment, and restart/reload Edge Runtime as required by that installation. Keep unrelated function authorization settings unchanged.

## Verify before calling account email ready

Automated tests use synthetic accounts and intercepted email/API calls. They do not prove production SMTP delivery or deployed Auth configuration. No Supabase administrative or SMTP credentials were available in the development environment, and no production email was sent.

With an authorized test recipient, verify the deployed app and backend together:

1. Submit an access request, approve it, and follow the delivered invitation on another device. Check the app path, assigned role/scope, and password setup.
2. Request a password reset from Sign In, follow the delivered recovery link, set a password, and sign in with it. Reusing or expiring the link must not open password setup for another existing session.
3. Use **Change password** while signed in. Check an incorrect current password, a successful change, and the email-code path if enabled on the Auth server.
4. Confirm that a person with no active membership receives an access message, and that an unauthenticated/non-admin caller cannot invoke administrative invitation actions.
5. Confirm SMTP provider acceptance and actual inbox delivery separately; an API success is not a delivery receipt. Check expired-link and provider error messages without sharing tokens or passwords.
