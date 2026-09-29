begin;

-- Phase 7N-F1 least-privilege hardening.
-- Preserve normal CRUD privileges and RLS behavior while removing
-- table privileges that are unnecessary for application roles and
-- are not governed by row-level security in the same way as DML.

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
      'revoke truncate, references, trigger on table %s from anon, authenticated, service_role',
      r.fqtn
    );
  end loop;
end
$$;

commit;
