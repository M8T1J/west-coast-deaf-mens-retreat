# Supabase registration backend

This directory contains the source for the deployed Supabase Edge Functions.
It must not contain secrets.

## Required Supabase secrets

Set these in the Supabase Edge Functions secrets dashboard before deployment:

```text
ALLOWED_ORIGIN=https://www.wcdmr.com
ADMIN_EMAILS=organizer@example.com
TURNSTILE_SECRET_KEY=<secret>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only function
environment values. Never add their values to this repository or browser code.

## Functions

- `public-register` accepts a validated, Turnstile-protected public
  registration and creates one pending record idempotently.
- `admin-registrations` requires a signed-in Supabase user whose email is in
  `ADMIN_EMAILS`; it lists, edits, verifies, and soft-deletes registrations.

The frontend uses these functions as its registration source of truth. Do not
put function secrets, database credentials, or access tokens in this directory.
