\set ON_ERROR_STOP on

DO $$
DECLARE
  v_user uuid := '11000000-0000-0000-0000-000000000011';
  v_first uuid;
  v_second uuid;
  v_count integer;
BEGIN
  INSERT INTO auth.users(id, email)
  VALUES (v_user, 'phase11@example.test')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles(id, email, display_name)
  VALUES (v_user, 'phase11@example.test', 'Phase 11 Smoke')
  ON CONFLICT (id) DO NOTHING;

  SELECT id INTO v_first
  FROM request_account_deletion(v_user, 'live smoke');

  SELECT id INTO v_second
  FROM request_account_deletion(v_user, 'duplicate live smoke');

  IF v_first IS NULL OR v_first <> v_second THEN
    RAISE EXCEPTION 'deletion request was not idempotent';
  END IF;

  SELECT count(*) INTO v_count
  FROM account_deletion_requests
  WHERE user_id = v_user AND status IN ('requested', 'reviewing');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected one open deletion request, got %', v_count;
  END IF;

  INSERT INTO privacy_export_events(user_id, format_version, record_counts, completed_at)
  VALUES (v_user, 'phase11-smoke', '{"profiles": 1}'::jsonb, now());

  BEGIN
    UPDATE privacy_export_events
    SET record_counts = '{}'::jsonb
    WHERE user_id = v_user;
    RAISE EXCEPTION 'privacy export event mutation unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'PRIVACY_EXPORT_EVENTS_ARE_IMMUTABLE' THEN
        RAISE;
      END IF;
  END;
END
$$;

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'request_account_deletion(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated role can execute privileged deletion function';
  END IF;
  IF has_table_privilege('authenticated', 'privacy_export_events', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated role can insert privacy export evidence';
  END IF;
  IF NOT has_table_privilege('authenticated', 'privacy_export_events', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated role cannot select own export evidence';
  END IF;
END
$$;

\echo PHASE11_LIVE_SMOKE_PASSED
