import { ExternalLink, FileCheck2, ShieldCheck } from "lucide-react";
import { Link, useParams } from "wouter";

type PolicySection = { heading: string; paragraphs?: string[]; bullets?: string[] };
type Policy = { title: string; summary: string; sections: PolicySection[] };

const reviewedOn = "July 23, 2026";
const policies: Record<string, Policy> = {
  "terms": {
    title: "Terms of Service",
    summary: "The rules for using Play Pack Pilot as a sweepstakes discovery, research, and organization service.",
    sections: [
      { heading: "Service boundary", paragraphs: ["Play Pack Pilot discovers and analyzes third-party promotions and links you to the sponsor’s official site. We do not sponsor or administer listed promotions, accept entries, choose winners, hold prizes, collect entry fees, or submit entries for you."] },
      { heading: "Your account", bullets: ["Provide accurate account and eligibility information.", "Keep credentials secure and promptly report suspected unauthorized access.", "Use the service only where lawful and where you are permitted to enter the sponsor’s promotion.", "You remain responsible for reading and complying with the sponsor’s official rules."] },
      { heading: "Analysis and availability", paragraphs: ["Scores, summaries, eligibility guidance, risk signals, and AI-generated content are decision-support tools. They may be incomplete, outdated, or incorrect. Listings may change or expire without notice. We may correct, suspend, or remove content and features to protect users, sources, or the platform."] },
      { heading: "Subscriptions and termination", paragraphs: ["Paid access renews according to the terms shown before checkout. You may cancel through the Stripe Customer Portal, with access continuing through the paid period unless law requires otherwise. We may suspend abusive or unlawful use while preserving applicable billing and privacy rights."] },
      { heading: "Liability and disputes", paragraphs: ["To the extent permitted by law, the service is provided without a promise that any listing, analysis, sponsor, prize, eligibility result, or outcome is accurate or available. Final liability limits, governing law, dispute terms, and business contact details require attorney approval before launch."] },
    ],
  },
  "privacy": {
    title: "Privacy Policy",
    summary: "What personal data Play Pack Pilot needs, why it is used, and how users can access or request deletion of it.",
    sections: [
      { heading: "Data we collect", bullets: ["Account identity such as email and display name.", "Optional eligibility data such as country, region, postal code, birth date, preferences, and user-provided eligibility notes.", "Saved opportunities, user-reported status, reminders, searches, alerts, support requests, and Pilot Credit activity.", "Subscription and billing-event status from Stripe; Play Pack Pilot does not store full payment-card numbers.", "Security and operational metadata such as request identifiers, timestamps, error classifications, and source-scan evidence."] },
      { heading: "How data is used", bullets: ["Authenticate accounts and protect access.", "Personalize opportunity matching and eligibility guidance.", "Deliver requested alerts, exports, support, and subscription features.", "Prevent abuse, investigate failures, maintain audits, and comply with legal obligations.", "Improve product reliability using minimized or aggregated operational information."] },
      { heading: "Processors and disclosure", paragraphs: ["Supabase may provide authentication and database services; Stripe handles payments; OpenAI may process bounded promotion content for configured AI features; and Resend may deliver opted-in email when enabled. We do not send passwords, session tokens, or full payment-card data to AI providers. We do not currently sell personal information. Provider terms and the final production data-flow inventory require attorney and deployment review."] },
      { heading: "Your controls", bullets: ["Correct profile information in Settings.", "Download a machine-readable account export from Settings.", "Change notification consent or unsubscribe from email.", "Request account deletion for operator review.", "Contact support to request access, correction, restriction, objection, or portability where applicable."] },
      { heading: "Retention and security", paragraphs: ["Account data is kept only as needed to provide the service and meet security, billing, audit, dispute, and legal obligations. A deletion request can be delayed where a lawful retention obligation or legal claim applies; the retained scope and reason must be recorded. Sensitive profile fields are excluded from application logs. Production transport must use HTTPS and supported deployment security headers."] },
      { heading: "Cookies", paragraphs: ["The current product uses essential authentication, refresh, and CSRF-protection cookies. Optional analytics or advertising cookies are not enabled by this implementation. If optional cookies are introduced, a consent control must be deployed before they are set where required."] },
    ],
  },
  "acceptable-use": {
    title: "Acceptable Use Policy",
    summary: "Controls that protect users, sponsors, approved sources, and platform infrastructure.",
    sections: [
      { heading: "Permitted use", paragraphs: ["Use Play Pack Pilot for lawful personal discovery, research, analysis, tracking, and sponsor-site navigation."] },
      { heading: "Prohibited conduct", bullets: ["Automated promotion entry, credential sharing, fake identities, entry manipulation, or attempts to improve odds unlawfully.", "Bypassing CAPTCHAs, authentication, paywalls, robots restrictions, rate limits, or sponsor terms.", "Scanning arbitrary destinations, private networks, cloud metadata, or unapproved sources.", "Uploading malicious content, probing other users’ data, exploiting vulnerabilities, or interfering with service availability.", "Reselling Pilot Credits, scraping the product, or using analysis to misrepresent a sponsor or promotion."] },
      { heading: "Enforcement", paragraphs: ["We may rate-limit, pause, investigate, or disable accounts and sources when needed to protect the service. Material administrative actions are recorded in an immutable audit log. Good-faith security reports should use the support channel without accessing data beyond what is necessary to demonstrate the issue."] },
    ],
  },
  "subscriptions": {
    title: "Subscription and Cancellation Terms",
    summary: "Clear recurring-billing, renewal, plan-change, and cancellation expectations.",
    sections: [
      { heading: "Before purchase", paragraphs: ["The checkout screen must display the plan, billing interval, price, included Pilot Credits, renewal behavior, and cancellation method before payment. Stripe remains authoritative for payment processing."] },
      { heading: "Renewal and changes", paragraphs: ["Paid subscriptions renew for the selected monthly or annual interval until canceled. Upgrades, downgrades, prorations, taxes, trials, and promotions are shown by Stripe before confirmation and synchronized only from verified webhooks."] },
      { heading: "Cancellation", paragraphs: ["You can open the Stripe Customer Portal from Billing and cancel without contacting a salesperson. Cancellation normally stops the next renewal while access continues through the current paid period. Deleting the application account does not replace cancellation of an active subscription."] },
      { heading: "Payment failure and refunds", paragraphs: ["Failed payments may trigger a configured grace period and later downgrade. Refund eligibility, statutory cooling-off rights, and jurisdiction-specific renewal notices require attorney review; nothing here limits non-waivable consumer rights."] },
    ],
  },
  "credits": {
    title: "Pilot Credit Terms",
    summary: "Pilot Credits meter internal AI and compute usage; they are not money, entries, prizes, or odds.",
    sections: [
      { heading: "Nature of Pilot Credits", bullets: ["No cash or prize value.", "Not transferable, withdrawable, redeemable, or exchangeable.", "Cannot purchase promotion entries, prizes, payouts, or improved odds.", "Used only for disclosed Play Pack Pilot software operations."] },
      { heading: "Grants and consumption", paragraphs: ["Plans may include recurring credits according to the configured catalog. The interface discloses an operation’s cost before execution. The authoritative append-only ledger records grants, consumption, refunds, and reviewed corrections."] },
      { heading: "Failures, expiration, and changes", paragraphs: ["When a charged operation fails before delivering value, the service uses an idempotent refund policy where specified. Grant expiration and plan limits are configuration-driven and must be disclosed. Promotional or support credits may be corrected, but historical ledger entries are not rewritten."] },
    ],
  },
  "attribution": {
    title: "Source Attribution Policy",
    summary: "How Play Pack Pilot preserves sponsor identity, source evidence, official links, and verification timing.",
    sections: [
      { heading: "Required listing context", bullets: ["Original sponsor name.", "Official promotion URL and official-rules URL when available.", "Registered source attribution when required.", "Last verified or last seen timing.", "A visible statement that Play Pack Pilot is not the sponsor."] },
      { heading: "Approved-source access", paragraphs: ["Only operator-reviewed public sources may be scanned. Access method, robots review, terms review, cadence, rate limit, and attribution requirements are recorded before scanning is enabled. The scanner does not authenticate to sponsor sites, bypass controls, or follow destinations outside the approved origin."] },
      { heading: "Corrections", paragraphs: ["Sponsors and rights holders may request a correction, updated attribution, or review through support. Historical source and rules evidence may be retained for integrity, security, and dispute review even when a public listing is corrected or removed."] },
    ],
  },
  "copyright": {
    title: "Copyright and Takedown Policy",
    summary: "A review process for claimed infringement, corrections, and removal requests.",
    sections: [
      { heading: "Respect for rights", paragraphs: ["Play Pack Pilot stores bounded promotion facts, source references, rules evidence, and short analysis needed for discovery and verification. It does not claim ownership of sponsor marks, rules, images, or promotion materials."] },
      { heading: "Submitting a notice", bullets: ["Identify the copyrighted work or other protected material.", "Identify the Play Pack Pilot URL and the original source at issue.", "Provide contact information and a good-faith statement.", "Confirm the notice is accurate and that you are authorized to act.", "Submit through the published support channel; a dedicated legal contact must be configured before public launch."] },
      { heading: "Review and response", paragraphs: ["We may temporarily restrict a listing while investigating, preserve relevant audit evidence, contact the source or affected user, correct attribution, or remove material. Counter-notice and repeat-infringer procedures require jurisdiction-specific attorney review before launch."] },
    ],
  },
  "disclaimer": {
    title: "Platform Disclaimer",
    summary: "Important limits on listings, AI analysis, eligibility, sponsors, and outcomes.",
    sections: [
      { heading: "Discovery service only", bullets: ["Play Pack Pilot is a discovery and research service.", "Play Pack Pilot does not sponsor or administer listed promotions.", "Users must read the sponsor’s current official rules.", "Eligibility is determined by the sponsor, not Play Pack Pilot.", "Listings can change, end early, be canceled, or expire.", "AI analysis may be incomplete, outdated, or incorrect.", "Winning is never guaranteed.", "Subscription payment does not purchase entries or improve odds."] },
      { heading: "Safety", paragraphs: ["Do not send money, credentials, banking details, or sensitive identity documents based solely on a listing or message. Independently verify the sponsor and official domain. Verification, claim, and suspicious inbox links remain review-only and are never opened automatically by Play Pack Pilot."] },
    ],
  },
  "affiliate": {
    title: "Affiliate Disclosure",
    summary: "How material relationships will be disclosed if affiliate links or compensated placements are introduced.",
    sections: [
      { heading: "Current implementation", paragraphs: ["The current launch implementation does not identify sponsor links as affiliate links and does not alter rankings based on affiliate compensation."] },
      { heading: "Future relationships", paragraphs: ["If Play Pack Pilot may receive compensation from a link, sponsor, placement, or referral, the relationship must be disclosed clearly and near the affected content before an affiliate link is used. Compensation must not override safety, attribution, or ranking integrity."] },
      { heading: "No sponsor implication", paragraphs: ["An affiliate relationship would not mean Play Pack Pilot administers a promotion, guarantees a sponsor, validates eligibility, or improves a user’s odds."] },
    ],
  },
};

export function PolicyIndexPage() {
  return <PolicyShell><header className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Trust center</p><h1 className="mt-4 font-display text-4xl font-extrabold sm:text-6xl">Platform policies</h1><p className="mt-5 text-lg leading-8 text-muted">Public drafts covering product boundaries, privacy, subscriptions, source responsibility, and user conduct. These drafts require attorney approval before launch.</p></header><div className="mt-10 grid gap-4 md:grid-cols-2">{Object.entries(policies).map(([slug, policy]) => <Link key={slug} href={`/policies/${slug}`} className="rounded-2xl border border-line bg-panel p-5 transition hover:border-accent/50"><FileCheck2 size={20} className="text-accent"/><h2 className="mt-4 text-xl font-bold">{policy.title}</h2><p className="mt-2 text-sm leading-6 text-muted">{policy.summary}</p></Link>)}</div></PolicyShell>;
}

export function PolicyPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const policy = policies[slug];
  if (!policy) return <PolicyShell><h1 className="font-display text-4xl font-extrabold">Policy not found</h1><Link href="/policies" className="mt-5 inline-flex text-accent">Return to policies</Link></PolicyShell>;
  return <PolicyShell><Link href="/policies" className="text-sm text-accent">← All policies</Link><header className="mt-7 max-w-4xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-accent">Attorney-review draft · reviewed {reviewedOn}</p><h1 className="mt-4 text-balance font-display text-4xl font-extrabold sm:text-6xl">{policy.title}</h1><p className="mt-5 text-lg leading-8 text-muted">{policy.summary}</p></header><div className="mt-10 grid gap-5">{policy.sections.map(section => <section key={section.heading} className="rounded-2xl border border-line bg-panel p-5 sm:p-7"><h2 className="text-xl font-bold">{section.heading}</h2>{section.paragraphs?.map(paragraph => <p key={paragraph} className="mt-3 max-w-4xl text-sm leading-7 text-muted">{paragraph}</p>)}{section.bullets ? <ul className="mt-4 grid max-w-4xl gap-3 text-sm leading-6 text-muted">{section.bullets.map(bullet => <li key={bullet} className="flex gap-3"><ShieldCheck size={16} className="mt-1 shrink-0 text-accent"/><span>{bullet}</span></li>)}</ul> : null}</section>)}</div><p className="mt-8 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm leading-6 text-muted"><ExternalLink size={16} className="mt-1 shrink-0 text-warning"/>This is a product implementation draft, not legal advice. Legal entity details, governing law, jurisdiction-specific rights, contact addresses, and launch-effective dates must be approved before publication.</p></PolicyShell>;
}

function PolicyShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6 sm:py-12"><div className="mx-auto max-w-6xl"><nav className="flex items-center justify-between border-b border-line pb-5"><Link href="/" className="font-display text-lg font-extrabold">PLAY PACK PILOT</Link><div className="flex gap-4 text-sm text-muted"><Link href="/pricing" className="hover:text-foreground">Pricing</Link><Link href="/login" className="hover:text-foreground">Log in</Link></div></nav><div className="py-10">{children}</div></div></main>;
}
