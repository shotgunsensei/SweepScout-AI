create extension if not exists pgcrypto;

do $$
begin
  create type public.sweepstakes_status as enum (
    'discovered',
    'reviewed',
    'eligible',
    'ineligible',
    'suspicious',
    'expired'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.entry_attempt_status as enum (
    'queued',
    'prefilled',
    'submitted_by_user',
    'skipped',
    'suspicious',
    'winner_notification',
    'expired',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.users_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  email text not null,
  alternate_email text,
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'US',
  date_of_birth date,
  consent_to_prefill boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sweepstakes (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  canonical_url text,
  title text not null,
  sponsor text,
  prize_summary text,
  estimated_value numeric(12, 2),
  deadline timestamptz,
  eligibility_text text,
  eligible_states text[] not null default '{}',
  minimum_age integer check (minimum_age is null or minimum_age >= 0),
  entry_frequency text,
  purchase_required boolean not null default false,
  no_purchase_method_found boolean not null default false,
  form_url text,
  official_rules_url text,
  status public.sweepstakes_status not null default 'discovered',
  scam_score integer not null default 0 check (scam_score between 0 and 100),
  compliance_notes text[] not null default '{}'::text[],
  extracted_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sweepstakes_canonical_url_unique unique nulls not distinct (canonical_url)
);

create table if not exists public.discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  status text not null default 'queued',
  results_found integer not null default 0 check (results_found >= 0),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.entry_attempts (
  id uuid primary key default gen_random_uuid(),
  sweepstakes_id uuid not null references public.sweepstakes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.entry_attempt_status not null default 'queued',
  submitted_at timestamptz,
  notes text,
  screenshot_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.extraction_jobs (
  id text primary key,
  sweepstakes_id uuid not null references public.sweepstakes(id) on delete cascade,
  status text not null default 'queued',
  summary text,
  model text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists users_profile_user_id_idx on public.users_profile (user_id);
create index if not exists sweepstakes_status_deadline_idx on public.sweepstakes (status, deadline);
create index if not exists sweepstakes_deadline_idx on public.sweepstakes (deadline);
create index if not exists sweepstakes_eligible_states_idx on public.sweepstakes using gin (eligible_states);
create index if not exists discovery_jobs_status_created_idx on public.discovery_jobs (status, created_at desc);
create index if not exists entry_attempts_user_status_idx on public.entry_attempts (user_id, status);
create index if not exists entry_attempts_sweepstakes_idx on public.entry_attempts (sweepstakes_id);
create index if not exists extraction_jobs_sweepstakes_created_idx on public.extraction_jobs (sweepstakes_id, created_at desc);
create index if not exists extraction_jobs_status_created_idx on public.extraction_jobs (status, created_at desc);
create index if not exists blocked_domains_domain_idx on public.blocked_domains (domain);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

drop trigger if exists users_profile_set_updated_at on public.users_profile;
create trigger users_profile_set_updated_at
before update on public.users_profile
for each row execute function public.set_updated_at();

drop trigger if exists sweepstakes_set_updated_at on public.sweepstakes;
create trigger sweepstakes_set_updated_at
before update on public.sweepstakes
for each row execute function public.set_updated_at();

drop trigger if exists extraction_jobs_set_updated_at on public.extraction_jobs;
create trigger extraction_jobs_set_updated_at
before update on public.extraction_jobs
for each row execute function public.set_updated_at();

alter table public.users_profile enable row level security;
alter table public.sweepstakes enable row level security;
alter table public.discovery_jobs enable row level security;
alter table public.entry_attempts enable row level security;
alter table public.extraction_jobs enable row level security;
alter table public.blocked_domains enable row level security;

revoke all on table public.users_profile from anon, authenticated;
revoke all on table public.sweepstakes from anon, authenticated;
revoke all on table public.discovery_jobs from anon, authenticated;
revoke all on table public.entry_attempts from anon, authenticated;
revoke all on table public.extraction_jobs from anon, authenticated;
revoke all on table public.blocked_domains from anon, authenticated;

grant select, insert, update, delete on table public.users_profile to authenticated;
grant select on table public.sweepstakes to authenticated;
grant select, insert, update, delete on table public.entry_attempts to authenticated;

grant select, insert, update, delete on table public.users_profile to service_role;
grant select, insert, update, delete on table public.sweepstakes to service_role;
grant select, insert, update, delete on table public.discovery_jobs to service_role;
grant select, insert, update, delete on table public.entry_attempts to service_role;
grant select, insert, update, delete on table public.extraction_jobs to service_role;
grant select, insert, update, delete on table public.blocked_domains to service_role;

drop policy if exists "Users can read their own profile" on public.users_profile;
create policy "Users can read their own profile"
on public.users_profile
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their own profile" on public.users_profile;
create policy "Users can create their own profile"
on public.users_profile
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own profile" on public.users_profile;
create policy "Users can update their own profile"
on public.users_profile
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own profile" on public.users_profile;
create policy "Users can delete their own profile"
on public.users_profile
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Authenticated users can read reviewed sweepstakes" on public.sweepstakes;
create policy "Authenticated users can read reviewed sweepstakes"
on public.sweepstakes
for select
to authenticated
using (true);

drop policy if exists "Users can read their own entry attempts" on public.entry_attempts;
create policy "Users can read their own entry attempts"
on public.entry_attempts
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can create their own entry attempts" on public.entry_attempts;
create policy "Users can create their own entry attempts"
on public.entry_attempts
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can update their own entry attempts" on public.entry_attempts;
create policy "Users can update their own entry attempts"
on public.entry_attempts
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Users can delete their own entry attempts" on public.entry_attempts;
create policy "Users can delete their own entry attempts"
on public.entry_attempts
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
