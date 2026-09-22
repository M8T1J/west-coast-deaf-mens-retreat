begin;

-- Additive worker support. No email, scheduler, or HTTP request is created here.
-- Backfill only queued jobs: historical failures must not become auto-retryable.
-- The existing queued test job keeps its id, status, attempts, and timestamps.
alter table public.registration_email_outbox
  add column next_attempt_at timestamptz,
  add column claim_token uuid,
  add column lease_expires_at timestamptz,
  add column send_started_at timestamptz,
  add column last_error_code text;

update public.registration_email_outbox
set next_attempt_at = now()
where status = 'queued' and sent_at is null and attempts < 5;

alter table public.registration_email_outbox
  alter column next_attempt_at set default now(),
  add constraint registration_email_outbox_claim_pair_check
    check ((claim_token is null) = (lease_expires_at is null));

create index registration_email_outbox_due_idx
  on public.registration_email_outbox (next_attempt_at, created_at, id)
  where status in ('queued', 'failed') and sent_at is null
    and next_attempt_at is not null and attempts < 5;

create index registration_email_outbox_lease_idx
  on public.registration_email_outbox (lease_expires_at, id)
  where status = 'sending' and sent_at is null;

-- One shared rate gate, including across concurrent Edge Function instances.
-- It reserves dispatch times, not provider delivery times. The worker must send
-- immediately after a successful authorization and never replay that response.
create table public.registration_email_dispatch_control (
  id boolean primary key default true check (id),
  next_send_allowed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.registration_email_dispatch_control (id) values (true);

alter table public.registration_email_dispatch_control enable row level security;
revoke all on table public.registration_email_dispatch_control
  from public, anon, authenticated, service_role;
grant select, update on table public.registration_email_dispatch_control to service_role;

-- SECURITY INVOKER avoids granting the caller the migration owner's privileges.
-- The service role already has SELECT/UPDATE on registrations and the outbox.
-- Browser roles have neither RPC execution nor access to the dispatch gate.
create function public.claim_registration_email(p_outbox_id uuid default null)
returns setof public.registration_email_outbox
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.registration_email_outbox%rowtype;
  v_now timestamptz;
begin
  v_now := clock_timestamp();

  -- Bounded recovery, scoped to p_outbox_id during controlled testing.
  -- A legacy sending row without a token is also an uncertain outcome.
  for v_job in
    select o.* from public.registration_email_outbox as o
    where o.status = 'sending' and o.sent_at is null
      and (o.lease_expires_at is null or o.lease_expires_at <= v_now)
      and (p_outbox_id is null or o.id = p_outbox_id)
    order by o.lease_expires_at nulls first, o.id
    limit 100
    for update skip locked
  loop
    if v_job.send_started_at is not null or v_job.claim_token is null then
      update public.registration_email_outbox
      set status = 'failed', next_attempt_at = null,
          claim_token = null, lease_expires_at = null,
          last_error_code = 'delivery_unknown',
          last_error = 'Expired send authorization; review provider history before retrying.',
          updated_at = clock_timestamp()
      where id = v_job.id;
    else
      update public.registration_email_outbox
      set status = case when attempts < 5 then 'queued' else 'failed' end,
          next_attempt_at = case when attempts < 5 then clock_timestamp() else null end,
          claim_token = null, lease_expires_at = null,
          last_error_code = case when attempts < 5 then 'lease_expired' else 'attempts_exhausted' end,
          last_error = 'Claim expired before send authorization.',
          updated_at = clock_timestamp()
      where id = v_job.id;
    end if;
  end loop;

  select o.* into v_job
  from public.registration_email_outbox as o
  where o.event_type = 'payment_verified'
    and o.status in ('queued', 'failed') and o.sent_at is null
    and o.next_attempt_at <= clock_timestamp() and o.attempts < 5
    and o.claim_token is null and o.lease_expires_at is null
    and (p_outbox_id is null or o.id = p_outbox_id)
  order by o.created_at, o.id
  limit 1
  for update skip locked;

  if not found then return; end if;

  v_now := clock_timestamp();
  return query
  update public.registration_email_outbox as o
  set status = 'sending', claim_token = gen_random_uuid(),
      lease_expires_at = v_now + interval '2 minutes',
      send_started_at = null, next_attempt_at = null, updated_at = v_now
  where o.id = v_job.id
  returning o.*;
end;
$$;

-- Returns {authorized, reason} and, only on authorization, the outbox and the
-- minimum registration snapshot needed to build the email. Repeated calls for
-- the same token never authorize a second send or consume another attempt.
create function public.authorize_registration_email_send(
  p_outbox_id uuid,
  p_claim_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.registration_email_outbox%rowtype;
  v_registration public.registrations%rowtype;
  v_next_send timestamptz;
  v_now timestamptz;
begin
  select o.* into v_job from public.registration_email_outbox as o
  where o.id = p_outbox_id and o.status = 'sending' and o.sent_at is null
    and o.claim_token = p_claim_token
  for update;

  if not found then
    return jsonb_build_object('authorized', false, 'reason', 'claim_not_owned');
  end if;
  if v_job.send_started_at is not null then
    return jsonb_build_object('authorized', false, 'reason', 'already_authorized');
  end if;
  if v_job.lease_expires_at <= clock_timestamp() then
    return jsonb_build_object('authorized', false, 'reason', 'lease_expired');
  end if;

  -- Lock the registration against edits for the duration of this transaction.
  select r.* into v_registration from public.registrations as r
  where r.id = v_job.registration_id
  for share;

  if not found
    or v_job.event_type <> 'payment_verified'
    or v_registration.deleted_at is not null
    or v_registration.payment_status is distinct from 'verified'
    or v_registration.registration_status is distinct from 'completed'
    or v_registration.payment_verified_at is null
    or v_registration.amount_received is null
    or v_registration.amount_received <= 0
    or v_registration.amount_received::text in ('NaN', 'Infinity', '-Infinity')
    or v_registration.currency is distinct from 'USD'
    or v_registration.email is null
    or length(btrim(v_registration.email)) > 254
    or btrim(v_registration.email) !~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
    or v_registration.email ~ '[[:cntrl:]]'
  then
    update public.registration_email_outbox
    set status = 'failed', next_attempt_at = null,
        claim_token = null, lease_expires_at = null,
        last_error_code = 'invalid_registration',
        last_error = 'Registration is not eligible for a payment-verified email.',
        updated_at = clock_timestamp()
    where id = v_job.id;
    return jsonb_build_object('authorized', false, 'reason', 'invalid_registration');
  end if;

  if v_job.attempts >= 5 then
    update public.registration_email_outbox
    set status = 'failed', next_attempt_at = null,
        claim_token = null, lease_expires_at = null,
        last_error_code = 'attempts_exhausted', last_error = 'Maximum send attempts reached.',
        updated_at = clock_timestamp()
    where id = v_job.id;
    return jsonb_build_object('authorized', false, 'reason', 'attempts_exhausted');
  end if;

  select d.next_send_allowed_at into v_next_send
  from public.registration_email_dispatch_control as d where d.id = true
  for update;
  if not found then
    raise exception 'Registration email dispatch control is missing' using errcode = '55000';
  end if;

  -- Use wall clock AFTER waiting for locks, not transaction-start now().
  v_now := clock_timestamp();
  if v_job.lease_expires_at <= v_now then
    return jsonb_build_object('authorized', false, 'reason', 'lease_expired');
  end if;
  if v_next_send > v_now then
    update public.registration_email_outbox
    set status = 'queued', next_attempt_at = v_next_send,
        claim_token = null, lease_expires_at = null,
        last_error_code = 'dispatch_throttled', last_error = 'Waiting for shared dispatch rate limit.',
        updated_at = v_now
    where id = v_job.id;
    return jsonb_build_object('authorized', false, 'reason', 'dispatch_throttled',
                             'next_attempt_at', v_next_send);
  end if;

  update public.registration_email_dispatch_control
  set next_send_allowed_at = v_now + interval '1 second', updated_at = v_now
  where id = true;

  update public.registration_email_outbox
  set attempts = attempts + 1, send_started_at = v_now,
      lease_expires_at = v_now + interval '2 minutes',
      last_error_code = null, last_error = null, updated_at = v_now
  where id = v_job.id
  returning * into v_job;

  return jsonb_build_object(
    'authorized', true, 'reason', 'authorized', 'outbox', to_jsonb(v_job),
    'registration', jsonb_build_object(
      'id', v_registration.id, 'email', btrim(v_registration.email),
      'full_name', v_registration.full_name, 'first_name', v_registration.first_name,
      'last_name', v_registration.last_name, 'amount_received', v_registration.amount_received,
      'currency', v_registration.currency
    )
  );
end;
$$;

-- Call ONLY after confirmed EmailJS acceptance. A late known success may finish
-- an expired lease if recovery has not already invalidated its token. A false
-- result requires reconciliation, NEVER a repeat of the provider request.
create function public.complete_registration_email(
  p_outbox_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.registration_email_outbox as o
  set status = 'sent', sent_at = clock_timestamp(), next_attempt_at = null,
      claim_token = null, lease_expires_at = null,
      last_error_code = null, last_error = null, updated_at = clock_timestamp()
  where o.id = p_outbox_id and o.claim_token = p_claim_token
    and o.status = 'sending' and o.sent_at is null
    and o.send_started_at is not null and o.attempts > 0;
  return found;
end;
$$;

-- Error codes are allowlisted; raw provider bodies, recipient data, and secrets
-- are never accepted/stored. The worker must classify timeouts, lost responses,
-- and generic 5xx as delivery_unknown. pre_dispatch_failure is allowed only
-- when the worker KNOWS no provider request was dispatched.
create function public.fail_registration_email(
  p_outbox_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_retry_after_seconds integer default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.registration_email_outbox%rowtype;
  v_now timestamptz;
  v_retry_at timestamptz;
  v_delay_seconds double precision;
begin
  if p_error_code is null or p_error_code not in (
    'rate_limited', 'pre_dispatch_failure', 'invalid_registration',
    'provider_rejected', 'configuration_error', 'quota_exhausted', 'delivery_unknown'
  ) then
    raise exception 'Unsupported registration email error code' using errcode = '22023';
  end if;
  if p_retry_after_seconds is not null
    and (p_retry_after_seconds < 0 or p_error_code <> 'rate_limited') then
    raise exception 'Retry-After requires rate_limited and nonnegative seconds' using errcode = '22023';
  end if;

  select o.* into v_job from public.registration_email_outbox as o
  where o.id = p_outbox_id and o.claim_token = p_claim_token
    and o.status = 'sending' and o.sent_at is null
  for update;
  if not found then return false; end if;

  if p_error_code in ('rate_limited', 'provider_rejected', 'quota_exhausted', 'delivery_unknown')
    and v_job.send_started_at is null then
    raise exception 'Provider outcome requires a send authorization' using errcode = '22023';
  end if;

  v_now := clock_timestamp();
  if p_error_code in ('rate_limited', 'pre_dispatch_failure') and v_job.attempts < 5 then
    v_delay_seconds := case v_job.attempts
      when 0 then 60 when 1 then 60 when 2 then 300 when 3 then 1800 else 7200 end;
    v_delay_seconds := greatest(v_delay_seconds * (1 + random() * 0.2),
                               coalesce(p_retry_after_seconds, 0)::double precision);
    v_retry_at := v_now + make_interval(secs => v_delay_seconds);
  end if;

  -- Provider throttling pauses other jobs as well, even on the final attempt.
  if p_error_code = 'rate_limited' then
    update public.registration_email_dispatch_control
    set next_send_allowed_at = greatest(next_send_allowed_at,
          coalesce(v_retry_at, v_now + make_interval(secs => greatest(60, coalesce(p_retry_after_seconds, 0))))),
        updated_at = v_now
    where id = true;
    if not found then
      raise exception 'Registration email dispatch control is missing' using errcode = '55000';
    end if;
  end if;

  update public.registration_email_outbox
  set status = 'failed', next_attempt_at = v_retry_at,
      claim_token = null, lease_expires_at = null,
      last_error_code = p_error_code,
      last_error = case p_error_code
        when 'rate_limited' then 'Provider explicitly rejected the request due to throttling.'
        when 'pre_dispatch_failure' then 'Worker confirmed that no provider request was dispatched.'
        when 'invalid_registration' then 'Registration is not eligible for a payment-verified email.'
        when 'provider_rejected' then 'Provider explicitly rejected the request; manual correction required.'
        when 'configuration_error' then 'Email configuration requires correction.'
        when 'quota_exhausted' then 'Provider quota requires intervention.'
        else 'Delivery outcome is unknown; review provider history before retrying.'
      end,
      updated_at = v_now
  where id = v_job.id;
  return true;
end;
$$;

-- Explicit ACLs override Supabase defaults, including PUBLIC function execution.
revoke all on function public.claim_registration_email(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_registration_email_send(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_registration_email(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_registration_email(uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_registration_email(uuid) to service_role;
grant execute on function public.authorize_registration_email_send(uuid, uuid) to service_role;
grant execute on function public.complete_registration_email(uuid, uuid) to service_role;
grant execute on function public.fail_registration_email(uuid, uuid, text, integer) to service_role;

commit;
