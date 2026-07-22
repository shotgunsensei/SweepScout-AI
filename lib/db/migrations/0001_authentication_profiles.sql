CREATE TYPE "public"."deletion_request_status" AS ENUM('requested', 'reviewing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."digest_frequency" AS ENUM('never', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."organization_role" AS ENUM('member', 'manager', 'owner');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('user', 'admin', 'owner');--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "deletion_request_status" DEFAULT 'requested' NOT NULL,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organization_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_format" CHECK ("organizations"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"country_code" text,
	"state_or_region" text,
	"postal_code" text,
	"birth_date" date,
	"platform_role" "platform_role" DEFAULT 'user' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"terms_accepted_at" timestamp with time zone,
	"privacy_accepted_at" timestamp with time zone,
	"sponsor_disclaimer_accepted_at" timestamp with time zone,
	"account_disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_normalized" CHECK ("profiles"."email" = lower(trim("profiles"."email"))),
	CONSTRAINT "profiles_country_code_iso" CHECK ("profiles"."country_code" is null or char_length("profiles"."country_code") = 2),
	CONSTRAINT "profiles_display_name_length" CHECK (char_length(trim("profiles"."display_name")) between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "user_eligibility_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"country_code" text,
	"state_or_region" text,
	"minimum_age_confirmed" boolean DEFAULT false NOT NULL,
	"residency_notes" text DEFAULT '' NOT NULL,
	"excluded_sponsor_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_eligibility_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_eligibility_country_code_iso" CHECK ("user_eligibility_profiles"."country_code" is null or char_length("user_eligibility_profiles"."country_code") = 2)
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"minimum_prize_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"maximum_entry_effort" integer DEFAULT 100 NOT NULL,
	"preferred_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferred_entry_frequency" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_social_entry_methods" boolean DEFAULT true NOT NULL,
	"allow_purchase_related_promotions" boolean DEFAULT false NOT NULL,
	"email_digest_frequency" "digest_frequency" DEFAULT 'weekly' NOT NULL,
	"push_notifications_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_prize_nonnegative" CHECK ("user_preferences"."minimum_prize_value" >= 0),
	CONSTRAINT "user_preferences_effort_valid" CHECK ("user_preferences"."maximum_entry_effort" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_processed_by_user_id_profiles_id_fk" FOREIGN KEY ("processed_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_user_id_profiles_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_eligibility_profiles" ADD CONSTRAINT "user_eligibility_profiles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_deletion_requests_user_idx" ON "account_deletion_requests" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_unique" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "profiles_role_idx" ON "profiles" USING btree ("platform_role");--> statement-breakpoint

-- Supabase owns credentials in auth.users. Keep the migration portable for
-- plain PostgreSQL validation while adding the production FK when available.
DO $auth_link$
BEGIN
	IF to_regclass('auth.users') IS NOT NULL THEN
		EXECUTE 'ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_user_fk FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE';
	END IF;
END
$auth_link$;--> statement-breakpoint

ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_eligibility_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- The API uses the service role for validated mutations. Authenticated browser
-- clients may only read their own records if they connect through PostgREST.
DO $rls$
BEGIN
	IF to_regprocedure('auth.uid()') IS NULL THEN
		RAISE NOTICE 'auth.uid() is unavailable; Supabase RLS policies were not installed';
		RETURN;
	END IF;

	EXECUTE 'CREATE POLICY profiles_read_own ON public.profiles FOR SELECT USING (id = auth.uid())';
	EXECUTE 'CREATE POLICY user_preferences_read_own ON public.user_preferences FOR SELECT USING (user_id = auth.uid())';
	EXECUTE 'CREATE POLICY user_eligibility_read_own ON public.user_eligibility_profiles FOR SELECT USING (user_id = auth.uid())';
	EXECUTE 'CREATE POLICY memberships_read_own ON public.organization_memberships FOR SELECT USING (user_id = auth.uid())';
	EXECUTE 'CREATE POLICY organizations_read_member ON public.organizations FOR SELECT USING (EXISTS (SELECT 1 FROM public.organization_memberships membership WHERE membership.organization_id = id AND membership.user_id = auth.uid()))';
	EXECUTE 'CREATE POLICY deletion_requests_read_own ON public.account_deletion_requests FOR SELECT USING (user_id = auth.uid())';

	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
		EXECUTE 'REVOKE ALL ON public.profiles, public.user_preferences, public.user_eligibility_profiles, public.organizations, public.organization_memberships, public.account_deletion_requests FROM anon';
	END IF;

	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
		EXECUTE 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles, public.user_preferences, public.user_eligibility_profiles, public.organizations, public.organization_memberships, public.account_deletion_requests FROM authenticated';
		EXECUTE 'GRANT SELECT ON public.profiles, public.user_preferences, public.user_eligibility_profiles, public.organizations, public.organization_memberships, public.account_deletion_requests TO authenticated';
	END IF;
END
$rls$;
