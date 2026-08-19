-- Owner-scoped user lifecycle and administrative access-plan overrides.
-- Additive and auditable. Manual overrides are strictly separated from
-- Stripe-synced subscriptions: this table never stores provider identifiers.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_removed_at timestamptz;

CREATE TABLE access_plan_overrides(
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  plan_key subscription_plan NOT NULL,
  reason text NOT NULL CHECK(char_length(trim(reason)) BETWEEN 3 AND 1000),
  set_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_plan_overrides_active_idx ON access_plan_overrides(active,updated_at DESC);

ALTER TABLE access_plan_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON access_plan_overrides FROM authenticated,anon;
DO $$ BEGIN IF to_regprocedure('auth.uid()') IS NOT NULL THEN
  CREATE POLICY access_plan_overrides_read_own ON access_plan_overrides FOR SELECT TO authenticated USING(user_id=auth.uid());
END IF; END $$;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON access_plan_overrides TO service_role;
END IF; END $$;

-- Serialize all owner-lifecycle changes and keep the profile mutation plus its
-- required audit row in one transaction. Supabase Auth removal is completed by
-- the API only after the database has revoked access and redacted user data.
CREATE OR REPLACE FUNCTION admin_apply_user_lifecycle(
  p_actor_id uuid,
  p_target_id uuid,
  p_action text,
  p_value text,
  p_reason text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_target profiles%ROWTYPE;
  v_after profiles%ROWTYPE;
  v_audit_action text;
BEGIN
  IF char_length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'ADMIN_REASON_REQUIRED';
  END IF;
  IF p_action NOT IN ('role','disable','enable','remove') THEN
    RAISE EXCEPTION 'INVALID_LIFECYCLE_ACTION';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('playpackpilot-owner-lifecycle',0));
  SELECT * INTO v_actor FROM profiles WHERE id=p_actor_id FOR UPDATE;
  IF NOT FOUND OR v_actor.platform_role<>'owner' OR v_actor.account_disabled_at IS NOT NULL OR v_actor.account_removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACTIVE_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_target FROM profiles WHERE id=p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF v_target.account_removed_at IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_REMOVED'; END IF;

  IF p_action IN ('disable','remove') AND p_actor_id=p_target_id THEN
    RAISE EXCEPTION 'OWNER_SELF_LOCKOUT_FORBIDDEN';
  END IF;
  IF p_action='role' AND p_actor_id=p_target_id AND p_value<>'owner' THEN
    RAISE EXCEPTION 'OWNER_SELF_DEMOTION_FORBIDDEN';
  END IF;
  IF v_target.platform_role='owner'
     AND (p_action IN ('disable','remove') OR (p_action='role' AND p_value<>'owner'))
     AND NOT EXISTS (
       SELECT 1 FROM profiles
       WHERE id<>p_target_id
         AND platform_role='owner'
         AND account_disabled_at IS NULL
         AND account_removed_at IS NULL
     ) THEN
    RAISE EXCEPTION 'LAST_ACTIVE_OWNER_REQUIRED';
  END IF;

  IF p_action='role' THEN
    IF p_value NOT IN ('user','admin','owner') THEN RAISE EXCEPTION 'INVALID_PLATFORM_ROLE'; END IF;
    UPDATE profiles SET platform_role=p_value::platform_role,updated_at=now() WHERE id=p_target_id RETURNING * INTO v_after;
    v_audit_action:='user.role_changed';
  ELSIF p_action='disable' THEN
    UPDATE profiles SET account_disabled_at=now(),updated_at=now() WHERE id=p_target_id RETURNING * INTO v_after;
    v_audit_action:='user.disabled';
  ELSIF p_action='enable' THEN
    UPDATE profiles SET account_disabled_at=NULL,updated_at=now() WHERE id=p_target_id RETURNING * INTO v_after;
    v_audit_action:='user.enabled';
  ELSE
    DELETE FROM organization_memberships WHERE user_id=p_target_id;
    DELETE FROM user_eligibility_profiles WHERE user_id=p_target_id;
    DELETE FROM user_preferences WHERE user_id=p_target_id;
    DELETE FROM user_saved_sweepstakes WHERE user_id=p_target_id;
    DELETE FROM user_sweepstakes_status WHERE user_id=p_target_id;
    DELETE FROM user_sweepstakes_notes WHERE user_id=p_target_id;
    DELETE FROM user_search_profiles WHERE user_id=p_target_id;
    DELETE FROM notification_preferences WHERE user_id=p_target_id;
    DELETE FROM notifications WHERE user_id=p_target_id;
    DELETE FROM digest_runs WHERE user_id=p_target_id;
    DELETE FROM custom_scanners WHERE user_id=p_target_id;
    UPDATE support_requests SET assigned_to=NULL,updated_at=now() WHERE assigned_to=p_target_id;
    DELETE FROM support_requests WHERE user_id=p_target_id;
    DELETE FROM entitlements WHERE user_id=p_target_id;
    DELETE FROM access_plan_overrides WHERE user_id=p_target_id;
    UPDATE profiles SET
      email='removed-'||p_target_id::text||'@invalid.playpackpilot',
      display_name='Removed account',
      avatar_url=NULL,
      timezone='UTC',
      country_code=NULL,
      state_or_region=NULL,
      postal_code=NULL,
      birth_date=NULL,
      platform_role='user',
      account_disabled_at=now(),
      account_removed_at=now(),
      updated_at=now()
    WHERE id=p_target_id
    RETURNING * INTO v_after;
    v_audit_action:='user.removal_prepared';
  END IF;

  INSERT INTO admin_audit_logs(
    actor_user_id,actor_role,action,target_type,target_id,
    before_state,after_state,reason,correlation_id
  ) VALUES (
    p_actor_id,'owner',v_audit_action,'profile',p_target_id::text,
    jsonb_build_object(
      'platformRole',v_target.platform_role,
      'accountDisabledAt',v_target.account_disabled_at,
      'accountRemovedAt',v_target.account_removed_at
    ),
    jsonb_build_object(
      'platformRole',v_after.platform_role,
      'accountDisabledAt',v_after.account_disabled_at,
      'accountRemovedAt',v_after.account_removed_at
    ),
    trim(p_reason),p_correlation_id
  );
  RETURN to_jsonb(v_after);
END $$;

CREATE OR REPLACE FUNCTION admin_set_access_plan_override(
  p_actor_id uuid,
  p_target_id uuid,
  p_plan_key text,
  p_reason text,
  p_correlation_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_actor profiles%ROWTYPE;
  v_target profiles%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_action text;
BEGIN
  IF char_length(trim(coalesce(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'ADMIN_REASON_REQUIRED'; END IF;
  SELECT * INTO v_actor FROM profiles WHERE id=p_actor_id FOR UPDATE;
  IF NOT FOUND OR v_actor.platform_role<>'owner' OR v_actor.account_disabled_at IS NOT NULL OR v_actor.account_removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ACTIVE_OWNER_REQUIRED';
  END IF;
  SELECT * INTO v_target FROM profiles WHERE id=p_target_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  IF v_target.account_removed_at IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_ALREADY_REMOVED'; END IF;
  SELECT to_jsonb(access_plan_overrides.*) INTO v_before FROM access_plan_overrides WHERE user_id=p_target_id;

  IF p_plan_key IS NULL THEN
    DELETE FROM access_plan_overrides WHERE user_id=p_target_id;
    v_after:=NULL;
    v_action:='user.access_plan_override_cleared';
  ELSE
    IF p_plan_key NOT IN ('free_flight','co_pilot','ace_pilot','squadron') THEN RAISE EXCEPTION 'INVALID_PLAN_KEY'; END IF;
    INSERT INTO access_plan_overrides(user_id,plan_key,reason,set_by,active,updated_at)
    VALUES(p_target_id,p_plan_key::subscription_plan,trim(p_reason),p_actor_id,true,now())
    ON CONFLICT(user_id) DO UPDATE SET
      plan_key=excluded.plan_key,reason=excluded.reason,set_by=excluded.set_by,active=true,updated_at=now()
    RETURNING to_jsonb(access_plan_overrides.*) INTO v_after;
    v_action:='user.access_plan_override_set';
  END IF;

  INSERT INTO admin_audit_logs(
    actor_user_id,actor_role,action,target_type,target_id,
    before_state,after_state,reason,correlation_id
  ) VALUES (
    p_actor_id,'owner',v_action,'profile',p_target_id::text,
    v_before,v_after,trim(p_reason),p_correlation_id
  );
  RETURN v_after;
END $$;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. These
-- SECURITY DEFINER entry points must be unreachable from browser JWT roles,
-- even if a caller knows an active owner's UUID.
REVOKE ALL ON FUNCTION admin_apply_user_lifecycle(uuid,uuid,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_set_access_plan_override(uuid,uuid,text,text,text) FROM PUBLIC;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT EXECUTE ON FUNCTION admin_apply_user_lifecycle(uuid,uuid,text,text,text,text) TO service_role;
  GRANT EXECUTE ON FUNCTION admin_set_access_plan_override(uuid,uuid,text,text,text) TO service_role;
END IF; END $$;
