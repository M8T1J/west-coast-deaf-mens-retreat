-- Isolated test doubles ONLY. Never apply this fixture to a Supabase project.
-- PGlite has no extension background workers; these objects never use a network.
-- Retain a separate session superuser ONLY for fixture setup. Migrations and
-- scheduler ticks run as non-superuser postgres, which cannot assume the owner.
-- PostgreSQL cannot demote its bootstrap superuser. Rename it and create a
-- distinct postgres role instead; the latter owns the application objects.
create role isolated_test_admin superuser;
set session authorization isolated_test_admin;
alter role postgres rename to isolated_bootstrap;
create role postgres login nosuperuser createrole createdb bypassrls;
create role supabase_admin superuser;
-- PGlite cannot GRANT on its template1 catalog row; database ownership supplies
-- CREATE for schema DDL without changing extension ownership or superuser status.
do $$begin execute format('alter database %I owner to postgres',current_database()); end;$$;
grant usage, create on schema public to postgres;
-- EXTENSION OBJECTS
set role supabase_admin;
create schema cron;
create table cron.job (
 jobid bigint generated always as identity primary key, jobname text unique,
 schedule text, command text, username text default current_user, active boolean default true
);
create table cron.job_run_details (runid bigint primary key, jobid bigint, end_time timestamptz);
create function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql security definer set search_path='' as $$
 insert into cron.job(jobname,schedule,command,username) values(job_name,schedule,command,current_setting('role'))
 on conflict(jobname) do update set schedule=excluded.schedule, command=excluded.command, active=true
 returning jobid;
$$;
create function cron.alter_job(job_id bigint, schedule text default null,
 command text default null, database text default null, username text default null,
 active boolean default null) returns void
language sql security definer set search_path='' as $$update cron.job set active=$6 where jobid=$1;$$;
revoke all on all functions in schema cron from public;
grant usage on schema cron to postgres;
grant execute on all functions in schema cron to postgres with grant option;
grant select on cron.job to postgres;
grant select,insert,delete on cron.job_run_details to postgres;
create schema vault;
create table vault.secrets(name text, secret text);
create function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea)
returns bytea language sql as $$select $1;$$;
create function vault._crypto_aead_det_encrypt(bytea,bytea,bigint,bytea,bytea)
returns bytea language sql as $$select $1;$$;
create function vault._crypto_aead_det_noncegen() returns bytea language sql as $$select ''::bytea;$$;
revoke all on function vault._crypto_aead_det_encrypt(bytea,bytea,bigint,bytea,bytea), vault._crypto_aead_det_noncegen() from public;
create function vault.test_secret_gateway() returns text
language sql security definer set search_path='' as $$select secret from vault.secrets limit 1;$$;
create view vault.decrypted_secrets as select name, convert_from(vault._crypto_aead_det_decrypt(convert_to(secret,'UTF8'),null,null,null,null),'UTF8') as decrypted_secret from vault.secrets;
-- Match production grantor and privilege scope. These are supabase_admin grants.
grant usage on schema vault to postgres with grant option;
grant usage on schema vault to service_role;
grant select,delete,truncate,references on vault.secrets, vault.decrypted_secrets to postgres with grant option;
grant select,delete on vault.secrets,vault.decrypted_secrets to service_role;
create schema net;
create table net.http_request_queue (
 id bigserial primary key, method text, url text, headers jsonb, body jsonb, timeout_milliseconds integer
);
create table net._http_response (
 id bigint primary key,status_code integer,timed_out boolean default false,content text
);
create table net.test_configuration(fail_enqueue boolean not null);
insert into net.test_configuration values(false);
create function net._urlencode_string(character varying) returns text language sql as $$select $1::text;$$;
create function net._encode_url_with_params_array(text,text[]) returns text language sql as $$select $1;$$;
create function net.wake() returns void language sql as $$select;$$;
create function net.unrelated_helper() returns void language sql as $$select;$$;
create function net.http_post(url text, body jsonb default '{}'::jsonb,
 params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb,
 timeout_milliseconds integer default 2000) returns bigint
language plpgsql as $$
declare result bigint;
begin
 perform net._urlencode_string(key) from jsonb_each_text(params);
 insert into net.http_request_queue(method,url,headers,body,timeout_milliseconds)
 values('POST',net._encode_url_with_params_array(url,'{}'),headers,body,timeout_milliseconds) returning id into result;
 perform net.wake();
 if (select fail_enqueue from net.test_configuration) then
   raise exception 'Synthetic sensitive exception must not enter monitoring';
 end if;
 return result;
end; $$;

-- pg_net 0.20.4 defaults expose tables/sequences via PUBLIC. postgres has
-- no grant option on that path and cannot revoke the owner's PUBLIC grant.
grant usage on schema net to public;
grant all on all tables in schema net to public;
grant all on all sequences in schema net to public;
-- Preserve the scheduler's required rights during owner-level fixture hardening.
grant insert(method,url,headers,body,timeout_milliseconds),select(id) on net.http_request_queue to postgres;
grant select(id,status_code,timed_out,content) on net._http_response to postgres;
grant usage on sequence net.http_request_queue_id_seq to postgres;
-- Only the synthetic failure switch needs this fixture-specific permission.
grant select on net.test_configuration to postgres;
grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea),
 net.http_post(text,jsonb,jsonb,jsonb,integer),net._urlencode_string(character varying),
 net._encode_url_with_params_array(text,text[]),net.wake() to postgres;
set role postgres;
