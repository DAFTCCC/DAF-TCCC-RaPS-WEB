-- A peer TEST MAJCOM and separate installation records for training.
-- Apply only through the reviewed, once-only migration ledger. An existing
-- mapping table or TEST catalog is a collision, never an invitation to adopt
-- existing records. A ledger-verified completed migration must be skipped.
-- Existing installation IDs, codes, names, parent commands, memberships, RLS,
-- authorization helpers, and clinical functions are deliberately unchanged.
-- Ordinary authorized evaluator assignments retain their existing sharing
-- semantics across commands; TEST is a peer command, not a new role or air gap.
begin;
set local lock_timeout = '10s';

-- Hold a stable source catalog and administrator grant throughout preflight
-- and insertion. This migration neither creates accounts nor assigns roles.
lock table public.majcoms, public.bases in share row exclusive mode;
lock table public.memberships in share mode;

do $preflight$
declare
  item record;
  target text;
  expected_policy text;
  expected_command "char";
  code_limit integer;
  name_limit integer;
begin
  if current_user in ('anon','authenticated','service_role')
    or not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Apply TEST catalog as the trusted BYPASSRLS database administrator';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Browser database roles may not bypass row security';
  end if;
  if to_regnamespace('private') is null
    or has_schema_privilege('anon','private','CREATE')
    or has_schema_privilege('authenticated','private','CREATE') then
    raise exception 'Missing trusted private schema';
  end if;
  if to_regclass('private.raps_test_installations') is not null then
    raise exception 'TEST installation mapping already exists; inspect the once-only migration ledger';
  end if;
  for item in select * from (values
    ('majcoms','id','uuid'), ('majcoms','active','bool'),
    ('bases','id','uuid'), ('bases','majcom_id','uuid'), ('bases','active','bool'),
    ('memberships','user_id','uuid'), ('memberships','base_id','uuid'),
    ('memberships','majcom_id','uuid'), ('memberships','active','bool'),
    ('memberships','starts_at','timestamptz'), ('memberships','ends_at','timestamptz')
  ) contract(table_name,column_name,type_name) loop
    if not exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
      where a.attrelid = to_regclass('public.' || item.table_name)
        and a.attname = item.column_name and not a.attisdropped and t.typname = item.type_name) then
      raise exception 'Unsupported TEST catalog contract: public.%.%', item.table_name, item.column_name;
    end if;
  end loop;
  for item in select * from (values
    ('majcoms','code'), ('majcoms','name'), ('bases','code'), ('bases','name')
  ) contract(table_name,column_name) loop
    if not exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
      where a.attrelid = to_regclass('public.' || item.table_name)
        and a.attname = item.column_name and not a.attisdropped and t.typname in ('text','varchar')) then
      raise exception 'Unsupported TEST catalog text column: public.%.%', item.table_name, item.column_name;
    end if;
  end loop;
  if not exists (select 1 from pg_attribute a join pg_type t on t.oid = a.atttypid
    where a.attrelid = 'public.memberships'::regclass and a.attname = 'role' and not a.attisdropped
      and (t.typname = 'text' or t.typtype = 'e')) then
    raise exception 'Unsupported membership role type';
  end if;
  foreach target in array array['majcoms','bases','memberships','access_requests','profiles',
    'classes','evaluation_events','evaluations','participants','class_evaluators','event_evaluators',
    'criterion_results','timer_results'] loop
    if not exists (select 1 from pg_class c join pg_roles owner on owner.oid = c.relowner
      where c.oid = to_regclass('public.' || target) and c.relkind = 'r' and c.relrowsecurity
        and owner.rolname not in ('anon','authenticated')) then
      raise exception 'Missing trusted RLS table public.%', target;
    end if;
    if target in ('memberships','access_requests') then
      for expected_policy,expected_command in select * from (values
        ('read','r'::"char"), ('insert','a'::"char"), ('update','w'::"char"), ('delete','d'::"char")
      ) required(policy_suffix,command) loop
        if not exists (select 1 from pg_policy where polrelid = to_regclass('public.' || target)
          and polname = 'raps_account_guard_' || case when target = 'memberships' then 'membership_' else 'request_' end || expected_policy
          and not polpermissive and polcmd = expected_command and 'authenticated'::regrole::oid = any(polroles)) then
          raise exception 'Missing expected account permission guard on public.%', target;
        end if;
      end loop;
    else
      for expected_policy,expected_command in select * from (values
        ('select','r'::"char"), ('insert','a'::"char"), ('update','w'::"char"), ('delete','d'::"char")
      ) required(policy_suffix,command) loop
        if not exists (select 1 from pg_policy where polrelid = to_regclass('public.' || target)
          and polname = 'raps_ops_guard_' || expected_policy and not polpermissive
          and polcmd = expected_command and 'authenticated'::regrole::oid = any(polroles)) then
          raise exception 'Missing expected operational permission guard on public.%', target;
        end if;
      end loop;
    end if;
    expected_policy := case when target = 'memberships' then 'raps_account_guard_membership_anon'
      when target = 'access_requests' then 'raps_account_guard_request_anon' else 'raps_ops_guard_anon' end;
    if not exists (select 1 from pg_policy where polrelid = to_regclass('public.' || target)
      and polname = expected_policy and not polpermissive and polcmd = '*'
      and 'anon'::regrole::oid = any(polroles)) then
      raise exception 'Missing expected anonymous permission guard on public.%', target;
    end if;
  end loop;
  for item in select * from (values
    ('private.raps_account_is_enterprise_admin()', 'boolean'),
    ('private.raps_account_can_view_membership(uuid,uuid,uuid)', 'boolean'),
    ('private.raps_ops_memberships()', 'public.memberships'),
    ('private.is_enterprise_admin()', 'boolean'),
    ('private.can_create_at_base(uuid)', 'boolean'),
    ('private.can_manage_base(uuid)', 'boolean'),
    ('private.can_oversee_base(uuid)', 'boolean'),
    ('private.can_view_class(uuid)', 'boolean'),
    ('private.can_manage_class(uuid)', 'boolean'),
    ('private.can_view_event(uuid)', 'boolean'),
    ('private.can_grade_event(uuid)', 'boolean'),
    ('private.can_view_evaluation(uuid)', 'boolean'),
    ('private.can_edit_evaluation(uuid)', 'boolean')
  ) contract(signature,result_type) loop
    if not exists (select 1 from pg_proc p join pg_roles owner on owner.oid = p.proowner
      where p.oid = to_regprocedure(item.signature) and p.prokind = 'f' and p.prosecdef
        and p.prorettype = to_regtype(item.result_type) and owner.rolname not in ('anon','authenticated')) then
      raise exception 'Missing trusted authorization helper: %', item.signature;
    end if;
  end loop;
  for item in select * from (values
    ('memberships','raps_account_membership_write','private.raps_guard_membership_write()'),
    ('access_requests','raps_account_access_review','private.raps_guard_access_review()'),
    ('profiles','raps_account_profile_write','private.raps_guard_profile_write()'),
    ('classes','raps_ops_class_identity','private.raps_ops_row_identity()'),
    ('evaluation_events','raps_ops_event_identity','private.raps_ops_row_identity()'),
    ('participants','raps_ops_participant_identity','private.raps_ops_row_identity()'),
    ('evaluations','raps_ops_evaluation_identity','private.raps_ops_row_identity()'),
    ('criterion_results','raps_ops_criterion_identity','private.raps_ops_row_identity()'),
    ('timer_results','raps_ops_timer_identity','private.raps_ops_row_identity()')
  ) contract(table_name,trigger_name,signature) loop
    if not exists (select 1 from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      join pg_roles owner on owner.oid = p.proowner
      where t.tgrelid = to_regclass('public.' || item.table_name) and t.tgname = item.trigger_name
        and not t.tgisinternal and t.tgenabled in ('O','A') and t.tgfoid = to_regprocedure(item.signature)
        and owner.rolname not in ('anon','authenticated')) then
      raise exception 'Missing enabled authorization guard: public.%.%', item.table_name, item.trigger_name;
    end if;
  end loop;
  if not exists (select 1 from public.memberships m
    where m.role::text = 'enterprise_admin' and m.active is true
      and m.base_id is null and m.majcom_id is null
      and (m.starts_at is null or m.starts_at <= statement_timestamp())
      and (m.ends_at is null or m.ends_at > statement_timestamp())
      and (m.starts_at is null or m.ends_at is null or m.ends_at > m.starts_at)) then
    raise exception 'No active global Enterprise Admin exists; repair trusted administrator access first';
  end if;
  -- Reject case/whitespace variants as well as exact collisions. Neither a
  -- hand-created TEST MAJCOM nor an existing TEST-* base may be adopted.
  if exists (select 1 from public.majcoms where upper(btrim(code)) = 'TEST')
    or exists (select 1 from public.bases where upper(btrim(code)) = 'TEST'
      or upper(btrim(code)) like 'TEST-%') then
    raise exception 'Unknown existing TEST catalog records; no records were adopted or modified';
  end if;
  if exists (select 1 from public.majcoms group by upper(btrim(code)) having count(*) > 1)
    or exists (select 1 from public.bases group by upper(btrim(code)) having count(*) > 1) then
    raise exception 'Duplicate catalog codes; resolve ambiguity through trusted maintenance first';
  end if;
  if not exists (select 1 from public.bases) then
    raise exception 'No physical installations exist to copy';
  end if;
  if exists (select 1 from public.majcoms where code is null or code !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
      or active is null or name is null or btrim(name) = '')
    or exists (select 1 from public.bases b left join public.majcoms m on m.id = b.majcom_id
      where b.code is null or b.code !~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'
        or b.active is null or b.name is null or btrim(b.name) = '' or m.id is null) then
    raise exception 'Invalid physical installation or command catalog; no TEST rows were created';
  end if;
  -- varchar limits must fit the full prefix/suffix; never truncate stable codes.
  select case when atttypmod >= 4 then atttypmod - 4 end into code_limit
    from pg_attribute where attrelid = 'public.bases'::regclass and attname = 'code';
  select case when atttypmod >= 4 then atttypmod - 4 end into name_limit
    from pg_attribute where attrelid = 'public.bases'::regclass and attname = 'name';
  if exists (select 1 from public.bases
    where (code_limit is not null and char_length('TEST-' || code) > code_limit)
      or (name_limit is not null and char_length(name || ' (TEST)') > name_limit)) then
    raise exception 'TEST installation code or name exceeds the existing column limit';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.majcoms'::regclass
    and attname in ('code','name') and atttypmod >= 4 and atttypmod - 4 < 4) then
    raise exception 'TEST command exceeds the existing column limit';
  end if;
end;
$preflight$;

create table private.raps_test_installations (
  source_base_id uuid primary key references public.bases(id),
  test_base_id uuid not null unique references public.bases(id),
  test_majcom_id uuid not null references public.majcoms(id),
  source_code text not null,
  created_at timestamptz not null default statement_timestamp(),
  check (source_base_id <> test_base_id)
);
comment on table private.raps_test_installations is
  'Trusted once-only TEST catalog provenance. Browser clients use public catalog rows, never this mapping.';
alter table private.raps_test_installations enable row level security;
revoke all on table private.raps_test_installations from public, anon, authenticated, service_role;

do $catalog$
declare test_command_id uuid := gen_random_uuid();
begin
  insert into public.majcoms (id,code,name,active) values (test_command_id,'TEST','TEST',true);
  -- Materialize each generated ID once, then insert the bases and their trusted
  -- mapping together. No source row is updated or adopted as a TEST copy.
  with sources as materialized (
    select b.id source_base_id, gen_random_uuid() test_base_id, b.code source_code,
      b.name source_name, b.active is true and m.active is true copy_active
    from public.bases b join public.majcoms m on m.id = b.majcom_id
    where b.majcom_id <> test_command_id
  ), copies as (
    insert into public.bases (id,majcom_id,code,name,active)
    select test_base_id,test_command_id,'TEST-' || source_code,source_name || ' (TEST)',copy_active
    from sources returning id
  )
  insert into private.raps_test_installations (source_base_id,test_base_id,test_majcom_id,source_code)
  select source_base_id,test_base_id,test_command_id,source_code
  from sources join copies on copies.id = sources.test_base_id;
end;
$catalog$;

commit;
