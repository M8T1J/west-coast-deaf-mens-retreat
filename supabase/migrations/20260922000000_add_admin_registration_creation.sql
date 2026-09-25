begin;

-- No backfill, deletion, merge, payment verification, or email dispatch.
-- Fail transactionally if new conflicting rows appeared since the schema review.
-- Cancelled but non-deleted registrations still reserve their identity.
create unique index registrations_active_identity_unique
  on public.registrations (
    lower(btrim(email)),
    lower(btrim(regexp_replace(first_name, '[[:space:]]+', ' ', 'g'))),
    lower(btrim(regexp_replace(last_name, '[[:space:]]+', ' ', 'g')))
  ) where deleted_at is null;

-- Immutable receipt: retry comparisons must not depend on subsequently edited
-- registration fields. Store a fingerprint, not a second copy of personal data.
create table public.admin_registration_requests (
  request_id uuid primary key,
  registration_id uuid not null unique references public.registrations(id),
  created_by uuid not null references auth.users(id),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  admin_reviewed boolean not null check (admin_reviewed),
  created_at timestamptz not null default now()
);
alter table public.admin_registration_requests enable row level security;
revoke all on public.admin_registration_requests from public, anon, authenticated, service_role;
grant select, insert on public.admin_registration_requests to service_role;

-- Only the authenticated/allowlisted Edge Function supplies p_actor_id.
-- No SECURITY DEFINER escalation: service_role already has registration access.
create function public.admin_create_registration(
  p_request_id uuid,
  p_actor_id uuid,
  p_registration jsonb,
  p_admin_reviewed boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb := '{}'::jsonb;
  v_key text;
  v_max integer;
  v_required boolean;
  v_text text;
  v_amount numeric;
  v_fingerprint text;
  v_receipt public.admin_registration_requests%rowtype;
  v_registration public.registrations%rowtype;
  v_duplicate_id uuid;
  v_constraint text;
begin
  if p_request_id is null or p_actor_id is null or p_admin_reviewed is distinct from true
     or jsonb_typeof(p_registration) is distinct from 'object' then
    return jsonb_build_object('status', 'invalid_details');
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_registration) as k(key)
    where k.key not in ('first_name','last_name','email','phone','videophone',
      'address_line','city','zip_code','church_name','emergency_name','emergency_phone',
      'bunk_selection','youth_info','payment_method','amount_due')
  ) then
    return jsonb_build_object('status', 'invalid_details');
  end if;

  for v_key, v_max, v_required in
    select * from (values
      ('first_name',100,true),('last_name',100,true),('email',254,true),
      ('phone',50,true),('videophone',50,false),('address_line',200,true),
      ('city',100,true),('zip_code',30,true),('church_name',200,true),
      ('emergency_name',200,true),('emergency_phone',50,true),
      ('bunk_selection',500,false),('youth_info',2000,false),('payment_method',20,true)
    ) as fields(key,max_length,required)
  loop
    if p_registration ? v_key and jsonb_typeof(p_registration->v_key) not in ('string','null') then
      return jsonb_build_object('status', 'invalid_details');
    end if;
    v_text := nullif(btrim(p_registration->>v_key), '');
    if (v_required and v_text is null) or length(v_text) > v_max then
      return jsonb_build_object('status', 'invalid_details');
    end if;
    if v_key in ('first_name','last_name') then
      v_text := btrim(regexp_replace(v_text, '[[:space:]]+', ' ', 'g'));
    end if;
    if v_key = 'email' then
      v_text := lower(v_text);
      if v_text !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
         or v_text ~ '[[:cntrl:]]' then
        return jsonb_build_object('status', 'invalid_details');
      end if;
    end if;
    v_payload := v_payload || jsonb_build_object(v_key,v_text);
  end loop;
  if v_payload->>'payment_method' not in ('paypal','zelle','money_order')
     or jsonb_typeof(p_registration->'amount_due') is distinct from 'number' then
    return jsonb_build_object('status', 'invalid_details');
  end if;
  v_amount := (p_registration->>'amount_due')::numeric;
  if v_amount <= 0 or v_amount > 100000 or v_amount <> round(v_amount,2) then
    return jsonb_build_object('status', 'invalid_details');
  end if;
  v_payload := v_payload || jsonb_build_object('amount_due',v_amount::numeric(10,2));
  v_fingerprint := encode(sha256(convert_to(v_payload::text, 'UTF8')), 'hex');

  -- Serialize retries of the same UUID. The unique identity index independently
  -- protects different UUIDs and simultaneous public/admin inserts and edits.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_receipt from public.admin_registration_requests where request_id=p_request_id;
  if found then
    if v_receipt.created_by <> p_actor_id or v_receipt.request_fingerprint <> v_fingerprint then
      return jsonb_build_object('status','request_conflict');
    end if;
    select * into v_registration from public.registrations where id=v_receipt.registration_id;
    if not found or v_registration.deleted_at is not null then
      return jsonb_build_object('status','registration_deleted');
    end if;
    return jsonb_build_object('status','replayed','id',v_registration.id);
  end if;

  -- The insert and receipt are one subtransaction. A collision can never leave
  -- a partial registration, replace a website row, or reset a verified payment.
  begin
    insert into public.registrations (
      client_registration_id,source,first_name,last_name,full_name,email,phone,videophone,
      address_line,city,zip_code,full_address,church_name,emergency_name,emergency_phone,
      bunk_selection,youth_info,payment_understanding,registration_status,payment_method,
      amount_due,amount_received,currency,payment_status,submitted_at,updated_by,
      payment_claimed_at,payment_verified_at,payment_verified_by,
      payment_provider_transaction_id,payment_provider_payer_id,payment_provider_event_id
    ) values (
      p_request_id,'admin_import',v_payload->>'first_name',v_payload->>'last_name',
      (v_payload->>'first_name') || ' ' || (v_payload->>'last_name'),
      v_payload->>'email',v_payload->>'phone',v_payload->>'videophone',
      v_payload->>'address_line',v_payload->>'city',v_payload->>'zip_code',
      (v_payload->>'address_line') || ', ' || (v_payload->>'city') || ', ' || (v_payload->>'zip_code'),
      v_payload->>'church_name',v_payload->>'emergency_name',v_payload->>'emergency_phone',
      v_payload->>'bunk_selection',v_payload->>'youth_info',false,'pending',
      v_payload->>'payment_method',v_amount,0,'USD','not_started',now(),p_actor_id,
      null,null,null,null,null,null
    ) returning * into v_registration;
    insert into public.admin_registration_requests
      (request_id,registration_id,created_by,request_fingerprint,admin_reviewed)
    values (p_request_id,v_registration.id,p_actor_id,v_fingerprint,true);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'registrations_active_identity_unique' then
      select id into v_duplicate_id from public.registrations
      where deleted_at is null
        and lower(btrim(email)) = v_payload->>'email'
        and lower(btrim(regexp_replace(first_name,'[[:space:]]+',' ','g'))) = lower(v_payload->>'first_name')
        and lower(btrim(regexp_replace(last_name,'[[:space:]]+',' ','g'))) = lower(v_payload->>'last_name');
      return jsonb_build_object('status','duplicate_registration','id',v_duplicate_id);
    elsif v_constraint = 'registrations_client_registration_id_key' then
      return jsonb_build_object('status','request_conflict');
    end if;
    raise;
  end;
  return jsonb_build_object('status','created','id',v_registration.id);
end;
$$;
revoke all on function public.admin_create_registration(uuid,uuid,jsonb,boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_create_registration(uuid,uuid,jsonb,boolean) to service_role;
commit;
