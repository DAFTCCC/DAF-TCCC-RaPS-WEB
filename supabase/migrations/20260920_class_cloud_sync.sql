-- RaPS Phase 2: class cloud-sync metadata
-- Safe to run more than once.
-- Adds only application-sync metadata to public.classes.
begin;

alter table public.classes
  add column if not exists app_data jsonb not null default '{}'::jsonb;

alter table public.classes
  add column if not exists client_modified_at timestamp with time zone;

alter table public.classes
  add column if not exists source_device_id text;

create index if not exists classes_base_updated_idx
  on public.classes (base_id, updated_at desc);

create index if not exists classes_client_modified_idx
  on public.classes (client_modified_at desc);

commit;

-- Verification: expect 3 rows.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'classes'
  and column_name in ('app_data','client_modified_at','source_device_id')
order by column_name;
