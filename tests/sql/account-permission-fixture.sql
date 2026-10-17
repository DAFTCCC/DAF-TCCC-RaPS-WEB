\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create schema test;
grant usage on schema auth, private, test to anon, authenticated, service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create type public.fixture_role as enum ('enterprise_admin','majcom_manager','program_manager','evaluator','unsupported');
create type public.fixture_status as enum ('pending','approved','denied');
create table public.majcoms (id uuid primary key, active boolean not null default true);
create table public.bases (id uuid primary key, majcom_id uuid not null references public.majcoms, active boolean not null default true);
create table public.profiles (
  id uuid primary key, email text, display_name text, rank_text text,
  organization_text text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), is_admin boolean not null default false
);
create table public.memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  role :role_type not null, base_id uuid references public.bases,
  majcom_id uuid references public.majcoms, active boolean not null default true,
  starts_at timestamptz default now(), ends_at timestamptz, created_by uuid,
  created_at timestamptz not null default now()
);
create table public.access_requests (
  id uuid primary key default gen_random_uuid(), email text not null,
  display_name text not null, requested_role :role_type not null,
  base_id uuid references public.bases, majcom_id uuid references public.majcoms,
  justification text, status :status_type not null default 'pending',
  created_at timestamptz not null default now(), reviewed_at timestamptz,
  reviewed_by uuid, review_note text
);
alter table public.memberships enable row level security;
alter table public.access_requests enable row level security;
alter table public.profiles enable row level security;
-- Deliberately unsafe baseline: the guards must constrain a union of permissive
-- policies, not rely on a UI check or a friendly fake policy to deny escalation.
create policy fixture_permissive on public.memberships for all to public using (true) with check (true);
create policy fixture_permissive on public.access_requests for all to public using (true) with check (true);
create policy fixture_permissive on public.profiles for all to public using (true) with check (true);
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
insert into public.profiles(id,email,display_name)
select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  'synthetic-'||n||'@example.invalid','Synthetic '||n from generate_series(1,9) n;

insert into public.majcoms values
  ('10000000-0000-0000-0000-000000000001',true),
  ('10000000-0000-0000-0000-000000000002',false);
insert into public.bases values
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
  ('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',false),
  ('11000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',true);
insert into public.memberships(id,user_id,role,base_id,majcom_id,active,starts_at,ends_at) values
  ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','enterprise_admin',null,null,true,now()-interval '1 day',null),
  ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','enterprise_admin',null,null,true,now()-interval '1 day',null),
  ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','evaluator','11000000-0000-0000-0000-000000000001',null,true,null,null),
  ('20000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','program_manager','11000000-0000-0000-0000-000000000001',null,true,null,null),
  ('20000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','majcom_manager',null,'10000000-0000-0000-0000-000000000001',true,null,null),
  ('20000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000006','enterprise_admin',null,null,true,null,now()-interval '1 day'),
  ('20000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000007','enterprise_admin',null,null,true,now()+interval '1 day',null),
  ('20000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000008','enterprise_admin',null,null,false,null,null),
  ('20000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000009','enterprise_admin','11000000-0000-0000-0000-000000000001',null,true,null,null);
insert into public.access_requests(id,email,display_name,requested_role,base_id) values
  ('30000000-0000-0000-0000-000000000001','synthetic@example.invalid','Synthetic Learner','evaluator','11000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002','second@example.invalid','Second Learner','evaluator','11000000-0000-0000-0000-000000000001');

create function test.assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Assertion failed: %', message; end if; end;
$$;
create function test.expect_error(command text, expected_code text) returns void language plpgsql as $$
declare actual_code text;
begin
  begin execute command;
  exception when others then
    get stacked diagnostics actual_code = returned_sqlstate;
    if actual_code = expected_code then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %', expected_code, actual_code, sqlerrm;
  end;
  raise exception 'Expected SQLSTATE %, but command succeeded: %', expected_code, command;
end;
$$;
create function test.expect_affected(command text, expected_count bigint) returns void language plpgsql as $$
declare affected bigint;
begin
  execute command;
  get diagnostics affected = row_count;
  perform test.assert(affected=expected_count,format('Expected %s affected rows, got %s',expected_count,affected));
end;
$$;
-- Models an existing, unsafe RPC owned by the RLS-bypassing DB administrator.
-- The trigger must still reject a non-admin caller rather than trusting the RPC.
create function public.fixture_unsafe_assign(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin insert into public.memberships(user_id,role) values(target,'enterprise_admin'); end;
$$;
create function public.fixture_unsafe_delete(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin delete from public.memberships where id = target; end;
$$;
create function public.fixture_unsafe_review(target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin update public.access_requests set status='approved' where id=target; end;
$$;
create function public.fixture_unsafe_profile_email(target uuid, address text) returns void
language plpgsql security definer set search_path = '' as $$
begin update public.profiles set email=address where id=target; end;
$$;
