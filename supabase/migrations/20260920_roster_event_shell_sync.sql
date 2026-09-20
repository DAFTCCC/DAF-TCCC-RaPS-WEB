-- RaPS Phase 3: roster + evaluation-event shell cloud sync
-- Safe to run more than once.
-- Adds non-clinical app metadata to participant/event/evaluation shell records,
-- plus explicit Enterprise Admin RLS coverage for these three tables.

begin;

alter table public.participants
  add column if not exists app_data jsonb not null default '{}'::jsonb;

alter table public.participants
  add column if not exists client_modified_at timestamp with time zone;

alter table public.participants
  add column if not exists source_device_id text;

alter table public.evaluation_events
  add column if not exists app_data jsonb not null default '{}'::jsonb;

alter table public.evaluation_events
  add column if not exists client_modified_at timestamp with time zone;

alter table public.evaluation_events
  add column if not exists source_device_id text;

alter table public.evaluations
  add column if not exists app_data jsonb not null default '{}'::jsonb;

alter table public.evaluations
  add column if not exists client_modified_at timestamp with time zone;

alter table public.evaluations
  add column if not exists source_device_id text;

create index if not exists participants_client_modified_idx
  on public.participants (client_modified_at desc);

create index if not exists evaluation_events_class_updated_idx
  on public.evaluation_events (class_id, updated_at desc);

create index if not exists evaluations_event_updated_idx
  on public.evaluations (event_id, updated_at desc);

drop policy if exists "Enterprise admins manage participants" on public.participants;
create policy "Enterprise admins manage participants"
on public.participants
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role::text = 'enterprise_admin'
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at > now())
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role::text = 'enterprise_admin'
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at > now())
  )
);

drop policy if exists "Enterprise admins manage evaluation events" on public.evaluation_events;
create policy "Enterprise admins manage evaluation events"
on public.evaluation_events
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role::text = 'enterprise_admin'
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at > now())
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role::text = 'enterprise_admin'
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at > now())
  )
);

drop policy if exists "Enterprise admins manage evaluations" on public.evaluations;
create policy "Enterprise admins manage evaluations"
on public.evaluations
for all
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role::text = 'enterprise_admin'
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at > now())
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.active = true
      and m.role::text = 'enterprise_admin'
      and (m.starts_at is null or m.starts_at <= now())
      and (m.ends_at is null or m.ends_at > now())
  )
);

commit;

-- Verification
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('participants','evaluation_events','evaluations')
  and column_name in ('app_data','client_modified_at','source_device_id')
order by table_name, column_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('participants','evaluation_events','evaluations')
  and policyname like 'Enterprise admins manage%'
order by tablename, policyname;
