# Brukina Marketplace

Brukina is a static PWA marketplace frontend for wholesale and local delivery operations.

## Included workspaces

- Customer: marketplace discovery, orders, wallet, and live delivery tracking.
- Vendor: sales, listings, order queue, partner onboarding, and payouts.
- Driver: dispatch queue, route tracking, availability, and earnings.
- Rider: nearby jobs, backup dispatch enrollment, availability, and delivery history.
- Administrator: separate sign-in entry point with operations metrics and review queues.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/dispatch.sql`](supabase/dispatch.sql), then [`supabase/operations.sql`](supabase/operations.sql), in the Supabase SQL Editor. The frontend uses the Supabase project configured in `app.js`. Enable email/password authentication; sign-up stores `full_name` and the selected non-admin role in user metadata. Supported roles are `customer`, `vendor`, `driver`, `rider`, and `admin`.

Administrator access is intentionally separate: only an authenticated user whose protected Supabase `app_metadata` contains `role: "admin"` can open the operations dashboard. Grant this server-side with the commented SQL at the end of the schema. Row Level Security is included in the schema and should be reviewed before production use.

The existing marketplace integrations expect these tables: `marketplace_inventory`, `user_profiles`, and `global_vendors`.

The catalog supports building materials, tools and equipment, devices and gadgets, accessories and body products, clothing, and home and living goods. Run [`supabase/sourcing.sql`](supabase/sourcing.sql) after the core migrations to add verified source partners, buyer sourcing requests, and vendor quotes. External Shopify, Made-in-China, Leeknives, and American brand credentials must be handled by a server-side connector; never place those tokens in `app.js`.

Dispatch health is managed through `dispatch_providers`. Buyers can switch between available Bolt, Yango, and Brukina Backup options on the tracking screen. Bolt and Yango can be marked unavailable by an admin or trusted server job; the app then recommends `brukina_backup` and queues a protected `dispatch_requests` record. `local_vendors`, `local_couriers`, and `cashflow_entries` support local supply, rider/driver operations, and delivery fees, payouts, and settlements.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173> in a browser.