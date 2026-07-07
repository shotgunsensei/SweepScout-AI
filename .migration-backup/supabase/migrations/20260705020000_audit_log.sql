create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  severity text not null default 'info' check (severity in ('info', 'warn', 'block')),
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx
on public.audit_logs (created_at desc);

create index if not exists audit_logs_entity_idx
on public.audit_logs (entity_type, entity_id, created_at desc);

create index if not exists audit_logs_action_idx
on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on table public.audit_logs from anon, authenticated;
grant select, insert, update, delete on table public.audit_logs to service_role;
