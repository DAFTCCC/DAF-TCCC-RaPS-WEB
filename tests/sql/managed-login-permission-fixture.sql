\set ON_ERROR_STOP on
select :'phase'='prepare' as prepare \gset
\if :prepare
-- The general operational fixture intentionally has a minimal audit table;
-- extend it to the deployed account-administration provenance contract.
alter table public.audit_log add column actor_user_id uuid,add column entity_type text,
  add column entity_id uuid,add column new_value jsonb;
create function test.managed_actor(target uuid,issued bigint,marker boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare version text;
begin
  if marker and to_regclass('private.raps_managed_logins') is not null then
    execute 'select credential_version::text from private.raps_managed_logins where user_id=$1' into version using target;
  end if;
  perform set_config('request.jwt.claim.sub',target::text,false);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',target,'iat',issued,'session_id',target,
    'app_metadata',jsonb_build_object('raps_managed_login',marker,'raps_managed_credential_version',version))::text,false);
end;
$$;
create table test.managed_clinical_before as
  select p.oid,md5(pg_get_functiondef(p.oid)) fingerprint from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('fixture_claim','fixture_finalize','fixture_void','fixture_close');
create table test.managed_results(kind text primary key,value jsonb);
grant all on test.managed_results to anon,authenticated,service_role;
\else
select test.assert((select count(*)=18 from pg_policy where polname='raps_managed_login_session' and not polpermissive),'all public tables have restrictive credential gates');
select test.assert((select count(*)=18 from pg_trigger where tgname='raps_login_session_write'),'all public writes have credential guards including definer writes');
select test.assert(not exists(select 1 from test.managed_clinical_before b where md5(pg_get_functiondef(b.oid))<>b.fingerprint),'clinical lifecycle definitions are unchanged');
select test.assert(not has_table_privilege('authenticated','private.raps_managed_logins','SELECT'),'browser cannot read aliases or digests');
select test.assert(not has_table_privilege('service_role','private.raps_managed_logins','UPDATE'),'service must use reviewed state transitions');
select test.assert(not has_table_privilege('authenticated','private.raps_managed_login_sessions','SELECT')
  and not has_table_privilege('service_role','private.raps_managed_login_sessions','INSERT'),'session proof is private and requires reviewed service RPC');
select test.assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname like 'raps_managed_%'
    and (has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))),'browser cannot execute service RPCs');

set role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000001',0);
select test.assert((select count(*)>=2 from public.memberships),'legacy Enterprise directory remains accessible');
select test.assert(private.raps_account_is_enterprise_admin(),'legacy administrator is unaffected by missing iat');
select test.expect_error($$select public.raps_managed_lookup('managed.test')$$,'42501');
select test.expect_error($$select * from private.raps_managed_logins$$,'42501');
reset role;
-- Even an accidentally granted EXECUTE cannot bypass the original-role check.
grant execute on function public.raps_managed_lookup(text) to authenticated;
set role authenticated;
select test.expect_error($$select public.raps_managed_lookup('managed.test')$$,'42501');
reset role;
revoke execute on function public.raps_managed_lookup(text) from authenticated;

set role service_role;
select test.expect_error($$select public.raps_managed_create('00000000-0000-0000-0000-000000000003',0,'00000000-0000-0000-0000-000000000021','managed.test',repeat('a',64),'managed.test@login.raps.invalid','Managed Test','evaluator','11000000-0000-0000-0000-000000000001',null)$$,'42501');
insert into test.managed_results values('created',public.raps_managed_create(
  '00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000021',
  'managed.test',repeat('a',64),'managed.test@login.raps.invalid','Managed Test','evaluator',
  '11000000-0000-0000-0000-000000000001',null));
select test.assert(public.raps_managed_status('00000000-0000-0000-0000-000000000021',9999999999)->>'state'='issuing','new account is gated before Auth unban completes');
select public.raps_managed_finish_reset('00000000-0000-0000-0000-000000000001',0,
  '00000000-0000-0000-0000-000000000021',(select (value->>'credential_version')::uuid from test.managed_results where kind='created'));
select test.assert(public.raps_managed_lookup('managed.test')->>'user_id'='00000000-0000-0000-0000-000000000021','lookup exists only in the trusted service');
select test.assert(public.raps_managed_lookup('unknown.name') is null,'unknown username returns null');
select test.assert(public.raps_managed_list('00000000-0000-0000-0000-000000000001',0,0,1)->'next_offset'='null'::jsonb,'one-account list terminates');
select test.assert(not (public.raps_managed_list('00000000-0000-0000-0000-000000000001',0)::text like '%'||repeat('a',64)||'%'),'account directory never exposes digest');
select test.expect_error($$select public.raps_managed_begin_reset('00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000002',repeat('b',64))$$,'22023');
select test.expect_error($$select public.raps_managed_create('00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000022','managed.test',repeat('b',64),'managed.test@login.raps.invalid','Duplicate','evaluator','11000000-0000-0000-0000-000000000001',null)$$,'23505');
reset role;
select test.assert(not exists(select 1 from public.profiles where id='00000000-0000-0000-0000-000000000022'),'duplicate alias rolls back profile creation atomically');

set role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000021',9999999999,true);
select test.assert(not private.raps_login_current_session_usable(),'temporary credentials never grant app access');
select test.assert((select count(*)=0 from public.bases),'pending user cannot read public catalog through authenticated RLS');
select test.assert((select count(*)=0 from public.profiles),'pending user cannot read even own profile');
select test.assert((select count(*)=0 from public.memberships),'pending user cannot read own grant');
select test.assert(not private.can_create_at_base('11000000-0000-0000-0000-000000000001'),'clinical authorization helper is gated');
select test.expect_error($$select public.fixture_unsafe_profile_email('00000000-0000-0000-0000-000000000021','attacker@example.invalid')$$,'42501');
select test.managed_actor('00000000-0000-0000-0000-000000000023',9999999999,true);
select test.assert(not private.raps_login_current_session_usable(),'managed JWT marker without SQL alias fails closed');
select test.managed_actor('00000000-0000-0000-0000-000000000003',0,false);
select test.assert(private.can_create_at_base('11000000-0000-0000-0000-000000000001'),'legacy evaluator authorization is unchanged');
reset role;

update private.raps_managed_logins set temporary_expires_at=clock_timestamp()-interval '1 second'
  where username='managed.test';
set role service_role;
select test.expect_error($$select public.raps_managed_begin_complete('00000000-0000-0000-0000-000000000021',1,(public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid)$$,'42501');
reset role;
update private.raps_managed_logins set temporary_expires_at=clock_timestamp()+interval '24 hours' where username='managed.test';
set role service_role;
select public.raps_managed_begin_complete('00000000-0000-0000-0000-000000000021',1,
  (public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid);
select test.expect_error($$select public.raps_managed_begin_complete('00000000-0000-0000-0000-000000000021',1,(public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid)$$,'42501');
select test.expect_error($$select public.raps_managed_begin_reset('00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000021',repeat('b',64))$$,'55000');
insert into test.managed_results values('activated',public.raps_managed_finish_complete(
  '00000000-0000-0000-0000-000000000021',
  (public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid,repeat('1',32),repeat('2',64)));
select test.assert((public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'session_usable')::boolean=false,'old temporary-password JWT remains denied after activation');
select test.expect_error($$select public.raps_managed_finish_complete('00000000-0000-0000-0000-000000000021',(public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid,repeat('1',32),repeat('2',64))$$,'55000');
select test.assert(public.raps_managed_status('00000000-0000-0000-0000-000000000021',9999999999,'00000000-0000-0000-0000-000000000021')->>'session_usable'='false','direct Auth sign-in without trusted password proof is denied');
select test.assert(public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'temporary_password_digest'=repeat('a',64),'Edge temporary-digest contract matches SQL');
select test.assert((select (value->>'not_before')::bigint>0 from test.managed_results where kind='activated'),'Edge not_before contract matches SQL');
select public.raps_managed_register_session('00000000-0000-0000-0000-000000000021',
  (select (value->>'not_before')::bigint from test.managed_results where kind='activated'),
  '00000000-0000-0000-0000-000000000021',(public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid);
reset role;
set role authenticated;
select test.managed_actor('00000000-0000-0000-0000-000000000021',
  (select (value->>'not_before')::bigint-1 from test.managed_results where kind='activated'),true);
select test.assert((select count(*)=0 from public.profiles),'token issued before cutoff cannot use own-profile exception');
select test.managed_actor('00000000-0000-0000-0000-000000000021',
  (select (value->>'not_before')::bigint from test.managed_results where kind='activated'),true);
select test.assert(private.raps_login_current_session_usable(),'fresh permanent-password sign-in is usable');
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{session_id}','"00000000-0000-0000-0000-000000000099"')::text,false);
select test.assert((select count(*)=0 from public.profiles),'direct Auth session cannot bypass trusted service sign-in');
select test.managed_actor('00000000-0000-0000-0000-000000000021',9999999999,true);
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{app_metadata,raps_managed_credential_version}','"00000000-0000-0000-0000-000000000099"')::text,false);
select test.assert((select count(*)=0 from public.profiles),'stale Auth metadata fails closed even with a new token issuance time');
select test.managed_actor('00000000-0000-0000-0000-000000000021',9999999999,true);
select test.assert((select count(*)=1 from public.memberships),'fresh managed evaluator sees own valid grant');
select test.assert(private.can_create_at_base('11000000-0000-0000-0000-000000000001'),'fresh sign-in retains intended installation scope');
select test.assert(not private.can_create_at_base('11000000-0000-0000-0000-000000000005'),'fresh sign-in cannot escalate to another installation');
reset role;

set role service_role;
-- Session proof storage stays bounded even for repeated successful logins.
select public.raps_managed_register_session('00000000-0000-0000-0000-000000000021',9999999999,
  ('99000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  (public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid)
  from generate_series(1,25) n;
reset role;
select test.assert((select count(*)=20 from private.raps_managed_login_sessions where user_id='00000000-0000-0000-0000-000000000021'),'verified session proof storage is bounded per account');
set role service_role;
-- Active users can change their permanent password, but need a fresh session and
-- cannot overlap another completion or administrator reset.
select test.expect_error($$select public.raps_managed_begin_complete('00000000-0000-0000-0000-000000000021',1,(public.raps_managed_status('00000000-0000-0000-0000-000000000021',1)->>'credential_version')::uuid)$$,'42501');
select public.raps_managed_begin_complete('00000000-0000-0000-0000-000000000021',9999999999,
  (public.raps_managed_status('00000000-0000-0000-0000-000000000021',9999999999)->>'credential_version')::uuid);
reset role;
update private.raps_managed_logins set operation_started_at=clock_timestamp()-interval '6 minutes' where username='managed.test';
set role service_role;
insert into test.managed_results values('reset',public.raps_managed_begin_reset(
  '00000000-0000-0000-0000-000000000001',0,'00000000-0000-0000-0000-000000000021',repeat('b',64)));
select test.assert(public.raps_managed_status('00000000-0000-0000-0000-000000000021',9999999999)->>'state'='issuing','reset gates account before Auth side effects');
select test.expect_error($$select public.raps_managed_finish_complete('00000000-0000-0000-0000-000000000021',(select (value->>'credential_version')::uuid from test.managed_results where kind='created'),repeat('1',32),repeat('2',64))$$,'55000');
select public.raps_managed_finish_reset('00000000-0000-0000-0000-000000000001',0,
  '00000000-0000-0000-0000-000000000021',(select (value->>'credential_version')::uuid from test.managed_results where kind='reset'));
select test.assert((public.raps_managed_status('00000000-0000-0000-0000-000000000021',9999999999)->>'session_usable')::boolean=false,'reset invalidates all prior active access');
select test.assert((select bool_and(public.raps_managed_rate_limit(repeat('c',64))) from generate_series(1,20)),'initial throttle budget available');
select test.assert(not public.raps_managed_rate_limit(repeat('c',64)),'throttle denies over-budget attempt');
select test.expect_error($$select public.raps_managed_rate_limit('plaintext.username')$$,'22023');
select test.expect_error($$select public.raps_managed_rate_limit(repeat('d',64),100000)$$,'22023');
reset role;
select test.assert(not exists(select 1 from public.audit_log where new_value::text like '%'||repeat('a',64)||'%' or new_value::text like '%'||repeat('b',64)||'%'),'audit records contain no password digests');
update private.raps_managed_login_limits set window_ends_at=clock_timestamp()-interval '1 second';
set role service_role;
select test.assert(public.raps_managed_rate_limit(repeat('c',64)),'expired fixed window recovers');
reset role;
\endif
