# v3.4.12-web.6

- Add signed-in password changes with current-password verification and support for an Auth-server email verification code when required.
- Verify invitation/recovery links before password setup. Bind password writes to the verified account token, handle account changes across tabs, and resume verified setup after a reload without retaining link tokens.
- Improve recovery validation, resend cooldown, expired-link guidance, secret clearing, and authorization cleanup. A password change never grants a RaPS role.
- Add administrator setup/reset emails for approved existing accounts, explicit email-provider results, existing-account approval handling, and truthful partial-failure messages. Failed invitation cleanup preserves auth accounts.
- Check in the public access-request function and a service-role-only submission RPC with validation and atomic duplicate handling. Requests require administrator approval; public account registration remains disabled.
- Document self-hosted Auth, SMTP, redirects, templates, and deployment order. Updated functions and the reviewed RPC migration require deployment separately from GitHub Pages. Real email delivery remains to be checked with an authorized test recipient.
- Include the responsive typography and evaluator accessibility improvements from web.5. JTS criteria, grading rules, timing standards, and assessment lifecycle policies are unchanged.

Validation uses isolated browser workflows and stubbed backend handlers; it does not create production users, send emails, or apply SQL to the deployed database.
