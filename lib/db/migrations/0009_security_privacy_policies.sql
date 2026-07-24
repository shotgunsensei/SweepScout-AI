ALTER TABLE account_deletion_requests
  ADD COLUMN scheduled_for timestamp with time zone,
  ADD COLUMN retention_until timestamp with time zone,
  ADD COLUMN retention_reason text,
  ADD COLUMN identity_redacted_at timestamp with time zone;

CREATE INDEX account_deletion_requests_schedule_idx
  ON account_deletion_requests(status, scheduled_for)
  WHERE status IN ('requested', 'reviewing');

CREATE TABLE privacy_export_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  format_version text NOT NULL,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone NOT NULL
);

CREATE INDEX privacy_export_events_user_idx
  ON privacy_export_events(user_id, requested_at DESC);

ALTER TABLE privacy_export_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY privacy_export_events_read_own
  ON privacy_export_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON privacy_export_events FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON privacy_export_events FROM authenticated;
GRANT SELECT ON privacy_export_events TO authenticated;

CREATE OR REPLACE FUNCTION prevent_privacy_export_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'PRIVACY_EXPORT_EVENTS_ARE_IMMUTABLE';
END
$$;

CREATE TRIGGER privacy_export_events_immutable
  BEFORE UPDATE OR DELETE ON privacy_export_events
  FOR EACH ROW EXECUTE FUNCTION prevent_privacy_export_mutation();

CREATE OR REPLACE FUNCTION request_account_deletion(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  status deletion_request_status,
  requested_at timestamp with time zone,
  scheduled_for timestamp with time zone,
  retention_until timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request account_deletion_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('account-deletion:' || p_user_id::text, 0));
  SELECT * INTO v_request
  FROM account_deletion_requests request
  WHERE request.user_id = p_user_id
    AND request.status IN ('requested', 'reviewing')
  ORDER BY request.requested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO account_deletion_requests(user_id, reason)
    VALUES (p_user_id, NULLIF(left(trim(coalesce(p_reason, '')), 500), ''))
    RETURNING * INTO v_request;
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    v_request.status,
    v_request.requested_at,
    v_request.scheduled_for,
    v_request.retention_until;
END
$$;

REVOKE ALL ON FUNCTION request_account_deletion(uuid, text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT ON privacy_export_events TO service_role;
    GRANT EXECUTE ON FUNCTION request_account_deletion(uuid, text) TO service_role;
  END IF;
END
$$;
