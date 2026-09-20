-- RaPS Phase 4: full grading sync metadata
-- Safe to run more than once.

begin;

alter table public.criterion_results
  add column if not exists app_data jsonb not null default '{}'::jsonb;

alter table public.criterion_results
  add column if not exists client_modified_at timestamp with time zone;

alter table public.criterion_results
  add column if not exists source_device_id text;

alter table public.timer_results
  add column if not exists sync_key text;

alter table public.timer_results
  add column if not exists app_data jsonb not null default '{}'::jsonb;

alter table public.timer_results
  add column if not exists client_modified_at timestamp with time zone;

alter table public.timer_results
  add column if not exists source_device_id text;

update public.timer_results
set sync_key = coalesce(sync_key, 'legacy-' || id::text)
where sync_key is null;

alter table public.timer_results
  alter column sync_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.timer_results'::regclass
      and conname = 'timer_results_evaluation_id_sync_key_key'
  ) then
    alter table public.timer_results
      add constraint timer_results_evaluation_id_sync_key_key
      unique (evaluation_id, sync_key);
  end if;
end
$$;

create index if not exists criterion_results_client_modified_idx
  on public.criterion_results (client_modified_at desc);

create index if not exists timer_results_client_modified_idx
  on public.timer_results (client_modified_at desc);

commit;

-- Verification
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('criterion_results','timer_results')
  and column_name in ('app_data','client_modified_at','source_device_id','sync_key')
order by table_name, column_name;

select
  c.conrelid::regclass::text as table_name,
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.timer_results'::regclass
  and c.conname = 'timer_results_evaluation_id_sync_key_key';
