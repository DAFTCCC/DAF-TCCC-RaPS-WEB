\set ON_ERROR_STOP on
select :'phase' = 'prepare' as prepare \gset
\if :prepare
-- Extend the existing synthetic permission fixture with the real catalog shape.
-- Five physical sources include an inactive base and an inactive parent command.
alter table public.majcoms alter column id set default gen_random_uuid();
alter table public.bases alter column id set default gen_random_uuid();
alter table public.majcoms add column code :catalog_code_type, add column name :catalog_name_type;
alter table public.bases add column code :catalog_code_type, add column name :catalog_name_type;
update public.majcoms set code = 'LIVE-' || right(id::text,1), name = 'Command ' || right(id::text,1);
update public.bases set code = 'PHYSICAL-' || right(id::text,1), name = 'Physical ' || right(id::text,1);
create table test.test_catalog_sources as select to_jsonb(b) row_data from public.bases b;
create table test.test_catalog_commands as select to_jsonb(m) row_data from public.majcoms m;
create table test.test_catalog_memberships as select id,to_jsonb(m) row_data from public.memberships m;
create table test.test_catalog_functions as
  select p.oid,pg_get_functiondef(p.oid) definition from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prokind = 'f';
create table test.test_catalog_policies as
  select p.oid,to_jsonb(p) definition from pg_policy p;
create table test.test_catalog_triggers as
  select t.oid,pg_get_triggerdef(t.oid) definition from pg_trigger t where not t.tgisinternal;
\else
select test.assert((select count(*) from private.raps_test_installations) = (select count(*) from test.test_catalog_sources),
  'each physical installation has one distinct mapped TEST copy, including inactive sources');
select test.assert((select count(*) = 1 from public.majcoms where code = 'TEST' and name = 'TEST' and active),
  'TEST is one active peer command');
select test.assert(not exists (select 1 from private.raps_test_installations map
  join public.bases source on source.id = map.source_base_id
  join public.majcoms host on host.id = source.majcom_id
  join public.bases copy on copy.id = map.test_base_id
  join public.majcoms test_command on test_command.id = map.test_majcom_id
  where map.source_code <> source.code or copy.id = source.id
    or copy.code <> 'TEST-' || source.code or copy.name <> source.name || ' (TEST)'
    or copy.majcom_id <> map.test_majcom_id or test_command.code <> 'TEST'
    or copy.active is distinct from (source.active and host.active)),
  'copies have exact stable codes, names, distinct IDs, TEST parent, and effective source activity');
select test.assert(not exists (select 1 from test.test_catalog_sources before_row
  where not exists (select 1 from public.bases b where to_jsonb(b) = before_row.row_data)),
  'every original installation ID, code, name, activity, and host command is unchanged');
select test.assert(not exists (select 1 from test.test_catalog_commands before_row
  where not exists (select 1 from public.majcoms m where to_jsonb(m) = before_row.row_data)),
  'every original command is unchanged');
select test.assert(not exists (select 1 from test.test_catalog_memberships before_row
  left join public.memberships m on m.id = before_row.id where to_jsonb(m) is distinct from before_row.row_data),
  'existing memberships were not reassigned or edited');
select test.assert(not exists (select 1 from test.test_catalog_functions before_row
  left join pg_proc p on p.oid = before_row.oid where p.oid is null or pg_get_functiondef(p.oid) <> before_row.definition)
  and (select count(*) from test.test_catalog_functions) = (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and p.prokind = 'f'),
  'all authorization helpers and clinical/RPC function definitions are byte-for-byte unchanged');
select test.assert(not exists (select 1 from test.test_catalog_policies before_row
  left join pg_policy p on p.oid = before_row.oid where to_jsonb(p) is distinct from before_row.definition)
  and (select count(*) from test.test_catalog_policies) = (select count(*) from pg_policy),
  'all existing RLS policies are byte-for-byte unchanged');
select test.assert(not exists (select 1 from test.test_catalog_triggers before_row
  left join pg_trigger t on t.oid = before_row.oid where t.oid is null or pg_get_triggerdef(t.oid) <> before_row.definition)
  and (select count(*) from test.test_catalog_triggers) = (select count(*) from pg_trigger where not tgisinternal),
  'all existing guard and clinical triggers are unchanged');
select test.assert(not has_table_privilege('anon','private.raps_test_installations','SELECT')
  and not has_table_privilege('authenticated','private.raps_test_installations','SELECT')
  and not has_table_privilege('service_role','private.raps_test_installations','SELECT')
  and (select relrowsecurity from pg_class where oid = 'private.raps_test_installations'::regclass),
  'trusted mapping has RLS and no browser or account-service grant');

select test_majcom_id as test_command, test_base_id as test_base_a
from private.raps_test_installations where source_base_id = '11000000-0000-0000-0000-000000000001' \gset
select test_base_id as test_base_b
from private.raps_test_installations where source_base_id = '11000000-0000-0000-0000-000000000004' \gset
select test_base_id as test_base_inactive
from private.raps_test_installations where source_base_id = '11000000-0000-0000-0000-000000000002' \gset
insert into public.profiles(id,email,display_name)
select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  'test-fixture-' || n || '@example.invalid', 'Synthetic TEST role' from generate_series(101,108) n;
insert into public.memberships(user_id,role,base_id,majcom_id,active,starts_at,ends_at) values
('00000000-0000-0000-0000-000000000101','majcom_manager',null,:'test_command',true,null,null),
('00000000-0000-0000-0000-000000000102','program_manager',:'test_base_a',null,true,null,null),
('00000000-0000-0000-0000-000000000103','evaluator',:'test_base_a',null,true,null,null),
('00000000-0000-0000-0000-000000000104','evaluator',:'test_base_a',null,true,null,null),
('00000000-0000-0000-0000-000000000105','program_manager',:'test_base_b',null,true,null,null),
('00000000-0000-0000-0000-000000000106','evaluator',:'test_base_b',null,true,null,null),
('00000000-0000-0000-0000-000000000107','evaluator',:'test_base_a',null,true,null,now() - interval '1 day'),
('00000000-0000-0000-0000-000000000108','evaluator',:'test_base_inactive',null,true,null,null);
insert into public.classes(id,base_id,created_by,status,name) values
('40000000-0000-0000-0000-000000000101',:'test_base_a','00000000-0000-0000-0000-000000000103','active','TEST own'),
('40000000-0000-0000-0000-000000000102',:'test_base_a','00000000-0000-0000-0000-000000000104','active','TEST other evaluator'),
('40000000-0000-0000-0000-000000000103',:'test_base_b','00000000-0000-0000-0000-000000000106','active','TEST second installation');
insert into public.evaluation_events(id,class_id,base_id,created_by,curriculum_version_id,status)
select ('50000000-0000-0000-0000-' || right(id::text,12))::uuid,id,base_id,created_by,
  '60000000-0000-0000-0000-000000000001','open' from public.classes where right(id::text,3) in ('101','102','103');
insert into public.participants(id,home_base_id,created_by,display_name) values
('70000000-0000-0000-0000-000000000101',:'test_base_a','00000000-0000-0000-0000-000000000103','Synthetic TEST participant'),
('70000000-0000-0000-0000-000000000102',:'test_base_a','00000000-0000-0000-0000-000000000104','Synthetic TEST participant'),
('70000000-0000-0000-0000-000000000103',:'test_base_b','00000000-0000-0000-0000-000000000106','Synthetic TEST participant');
insert into public.evaluations(id,event_id,participant_id,evaluator_id,curriculum_version_id,status)
select ('80000000-0000-0000-0000-' || right(id::text,12))::uuid,
  ('50000000-0000-0000-0000-' || right(id::text,12))::uuid,
  ('70000000-0000-0000-0000-' || right(id::text,12))::uuid,
  created_by,'60000000-0000-0000-0000-000000000001','in_progress'
from public.classes where right(id::text,3) in ('101','102','103');
insert into public.criterion_results(id,evaluation_id,criterion_id,result) values
('90000000-0000-0000-0000-000000000101','80000000-0000-0000-0000-000000000101','61000000-0000-0000-0000-000000000001','fail'),
('90000000-0000-0000-0000-000000000102','80000000-0000-0000-0000-000000000102','61000000-0000-0000-0000-000000000001','fail');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000101',false);
select test.assert((select count(*) = 3 from public.classes), 'TEST MAJCOM manager oversees all TEST classes and no live classes by default');
select test.assert((select count(*) = 3 from public.evaluation_events), 'TEST MAJCOM manager sees TEST events only');
select test.assert((select count(*) = 3 from public.evaluations), 'TEST MAJCOM manager sees TEST evaluations only');
select test.assert((select count(*) = 3 from public.participants), 'TEST MAJCOM manager sees TEST participants only');
select test.assert(not private.can_create_at_base(:'test_base_a') and not private.can_manage_base(:'test_base_a'),
  'TEST MAJCOM manager retains the ordinary oversight role');
select test.expect_affected($$update public.criterion_results set result = 'pass'$$,0);
select test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000107')$$,'42501');
select test.expect_error($$select public.fixture_close_context('40000000-0000-0000-0000-000000000101')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000101','70000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select * from private.raps_test_installations$$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',false);
select test.assert((select count(*) = 2 from public.classes), 'TEST Program Manager sees its one TEST installation only');
select test.assert(private.can_manage_base(:'test_base_a') and not private.can_manage_base(:'test_base_b')
  and not private.can_manage_base('11000000-0000-0000-0000-000000000001'),
  'TEST Program Manager cannot manage another TEST installation or its physical source');
select test.expect_affected($$update public.classes set name = 'TEST managed' where id = '40000000-0000-0000-0000-000000000102'$$,1);
insert into public.classes(id,base_id,created_by,status,name)
values ('40000000-0000-0000-0000-000000000104',:'test_base_a','00000000-0000-0000-0000-000000000102','active','TEST manager created');
select test.expect_error($$insert into public.classes(base_id,created_by,name) values ('11000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102','Forbidden live')$$,'42501');
select test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000107')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')$$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',false);
select test.assert((select count(*) = 1 from public.classes), 'TEST evaluator sees its own scoped TEST class by default');
select test.assert((select count(*) = 1 from public.evaluations), 'TEST evaluator sees its own scoped TEST evaluation by default');
select test.assert(not private.can_view_class('40000000-0000-0000-0000-000000000001')
  and not private.can_grade_event('50000000-0000-0000-0000-000000000001'),
  'TEST evaluator has no default live class or grading authority');
select test.expect_affected($$update public.criterion_results set result = 'pass' where id = '90000000-0000-0000-0000-000000000101'$$,1);
select test.expect_affected($$update public.criterion_results set result = 'pass' where id = '90000000-0000-0000-0000-000000000102'$$,0);
insert into public.timer_results(evaluation_id,elapsed) values ('80000000-0000-0000-0000-000000000101',20);
select public.fixture_claim_context('50000000-0000-0000-0000-000000000101','70000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000001');
select test.assert((select count(*) = 2 from public.evaluations), 'TEST evaluator can claim another attempt through the existing definer context');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000103','70000000-0000-0000-0000-000000000103','60000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select public.class_closure_readiness('40000000-0000-0000-0000-000000000001')$$,'42501');
select test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000107')$$,'42501');
select test.expect_affected($$update public.access_requests set status = 'approved'$$,0);

-- Existing live roles retain their physical scopes, with no wildcard TEST access.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test.assert((select count(*) = 3 from public.classes), 'live MAJCOM manager retains its three live classes');
select test.assert(not private.can_oversee_base(:'test_base_a'), 'live MAJCOM manager cannot oversee TEST by default');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select test.assert((select count(*) = 3 from public.classes), 'live Program Manager retains its live installation');
select test.assert(not private.can_manage_base(:'test_base_a'), 'live Program Manager cannot manage TEST by default');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.assert(not private.can_view_class('40000000-0000-0000-0000-000000000101'),
  'live evaluator has no default TEST class visibility');
select test.expect_error($$select public.fixture_claim_context('50000000-0000-0000-0000-000000000101','70000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000001')$$,'42501');

-- An authorized class manager may still explicitly share work across commands.
-- This is the existing peer-command permission contract, not a TEST bypass.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000102',false);
insert into public.class_evaluators(class_id,evaluator_id)
values ('40000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000003');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.assert(private.can_view_class('40000000-0000-0000-0000-000000000101')
  and private.can_grade_event('50000000-0000-0000-0000-000000000101'),
  'explicit authorized live-to-TEST assignment preserves ordinary sharing');
select public.fixture_claim_context('50000000-0000-0000-0000-000000000101','70000000-0000-0000-0000-000000000101','60000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
insert into public.class_evaluators(class_id,evaluator_id)
values ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000103');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',false);
select test.assert(private.can_view_class('40000000-0000-0000-0000-000000000001')
  and private.can_grade_event('50000000-0000-0000-0000-000000000001'),
  'explicit authorized TEST-to-live assignment preserves ordinary sharing');
select public.fixture_claim_context('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
delete from public.class_evaluators where class_id = '40000000-0000-0000-0000-000000000001'
  and evaluator_id = '00000000-0000-0000-0000-000000000103';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',false);
select test.assert(not private.can_view_class('40000000-0000-0000-0000-000000000001'),
  'removing the explicit sharing grant removes live visibility again');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000107',false);
select test.assert((select count(*) = 0 from public.classes), 'expired TEST membership grants no class access');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000108',false);
select test.assert(not private.can_create_at_base(:'test_base_inactive'), 'inactive TEST source copy grants no new work');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test.assert((select count(*) = 8 from public.classes), 'Enterprise Admin retains global live and TEST visibility');
select test.expect_error($$insert into public.memberships(user_id,role,base_id,majcom_id) values ('00000000-0000-0000-0000-000000000107','program_manager','11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$$,'22023');
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select test.assert((select count(*) = 0 from public.classes), 'anonymous callers cannot read TEST or live classes');
select test.expect_error($$select * from private.raps_test_installations$$,'42501');
reset role;
\endif
