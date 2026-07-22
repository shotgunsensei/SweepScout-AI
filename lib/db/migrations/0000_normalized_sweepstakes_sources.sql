CREATE TYPE "public"."discovered_url_status" AS ENUM('new', 'queued', 'fetched', 'changed', 'unchanged', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."policy_review_status" AS ENUM('pending', 'approved', 'restricted', 'prohibited');--> statement-breakpoint
CREATE TYPE "public"."scan_job_status" AS ENUM('queued', 'running', 'partial', 'completed', 'failed', 'canceled', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."source_access_method" AS ENUM('rss', 'atom', 'json_api', 'structured_html', 'admin_url', 'admin_import');--> statement-breakpoint
CREATE TYPE "public"."source_health_status" AS ENUM('unknown', 'healthy', 'degraded', 'paused', 'failed');--> statement-breakpoint
CREATE TYPE "public"."entry_frequency" AS ENUM('one_time', 'daily', 'weekly', 'monthly', 'unlimited', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."quality_flag_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."quality_flag_status" AS ENUM('open', 'reviewing', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."sweepstakes_lifecycle_status" AS ENUM('upcoming', 'active', 'expired', 'canceled', 'unverifiable');--> statement-breakpoint
CREATE TABLE "discovered_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"scan_job_id" uuid,
	"url" text NOT NULL,
	"canonical_url" text NOT NULL,
	"content_hash" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"status" "discovered_url_status" DEFAULT 'new' NOT NULL,
	"http_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovered_urls_http_status_valid" CHECK ("discovered_urls"."http_status" is null or "discovered_urls"."http_status" between 100 and 599)
);
--> statement-breakpoint
CREATE TABLE "source_scan_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "scan_job_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"pages_requested" integer DEFAULT 0 NOT NULL,
	"pages_successful" integer DEFAULT 0 NOT NULL,
	"pages_failed" integer DEFAULT 0 NOT NULL,
	"items_discovered" integer DEFAULT 0 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_scan_jobs_counts_nonnegative" CHECK ("source_scan_jobs"."pages_requested" >= 0 and "source_scan_jobs"."pages_successful" >= 0 and "source_scan_jobs"."pages_failed" >= 0 and "source_scan_jobs"."items_discovered" >= 0 and "source_scan_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"source_type" text NOT NULL,
	"access_method" "source_access_method" NOT NULL,
	"scan_enabled" boolean DEFAULT false NOT NULL,
	"scan_frequency_minutes" integer DEFAULT 1440 NOT NULL,
	"robots_policy_status" "policy_review_status" DEFAULT 'pending' NOT NULL,
	"terms_review_status" "policy_review_status" DEFAULT 'pending' NOT NULL,
	"requires_attribution" boolean DEFAULT true NOT NULL,
	"attribution_text" text,
	"rate_limit_per_minute" integer DEFAULT 6 NOT NULL,
	"last_scan_at" timestamp with time zone,
	"next_scan_at" timestamp with time zone,
	"health_status" "source_health_status" DEFAULT 'unknown' NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_scan_frequency_positive" CHECK ("sources"."scan_frequency_minutes" >= 5),
	CONSTRAINT "sources_rate_limit_positive" CHECK ("sources"."rate_limit_per_minute" between 1 and 600),
	CONSTRAINT "sources_approved_before_enable" CHECK (not "sources"."scan_enabled" or ("sources"."robots_policy_status" = 'approved' and "sources"."terms_review_status" = 'approved'))
);
--> statement-breakpoint
CREATE TABLE "listing_quality_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sweepstakes_id" uuid NOT NULL,
	"flag_type" text NOT NULL,
	"severity" "quality_flag_severity" NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "quality_flag_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sweepstakes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"sponsor_name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"official_url" text NOT NULL,
	"rules_url" text,
	"official_promotion_id" text,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"estimated_total_prize_value" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"entry_frequency" "entry_frequency" DEFAULT 'unknown' NOT NULL,
	"entry_effort_score" integer DEFAULT 0 NOT NULL,
	"legitimacy_score" integer DEFAULT 0 NOT NULL,
	"source_confidence_score" integer DEFAULT 0 NOT NULL,
	"status" "sweepstakes_lifecycle_status" DEFAULT 'unverifiable' NOT NULL,
	"first_discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sweepstakes_dates_ordered" CHECK ("sweepstakes"."start_at" is null or "sweepstakes"."end_at" is null or "sweepstakes"."start_at" <= "sweepstakes"."end_at"),
	CONSTRAINT "sweepstakes_prize_value_nonnegative" CHECK ("sweepstakes"."estimated_total_prize_value" is null or "sweepstakes"."estimated_total_prize_value" >= 0),
	CONSTRAINT "sweepstakes_scores_valid" CHECK ("sweepstakes"."entry_effort_score" between 0 and 100 and "sweepstakes"."legitimacy_score" between 0 and 100 and "sweepstakes"."source_confidence_score" between 0 and 100),
	CONSTRAINT "sweepstakes_currency_iso" CHECK (char_length("sweepstakes"."currency") = 3)
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_category_links" (
	"sweepstakes_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "sweepstakes_category_links_pk" PRIMARY KEY("sweepstakes_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_change_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sweepstakes_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_id" uuid
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_eligibility" (
	"sweepstakes_id" uuid PRIMARY KEY NOT NULL,
	"minimum_age" integer,
	"maximum_age" integer,
	"eligible_countries" text[] DEFAULT '{}'::text[] NOT NULL,
	"eligible_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_regions" text[] DEFAULT '{}'::text[] NOT NULL,
	"residency_required" boolean DEFAULT false NOT NULL,
	"employee_exclusions" text,
	"other_restrictions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sweepstakes_eligibility_ages_valid" CHECK (("sweepstakes_eligibility"."minimum_age" is null or "sweepstakes_eligibility"."minimum_age" >= 0) and ("sweepstakes_eligibility"."maximum_age" is null or "sweepstakes_eligibility"."maximum_age" >= 0) and ("sweepstakes_eligibility"."minimum_age" is null or "sweepstakes_eligibility"."maximum_age" is null or "sweepstakes_eligibility"."minimum_age" <= "sweepstakes_eligibility"."maximum_age"))
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_entry_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sweepstakes_id" uuid NOT NULL,
	"method_type" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"entry_url" text NOT NULL,
	"frequency" "entry_frequency" DEFAULT 'unknown' NOT NULL,
	"purchase_required" boolean DEFAULT false NOT NULL,
	"social_platform" text,
	"estimated_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sweepstakes_entry_methods_minutes_valid" CHECK ("sweepstakes_entry_methods"."estimated_minutes" is null or "sweepstakes_entry_methods"."estimated_minutes" between 0 and 1440)
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sweepstakes_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"estimated_value" numeric(14, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sweepstakes_prizes_quantity_positive" CHECK ("sweepstakes_prizes"."quantity" > 0),
	CONSTRAINT "sweepstakes_prizes_value_nonnegative" CHECK ("sweepstakes_prizes"."estimated_value" is null or "sweepstakes_prizes"."estimated_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_rules_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sweepstakes_id" uuid NOT NULL,
	"rules_url" text NOT NULL,
	"raw_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"extracted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sweepstakes_sources" (
	"sweepstakes_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"discovered_url_id" uuid NOT NULL,
	"source_listing_title" text,
	"source_listing_text" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sweepstakes_sources_pk" PRIMARY KEY("sweepstakes_id","source_id","discovered_url_id")
);
--> statement-breakpoint
ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovered_urls" ADD CONSTRAINT "discovered_urls_scan_job_id_source_scan_jobs_id_fk" FOREIGN KEY ("scan_job_id") REFERENCES "public"."source_scan_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_scan_jobs" ADD CONSTRAINT "source_scan_jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_quality_flags" ADD CONSTRAINT "listing_quality_flags_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_category_links" ADD CONSTRAINT "sweepstakes_category_links_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_category_links" ADD CONSTRAINT "sweepstakes_category_links_category_id_sweepstakes_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."sweepstakes_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_change_events" ADD CONSTRAINT "sweepstakes_change_events_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_change_events" ADD CONSTRAINT "sweepstakes_change_events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_eligibility" ADD CONSTRAINT "sweepstakes_eligibility_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_entry_methods" ADD CONSTRAINT "sweepstakes_entry_methods_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_prizes" ADD CONSTRAINT "sweepstakes_prizes_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_rules_versions" ADD CONSTRAINT "sweepstakes_rules_versions_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_sources" ADD CONSTRAINT "sweepstakes_sources_sweepstakes_id_sweepstakes_id_fk" FOREIGN KEY ("sweepstakes_id") REFERENCES "public"."sweepstakes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_sources" ADD CONSTRAINT "sweepstakes_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sweepstakes_sources" ADD CONSTRAINT "sweepstakes_sources_discovered_url_id_discovered_urls_id_fk" FOREIGN KEY ("discovered_url_id") REFERENCES "public"."discovered_urls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discovered_urls_source_canonical_uidx" ON "discovered_urls" USING btree ("source_id","canonical_url");--> statement-breakpoint
CREATE INDEX "discovered_urls_status_seen_idx" ON "discovered_urls" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "discovered_urls_content_hash_idx" ON "discovered_urls" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "source_scan_jobs_source_created_idx" ON "source_scan_jobs" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "source_scan_jobs_status_created_idx" ON "source_scan_jobs" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_scan_jobs_correlation_uidx" ON "source_scan_jobs" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_base_url_access_method_uidx" ON "sources" USING btree ("base_url","access_method");--> statement-breakpoint
CREATE INDEX "sources_schedule_idx" ON "sources" USING btree ("scan_enabled","next_scan_at");--> statement-breakpoint
CREATE INDEX "sources_health_idx" ON "sources" USING btree ("health_status");--> statement-breakpoint
CREATE INDEX "listing_quality_flags_review_idx" ON "listing_quality_flags" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE INDEX "sweepstakes_status_end_idx" ON "sweepstakes" USING btree ("status","end_at");--> statement-breakpoint
CREATE INDEX "sweepstakes_sponsor_title_idx" ON "sweepstakes" USING btree ("sponsor_name","normalized_title");--> statement-breakpoint
CREATE INDEX "sweepstakes_verified_idx" ON "sweepstakes" USING btree ("last_verified_at");--> statement-breakpoint
CREATE INDEX "sweepstakes_prize_value_idx" ON "sweepstakes" USING btree ("estimated_total_prize_value");--> statement-breakpoint
CREATE UNIQUE INDEX "sweepstakes_official_url_uidx" ON "sweepstakes" USING btree ("official_url");--> statement-breakpoint
CREATE UNIQUE INDEX "sweepstakes_categories_slug_uidx" ON "sweepstakes_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sweepstakes_change_events_sweepstakes_idx" ON "sweepstakes_change_events" USING btree ("sweepstakes_id","detected_at");--> statement-breakpoint
CREATE INDEX "sweepstakes_entry_methods_sweepstakes_idx" ON "sweepstakes_entry_methods" USING btree ("sweepstakes_id");--> statement-breakpoint
CREATE INDEX "sweepstakes_prizes_sweepstakes_idx" ON "sweepstakes_prizes" USING btree ("sweepstakes_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sweepstakes_rules_versions_hash_uidx" ON "sweepstakes_rules_versions" USING btree ("sweepstakes_id","content_hash");--> statement-breakpoint
CREATE INDEX "sweepstakes_rules_versions_extracted_idx" ON "sweepstakes_rules_versions" USING btree ("sweepstakes_id","extracted_at");--> statement-breakpoint
CREATE INDEX "sweepstakes_sources_source_idx" ON "sweepstakes_sources" USING btree ("source_id","last_seen_at");