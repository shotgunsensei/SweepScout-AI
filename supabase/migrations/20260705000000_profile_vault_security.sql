alter table public.users_profile
  add column if not exists alternate_email text;
