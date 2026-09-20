-- RaPS Phase 5: enterprise user and membership administration
-- Safe to run more than once.
-- Uses the existing SECURITY DEFINER helper private.is_enterprise_admin()
-- to avoid recursive RLS checks on memberships.

begin;

drop policy if exists "Enterprise admins view all profiles" on public.profiles;
create policy "Enterprise admins view all profiles"
on public.profiles
for select
to authenticated
using (private.is_enterprise_admin());

drop policy if exists "Enterprise admins manage memberships" on public.memberships;
create policy "Enterprise admins manage memberships"
on public.memberships
for all
to authenticated
using (private.is_enterprise_admin())
with check (private.is_enterprise_admin());

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.memberships to authenticated;

commit;

-- Verification
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and (
    (tablename = 'profiles' and policyname = 'Enterprise admins view all profiles')
    or
    (tablename = 'memberships' and policyname = 'Enterprise admins manage memberships')
  )
order by tablename, policyname;
