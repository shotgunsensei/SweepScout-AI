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

create index if not exists extraction_jobs_sweepstakes_created_idx
on public.extraction_jobs (sweepstakes_id, created_at desc);

create index if not exists extraction_jobs_status_created_idx
on public.extraction_jobs (status, created_at desc);

drop trigger if exists extraction_jobs_set_updated_at on public.extraction_jobs;
create trigger extraction_jobs_set_updated_at
before update on public.extraction_jobs
for each row execute function public.set_updated_at();

alter table public.extraction_jobs enable row level security;
revoke all on table public.extraction_jobs from anon, authenticated;
grant select, insert, update, delete on table public.extraction_jobs to service_role;
