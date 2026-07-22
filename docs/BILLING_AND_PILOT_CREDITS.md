# Stripe billing and Pilot Credits

Phase 8 uses Stripe Billing in test mode for software subscriptions. Payments are never connected to sweepstakes entries, prizes, payouts, odds, or user-to-user transfers. Pilot Credits are non-transferable internal usage units with no cash or prize value.

## Stripe objects

- One Stripe Customer per authenticated Play Pack Pilot user.
- Subscription Checkout Session using a server-selected monthly or annual Price.
- One recurring Stripe Subscription synchronized only from verified webhooks.
- Customer Portal Session for payment methods and Stripe-hosted billing history.
- Invoice events used for paid-period credit grants and payment-failure state.

The application rejects `sk_live_` keys and `livemode: true` webhook events. Enabling live billing requires a later explicit release decision and code change.

## Environment

Required for test billing:

- `APP_BASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` beginning with `sk_test_`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_COPILOT_MONTHLY`
- `STRIPE_PRICE_COPILOT_ANNUAL`
- `STRIPE_PRICE_ACE_PILOT_MONTHLY`
- `STRIPE_PRICE_ACE_PILOT_ANNUAL`
- `STRIPE_PRICE_SQUADRON_MONTHLY`
- `STRIPE_PRICE_SQUADRON_ANNUAL`

Optional configuration is documented in `.env.example`: `BILLING_GRACE_PERIOD_DAYS` and all `PILOT_CREDIT_COST_*` values.

## Webhook

Configure Stripe test mode to send these events to `POST /api/billing/webhook`:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The raw request bytes are HMAC verified with a five-minute timestamp tolerance. `billing_events.provider_event_id` is unique. Checkout success redirects never grant access. Subscription state and entitlements come from verified subscription/invoice events, and included paid credits are granted once per Stripe invoice ID.

## Credit lifecycle

The signed, append-only `credit_ledger` is authoritative. PostgreSQL functions take a per-user transaction advisory lock, enforce idempotency, calculate the unexpired balance, reject insufficient balances atomically, and create exact failed-action refunds. Feature code calls the central credit service and cannot update a cached balance.

Free Flight receives a documented free-access grant once per UTC calendar month. Paid grants occur only after `invoice.paid`. Credits cannot be withdrawn, transferred, or used for entry-related payments.

## Migration and rollback

Apply `lib/db/migrations/0006_stripe_credits.sql` after migrations `0000` through `0005`. The migration is additive. Rollback is operational: disable Stripe test webhook delivery and metered routes, retain billing events and the append-only ledger for audit, and deploy the prior application version. Do not drop or rewrite financial/audit records during rollback.
