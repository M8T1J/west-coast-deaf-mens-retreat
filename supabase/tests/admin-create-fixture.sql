-- Synthetic, isolated-test baseline matching the inspected registrations schema.
-- Never run against a project database. No production rows or credentials.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('22222222-2222-4222-8222-222222222222'), ('33333333-3333-4333-8333-333333333333');
create table public.registrations (
 id uuid primary key default gen_random_uuid(),
 client_registration_id uuid not null unique,
 source text not null default 'website' check(source in ('website','admin_import')),
 first_name text not null, last_name text not null, full_name text not null, email text not null,
 phone text not null, videophone text, address_line text not null, city text not null,
 zip_code text not null, full_address text not null, church_name text not null,
 emergency_name text not null, emergency_phone text not null, bunk_selection text, youth_info text,
 payment_understanding boolean not null default false,
 registration_status text not null default 'pending' check(registration_status in ('pending','completed','cancelled')),
 payment_method text not null check(payment_method in ('paypal','zelle','money_order')),
 amount_due numeric(10,2) not null check(amount_due>0), amount_received numeric(10,2) check(amount_received>=0),
 currency character(3) not null default 'USD',
 payment_status text not null default 'not_started' check(payment_status in ('not_started','pending_paypal','awaiting_manual_verification','verified','failed','refunded')),
 payment_provider_transaction_id text, payment_provider_payer_id text, payment_provider_event_id text,
 payment_claimed_at timestamptz, payment_verified_at timestamptz, payment_verified_by uuid references auth.users(id),
 payment_verification_note text, payment_failure_reason text,
 submitted_at timestamptz not null default now(), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id), cancellation_note text,
 deleted_at timestamptz, deleted_by uuid references auth.users(id)
);
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;
create unique index registrations_provider_event_unique on public.registrations(payment_provider_event_id) where payment_provider_event_id is not null;
create unique index registrations_provider_transaction_unique on public.registrations(payment_method,payment_provider_transaction_id) where payment_provider_transaction_id is not null;
create function public.set_registration_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end; $$;
create trigger registrations_updated_at before update on public.registrations for each row execute function public.set_registration_updated_at();
