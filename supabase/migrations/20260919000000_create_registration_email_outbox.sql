begin;

create table public.registration_email_outbox (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id),
  event_type text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_email_outbox_event_type_check
    check (event_type = 'payment_verified'),
  constraint registration_email_outbox_status_check
    check (status in ('queued', 'sending', 'sent', 'failed')),
  constraint registration_email_outbox_attempts_check
    check (attempts >= 0),
  constraint registration_email_outbox_registration_event_key
    unique (registration_id, event_type)
);

alter table public.registration_email_outbox enable row level security;

revoke all on table public.registration_email_outbox from anon, authenticated, service_role;
grant select, insert, update on table public.registration_email_outbox to service_role;

create index registration_email_outbox_dispatch_idx
  on public.registration_email_outbox (status, created_at)
  where status in ('queued', 'failed');

create function public.enqueue_payment_verified_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.payment_status is distinct from 'verified'
     and new.payment_status = 'verified'
     and new.registration_status = 'completed' then
    insert into public.registration_email_outbox (registration_id, event_type)
    values (new.id, 'payment_verified')
    on conflict (registration_id, event_type) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_payment_verified_email() from public, anon, authenticated;
grant execute on function public.enqueue_payment_verified_email() to service_role;

create trigger registration_enqueue_payment_verified_email
after update of payment_status, registration_status on public.registrations
for each row
execute function public.enqueue_payment_verified_email();

commit;
