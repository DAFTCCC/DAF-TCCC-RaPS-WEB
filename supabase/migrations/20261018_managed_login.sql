-- Managed usernames and one-use temporary credentials. Apply only after the
-- reviewed account/operational guards. No Auth triggers or clinical algorithms
-- are changed. Provisioning RPCs are callable by the trusted Edge service only.
-- A pending, issuing, or changing account is denied even with a valid Auth JWT.
begin;
set local lock_timeout = '10s';

do $preflight$
declare target text; item record;
begin
  if not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Apply managed login as the trusted BYPASSRLS database administrator';
  end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Browser roles may not bypass row security';
  end if;
  if to_regprocedure('private.raps_ops_memberships()') is null
    or to_regprocedure('private.raps_account_is_enterprise_admin()') is null
    or to_regprocedure('private.raps_account_can_view_membership(uuid,uuid,uuid)') is null then
    raise exception 'Apply the reviewed account and operational permission guards first';
  end if;
  if to_regclass('private.raps_managed_logins') is not null
    or to_regclass('private.raps_managed_login_limits') is not null
    or to_regclass('private.raps_managed_login_sessions') is not null
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where (n.nspname='private' and p.proname like 'raps_login_%')
         or (n.nspname='public' and p.proname like 'raps_managed_%')) then
    raise exception 'Managed login objects already exist; inspect the migration ledger';
  end if;
  for item in select * from (values
    ('profiles','id','uuid'),('profiles','email','text'),('profiles','display_name','text'),
    ('audit_log','actor_user_id','uuid'),('audit_log','action','text'),
    ('audit_log','entity_type','text'),('audit_log','entity_id','uuid'),('audit_log','new_value','jsonb')
  ) c(table_name,column_name,type_name) loop
    if not exists(select 1 from pg_attribute a join pg_type t on t.oid=a.atttypid
      where a.attrelid=to_regclass('public.'||item.table_name) and a.attname=item.column_name
        and not a.attisdropped and t.typname=item.type_name) then
      raise exception 'Unsupported managed login contract: public.%.%',item.table_name,item.column_name;
    end if;
  end loop;
  foreach target in array array['classes','evaluation_events','evaluations','participants',
    'class_evaluators','event_evaluators','criterion_results','timer_results','profiles','memberships',
    'access_requests','bases','majcoms','criteria','curriculum_versions','scenarios','audit_log','closed_class_archives'] loop
    if not exists(select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid=to_regclass('public.'||target) and c.relkind='r' and c.relrowsecurity
        and r.rolname not in ('anon','authenticated')) then
      raise exception 'Expected trusted ownership and enabled RLS on public.%',target;
    end if;
    if exists(select 1 from pg_policy where polrelid=to_regclass('public.'||target)
      and polname='raps_managed_login_session') then
      raise exception 'Managed login guard already exists on public.%',target;
    end if;
  end loop;
  if has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE') then
    raise exception 'Browser roles must not create private-schema objects';
  end if;
end;
$preflight$;

create table private.raps_managed_logins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null unique check(username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  state text not null check(state in ('issuing','pending','changing','active')),
  temp_password_digest text not null check(temp_password_digest ~ '^[a-f0-9]{64}$'),
  password_salt text check(password_salt ~ '^[a-f0-9]{32}$'),
  password_verifier text check(password_verifier ~ '^[a-f0-9]{64}$'),
  temporary_expires_at timestamptz,
  token_not_before bigint not null default 0 check(token_not_before>=0),
  credential_version uuid not null default gen_random_uuid(),
  operation_started_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check(state<>'pending' or temporary_expires_at is not null),
  check(state<>'active' or (password_salt is not null and password_verifier is not null))
);
create table private.raps_managed_login_sessions (
  session_id uuid primary key,
  user_id uuid not null references private.raps_managed_logins(user_id) on delete cascade,
  credential_version uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index on private.raps_managed_login_sessions(user_id);
create table private.raps_managed_login_limits (
  key_digest text primary key check(key_digest ~ '^[a-f0-9]{64}$'),
  window_ends_at timestamptz not null,
  attempts bigint not null check(attempts>0)
);
alter table private.raps_managed_logins enable row level security;
alter table private.raps_managed_login_limits enable row level security;
alter table private.raps_managed_login_sessions enable row level security;
revoke all on private.raps_managed_logins,private.raps_managed_login_limits,private.raps_managed_login_sessions from public,anon,authenticated,service_role;

-- JWT claims are set by PostgREST after signature validation. Malformed/missing
-- issuance times fail closed for managed accounts; legacy accounts are unchanged.
create function private.raps_login_jwt_iat()
returns bigint language plpgsql stable security definer set search_path='' as $function$
declare claims jsonb; issued text;
begin
  claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
  issued:=claims->>'iat';
  if issued is null or issued !~ '^[0-9]{1,18}$' then return null; end if;
  return issued::bigint;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$function$;
create function private.raps_login_session_usable(p_user_id uuid,p_iat bigint)
returns boolean language plpgsql stable security definer set search_path='' as $function$
declare managed private.raps_managed_logins%rowtype; marker boolean:=false; claims jsonb;
begin
  if p_user_id is null then return false; end if;
  select * into managed from private.raps_managed_logins where user_id=p_user_id;
  if found then
    if managed.state<>'active' or p_iat is null or p_iat<managed.token_not_before then return false; end if;
    if current_setting('role',true)='authenticated' and p_user_id=auth.uid() then
      begin
        claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
        return coalesce(claims->'app_metadata'->>'raps_managed_login'='true',false)
          and coalesce(claims->'app_metadata'->>'raps_managed_credential_version'=managed.credential_version::text,false)
          and exists(select 1 from private.raps_managed_login_sessions proof
            where proof.session_id::text=claims->>'session_id' and proof.user_id=p_user_id
              and proof.credential_version=managed.credential_version);
      exception when invalid_text_representation then return false; end;
    end if;
    return true;
  end if;
  if p_user_id=auth.uid() then
    begin
      marker:=coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb
        ->'app_metadata'->>'raps_managed_login')='true',false);
    exception when invalid_text_representation then return false;
    end;
  end if;
  return not marker;
end;
$function$;
create function private.raps_login_current_session_usable()
returns boolean language sql stable security definer set search_path='' as $function$
  select private.raps_login_session_usable(auth.uid(),private.raps_login_jwt_iat());
$function$;

-- These existing authorization helpers retain their role/scope behavior and gain
-- only the trusted credential gate. Public lifecycle RPCs reach these helpers.
create or replace function private.raps_ops_memberships()
returns setof public.memberships language sql stable security definer set search_path='' as $function$
  select m.* from public.memberships m
  where private.raps_login_current_session_usable() and m.user_id=auth.uid() and m.active is true
    and (m.starts_at is null or m.starts_at<=statement_timestamp())
    and (m.ends_at is null or m.ends_at>statement_timestamp())
    and (m.starts_at is null or m.ends_at is null or m.ends_at>m.starts_at)
    and (
      (m.role::text='enterprise_admin' and m.base_id is null and m.majcom_id is null)
      or (m.role::text='majcom_manager' and m.base_id is null and m.majcom_id is not null
        and exists(select 1 from public.majcoms j where j.id=m.majcom_id and j.active is true))
      or (m.role::text in ('evaluator','program_manager') and m.base_id is not null and m.majcom_id is null
        and exists(select 1 from public.bases b join public.majcoms j on j.id=b.majcom_id
          where b.id=m.base_id and b.active is true and j.active is true))
    );
$function$;
create or replace function private.raps_account_is_enterprise_admin()
returns boolean language sql stable security definer set search_path='' as $function$
  select private.raps_login_current_session_usable() and exists (
    select 1 from public.memberships m where m.user_id=auth.uid() and m.role::text='enterprise_admin'
      and m.base_id is null and m.majcom_id is null and m.active is true
      and (m.starts_at is null or m.starts_at<=statement_timestamp())
      and (m.ends_at is null or m.ends_at>statement_timestamp()));
$function$;
create or replace function private.raps_account_can_view_membership(p_user_id uuid,p_base_id uuid,p_majcom_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.raps_login_current_session_usable() and (
    p_user_id=auth.uid() or private.raps_account_is_enterprise_admin() or exists (
      select 1 from public.memberships caller where caller.user_id=auth.uid() and caller.active is true
        and (caller.starts_at is null or caller.starts_at<=statement_timestamp())
        and (caller.ends_at is null or caller.ends_at>statement_timestamp())
        and ((caller.role::text='program_manager' and caller.majcom_id is null and caller.base_id=p_base_id
          and exists(select 1 from public.bases b join public.majcoms m on m.id=b.majcom_id
            where b.id=caller.base_id and b.active is true and m.active is true))
          or (caller.role::text='majcom_manager' and caller.base_id is null
            and exists(select 1 from public.majcoms where id=caller.majcom_id and active is true)
            and (p_majcom_id=caller.majcom_id or exists(select 1 from public.bases
              where id=p_base_id and majcom_id=caller.majcom_id))))));
$function$;

-- SECURITY DEFINER writes bypass RLS, so row guards apply the credential gate
-- using the original request role as well. There is no client-set bypass flag.
create function private.raps_login_guard_write()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if current_setting('role',true) in ('anon','authenticated')
    and not private.raps_login_current_session_usable() then
    raise exception using errcode='42501',message='Complete managed password setup and sign in again';
  end if;
  -- Pending administrators must not count as a recovery path when an existing
  -- account guard checks that one active Enterprise Administrator remains.
  if tg_table_name='memberships' and current_setting('role',true)='authenticated' and tg_op<>'INSERT' then
    if old.role::text='enterprise_admin' and old.active is true and old.base_id is null and old.majcom_id is null
      and (old.starts_at is null or old.starts_at<=statement_timestamp())
      and (old.ends_at is null or old.ends_at>statement_timestamp()) then
      if tg_op='DELETE' or not (new.role::text='enterprise_admin' and new.active is true
        and new.base_id is null and new.majcom_id is null
        and (new.starts_at is null or new.starts_at<=statement_timestamp())
        and (new.ends_at is null or new.ends_at>statement_timestamp())) then
        if not exists(select 1 from public.memberships m where m.id<>old.id
          and m.role::text='enterprise_admin' and m.active is true and m.base_id is null and m.majcom_id is null
          and (m.starts_at is null or m.starts_at<=statement_timestamp())
          and (m.ends_at is null or m.ends_at>statement_timestamp())
          and not exists(select 1 from private.raps_managed_logins l where l.user_id=m.user_id and l.state<>'active')) then
          raise exception using errcode='42501',message='The last usable Enterprise Administrator cannot be removed';
        end if;
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
do $guards$
declare target text;
begin
  foreach target in array array['classes','evaluation_events','evaluations','participants',
    'class_evaluators','event_evaluators','criterion_results','timer_results','profiles','memberships',
    'access_requests','bases','majcoms','criteria','curriculum_versions','scenarios','audit_log','closed_class_archives'] loop
    execute format('create policy raps_managed_login_session on public.%I as restrictive for all to authenticated using(private.raps_login_current_session_usable()) with check(private.raps_login_current_session_usable())',target);
    execute format('create trigger raps_login_session_write before insert or update or delete on public.%I for each row execute function private.raps_login_guard_write()',target);
  end loop;
end;
$guards$;

-- Every Edge-only RPC also verifies the original PostgREST role. SECURITY DEFINER
-- changes current_user, not current_setting('role'), so a browser cannot invoke
-- these by acquiring an accidental EXECUTE grant or by supplying an actor UUID.
create function private.raps_login_require_service()
returns void language plpgsql security definer set search_path='' as $function$
begin
  if current_setting('role',true) is distinct from 'service_role' then
    raise exception using errcode='42501',message='Trusted managed-login service required';
  end if;
end;
$function$;
create function private.raps_login_require_admin(p_actor_id uuid,p_actor_iat bigint)
returns void language plpgsql volatile security definer set search_path='' as $function$
begin
  perform private.raps_login_require_service();
  -- Same lock as the account guard: authorization is rechecked after an in-flight
  -- revocation commits. This volatile statement sees the current committed state.
  perform pg_advisory_xact_lock(hashtextextended('raps:membership-guard:v1',0));
  if not private.raps_login_session_usable(p_actor_id,p_actor_iat) or not exists(
    select 1 from public.memberships m where m.user_id=p_actor_id and m.role::text='enterprise_admin'
      and m.base_id is null and m.majcom_id is null and m.active is true
      and (m.starts_at is null or m.starts_at<=clock_timestamp())
      and (m.ends_at is null or m.ends_at>clock_timestamp())) then
    raise exception using errcode='42501',message='Current Enterprise Administrator access required';
  end if;
end;
$function$;
create function public.raps_managed_lookup(p_username text)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare m private.raps_managed_logins%rowtype;
begin
  perform private.raps_login_require_service();
  select * into m from private.raps_managed_logins where username=p_username;
  if not found then return null; end if;
  return jsonb_build_object('user_id',m.user_id,'username',m.username,'state',m.state,
    'temporary_expires_at',m.temporary_expires_at,'credential_version',m.credential_version);
end;
$function$;
create function public.raps_managed_status(p_user_id uuid,p_iat bigint,p_session_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare m private.raps_managed_logins%rowtype;
begin
  perform private.raps_login_require_service();
  select * into m from private.raps_managed_logins where user_id=p_user_id;
  if not found then return jsonb_build_object('managed',false,'session_usable',p_user_id is not null); end if;
  return jsonb_build_object('managed',true,'user_id',m.user_id,'username',m.username,'state',m.state,
    'password_change_required',m.state<>'active','temporary_expires_at',m.temporary_expires_at,
    'session_usable',private.raps_login_session_usable(p_user_id,p_iat) and exists(
      select 1 from private.raps_managed_login_sessions proof where proof.session_id=p_session_id
        and proof.user_id=p_user_id and proof.credential_version=m.credential_version),
    'credential_version',m.credential_version,'temporary_password_digest',m.temp_password_digest,
    'password_salt',m.password_salt,'password_verifier',m.password_verifier,
    'token_not_before',m.token_not_before);
end;
$function$;
-- Auth remains the identity provider, while only a password verified by this
-- trusted service can authorize an application session. Direct Auth password
-- mutations/sign-ins, including stale temporary JWTs, cannot manufacture proof.
create function public.raps_managed_register_session(p_user_id uuid,p_iat bigint,p_session_id uuid,p_version uuid)
returns void language plpgsql volatile security definer set search_path='' as $function$
declare m private.raps_managed_logins%rowtype;
begin
  perform private.raps_login_require_service();
  select * into m from private.raps_managed_logins where user_id=p_user_id for update;
  if not found or m.state<>'active' or m.credential_version is distinct from p_version
    or p_iat is null or p_iat<m.token_not_before or p_session_id is null then
    raise exception using errcode='42501',message='A current verified permanent-password sign-in is required';
  end if;
  insert into private.raps_managed_login_sessions(session_id,user_id,credential_version)
    values(p_session_id,p_user_id,p_version) on conflict(session_id) do nothing;
  -- A password-authenticated user may retain several devices, with a finite
  -- proof budget. Refreshing an existing Auth session retains its proof.
  delete from private.raps_managed_login_sessions where session_id in (
    select session_id from private.raps_managed_login_sessions where user_id=p_user_id
      order by created_at desc,session_id desc offset 20);
end;
$function$;
create function public.raps_managed_list(p_actor_id uuid,p_actor_iat bigint,p_offset integer default 0,p_limit integer default 500)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
begin
  perform private.raps_login_require_admin(p_actor_id,p_actor_iat);
  if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>500 then
    raise exception using errcode='22023',message='Invalid managed-account page';
  end if;
  return jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.user_id,'username',m.username,'password_change_required',m.state<>'active',
    'temporary_expires_at',m.temporary_expires_at) order by m.username)
    from (select * from private.raps_managed_logins order by username,user_id offset p_offset limit p_limit) m),'[]'::jsonb),
    'next_offset',case when exists(select 1 from private.raps_managed_logins
      order by username,user_id offset p_offset+p_limit limit 1) then p_offset+p_limit else null end);
end;
$function$;
create function public.raps_managed_create(p_actor_id uuid,p_actor_iat bigint,p_user_id uuid,
  p_username text,p_digest text,p_email text,p_display_name text,p_role text,p_base_id uuid,p_majcom_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare version uuid:=gen_random_uuid(); role_type text;
begin
  perform private.raps_login_require_admin(p_actor_id,p_actor_iat);
  if p_user_id is null or p_user_id=p_actor_id or p_username is null
    or p_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$'
    or p_digest is null or p_digest !~ '^[a-f0-9]{64}$'
    or p_email is distinct from p_username||'@login.raps.invalid'
    or btrim(coalesce(p_display_name,''))='' or char_length(p_display_name)>120 then
    raise exception using errcode='22023',message='Invalid managed-account identity';
  end if;
  if p_role='enterprise_admin' then
    if p_base_id is not null or p_majcom_id is not null then
      raise exception using errcode='22023',message='Enterprise access must be global';
    end if;
  elsif p_role='majcom_manager' then
    if p_base_id is not null or p_majcom_id is null or not exists(
      select 1 from public.majcoms where id=p_majcom_id and active is true) then
      raise exception using errcode='22023',message='Select an active MAJCOM';
    end if;
  elsif p_role in ('program_manager','evaluator') then
    if p_majcom_id is not null or p_base_id is null or not exists(
      select 1 from public.bases b join public.majcoms j on j.id=b.majcom_id
        where b.id=p_base_id and b.active is true and j.active is true) then
      raise exception using errcode='22023',message='Select an active installation';
    end if;
  else
    raise exception using errcode='22023',message='Unsupported managed-account role';
  end if;
  -- The Auth service may already have created the profile through its existing
  -- provisioning flow. Never adopt an existing identity or its memberships.
  if exists(select 1 from public.memberships where user_id=p_user_id)
    or exists(select 1 from private.raps_managed_logins where user_id=p_user_id)
    or exists(select 1 from public.profiles where id=p_user_id and email is distinct from p_email) then
    raise exception using errcode='22023',message='Managed accounts require a new matching identity';
  end if;
  insert into public.profiles(id,email,display_name) values(p_user_id,p_email,btrim(p_display_name))
    on conflict(id) do update set display_name=excluded.display_name;
  insert into private.raps_managed_logins(user_id,username,state,temp_password_digest,
    temporary_expires_at,credential_version,operation_started_at,created_by)
    values(p_user_id,p_username,'issuing',p_digest,clock_timestamp()+interval '24 hours',version,clock_timestamp(),p_actor_id);
  select format_type(atttypid,atttypmod) into role_type from pg_attribute
    where attrelid='public.memberships'::regclass and attname='role' and not attisdropped;
  execute format('insert into public.memberships(user_id,role,base_id,majcom_id,active,starts_at,created_by) values($1,$2::%s,$3,$4,true,statement_timestamp(),$5)',role_type)
    using p_user_id,p_role,p_base_id,p_majcom_id,p_actor_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,new_value)
    values(p_actor_id,'managed_login_created','user_account',p_user_id,
      jsonb_build_object('username',p_username,'role',p_role,'base_id',p_base_id,'majcom_id',p_majcom_id));
  return jsonb_build_object('user_id',p_user_id,'username',p_username,'state','issuing','credential_version',version);
end;
$function$;
create function public.raps_managed_begin_reset(p_actor_id uuid,p_actor_iat bigint,p_user_id uuid,p_digest text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare m private.raps_managed_logins%rowtype; version uuid:=gen_random_uuid();
begin
  perform private.raps_login_require_admin(p_actor_id,p_actor_iat);
  if p_actor_id=p_user_id then
    raise exception using errcode='42501',message='Ask another Enterprise Administrator to reset your managed login';
  end if;
  select * into m from private.raps_managed_logins where user_id=p_user_id for update;
  if not found then raise exception using errcode='22023',message='This account does not use a managed username'; end if;
  if p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or p_digest=m.temp_password_digest then
    raise exception using errcode='22023',message='A new strong temporary password is required';
  end if;
  if m.state in ('issuing','changing') and m.operation_started_at>clock_timestamp()-interval '5 minutes' then
    raise exception using errcode='55000',message='A credential operation is already in progress';
  end if;
  if exists(select 1 from public.memberships where user_id=p_user_id and role::text='enterprise_admin'
    and active is true and base_id is null and majcom_id is null
    and (starts_at is null or starts_at<=statement_timestamp()) and (ends_at is null or ends_at>statement_timestamp()))
    and not exists(select 1 from public.memberships other where other.user_id<>p_user_id
      and other.role::text='enterprise_admin' and other.active is true and other.base_id is null and other.majcom_id is null
      and (other.starts_at is null or other.starts_at<=statement_timestamp())
      and (other.ends_at is null or other.ends_at>statement_timestamp())
      and not exists(select 1 from private.raps_managed_logins l where l.user_id=other.user_id and l.state<>'active')) then
    raise exception using errcode='42501',message='The last usable Enterprise Administrator cannot be reset';
  end if;
  delete from private.raps_managed_login_sessions where user_id=p_user_id;
  update private.raps_managed_logins set state='issuing',temp_password_digest=p_digest,
    temporary_expires_at=clock_timestamp()+interval '24 hours',credential_version=version,
    operation_started_at=clock_timestamp(),updated_at=clock_timestamp() where user_id=p_user_id;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,new_value)
    values(p_actor_id,'managed_login_reset_started','user_account',p_user_id,jsonb_build_object('username',m.username));
  return jsonb_build_object('user_id',p_user_id,'username',m.username,'state','issuing','credential_version',version);
end;
$function$;
create function public.raps_managed_finish_reset(p_actor_id uuid,p_actor_iat bigint,p_user_id uuid,p_version uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare m private.raps_managed_logins%rowtype;
begin
  perform private.raps_login_require_admin(p_actor_id,p_actor_iat);
  select * into m from private.raps_managed_logins where user_id=p_user_id for update;
  if not found or m.state<>'issuing' or m.credential_version is distinct from p_version then
    raise exception using errcode='55000',message='Credential issuance is no longer current';
  end if;
  update private.raps_managed_logins set state='pending',operation_started_at=null,
    temporary_expires_at=clock_timestamp()+interval '24 hours',updated_at=clock_timestamp() where user_id=p_user_id;
  return jsonb_build_object('user_id',p_user_id,'username',m.username,'state','pending',
    'credential_version',m.credential_version,'temporary_expires_at',clock_timestamp()+interval '24 hours');
end;
$function$;
create function public.raps_managed_begin_complete(p_user_id uuid,p_iat bigint,p_version uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare m private.raps_managed_logins%rowtype;
begin
  perform private.raps_login_require_service();
  select * into m from private.raps_managed_logins where user_id=p_user_id for update;
  if not found or m.credential_version is distinct from p_version
    or not (m.state='pending' and m.temporary_expires_at>clock_timestamp()
      or m.state='active' and private.raps_login_session_usable(p_user_id,p_iat)) then
    raise exception using errcode='42501',message='A current managed sign-in is required to change this password';
  end if;
  delete from private.raps_managed_login_sessions where user_id=p_user_id;
  update private.raps_managed_logins set state='changing',operation_started_at=clock_timestamp(),
    updated_at=clock_timestamp() where user_id=p_user_id;
  return jsonb_build_object('user_id',p_user_id,'state','changing','credential_version',m.credential_version);
end;
$function$;
create function public.raps_managed_finish_complete(p_user_id uuid,p_version uuid,p_salt text,p_verifier text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare cutoff bigint;
begin
  perform private.raps_login_require_service();
  if p_salt is null or p_salt !~ '^[a-f0-9]{32}$' or p_verifier is null or p_verifier !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='22023',message='A strong permanent-password verifier is required';
  end if;
  cutoff:=floor(extract(epoch from clock_timestamp()))::bigint+1;
  update private.raps_managed_logins set state='active',token_not_before=cutoff,
    password_salt=p_salt,password_verifier=p_verifier,
    temporary_expires_at=null,operation_started_at=null,updated_at=clock_timestamp()
    where user_id=p_user_id and credential_version=p_version and state='changing';
  if not found then raise exception using errcode='55000',message='Password completion is no longer current'; end if;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,new_value)
    values(p_user_id,'managed_login_password_changed','user_account',p_user_id,jsonb_build_object('session_reauthentication_required',true));
  return jsonb_build_object('state','active','not_before',cutoff);
end;
$function$;
create function public.raps_managed_rate_limit(p_key text,p_limit integer default 20)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare count_now bigint;
begin
  perform private.raps_login_require_service();
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit not in (20,300) then
    raise exception using errcode='22023',message='Invalid managed-login throttle key';
  end if;
  -- A global budget bounds new keys; expired keys are also removed so repeated
  -- public attempts cannot grow the throttle table without limit.
  delete from private.raps_managed_login_limits where window_ends_at<clock_timestamp()-interval '1 day';
  insert into private.raps_managed_login_limits(key_digest,window_ends_at,attempts)
    values(p_key,clock_timestamp()+interval '15 minutes',1)
    on conflict(key_digest) do update set
      window_ends_at=case when private.raps_managed_login_limits.window_ends_at<=clock_timestamp()
        then clock_timestamp()+interval '15 minutes' else private.raps_managed_login_limits.window_ends_at end,
      attempts=case when private.raps_managed_login_limits.window_ends_at<=clock_timestamp()
        then 1 else private.raps_managed_login_limits.attempts+1 end
    returning attempts into count_now;
  return count_now<=p_limit;
end;
$function$;

do $acl$
declare fn record; helper_owner name;
begin
  for fn in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='private' and p.proname like 'raps_login_%')
       or (n.nspname='public' and p.proname like 'raps_managed_%') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.signature);
    if fn.nspname='public' then execute format('grant execute on function %s to service_role',fn.signature); end if;
  end loop;
  grant execute on function private.raps_login_current_session_usable() to authenticated;
  for helper_owner in select distinct r.rolname from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid in ('private.raps_ops_memberships()'::regprocedure,
      'private.raps_account_is_enterprise_admin()'::regprocedure,
      'private.raps_account_can_view_membership(uuid,uuid,uuid)'::regprocedure) loop
    execute format('grant execute on function private.raps_login_current_session_usable() to %I',helper_owner);
  end loop;
end;
$acl$;
commit;
