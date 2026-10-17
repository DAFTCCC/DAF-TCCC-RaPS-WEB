\set ON_ERROR_STOP on
select :'phase'='baseline' as baseline \gset
\if :baseline
-- Synthetic tables and cleaned authorization helpers from the user's deployed
-- NUC audit (17 Oct 2026). No clinical scoring/RPC implementation is fabricated.
create type public.fixture_operational_status as enum ('draft','active','open','closed','completed','cancelled','archived','in_progress','submitted','finalized','voided');
create type public.fixture_result as enum ('pass','fail');
create table public.curriculum_versions(id uuid primary key,published boolean not null default true);
create table public.criteria(id uuid primary key,curriculum_version_id uuid references public.curriculum_versions, active boolean default true);
create table public.scenarios(id uuid primary key default gen_random_uuid(),published boolean not null default true);
create table public.classes(id uuid primary key default gen_random_uuid(),base_id uuid references public.bases,created_by uuid,status :ops_status not null default 'draft',app_data jsonb not null default '{}',name text);
create table public.evaluation_events(id uuid primary key default gen_random_uuid(),class_id uuid references public.classes,base_id uuid references public.bases,created_by uuid,curriculum_version_id uuid references public.curriculum_versions,status :ops_status not null default 'open',name text);
create table public.participants(id uuid primary key default gen_random_uuid(),home_base_id uuid references public.bases,created_by uuid,display_name text);
create table public.evaluations(id uuid primary key default gen_random_uuid(),event_id uuid references public.evaluation_events,participant_id uuid references public.participants,evaluator_id uuid,curriculum_version_id uuid references public.curriculum_versions,attempt_number integer default 1,status :ops_status not null default 'draft',overall_result :ops_result,completed_at timestamptz,notes text);
create table public.class_evaluators(id uuid primary key default gen_random_uuid(),class_id uuid references public.classes,evaluator_id uuid);
create table public.event_evaluators(id uuid primary key default gen_random_uuid(),event_id uuid references public.evaluation_events,evaluator_id uuid);
create table public.criterion_results(id uuid primary key default gen_random_uuid(),evaluation_id uuid references public.evaluations,criterion_id uuid references public.criteria,result text);
create table public.timer_results(id uuid primary key default gen_random_uuid(),evaluation_id uuid references public.evaluations,criterion_id uuid references public.criteria,elapsed integer);
create table public.audit_log(id uuid primary key default gen_random_uuid(),action text);
create table public.closed_class_archives(id uuid primary key default gen_random_uuid(),status text);
create function private.is_enterprise_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role::text='enterprise_admin' and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()));$$;
create function private.can_create_at_base(p_base_id uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_enterprise_admin() or exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role::text in ('evaluator','program_manager') and m.base_id=p_base_id and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()));$$;
create function private.can_manage_base(p_base_id uuid) returns boolean language sql stable security definer set search_path='' as $$select private.is_enterprise_admin() or exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role::text='program_manager' and m.base_id=p_base_id and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()));$$;
create function private.can_oversee_base(p_base_id uuid) returns boolean language sql stable security definer set search_path='' as $$select private.can_manage_base(p_base_id) or exists(select 1 from public.memberships m join public.bases b on b.majcom_id=m.majcom_id where m.user_id=auth.uid() and m.role::text='majcom_manager' and b.id=p_base_id and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()));$$;
create function private.can_manage_class(p_class_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.classes c where c.id=p_class_id and (private.can_manage_base(c.base_id) or c.created_by=auth.uid()));$$;
create function private.can_view_class(p_class_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.classes c where c.id=p_class_id and (private.can_oversee_base(c.base_id) or c.created_by=auth.uid() or exists(select 1 from public.class_evaluators a where a.class_id=c.id and a.evaluator_id=auth.uid())));$$;
create function private.can_manage_event(p_event_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.evaluation_events e where e.id=p_event_id and (private.can_manage_base(e.base_id) or e.created_by=auth.uid() or private.can_manage_class(e.class_id)));$$;
create function private.can_grade_event(p_event_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.evaluation_events e where e.id=p_event_id and (private.can_manage_base(e.base_id) or e.created_by=auth.uid() or exists(select 1 from public.event_evaluators a where a.event_id=e.id and a.evaluator_id=auth.uid()) or exists(select 1 from public.class_evaluators a where a.class_id=e.class_id and a.evaluator_id=auth.uid())));$$;
create function private.can_view_event(p_event_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.evaluation_events e where e.id=p_event_id and (private.can_oversee_base(e.base_id) or e.created_by=auth.uid() or exists(select 1 from public.event_evaluators a where a.event_id=e.id and a.evaluator_id=auth.uid()) or (e.class_id is not null and private.can_view_class(e.class_id))));$$;
create function private.can_view_evaluation(p_evaluation_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.evaluations e where e.id=p_evaluation_id and (private.is_enterprise_admin() or e.evaluator_id=auth.uid() or private.can_view_event(e.event_id)));$$;
create function private.can_edit_evaluation(p_evaluation_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.evaluations e where e.id=p_evaluation_id and e.status::text in ('draft','in_progress') and (private.is_enterprise_admin() or e.evaluator_id=auth.uid()));$$;
create function private.can_view_participant(p_participant_id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.participants p where p.id=p_participant_id and (private.is_enterprise_admin() or p.created_by=auth.uid() or (p.home_base_id is not null and (private.can_create_at_base(p.home_base_id) or private.can_oversee_base(p.home_base_id))) or exists(select 1 from public.evaluations e where e.participant_id=p.id and private.can_view_evaluation(e.id))));$$;
create function private.can_view_membership(p_user_id uuid,p_base_id uuid,p_majcom_id uuid) returns boolean language sql stable security definer set search_path='' as $$select p_user_id=auth.uid() or private.is_enterprise_admin() or (p_base_id is not null and exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role::text='program_manager' and m.base_id=p_base_id and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()))) or (p_majcom_id is not null and exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.role::text='majcom_manager' and m.majcom_id=p_majcom_id and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now()))) or (p_base_id is not null and exists(select 1 from public.memberships m join public.bases b on b.majcom_id=m.majcom_id where m.user_id=auth.uid() and m.role::text='majcom_manager' and b.id=p_base_id and m.active=true and m.starts_at<=now() and (m.ends_at is null or m.ends_at>now())));$$;
create function private.can_view_profile(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$select p_user_id=auth.uid() or private.is_enterprise_admin() or exists(select 1 from public.memberships mine join public.memberships theirs on mine.base_id=theirs.base_id where mine.user_id=auth.uid() and theirs.user_id=p_user_id and mine.base_id is not null and mine.active=true and theirs.active=true and mine.starts_at<=now() and theirs.starts_at<=now() and (mine.ends_at is null or mine.ends_at>now()) and (theirs.ends_at is null or theirs.ends_at>now())) or exists(select 1 from public.memberships mine join public.bases b on b.majcom_id=mine.majcom_id join public.memberships theirs on theirs.base_id=b.id where mine.user_id=auth.uid() and mine.role::text='majcom_manager' and theirs.user_id=p_user_id and mine.active=true and theirs.active=true and mine.starts_at<=now() and (mine.ends_at is null or mine.ends_at>now()));$$;
alter table public.classes enable row level security;
create policy fixture_legacy_enterprise_all on public.classes for all to authenticated using(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now()))) with check(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())));
alter table public.evaluation_events enable row level security;
create policy fixture_legacy_enterprise_all on public.evaluation_events for all to authenticated using(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now()))) with check(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())));
alter table public.evaluations enable row level security;
create policy fixture_legacy_enterprise_all on public.evaluations for all to authenticated using(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now()))) with check(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())));
alter table public.participants enable row level security;
create policy fixture_legacy_enterprise_all on public.participants for all to authenticated using(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now()))) with check(exists(select 1 from public.memberships m where m.user_id=auth.uid() and m.active=true and m.role::text='enterprise_admin' and (m.starts_at is null or m.starts_at<=now()) and (m.ends_at is null or m.ends_at>now())));
alter table public.classes enable row level security;
create policy fixture_legacy_0 on public.classes for select to authenticated using(private.can_view_class(id));
create policy fixture_legacy_1 on public.classes for insert to authenticated with check(private.can_create_at_base(base_id) and (created_by=auth.uid() or private.is_enterprise_admin()));
create policy fixture_legacy_2 on public.classes for update to authenticated using(private.can_manage_class(id)) with check(private.can_create_at_base(base_id));
create policy fixture_legacy_3 on public.classes for delete to authenticated using(private.is_enterprise_admin());
alter table public.evaluation_events enable row level security;
create policy fixture_legacy_0 on public.evaluation_events for select to authenticated using(private.can_view_event(id));
create policy fixture_legacy_1 on public.evaluation_events for insert to authenticated with check(private.can_create_at_base(base_id) and (created_by=auth.uid() or private.is_enterprise_admin()));
create policy fixture_legacy_2 on public.evaluation_events for update to authenticated using(private.can_manage_event(id)) with check(private.can_create_at_base(base_id));
create policy fixture_legacy_3 on public.evaluation_events for delete to authenticated using(private.is_enterprise_admin());
alter table public.evaluations enable row level security;
create policy fixture_legacy_0 on public.evaluations for select to authenticated using(private.can_view_evaluation(id));
create policy fixture_legacy_1 on public.evaluations for insert to authenticated with check(private.can_grade_event(event_id) and (evaluator_id=auth.uid() or private.is_enterprise_admin()));
create policy fixture_legacy_2 on public.evaluations for update to authenticated using(private.can_edit_evaluation(id)) with check(private.is_enterprise_admin() or (evaluator_id=auth.uid() and status::text in ('draft','in_progress','submitted') and private.can_grade_event(event_id)));
create policy fixture_legacy_3 on public.evaluations for delete to authenticated using(private.is_enterprise_admin());
alter table public.participants enable row level security;
create policy fixture_legacy_0 on public.participants for select to authenticated using(private.can_view_participant(id));
create policy fixture_legacy_1 on public.participants for insert to authenticated with check((created_by=auth.uid() or private.is_enterprise_admin()) and (home_base_id is null or private.can_create_at_base(home_base_id) or private.is_enterprise_admin()));
create policy fixture_legacy_2 on public.participants for update to authenticated using(created_by=auth.uid() or private.can_manage_base(home_base_id)) with check(created_by=auth.uid() or private.can_manage_base(home_base_id));
create policy fixture_legacy_3 on public.participants for delete to authenticated using(private.is_enterprise_admin());
alter table public.class_evaluators enable row level security;
create policy fixture_legacy_0 on public.class_evaluators for select to authenticated using(private.can_view_class(class_id));
create policy fixture_legacy_1 on public.class_evaluators for insert to authenticated with check(private.can_manage_class(class_id));
create policy fixture_legacy_2 on public.class_evaluators for update to authenticated using(private.can_manage_class(class_id)) with check(private.can_manage_class(class_id));
create policy fixture_legacy_3 on public.class_evaluators for delete to authenticated using(private.can_manage_class(class_id));
alter table public.event_evaluators enable row level security;
create policy fixture_legacy_0 on public.event_evaluators for select to authenticated using(private.can_view_event(event_id));
create policy fixture_legacy_1 on public.event_evaluators for insert to authenticated with check(private.can_manage_event(event_id));
create policy fixture_legacy_2 on public.event_evaluators for update to authenticated using(private.can_manage_event(event_id)) with check(private.can_manage_event(event_id));
create policy fixture_legacy_3 on public.event_evaluators for delete to authenticated using(private.can_manage_event(event_id));
alter table public.criterion_results enable row level security;
create policy fixture_legacy_0 on public.criterion_results for select to authenticated using(private.can_view_evaluation(evaluation_id));
create policy fixture_legacy_1 on public.criterion_results for insert to authenticated with check(private.can_edit_evaluation(evaluation_id));
create policy fixture_legacy_2 on public.criterion_results for update to authenticated using(private.can_edit_evaluation(evaluation_id)) with check(private.can_edit_evaluation(evaluation_id));
create policy fixture_legacy_3 on public.criterion_results for delete to authenticated using(private.can_edit_evaluation(evaluation_id));
alter table public.timer_results enable row level security;
create policy fixture_legacy_0 on public.timer_results for select to authenticated using(private.can_view_evaluation(evaluation_id));
create policy fixture_legacy_1 on public.timer_results for insert to authenticated with check(private.can_edit_evaluation(evaluation_id));
create policy fixture_legacy_2 on public.timer_results for update to authenticated using(private.can_edit_evaluation(evaluation_id)) with check(private.can_edit_evaluation(evaluation_id));
create policy fixture_legacy_3 on public.timer_results for delete to authenticated using(private.can_edit_evaluation(evaluation_id));
-- Catalog/ledger tables deliberately receive a hostile all-true fixture policy
-- to exercise restrictive guards under overly broad permissive policy unions.
-- The operational creator/assignment and inline Enterprise policies above
-- reproduce the known deployed authorization paths.
alter table public.bases enable row level security;
create policy fixture_catalog on public.bases for all to authenticated using(true) with check(true);
alter table public.majcoms enable row level security;
create policy fixture_catalog on public.majcoms for all to authenticated using(true) with check(true);
alter table public.criteria enable row level security;
create policy fixture_catalog on public.criteria for all to authenticated using(true) with check(true);
alter table public.curriculum_versions enable row level security;
create policy fixture_catalog on public.curriculum_versions for all to authenticated using(true) with check(true);
alter table public.scenarios enable row level security;
create policy fixture_catalog on public.scenarios for all to authenticated using(true) with check(true);
alter table public.audit_log enable row level security;
create policy fixture_catalog on public.audit_log for all to authenticated using(true) with check(true);
alter table public.closed_class_archives enable row level security;
create policy fixture_catalog on public.closed_class_archives for all to authenticated using(true) with check(true);
grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role;
-- Include inherited PUBLIC CRUD to prove rubric RLS is necessary in addition to
-- revoking direct-role table ACLs (which cannot erase inherited permissions).
grant insert,update,delete on public.criteria,public.curriculum_versions to public;
grant truncate,references,trigger on all tables in schema public to public;
grant create on schema public to public;
insert into public.majcoms values('10000000-0000-0000-0000-000000000003',true);
insert into public.bases values('11000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',true),('11000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000003',true);
insert into public.memberships(user_id,role,base_id,majcom_id,active,starts_at,ends_at) values
('00000000-0000-0000-0000-000000000010','evaluator','11000000-0000-0000-0000-000000000001',null,true,now()-interval '2 days',now()-interval '1 day'),
('00000000-0000-0000-0000-000000000011','evaluator','11000000-0000-0000-0000-000000000005',null,true,null,null),
('00000000-0000-0000-0000-000000000013','evaluator','11000000-0000-0000-0000-000000000001',null,true,now()+interval '1 day',null),
('00000000-0000-0000-0000-000000000014','evaluator','11000000-0000-0000-0000-000000000001',null,false,null,null),
('00000000-0000-0000-0000-000000000015','evaluator','11000000-0000-0000-0000-000000000002',null,true,null,null),
('00000000-0000-0000-0000-000000000016','evaluator','11000000-0000-0000-0000-000000000003',null,true,null,null),
('00000000-0000-0000-0000-000000000017','evaluator','11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true,null,null),
('00000000-0000-0000-0000-000000000019','enterprise_admin',null,null,true,null,null);
insert into public.curriculum_versions values('60000000-0000-0000-0000-000000000001',true),('60000000-0000-0000-0000-000000000002',true);
insert into public.criteria values('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001',true),('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002',true);
insert into public.classes(id,base_id,created_by,status,name) values
('40000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','active','Own'),
('40000000-0000-0000-0000-000000000002','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','active','Expired owner'),
('40000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000011','active','Cross command'),
('40000000-0000-0000-0000-000000000004','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','completed','Closed');
insert into public.evaluation_events(id,class_id,base_id,created_by,curriculum_version_id,status)
select ('50000000-0000-0000-0000-'||right(id::text,12))::uuid,id,base_id,created_by,'60000000-0000-0000-0000-000000000001',case when status::text='completed' then 'closed' else 'open' end::text:: :ops_status from public.classes;
insert into public.participants values('70000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','Synthetic one'),('70000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000011','Synthetic cross command');
insert into public.participants values('70000000-0000-0000-0000-000000000009','11000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000011','Inaccessible synthetic participant');
insert into public.evaluations(id,event_id,participant_id,evaluator_id,curriculum_version_id,status) values
('80000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','in_progress'),
('80000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','60000000-0000-0000-0000-000000000001','in_progress'),
('80000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','in_progress'),
('80000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','in_progress'),
('80000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001','finalized');
insert into public.class_evaluators(class_id,evaluator_id) values('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012'),('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003');
insert into public.criterion_results values('90000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000001','pass');
insert into public.timer_results values('91000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001',null,1);
-- Minimal synthetic readiness data exposes the authorization boundary without
-- recreating the deployed clinical completeness or integrity algorithms.
create function private.class_closure_readiness(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ok',true,'classId',target,'alreadyClosed',c.status::text='completed',
    'issues',case when c.status::text='completed' then '[]'::jsonb else '["core fixture"]'::jsonb end)
  from public.classes c where c.id=target;
$$;
create function private.class_closure_integrity(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('ok',true,'integrityFixture',true,'issues','["integrity fixture"]'::jsonb);
$$;
-- Exact flow of the user's supplied public wrapper, before the access gate.
create function public.class_closure_readiness(p_class_id uuid) returns jsonb language plpgsql security definer set search_path='public','private','auth' as $$
declare v_core jsonb; v_integrity jsonb; v_issues jsonb;
begin
  v_core:=private.class_closure_readiness(p_class_id);
  if coalesce((v_core->>'alreadyClosed')::boolean,false) then return v_core; end if;
  v_integrity:=private.class_closure_integrity(p_class_id);
  v_issues:=coalesce(v_core->'issues','[]'::jsonb)||coalesce(v_integrity->'issues','[]'::jsonb);
  return (v_core-'issues'-'ok')||(v_integrity-'issues'-'ok')||jsonb_build_object('ok',jsonb_array_length(v_issues)=0,'issues',v_issues);
end;
$$;
-- This synthetic definer only tests invocation context for the new close-role
-- guard. It deliberately contains NO readiness, grading, or scoring logic.
create function public.fixture_close_context(target uuid) returns void language sql security definer set search_path='' as $$update public.classes set status='completed' where id=target$$;
-- Synthetic context test only; this is not a model of the clinical claim RPC.
create function public.fixture_claim_context(event_id uuid,participant_id uuid,curriculum_id uuid) returns void language sql security definer set search_path='' as $$insert into public.evaluations(event_id,participant_id,evaluator_id,curriculum_version_id) values(event_id,participant_id,auth.uid(),curriculum_id)$$;
create function public.fixture_void_context(target uuid) returns void language sql security definer set search_path='' as $$update public.evaluations set status='voided' where id=target$$;
create table test.clinical_definitions as select oid,pg_get_functiondef(oid) definition from pg_proc where oid in ('public.fixture_close_context(uuid)'::regprocedure,'public.fixture_claim_context(uuid,uuid,uuid)'::regprocedure,'public.fixture_void_context(uuid)'::regprocedure,'private.class_closure_readiness(uuid)'::regprocedure,'private.class_closure_integrity(uuid)'::regprocedure);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select test.assert(private.can_manage_class('40000000-0000-0000-0000-000000000002'),'baseline reproduces expired creator access');
select test.assert(private.can_edit_evaluation('80000000-0000-0000-0000-000000000002'),'baseline reproduces expired evaluator access');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000012',false);
select test.assert(private.can_grade_event('50000000-0000-0000-0000-000000000001'),'baseline reproduces assignment without membership');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',false);
select test.assert((select count(*)=4 from public.classes),'baseline reproduces malformed Enterprise ALL bypass');
reset role;
\else
select test.assert(not has_schema_privilege('authenticated','public','CREATE'),'browser schema creation removed');
select test.assert(not has_schema_privilege('anon','public','CREATE'),'anonymous schema creation removed');
select test.assert(not has_table_privilege('authenticated','public.classes','TRUNCATE'),'browser class truncate removed');
select test.assert(not has_table_privilege('anon','public.memberships','TRUNCATE'),'anonymous membership truncate removed');
select test.assert(not has_table_privilege('authenticated','public.criterion_results','TRIGGER'),'browser result trigger creation removed');
-- Role matrix and hostile direct requests, with historical permissive policies
-- intact. Simulate a later accidental inherited grant to exercise defense in depth.
grant insert,update,delete on public.criteria,public.curriculum_versions to public;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.assert(private.can_create_at_base('11000000-0000-0000-0000-000000000001'),'nullable-start evaluator creates at own installation');
select test.assert(not private.can_create_at_base('11000000-0000-0000-0000-000000000005'),'evaluator cannot create cross command');
select test.assert(private.can_manage_class('40000000-0000-0000-0000-000000000001'),'evaluator manages own class');
select test.assert(private.can_grade_event('50000000-0000-0000-0000-000000000003'),'explicit cross-command assignment permits grading');
select test.assert(private.can_view_class('40000000-0000-0000-0000-000000000003'),'explicit assignment permits class read');
select test.assert(not private.can_manage_class('40000000-0000-0000-0000-000000000003'),'assignment does not grant metadata administration');
select test.assert(private.can_edit_evaluation('80000000-0000-0000-0000-000000000003'),'assigned evaluator can edit own active cross-base evaluation');
select test.assert((public.class_closure_readiness('40000000-0000-0000-0000-000000000003')->>'classId')='40000000-0000-0000-0000-000000000003','explicit cross-base assignment permits readiness read');
select test.assert((public.class_closure_readiness('40000000-0000-0000-0000-000000000001')->'issues')='["core fixture","integrity fixture"]'::jsonb,'readiness wrapper preserves core then integrity issue merging');
select test.assert((public.class_closure_readiness('40000000-0000-0000-0000-000000000004')->>'alreadyClosed')::boolean,'authorized closed-class readiness remains idempotent');
select test.expect_error($$select private.class_closure_readiness('40000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select private.class_closure_integrity('40000000-0000-0000-0000-000000000001')$$,'42501');
select test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000004'),'closed parent blocks otherwise active evaluation');
select test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000005'),'finalized evaluation immutable');
update public.classes set name='Updated own class',app_data='{"deletedAt":null,"restoredAt":null}' where id='40000000-0000-0000-0000-000000000001';
select test.expect_affected($$update public.classes set name='No assignment admin' where id='40000000-0000-0000-0000-000000000003'$$,0);
select test.expect_error($$update public.classes set base_id='11000000-0000-0000-0000-000000000005' where id='40000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.classes set status='archived' where id='40000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.classes set app_data='{"deletedAt":123}' where id='40000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$select public.fixture_close_context('40000000-0000-0000-0000-000000000001')$$,'42501');
insert into public.classes(id,base_id,created_by,name) values('40000000-0000-0000-0000-000000000009','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','New own class');
insert into public.evaluation_events(id,class_id,base_id,created_by,curriculum_version_id) values('50000000-0000-0000-0000-000000000009','40000000-0000-0000-0000-000000000009','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001');
update public.evaluation_events set name='Updated own event' where id='50000000-0000-0000-0000-000000000009';
select test.expect_error($$insert into public.evaluation_events(class_id,base_id,created_by,curriculum_version_id) values('40000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001')$$,'42501');
update public.participants set display_name='Updated synthetic' where id='70000000-0000-0000-0000-000000000001';
update public.criterion_results set result='fail' where id='90000000-0000-0000-0000-000000000001';
update public.timer_results set elapsed=2 where id='91000000-0000-0000-0000-000000000001';
update public.evaluations set notes='Observed' where id='80000000-0000-0000-0000-000000000001';
select test.expect_error($$update public.evaluations set evaluator_id='00000000-0000-0000-0000-000000000011' where id='80000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.evaluations set status='finalized',overall_result='pass' where id='80000000-0000-0000-0000-000000000001'$$,'42501');
-- Use an active base-B participant that has NO evaluation in any accessible
-- class, so guessed identifiers cannot bootstrap read access through a new row.
select test.expect_error($$insert into public.evaluations(event_id,participant_id,evaluator_id,curriculum_version_id) values('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000009','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.assert(not private.can_view_participant('70000000-0000-0000-0000-000000000009'),'rejected direct and definer claims cannot bootstrap foreign participant visibility');
select test.expect_error($$insert into public.evaluations(event_id,participant_id,evaluator_id,curriculum_version_id) values('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000002')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002')$$,'42501');
select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001');
-- A cross-base assignment authorizes an existing event participant. It does
-- not let a grader attach a guessed, unrelated participant from that same base.
insert into public.evaluations(id,event_id,participant_id,evaluator_id,curriculum_version_id) values('80000000-0000-0000-0000-000000000010','50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001');
select public.fixture_claim_context('50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000009','60000000-0000-0000-0000-000000000001')$$,'42501');
reset role;
update public.curriculum_versions set published=false where id='60000000-0000-0000-0000-000000000001';
set role authenticated;
select test.expect_error($$insert into public.evaluations(event_id,participant_id,evaluator_id,curriculum_version_id) values('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.assert(private.can_edit_evaluation('80000000-0000-0000-0000-000000000010'),'existing authorized attempt remains editable after trusted curriculum unpublication');
select public.fixture_void_context('80000000-0000-0000-0000-000000000010');
select test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000010'),'existing authoritative void remains possible after curriculum unpublication');
reset role;
update public.curriculum_versions set published=true where id='60000000-0000-0000-0000-000000000001';
set role authenticated;
select test.expect_error($$insert into public.criterion_results(evaluation_id,criterion_id,result) values('80000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002','pass')$$,'42501');
select test.expect_error($$insert into public.timer_results(evaluation_id,criterion_id,elapsed) values('80000000-0000-0000-0000-000000000001','61000000-0000-0000-0000-000000000002',1)$$,'42501');
select test.expect_error($$update public.criterion_results set evaluation_id='80000000-0000-0000-0000-000000000003' where id='90000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.timer_results set evaluation_id='80000000-0000-0000-0000-000000000003' where id='91000000-0000-0000-0000-000000000001'$$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select test.assert(private.can_manage_class('40000000-0000-0000-0000-000000000001'),'PM manages installation class owned by another user');
select test.assert((public.class_closure_readiness('40000000-0000-0000-0000-000000000001')->>'classId')='40000000-0000-0000-0000-000000000001','installation Program Manager may read readiness');
select test.expect_error($$select public.class_closure_readiness('40000000-0000-0000-0000-000000000003')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.assert(not private.can_manage_class('40000000-0000-0000-0000-000000000003'),'PM cannot manage other installation');
select test.assert(private.can_view_membership('00000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001',null),'PM directory scope preserved');
select test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000001'),'PM cannot edit another evaluator claim');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test.assert(private.can_view_class('40000000-0000-0000-0000-000000000001'),'MAJCOM oversight retained');
select test.assert(not private.can_create_at_base('11000000-0000-0000-0000-000000000001'),'MAJCOM has no implicit creation');
select test.assert(not private.can_manage_class('40000000-0000-0000-0000-000000000001'),'MAJCOM has no implicit management');
select test.assert(not private.can_grade_event('50000000-0000-0000-0000-000000000001'),'MAJCOM has no implicit grading');
select test.assert(not private.can_view_class('40000000-0000-0000-0000-000000000003'),'MAJCOM read constrained to own command');
select test.assert(private.can_view_membership('00000000-0000-0000-0000-000000000003','11000000-0000-0000-0000-000000000001',null),'MAJCOM directory scope preserved');
select test.expect_error($$select public.fixture_close_context('40000000-0000-0000-0000-000000000001')$$,'42501');
reset role;
do $$declare n integer; uid uuid; begin
  foreach n in array array[6,7,8,9,10,12,13,14,15,16,17] loop
    uid:=('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    perform set_config('request.jwt.claim.sub',uid::text,true);
    perform test.assert(not private.is_enterprise_admin(),format('invalid membership %s has no Enterprise privilege',n));
    perform test.assert(not private.can_create_at_base('11000000-0000-0000-0000-000000000001'),format('invalid membership %s cannot create',n));
    perform test.assert(not private.can_manage_class('40000000-0000-0000-0000-000000000002'),format('invalid membership %s cannot retain ownership',n));
    perform test.assert(not private.can_grade_event('50000000-0000-0000-0000-000000000001'),format('invalid membership %s cannot retain assignment',n));
    perform test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000002'),format('invalid membership %s cannot edit grading',n));
  end loop;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000009',false);
select test.assert((select count(*)=0 from public.classes),'restrictive guard closes inline malformed Enterprise ALL bypass');
select test.expect_affected($$update public.classes set name='Spoofed admin'$$,0);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000010',false);
select test.assert((select count(*)=0 from public.classes),'expired creator sees no operational class rows');
select test.expect_error($$select public.class_closure_readiness('40000000-0000-0000-0000-000000000002')$$,'42501');
select test.expect_affected($$update public.evaluations set notes='Expired owner edit'$$,0);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000019',false);
select test.assert(private.is_enterprise_admin(),'unbounded-start valid Enterprise works consistently');
select test.assert((public.class_closure_readiness('40000000-0000-0000-0000-000000000003')->>'classId')='40000000-0000-0000-0000-000000000003','Enterprise may read readiness globally');
select test.assert((select count(*)=5 from public.classes),'Enterprise retains global class visibility');
select test.expect_error($$insert into public.criteria(id,curriculum_version_id) values(gen_random_uuid(),'60000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_affected($$update public.criteria set active=false$$,0);
select test.expect_affected($$delete from public.curriculum_versions where id='60000000-0000-0000-0000-000000000002'$$,0);
update public.classes set status='archived',app_data='{"deletedAt":123}' where id='40000000-0000-0000-0000-000000000002';
update public.classes set status='active',app_data='{"deletedAt":null,"restoredAt":456}' where id='40000000-0000-0000-0000-000000000002';
reset role;
-- Enterprise retains global retention cleanup when an installation is retired;
-- allowing cleanup does not permit relocating the class into another scope.
update public.bases set active=false where id='11000000-0000-0000-0000-000000000005';
set role authenticated;
select test.expect_affected($$update public.classes set status='archived',app_data='{"deletedAt":123}' where id='40000000-0000-0000-0000-000000000003'$$,1);
select test.expect_affected($$update public.classes set status='active',app_data='{"deletedAt":null,"restoredAt":456}' where id='40000000-0000-0000-0000-000000000003'$$,1);
select test.expect_error($$update public.classes set base_id='11000000-0000-0000-0000-000000000001' where id='40000000-0000-0000-0000-000000000003'$$,'42501');
reset role;
update public.bases set active=true where id='11000000-0000-0000-0000-000000000005';
set role authenticated;
select test.expect_affected($$update public.evaluations set notes='Do not rewrite finalized' where id='80000000-0000-0000-0000-000000000005'$$,0);
select test.assert(private.can_edit_evaluation('80000000-0000-0000-0000-000000000001'),'server retains existing Enterprise draft override, UI uses claim owner');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select public.fixture_close_context('40000000-0000-0000-0000-000000000002');
select test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000002'),'trusted close context retains PM permission and freezes parent');
reset role;
select test.assert((select bool_and(pg_get_functiondef(oid)=definition) from test.clinical_definitions),'existing definer function definition unchanged');
-- Removing a cross-base assignment immediately removes permission even though
-- that user still owns the active evaluation and holds a valid home membership.
delete from public.class_evaluators where class_id='40000000-0000-0000-0000-000000000003' and evaluator_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.assert(not private.can_grade_event('50000000-0000-0000-0000-000000000003'),'removed cross-base assignment loses grading authority');
select test.assert(not private.can_edit_evaluation('80000000-0000-0000-0000-000000000003'),'evaluation ownership cannot preserve removed assignment');
reset role;
insert into public.event_evaluators(event_id,evaluator_id) values('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000005');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test.assert(private.can_grade_event('50000000-0000-0000-0000-000000000003'),'explicit event assignment grants valid MAJCOM manager grading duty');
select test.assert(private.can_view_class('40000000-0000-0000-0000-000000000003'),'event assignment makes its parent class visible for grading');
select test.assert(not private.can_manage_event('50000000-0000-0000-0000-000000000003'),'explicit event assignment does not grant manager metadata authority');
reset role;
insert into public.class_evaluators(class_id,evaluator_id) values('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003');
-- Revocation is effective on the next request despite retained creator/assignment.
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.assert(not private.can_manage_class('40000000-0000-0000-0000-000000000001'),'revoked creator cannot manage own class');
select test.expect_error($$select public.class_closure_readiness('40000000-0000-0000-0000-000000000001')$$,'42501');
select test.assert(not private.can_grade_event('50000000-0000-0000-0000-000000000003'),'revoked evaluator cannot retain explicit assignment');
select test.expect_affected($$update public.criterion_results set result='pass'$$,0);
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select test.assert((select count(*)=0 from public.classes),'anonymous class read denied');
select test.assert((select count(*)=0 from public.criterion_results),'anonymous grading read denied');
select test.expect_error($$select public.class_closure_readiness('40000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select private.can_manage_class('40000000-0000-0000-0000-000000000001')$$,'42501');
reset role;
\endif
