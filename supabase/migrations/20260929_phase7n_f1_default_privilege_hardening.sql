begin;

-- Phase 7N-F1 follow-up:
-- 1) remove PostgreSQL 17 MAINTAIN plus TRUNCATE/REFERENCES/TRIGGER
--    from existing public tables for application roles;
-- 2) harden default table privileges for the roles that create RaPS
--    public tables so future tables do not regain those privileges.

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

alter default privileges for role supabase_admin in schema public
  revoke truncate, references, trigger, maintain on tables
  from anon, authenticated, service_role;

commit;
