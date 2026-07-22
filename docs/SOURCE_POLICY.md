# Source access policy

Play Pack Pilot scans only sources that an authorized operator has registered
and reviewed. It is not a general-purpose web crawler.

Before `scan_enabled` can be set, both `robots_policy_status` and
`terms_review_status` must be `approved`. The operator must document the access
method, cadence, rate limit, and attribution text. Re-review a source whenever
its terms, robots policy, API contract, ownership, or access behavior changes.

Preferred access order:

1. Public API with documented unauthenticated access.
2. Public RSS or Atom feed.
3. Publisher-supplied JSON-LD or other structured data.
4. Approved public HTML listing page.
5. Administrator-submitted canonical URLs.

The scanner does not authenticate to source sites, solve CAPTCHAs, rotate
identities, bypass bot controls, access paywalls, follow cross-origin redirects,
or submit promotion forms. It rejects credentials in URLs, private/local
network targets, non-standard ports, responses over 2 MB, and source endpoints
outside the registered origin. API keys and other secrets are prohibited in
database source configuration.

Each discovery preserves its registered source, scan job, original URL,
canonical URL, content hash, first/last-seen timestamps, and attribution policy.
New or changed URLs remain reviewable; queueing a URL does not enter a promotion
or establish eligibility.

To suspend a source immediately, set `scan_enabled=false`. Use the
`markUnderReview` administrator action to disable scanning, reset both policy
reviews to pending, and mark source health paused. Historical jobs and
discoveries are retained for operational evidence.
