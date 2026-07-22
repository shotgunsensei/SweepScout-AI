CREATE TABLE IF NOT EXISTS user_sweepstakes_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sweepstakes_id uuid NOT NULL REFERENCES sweepstakes(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 4000), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sweepstakes_notes_owner_idx ON user_sweepstakes_notes(user_id, sweepstakes_id, created_at DESC);
CREATE TABLE IF NOT EXISTS user_search_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120), filters jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(filters) = 'object'),
  alert_enabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_search_profiles_owner_name_unique UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS user_search_profiles_alert_idx ON user_search_profiles(user_id, alert_enabled);
ALTER TABLE user_sweepstakes_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_search_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    CREATE POLICY user_sweepstakes_notes_own ON user_sweepstakes_notes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
    CREATE POLICY user_search_profiles_own ON user_search_profiles FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
