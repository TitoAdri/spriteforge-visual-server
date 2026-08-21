# Stripe activation checklist

The pricing page is intentionally **display-only** until this checklist is complete. It does not create a Checkout session, accept a card, or grant paid credits without a verified Stripe webhook.

## Plans to create in Stripe

Create three recurring monthly Prices in USD, then place their Price IDs in the server environment:

| Plan | Price | Monthly Forge credits | Environment variable |
| --- | ---: | ---: | --- |
| Starter | USD 9 | 600 | `STRIPE_PRICE_STARTER` |
| Creator | USD 19 | 1,600 | `STRIPE_PRICE_CREATOR` |
| Studio | USD 39 | 4,000 | `STRIPE_PRICE_STUDIO` |

## Required secrets

Store these only in Coolify's encrypted environment configuration for `generator-api`:

```dotenv
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_CREATOR=price_...
STRIPE_PRICE_STUDIO=price_...
SPRITEFORGE_PUBLIC_URL=https://spriteforge.xyz
```

Never add these values to the browser bundle, repository, screenshots or chat.

## Webhook requirements before enabling Checkout

1. Register `https://spriteforge.xyz/api/stripe/webhook` in Stripe and select only: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
2. Verify the raw signed payload with `STRIPE_WEBHOOK_SECRET` before parsing JSON.
3. Treat the Stripe event ID as an idempotency key in a durable `billing_events` table.
4. Store the Stripe customer on `checkout.session.completed`, but grant or refresh credits only after a verified `invoice.paid` event, never from the return URL.
5. Reverse or suspend access on `customer.subscription.deleted`, failed payments and chargebacks according to the published policy.
6. Test all paths using Stripe test mode and the Stripe CLI before setting live keys.

The `/api/billing/catalog` endpoint exposes only the public plan catalogue and whether a corresponding server Price ID is configured. It intentionally returns no Stripe secret or customer data.
