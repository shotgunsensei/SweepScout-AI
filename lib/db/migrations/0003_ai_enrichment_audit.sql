CREATE TYPE "public"."enrichment_run_status" AS ENUM('running', 'completed', 'needs_review', 'failed');
CREATE TYPE "public"."merge_event_status" AS ENUM('applied', 'undone');

CREATE TABLE "ai_enrichment_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "discovered_url_id" uuid NOT NULL REFERENCES "discovered_urls"("id") ON DELETE restrict,
  "source_id" uuid NOT NULL REFERENCES "sources"("id") ON DELETE restrict,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "prompt_version" text NOT NULL,
  "status" "enrichment_run_status" DEFAULT 'running' NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "output_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(12,6) DEFAULT 0 NOT NULL,
  "error_code" text,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "completed_at" timestamptz,
  CONSTRAINT "ai_enrichment_runs_usage_nonnegative" CHECK (input_tokens >= 0 AND output_tokens >= 0 AND estimated_cost_usd >= 0)
);
CREATE INDEX "ai_enrichment_runs_status_started_idx" ON "ai_enrichment_runs" ("status", "started_at");

CREATE TABLE "sweepstakes_field_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sweepstakes_id" uuid NOT NULL REFERENCES "sweepstakes"("id") ON DELETE cascade,
  "enrichment_run_id" uuid NOT NULL REFERENCES "ai_enrichment_runs"("id") ON DELETE restrict,
  "field_name" text NOT NULL,
  "field_value" jsonb,
  "confidence" numeric(5,4) NOT NULL,
  "source_reference" text NOT NULL,
  "evidence_text" text DEFAULT '' NOT NULL,
  "evidence_location" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "authoritative" boolean DEFAULT false NOT NULL,
  "extracted_at" timestamptz NOT NULL,
  CONSTRAINT "sweepstakes_field_evidence_confidence_valid" CHECK (confidence BETWEEN 0 AND 1)
);
CREATE UNIQUE INDEX "sweepstakes_field_evidence_run_field_uidx" ON "sweepstakes_field_evidence" ("enrichment_run_id", "field_name");
CREATE INDEX "sweepstakes_field_evidence_sweepstakes_idx" ON "sweepstakes_field_evidence" ("sweepstakes_id", "field_name", "extracted_at");

CREATE TABLE "sweepstakes_merge_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "target_sweepstakes_id" uuid NOT NULL REFERENCES "sweepstakes"("id") ON DELETE restrict,
  "source_sweepstakes_id" uuid REFERENCES "sweepstakes"("id") ON DELETE restrict,
  "enrichment_run_id" uuid REFERENCES "ai_enrichment_runs"("id") ON DELETE restrict,
  "match_score" numeric(5,4) NOT NULL,
  "matched_signals" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_snapshot" jsonb NOT NULL,
  "status" "merge_event_status" DEFAULT 'applied' NOT NULL,
  "merged_by" uuid,
  "merged_at" timestamptz DEFAULT now() NOT NULL,
  "undone_by" uuid,
  "undone_at" timestamptz,
  CONSTRAINT "sweepstakes_merge_events_score_valid" CHECK (match_score BETWEEN 0 AND 1),
  CONSTRAINT "sweepstakes_merge_events_undo_valid" CHECK ((status = 'applied' AND undone_at IS NULL AND undone_by IS NULL) OR (status = 'undone' AND undone_at IS NOT NULL AND undone_by IS NOT NULL))
);
CREATE INDEX "sweepstakes_merge_events_target_idx" ON "sweepstakes_merge_events" ("target_sweepstakes_id", "status", "merged_at");

ALTER TABLE "ai_enrichment_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sweepstakes_field_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sweepstakes_merge_events" ENABLE ROW LEVEL SECURITY;
