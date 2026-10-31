\set ON_ERROR_STOP on
-- Synthetic, network-isolated schema for 20261101_offline_field_finalization.sql.
-- Mirrors the deployed shapes the migration depends on; no production data.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
grant usage on schema auth, private to anon, authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.bases (id uuid primary key);
create table public.memberships (user_id uuid not null, role text not null, base_id uuid, active boolean not null default true);
create table public.classes (id uuid primary key, base_id uuid references public.bases, created_by uuid, status text not null default 'active', name text);
create table public.class_evaluators (class_id uuid references public.classes, evaluator_id uuid);
create table public.evaluation_events (id uuid primary key, class_id uuid references public.classes, base_id uuid);
create table public.participants (id uuid primary key, display_name text);
create table public.evaluations (
  id uuid primary key default gen_random_uuid(), event_id uuid references public.evaluation_events,
  participant_id uuid references public.participants, evaluator_id uuid, attempt_number integer not null default 1,
  status text not null default 'draft', overall_result text, started_at timestamptz, completed_at timestamptz,
  app_data jsonb not null default '{}', client_modified_at timestamptz, source_device_id text
);
grant select, insert, update on public.evaluations to authenticated;
grant select on public.classes, public.class_evaluators, public.evaluation_events, public.participants to authenticated;

create function private.is_enterprise_admin() returns boolean language sql stable security definer set search_path='' as
  $$select exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role='enterprise_admin' and m.active)$$;
create function private.can_manage_base(p_base_id uuid) returns boolean language sql stable security definer set search_path='' as
  $$select private.is_enterprise_admin() or exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role='program_manager' and m.base_id=p_base_id and m.active)$$;
create function private.can_view_class(p_class_id uuid) returns boolean language sql stable security definer set search_path='' as
  $$select exists(select 1 from public.classes c where c.id=p_class_id and (private.can_manage_base(c.base_id) or c.created_by=auth.uid()
    or exists(select 1 from public.class_evaluators a where a.class_id=c.id and a.evaluator_id=auth.uid())))$$;

-- Deployed behavior: browser sessions cannot write terminal evaluation states;
-- definer lifecycle RPCs (current_user is the owner) can.
create function private.fixture_lifecycle_guard() returns trigger language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (new.status in ('finalized','voided') or old.status in ('finalized','voided')) then
    raise exception using errcode='42501', message='Use the authoritative evaluation lifecycle workflow';
  end if;
  return new;
end $$;
create trigger fixture_lifecycle_guard before update on public.evaluations for each row execute function private.fixture_lifecycle_guard();

-- Stand-in for the deployed close RPC (its clinical readiness logic is not part of this test).
create function public.close_class_authoritatively(p_class_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.can_manage_base((select base_id from public.classes where id=p_class_id)) then
    raise exception using errcode='42501', message='close not permitted';
  end if;
  update public.classes set status='completed' where id=p_class_id;
  return jsonb_build_object('closed', true, 'closedAt', extract(epoch from now())*1000, 'closedBy', auth.uid());
end $$;
grant execute on function public.close_class_authoritatively(uuid) to authenticated;

-- People: one Program Manager, three evaluators, one outsider.
insert into public.bases values ('00000000-0000-0000-0000-0000000000b1');
insert into public.memberships values
  ('00000000-0000-0000-0000-00000000000a','program_manager','00000000-0000-0000-0000-0000000000b1',true),
  ('00000000-0000-0000-0000-0000000000e1','evaluator','00000000-0000-0000-0000-0000000000b1',true),
  ('00000000-0000-0000-0000-0000000000e2','evaluator','00000000-0000-0000-0000-0000000000b1',true),
  ('00000000-0000-0000-0000-0000000000e3','evaluator','00000000-0000-0000-0000-0000000000b1',true);
insert into public.classes values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000a','active','Field class');
insert into public.class_evaluators values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e3');
insert into public.evaluation_events values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1');
insert into public.participants select ('00000000-0000-0000-0000-0000000001' || lpad(n::text,2,'0'))::uuid, 'Student '||n from generate_series(1,18) n;
