-- Selected-class retention queue. No class, roster, grading, or clinical row is
-- deleted. Reporting exclusion becomes effective only after the private NUC
-- worker has durably written and verified the complete export.
begin;
set local lock_timeout = '10s';

do $preflight$
declare target text; column_name text;
begin
  if not exists(select 1 from pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Run this migration as the trusted database administrator';
  end if;
  if to_regprocedure('private.raps_ops_memberships()') is null
     or to_regprocedure('private.is_enterprise_admin()') is null
     or to_regprocedure('private.can_view_class(uuid)') is null then
    raise exception 'Reviewed operational permission guards are required first';
  end if;
  if to_regclass('public.class_reporting_archives') is not null then
    raise exception 'Reporting archive migration is already installed; inspect its state';
  end if;
  -- Fail before installing any objects if the deployed schema cannot produce
  -- the complete roster/evidence snapshot. Never silently omit a table.
  for target,column_name in select * from (values
    ('classes','id'),('classes','base_id'),
    ('evaluation_events','id'),('evaluation_events','class_id'),('evaluation_events','base_id'),('evaluation_events','curriculum_version_id'),
    ('evaluations','id'),('evaluations','event_id'),('evaluations','participant_id'),('evaluations','curriculum_version_id'),('evaluations','status'),('evaluations','app_data'),('evaluations','started_at'),
    ('participants','id'),('participants','app_data'),
    ('class_evaluators','id'),('class_evaluators','class_id'),('event_evaluators','id'),('event_evaluators','event_id'),
    ('criterion_results','id'),('criterion_results','evaluation_id'),('criterion_results','criterion_id'),
    ('timer_results','id'),('timer_results','evaluation_id'),('timer_results','criterion_id'),
    ('curriculum_versions','id'),('criteria','id'),('criteria','curriculum_version_id'),
    ('bases','id'),('bases','majcom_id'),('majcoms','id'),('memberships','id'),('memberships','user_id')
  ) required(table_name,field_name) loop
    if not exists(select 1 from pg_attribute a where a.attrelid=to_regclass('public.'||target)
      and a.attname=column_name and a.attnum>0 and not a.attisdropped) then
      raise exception 'Archive snapshot requires public.%.%',target,column_name;
    end if;
  end loop;
end;
$preflight$;

create table public.class_reporting_archives (
  class_id uuid primary key references public.classes(id) on delete restrict,
  request_id uuid not null unique default gen_random_uuid(),
  status text not null default 'requested' check(status in ('requested','archived','failed')),
  requested_by uuid not null,
  requested_at timestamptz not null default clock_timestamp(),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  archived_at timestamptz,
  archive_relative_path text,
  manifest_sha256 text check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text check(source_sha256 ~ '^[0-9a-f]{64}$'),
  record_counts jsonb,
  worker_error text check(worker_error in ('export_failed','source_changed','finalize_failed')),
  check((status='archived') = (archived_at is not null
    and archive_relative_path is not null and manifest_sha256 is not null
    and source_sha256 is not null and record_counts is not null)),
  check(status='failed' or worker_error is null)
);
alter table public.class_reporting_archives enable row level security;
revoke all on public.class_reporting_archives from public,anon,authenticated,service_role;
grant select on public.class_reporting_archives to authenticated;
create policy "Scoped reporting archive visibility" on public.class_reporting_archives
  for select to authenticated using(private.can_view_class(class_id));

-- Keep request/worker events outside the browser schema, including failed
-- attempts. Do not put student names or raw worker exceptions in this ledger.
create table private.class_reporting_archive_audit (
  id bigint generated always as identity primary key,
  class_id uuid not null, request_id uuid not null,
  action text not null, actor_user_id uuid,
  occurred_at timestamptz not null default clock_timestamp(), details jsonb not null default '{}'
);
revoke all on private.class_reporting_archive_audit from public,anon,authenticated,service_role;
revoke all on sequence private.class_reporting_archive_audit_id_seq from public,anon,authenticated,service_role;

-- Every linked write takes the same transaction lock as a new archive request.
-- Check both sides of a moved relationship; an old client cannot reparent an
-- archived record to escape the guard. No browser or SECURITY DEFINER bypass.
create function private.raps_reporting_archive_guard()
returns trigger language plpgsql security definer set search_path='' as $function$
declare row_value jsonb; target uuid; class_ids uuid[] := '{}';
begin
  for row_value in select value from jsonb_array_elements(
    case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new))
         when tg_op='DELETE' then jsonb_build_array(to_jsonb(old))
         else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end)
  loop
    target := null;
    case tg_table_name
      when 'classes' then target := (row_value->>'id')::uuid;
      when 'evaluation_events','class_evaluators' then target := (row_value->>'class_id')::uuid;
      when 'evaluations','event_evaluators' then
        select e.class_id into target from public.evaluation_events e where e.id=(row_value->>'event_id')::uuid;
      when 'criterion_results','timer_results' then
        select e.class_id into target from public.evaluations v join public.evaluation_events e on e.id=v.event_id
          where v.id=(row_value->>'evaluation_id')::uuid;
      else raise exception 'Unsupported reporting archive guard target';
    end case;
    if target is not null then class_ids := array_append(class_ids,target); end if;
  end loop;
  for target in select distinct value from unnest(class_ids) value order by value loop
    perform pg_advisory_xact_lock(hashtextextended('raps-reporting-archive:'||target::text,0));
    if exists(select 1 from public.class_reporting_archives a where a.class_id=target) then
      raise exception using errcode='55000',message='This class is retained in the NUC reporting archive queue and cannot be edited';
    end if;
  end loop;
  if tg_op='DELETE' then return old; else return new; end if;
end;
$function$;
revoke all on function private.raps_reporting_archive_guard() from public,anon,authenticated,service_role;
do $triggers$
declare target text;
begin
  foreach target in array array['classes','evaluation_events','evaluations','class_evaluators','event_evaluators','criterion_results','timer_results'] loop
    execute format('create trigger raps_reporting_archive_guard before insert or update or delete on public.%I for each row execute function private.raps_reporting_archive_guard()',target);
  end loop;
end;
$triggers$;

create function public.request_class_reporting_archive(p_class_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare item public.class_reporting_archives; archive_reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Enterprise Administrator access required'; end if;
  -- Serialize concurrent membership revocation with the privileged request.
  perform m.id from public.memberships m where m.user_id=auth.uid() for share;
  if not private.is_enterprise_admin() then raise exception using errcode='42501',message='Enterprise Administrator access required'; end if;
  if length(archive_reason) not between 1 and 2000 then raise exception using errcode='22023',message='Enter an archive reason of at most 2000 characters'; end if;
  perform pg_advisory_xact_lock(hashtextextended('raps-reporting-archive:'||p_class_id::text,0));
  if not exists(select 1 from public.classes where id=p_class_id) then raise exception using errcode='22023',message='Class not found'; end if;
  select * into item from public.class_reporting_archives where class_id=p_class_id;
  if not found then
    if exists(select 1 from public.evaluations v join public.evaluation_events e on e.id=v.event_id
      where e.class_id=p_class_id and (v.status::text in ('in_progress','submitted')
        or (v.status::text='draft' and (
          nullif(to_jsonb(v)->>'started_at','') is not null
          or coalesce(to_jsonb(v)->'app_data'->>'shellOnly','false')<>'true'
          or exists(select 1 from public.criterion_results r where r.evaluation_id=v.id)
          or exists(select 1 from public.timer_results r where r.evaluation_id=v.id))))) then
      raise exception using errcode='55000',message='Finalize or void active evaluations before archiving this class';
    end if;
    insert into public.class_reporting_archives(class_id,requested_by,reason)
      values(p_class_id,auth.uid(),archive_reason) returning * into item;
    insert into private.class_reporting_archive_audit(class_id,request_id,action,actor_user_id)
      values(item.class_id,item.request_id,'requested',auth.uid());
  elsif item.status='failed' then
    -- Preserve the previous generation's files and audit history. A changed
    -- shared participant record requires a new immutable export destination.
    insert into private.class_reporting_archive_audit(class_id,request_id,action,actor_user_id)
      values(item.class_id,item.request_id,'retry_requested',auth.uid());
    update public.class_reporting_archives set request_id=gen_random_uuid(),
      status='requested',requested_by=auth.uid(),requested_at=clock_timestamp(),reason=archive_reason,
      archived_at=null,archive_relative_path=null,manifest_sha256=null,source_sha256=null,
      record_counts=null,worker_error=null where class_id=p_class_id returning * into item;
    insert into private.class_reporting_archive_audit(class_id,request_id,action,actor_user_id)
      values(item.class_id,item.request_id,'requested',auth.uid());
  end if;
  return jsonb_build_object('class_id',item.class_id,'request_id',item.request_id,'status',item.status,
    'requested_at',item.requested_at,'archived_at',item.archived_at,'worker_error',item.worker_error);
end;
$function$;
revoke all on function public.request_class_reporting_archive(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.request_class_reporting_archive(uuid,text) to authenticated;

-- Cancel only an unfinished generation. Existing private files remain on the
-- NUC; a completed archive cannot be undone through this endpoint.
create function public.cancel_class_reporting_archive(p_class_id uuid,p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare item public.class_reporting_archives;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='Enterprise Administrator access required'; end if;
  perform m.id from public.memberships m where m.user_id=auth.uid() for share;
  if not private.is_enterprise_admin() then raise exception using errcode='42501',message='Enterprise Administrator access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('raps-reporting-archive:'||p_class_id::text,0));
  select * into strict item from public.class_reporting_archives where class_id=p_class_id for update;
  if item.request_id is distinct from p_request_id or item.status='archived' then raise exception using errcode='55000',message='Archive request state changed or already completed'; end if;
  insert into private.class_reporting_archive_audit(class_id,request_id,action,actor_user_id)
    values(item.class_id,item.request_id,'cancelled',auth.uid());
  delete from public.class_reporting_archives where class_id=p_class_id;
end;
$function$;
revoke all on function public.cancel_class_reporting_archive(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_class_reporting_archive(uuid,uuid) to authenticated;

create function private.raps_fail_reporting_archive(p_class_id uuid,p_request_id uuid,p_error text)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if p_error is null or p_error not in ('export_failed','source_changed','finalize_failed') then raise exception 'Invalid archive failure code'; end if;
  perform pg_advisory_xact_lock(hashtextextended('raps-reporting-archive:'||p_class_id::text,0));
  update public.class_reporting_archives set status='failed',worker_error=p_error
    where class_id=p_class_id and request_id=p_request_id and status in ('requested','failed');
  if found then
    insert into private.class_reporting_archive_audit(class_id,request_id,action,details)
      values(p_class_id,p_request_id,'failed',jsonb_build_object('worker_error',p_error));
  end if;
end;
$function$;
revoke all on function private.raps_fail_reporting_archive(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Lossless full-row snapshot, including empty table schemas. Participants are
-- shared records: capture their current values without freezing unrelated work.
-- Their snapshot is rechecked immediately before reporting exclusion commits.
create function private.raps_reporting_archive_snapshot(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare output jsonb := '{}'; target text; predicate text; rows_value jsonb; columns_value jsonb;
begin
  if not exists(select 1 from public.classes where id=p_class_id) then raise exception 'Class not found'; end if;
  for target,predicate in select * from (values
    ('classes','r.id=$1'),
    ('evaluation_events','r.class_id=$1'),
    ('evaluations','r.event_id in (select id from public.evaluation_events where class_id=$1)'),
    ('participants','r.app_data->>''classId''=$1::text or r.id in (select v.participant_id from public.evaluations v join public.evaluation_events e on e.id=v.event_id where e.class_id=$1)'),
    ('class_evaluators','r.class_id=$1'),
    ('event_evaluators','r.event_id in (select id from public.evaluation_events where class_id=$1)'),
    ('criterion_results','r.evaluation_id in (select v.id from public.evaluations v join public.evaluation_events e on e.id=v.event_id where e.class_id=$1)'),
    ('timer_results','r.evaluation_id in (select v.id from public.evaluations v join public.evaluation_events e on e.id=v.event_id where e.class_id=$1)'),
    ('curriculum_versions','r.id in (select curriculum_version_id from public.evaluation_events where class_id=$1 union select v.curriculum_version_id from public.evaluations v join public.evaluation_events e on e.id=v.event_id where e.class_id=$1)'),
    ('criteria','r.curriculum_version_id in (select curriculum_version_id from public.evaluation_events where class_id=$1 union select v.curriculum_version_id from public.evaluations v join public.evaluation_events e on e.id=v.event_id where e.class_id=$1) or r.id in (select c.criterion_id from public.criterion_results c join public.evaluations v on v.id=c.evaluation_id join public.evaluation_events e on e.id=v.event_id where e.class_id=$1 union select t.criterion_id from public.timer_results t join public.evaluations v on v.id=t.evaluation_id join public.evaluation_events e on e.id=v.event_id where e.class_id=$1)'),
    ('bases','r.id in (select base_id from public.classes where id=$1 union select base_id from public.evaluation_events where class_id=$1)'),
    ('majcoms','r.id in (select b.majcom_id from public.bases b join public.classes c on c.base_id=b.id where c.id=$1 union select b.majcom_id from public.bases b join public.evaluation_events e on e.base_id=b.id where e.class_id=$1)')
  ) tables(table_name,where_sql) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.id),''[]''::jsonb) from public.%I r where %s',target,predicate) into rows_value using p_class_id;
    select jsonb_agg(a.attname order by a.attnum) into columns_value from pg_attribute a
      where a.attrelid=to_regclass('public.'||target) and a.attnum>0 and not a.attisdropped;
    output := output || jsonb_build_object(target,jsonb_build_object('columns',columns_value,'rows',rows_value));
  end loop;
  return output;
end;
$function$;
revoke all on function private.raps_reporting_archive_snapshot(uuid) from public,anon,authenticated,service_role;

create function private.raps_complete_reporting_archive(p_class_id uuid,p_request_id uuid,
  p_source_sha256 text,p_manifest_sha256 text,p_relative_path text,p_counts jsonb)
returns void language plpgsql security definer set search_path='' as $function$
declare item public.class_reporting_archives; snapshot_value jsonb; counts_value jsonb; expected_path text;
begin
  perform pg_advisory_xact_lock(hashtextextended('raps-reporting-archive:'||p_class_id::text,0));
  select * into strict item from public.class_reporting_archives where class_id=p_class_id for update;
  if item.request_id is distinct from p_request_id or item.status not in ('requested','failed') then raise exception 'Archive request state changed'; end if;
  expected_path := p_class_id::text||'/'||to_char(item.requested_at at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"')||'_'||p_request_id::text;
  if p_relative_path is distinct from expected_path or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'Archive proof invalid'; end if;
  snapshot_value := private.raps_reporting_archive_snapshot(p_class_id);
  if encode(sha256(convert_to(snapshot_value::text,'UTF8')),'hex') is distinct from p_source_sha256 then raise exception using errcode='40001',message='Archive source changed'; end if;
  select jsonb_object_agg(key,jsonb_array_length(value->'rows')) into counts_value from jsonb_each(snapshot_value);
  if counts_value is distinct from p_counts then raise exception 'Archive record counts differ'; end if;
  update public.class_reporting_archives set status='archived',archived_at=clock_timestamp(),
    archive_relative_path=p_relative_path,manifest_sha256=p_manifest_sha256,source_sha256=p_source_sha256,
    record_counts=p_counts,worker_error=null where class_id=p_class_id;
  insert into private.class_reporting_archive_audit(class_id,request_id,action,details)
    values(p_class_id,p_request_id,'archived',jsonb_build_object('manifest_sha256',p_manifest_sha256,'source_sha256',p_source_sha256,'record_counts',p_counts));
end;
$function$;
revoke all on function private.raps_complete_reporting_archive(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
commit;
