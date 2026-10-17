-- Read-only RaPS authorization inventory. Run as the local postgres role.
-- This reads catalog metadata and function source, never learner/account rows,
-- Auth tokens, Docker environment variables, or stored audit payloads.
-- Function definitions can contain administrator-authored literals: keep this
-- report private and review those definitions before sharing it publicly.
\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on
begin read only;
set local statement_timeout = '20s';

select jsonb_build_object('section', 'database', 'version', current_setting('server_version'));

select jsonb_build_object('section', 'roles', 'items', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb))
from (
  select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls,
    array(select parent.rolname from pg_auth_members a join pg_roles parent on parent.oid = a.roleid
      where a.member = pg_roles.oid order by parent.rolname) as inherited_roles
  from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')
  order by rolname
) r;

select jsonb_build_object('section', 'relations', 'items', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb))
from (
  select n.nspname as schema_name, c.relname, c.relkind, pg_get_userbyid(c.relowner) as owner,
    c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
    (select jsonb_object_agg(role_name, rights) from (
      select role_name, (select jsonb_object_agg(privilege, has_table_privilege(role_name, c.oid, privilege))
        from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege) as rights
      from unnest(array['anon','authenticated','service_role']) role_name
    ) grants) as effective_privileges,
    case when c.relkind in ('v','m') then pg_get_viewdef(c.oid, true) end as view_definition,
    c.reloptions
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
  order by c.relname
) r;

select jsonb_build_object('section', 'policies', 'items', coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb))
from (
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies where schemaname in ('public','private')
  order by schemaname, tablename, policyname
) p;

select jsonb_build_object('section', 'columns', 'items', coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb))
from (
  select table_schema, table_name, column_name, udt_schema, udt_name, is_nullable,
    column_default, is_generated, is_identity
  from information_schema.columns where table_schema = 'public'
  order by table_name, ordinal_position
) c;

select jsonb_build_object('section', 'functions', 'items', coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb))
from (
  select n.nspname as schema_name, p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as returns, pg_get_userbyid(p.proowner) as owner,
    p.prosecdef as security_definer, p.proconfig as settings, p.provolatile as volatility,
    md5(pg_get_functiondef(p.oid)) as definition_md5,
    pg_get_functiondef(p.oid) as definition,
    (select jsonb_object_agg(role_name, has_function_privilege(role_name, p.oid, 'EXECUTE'))
      from unnest(array['anon','authenticated','service_role']) role_name) as effective_execute
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private') and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass
      and d.objid = p.oid and d.deptype = 'e')
  order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
) f;

select jsonb_build_object('section', 'triggers', 'items', coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb))
from (
  select n.nspname as schema_name, c.relname as table_name, t.tgname, t.tgenabled,
    pg_get_triggerdef(t.oid, true) as definition
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
  order by c.relname, t.tgname
) t;

select jsonb_build_object('section', 'constraints', 'items', coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb))
from (
  select n.nspname as schema_name, r.relname as table_name, c.conname,
    pg_get_constraintdef(c.oid, true) as definition
  from pg_constraint c join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
  where n.nspname = 'public' order by r.relname, c.conname
) c;

commit;
