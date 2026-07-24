import {
  ArrowRight,
  BellRing,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileSearch,
  Gauge,
  Menu,
  Radar,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Link } from "wouter";

const features = [
  {
    icon: Radar,
    title: "AI Sweepstakes Radar",
    copy: "Scan approved public sources and bring promising opportunities into one focused feed.",
  },
  {
    icon: ShieldCheck,
    title: "Eligibility Analysis",
    copy: "Compare location, age, and other rules with your private profile while preserving uncertainty.",
  },
  {
    icon: FileSearch,
    title: "Rules Summaries",
    copy: "Turn dense official rules into a clear overview, checklist, and evidence-backed deadline.",
  },
  {
    icon: Gauge,
    title: "Scam & Risk Signals",
    copy: "Surface suspicious redirects, missing disclosures, conflicting details, and low-confidence sources.",
  },
  {
    icon: CalendarClock,
    title: "Deadline Alerts",
    copy: "Keep ending-soon opportunities and recurring entry windows from disappearing off your radar.",
  },
  {
    icon: Sparkles,
    title: "Personalized Matches",
    copy: "Rank opportunities by prize interests, eligibility, effort, frequency, and your available time.",
  },
] as const;

const plans = [
  {
    name: "Free Flight",
    price: "$0",
    cadence: "forever",
    description: "A clean runway for casual discovery.",
    credits: "10 Pilot Credits / month",
    features: ["Limited Radar feed", "Basic search and filters", "Save up to 10 opportunities", "Weekly digest"],
    cta: "Start Free",
    featured: false,
  },
  {
    name: "Co-Pilot",
    price: "$7.99",
    cadence: "/ month",
    description: "Full discovery and tracking for consistent entrants.",
    credits: "200 Pilot Credits / month",
    features: ["Full Radar feed", "Unlimited saves", "Entry-status tracking", "Daily digest and reminders"],
    cta: "Choose Co-Pilot",
    featured: true,
  },
  {
    name: "Ace Pilot",
    price: "$14.99",
    cadence: "/ month",
    description: "Deep analysis for high-intent opportunity hunters.",
    credits: "750 Pilot Credits / month",
    features: ["Rules and eligibility analysis", "Legitimacy and risk review", "Advanced opportunity scoring", "Custom scans and priority alerts"],
    cta: "Choose Ace Pilot",
    featured: false,
  },
  {
    name: "Squadron",
    price: "$29.99",
    cadence: "/ month",
    description: "A shared household workspace with more capacity.",
    credits: "2,000 Pilot Credits / month",
    features: ["Multiple profiles", "Shared household Hangar", "Advanced reports and export", "Higher custom-scan limits"],
    cta: "Choose Squadron",
    featured: false,
  },
] as const;

const faqs = [
  {
    question: "Does Play Pack Pilot run or sponsor sweepstakes?",
    answer:
      "No. Play Pack Pilot is a discovery and research service. Promotions are run by their sponsors, and the sponsor's official rules control eligibility, deadlines, prizes, and entry requirements.",
  },
  {
    question: "Does Play Pack Pilot submit entries for me?",
    answer:
      "No. Play Pack Pilot does not automatically submit entries. You review the opportunity and visit the sponsor's official site to enter.",
  },
  {
    question: "What are Pilot Credits?",
    answer:
      "Pilot Credits are internal usage units for AI and compute-intensive analysis. They have no cash value, cannot be transferred or redeemed, and never buy entries or improve odds.",
  },
  {
    question: "Can AI analysis guarantee that I am eligible?",
    answer:
      "No. AI can summarize and compare rules, but it can make mistakes and listings can change. Always verify the sponsor's current official rules before entering.",
  },
  {
    question: "Do normal searches and sponsor links use credits?",
    answer:
      "No. Browsing, filtering, saving, tracking, and opening official sponsor links do not consume Pilot Credits.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-background text-foreground">
      <PublicNavigation />
      <Hero />
      <ProductPreview />
      <HowItWorks />
      <FeatureGrid />
      <SafetySection />
      <PricingSection />
      <FaqSection />
      <FinalCallToAction />
      <PublicFooter />
    </main>
  );
}

function PublicNavigation() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-navigation/88 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
        <a href="#top" className="flex min-w-0 items-center gap-3" aria-label="Play Pack Pilot home">
          <img
            src="/brand/play-pack-pilot-logo-original.png"
            alt=""
            className="h-14 w-24 shrink-0 object-contain object-center"
          />
          <span className="hidden min-w-0 sm:block">
            <span className="block font-display text-sm font-extrabold tracking-[0.08em]">PLAY PACK PILOT</span>
            <span className="block text-[11px] text-muted">AI sweepstakes discovery</span>
          </span>
        </a>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted lg:flex" aria-label="Public navigation">
          <a className="transition hover:text-foreground" href="#features">Features</a>
          <a className="transition hover:text-foreground" href="#how-it-works">How It Works</a>
          <a className="transition hover:text-foreground" href="#pricing">Pricing</a>
          <a className="transition hover:text-foreground" href="#safety">Safety</a>
          <a className="transition hover:text-foreground" href="#faq">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden min-h-11 items-center rounded-full border border-line bg-panel/60 px-5 text-sm font-semibold transition hover:border-accent/60 sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-reward px-5 text-sm font-extrabold text-[#111827] shadow-[0_0_28px_rgb(251_191_36_/_0.18)] transition hover:-translate-y-0.5 hover:bg-[#ffd45a]"
          >
            Get Started <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <a href="#features" className="flex size-11 items-center justify-center rounded-full border border-line lg:hidden" aria-label="View features">
            <Menu size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="relative isolate border-b border-line/60">
      <div className="flight-grid pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute left-1/2 top-20 -z-10 h-[32rem] w-[50rem] -translate-x-1/2 rounded-full bg-accent-strong/15 blur-[110px]" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-accent">
            <Radar size={14} aria-hidden="true" /> AI-powered opportunity radar
          </div>
          <h1 className="mt-6 max-w-3xl text-balance font-display text-5xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl">
            Discover More.
            <span className="block text-accent">Miss Less.</span>
            <span className="block text-reward">Enter Smarter.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted">
            Play Pack Pilot scans approved sources for sweepstakes and giveaways, analyzes the rules, and helps you focus on opportunities that match your eligibility, interests, and available time.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-reward px-6 text-sm font-extrabold text-[#111827] transition hover:-translate-y-0.5 hover:bg-[#ffd45a]">
              Start Scanning <Radar size={17} aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-accent-strong bg-panel/55 px-6 text-sm font-bold transition hover:border-accent hover:bg-panel">
              See How It Works <ArrowRight size={17} aria-hidden="true" />
            </a>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
            <TrustPoint text="Direct sponsor links" />
            <TrustPoint text="No paid entries" />
            <TrustPoint text="No automatic submissions" />
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-2xl">
          <div className="absolute inset-x-10 top-1/4 h-1/2 rounded-full bg-accent/20 blur-[90px]" />
          <img
            src="/brand/play-pack-pilot-logo-original.png"
            alt="Play Pack Pilot — AI Sweepstakes SaaS"
            className="relative z-10 aspect-square w-full object-contain drop-shadow-[0_34px_70px_rgb(0_0_0_/_0.58)]"
          />
          <div className="absolute bottom-[8%] left-[8%] z-20 rounded-2xl border border-line bg-surface-glass p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Radar status</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-bold"><span className="size-2 rounded-full bg-ok shadow-[0_0_12px_var(--ok)]" /> Approved sources online</p>
          </div>
          <div className="absolute right-[3%] top-[14%] z-20 rounded-2xl border border-reward/30 bg-surface-glass p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Best match</p>
            <p className="mt-1 text-2xl font-extrabold text-reward">94%</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section className="relative py-20 sm:py-24" aria-labelledby="preview-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Your daily flight deck"
          title="Turn a noisy web into a clear opportunity plan."
          copy="See what is new, what fits, what ends soon, and what deserves a closer look—without confusing discovery with sponsor-controlled entry."
          id="preview-heading"
        />
        <div className="mt-10 overflow-hidden rounded-[2rem] border border-line bg-navigation shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent-strong text-white"><Radar size={20} aria-hidden="true" /></div>
              <div>
                <p className="font-display text-sm font-extrabold">RADAR</p>
                <p className="text-xs text-muted">Personalized opportunity feed</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-2 text-xs text-muted"><Search size={14} aria-hidden="true" /> Search prizes, sponsors, categories</div>
          </div>
          <div className="grid gap-0 lg:grid-cols-[15rem_1fr]">
            <aside className="hidden border-r border-line bg-navigation/70 p-5 lg:block" aria-label="Preview navigation">
              {[
                ["Flight Deck", true],
                ["Radar", false],
                ["Hangar", false],
                ["Mission Log", false],
                ["Flight Plan", false],
                ["Co-Pilot", false],
              ].map(([label, active]) => (
                <div key={String(label)} className={`mb-1 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-accent-strong text-white" : "text-muted"}`}>{label}</div>
              ))}
            </aside>
            <div className="p-5 sm:p-7">
              <div className="grid gap-3 sm:grid-cols-3">
                <PreviewMetric label="New matches" value="12" note="since yesterday" tone="cyan" />
                <PreviewMetric label="Ending soon" value="6" note="next 72 hours" tone="gold" />
                <PreviewMetric label="Saved" value="18" note="in your Hangar" tone="violet" />
              </div>
              <div className="mt-6 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="space-y-3">
                  <OpportunityPreview title="National Park Adventure Giveaway" sponsor="Official outdoor brand" prize="$12,500 trip package" match="94%" deadline="Ends in 3 days" risk="Low risk" />
                  <OpportunityPreview title="Creator Studio Upgrade" sponsor="Verified technology sponsor" prize="$7,800 equipment bundle" match="88%" deadline="Ends in 8 days" risk="Low risk" />
                  <OpportunityPreview title="Year of Groceries Sweepstakes" sponsor="National retail sponsor" prize="$6,000 gift cards" match="81%" deadline="Daily entry" risk="Review rules" />
                </div>
                <div className="rounded-2xl border border-line bg-panel p-5">
                  <div className="flex items-center gap-2 text-accent"><Bot size={18} aria-hidden="true" /><span className="text-xs font-bold uppercase tracking-[0.14em]">Co-Pilot brief</span></div>
                  <h3 className="mt-4 text-xl font-bold">Why your top match ranks first</h3>
                  <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
                    <li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-ok" size={15} aria-hidden="true" /> Your region appears eligible.</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-ok" size={15} aria-hidden="true" /> The prize matches travel preferences.</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-1 shrink-0 text-ok" size={15} aria-hidden="true" /> Entry effort is estimated under five minutes.</li>
                  </ul>
                  <p className="mt-5 rounded-xl border border-warning/25 bg-warning/10 p-3 text-xs leading-5 text-warning">AI analysis can be wrong. Verify the sponsor's official rules before entering.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    [Radar, "Scan", "Approved sources are checked through configured, policy-reviewed access methods."],
    [FileSearch, "Analyze", "Rules, prizes, dates, eligibility, effort, and risk signals are normalized with evidence."],
    [Route, "Match", "Your preferences and private eligibility profile shape a transparent opportunity score."],
    [ExternalLink, "Enter on sponsor site", "You make the final decision and visit the official promotion to enter."],
  ] as const;
  return (
    <section id="how-it-works" className="border-y border-line/70 bg-navigation/55 py-20 sm:py-24" aria-labelledby="how-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Simple as 1-2-3-4" title="A clear route from discovery to decision." copy="Play Pack Pilot handles research and organization. The sponsor controls the promotion, and you control every entry." id="how-heading" />
        <ol className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {steps.map(([Icon, title, copy], index) => (
            <li key={title} className="relative rounded-2xl border border-line bg-panel/70 p-6">
              <span className="absolute right-5 top-4 font-display text-4xl font-extrabold text-line/70">0{index + 1}</span>
              <div className="flex size-12 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent"><Icon size={23} aria-hidden="true" /></div>
              <h3 className="mt-5 text-lg font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{copy}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section id="features" className="py-20 sm:py-24" aria-labelledby="features-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="All signal. Less noise." title="Everything you need to enter with better information." copy="Built for opportunity discovery, research, ranking, and personal tracking—not promotion administration." id="features-heading" />
        <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ icon: Icon, title, copy }, index) => (
            <article key={title} className="group rounded-2xl border border-line bg-panel/65 p-6 transition hover:-translate-y-1 hover:border-accent/55 hover:shadow-[var(--shadow-glow)]">
              <div className={`flex size-12 items-center justify-center rounded-2xl border ${index % 3 === 1 ? "border-accent-violet/40 bg-accent-violet/12 text-[#a78bfa]" : index % 3 === 2 ? "border-reward/40 bg-reward/10 text-reward" : "border-accent/40 bg-accent/10 text-accent"}`}>
                <Icon size={23} aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function SafetySection() {
  return (
    <section id="safety" className="relative border-y border-line/70 bg-navigation py-20 sm:py-24" aria-labelledby="safety-heading">
      <div className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-accent/10 blur-[100px]" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div>
          <div className="flex size-14 items-center justify-center rounded-2xl border border-accent/30 bg-accent/10 text-accent"><ShieldCheck size={28} aria-hidden="true" /></div>
          <h2 id="safety-heading" className="mt-6 text-balance font-display text-3xl font-extrabold sm:text-4xl">Built for informed decisions—not gambling mechanics.</h2>
          <p className="mt-4 max-w-xl text-pretty leading-7 text-muted">The product makes money from software access and analysis capacity. It never sells entries, prizes, winner selection, or better odds.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SafetyCard icon={ExternalLink} title="Direct sponsor links" copy="Every listing points back to the original promotion and official rules when available." />
          <SafetyCard icon={FileSearch} title="Visible attribution" copy="Source evidence, sponsor identity, and verification timing stay connected to the listing." />
          <SafetyCard icon={CircleDollarSign} title="No paid entries" copy="Subscriptions pay for discovery and software features—not entry fees or improved odds." />
          <SafetyCard icon={ShieldCheck} title="User-controlled entry" copy="Play Pack Pilot does not auto-submit forms, bypass CAPTCHAs, or open claim links for you." />
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-24" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Choose your altitude" title="Start free. Upgrade when deeper analysis earns its seat." copy="All plans keep sponsor links and normal browsing outside the Pilot Credit meter. Annual pricing is available for paid plans." id="pricing-heading" />
        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article key={plan.name} className={`relative flex flex-col rounded-3xl border p-6 ${plan.featured ? "border-reward bg-[linear-gradient(160deg,rgb(251_191_36_/_0.12),rgb(16_30_50_/_0.96)_38%)] shadow-[0_24px_70px_rgb(251_191_36_/_0.12)]" : "border-line bg-panel/70"}`}>
              {plan.featured ? <span className="absolute -top-3 left-6 rounded-full bg-reward px-3 py-1 text-xs font-extrabold text-[#111827]">Most popular</span> : null}
              <h3 className="font-display text-lg font-extrabold">{plan.name}</h3>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted">{plan.description}</p>
              <p className="mt-5"><span className="text-4xl font-extrabold">{plan.price}</span> <span className="text-sm text-muted">{plan.cadence}</span></p>
              <p className="mt-3 text-sm font-bold text-accent">{plan.credits}</p>
              <ul className="mt-6 space-y-3 text-sm text-muted">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2"><Check className="mt-0.5 shrink-0 text-ok" size={16} aria-hidden="true" />{feature}</li>)}
              </ul>
              <Link href="/signup" className={`mt-8 inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-extrabold transition hover:-translate-y-0.5 ${plan.featured ? "bg-reward text-[#111827]" : "border border-accent-strong bg-panel-strong text-foreground hover:border-accent"}`}>
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
        <p className="mt-6 text-center text-xs leading-5 text-muted">Pilot Credits have no cash value, cannot be transferred or redeemed, and cannot purchase entries or improve odds. Prices and limits are subject to the final configured launch catalog.</p>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="border-y border-line/70 bg-navigation/55 py-20 sm:py-24" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Pre-flight briefing" title="Straight answers before takeoff." copy="The platform is designed to clarify promotions—not blur who runs them or what an AI score means." id="faq-heading" centered />
        <div className="mt-10 space-y-3">
          {faqs.map((faq) => (
            <details key={faq.question} className="group rounded-2xl border border-line bg-panel/75 p-5 open:border-accent/45">
              <summary className="cursor-pointer list-none pr-8 text-base font-bold marker:hidden">{faq.question}<span className="float-right text-accent transition group-open:rotate-45">+</span></summary>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className="relative py-20 sm:py-24">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(ellipse_at_bottom,rgb(37_99_235_/_0.26),transparent_68%)]" />
      <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <Trophy className="mx-auto text-reward" size={42} aria-hidden="true" />
        <h2 className="mt-5 text-balance font-display text-4xl font-extrabold sm:text-5xl">Ready to put better opportunities on your radar?</h2>
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-8 text-muted">Start with discovery, build your Hangar, and let Co-Pilot help you decide where your time is best spent.</p>
        <Link href="/signup" className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-reward px-7 text-sm font-extrabold text-[#111827] transition hover:-translate-y-0.5 hover:bg-[#ffd45a]">Start Scanning <ArrowRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  );
}

function PublicFooter() {
  return (
    <footer className="border-t border-line bg-navigation py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/brand/play-pack-pilot-logo-original.png" alt="Play Pack Pilot" className="h-16 w-24 object-contain" />
          <div><p className="font-display text-sm font-extrabold">PLAY PACK PILOT</p><p className="mt-1 text-xs text-muted">Discovery and research—not the promotion sponsor.</p></div>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted" aria-label="Footer">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#pricing" className="hover:text-foreground">Pricing</a>
          <a href="#safety" className="hover:text-foreground">Safety</a>
          <a href="#faq" className="hover:text-foreground">FAQ</a>
          <Link href="/policies" className="hover:text-foreground">Policies</Link>
          <Link href="/policies/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/policies/terms" className="hover:text-foreground">Terms</Link>
          <Link href="/dashboard" className="hover:text-foreground">Flight Deck</Link>
        </nav>
        <p className="text-xs text-muted">© 2026 Play Pack Pilot</p>
      </div>
    </footer>
  );
}

function SectionHeading({ eyebrow, title, copy, id, centered = false }: { eyebrow: string; title: string; copy: string; id: string; centered?: boolean }) {
  return (
    <div className={centered ? "text-center" : "max-w-3xl"}>
      <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-3 text-balance font-display text-3xl font-extrabold sm:text-4xl">{title}</h2>
      <p className={`mt-4 text-pretty leading-7 text-muted ${centered ? "mx-auto max-w-2xl" : "max-w-2xl"}`}>{copy}</p>
    </div>
  );
}

function TrustPoint({ text }: { text: string }) {
  return <span className="inline-flex items-center gap-2"><CheckCircle2 className="text-ok" size={16} aria-hidden="true" />{text}</span>;
}

function PreviewMetric({ label, value, note, tone }: { label: string; value: string; note: string; tone: "cyan" | "gold" | "violet" }) {
  const color = tone === "cyan" ? "text-accent" : tone === "gold" ? "text-reward" : "text-[#a78bfa]";
  return <div className="rounded-2xl border border-line bg-panel p-4"><p className="text-xs text-muted">{label}</p><p className={`mt-2 text-3xl font-extrabold ${color}`}>{value}</p><p className="mt-1 text-xs text-muted">{note}</p></div>;
}

function OpportunityPreview({ title, sponsor, prize, match, deadline, risk }: { title: string; sponsor: string; prize: string; match: string; deadline: string; risk: string }) {
  return (
    <article className="rounded-2xl border border-line bg-panel p-4 transition hover:border-accent/45">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0"><p className="truncate font-bold">{title}</p><p className="mt-1 text-xs text-muted">{sponsor} · {prize}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-reward/10 px-2.5 py-1 text-[11px] font-bold text-reward">{deadline}</span><span className="rounded-full bg-ok/10 px-2.5 py-1 text-[11px] font-bold text-ok">{risk}</span></div></div>
        <div className="shrink-0 sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Match</p><p className="text-2xl font-extrabold text-accent">{match}</p></div>
      </div>
    </article>
  );
}

function SafetyCard({ icon: Icon, title, copy }: { icon: typeof BellRing; title: string; copy: string }) {
  return <article className="rounded-2xl border border-line bg-panel/75 p-5"><Icon className="text-accent" size={21} aria-hidden="true" /><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted">{copy}</p></article>;
}
