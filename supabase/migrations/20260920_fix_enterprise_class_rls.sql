-- RaPS RLS fix: allow active Enterprise Admins to fully manage classes.
-- This is intentionally additive and does not weaken base/MAJCOM-scoped policies.
-- Safe to run more than once.

drop policy if exists "Enterprise admins manage classes" on public.classes;

create policy "Enterprise admins manage classes"
on public.classes
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

-- Verification
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'classes'
order by policyname;
