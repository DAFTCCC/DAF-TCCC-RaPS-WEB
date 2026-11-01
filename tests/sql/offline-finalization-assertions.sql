\set ON_ERROR_STOP on
create schema test;
grant usage on schema test to authenticated;
create function test.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
declare v_ok boolean := false;
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then v_ok := true;
    else raise exception 'Unexpected error "%" (expected /%/)', sqlerrm, p_pattern; end if;
  end;
  if not v_ok then raise exception 'Expected an error matching /%/ from: %', p_pattern, p_sql; end if;
end $$;
create function test.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'FAILED: %', p_label; end if; raise notice 'PASS: %', p_label; end $$;
grant execute on all functions in schema test to authenticated;

\set pm   '''00000000-0000-0000-0000-00000000000a'''
\set ev1  '''00000000-0000-0000-0000-0000000000e1'''
\set ev2  '''00000000-0000-0000-0000-0000000000e2'''
\set ev3  '''00000000-0000-0000-0000-0000000000e3'''
\set out  '''00000000-0000-0000-0000-0000000000ff'''
\set cls  '''00000000-0000-0000-0000-0000000000c1'''

-- ================= Retest rules (inserts run as the claim RPC owner) =================
select test.expect_error($$insert into public.evaluations(event_id,participant_id,evaluator_id,attempt_number,status)
  values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000e2',2,'in_progress')$$,
  'finalized Attempt 1 FAIL');
select test.check(true, 'A2 refused when Attempt 1 has not reached the server');

insert into public.evaluations(id,event_id,participant_id,evaluator_id,attempt_number,status,overall_result,completed_at)
values ('00000000-0000-0000-0000-00000000a101','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000e1',1,'finalized','fail',now());
select test.expect_error($$insert into public.evaluations(event_id,participant_id,evaluator_id,attempt_number,status)
  values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000e1',2,'in_progress')$$,
  'different evaluator');
select test.check(true, 'A2 refused for the Attempt 1 evaluator');

insert into public.evaluations(id,event_id,participant_id,evaluator_id,attempt_number,status)
values ('00000000-0000-0000-0000-00000000a201','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000e2',2,'in_progress');
select test.check(exists(select 1 from public.evaluations where id='00000000-0000-0000-0000-00000000a201'), 'A2 accepted for a different evaluator after A1 FAIL');

select test.expect_error($$update public.evaluations set evaluator_id='00000000-0000-0000-0000-0000000000e1' where id='00000000-0000-0000-0000-00000000a201'$$, 'different evaluator');
select test.check(true, 'A2 cannot be reassigned to the Attempt 1 evaluator');

insert into public.evaluations(event_id,participant_id,evaluator_id,attempt_number,status,overall_result,completed_at)
values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000e1',1,'finalized','pass',now());
select test.expect_error($$insert into public.evaluations(event_id,participant_id,evaluator_id,attempt_number,status)
  values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000e2',2,'in_progress')$$,
  'finalized Attempt 1 FAIL');
select test.check(true, 'A2 refused after Attempt 1 PASS');

-- A pre-existing same-evaluator A2 (created before this rule) can still finalize.
set session_replication_role = replica;
insert into public.evaluations(id,event_id,participant_id,evaluator_id,attempt_number,status)
values ('00000000-0000-0000-0000-00000000a203','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000e1',2,'in_progress');
set session_replication_role = origin;
update public.evaluations set status='finalized', overall_result='pass', completed_at=now() where id='00000000-0000-0000-0000-00000000a203';
select test.check((select status from public.evaluations where id='00000000-0000-0000-0000-00000000a203')='finalized', 'In-flight legacy A2 still finalizes');

-- ================= Field evidence confirmation =================
insert into public.evaluations(id,event_id,participant_id,evaluator_id,attempt_number,status,overall_result,started_at,completed_at,app_data) values
 ('00000000-0000-0000-0000-00000000f001','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-0000000000e1',1,'finalized','pass',
  '2026-10-30T15:00:00Z','2026-10-30T18:00:00Z','{"fieldStartedAt":1793373600000,"fieldFinalizedAt":1793374500000,"fieldFinalResult":"PASS"}'),
 ('00000000-0000-0000-0000-00000000f002','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000e1',1,'finalized','fail',
  '2026-10-30T15:00:00Z','2026-10-30T18:00:00Z','{"fieldStartedAt":1793373600000,"fieldFinalizedAt":1793374500000,"fieldFinalResult":"PASS"}'),
 ('00000000-0000-0000-0000-00000000f003','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-0000000000e1',1,'in_progress',null,
  '2026-10-30T15:00:00Z',null,'{"fieldStartedAt":1793373600000}');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
set role authenticated;
select test.expect_error($$update public.evaluations set app_data='{}' where id='00000000-0000-0000-0000-00000000f001'$$, 'authoritative evaluation lifecycle');
select test.check(true, 'Fixture guard: browser sessions cannot edit a finalized record');

select test.check((public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f001','2026-10-30T14:40:00.000Z','2026-10-30T14:55:00.000Z','PASS','phone-1')->>'reason')='field_evidence_changed_after_upload',
  'Field times that differ from the uploaded evidence are refused');
select test.check((public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f001','2026-10-30T15:20:00.000Z','2026-10-30T15:35:00.000Z','PASS','phone-1')->>'confirmed')::boolean,
  'Matching field evidence is confirmed');
reset role;
select test.check((select started_at from public.evaluations where id='00000000-0000-0000-0000-00000000f001')='2026-10-30T15:20:00Z'::timestamptz, 'Official start time becomes the real field start');
select test.check((select app_data->'serverAuditConfirmation'->>'confirmedBy' from public.evaluations where id='00000000-0000-0000-0000-00000000f001')='00000000-0000-0000-0000-0000000000e1', 'Confirmation records who confirmed it');
select test.check((select app_data->>'serverClaimedAt' from public.evaluations where id='00000000-0000-0000-0000-00000000f001') is not null, 'Server claim time is retained separately');
set role authenticated;
select test.check((public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f001','2026-10-30T15:20:00.000Z','2026-10-30T15:35:00.000Z','PASS','phone-1')->>'alreadyConfirmed')::boolean,
  'Repeating a confirmation is safe');
select test.check((public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f002','2026-10-30T15:20:00.000Z','2026-10-30T15:35:00.000Z','PASS','phone-1')->>'reason')='field_result_mismatch',
  'A field result that differs from the server result is flagged');
select test.check((public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f003','2026-10-30T15:20:00.000Z','2026-10-30T15:35:00.000Z','PASS','phone-1')->>'reason')='evaluation_not_finalized',
  'Unfinalized records cannot be confirmed');
select test.expect_error($$select public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f001','2026-10-30T15:20:00Z','2026-10-30T15:10:00Z','PASS',null)$$, 'cannot precede');
select test.check(true, 'Finish before start is refused');
reset role;
select test.check((select app_data->'serverAuditConfirmation'->>'resultDiffers' from public.evaluations where id='00000000-0000-0000-0000-00000000f002')='true', 'Result difference is recorded on the server');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
set role authenticated;
select test.check((public.confirm_offline_evaluation_audit('00000000-0000-0000-0000-00000000f003','2026-10-30T15:20:00Z','2026-10-30T15:35:00Z','PASS',null)->>'reason')='evaluation_owned_by_other_evaluator',
  'Another evaluator cannot confirm someone else''s record');

-- ================= Closure gate =================
select test.expect_error($$select public.close_class_authoritatively('00000000-0000-0000-0000-0000000000c1')$$, 'permission denied');
select test.check(true, 'The old close RPC is no longer reachable from browser sessions');

select test.expect_error($$select public.request_class_closure('00000000-0000-0000-0000-0000000000c1')$$, 'Program Manager');
select test.check(true, 'Evaluators cannot request closure');

-- Morning: three phones download the class and report clean.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select public.report_class_device_sync(:cls, 'device-phone-1', 'SSgt One · iPhone', 0);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
select public.report_class_device_sync(:cls, 'device-phone-2', 'TSgt Two · Android', 0);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false);
select public.report_class_device_sync(:cls, 'device-phone-3', 'MSgt Three · iPhone', 0);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.check((public.close_class_with_device_gate(:cls)->>'closed')::boolean = false, 'Closing without Prepare to Close is refused');
select test.check((public.request_class_closure(:cls)->>'waiting')::int = 3, 'After Prepare to Close, all three phones must check in again');
select test.check(jsonb_array_length(public.close_class_with_device_gate(:cls)->'issues') = 3, 'Morning check-ins do not count after the closure request');

-- Afternoon: phones return and sync. Phone 3 still holds two records.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select test.check((public.report_class_device_sync(:cls, 'device-phone-1', null, 0)->>'closureRequestedAt') is not null, 'Phones learn that closure was requested');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
select public.report_class_device_sync(:cls, 'device-phone-2', null, 0);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false);
select public.report_class_device_sync(:cls, 'device-phone-3', null, 2);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.check((public.close_class_with_device_gate(:cls)->'issues'->>0) ~ '2 item\(s\) still on this device', 'A phone with unsynced records blocks closure and is named');
select test.check((select status from public.classes where id=:cls)='active', 'Class remains open');

-- RLS: class members can read the check-ins; outsiders cannot; nobody writes directly.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e2', false);
select test.check((select count(*) from public.class_device_checkins)=3, 'Class evaluators can see the device list');
select test.expect_error($$insert into public.class_device_checkins(class_id,device_id,user_id) values ('00000000-0000-0000-0000-0000000000c1','fake','00000000-0000-0000-0000-0000000000e2')$$, 'permission denied');
select test.check(true, 'Check-ins cannot be forged by direct writes');
select test.expect_error($$select public.release_class_device('00000000-0000-0000-0000-0000000000c1','device-phone-3','Phone lost on range')$$, 'Program Manager');
select test.check(true, 'Evaluators cannot release a phone');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ff', false);
select test.check((select count(*) from public.class_device_checkins)=0, 'Outsiders see no check-ins');
select test.expect_error($$select public.report_class_device_sync('00000000-0000-0000-0000-0000000000c1','x',null,0)$$, 'Current access');
select test.check(true, 'Outsiders cannot report for the class');

-- Lost phone path.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.expect_error($$select public.release_class_device('00000000-0000-0000-0000-0000000000c1','device-phone-3','lost')$$, 'at least 5 characters');
select test.check(true, 'Releasing a phone requires a reason');
select test.check((public.release_class_device(:cls, 'device-phone-3', 'Phone battery failed; records re-entered by PM')->>'ready')::boolean, 'Released phone no longer blocks closure');
-- The released phone comes back with records: it re-enters the gate.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false);
select public.report_class_device_sync(:cls, 'device-phone-3', null, 2);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.check((public.class_device_closure_status(:cls)->>'ready')::boolean = false, 'A released phone that returns with records blocks closure again');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e3', false);
select public.report_class_device_sync(:cls, 'device-phone-3', null, 0);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select test.check((public.close_class_with_device_gate(:cls)->>'closed')::boolean, 'Class closes once every phone has checked in clean');
select test.check((select status from public.classes where id=:cls)='completed', 'Class is closed on the server');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select test.check((public.report_class_device_sync(:cls, 'device-phone-1', null, 0)->>'classClosed')::boolean, 'Phones learn the class is closed');
reset role;
\echo ALL OFFLINE FINALIZATION ASSERTIONS PASSED
