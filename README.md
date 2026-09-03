# Brukina Marketplace

Brukina is a static PWA marketplace frontend for wholesale and local delivery operations.

## Included workspaces

- Customer: marketplace discovery, orders, wallet, and live delivery tracking.
- Vendor: sales, listings, order queue, partner onboarding, and payouts.
- Driver: dispatch queue, route tracking, availability, and earnings.
- Rider: nearby jobs, backup dispatch enrollment, availability, and delivery history.
- Administrator: separate sign-in entry point with operations metrics and review queues.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. The frontend uses the Supabase project configured in `app.js`. Enable email/password authentication; sign-up stores `full_name` and the selected non-admin role in user metadata. Supported roles are `customer`, `vendor`, `driver`, `rider`, and `admin`.

Administrator access is intentionally separate: only an authenticated user whose protected Supabase `app_metadata` contains `role: "admin"` can open the operations dashboard. Grant this server-side with the commented SQL at the end of the schema. Row Level Security is included in the schema and should be reviewed before production use.

The existing marketplace integrations expect these tables: `marketplace_inventory`, `user_profiles`, and `global_vendors`.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173> in a browser.