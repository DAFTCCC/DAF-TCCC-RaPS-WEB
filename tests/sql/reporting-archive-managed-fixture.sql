\set ON_ERROR_STOP on
-- Both new migrations are installed in this isolated synthetic database.
set role service_role;
insert into test.managed_results values('archive-created',public.raps_managed_create(
  '00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000031',
  'archive.admin',repeat('a',64),'archive.admin@login.raps.invalid','Synthetic Managed Archive Admin',
  'enterprise_admin',null,null));
select public.raps_managed_finish_reset('00000000-0000-0000-0000-000000000001',0,
  '00000000-0000-0000-0000-000000000031',(select (value->>'credential_version')::uuid from test.managed_results where kind='archive-created'));
reset role;
set role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000031',9999999999,true);
select test.assert((select count(*)=0 from public.class_reporting_archives),'temporary-password Enterprise cannot read archive metadata');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000109','pending Enterprise')$$,'42501');
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000101',gen_random_uuid())$$,'42501');
select test.managed_actor('00000000-0000-0000-0000-000000000001',0,false);
select test.assert((select count(*)>0 from public.class_reporting_archives),'legacy Enterprise keeps scoped archive visibility');
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000109','legacy Enterprise retention');
select public.cancel_class_reporting_archive(class_id,request_id) from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000109';
reset role;
set role service_role;
select public.raps_managed_begin_complete('00000000-0000-0000-0000-000000000031',1,
  (public.raps_managed_status('00000000-0000-0000-0000-000000000031',1)->>'credential_version')::uuid);
insert into test.managed_results values('archive-activated',public.raps_managed_finish_complete(
  '00000000-0000-0000-0000-000000000031',
  (public.raps_managed_status('00000000-0000-0000-0000-000000000031',1)->>'credential_version')::uuid,
  repeat('c',32),repeat('d',64)));
reset role;
set role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000031',
  (select (value->>'not_before')::bigint from test.managed_results where kind='archive-activated'),true);
select test.assert((select count(*)=0 from public.class_reporting_archives),'active managed JWT without trusted session proof cannot read archives');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000109','missing password proof')$$,'42501');
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000101',gen_random_uuid())$$,'42501');
reset role;
set role service_role;
select public.raps_managed_register_session('00000000-0000-0000-0000-000000000031',
  (select (value->>'not_before')::bigint from test.managed_results where kind='archive-activated'),
  '00000000-0000-0000-0000-000000000031',
  (public.raps_managed_status('00000000-0000-0000-0000-000000000031',1)->>'credential_version')::uuid);
reset role;
set role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000031',1,true);
select test.assert((select count(*)=0 from public.class_reporting_archives),'old temporary token stays denied after password change');
select test.expect_error($$select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000109','stale temporary token')$$,'42501');
select test.expect_error($$select public.cancel_class_reporting_archive('40000000-0000-0000-0000-000000000101',gen_random_uuid())$$,'42501');
select test.managed_actor('00000000-0000-0000-0000-000000000031',
  (select (value->>'not_before')::bigint from test.managed_results where kind='archive-activated'),true);
select test.assert((select count(*)>0 from public.class_reporting_archives),'activated managed Enterprise sees archive metadata');
select public.request_class_reporting_archive('40000000-0000-0000-0000-000000000109','activated Enterprise retention');
select public.cancel_class_reporting_archive(class_id,request_id) from public.class_reporting_archives where class_id='40000000-0000-0000-0000-000000000109';
reset role;
select test.assert(not exists(select 1 from test.clinical_definitions b where pg_get_functiondef(b.oid)<>b.definition),'combined account/archive migrations preserve clinical function definitions');
