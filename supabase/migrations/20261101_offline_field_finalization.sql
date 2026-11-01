-- RaPS 3.4.13: offline field finalization and the multi-device closure gate.
--
-- 1. confirm_offline_evaluation_audit: after server finalization, confirm the
--    field start/finish times and field result that a phone uploaded before
--    finalizing. Field evidence can never be invented or replaced afterwards.
-- 2. Attempt 2 retest rules on evaluations: a retest needs a finalized
--    Attempt 1 FAIL and a different evaluator. Checked on insert and on changes
--    to the evaluator or attempt number, so in-flight records still finalize.
-- 3. Closure gate: every device that synchronizes a class reports what is still
--    on it. After a Program Manager requests closure, the class closes only when
--    every registered device has reported clean since the request, or a manager
--    released a lost device with a reason. close_class_authoritatively becomes
--    reachable only through close_class_with_device_gate.
--
-- Prerequisites (checked below): public.evaluations, public.classes,
-- private.can_view_class(uuid), private.can_manage_base(uuid),
-- public.close_class_authoritatively(uuid). Back up the database first.
-- Deploy the 3.4.13 frontend immediately after this migration: earlier
-- frontends call close_class_authoritatively directly and will be refused.

begin;

do $prereq$
begin
  if to_regclass('public.evaluations') is null or to_regclass('public.classes') is null then
    raise exception 'RaPS prerequisite tables are missing';
  end if;
  if to_regprocedure('private.can_view_class(uuid)') is null or to_regprocedure('private.can_manage_base(uuid)') is null then
    raise exception 'RaPS permission helpers are missing; apply 20261017_operational_permission_guards.sql first';
  end if;
  if to_regprocedure('public.close_class_authoritatively(uuid)') is null then
    raise exception 'public.close_class_authoritatively(uuid) is missing; this migration gates the existing close RPC';
  end if;
  if to_regprocedure('public.close_class_with_device_gate(uuid)') is not null then
    raise exception 'Closure gate already installed; review before re-applying';
  end if;
end;
$prereq$;

-- ---------------------------------------------------------------------------
-- 1. Field evidence confirmation
-- ---------------------------------------------------------------------------
create or replace function public.confirm_offline_evaluation_audit(
  p_evaluation_id uuid, p_field_started_at timestamptz, p_field_finalized_at timestamptz,
  p_field_result text, p_source_device_id text default null
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_eval public.evaluations%rowtype;
  v_field_result text := upper(trim(coalesce(p_field_result, '')));
  v_started_ms bigint; v_finalized_ms bigint; v_existing_result text;
begin
  if v_uid is null then raise exception using errcode = '42501', message = 'Authenticated RaPS session required'; end if;
  if p_evaluation_id is null or p_field_started_at is null or p_field_finalized_at is null or v_field_result = '' then
    raise exception 'Evaluation ID, field timestamps, and field result are required';
  end if;
  if p_field_finalized_at < p_field_started_at then
    raise exception 'Field finalization time cannot precede field start time';
  end if;
  if p_field_finalized_at > v_now + interval '5 minutes' then
    raise exception 'Field finalization time cannot be in the future';
  end if;

  select * into v_eval from public.evaluations where id = p_evaluation_id for update;
  if not found then return jsonb_build_object('ok', false, 'confirmed', false, 'reason', 'evaluation_not_found'); end if;
  if v_eval.evaluator_id is distinct from v_uid then
    return jsonb_build_object('ok', false, 'confirmed', false, 'reason', 'evaluation_owned_by_other_evaluator');
  end if;
  if v_eval.status::text <> 'finalized' then
    return jsonb_build_object('ok', false, 'confirmed', false, 'reason', 'evaluation_not_finalized');
  end if;
  if coalesce(v_eval.app_data->'serverAuditConfirmation', 'null'::jsonb) <> 'null'::jsonb then
    return jsonb_build_object('ok', true, 'confirmed', true, 'alreadyConfirmed', true, 'evaluationId', v_eval.id,
      'confirmedAt', v_eval.app_data->'serverAuditConfirmation'->>'confirmedAt');
  end if;

  -- The evidence must have been uploaded before finalization, unchanged.
  begin
    v_started_ms := nullif(v_eval.app_data->>'fieldStartedAt', '')::numeric::bigint;
    v_finalized_ms := nullif(v_eval.app_data->>'fieldFinalizedAt', '')::numeric::bigint;
  exception when others then
    return jsonb_build_object('ok', false, 'confirmed', false, 'reason', 'invalid_existing_field_evidence');
  end;
  v_existing_result := upper(trim(coalesce(v_eval.app_data->>'fieldFinalResult', '')));
  if v_started_ms is null or v_finalized_ms is null or v_existing_result = '' then
    return jsonb_build_object('ok', false, 'confirmed', false, 'reason', 'missing_preexisting_field_evidence');
  end if;
  if v_started_ms <> floor(extract(epoch from p_field_started_at) * 1000)::bigint
     or v_finalized_ms <> floor(extract(epoch from p_field_finalized_at) * 1000)::bigint
     or v_existing_result <> v_field_result then
    return jsonb_build_object('ok', false, 'confirmed', false, 'reason', 'field_evidence_changed_after_upload');
  end if;
  if upper(coalesce(v_eval.overall_result::text, '')) <> v_field_result then
    -- Server result is official. Record the difference for review.
    update public.evaluations set app_data = coalesce(app_data, '{}'::jsonb) || jsonb_build_object(
        'serverVerificationStatus', 'result_differs',
        'serverAuditConfirmation', jsonb_build_object('confirmedAt', v_now, 'confirmedBy', v_uid,
          'fieldResult', v_field_result, 'serverResult', upper(v_eval.overall_result::text), 'resultDiffers', true))
      where id = p_evaluation_id;
    return jsonb_build_object('ok', true, 'confirmed', false, 'reason', 'field_result_mismatch',
      'serverResult', upper(v_eval.overall_result::text), 'fieldResult', v_field_result);
  end if;

  update public.evaluations set
      app_data = coalesce(app_data, '{}'::jsonb) || jsonb_build_object(
        'serverVerificationStatus', 'verified',
        'serverClaimedAt', v_eval.started_at,
        'serverVerifiedAt', v_eval.completed_at,
        'serverAuditConfirmation', jsonb_strip_nulls(jsonb_build_object(
          'confirmedAt', v_now, 'confirmedBy', v_uid, 'sourceDeviceId', nullif(trim(p_source_device_id), '')))),
      started_at = p_field_started_at
    where id = p_evaluation_id
    returning * into v_eval;
  return jsonb_build_object('ok', true, 'confirmed', true, 'evaluationId', v_eval.id,
    'serverVerifiedAt', v_eval.completed_at, 'confirmedAt', v_now);
end;
$function$;
revoke all on function public.confirm_offline_evaluation_audit(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.confirm_offline_evaluation_audit(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Attempt 2 retest rules
-- ---------------------------------------------------------------------------
create or replace function private.raps_retest_rules()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_first record;
begin
  if new.attempt_number is distinct from 2 or new.status::text = 'voided' then return new; end if;
  if tg_op = 'UPDATE' and new.evaluator_id is not distinct from old.evaluator_id
     and new.attempt_number is not distinct from old.attempt_number then
    return new;
  end if;
  select e.evaluator_id, e.status::text as status, lower(coalesce(e.overall_result::text, '')) as result
    into v_first
    from public.evaluations e
   where e.event_id = new.event_id and e.participant_id = new.participant_id
     and e.attempt_number = 1 and e.status::text <> 'voided'
   order by (e.status::text = 'finalized') desc
   limit 1;
  if not found or v_first.status <> 'finalized' or v_first.result <> 'fail' then
    raise exception using errcode = 'P0001', message = 'Attempt 2 requires a finalized Attempt 1 FAIL on the server';
  end if;
  if v_first.evaluator_id is not distinct from new.evaluator_id then
    raise exception using errcode = 'P0001', message = 'Attempt 2 retest requires a different evaluator than Attempt 1';
  end if;
  return new;
end;
$function$;
revoke all on function private.raps_retest_rules() from public, anon, authenticated;
drop trigger if exists raps_retest_rules on public.evaluations;
create trigger raps_retest_rules before insert or update of evaluator_id, attempt_number on public.evaluations
  for each row execute function private.raps_retest_rules();

-- ---------------------------------------------------------------------------
-- 3. Closure gate
-- ---------------------------------------------------------------------------
create table public.class_device_checkins (
  class_id uuid not null references public.classes(id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 120),
  user_id uuid not null,
  device_label text check (device_label is null or length(device_label) <= 120),
  first_seen_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  pending_count integer not null default 0 check (pending_count >= 0),
  last_clean_at timestamptz,
  released_at timestamptz,
  released_by uuid,
  release_reason text,
  primary key (class_id, device_id)
);
create table public.class_closure_requests (
  class_id uuid primary key references public.classes(id) on delete cascade,
  requested_at timestamptz not null default now(),
  requested_by uuid not null
);
alter table public.class_device_checkins enable row level security;
alter table public.class_closure_requests enable row level security;
revoke all on public.class_device_checkins, public.class_closure_requests from public, anon, authenticated;
grant select on public.class_device_checkins, public.class_closure_requests to authenticated;
create policy "Class viewers read device check-ins" on public.class_device_checkins
  for select to authenticated using (private.can_view_class(class_id));
create policy "Class viewers read closure requests" on public.class_closure_requests
  for select to authenticated using (private.can_view_class(class_id));

do $audit$
begin
  if to_regprocedure('private.audit_change()') is not null then
    execute 'create trigger audit_class_device_checkins after insert or update or delete on public.class_device_checkins for each row execute function private.audit_change()';
    execute 'create trigger audit_class_closure_requests after insert or update or delete on public.class_closure_requests for each row execute function private.audit_change()';
  end if;
end;
$audit$;

create or replace function private.raps_class_base(p_class_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select base_id from public.classes where id = p_class_id;
$$;
revoke all on function private.raps_class_base(uuid) from public, anon, authenticated;

create or replace function public.report_class_device_sync(
  p_class_id uuid, p_device_id text, p_device_label text, p_pending_count integer
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_now timestamptz := clock_timestamp(); v_status text; v_req public.class_closure_requests%rowtype;
begin
  if v_uid is null or not private.can_view_class(p_class_id) then
    raise exception using errcode = '42501', message = 'Current access to this class is required';
  end if;
  if p_device_id is null or length(trim(p_device_id)) not between 1 and 120 then raise exception 'A device identifier is required'; end if;
  if p_pending_count is null or p_pending_count < 0 then raise exception 'Pending count must be zero or more'; end if;
  select status::text into v_status from public.classes where id = p_class_id;
  if v_status = 'completed' then return jsonb_build_object('ok', true, 'classClosed', true); end if;

  insert into public.class_device_checkins as d (class_id, device_id, user_id, device_label, last_reported_at, pending_count, last_clean_at)
  values (p_class_id, trim(p_device_id), v_uid, left(nullif(trim(p_device_label), ''), 120), v_now, p_pending_count,
          case when p_pending_count = 0 then v_now end)
  on conflict (class_id, device_id) do update set
    user_id = excluded.user_id,
    device_label = coalesce(excluded.device_label, d.device_label),
    last_reported_at = v_now,
    pending_count = excluded.pending_count,
    last_clean_at = case when excluded.pending_count = 0 then v_now else d.last_clean_at end,
    -- A released device that returns with records re-enters the gate.
    released_at = case when excluded.pending_count > 0 then null else d.released_at end,
    released_by = case when excluded.pending_count > 0 then null else d.released_by end,
    release_reason = case when excluded.pending_count > 0 then null else d.release_reason end;

  select * into v_req from public.class_closure_requests where class_id = p_class_id;
  return jsonb_build_object('ok', true, 'reportedAt', v_now, 'pending', p_pending_count,
    'closureRequestedAt', v_req.requested_at);
end;
$function$;

create or replace function public.class_device_closure_status(p_class_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare v_req public.class_closure_requests%rowtype; v_devices jsonb; v_waiting integer;
begin
  if auth.uid() is null or not private.can_view_class(p_class_id) then
    raise exception using errcode = '42501', message = 'Current access to this class is required';
  end if;
  select * into v_req from public.class_closure_requests where class_id = p_class_id;
  select coalesce(jsonb_agg(jsonb_build_object(
      'deviceId', d.device_id, 'label', d.device_label, 'userId', d.user_id,
      'lastReportedAt', d.last_reported_at, 'pendingCount', d.pending_count, 'lastCleanAt', d.last_clean_at,
      'releasedAt', d.released_at, 'releaseReason', d.release_reason,
      'checkedIn', v_req.class_id is not null and d.pending_count = 0 and d.last_clean_at >= v_req.requested_at
    ) order by d.device_label, d.device_id), '[]'::jsonb),
    count(*) filter (where d.released_at is null and not (v_req.class_id is not null and d.pending_count = 0 and d.last_clean_at >= v_req.requested_at))
    into v_devices, v_waiting
    from public.class_device_checkins d where d.class_id = p_class_id;
  return jsonb_build_object('ok', true, 'closureRequestedAt', v_req.requested_at, 'requestedBy', v_req.requested_by,
    'devices', v_devices, 'waiting', v_waiting,
    'ready', v_req.class_id is not null and v_waiting = 0);
end;
$function$;

create or replace function public.request_class_closure(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_base uuid := private.raps_class_base(p_class_id); v_status text;
begin
  if v_uid is null or v_base is null or not private.can_manage_base(v_base) then
    raise exception using errcode = '42501', message = 'An installation Program Manager or Enterprise Admin must request class closure';
  end if;
  select status::text into v_status from public.classes where id = p_class_id;
  if v_status = 'completed' then raise exception 'This class is already closed'; end if;
  -- Requesting again starts a new check-in round.
  insert into public.class_closure_requests (class_id, requested_at, requested_by) values (p_class_id, clock_timestamp(), v_uid)
  on conflict (class_id) do update set requested_at = excluded.requested_at, requested_by = excluded.requested_by;
  return public.class_device_closure_status(p_class_id);
end;
$function$;

create or replace function public.release_class_device(p_class_id uuid, p_device_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_base uuid := private.raps_class_base(p_class_id);
begin
  if v_uid is null or v_base is null or not private.can_manage_base(v_base) then
    raise exception using errcode = '42501', message = 'An installation Program Manager or Enterprise Admin must release a device';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Record why this device is being released (at least 5 characters)'; end if;
  update public.class_device_checkins set released_at = clock_timestamp(), released_by = v_uid, release_reason = left(trim(p_reason), 500)
   where class_id = p_class_id and device_id = p_device_id;
  if not found then raise exception 'Device is not registered for this class'; end if;
  return public.class_device_closure_status(p_class_id);
end;
$function$;

create or replace function public.close_class_with_device_gate(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_uid uuid := auth.uid(); v_base uuid := private.raps_class_base(p_class_id); v_status jsonb; v_issues jsonb;
begin
  if v_uid is null or v_base is null or not private.can_manage_base(v_base) then
    raise exception using errcode = '42501', message = 'An active installation Program Manager or Enterprise Admin must close this class';
  end if;
  -- Serialize closure attempts and check-ins for this class.
  perform 1 from public.classes where id = p_class_id for update;
  v_status := public.class_device_closure_status(p_class_id);
  if (v_status->>'closureRequestedAt') is null then
    return jsonb_build_object('closed', false, 'issues', jsonb_build_array('Select Prepare to Close first, then have every phone use Sync Classes.'));
  end if;
  select coalesce(jsonb_agg(coalesce(x->>'label', x->>'deviceId') || ': ' ||
           case when (x->>'pendingCount')::int > 0 then (x->>'pendingCount') || ' item(s) still on this device'
                else 'has not synced since closure was requested' end), '[]'::jsonb)
    into v_issues
    from jsonb_array_elements(v_status->'devices') x
   where x->>'releasedAt' is null and not (x->>'checkedIn')::boolean;
  if jsonb_array_length(v_issues) > 0 then
    return jsonb_build_object('closed', false, 'issues', v_issues, 'devices', v_status->'devices');
  end if;
  return to_jsonb(public.close_class_authoritatively(p_class_id));
end;
$function$;

revoke all on function public.report_class_device_sync(uuid, text, text, integer),
  public.class_device_closure_status(uuid), public.request_class_closure(uuid),
  public.release_class_device(uuid, text, text), public.close_class_with_device_gate(uuid) from public, anon;
grant execute on function public.report_class_device_sync(uuid, text, text, integer),
  public.class_device_closure_status(uuid), public.request_class_closure(uuid),
  public.release_class_device(uuid, text, text), public.close_class_with_device_gate(uuid) to authenticated;

-- The gate is the only route to closure for browser sessions.
revoke execute on function public.close_class_authoritatively(uuid) from public, anon, authenticated;

commit;
