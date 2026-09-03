# Brukina Marketplace

Brukina is a deployable PWA marketplace for wholesale and local delivery operations. See [`ROADMAP.md`](ROADMAP.md) for the live product scope and release gates.

## Included workspaces

- Customer: marketplace discovery, orders, wallet, and live delivery tracking.
- Vendor: sales, listings, order queue, partner onboarding, and payouts.
- Driver: dispatch queue, route tracking, availability, and earnings.
- Rider: nearby jobs, backup dispatch enrollment, availability, and delivery history.
- Administrator: separate sign-in entry point with operations metrics and review queues.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/dispatch.sql`](supabase/dispatch.sql), then [`supabase/operations.sql`](supabase/operations.sql), in the Supabase SQL Editor. The frontend uses the Supabase project configured in `app.js`. Enable email/password authentication; sign-up stores `full_name` and the selected non-admin role in user metadata. Supported roles are `customer`, `vendor`, `driver`, `rider`, and `admin`.

Administrator access is intentionally separate: only an authenticated user whose protected Supabase `app_metadata` contains `role: "admin"` can open the operations dashboard. Grant this server-side with the commented SQL at the end of the schema. Row Level Security is included in the schema and must be applied before production use. Financial ledger entries are trusted writes and must be created by an admin or server-side payment/operations worker.

The existing marketplace integrations expect these tables: `marketplace_inventory`, `user_profiles`, and `global_vendors`.

The catalog supports building materials, tools and equipment, devices and gadgets, accessories and body products, clothing, and home and living goods. Run [`supabase/sourcing.sql`](supabase/sourcing.sql) after the core migrations to add verified source partners, buyer sourcing requests, and vendor quotes. External Shopify, Made-in-China, Leeknives, and American brand credentials must be handled by a server-side connector; never place those tokens in `app.js`. The starter catalog is an outage fallback when the live inventory query fails.

Dispatch health is managed through `dispatch_providers`. Buyers can switch between available Bolt, Yango, and Brukina Backup options on the tracking screen. Bolt and Yango can be marked unavailable by an admin or trusted server job; the app then recommends `brukina_backup` and queues a protected `dispatch_requests` record. `local_vendors`, `local_couriers`, and `cashflow_entries` support local supply, rider/driver operations, and delivery fees, payouts, and settlements.

## Production support assistant

Run [`supabase/production.sql`](supabase/production.sql) after the other migrations. It adds protected support preferences, conversation records, and consented callback requests. The web assistant supports typed questions and browser speech recognition/synthesis when the device and browser provide them. Language options include English, Twi/Akan, Ewe, Ga, Hausa, Swahili, French, and Portuguese; actual recognition and voice quality depend on the browser's installed language services.

To route new sourcing requests to supply partners, run [`supabase/supply_bridge.sql`](supabase/supply_bridge.sql) after [`supabase/sourcing.sql`](supabase/sourcing.sql). Store your deployed Netlify function URL in Supabase Vault under `supply_bridge_url`, for example `https://YOUR-SITE.netlify.app/.netlify/functions/supply-bridge`. The trigger rejects missing or non-HTTPS bridge URLs. Set `SUPPLY_PARTNER_WEBHOOK_URL` in Netlify only when a verified partner endpoint is ready; otherwise the bridge acknowledges and records the event without forwarding it.

Phone calls and an always-on AI representative require a trusted server connector such as Netlify Functions plus a telephony provider and an AI speech provider. Configure those credentials as server environment variables and process `support_callback_requests`; never put provider keys in `app.js`. Full coverage of every African native language cannot be guaranteed by browser APIs alone and requires selecting and testing a speech provider per target language, with human escalation for unsupported or sensitive requests.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173> in a browser.