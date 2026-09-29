begin;

-- Phase 7N-F1 follow-up.
-- This migration is intentionally safe to run as the local postgres role.
--
-- 1) Remove PostgreSQL 17 MAINTAIN plus TRUNCATE/REFERENCES/TRIGGER
--    from existing public tables for application roles.
-- 2) Harden postgres-owned default table privileges so future public
--    tables created by postgres do not regain those privileges.
--
-- supabase_admin owns a separate default ACL and postgres is not a member
-- of that role in this self-hosted Supabase deployment. Apply the companion
-- maintenance file as supabase_admin:
--   supabase/maintenance/20260929_phase7n_f1_supabase_admin_default_privileges.sql

do $$
declare
  r record;
begin
  for r in
    select format('%I.%I', schemaname, tablename) as fqtn
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'revoke truncate, references, trigger, maintain on table %s from anon, authenticated, service_role',
      r.fqtn
    );
  end loop;
end
$$;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables
  from anon, authenticated, service_role;

commit;
