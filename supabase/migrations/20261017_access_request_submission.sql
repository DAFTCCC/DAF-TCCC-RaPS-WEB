-- Reproducible public Request Access submission, without public table access.
-- Prerequisites: the existing public.access_requests table and its enterprise
-- review RLS/audit trigger. This migration deliberately does not create or alter
-- that table, its policies, or any account/membership records. Missing columns or
-- incompatible deployed types must be resolved against the deployed schema.
-- Apply before deploying functions/request-access (JWT verification disabled
-- only for that public function). Gateway/IP rate limiting is still required;
-- same-email deduplication is not a general internet abuse rate limiter.

begin;

-- Fail before creating an RPC when the existing review-table contract is absent.
do $check$
begin
  if to_regclass('public.access_requests') is null then
    raise exception 'Request Access requires the existing public.access_requests table; no replacement table was created';
  end if;
  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'access_requests'
        and column_name in ('id','email','display_name','requested_role','base_id','majcom_id','justification','status','created_at','reviewed_at','reviewed_by','review_note')) <> 12 then
    raise exception 'The deployed public.access_requests table does not match the RaPS administrator review contract';
  end if;
end;
$check$;

create or replace function public.submit_access_request(p_request jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_request public.access_requests%rowtype;
  v_email text;
  v_role text;
begin
  -- The handler validates first; repeat security-relevant checks at the write
  -- boundary. Populate the deployed row type to preserve its existing enums.
  if jsonb_typeof(p_request) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid access request';
  end if;
  v_email := lower(btrim(p_request ->> 'email'));
  v_role := p_request ->> 'requested_role';
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(btrim(p_request ->> 'display_name'), '') = ''
    or length(p_request ->> 'display_name') > 120
    or coalesce(length(p_request ->> 'justification'), 0) > 2000
    or v_role is null or v_role not in ('evaluator','program_manager','majcom_manager') then
    raise exception using errcode = '22023', message = 'Invalid access request';
  end if;
  begin
    v_request := jsonb_populate_record(null::public.access_requests,
      p_request || jsonb_build_object('email', v_email, 'status', 'pending'));
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid access request scope';
  end;
  if v_role = 'majcom_manager' then
    if v_request.base_id is not null or v_request.majcom_id is null
      or not exists (select 1 from public.majcoms where id = v_request.majcom_id and active) then
      raise exception using errcode = '22023', message = 'Invalid access request scope';
    end if;
  elsif v_request.majcom_id is not null or v_request.base_id is null
    or not exists (select 1 from public.bases b join public.majcoms m on m.id = b.majcom_id
      where b.id = v_request.base_id and b.active and m.active) then
    raise exception using errcode = '22023', message = 'Invalid access request scope';
  end if;

  -- Serialize retries per normalized email across Edge Function instances.
  -- Never reveal whether that email has an account, a request, or assigned roles.
  perform pg_advisory_xact_lock(hashtextextended('raps-access-request:' || v_email, 0));
  if exists (select 1 from public.access_requests
      where lower(btrim(email)) = v_email
        and (status::text = 'pending' or created_at > now() - interval '60 seconds')) then
    return;
  end if;
  insert into public.access_requests
    (email, display_name, requested_role, base_id, majcom_id, justification, status, created_at)
  values
    (v_email, btrim(v_request.display_name), v_request.requested_role,
      v_request.base_id, v_request.majcom_id, nullif(btrim(v_request.justification), ''), v_request.status, now());
end;
$function$;

revoke all on function public.submit_access_request(jsonb) from public, anon, authenticated;
grant execute on function public.submit_access_request(jsonb) to service_role;

commit;
