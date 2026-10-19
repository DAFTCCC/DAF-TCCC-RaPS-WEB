\set ON_ERROR_STOP on
-- Regression for the first assessment-start/class-sync failure. The reviewed
-- STABLE can_view_class(id) helper re-reads public.classes using the statement
-- snapshot, which cannot see the newly inserted row during INSERT RETURNING.
-- A minimal INSERT and a later, separately authorized SELECT preserve every
-- existing RLS, identity, ownership, and credential boundary.
select test_base_id as test_base_a
from private.raps_test_installations where source_base_id='11000000-0000-0000-0000-000000000001' \gset
select test_base_id as test_base_b
from private.raps_test_installations where source_base_id='11000000-0000-0000-0000-000000000004' \gset
select test_base_id as test_base_inactive
from private.raps_test_installations where source_base_id='11000000-0000-0000-0000-000000000002' \gset
insert into public.profiles(id,email,display_name) values
('00000000-0000-0000-0000-000000000103','class-create-proof@example.invalid','Synthetic TEST evaluator');
insert into public.memberships(user_id,role,base_id,active,starts_at) values
('00000000-0000-0000-0000-000000000103','evaluator',:'test_base_a',true,null);

create function test.expect_class_returning_denied(command text, expected_policy text default null)
returns void language plpgsql as $proof$
declare actual_code text; actual_message text;
begin
  begin
    execute command;
  exception when others then
    get stacked diagnostics actual_code=returned_sqlstate,actual_message=message_text;
    perform test.assert(actual_code='42501' and actual_message like 'new row violates row-level security policy%for table "classes"',
      'INSERT RETURNING reproduces class RLS rejection, not a different validation failure');
    if expected_policy is not null then
      perform test.assert(position('"'||expected_policy||'"' in actual_message)>0,
        'Enterprise reproduction names the exact restrictive SELECT policy from the screenshot');
    end if;
    return;
  end;
  raise exception 'Expected first INSERT RETURNING to be rejected by class SELECT policy';
end;
$proof$;

set role authenticated;
-- Ordinary live evaluator: rejected statement rolls back, while two separate
-- statements create and read the same exact owner/base/id without a bypass.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select test.expect_class_returning_denied($$insert into public.classes(id,base_id,created_by,name)
  values('40000000-0000-0000-0000-000000000201','11000000-0000-0000-0000-000000000001',auth.uid(),'Live class proof') returning *$$);
select test.assert(not exists(select 1 from public.classes where id='40000000-0000-0000-0000-000000000201'),
  'failed live INSERT RETURNING leaves no partial class');
insert into public.classes(id,base_id,created_by,name)
values('40000000-0000-0000-0000-000000000201','11000000-0000-0000-0000-000000000001',auth.uid(),'Live class proof');
select test.assert((select count(*)=1 from public.classes where id='40000000-0000-0000-0000-000000000201'
  and base_id='11000000-0000-0000-0000-000000000001' and created_by=auth.uid() and name='Live class proof'),
  'separate protected SELECT verifies exact live class identity, scope, owner, and metadata');
select test.expect_affected($$update public.classes set name='Live updated proof'
  where id='40000000-0000-0000-0000-000000000201' returning id$$,1);
select test.expect_error($$insert into public.classes(id,base_id,created_by,name)
  values('40000000-0000-0000-0000-000000000201','11000000-0000-0000-0000-000000000001',auth.uid(),'Duplicate')$$,'23505');
select test.assert((select name='Live updated proof' from public.classes where id='40000000-0000-0000-0000-000000000201'),
  'duplicate creation cannot overwrite the existing class');

-- TEST is an ordinary supported-command label at the same physical base.
-- Both labels must use identical membership, ownership and write/read rules.
insert into public.classes(id,base_id,created_by,name,app_data)
values('40000000-0000-0000-0000-000000000207','11000000-0000-0000-0000-000000000001',
  auth.uid(),'TEST-supported ordinary-base proof','{"majcom":"TEST"}');
select test.assert((select base_id='11000000-0000-0000-0000-000000000001'
  and created_by=auth.uid() and app_data->>'majcom'='TEST'
  from public.classes where id='40000000-0000-0000-0000-000000000207'),
  'TEST-supported class uses the same physical installation and protected read as a regular class');
select test.expect_error($$insert into public.classes(base_id,created_by,name,app_data)
  values('11000000-0000-0000-0000-000000000004',auth.uid(),'TEST label grants no scope','{"majcom":"TEST"}')$$,'42501');

-- Previously deployed duplicate bases remain compatible. No wildcard grants,
-- physical-base reassignment, or policy changes are introduced by the fix.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',false);
select test.expect_class_returning_denied(format($$insert into public.classes(id,base_id,created_by,name)
  values('40000000-0000-0000-0000-000000000202',%L,auth.uid(),'TEST class proof') returning *$$,:'test_base_a'));
select test.assert(not exists(select 1 from public.classes where id='40000000-0000-0000-0000-000000000202'),
  'failed TEST INSERT RETURNING leaves no partial class');
insert into public.classes(id,base_id,created_by,name)
values('40000000-0000-0000-0000-000000000202',:'test_base_a',auth.uid(),'TEST class proof');
select test.assert((select count(*)=1 from public.classes where id='40000000-0000-0000-0000-000000000202'
  and base_id=:'test_base_a' and created_by=auth.uid() and name='TEST class proof'),
  'separate protected SELECT verifies exact TEST class identity, scope, owner, and metadata');
select test.expect_affected($$update public.classes set name='TEST updated proof'
  where id='40000000-0000-0000-0000-000000000202' returning id$$,1);
select test.assert(not exists(select 1 from public.classes where id='40000000-0000-0000-0000-000000000201'),
  'TEST evaluator cannot read the physical-source class');
select test.expect_error($$insert into public.classes(base_id,created_by,name)
  values('11000000-0000-0000-0000-000000000001',auth.uid(),'Forbidden live')$$,'42501');
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,auth.uid(),'Forbidden other TEST installation')$$,:'test_base_b'),'42501');
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,auth.uid(),'Forbidden inactive TEST installation')$$,:'test_base_inactive'),'42501');
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,'00000000-0000-0000-0000-000000000003','Forged creator')$$,:'test_base_a'),'42501');
select test.expect_error(format($$update public.classes set base_id=%L
  where id='40000000-0000-0000-0000-000000000202'$$,:'test_base_b'),'42501');

-- Enterprise's deployed legacy ALL policy passes its permissive SELECT, so
-- this case reproduces the screenshot's named raps_ops_guard_select denial.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select test.expect_class_returning_denied(format($$insert into public.classes(id,base_id,created_by,name)
  values('40000000-0000-0000-0000-000000000203',%L,auth.uid(),'Enterprise TEST proof') returning *$$,:'test_base_a'),
  'raps_ops_guard_select');
insert into public.classes(id,base_id,created_by,name)
values('40000000-0000-0000-0000-000000000203',:'test_base_a',auth.uid(),'Enterprise TEST proof');
select test.assert((select count(*)=1 from public.classes where id='40000000-0000-0000-0000-000000000203'
  and base_id=:'test_base_a' and created_by=auth.uid()),'Enterprise can create and independently read a TEST class');

-- An access change between minimal INSERT and its follow-up read must fail
-- closed. No successful write is treated as permission to reveal it later.
reset role;
update public.memberships set active=false where user_id='00000000-0000-0000-0000-000000000103';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000103',false);
select test.assert(not exists(select 1 from public.classes where id='40000000-0000-0000-0000-000000000202'),
  'separate SELECT rechecks revoked authority and returns no class');
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,auth.uid(),'Revoked creation')$$,:'test_base_a'),'42501');
select test.expect_affected($$update public.classes set name='Revoked overwrite'
  where id='40000000-0000-0000-0000-000000000202' returning id$$,0);

-- Valid base membership never bypasses a managed account awaiting its required
-- password change. This uses the real credential gate from the migration.
reset role;
update public.memberships set active=true where user_id='00000000-0000-0000-0000-000000000103';
insert into private.raps_managed_logins(user_id,username,state,temp_password_digest,temporary_expires_at,created_by)
values('00000000-0000-0000-0000-000000000103','synthetic-test-proof','pending',repeat('a',64),
  statement_timestamp()+interval '1 hour','00000000-0000-0000-0000-000000000001');
set role authenticated;
select test.assert(not exists(select 1 from public.classes where id='40000000-0000-0000-0000-000000000202'),
  'pending managed login cannot read its previously created class');
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,auth.uid(),'Pending password-change creation')$$,:'test_base_a'),'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000018',false);
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,auth.uid(),'No membership')$$,:'test_base_a'),'42501');
reset role;
set role anon;
select set_config('request.jwt.claim.sub','',false);
select test.assert((select count(*)=0 from public.classes),'anonymous users cannot read any class');
select test.expect_error(format($$insert into public.classes(base_id,created_by,name)
  values(%L,'00000000-0000-0000-0000-000000000103','Anonymous creation')$$,:'test_base_a'),'42501');
reset role;
