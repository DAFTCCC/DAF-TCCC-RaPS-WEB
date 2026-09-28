-- RaPS Phase 7M follow-up: suppress meaningless audit UPDATE churn.
-- Safe to run more than once.
--
-- The production acceptance test proved provenance works, but ordinary sync
-- upserts can issue UPDATE statements even when the meaningful row contents
-- did not change. Tables with private.set_updated_at() can also differ only
-- by server-maintained updated_at.
--
-- This function keeps every real INSERT/DELETE and every meaningful UPDATE,
-- while skipping UPDATE audit rows where OLD and NEW are identical after
-- excluding updated_at.

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

    -- Suppress sync/upsert churn when nothing meaningful changed.
    -- updated_at is server-maintained and is not itself an auditable business
    -- change. All other fields, including client_modified_at, source_device_id,
    -- app_data, grading results, timer state, and lifecycle status remain part
    -- of the comparison and therefore remain auditable.
    if (v_old_value - 'updated_at') = (v_new_value - 'updated_at') then
      return new;
    end if;

    v_entity_source := v_new_value;

  else
    v_new_value := to_jsonb(new);
    v_entity_source := v_new_value;
  end if;

  v_entity_id := nullif(
    coalesce(
      v_entity_source ->> 'id',
      v_entity_source ->> 'original_class_id'
    ),
    ''
  )::uuid;

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

commit;

-- Verification: definition should include the updated_at-normalized comparison.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'private'
  and p.proname = 'audit_change'
  and p.prokind = 'f';
