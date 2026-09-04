# Brukina Marketplace

Brukina is a deployable PWA marketplace for wholesale and local delivery operations. See [`ROADMAP.md`](ROADMAP.md) for the live product scope and release gates.

## Included workspaces

- Customer: marketplace discovery, orders, wallet, and live delivery tracking.
- Vendor: sales, listings, order queue, partner onboarding, and payouts.
- Driver: dispatch queue, route tracking, availability, and earnings.
- Rider: nearby jobs, backup dispatch enrollment, availability, and delivery history.
- Administrator: separate sign-in entry point with operations metrics and review queues.

## Supabase setup

Run [`supabase/schema.sql`](supabase/schema.sql), then [`supabase/dispatch.sql`](supabase/dispatch.sql), then [`supabase/operations.sql`](supabase/operations.sql), in the Supabase SQL Editor. The frontend reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` through [`src/lib/supabaseClient.js`](src/lib/supabaseClient.js). Enable email/password authentication; sign-up stores `full_name` and the selected non-admin role in user metadata. Supported roles are `customer`, `vendor`, `driver`, `rider`, and `admin`.

If the hosted project was only partially migrated, run [`supabase/complete_repair.sql`](supabase/complete_repair.sql) after all migrations. It creates missing order, wallet, dispatch, courier, quote, and support tables and reapplies their RLS policies safely.

Administrator access is intentionally separate: only an authenticated user whose protected Supabase `app_metadata` contains `role: "admin"` can open the operations dashboard. Grant this server-side with the commented SQL at the end of the schema. Row Level Security is included in the schema and must be applied before production use. Financial ledger entries are trusted writes and must be created by an admin or server-side payment/operations worker.

The existing marketplace integrations expect these tables: `marketplace_inventory`, `user_profiles`, and `global_vendors`.

The catalog supports building materials, tools and equipment, devices and gadgets, accessories and body products, clothing, and home and living goods. Run [`supabase/sourcing.sql`](supabase/sourcing.sql) after the core migrations to add verified source partners, buyer sourcing requests, and vendor quotes. External Shopify, Made-in-China, Leeknives, and American brand credentials must be handled by a server-side connector; never place those tokens in `app.js`. The starter catalog is an outage fallback when the live inventory query fails.

Dispatch health is managed through `dispatch_providers`. Buyers can switch between available Bolt, Yango, and Brukina Backup options on the tracking screen. Bolt and Yango can be marked unavailable by an admin or trusted server job; the app then recommends `brukina_backup` and queues a protected `dispatch_requests` record. `local_vendors`, `local_couriers`, and `cashflow_entries` support local supply, rider/driver operations, and delivery fees, payouts, and settlements.

## Production support assistant

Run [`supabase/production.sql`](supabase/production.sql) after the other migrations. It adds protected support preferences, conversation records, and consented callback requests. The web assistant supports typed questions and browser speech recognition/synthesis when the device and browser provide them. Language options include English, Twi/Akan, Ewe, Ga, Hausa, Swahili, French, and Portuguese; actual recognition and voice quality depend on the browser's installed language services.

To create and apply the complete Brukina database bundle, use the tracked
migration order with a Supabase Postgres connection string:

```bash
npm run db:bundle
DATABASE_URL="postgresql://..." npm run db:apply
```

Verify the connection before applying migrations:

```bash
DATABASE_URL="postgresql://..." npm run db:verify
```

Use the Supabase **Database Settings → Connection string → URI** value. The
direct host format is `postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres`; the Supabase pooler URI is also supported. The script enforces `sslmode=require`, uses `--no-password` so credentials must come from the URL or PostgreSQL environment, and applies the bundle with `ON_ERROR_STOP=1` in one transaction.

The command applies `schema.sql`, `dispatch.sql`, `operations.sql`,
`sourcing.sql`, `production.sql`, `complete_repair.sql`, and
`supply_bridge.sql` in that order. `npm run check:database` verifies that all
files are present and reports when `DATABASE_URL` is still pending. Do not put
database URLs, service keys, or video-library credentials in source control.

To route new sourcing requests to supply partners, run [`supabase/supply_bridge.sql`](supabase/supply_bridge.sql) after [`supabase/sourcing.sql`](supabase/sourcing.sql). Store your deployed Netlify function URL in Supabase Vault under `supply_bridge_url`, for example `https://YOUR-SITE.netlify.app/.netlify/functions/supply-bridge`. The trigger rejects missing or non-HTTPS bridge URLs. Set `SUPPLY_PARTNER_WEBHOOK_URL` in Netlify only when a verified partner endpoint is ready; otherwise the bridge acknowledges and records the event without forwarding it.

Phone calls and an always-on AI representative require a trusted server connector such as Netlify Functions plus a telephony provider and an AI speech provider. Configure those credentials as server environment variables and process `support_callback_requests`; never put provider keys in `app.js`. Full coverage of every African native language cannot be guaranteed by browser APIs alone and requires selecting and testing a speech provider per target language, with human escalation for unsupported or sensitive requests.

Arkesel voice dispatch runs when a `telephony_calls` INSERT includes `record.metadata.buyer_phone` and the server has `TELEPHONY_PROVIDER_API_KEY` plus `TELEPHONY_PROVIDER_VOICE_URL`. Optional `ARKESEL_DEFAULT_PHONE` can provide a fallback recipient. The shared server adapter also exposes Arkesel SMS, balance, and contact-subscription operations using the documented `sms.arkesel.com` endpoints. Keep all values in Railway or Netlify environment variables; never commit real credentials.

## Run locally

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173> in a browser.

## Render deployment

The tracked [`render.yaml`](render.yaml) blueprint provisions the Node web
service and a Render PostgreSQL database named `brukina-marketplace-db`. The
database connection is exposed as `DATABASE_URL` for future server-side data
adapters. The current marketplace data layer remains Supabase, so apply the
SQL migrations in the Supabase setup section before deploying production data.
Validate the Render blueprint locally with `npm run check:render`.

## Netlify connection check

Run the complete validation locally with:

```bash
npm run check
```

When Netlify is not connected, the check passes the repository validation and
prints a pending action. After connecting the repository in Netlify, its build
environment sets `NETLIFY=true`; the same command then verifies the configured
build command, functions directory, deploy context, and supply bridge file.
The optional `SUPPLY_PARTNER_WEBHOOK_URL` remains pending until a verified
partner endpoint is ready. Never commit that value or any provider secret.
Use the tracked [`.env.example`](.env.example) as the configuration checklist;
copy its variable names into Netlify's environment settings rather than
committing a real endpoint. When set, the check requires an HTTPS URL without
embedded credentials.
Connected Netlify builds also require `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` for server-side order creation. The service-role
key must be stored only as a Netlify secret.

## Heroku deployment

Heroku runs the Express service in [`server/railway.mjs`](server/railway.mjs)
through the root [`Procfile`](Procfile). Supabase remains the application
database; Heroku hosts the web process and does not replace the Supabase
migrations. Apply the SQL files in the order documented above, then create the
Heroku app and configure its secrets:

```bash
heroku create brukina-marketplace
heroku config:set SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
	SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" \
	WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET" \
	PAYSTACK_SECRET_KEY="YOUR_PAYSTACK_SECRET"
git push heroku main
heroku open
```

The deployed health endpoint is `/health`. Use [`app.json`](app.json) to
review the required Heroku variables before creating the app. Never commit
secret values or place the service-role key in browser code.