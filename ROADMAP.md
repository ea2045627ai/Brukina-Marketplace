# Brukina Marketplace Roadmap

This is the product roadmap for the live Brukina Marketplace application. The
repository is the deployable PWA and its Supabase and Netlify integrations;
fallback catalog data is an outage state, not a second product mode.

## Core now

- Customer marketplace discovery backed by `marketplace_inventory`.
- Email authentication with customer, vendor, driver, rider, and admin roles.
- Vendor and rider applications with verification status.
- Dispatch provider health, provider selection, and protected backup requests.
- Sourcing requests, verified supplier partners, and vendor quotes.
- Support preferences, conversations, and callback requests.
- Authenticated wallet balance, escrow, payout, and transaction reads.
- Active delivery tracking from persisted delivery and courier coordinates.
- Rider and driver online availability with persisted browser location updates.
- PWA shell, service worker, responsive navigation, and structural build checks.

## Next live increments

1. Add a trusted payment webhook for deposits, withdrawals, payouts, and
   refunds; wallet mutations remain disabled until that path is idempotent.
2. Add server-side order creation and fulfillment state transitions before
   enabling checkout for inventory rows.
3. Add background location refresh and trusted delivery-status transitions;
   online availability and initial courier coordinates are now persisted.
4. Add vendor inventory management, dispatch queues, and admin review views.
5. Add signed webhook authentication and an idempotent operations event queue.

## Release gates

- `npm run check`
- `npm run check:webhook`
- Supabase migrations applied in documented order.
- Secrets stored in Supabase Vault or Netlify environment variables only.
- No demo balance, order, or tracking state presented as settled live data.
