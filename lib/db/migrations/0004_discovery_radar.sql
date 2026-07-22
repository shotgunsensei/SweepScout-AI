CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TYPE "public"."saved_sweepstakes_priority" AS ENUM('low', 'normal', 'high');
CREATE TYPE "public"."user_sweepstakes_status_value" AS ENUM('interested', 'saved', 'entered', 'enter_again', 'skipped', 'hidden', 'won', 'expired');

ALTER TABLE "sweepstakes" ADD COLUMN "search_document" tsvector GENERATED ALWAYS AS (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(sponsor_name, '') || ' ' || coalesce(summary, ''))
) STORED;
CREATE INDEX "sweepstakes_search_document_idx" ON "sweepstakes" USING gin ("search_document");
CREATE INDEX "sweepstakes_sponsor_trgm_idx" ON "sweepstakes" USING gin (lower("sponsor_name") gin_trgm_ops);
CREATE INDEX "sweepstakes_prizes_name_trgm_idx" ON "sweepstakes_prizes" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX "sweepstakes_categories_name_trgm_idx" ON "sweepstakes_categories" USING gin (lower("name") gin_trgm_ops);
CREATE INDEX "sweepstakes_entry_methods_text_trgm_idx" ON "sweepstakes_entry_methods" USING gin (lower("description") gin_trgm_ops);
CREATE INDEX "sweepstakes_eligibility_restrictions_trgm_idx" ON "sweepstakes_eligibility" USING gin (lower(coalesce("other_restrictions", '')) gin_trgm_ops);
CREATE INDEX "sweepstakes_eligibility_countries_idx" ON "sweepstakes_eligibility" USING gin ("eligible_countries");
CREATE INDEX "sweepstakes_eligibility_regions_idx" ON "sweepstakes_eligibility" USING gin ("eligible_regions");

CREATE TABLE "user_saved_sweepstakes" (
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "sweepstakes_id" uuid NOT NULL REFERENCES "sweepstakes"("id") ON DELETE cascade,
  "saved_at" timestamptz DEFAULT now() NOT NULL,
  "priority" "saved_sweepstakes_priority" DEFAULT 'normal' NOT NULL,
  "notes" text DEFAULT '' NOT NULL,
  CONSTRAINT "user_saved_sweepstakes_pk" PRIMARY KEY("user_id", "sweepstakes_id")
);
CREATE INDEX "user_saved_sweepstakes_popular_idx" ON "user_saved_sweepstakes" ("sweepstakes_id", "saved_at");

CREATE TABLE "user_sweepstakes_status" (
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "sweepstakes_id" uuid NOT NULL REFERENCES "sweepstakes"("id") ON DELETE cascade,
  "status" "user_sweepstakes_status_value" NOT NULL,
  "last_entered_at" timestamptz,
  "next_entry_due_at" timestamptz,
  "entry_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "user_sweepstakes_status_pk" PRIMARY KEY("user_id", "sweepstakes_id"),
  CONSTRAINT "user_sweepstakes_status_entry_count_nonnegative" CHECK (entry_count >= 0)
);
CREATE INDEX "user_sweepstakes_status_due_idx" ON "user_sweepstakes_status" ("user_id", "status", "next_entry_due_at");

ALTER TABLE "user_saved_sweepstakes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sweepstakes_status" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF to_regprocedure('auth.uid()') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY "saved_select_own" ON "user_saved_sweepstakes" FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "saved_insert_own" ON "user_saved_sweepstakes" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "saved_update_own" ON "user_saved_sweepstakes" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "saved_delete_own" ON "user_saved_sweepstakes" FOR DELETE TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "status_select_own" ON "user_sweepstakes_status" FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "status_insert_own" ON "user_sweepstakes_status" FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "status_update_own" ON "user_sweepstakes_status" FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY "status_delete_own" ON "user_sweepstakes_status" FOR DELETE TO authenticated USING (user_id = auth.uid())';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION "search_sweepstakes_radar"(
  p_user_id uuid,
  p_query text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_min_prize numeric DEFAULT NULL,
  p_deadline_before timestamptz DEFAULT NULL,
  p_start_after timestamptz DEFAULT NULL,
  p_frequency text DEFAULT NULL,
  p_max_effort integer DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_user_age integer DEFAULT NULL,
  p_sponsor text DEFAULT NULL,
  p_purchase_required boolean DEFAULT NULL,
  p_social_required boolean DEFAULT NULL,
  p_min_legitimacy integer DEFAULT NULL,
  p_min_source_confidence integer DEFAULT NULL,
  p_saved boolean DEFAULT NULL,
  p_entered boolean DEFAULT NULL,
  p_sort text DEFAULT 'recommended',
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0
) RETURNS TABLE(sweepstakes_id uuid, total_count bigint, search_rank real, popular_saves bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH matching AS (
    SELECT s.id,
      CASE WHEN nullif(trim(p_query), '') IS NULL THEN 0::real ELSE ts_rank(s.search_document, websearch_to_tsquery('english', p_query)) END AS rank,
      (SELECT count(*) FROM user_saved_sweepstakes saves WHERE saves.sweepstakes_id = s.id) AS saves,
      (s.legitimacy_score + s.source_confidence_score - s.entry_effort_score
        + CASE WHEN EXISTS (SELECT 1 FROM user_preferences preference JOIN sweepstakes_category_links link ON link.sweepstakes_id = s.id JOIN sweepstakes_categories category ON category.id = link.category_id WHERE preference.user_id = p_user_id AND preference.preferred_categories ? category.slug) THEN 15 ELSE 0 END
        + CASE WHEN s.estimated_total_prize_value >= coalesce((SELECT minimum_prize_value FROM user_preferences WHERE user_id = p_user_id), 0) THEN 5 ELSE 0 END
        - CASE WHEN s.entry_effort_score > coalesce((SELECT maximum_entry_effort FROM user_preferences WHERE user_id = p_user_id), 100) THEN 15 ELSE 0 END
      ) AS recommendation
    FROM sweepstakes s
    LEFT JOIN sweepstakes_eligibility eligibility ON eligibility.sweepstakes_id = s.id
    WHERE s.status IN ('active', 'upcoming')
      AND (s.end_at IS NULL OR s.end_at > now())
      AND (nullif(trim(p_query), '') IS NULL OR s.search_document @@ websearch_to_tsquery('english', p_query)
        OR EXISTS (SELECT 1 FROM sweepstakes_prizes prize WHERE prize.sweepstakes_id = s.id AND (lower(prize.name) % lower(p_query) OR lower(coalesce(prize.description, '')) LIKE '%' || lower(p_query) || '%'))
        OR EXISTS (SELECT 1 FROM sweepstakes_category_links link JOIN sweepstakes_categories category ON category.id = link.category_id WHERE link.sweepstakes_id = s.id AND lower(category.name) % lower(p_query))
        OR lower(coalesce(eligibility.other_restrictions, '')) LIKE '%' || lower(p_query) || '%'
        OR EXISTS (SELECT 1 FROM sweepstakes_entry_methods method WHERE method.sweepstakes_id = s.id AND lower(method.description) LIKE '%' || lower(p_query) || '%'))
      AND (p_category IS NULL OR EXISTS (SELECT 1 FROM sweepstakes_category_links link JOIN sweepstakes_categories category ON category.id = link.category_id WHERE link.sweepstakes_id = s.id AND category.slug = p_category))
      AND (p_min_prize IS NULL OR s.estimated_total_prize_value >= p_min_prize)
      AND (p_deadline_before IS NULL OR s.end_at <= p_deadline_before)
      AND (p_start_after IS NULL OR s.start_at >= p_start_after)
      AND (p_frequency IS NULL OR s.entry_frequency::text = p_frequency)
      AND (p_max_effort IS NULL OR s.entry_effort_score <= p_max_effort)
      AND (p_country IS NULL OR p_country = ANY(eligibility.eligible_countries))
      AND (p_region IS NULL OR p_region = ANY(eligibility.eligible_regions))
      AND (p_user_age IS NULL OR eligibility.minimum_age IS NULL OR eligibility.minimum_age <= p_user_age)
      AND (p_sponsor IS NULL OR lower(s.sponsor_name) LIKE '%' || lower(p_sponsor) || '%')
      AND (p_purchase_required IS NULL OR EXISTS (SELECT 1 FROM sweepstakes_entry_methods method WHERE method.sweepstakes_id = s.id AND method.purchase_required = p_purchase_required))
      AND (p_social_required IS NULL OR (p_social_required = EXISTS (SELECT 1 FROM sweepstakes_entry_methods method WHERE method.sweepstakes_id = s.id AND method.social_platform IS NOT NULL)))
      AND (p_min_legitimacy IS NULL OR s.legitimacy_score >= p_min_legitimacy)
      AND (p_min_source_confidence IS NULL OR s.source_confidence_score >= p_min_source_confidence)
      AND (p_saved IS NULL OR (p_saved = EXISTS (SELECT 1 FROM user_saved_sweepstakes saved WHERE saved.sweepstakes_id = s.id AND saved.user_id = p_user_id)))
      AND (p_entered IS NULL OR (p_entered = EXISTS (SELECT 1 FROM user_sweepstakes_status state WHERE state.sweepstakes_id = s.id AND state.user_id = p_user_id AND state.status IN ('entered', 'enter_again', 'won'))))
      AND NOT EXISTS (SELECT 1 FROM user_sweepstakes_status hidden WHERE hidden.sweepstakes_id = s.id AND hidden.user_id = p_user_id AND hidden.status = 'hidden')
  )
  SELECT matching.id, count(*) OVER(), matching.rank, matching.saves
  FROM matching JOIN sweepstakes s ON s.id = matching.id
  ORDER BY
    CASE WHEN p_sort = 'ending_soon' THEN s.end_at END ASC NULLS LAST,
    CASE WHEN p_sort = 'highest_prize' THEN s.estimated_total_prize_value END DESC NULLS LAST,
    CASE WHEN p_sort = 'lowest_effort' THEN s.entry_effort_score END ASC,
    CASE WHEN p_sort = 'newest' THEN s.first_discovered_at END DESC,
    CASE WHEN p_sort = 'recently_verified' THEN s.last_verified_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'popular' THEN matching.saves END DESC,
    CASE WHEN p_sort = 'recommended' THEN matching.recommendation END DESC,
    matching.rank DESC, s.id
  LIMIT greatest(1, least(p_limit, 100)) OFFSET greatest(0, p_offset);
$$;
