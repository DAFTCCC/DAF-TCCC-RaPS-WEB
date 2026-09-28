-- RaPS Phase 7M: audit-log completeness and provenance hardening
-- Safe to run more than once.
--
-- Goals:
--   * preserve the existing audit history
--   * add row-level audit coverage for previously uncovered operational tables
--   * make system/service-role audit rows explicitly recognizable
--   * support closed_class_archives, whose entity key is original_class_id
--   * prevent browser roles from mutating or truncating the audit ledger
--   * add indexes needed for provenance review at production scale

begin;

create or replace function private.audit_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_actor_user_id uuid := auth.uid();
  v_entity_id uuid;
  v_old_value jsonb;
  v_new_value jsonb;
  v_entity_source jsonb;
  v_reason text;
begin
  if tg_op = 'DELETE' then
    v_old_value := to_jsonb(old);
    v_entity_source := v_old_value;
  elsif tg_op = 'UPDATE' then
    v_old_value := to_jsonb(old);
    v_new_value := to_jsonb(new);
    v_entity_source := v_new_value;
  else
    v_new_value := to_jsonb(new);
    v_entity_source := v_new_value;
  end if;

  -- Most audited tables use id. Closed-class archives intentionally use
  -- original_class_id as their stable business key.
  v_entity_id := nullif(
    coalesce(
      v_entity_source ->> 'id',
      v_entity_source ->> 'original_class_id'
    ),
    ''
  )::uuid;

  -- auth.uid() is NULL for service-role workers, cascades, migrations, and
  -- maintenance sessions. Preserve that distinction rather than pretending
  -- a human actor performed the operation.
  if v_actor_user_id is null then
    v_reason := 'Non-user database context (service role/system/maintenance)';
  end if;

  insert into public.audit_log (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    reason
  )
  values (
    v_actor_user_id,
    tg_op,
    tg_table_name,
    v_entity_id,
    v_old_value,
    v_new_value,
    v_reason
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

-- -------------------------------------------------------------------------
-- Missing immutable event coverage
-- -------------------------------------------------------------------------

drop trigger if exists audit_participants on public.participants;
create trigger audit_participants
after insert or update or delete on public.participants
for each row execute function private.audit_change();

drop trigger if exists audit_criterion_results on public.criterion_results;
create trigger audit_criterion_results
after insert or update or delete on public.criterion_results
for each row execute function private.audit_change();

drop trigger if exists audit_timer_results on public.timer_results;
create trigger audit_timer_results
after insert or update or delete on public.timer_results
for each row execute function private.audit_change();

drop trigger if exists audit_access_requests on public.access_requests;
create trigger audit_access_requests
after insert or update or delete on public.access_requests
for each row execute function private.audit_change();

drop trigger if exists audit_closed_class_archives on public.closed_class_archives;
create trigger audit_closed_class_archives
after insert or update or delete on public.closed_class_archives
for each row execute function private.audit_change();

drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles
after insert or update or delete on public.profiles
for each row execute function private.audit_change();

-- -------------------------------------------------------------------------
-- Ledger hardening
-- Browser roles may never insert/update/delete/truncate audit evidence.
-- Enterprise visibility remains controlled by the existing SELECT RLS policy.
-- -------------------------------------------------------------------------

revoke all privileges on table public.audit_log from anon;
revoke all privileges on table public.audit_log from authenticated;
grant select on table public.audit_log to authenticated;

-- -------------------------------------------------------------------------
-- Provenance-review indexes
-- -------------------------------------------------------------------------

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_entity_created_at_idx
  on public.audit_log (entity_type, entity_id, created_at desc);

create index if not exists audit_log_actor_created_at_idx
  on public.audit_log (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index if not exists audit_log_action_created_at_idx
  on public.audit_log (action, created_at desc);

commit;

-- -------------------------------------------------------------------------
-- Verification
-- -------------------------------------------------------------------------

select
  event_object_table as table_name,
  trigger_name,
  string_agg(event_manipulation, ',' order by event_manipulation) as operations
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in (
    'audit_participants',
    'audit_criterion_results',
    'audit_timer_results',
    'audit_access_requests',
    'audit_closed_class_archives',
    'audit_profiles'
  )
group by event_object_table, trigger_name
order by event_object_table;

select
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'audit_log'
  and grantee in ('anon','authenticated','service_role')
order by grantee, privilege_type;

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'audit_log'
order by indexname;
