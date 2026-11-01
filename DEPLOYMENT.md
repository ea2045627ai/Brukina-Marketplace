# Production deployment

The production site is `https://brukina-markethub.netlify.app`. The web app is built as a static Vite site in `dist/`; `netlify.toml` defines the production build, SPA fallback, and asset caching.

## Required configuration

Configure these values in Netlify and, if using GitHub Actions, in the GitHub repository's `production` environment:

| Name | Location | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Netlify/GitHub environment variable | Public Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Netlify/GitHub environment variable | Public Supabase publishable/anon key; never use the service-role key |
| `NETLIFY_AUTH_TOKEN` | GitHub environment secret or local shell | Netlify deploy token; never commit or print it |

The current app origin and Netlify site ID are preconfigured in the deploy script and workflow. Set `APP_ORIGIN` only if changing to a different production domain.

Set public Supabase browser variables at **build time**. Do not expose service-role keys, Paystack secret keys, SMS credentials, or webhook secrets through any `VITE_` variable. Configure those server-side in Supabase secrets instead.

In Supabase **Authentication → URL Configuration**, set the Site URL to the production origin and add it to the redirect allow-list. Add local development origins separately as needed. Enable Google/Apple providers with their dashboard-managed client credentials, and configure the SMS Auth provider/hook before relying on OTP login.

## Deploy locally

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.production` or another production-mode Vite env file (ignored by Git). The current app origin and site ID are defaults. Authenticate the local Netlify CLI with `netlify login`, or set `NETLIFY_AUTH_TOKEN` in a secure shell environment, then run:

```sh
npm run deploy:netlify
```

The command validates configuration, runs ESLint and the production build, checks required PWA assets, then requests a production deploy. It stops with the CLI error if Netlify blocks production deploys or the account lacks permission.

To validate configuration and build without uploading, run `npm run deploy:netlify -- --dry-run`.

## Deploy from GitHub Actions

Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as variables and `NETLIFY_AUTH_TOKEN` as a secret in the repository's `production` environment, then run **Actions → Deploy Brukina Marketplace → Run workflow**. The site ID and app origin are already configured. The workflow is manual so production is not changed by an unreviewed push.

Netlify may pause deployments due to team billing/plan limits. Neither the local command nor GitHub Actions can override that restriction; resume deploys in Netlify before retrying. A successful upload is not a substitute for configuring Supabase OAuth, SMS, payment, and database settings.

## Backend services

The static-site deploy publishes the web client only. Apply database migrations and deploy Supabase Edge Functions separately using [deploy_setup.sh](./deploy_setup.sh), after configuring its required Supabase, Paystack, Arkesel, SMS, and origin values. The script intentionally requires an explicit production migration confirmation.
