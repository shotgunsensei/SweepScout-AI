-- Defense in depth for Supabase role defaults: owner RPCs are callable only
-- by the server-side service role, never by browser JWT roles.
REVOKE ALL ON FUNCTION admin_apply_user_lifecycle(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION admin_set_access_plan_override(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;

DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT EXECUTE ON FUNCTION admin_apply_user_lifecycle(uuid,uuid,text,text,text,text) TO service_role;
  GRANT EXECUTE ON FUNCTION admin_set_access_plan_override(uuid,uuid,text,text,text) TO service_role;
END IF; END $$;