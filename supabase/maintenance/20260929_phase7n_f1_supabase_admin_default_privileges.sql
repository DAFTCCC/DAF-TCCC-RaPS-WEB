begin;

-- Phase 7N-F1 companion maintenance step.
-- Execute this file while connected as supabase_admin so that
-- supabase_admin-owned future public tables do not grant high-risk
-- privileges to application roles.

alter default privileges for role supabase_admin in schema public
  revoke truncate, references, trigger, maintain on tables
  from anon, authenticated, service_role;

commit;
