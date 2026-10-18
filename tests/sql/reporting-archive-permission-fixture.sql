\set ON_ERROR_STOP on
select :'phase'='prepare' as prepare \gset
\if :prepare
-- These deployed columns are not needed by the older permission fixture.
alter table public.participants add column app_data jsonb not null default '{}';
alter table public.evaluations add column app_data jsonb not null default '{}';
alter table public.evaluations add column started_at timestamptz;
insert into public.classes(id,base_id,created_by,status,name)
select ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  case when n=103 then '11000000-0000-0000-0000-000000000005' else '11000000-0000-0000-0000-000000000001' end::uuid,
  case when n=103 then '00000000-0000-0000-0000-000000000011' else '00000000-0000-0000-0000-000000000003' end::uuid,'active','Synthetic retention '||n
from generate_series(101,109) n;
insert into public.evaluation_events(id,class_id,base_id,created_by,curriculum_version_id,status)
select ('50000000-0000-0000-0000-'||right(id::text,12))::uuid,id,base_id,created_by,
  '60000000-0000-0000-0000-000000000001','open' from public.classes where right(id::text,12)::int between 101 and 107;
insert into public.evaluations(id,event_id,participant_id,evaluator_id,curriculum_version_id,status)
select ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',
  '60000000-0000-0000-0000-000000000001','finalized' from generate_series(101,107) n;
update public.evaluations set status='in_progress' where id='80000000-0000-0000-0000-000000000102';
update public.evaluations set status='draft',app_data='{"shellOnly":true}' where id='80000000-0000-0000-0000-000000000106';
update public.evaluations set status='draft',app_data='{}' where id='80000000-0000-0000-0000-000000000107';
insert into public.participants(id,home_base_id,created_by,display_name,app_data)
values('70000000-0000-0000-0000-000000000101','11000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000003','Unassessed synthetic student',
  '{"classId":"40000000-0000-0000-0000-000000000101"}');
insert into public.criterion_results(id,evaluation_id,criterion_id,result)
select ('90000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '61000000-0000-0000-0000-000000000001','pass' from generate_series(101,105) n;
insert into public.timer_results(id,evaluation_id,criterion_id,elapsed)
select ('91000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,null,50 from generate_series(101,105) n;
insert into public.class_evaluators(id,class_id,evaluator_id)
select ('92000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000003' from generate_series(101,105) n;
insert into public.event_evaluators(id,event_id,evaluator_id)
select ('93000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000003' from generate_series(101,105) n;
-- Tests use role boundaries and a deliberately unsafe definer to prove that the
-- new trigger cannot be bypassed by an existing lifecycle RPC.
create function public.fixture_archive_edit(target uuid) returns void language sql security definer set search_path='' as $$
  update public.classes set name='Definer bypass attempt' where id=target;
$$;
\else
select test.assert(not has_function_privilege('anon','public.request_class_reporting_archive(uuid,text)','execute'),'anonymous enqueue denied');
select test.assert(not has_function_privilege('service_role','public.request_class_reporting_archive(uuid,text)','execute'),'service-role enqueue denied');
select test.assert(not has_table_privilege('authenticated','public.class_reporting_archives','insert,update,delete'),'queue direct writes denied');
select test.assert(not has_table_privilege('service_role','public.class_reporting_archives','select,insert,update,delete'),'browser service key cannot read queue');
select test.assert(not has_table_privilege('authenticated','private.class_reporting_archive_audit','select'),'private audit is not exposed');
select test.assert(not has_function_privilege('authenticated','private.raps_reporting_archive_snapshot(uuid)','execute'),'raw snapshot is private');
select test.assert(not has_function_privilege('authenticated','private.raps_complete_reporting_archive(uuid,uuid,text,text,text,jsonb)','execute'),'completion is private');
select test.assert(not has_function_privilege('authenticated','private.raps_fail_reporting_archive(uuid,uuid,text)','execute'),'failure recording is private');
select test.assert(not has_function_privilege('anon','public.cancel_class_reporting_archive(uuid,uuid)','execute'),'anonymous cancellation denied');
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000101','retain')$$,'42501');
-- PM/MAJCOM/current evaluator/expired and malformed Enterprise all deny enqueue.
do $$declare n integer; begin
  foreach n in array array[3,4,5,6,7,8,9,10] loop
    perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-'||lpad(n::text,12,'0'),true);
    perform test.expect_error($command$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000101','retain')$command$,'42501');
  end loop;
end$$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000101','  ')$$,'22023');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000101',repeat('x',2001))$$,'22023');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000009999','retain')$$,'22023');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000102','retain')$$,'55000');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000107','retain')$$,'55000');
reset role;
update public.evaluations set status='submitted' where id='80000000-0000-0000-0000-000000000102';
set role authenticated;
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000102','retain')$$,'55000');
reset role;
update public.evaluations set status='draft',started_at=now(),app_data='{"shellOnly":true}' where id='80000000-0000-0000-0000-000000000107';
set role authenticated;
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000107','retain')$$,'55000');
reset role;
update public.evaluations set started_at=null where id='80000000-0000-0000-0000-000000000107';
insert into public.criterion_results(evaluation_id,criterion_id,result) values('80000000-0000-0000-0000-000000000107','61000000-0000-0000-0000-000000000001','pass');
set role authenticated;
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000107','retain')$$,'55000');
reset role;
delete from public.criterion_results where evaluation_id='80000000-0000-0000-0000-000000000107';
insert into public.timer_results(evaluation_id,elapsed) values('80000000-0000-0000-0000-000000000107',2);
set role authenticated;
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000107','retain')$$,'55000');
select test.assert(public.request_class_reporting_archive('40000000-0000-0000-0000-000000000101',' retain CSV ') ->> 'status'='requested','enterprise request accepted');
select test.assert(public.request_class_reporting_archive('40000000-0000-0000-0000-000000000103','cross-command retention') ->> 'status'='requested','enterprise request spans commands');
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000104','failed fixture');
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000106','empty shell is safe');
select test.assert((select reason='retain CSV' from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101'),'archive reason trimmed');
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000101','second call preserves original request');
select test.assert((select reason='retain CSV' from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101'),'repeated enqueue is idempotent');
select test.expect_error($$update public.class_reporting_archives set status='archived'$$,'42501');
select test.expect_error($$delete from public.class_reporting_archives$$,'42501');
select test.expect_error($$select private.raps_reporting_archive_snapshot('40000000-0000-0000-0000-000000000101')$$,'42501');
select test.expect_error($$select public.fixture_archive_edit('40000000-0000-0000-0000-000000000101')$$,'55000');
reset role;
select test.assert((select count(*)=1 from private.class_reporting_archive_audit where class_id='40000000-0000-0000-0000-000000000101' and action='requested'),'idempotent request creates one audit entry');
select private.raps_fail_reporting_archive(class_id,request_id,'export_failed') from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000104';
-- scoped SELECT retains useful request status without granting global visibility.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test.assert((select count(*)=3 from public.class_reporting_archives),'MAJCOM sees only own command requests');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000011',false);
select test.assert((select count(*)=1 from public.class_reporting_archives),'foreign evaluator sees only own base request');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
select test.assert((select count(*)=0 from public.class_reporting_archives),'expired user sees no queue rows');
reset role;
-- Completion rejects bad request IDs, stale source, path traversal, hashes and
-- counts; all failures leave the dashboard-visible requested state unchanged.
do $$declare item public.class_reporting_archives; source jsonb; counts jsonb; sha text; path text; begin
  select * into item from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101';
  source:=private.raps_reporting_archive_snapshot(item.class_id);
  perform test.assert(jsonb_array_length(source->'classes'->'rows')=1,'snapshot contains exactly selected class');
  perform test.assert(jsonb_array_length(source->'participants'->'rows')=2,'snapshot retains assessed and unassessed roster');
  perform test.assert(jsonb_array_length(source->'evaluation_events'->'rows')=1,'snapshot excludes foreign classes');
  perform test.assert((select count(*)=12 from jsonb_object_keys(source)),'snapshot includes all twelve retention tables');
  select jsonb_object_agg(key,jsonb_array_length(value->'rows')) into counts from jsonb_each(source);
  sha:=encode(sha256(convert_to(source::text,'UTF8')),'hex');
  path:=item.class_id::text||'/'||to_char(item.requested_at at time zone 'UTC','YYYYMMDD"T"HH24MISS"Z"')||'_'||item.request_id::text;
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,gen_random_uuid(),sha,repeat('a',64),path,counts),'P0001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,null,%L,%L,%L,%L::jsonb)',item.class_id,sha,repeat('a',64),path,counts),'P0001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,item.request_id,sha,repeat('a',64),'../escape',counts),'P0001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,null,%L::jsonb)',item.class_id,item.request_id,sha,repeat('a',64),counts),'P0001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,item.request_id,sha,'invalid',path,counts),'P0001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,null,%L,%L::jsonb)',item.class_id,item.request_id,sha,path,counts),'P0001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,item.request_id,repeat('0',64),repeat('a',64),path,counts),'40001');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,item.request_id,sha,repeat('a',64),path,'{}'),'P0001');
  update public.participants set display_name='Changed after export' where id='70000000-0000-0000-0000-000000000101';
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,item.request_id,sha,repeat('a',64),path,counts),'40001');
  source:=private.raps_reporting_archive_snapshot(item.class_id);
  sha:=encode(sha256(convert_to(source::text,'UTF8')),'hex');
  perform test.assert((select status='requested' from public.class_reporting_archives where class_id=item.class_id),'invalid proof never hides dashboard class');
  perform private.raps_complete_reporting_archive(item.class_id,item.request_id,sha,repeat('a',64),path,counts);
  perform test.assert((select status='archived' and source_sha256=sha from public.class_reporting_archives where class_id=item.class_id),'valid proof commits archived state');
  perform test.expect_error(format('select private.raps_complete_reporting_archive(%L,%L,%L,%L,%L,%L::jsonb)',item.class_id,item.request_id,sha,repeat('a',64),path,counts),'P0001');
end$$;
select test.assert((select count(*)=1 from private.class_reporting_archive_audit where class_id='40000000-0000-0000-0000-000000000101' and action='archived'),'completion records one private audit');
-- Lost completion acknowledgements may call the failure marker after commit.
-- They must not downgrade a retained class or create a false failure event.
select private.raps_fail_reporting_archive(class_id,request_id,'finalize_failed') from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101';
select test.assert((select status='archived' and worker_error is null from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101'),'lost commit acknowledgement never downgrades completed archive');
select test.assert((select count(*)=0 from private.class_reporting_archive_audit where class_id='40000000-0000-0000-0000-000000000101' and action='failed'),'lost commit acknowledgement creates no false failure audit');
-- Trusted/definer execution is used deliberately so existing browser identity
-- policies cannot mask a missing archive trigger. Both ends of reparenting lock.
do $$declare n integer; c uuid; e uuid; v uuid; r uuid; t uuid; ce uuid; ee uuid; begin
  foreach n in array array[101,103,104] loop
    c:=('40000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    e:=('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    v:=('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    r:=('90000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    t:=('91000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    ce:=('92000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    ee:=('93000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid;
    perform test.expect_error(format('update public.classes set name=''mutate'' where id=%L',c),'55000');
    perform test.expect_error(format('delete from public.classes where id=%L',c),'55000');
    perform test.expect_error(format('update public.classes set id=gen_random_uuid() where id=%L',c),'55000');
    perform test.expect_error(format('insert into public.evaluation_events(class_id,base_id) values(%L,''11000000-0000-0000-0000-000000000001'')',c),'55000');
    perform test.expect_error(format('update public.evaluation_events set class_id=''40000000-0000-0000-0000-000000000105'' where id=%L',e),'55000');
    perform test.expect_error(format('delete from public.evaluation_events where id=%L',e),'55000');
    perform test.expect_error(format('update public.evaluation_events set class_id=%L where id=''50000000-0000-0000-0000-000000000105''',c),'55000');
    perform test.expect_error(format('insert into public.evaluations(event_id) values(%L)',e),'55000');
    perform test.expect_error(format('update public.evaluations set event_id=''50000000-0000-0000-0000-000000000105'' where id=%L',v),'55000');
    perform test.expect_error(format('delete from public.evaluations where id=%L',v),'55000');
    perform test.expect_error(format('update public.evaluations set event_id=%L where id=''80000000-0000-0000-0000-000000000105''',e),'55000');
    perform test.expect_error(format('insert into public.class_evaluators(class_id) values(%L)',c),'55000');
    perform test.expect_error(format('update public.class_evaluators set class_id=''40000000-0000-0000-0000-000000000105'' where id=%L',ce),'55000');
    perform test.expect_error(format('delete from public.class_evaluators where id=%L',ce),'55000');
    perform test.expect_error(format('update public.class_evaluators set class_id=%L where id=''92000000-0000-0000-0000-000000000105''',c),'55000');
    perform test.expect_error(format('insert into public.event_evaluators(event_id) values(%L)',e),'55000');
    perform test.expect_error(format('update public.event_evaluators set event_id=''50000000-0000-0000-0000-000000000105'' where id=%L',ee),'55000');
    perform test.expect_error(format('delete from public.event_evaluators where id=%L',ee),'55000');
    perform test.expect_error(format('update public.event_evaluators set event_id=%L where id=''93000000-0000-0000-0000-000000000105''',e),'55000');
    perform test.expect_error(format('insert into public.criterion_results(evaluation_id) values(%L)',v),'55000');
    perform test.expect_error(format('update public.criterion_results set evaluation_id=''80000000-0000-0000-0000-000000000105'' where id=%L',r),'55000');
    perform test.expect_error(format('delete from public.criterion_results where id=%L',r),'55000');
    perform test.expect_error(format('update public.criterion_results set evaluation_id=%L where id=''90000000-0000-0000-0000-000000000105''',v),'55000');
    perform test.expect_error(format('insert into public.timer_results(evaluation_id) values(%L)',v),'55000');
    perform test.expect_error(format('update public.timer_results set evaluation_id=''80000000-0000-0000-0000-000000000105'' where id=%L',t),'55000');
    perform test.expect_error(format('delete from public.timer_results where id=%L',t),'55000');
    perform test.expect_error(format('update public.timer_results set evaluation_id=%L where id=''91000000-0000-0000-0000-000000000105''',v),'55000');
  end loop;
end$$;
-- A failed export gets a fresh immutable generation. Stale workers/cancellation
-- may not affect that generation, and cancellation never reverses completion.
create table test.reporting_old_generation as select * from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000104';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000101',(select request_id from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101'))$$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000103',null)$$,'55000');
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000103',gen_random_uuid())$$,'55000');
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000101',(select request_id from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000101'))$$,'55000');
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000104','Retry retained export');
reset role;
select test.assert((select current.request_id<>previous.request_id and current.status='requested' and current.worker_error is null
  and current.reason='Retry retained export' and current.requested_at>=previous.requested_at
  from public.class_reporting_archives current cross join test.reporting_old_generation previous where current.class_id=previous.class_id),'retry replaces failed generation and clears error');
select test.expect_error($$select public.cancel_class_reporting_archive(class_id,request_id) from test.reporting_old_generation$$,'55000');
select private.raps_fail_reporting_archive(class_id,request_id,'source_changed') from test.reporting_old_generation;
select test.assert((select status='requested' and worker_error is null from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000104'),'stale generation cannot fail retry');
select test.expect_error($$select private.raps_fail_reporting_archive('40000000-0000-0000-0000-000000000104',(select request_id from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000104'),'raw student error')$$,'P0001');
select private.raps_fail_reporting_archive(class_id,request_id,'export_failed') from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000104';
set role authenticated;
select public.cancel_class_reporting_archive(class_id,request_id) from public.class_reporting_archives where class_id in ('40000000-0000-0000-0000-000000000103','40000000-0000-0000-0000-000000000104');
reset role;
select test.assert((select count(*)=0 from public.class_reporting_archives where class_id in ('40000000-0000-0000-0000-000000000103','40000000-0000-0000-0000-000000000104')),'pending and failed generations can be cancelled');
select test.assert((select count(*)=2 from private.class_reporting_archive_audit where class_id in ('40000000-0000-0000-0000-000000000103','40000000-0000-0000-0000-000000000104') and action='cancelled'),'cancellation retains private history');
update public.classes set name='Cancelled request restores edits' where id='40000000-0000-0000-0000-000000000104';
update public.classes set name='Unrelated work remains editable' where id='40000000-0000-0000-0000-000000000105';
select test.assert((select count(*)=9 from public.classes where right(id::text,12)::int between 101 and 109),'retention never deletes class rows');
select test.assert((select count(*)=7 from public.evaluations where right(id::text,12)::int between 101 and 107),'retention never deletes evaluation rows');
\endif
