do $$
declare
  notes_data_type text;
begin
  select data_type
  into notes_data_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'sweepstakes'
    and column_name = 'compliance_notes';

  if notes_data_type = 'ARRAY' then
    alter table public.sweepstakes
      alter column compliance_notes set default '{}'::text[],
      alter column compliance_notes set not null;
  else
    alter table public.sweepstakes
      alter column compliance_notes type text[]
      using case
        when compliance_notes is null or btrim(compliance_notes) = '' then '{}'::text[]
        else regexp_split_to_array(compliance_notes, '\s*;\s*')
      end,
      alter column compliance_notes set default '{}'::text[],
      alter column compliance_notes set not null;
  end if;
end $$;
