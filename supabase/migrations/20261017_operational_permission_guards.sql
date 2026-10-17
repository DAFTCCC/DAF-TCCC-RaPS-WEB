-- Operational authorization for the deployed RaPS role contract.
-- Apply account_permission_guards first. Clinical claim/finalize/void/close RPCs,
-- grading rules, curriculum rows, and student records are deliberately unchanged.
-- The public readiness wrapper gains only a class-visibility gate; its private
-- readiness/integrity implementations and result merging remain unchanged.
-- Existing permissive policies remain necessary; restrictive policies constrain
-- their union, including historical inline Enterprise ALL policies.
-- Once-only migration: collisions or an unsupported catalog roll back everything.
begin;
set local lock_timeout = '10s';

do $preflight$
declare item record; target text;
begin
  if not exists (select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Apply operational guards as the trusted BYPASSRLS database administrator';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Browser roles may not bypass row security';
  end if;
  if to_regprocedure('private.raps_account_can_view_membership(uuid,uuid,uuid)') is null then
    raise exception 'Apply reviewed account_permission_guards migration first';
  end if;
  for item in select * from (values
    ('classes','id','uuid'),('classes','base_id','uuid'),('classes','created_by','uuid'),('classes','app_data','jsonb'),
    ('evaluation_events','curriculum_version_id','uuid'),('evaluation_events','id','uuid'),('evaluation_events','class_id','uuid'),('evaluation_events','base_id','uuid'),('evaluation_events','created_by','uuid'),
    ('evaluations','completed_at','timestamptz'),('evaluations','attempt_number','int4'),
    ('evaluations','id','uuid'),('evaluations','event_id','uuid'),('evaluations','participant_id','uuid'),('evaluations','evaluator_id','uuid'),('evaluations','curriculum_version_id','uuid'),
    ('participants','id','uuid'),('participants','home_base_id','uuid'),('participants','created_by','uuid'),
    ('class_evaluators','class_id','uuid'),('class_evaluators','evaluator_id','uuid'),
    ('event_evaluators','event_id','uuid'),('event_evaluators','evaluator_id','uuid'),
    ('criterion_results','evaluation_id','uuid'),('criterion_results','criterion_id','uuid'),
    ('timer_results','evaluation_id','uuid'),('timer_results','criterion_id','uuid'),
    ('profiles','id','uuid'),('criteria','id','uuid'),('criteria','curriculum_version_id','uuid'),
    ('curriculum_versions','id','uuid'),('curriculum_versions','published','bool'),('scenarios','published','bool')
  ) contract(table_name,column_name,type_name) loop
    if not exists (select 1 from pg_attribute a join pg_type t on t.oid=a.atttypid
      where a.attrelid=to_regclass('public.'||item.table_name) and a.attname=item.column_name
        and not a.attisdropped and t.typname=item.type_name) then
      raise exception 'Unsupported operational column: public.%.%',item.table_name,item.column_name;
    end if;
  end loop;
  for item in select * from (values ('public.class_closure_readiness(uuid)'),
    ('private.class_closure_readiness(uuid)'),('private.class_closure_integrity(uuid)')) contract(signature) loop
    if not exists (select 1 from pg_proc p join pg_roles owner on owner.oid=p.proowner
      where p.oid=to_regprocedure(item.signature) and p.prorettype='jsonb'::regtype
        and p.prokind='f' and owner.rolname not in ('anon','authenticated')) then
      raise exception 'Missing reviewed class-readiness boundary: %',item.signature;
    end if;
  end loop;
  for item in select * from (values ('classes','status'),('evaluation_events','status'),
    ('evaluations','status'),('evaluations','overall_result')) contract(table_name,column_name) loop
    if not exists (select 1 from pg_attribute a join pg_type t on t.oid=a.atttypid
      where a.attrelid=to_regclass('public.'||item.table_name) and a.attname=item.column_name
        and not a.attisdropped and (t.typname='text' or t.typtype='e')) then
      raise exception 'Unsupported operational status: public.%.%',item.table_name,item.column_name;
    end if;
  end loop;
  foreach target in array array['classes','evaluation_events','evaluations','participants','class_evaluators','event_evaluators','criterion_results','timer_results','profiles','bases','majcoms','criteria','curriculum_versions','scenarios','audit_log','closed_class_archives'] loop
    if not exists (select 1 from pg_class c where c.oid=to_regclass('public.'||target) and c.relkind='r' and c.relrowsecurity) then
      raise exception 'Missing enabled RLS on public.%',target;
    end if;
    if exists (select 1 from pg_class c join pg_roles r on r.oid=c.relowner
      where c.oid=to_regclass('public.'||target) and r.rolname in ('anon','authenticated')) then
      raise exception 'Browser roles may not own operational tables';
    end if;
    if exists (select 1 from pg_policy where polrelid=to_regclass('public.'||target) and polname like 'raps_ops_guard_%') then
      raise exception 'Operational guards already installed on public.%',target;
    end if;
  end loop;
  for item in select * from (values
    ('private.is_enterprise_admin()'),('private.can_create_at_base(uuid)'),('private.can_manage_base(uuid)'),
    ('private.can_oversee_base(uuid)'),('private.can_manage_class(uuid)'),('private.can_view_class(uuid)'),
    ('private.can_manage_event(uuid)'),('private.can_grade_event(uuid)'),('private.can_view_event(uuid)'),
    ('private.can_view_evaluation(uuid)'),('private.can_edit_evaluation(uuid)'),('private.can_view_participant(uuid)'),
    ('private.can_view_profile(uuid)'),('private.can_view_membership(uuid,uuid,uuid)')
  ) contract(signature) loop
    if not exists (select 1 from pg_proc p join pg_roles owner on owner.oid=p.proowner
      where p.oid=to_regprocedure(item.signature) and p.prorettype='boolean'::regtype
        and p.prosecdef and p.prokind='f' and owner.rolname not in ('anon','authenticated')) then
      raise exception 'Missing reviewed boolean SECURITY DEFINER helper: %',item.signature;
    end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname like 'raps_ops_%') then
    raise exception 'Operational helper name collision; inspect the migration ledger';
  end if;
end;
$preflight$;

-- One definition of current authority. NULL starts_at means unbounded, while
-- inactive/future/expired, unknown, mixed-scope, and inactive-org grants fail shut.
create function private.raps_ops_memberships()
returns setof public.memberships language sql stable security definer set search_path='' as $function$
  select m.* from public.memberships m
  where auth.uid() is not null and m.user_id=auth.uid() and m.active is true
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
create function private.raps_ops_base_active(p_base_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.bases b join public.majcoms j on j.id=b.majcom_id
    where b.id=p_base_id and b.active is true and j.active is true);
$function$;
create or replace function private.is_enterprise_admin()
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from private.raps_ops_memberships() m where m.role::text='enterprise_admin');
$function$;
create or replace function private.can_create_at_base(p_base_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.raps_ops_base_active(p_base_id) and (private.is_enterprise_admin()
    or exists(select 1 from private.raps_ops_memberships() m where m.role::text in ('evaluator','program_manager') and m.base_id=p_base_id));
$function$;
create or replace function private.can_manage_base(p_base_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.is_enterprise_admin() or exists(select 1 from private.raps_ops_memberships() m
    where m.role::text='program_manager' and m.base_id=p_base_id);
$function$;
create or replace function private.can_oversee_base(p_base_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.can_manage_base(p_base_id) or (private.raps_ops_base_active(p_base_id)
    and exists(select 1 from private.raps_ops_memberships() m join public.bases b on b.majcom_id=m.majcom_id
      where m.role::text='majcom_manager' and b.id=p_base_id));
$function$;
create or replace function private.can_manage_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.classes c where c.id=p_class_id and
    (private.can_manage_base(c.base_id) or (c.created_by=auth.uid() and private.can_create_at_base(c.base_id))));
$function$;
create or replace function private.can_view_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.classes c where c.id=p_class_id and
    (private.can_oversee_base(c.base_id) or (c.created_by=auth.uid() and private.can_create_at_base(c.base_id))
      or (private.raps_ops_base_active(c.base_id) and exists(select 1 from private.raps_ops_memberships())
        and (exists(select 1 from public.class_evaluators a where a.class_id=c.id and a.evaluator_id=auth.uid())
          or exists(select 1 from public.evaluation_events e join public.event_evaluators a on a.event_id=e.id
            where e.class_id=c.id and a.evaluator_id=auth.uid())))));
$function$;
create or replace function private.can_manage_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluation_events e where e.id=p_event_id and
    (private.can_manage_base(e.base_id) or (e.created_by=auth.uid() and private.can_create_at_base(e.base_id))
      or (private.can_create_at_base(e.base_id) and private.can_manage_class(e.class_id))));
$function$;
create or replace function private.can_grade_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluation_events e where e.id=p_event_id and private.raps_ops_base_active(e.base_id)
    and (private.can_manage_base(e.base_id) or (e.created_by=auth.uid() and private.can_create_at_base(e.base_id))
      or (private.can_create_at_base(e.base_id) and private.can_manage_class(e.class_id))
      or (exists(select 1 from private.raps_ops_memberships()) and (
        exists(select 1 from public.event_evaluators a where a.event_id=e.id and a.evaluator_id=auth.uid())
        or exists(select 1 from public.class_evaluators a where a.class_id=e.class_id and a.evaluator_id=auth.uid())))));
$function$;
create or replace function private.can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluation_events e where e.id=p_event_id and
    (private.can_oversee_base(e.base_id) or private.can_view_class(e.class_id) or private.can_grade_event(e.id)));
$function$;
create function private.raps_ops_event_open(p_event_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluation_events e join public.classes c on c.id=e.class_id
    where e.id=p_event_id and e.base_id=c.base_id
      and e.status::text not in ('closed','archived','cancelled')
      and c.status::text not in ('completed','cancelled','archived'));
$function$;
create or replace function private.can_view_evaluation(p_evaluation_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluations e where e.id=p_evaluation_id and
    (private.is_enterprise_admin() or private.can_view_event(e.event_id)));
$function$;
create or replace function private.can_edit_evaluation(p_evaluation_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluations e where e.id=p_evaluation_id
    and e.status::text in ('draft','in_progress') and private.raps_ops_event_open(e.event_id)
    and exists(select 1 from public.evaluation_events event join public.curriculum_versions cv
      on cv.id=event.curriculum_version_id
      where event.id=e.event_id and event.curriculum_version_id=e.curriculum_version_id)
    and private.can_grade_event(e.event_id) and (private.is_enterprise_admin() or e.evaluator_id=auth.uid()));
$function$;
create function private.raps_ops_manage_participant(p_home_base_id uuid,p_created_by uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.is_enterprise_admin() or (p_home_base_id is not null and
    (private.can_manage_base(p_home_base_id) or (p_created_by=auth.uid() and private.can_create_at_base(p_home_base_id))))
    or (p_home_base_id is null and p_created_by=auth.uid() and exists
      (select 1 from private.raps_ops_memberships() m where m.role::text in ('evaluator','program_manager')));
$function$;
create or replace function private.can_view_participant(p_participant_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.participants p where p.id=p_participant_id and
    (private.raps_ops_manage_participant(p.home_base_id,p.created_by)
      or private.can_create_at_base(p.home_base_id) or private.can_oversee_base(p.home_base_id)
      or exists(select 1 from public.evaluations e where e.participant_id=p.id and private.can_view_evaluation(e.id))));
$function$;
create or replace function private.can_view_membership(p_user_id uuid,p_base_id uuid,p_majcom_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.raps_account_can_view_membership(p_user_id,p_base_id,p_majcom_id);
$function$;
create or replace function private.can_view_profile(p_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select p_user_id=auth.uid() or private.is_enterprise_admin() or exists(
    select 1 from private.raps_ops_memberships() mine join public.memberships theirs on
      theirs.user_id=p_user_id and theirs.active is true
      and (theirs.starts_at is null or theirs.starts_at<=statement_timestamp())
      and (theirs.ends_at is null or theirs.ends_at>statement_timestamp())
      and theirs.role::text in ('evaluator','program_manager') and theirs.base_id is not null and theirs.majcom_id is null
    join public.bases b on b.id=theirs.base_id and b.active is true
    join public.majcoms j on j.id=b.majcom_id and j.active is true
    where mine.base_id=theirs.base_id or (mine.role::text='majcom_manager' and mine.majcom_id=b.majcom_id));
$function$;
create function private.raps_ops_result_curriculum(p_evaluation_id uuid,p_criterion_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.evaluations e join public.criteria c on c.curriculum_version_id=e.curriculum_version_id
    where e.id=p_evaluation_id and c.id=p_criterion_id);
$function$;

-- BEFORE INSERT is essential: using a newly inserted evaluation to establish
-- participant visibility would bootstrap access to a foreign participant's PII.
create function private.raps_ops_evaluation_scope(p_event_id uuid,p_participant_id uuid,p_curriculum_version_id uuid,p_creating boolean)
returns boolean language sql stable security definer set search_path='' as $function$
  select private.can_grade_event(p_event_id) and private.can_view_participant(p_participant_id)
    and exists(select 1 from public.evaluation_events e join public.curriculum_versions cv
      on cv.id=e.curriculum_version_id
      where e.id=p_event_id and e.curriculum_version_id=p_curriculum_version_id
        and (not p_creating or cv.published is true));
$function$;

-- The deployed public wrapper previously delegated without checking access.
-- Keep the supplied readiness/integrity flow, adding authorization before any
-- private helper can expose class metadata, counters, or closure issues.
create or replace function public.class_closure_readiness(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_core jsonb; v_integrity jsonb; v_issues jsonb;
begin
  if auth.uid() is null or not private.can_view_class(p_class_id) then
    raise exception using errcode='42501',message='Current access to this class is required';
  end if;
  v_core:=private.class_closure_readiness(p_class_id);
  if coalesce((v_core->>'alreadyClosed')::boolean,false) then
    return v_core;
  end if;
  v_integrity:=private.class_closure_integrity(p_class_id);
  v_issues:=coalesce(v_core->'issues','[]'::jsonb)||coalesce(v_integrity->'issues','[]'::jsonb);
  return (v_core-'issues'-'ok')||(v_integrity-'issues'-'ok')||jsonb_build_object(
    'ok',jsonb_array_length(v_issues)=0,'issues',v_issues);
end;
$function$;
revoke all on function public.class_closure_readiness(uuid) from public,anon;
grant execute on function public.class_closure_readiness(uuid) to authenticated;
revoke all on function private.class_closure_readiness(uuid),private.class_closure_integrity(uuid)
  from public,anon,authenticated;
do $readiness_acl$
declare wrapper_owner name;
begin
  select r.rolname into wrapper_owner from pg_proc p join pg_roles r on r.oid=p.proowner
    where p.oid='public.class_closure_readiness(uuid)'::regprocedure;
  -- CREATE OR REPLACE preserves the deployed owner. Explicitly retain its
  -- dependency access even when that trusted owner is not a superuser.
  execute format('grant execute on function private.class_closure_readiness(uuid),private.class_closure_integrity(uuid),private.can_view_class(uuid) to %I',wrapper_owner);
end;
$readiness_acl$;

-- Invoker context distinguishes direct browser writes from existing, reviewed
-- SECURITY DEFINER lifecycle RPCs. No new browser-controlled bypass flag exists.
-- Clinical RPC authorization continues through the hardened helpers above.
create function private.raps_ops_row_identity()
returns trigger language plpgsql set search_path='' as $function$
declare before_row jsonb; after_row jsonb; key text;
begin
  -- The existing close RPC is a definer function: enforce its management role
  -- independently without changing its clinical readiness/scoring implementation.
  if tg_table_name='classes' then
    if tg_op='UPDATE' and current_setting('role',true)='authenticated'
      and new.status::text='completed' and old.status::text<>'completed'
      and not private.can_manage_base(old.base_id) then
      raise exception using errcode='42501',message='An active installation Program Manager or Enterprise Admin must close this class';
    end if;
  end if;
  if tg_table_name='evaluations' then
    -- Also runs inside the existing definer claim/finalize/void RPCs. They retain
    -- their clinical code; identity and prior participant access are hard gates.
    -- Publication gates new attempts. Existing valid attempts retain their
    -- lifecycle if trusted maintenance later unpublishes the curriculum.
    if tg_op in ('INSERT','UPDATE') and current_setting('role',true)='authenticated'
      and not private.raps_ops_evaluation_scope(new.event_id,new.participant_id,new.curriculum_version_id,tg_op='INSERT') then
      raise exception using errcode='42501',message='Evaluation requires an authorized participant and matching event curriculum; new attempts require publication';
    end if;
  end if;
  if current_user not in ('anon','authenticated') then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='UPDATE' then
    before_row:=to_jsonb(old); after_row:=to_jsonb(new);
    foreach key in array tg_argv loop
      if (before_row->key) is distinct from (after_row->key) then
        raise exception using errcode='42501',message='Operational ownership, identity, and organizational scope are immutable';
      end if;
    end loop;
  end if;
  if tg_table_name='classes' then
    if tg_op='DELETE' and old.status::text='completed' then
      raise exception using errcode='42501',message='Use the audited closed-class archive workflow';
    end if;
    if tg_op='INSERT' and (new.status::text in ('completed','archived') or nullif(new.app_data->>'deletedAt','') is not null) then
      raise exception using errcode='42501',message='Create an open class before changing its lifecycle';
    end if;
    if tg_op='UPDATE' then
      if old.status::text='completed' or new.status::text='completed' then
        raise exception using errcode='42501',message='Closed classes require the authoritative lifecycle workflow';
      end if;
      if ((old.status::text='archived') is distinct from (new.status::text='archived')
        or coalesce(old.app_data->>'deletedAt','0') is distinct from coalesce(new.app_data->>'deletedAt','0')
        or coalesce(old.app_data->>'restoredAt','0') is distinct from coalesce(new.app_data->>'restoredAt','0'))
        and not private.is_enterprise_admin() then
        raise exception using errcode='42501',message='Enterprise Admin access required for shared class trash';
      end if;
    end if;
  elsif tg_table_name='evaluation_events' then
    if new.status::text in ('closed','archived') or not exists
      (select 1 from public.classes c where c.id=new.class_id and c.base_id=new.base_id
        and c.status::text not in ('completed','cancelled','archived')) then
      raise exception using errcode='42501',message='Events must belong to an open class in the same installation';
    end if;
  elsif tg_table_name='evaluations' and tg_op<>'DELETE' then
    if new.status::text in ('finalized','voided') or new.overall_result is not null or new.completed_at is not null then
      raise exception using errcode='42501',message='Use the authoritative evaluation lifecycle workflow';
    end if;
  end if;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;

create trigger raps_ops_class_identity before insert or update or delete on public.classes
  for each row execute function private.raps_ops_row_identity('id','base_id','created_by');
create trigger raps_ops_event_identity before insert or update on public.evaluation_events
  for each row execute function private.raps_ops_row_identity('id','class_id','base_id','created_by','curriculum_version_id');
create trigger raps_ops_participant_identity before update on public.participants
  for each row execute function private.raps_ops_row_identity('id','home_base_id','created_by');
create trigger raps_ops_evaluation_identity before insert or update on public.evaluations
  for each row execute function private.raps_ops_row_identity('id','event_id','participant_id','evaluator_id','curriculum_version_id','attempt_number');
create trigger raps_ops_criterion_identity before update on public.criterion_results
  for each row execute function private.raps_ops_row_identity('id','evaluation_id','criterion_id');
create trigger raps_ops_timer_identity before update on public.timer_results
  for each row execute function private.raps_ops_row_identity('id','evaluation_id','criterion_id');

-- RLS and row triggers do not mediate TRUNCATE or schema/trigger creation.
-- Browser clients need neither DDL nor these non-row privileges.
revoke create on schema public,private from public,anon,authenticated;
revoke truncate,references,trigger on
  public.classes,public.evaluation_events,public.evaluations,public.participants,
  public.class_evaluators,public.event_evaluators,public.criterion_results,public.timer_results,
  public.profiles,public.memberships,public.access_requests,public.bases,public.majcoms,
  public.criteria,public.curriculum_versions,public.scenarios,public.audit_log,public.closed_class_archives
from public,anon,authenticated;

-- Protect the standardized JTS rubric from browser edits, including Enterprise.
-- Trusted maintenance and service-role deployment retain existing privileges.
revoke insert,update,delete,truncate,references,trigger on public.criteria,public.curriculum_versions from public,anon,authenticated;

do $policies$
declare rule record; target text; signature regprocedure;
begin
  foreach target in array array['classes','evaluation_events','evaluations','participants','class_evaluators','event_evaluators','criterion_results','timer_results','profiles','bases','majcoms','criteria','curriculum_versions','scenarios','audit_log','closed_class_archives'] loop
    execute format('create policy raps_ops_guard_anon on public.%I as restrictive for all to anon using(false) with check(false)',target);
  end loop;
  for rule in select * from (values
    ('classes','select','private.can_view_class(id)',null),
    ('classes','insert',null,'private.can_create_at_base(base_id) and created_by=auth.uid()'),
    ('classes','update','private.can_manage_class(id)','private.is_enterprise_admin() or private.can_create_at_base(base_id)'),
    ('classes','delete','private.is_enterprise_admin()',null),
    ('evaluation_events','select','private.can_view_event(id)',null),
    ('evaluation_events','insert',null,'private.can_create_at_base(base_id) and created_by=auth.uid() and private.can_manage_class(class_id)'),
    ('evaluation_events','update','private.can_manage_event(id)','(private.is_enterprise_admin() or private.can_create_at_base(base_id)) and private.can_manage_class(class_id)'),
    ('evaluation_events','delete','private.is_enterprise_admin()',null),
    ('evaluations','select','private.can_view_evaluation(id)',null),
    ('evaluations','insert',null,'private.can_grade_event(event_id) and private.raps_ops_event_open(event_id) and evaluator_id=auth.uid() and status::text in (''draft'',''in_progress'')'),
    ('evaluations','update','private.can_edit_evaluation(id)','private.can_grade_event(event_id) and private.raps_ops_event_open(event_id) and status::text in (''draft'',''in_progress'',''submitted'')'),
    ('evaluations','delete','private.is_enterprise_admin() and private.can_edit_evaluation(id)',null),
    ('participants','select','private.can_view_participant(id)',null),
    ('participants','insert',null,'created_by=auth.uid() and private.raps_ops_manage_participant(home_base_id,created_by)'),
    ('participants','update','private.raps_ops_manage_participant(home_base_id,created_by)','private.raps_ops_manage_participant(home_base_id,created_by)'),
    ('participants','delete','private.is_enterprise_admin()',null),
    ('class_evaluators','select','private.can_view_class(class_id)',null),
    ('class_evaluators','insert',null,'private.can_manage_class(class_id)'),
    ('class_evaluators','update','private.can_manage_class(class_id)','private.can_manage_class(class_id)'),
    ('class_evaluators','delete','private.can_manage_class(class_id)',null),
    ('event_evaluators','select','private.can_view_event(event_id)',null),
    ('event_evaluators','insert',null,'private.can_manage_event(event_id)'),
    ('event_evaluators','update','private.can_manage_event(event_id)','private.can_manage_event(event_id)'),
    ('event_evaluators','delete','private.can_manage_event(event_id)',null),
    ('criterion_results','select','private.can_view_evaluation(evaluation_id)',null),
    ('criterion_results','insert',null,'private.can_edit_evaluation(evaluation_id) and private.raps_ops_result_curriculum(evaluation_id,criterion_id)'),
    ('criterion_results','update','private.can_edit_evaluation(evaluation_id)','private.can_edit_evaluation(evaluation_id) and private.raps_ops_result_curriculum(evaluation_id,criterion_id)'),
    ('criterion_results','delete','private.can_edit_evaluation(evaluation_id)',null),
    ('timer_results','select','private.can_view_evaluation(evaluation_id)',null),
    ('timer_results','insert',null,'private.can_edit_evaluation(evaluation_id) and (criterion_id is null or private.raps_ops_result_curriculum(evaluation_id,criterion_id))'),
    ('timer_results','update','private.can_edit_evaluation(evaluation_id)','private.can_edit_evaluation(evaluation_id) and (criterion_id is null or private.raps_ops_result_curriculum(evaluation_id,criterion_id))'),
    ('timer_results','delete','private.can_edit_evaluation(evaluation_id)',null),
    ('profiles','select','private.can_view_profile(id)',null),
    ('profiles','insert',null,'false'),
    ('profiles','update','id=auth.uid()','id=auth.uid()'),
    ('profiles','delete','false',null),
    ('bases','select','active is true or private.is_enterprise_admin()',null),
    ('bases','insert',null,'private.is_enterprise_admin()'),
    ('bases','update','private.is_enterprise_admin()','private.is_enterprise_admin()'),
    ('bases','delete','private.is_enterprise_admin()',null),
    ('majcoms','select','active is true or private.is_enterprise_admin()',null),
    ('majcoms','insert',null,'private.is_enterprise_admin()'),
    ('majcoms','update','private.is_enterprise_admin()','private.is_enterprise_admin()'),
    ('majcoms','delete','private.is_enterprise_admin()',null),
    ('criteria','select','private.is_enterprise_admin() or exists(select 1 from public.curriculum_versions c where c.id=criteria.curriculum_version_id and c.published is true)',null),
    ('criteria','insert',null,'false'),('criteria','update','false','false'),('criteria','delete','false',null),
    ('curriculum_versions','select','published is true or private.is_enterprise_admin()',null),
    ('curriculum_versions','insert',null,'false'),('curriculum_versions','update','false','false'),('curriculum_versions','delete','false',null),
    ('scenarios','select','published is true or private.is_enterprise_admin()',null),
    ('scenarios','insert',null,'private.is_enterprise_admin()'),
    ('scenarios','update','private.is_enterprise_admin()','private.is_enterprise_admin()'),
    ('scenarios','delete','private.is_enterprise_admin()',null),
    ('audit_log','select','private.is_enterprise_admin()',null),
    ('audit_log','insert',null,'false'),('audit_log','update','false','false'),('audit_log','delete','false',null),
    ('closed_class_archives','select','private.is_enterprise_admin()',null),
    ('closed_class_archives','insert',null,'false'),('closed_class_archives','update','false','false'),('closed_class_archives','delete','false',null)
  ) contract(table_name,command,predicate,check_predicate) loop
    execute format('create policy %I on public.%I as restrictive for %s to authenticated%s%s',
      'raps_ops_guard_'||rule.command,rule.table_name,rule.command,
      case when rule.predicate is null then '' else ' using ('||rule.predicate||')' end,
      case when rule.check_predicate is null then '' else ' with check ('||rule.check_predicate||')' end);
  end loop;
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and (p.proname like 'raps_ops_%' or p.oid in (
      to_regprocedure('private.is_enterprise_admin()'),to_regprocedure('private.can_create_at_base(uuid)'),
      to_regprocedure('private.can_manage_base(uuid)'),to_regprocedure('private.can_oversee_base(uuid)'),
      to_regprocedure('private.can_manage_class(uuid)'),to_regprocedure('private.can_view_class(uuid)'),
      to_regprocedure('private.can_manage_event(uuid)'),to_regprocedure('private.can_grade_event(uuid)'),
      to_regprocedure('private.can_view_event(uuid)'),to_regprocedure('private.can_view_evaluation(uuid)'),
      to_regprocedure('private.can_edit_evaluation(uuid)'),to_regprocedure('private.can_view_participant(uuid)'),
      to_regprocedure('private.can_view_profile(uuid)'),to_regprocedure('private.can_view_membership(uuid,uuid,uuid)'))) loop
    execute format('revoke all on function %s from public,anon',signature);
    execute format('grant execute on function %s to authenticated',signature);
  end loop;
end;
$policies$;
-- The deployed archive-request RPC already verifies Enterprise authority and
-- appends an audit event. Restrict its exposed EXECUTE ACL to signed-in callers.
do $archive_acl$
begin
  if to_regprocedure('public.request_closed_class_archive_deletion(uuid,text)') is not null then
    revoke all on function public.request_closed_class_archive_deletion(uuid,text) from public,anon;
    grant execute on function public.request_closed_class_archive_deletion(uuid,text) to authenticated;
  end if;
end;
$archive_acl$;
commit;
