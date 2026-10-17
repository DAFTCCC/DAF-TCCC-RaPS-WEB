-- Additive account-administration boundaries for the existing RaPS schema.
-- Review the deployed catalog with maintenance/20261017_role_permission_audit.sql
-- before applying. This does not replace any existing policy/helper, change a
-- clinical lifecycle function, grant table access, or modify existing records.
-- Unknown/incomplete contracts abort the entire transaction. Already installed
-- guards also abort; use the normal once-only migration ledger, not a blind rerun.
-- Existing permissive policies remain necessary for an operation to be allowed.
begin;
set local lock_timeout = '10s';

do $preflight$
declare
  required record;
  target text;
begin
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Apply account guards as the trusted database administrator with BYPASSRLS';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated')
    and (rolsuper or rolbypassrls)) then
    raise exception 'Browser database roles must not be superusers or bypass RLS';
  end if;
  if to_regnamespace('private') is null then
    raise exception 'Missing existing private schema; inspect the deployed RaPS schema first';
  end if;
  if has_schema_privilege('anon', 'private', 'CREATE')
    or has_schema_privilege('authenticated', 'private', 'CREATE') then
    raise exception 'Untrusted roles can create private-schema functions; review schema ownership first';
  end if;
  for required in select * from (values
    ('memberships','id','uuid'), ('memberships','user_id','uuid'),
    ('memberships','base_id','uuid'), ('memberships','majcom_id','uuid'),
    ('memberships','active','bool'), ('memberships','starts_at','timestamptz'),
    ('memberships','ends_at','timestamptz'), ('memberships','created_by','uuid'),
    ('memberships','created_at','timestamptz'),
    ('profiles','id','uuid'), ('profiles','email','text'), ('profiles','created_at','timestamptz'),
    ('bases','id','uuid'), ('bases','majcom_id','uuid'), ('bases','active','bool'),
    ('majcoms','id','uuid'), ('majcoms','active','bool'),
    ('access_requests','id','uuid'), ('access_requests','email','text'),
    ('access_requests','display_name','text'), ('access_requests','base_id','uuid'),
    ('access_requests','majcom_id','uuid'), ('access_requests','justification','text'),
    ('access_requests','created_at','timestamptz'), ('access_requests','reviewed_at','timestamptz'),
    ('access_requests','reviewed_by','uuid'), ('access_requests','review_note','text')
  ) as contract(table_name, column_name, type_name) loop
    if not exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
      where a.attrelid = to_regclass('public.' || required.table_name)
        and a.attname = required.column_name and not a.attisdropped
        and t.typname = required.type_name) then
      raise exception 'Unsupported contract: public.%.%', required.table_name, required.column_name;
    end if;
  end loop;
  for required in select * from (values ('memberships','role'),
    ('access_requests','requested_role'), ('access_requests','status')) as c(table_name,column_name) loop
    if not exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
      where a.attrelid = to_regclass('public.' || required.table_name)
        and a.attname = required.column_name and not a.attisdropped
        and (t.typname = 'text' or t.typtype = 'e')) then
      raise exception 'Unsupported role/status type: public.%.%', required.table_name, required.column_name;
    end if;
  end loop;
  foreach target in array array['memberships','access_requests','profiles'] loop
    if not exists (select 1 from pg_class where oid = to_regclass('public.' || target)
      and relkind = 'r' and relrowsecurity) then
      raise exception 'Missing enabled RLS on public.%', target;
    end if;
    if exists (select 1 from pg_class c join pg_roles r on r.oid = c.relowner
      where c.oid = to_regclass('public.' || target)
        and r.rolname in ('anon','authenticated')) then
      raise exception 'Browser database roles must not own public.%', target;
    end if;
    if not exists (select 1 from pg_policy where polrelid = to_regclass('public.' || target)
      and polpermissive) then
      raise exception 'Missing existing permissive policies on public.%', target;
    end if;
    if exists (select 1 from pg_policy where polrelid = to_regclass('public.' || target)
      and polname like 'raps_account_guard_%') then
      raise exception 'Account guards already exist on public.%; inspect the migration ledger', target;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in
      ('raps_account_is_enterprise_admin','raps_account_can_view_membership','raps_guard_membership_write','raps_guard_access_review','raps_guard_profile_write'))
    or exists (select 1 from pg_trigger where not tgisinternal
      and tgrelid in ('public.memberships'::regclass,'public.access_requests'::regclass,'public.profiles'::regclass)
      and tgname in ('raps_account_membership_write','raps_account_access_review','raps_account_profile_write')) then
    raise exception 'Account guard object already exists; no existing function or trigger was replaced';
  end if;
  if not exists (select 1 from public.memberships m
    where m.role::text = 'enterprise_admin' and m.active is true
      and m.base_id is null and m.majcom_id is null
      and (m.starts_at is null or m.starts_at <= statement_timestamp())
      and (m.ends_at is null or m.ends_at > statement_timestamp())) then
    raise exception 'No active global Enterprise Admin exists; repair administrator access through trusted maintenance before installing guards';
  end if;
end;
$preflight$;

create function private.raps_account_is_enterprise_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.role::text = 'enterprise_admin'
      and m.base_id is null and m.majcom_id is null and m.active is true
      and (m.starts_at is null or m.starts_at <= statement_timestamp())
      and (m.ends_at is null or m.ends_at > statement_timestamp())
  );
$function$;

-- Managers retain directory visibility within their current, valid scope.
-- The target row may be inactive historical access; the caller may not be.
create function private.raps_account_can_view_membership(p_user_id uuid, p_base_id uuid, p_majcom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and (
    p_user_id = auth.uid() or private.raps_account_is_enterprise_admin() or exists (
      select 1 from public.memberships caller
      where caller.user_id = auth.uid() and caller.active is true
        and (caller.starts_at is null or caller.starts_at <= statement_timestamp())
        and (caller.ends_at is null or caller.ends_at > statement_timestamp())
        and (
          (caller.role::text = 'program_manager' and caller.majcom_id is null
            and caller.base_id = p_base_id and exists (
              select 1 from public.bases b join public.majcoms m on m.id = b.majcom_id
              where b.id = caller.base_id and b.active is true and m.active is true))
          or (caller.role::text = 'majcom_manager' and caller.base_id is null
            and exists (select 1 from public.majcoms where id = caller.majcom_id and active is true)
            and (p_majcom_id = caller.majcom_id or exists (
              select 1 from public.bases where id = p_base_id and majcom_id = caller.majcom_id)))
        )
    )
  );
$function$;

-- A trigger also protects this boundary when a previously deployed SECURITY
-- DEFINER RPC writes memberships. RLS alone does not constrain definer owners.
-- Trusted service-role onboarding/cleanup and direct DB maintenance retain their
-- existing authority; no service key is ever given to a browser.
create function private.raps_guard_membership_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  request_role text := current_setting('role', true);
  old_effective_admin boolean := false;
  new_effective_admin boolean := false;
begin
  if request_role not in ('anon','authenticated') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if request_role <> 'authenticated' or actor is null then
    raise exception using errcode = '42501', message = 'Authenticated Enterprise Admin access required';
  end if;
  -- Serialize authorization and last-admin checks across concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended('raps:membership-guard:v1', 0));
  if not private.raps_account_is_enterprise_admin() then
    raise exception using errcode = '42501', message = 'Active Enterprise Admin access required';
  end if;
  if tg_op <> 'INSERT' then
    old_effective_admin := old.role::text = 'enterprise_admin' and old.active is true
      and old.base_id is null and old.majcom_id is null
      and (old.starts_at is null or old.starts_at <= statement_timestamp())
      and (old.ends_at is null or old.ends_at > statement_timestamp());
  end if;
  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE' and
      (to_jsonb(new) - array['active','starts_at','ends_at']) is distinct from
      (to_jsonb(old) - array['active','starts_at','ends_at']) then
      raise exception using errcode = '42501', message = 'Membership identity and attribution are immutable; deactivate and assign a new membership';
    end if;
    if tg_op = 'INSERT' then
      if new.created_by is not null and new.created_by <> actor then
        raise exception using errcode = '42501', message = 'Membership creator must be the acting administrator';
      end if;
      new.created_by := actor;
      new.created_at := statement_timestamp();
    end if;
    if tg_op = 'INSERT' or new.active is true then
      if new.role::text = 'enterprise_admin' then
        if new.base_id is not null or new.majcom_id is not null then
          raise exception using errcode = '22023', message = 'Enterprise Admin membership must be global';
        end if;
      elsif new.role::text = 'majcom_manager' then
        if new.base_id is not null or new.majcom_id is null or not exists
          (select 1 from public.majcoms where id = new.majcom_id and active is true) then
          raise exception using errcode = '22023', message = 'MAJCOM manager requires one active MAJCOM';
        end if;
      elsif new.role::text in ('program_manager','evaluator') then
        if new.majcom_id is not null or new.base_id is null or not exists
          (select 1 from public.bases b join public.majcoms m on m.id = b.majcom_id
            where b.id = new.base_id and b.active is true and m.active is true) then
          raise exception using errcode = '22023', message = 'This role requires one active installation within an active MAJCOM';
        end if;
      else
        raise exception using errcode = '22023', message = 'Unsupported RaPS role';
      end if;
      if new.starts_at is not null and new.ends_at is not null and new.ends_at <= new.starts_at then
        raise exception using errcode = '22023', message = 'Membership end must follow its start';
      end if;
    end if;
    new_effective_admin := new.role::text = 'enterprise_admin' and new.active is true
      and new.base_id is null and new.majcom_id is null
      and (new.starts_at is null or new.starts_at <= statement_timestamp())
      and (new.ends_at is null or new.ends_at > statement_timestamp());
  end if;
  if old_effective_admin and not new_effective_admin then
    if old.user_id = actor then
      raise exception using errcode = '42501', message = 'Ask another active Enterprise Admin to remove your administrator access';
    end if;
    if not exists (select 1 from public.memberships m where m.id <> old.id
      and m.role::text = 'enterprise_admin' and m.active is true
      and m.base_id is null and m.majcom_id is null
      and (m.starts_at is null or m.starts_at <= statement_timestamp())
      and (m.ends_at is null or m.ends_at > statement_timestamp())) then
      raise exception using errcode = '42501', message = 'The last active Enterprise Admin cannot be removed';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;

create function private.raps_guard_access_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('role', true) not in ('anon','authenticated') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if current_setting('role', true) <> 'authenticated' or auth.uid() is null
    or not private.raps_account_is_enterprise_admin() then
    raise exception using errcode = '42501', message = 'Active Enterprise Admin access required';
  end if;
  if tg_op <> 'UPDATE' then
    raise exception using errcode = '42501', message = 'Browser clients may review existing access requests only';
  end if;
  if (to_jsonb(new) - array['status','reviewed_at','reviewed_by','review_note']) is distinct from
    (to_jsonb(old) - array['status','reviewed_at','reviewed_by','review_note']) then
    raise exception using errcode = '42501', message = 'The submitted access request is immutable';
  end if;
  if old.status::text <> 'pending' or new.status::text not in ('approved','denied') then
    raise exception using errcode = '22023', message = 'Only pending access requests can be approved or denied';
  end if;
  if new.reviewed_by is not null and new.reviewed_by <> auth.uid() then
    raise exception using errcode = '42501', message = 'Request reviewer must be the acting administrator';
  end if;
  new.reviewed_by := auth.uid();
  new.reviewed_at := statement_timestamp();
  return new;
end;
$function$;

-- A profile email is an Auth-managed directory value, never proof that its
-- owner controls that address. Existing request approval must independently
-- verify Auth's account email before assigning access; this guard prevents
-- further directory spoofing without rewriting legacy profiles.
create function private.raps_guard_profile_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('role', true) not in ('anon','authenticated') then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if current_setting('role', true) <> 'authenticated' or auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authenticated profile access required';
  end if;
  if tg_op <> 'UPDATE' then
    raise exception using errcode = '42501', message = 'Account provisioning and deletion require the trusted account service';
  end if;
  if old.id <> auth.uid() then
    raise exception using errcode = '42501', message = 'You may edit only your own profile';
  end if;
  if (to_jsonb(new) - array['display_name','rank_text','organization_text','updated_at']) is distinct from
    (to_jsonb(old) - array['display_name','rank_text','organization_text','updated_at']) then
    raise exception using errcode = '42501', message = 'Account identity, email, and creation metadata are managed by the account service';
  end if;
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at',statement_timestamp()));
  end if;
  return new;
end;
$function$;

revoke all on function private.raps_account_is_enterprise_admin() from public, anon, authenticated, service_role;
grant execute on function private.raps_account_is_enterprise_admin() to authenticated;
revoke all on function private.raps_account_can_view_membership(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function private.raps_account_can_view_membership(uuid,uuid,uuid) to authenticated;
revoke all on function private.raps_guard_membership_write() from public, anon, authenticated, service_role;
revoke all on function private.raps_guard_access_review() from public, anon, authenticated, service_role;
revoke all on function private.raps_guard_profile_write() from public, anon, authenticated, service_role;

create trigger raps_account_membership_write before insert or update or delete on public.memberships
for each row execute function private.raps_guard_membership_write();
create trigger raps_account_access_review before insert or update or delete on public.access_requests
for each row execute function private.raps_guard_access_review();
create trigger raps_account_profile_write before insert or update or delete on public.profiles
for each row execute function private.raps_guard_profile_write();

create policy raps_account_guard_membership_read on public.memberships as restrictive for select to authenticated
using (private.raps_account_can_view_membership(user_id,base_id,majcom_id));
create policy raps_account_guard_membership_anon on public.memberships as restrictive for all to anon
using (false) with check (false);
create policy raps_account_guard_membership_insert on public.memberships as restrictive for insert to authenticated
with check (private.raps_account_is_enterprise_admin());
create policy raps_account_guard_membership_update on public.memberships as restrictive for update to authenticated
using (private.raps_account_is_enterprise_admin()) with check (private.raps_account_is_enterprise_admin());
create policy raps_account_guard_membership_delete on public.memberships as restrictive for delete to authenticated
using (private.raps_account_is_enterprise_admin());
create policy raps_account_guard_request_read on public.access_requests as restrictive for select to authenticated
using (private.raps_account_is_enterprise_admin());
create policy raps_account_guard_request_anon on public.access_requests as restrictive for all to anon
using (false) with check (false);
create policy raps_account_guard_request_insert on public.access_requests as restrictive for insert to authenticated
with check (false);
create policy raps_account_guard_request_update on public.access_requests as restrictive for update to authenticated
using (private.raps_account_is_enterprise_admin()) with check (private.raps_account_is_enterprise_admin());
create policy raps_account_guard_request_delete on public.access_requests as restrictive for delete to authenticated
using (false);

commit;
