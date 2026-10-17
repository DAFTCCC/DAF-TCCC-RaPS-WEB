\set ON_ERROR_STOP on
set role anon;
select test.assert((select count(*) = 0 from public.memberships),'anonymous memberships are hidden');
select test.assert((select count(*) = 0 from public.access_requests),'anonymous requests are hidden');
select test.expect_error($$insert into public.memberships(user_id,role) values('00000000-0000-0000-0000-000000000010','enterprise_admin')$$,'42501');
select test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000010')$$,'42501');
select test.expect_error($$select public.fixture_unsafe_profile_email('00000000-0000-0000-0000-000000000003','victim@example.invalid')$$,'42501');
reset role;

set role authenticated;
do $tests$
declare actor text;
begin
  foreach actor in array array[
    '00000000-0000-0000-0000-000000000003', -- evaluator
    '00000000-0000-0000-0000-000000000004', -- installation manager
    '00000000-0000-0000-0000-000000000005', -- MAJCOM manager
    '00000000-0000-0000-0000-000000000006', -- expired administrator
    '00000000-0000-0000-0000-000000000007', -- future administrator
    '00000000-0000-0000-0000-000000000008', -- inactive administrator
    '00000000-0000-0000-0000-000000000009'  -- malformed scoped administrator
  ] loop
    perform set_config('request.jwt.claim.sub',actor,false);
    perform test.assert(not private.raps_account_is_enterprise_admin(),'non-effective admin rejected: '||actor);
    if actor = '00000000-0000-0000-0000-000000000004' then
      perform test.assert((select count(*)=3 from public.memberships),'installation manager retains only installation directory visibility');
      perform test.assert(not private.raps_account_can_view_membership('00000000-0000-0000-0000-000000000010','11000000-0000-0000-0000-000000000002',null),'installation manager cannot view inactive/out-of-scope installation access');
    elsif actor = '00000000-0000-0000-0000-000000000005' then
      perform test.assert((select count(*)=4 from public.memberships),'MAJCOM manager retains only command directory visibility');
      perform test.assert(private.raps_account_can_view_membership('00000000-0000-0000-0000-000000000010','11000000-0000-0000-0000-000000000002',null),'command oversight retains inactive installation history');
    else
      perform test.assert((select count(*)=1 from public.memberships),'only own membership readable: '||actor);
    end if;
    perform test.assert(not private.raps_account_can_view_membership('00000000-0000-0000-0000-000000000010','11000000-0000-0000-0000-000000000003',null),'other command memberships stay hidden');
    perform test.assert((select count(*)=0 from public.access_requests),'private requests hidden: '||actor);
    perform test.expect_error($$insert into public.memberships(user_id,role) values('00000000-0000-0000-0000-000000000010','enterprise_admin')$$,'42501');
    perform test.expect_affected('update public.memberships set active=false',0);
    perform test.expect_affected('delete from public.memberships',0);
    perform test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000010')$$,'42501');
    perform test.expect_error($$select public.fixture_unsafe_delete('20000000-0000-0000-0000-000000000001')$$,'42501');
    perform test.expect_error($$select public.fixture_unsafe_review('30000000-0000-0000-0000-000000000001')$$,'42501');
  end loop;
end;
$tests$;
reset role;
update public.memberships set ends_at=now()-interval '1 day' where id='20000000-0000-0000-0000-000000000004';
update public.memberships set active=false where id='20000000-0000-0000-0000-000000000005';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select test.assert((select count(*)=1 from public.memberships),'expired program manager loses scoped directory access');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
select test.assert((select count(*)=1 from public.memberships),'inactive MAJCOM manager loses scoped directory access');
reset role;
update public.memberships set ends_at=null where id='20000000-0000-0000-0000-000000000004';
update public.memberships set active=true where id='20000000-0000-0000-0000-000000000005';
set role authenticated;
select set_config('request.jwt.claim.sub','',false);
select test.expect_error($$select public.fixture_unsafe_assign('00000000-0000-0000-0000-000000000010')$$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
update public.profiles set display_name='Updated Name',rank_text='Test rank',organization_text='Test unit',updated_at='2000-01-01'
where id='00000000-0000-0000-0000-000000000003';
select test.assert((select display_name='Updated Name' and updated_at>now()-interval '1 minute' from public.profiles where id=auth.uid()),'own descriptive profile fields remain editable with server modification time');
select test.expect_error($$update public.profiles set email='victim@example.invalid' where id=auth.uid()$$,'42501');
select test.expect_error($$select public.fixture_unsafe_profile_email('00000000-0000-0000-0000-000000000003','victim@example.invalid')$$,'42501');
select test.expect_error($$update public.profiles set id='00000000-0000-0000-0000-000000000013' where id=auth.uid()$$,'42501');
select test.expect_error($$update public.profiles set created_at='2000-01-01' where id=auth.uid()$$,'42501');
select test.expect_error($$update public.profiles set is_admin=true where id=auth.uid()$$,'42501');
select test.expect_error($$update public.profiles set display_name='Other profile' where id='00000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$insert into public.profiles(id,email) values('00000000-0000-0000-0000-000000000013','spoof@example.invalid')$$,'42501');
select test.expect_error($$delete from public.profiles where id=auth.uid()$$,'42501');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test.assert(private.raps_account_is_enterprise_admin(),'active global administrator allowed');
select test.assert((select count(*)=9 from public.memberships),'administrator sees memberships');
select test.expect_error($$update public.profiles set email='victim@example.invalid' where id=auth.uid()$$,'42501');
select test.expect_error($$update public.profiles set display_name='Unauthorized admin edit' where id='00000000-0000-0000-0000-000000000003'$$,'42501');
select test.expect_error($$update public.memberships set active=false where id='20000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$delete from public.memberships where id='20000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.memberships set starts_at=now()+interval '1 day' where id='20000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.memberships set ends_at=now() where id='20000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.memberships set role='enterprise_admin',base_id=null where id='20000000-0000-0000-0000-000000000003'$$,'42501');
select test.expect_error($$update public.memberships set created_by='00000000-0000-0000-0000-000000000001' where id='20000000-0000-0000-0000-000000000003'$$,'42501');

select test.expect_error($$insert into public.memberships(user_id,role,base_id) values('00000000-0000-0000-0000-000000000010','enterprise_admin','11000000-0000-0000-0000-000000000001')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role) values('00000000-0000-0000-0000-000000000010','evaluator')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role,base_id) values('00000000-0000-0000-0000-000000000010','evaluator','11000000-0000-0000-0000-000000000002')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role,base_id) values('00000000-0000-0000-0000-000000000010','program_manager','11000000-0000-0000-0000-000000000003')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role,majcom_id) values('00000000-0000-0000-0000-000000000010','majcom_manager','10000000-0000-0000-0000-000000000002')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role,base_id,majcom_id) values('00000000-0000-0000-0000-000000000010','evaluator','11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role) values('00000000-0000-0000-0000-000000000010','unsupported')$$,'22023');
select test.expect_error($$insert into public.memberships(user_id,role,created_by) values('00000000-0000-0000-0000-000000000010','enterprise_admin','00000000-0000-0000-0000-000000000002')$$,'42501');
select test.expect_error($$insert into public.memberships(user_id,role,starts_at,ends_at) values('00000000-0000-0000-0000-000000000010','enterprise_admin',now(),now()-interval '1 day')$$,'22023');

insert into public.memberships(id,user_id,role,base_id,created_at) values
  ('20000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000010','evaluator','11000000-0000-0000-0000-000000000001','2000-01-01');
select test.assert((select created_by=auth.uid() and created_at > now()-interval '1 minute' from public.memberships where id='20000000-0000-0000-0000-000000000010'),'membership attribution uses acting admin and server time');
update public.memberships set active=false, ends_at=now() where id='20000000-0000-0000-0000-000000000010';
update public.memberships set active=true, starts_at=now(),ends_at=null where id='20000000-0000-0000-0000-000000000010';
delete from public.memberships where id='20000000-0000-0000-0000-000000000010';
-- Admin-invite failure cleanup must remain possible for the new membership.
select test.assert((select count(*)=9 from public.memberships),'administrator assignment/reactivation/cleanup work');

select test.expect_error($$update public.access_requests set status='approved',email='forged@example.invalid' where id='30000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.access_requests set status='approved',reviewed_by='00000000-0000-0000-0000-000000000002' where id='30000000-0000-0000-0000-000000000001'$$,'42501');
select test.expect_error($$update public.access_requests set review_note='pending mutation' where id='30000000-0000-0000-0000-000000000001'$$,'22023');
select test.expect_error($$insert into public.access_requests(email,display_name,requested_role) values('forged@example.invalid','Forged','enterprise_admin')$$,'42501');
select test.expect_affected('delete from public.access_requests',0);
update public.access_requests set status='approved',reviewed_at='2000-01-01',review_note='Reviewed in test' where id='30000000-0000-0000-0000-000000000001';
select test.assert((select reviewed_by=auth.uid() and reviewed_at>now()-interval '1 minute' from public.access_requests where id='30000000-0000-0000-0000-000000000001'),'review attribution uses acting admin and server time');
select test.expect_error($$update public.access_requests set status='denied' where id='30000000-0000-0000-0000-000000000001'$$,'22023');
update public.access_requests set status='denied' where id='30000000-0000-0000-0000-000000000002';
reset role;

-- A stored inactive invalid-scope record may be deactivated, but not reactivated.
insert into public.memberships(id,user_id,role,base_id,active) values
  ('20000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000011','evaluator','11000000-0000-0000-0000-000000000002',false);
set role authenticated;
select test.expect_error($$update public.memberships set active=true where id='20000000-0000-0000-0000-000000000011'$$,'22023');
update public.memberships set active=false,ends_at=now() where id='20000000-0000-0000-0000-000000000011';
reset role;

set role service_role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
insert into public.profiles(id,email) values('00000000-0000-0000-0000-000000000013','trusted-created@example.invalid');
update public.profiles set email='trusted-updated@example.invalid' where id='00000000-0000-0000-0000-000000000013';
delete from public.profiles where id='00000000-0000-0000-0000-000000000013';
insert into public.memberships(id,user_id,role) values
  ('20000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000012','enterprise_admin');
delete from public.memberships where id='20000000-0000-0000-0000-000000000012';
select public.submit_access_request('{"email":"service@example.invalid","display_name":"Service path","requested_role":"evaluator","base_id":"11000000-0000-0000-0000-000000000001"}'::jsonb);
select test.assert((select count(*)=1 from public.access_requests where email='service@example.invalid'),'trusted public-request service still writes through service-only RPC');
reset role;
select test.assert((select count(*)=0 from public.memberships where user_id='00000000-0000-0000-0000-000000000012'),'trusted service cleanup succeeds');
select 'Account permission behavioral assertions passed';
