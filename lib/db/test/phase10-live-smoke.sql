\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000001', 'owner@example.test'),
  ('00000000-0000-0000-0000-000000000002', 'pilot@example.test');

INSERT INTO profiles (id, email, display_name, platform_role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'owner@example.test', 'Owner', 'owner'),
  ('00000000-0000-0000-0000-000000000002', 'pilot@example.test', 'Pilot', 'user');

INSERT INTO credit_ledger (
  user_id, amount, entry_type, reason_code, source_reference, idempotency_key
) VALUES (
  '00000000-0000-0000-0000-000000000002', 100, 'grant',
  'test_seed', 'phase10-live-smoke', 'phase10:seed:grant'
);

SELECT * FROM adjust_pilot_credits(
  '00000000-0000-0000-0000-000000000002', 25,
  'admin_promotional_credit', '00000000-0000-0000-0000-000000000001',
  'phase10:credit:grant', '{"reason":"live smoke"}'
);
SELECT * FROM adjust_pilot_credits(
  '00000000-0000-0000-0000-000000000002', -10,
  'admin_credit_correction', '00000000-0000-0000-0000-000000000001',
  'phase10:credit:correction', '{"reason":"live smoke"}'
);
SELECT * FROM adjust_pilot_credits(
  '00000000-0000-0000-0000-000000000002', -10,
  'admin_credit_correction', '00000000-0000-0000-0000-000000000001',
  'phase10:credit:correction', '{"reason":"idempotency replay"}'
);

INSERT INTO sources (
  id, name, base_url, source_type, access_method,
  robots_policy_status, terms_review_status, attribution_text
) VALUES (
  '10000000-0000-0000-0000-000000000001', 'Approved Test Sponsor',
  'https://sponsor.example.test', 'publisher', 'structured_html',
  'approved', 'approved', 'Approved Test Sponsor'
);

INSERT INTO discovered_urls (id, source_id, url, canonical_url, status) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'https://sponsor.example.test/target', 'https://sponsor.example.test/target', 'fetched'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'https://sponsor.example.test/source', 'https://sponsor.example.test/source', 'fetched');

INSERT INTO sweepstakes (
  id, title, normalized_title, sponsor_name, official_url,
  legitimacy_score, source_confidence_score, status
) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Target Listing', 'target listing', 'Approved Test Sponsor', 'https://sponsor.example.test/target', 90, 90, 'active'),
  ('30000000-0000-0000-0000-000000000002', 'Duplicate Listing', 'duplicate listing', 'Approved Test Sponsor', 'https://sponsor.example.test/source', 80, 80, 'active');

INSERT INTO sweepstakes_sources (
  sweepstakes_id, source_id, discovered_url_id, source_listing_title
) VALUES
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Target Listing'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'Duplicate Listing');

DO $$
DECLARE
  v_event uuid;
  v_count integer;
  v_balance bigint;
BEGIN
  SELECT pilot_credit_balance('00000000-0000-0000-0000-000000000002') INTO v_balance;
  IF v_balance <> 115 THEN
    RAISE EXCEPTION 'Unexpected Pilot Credit balance: %', v_balance;
  END IF;

  SELECT admin_merge_sweepstakes(
    '30000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Live transactional merge smoke'
  ) INTO v_event;

  SELECT count(*) INTO v_count
  FROM sweepstakes_sources
  WHERE sweepstakes_id = '30000000-0000-0000-0000-000000000001';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Merge did not move source attribution: %', v_count;
  END IF;

  PERFORM admin_undo_merge(v_event, '00000000-0000-0000-0000-000000000001');

  SELECT count(*) INTO v_count
  FROM sweepstakes_sources
  WHERE sweepstakes_id = '30000000-0000-0000-0000-000000000001';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Undo retained moved target attribution: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM sweepstakes_sources
  WHERE sweepstakes_id = '30000000-0000-0000-0000-000000000002';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Undo did not restore source attribution: %', v_count;
  END IF;

  IF (SELECT status FROM sweepstakes WHERE id = '30000000-0000-0000-0000-000000000002') <> 'active' THEN
    RAISE EXCEPTION 'Undo did not restore source listing status';
  END IF;
END $$;

INSERT INTO admin_audit_logs (
  actor_user_id, actor_role, action, target_type, target_id,
  before_state, after_state, reason, correlation_id
) VALUES (
  '00000000-0000-0000-0000-000000000001', 'owner',
  'phase10.live_smoke', 'validation', 'phase10',
  '{"state":"before"}', '{"state":"after"}',
  'Validate immutable audit storage', 'phase10-live-smoke'
);

DO $$
BEGIN
  BEGIN
    UPDATE admin_audit_logs
    SET reason = 'This mutation must be rejected'
    WHERE correlation_id = 'phase10-live-smoke';
    RAISE EXCEPTION 'Audit update unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM = 'Audit update unexpectedly succeeded' THEN
        RAISE;
      END IF;
  END;

  IF has_table_privilege('authenticated', 'admin_audit_logs', 'SELECT')
    OR has_table_privilege('anon', 'admin_audit_logs', 'SELECT') THEN
    RAISE EXCEPTION 'Browser role can read admin audit logs';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'adjust_pilot_credits(uuid,integer,text,text,text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Authenticated role can execute credit adjustments';
  END IF;
END $$;

SELECT
  pilot_credit_balance('00000000-0000-0000-0000-000000000002') AS credit_balance,
  (SELECT count(*) FROM credit_ledger WHERE idempotency_key = 'phase10:credit:correction') AS correction_rows,
  (SELECT status FROM sweepstakes_merge_events LIMIT 1) AS merge_status,
  (SELECT count(*) FROM admin_audit_logs WHERE correlation_id = 'phase10-live-smoke') AS immutable_audit_rows,
  'PHASE10_LIVE_SMOKE_PASSED' AS result;
