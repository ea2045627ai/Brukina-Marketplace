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

The static-site deploy publishes the web client only. Apply database migrations and deploy Supabase Edge Functions separately using [deploy_setup.sh](./deploy_setup.sh), after configuring its required Supabase, Paystack, Arkesel, and SMS credentials. The script defaults `APP_ORIGIN` to the live Fly URL; set it explicitly only when using a different production domain. The script intentionally requires an explicit production migration confirmation.

For the already-linked production database, the GitHub Actions workflow **Deploy Brukina Supabase Backend** sets the server-only function secrets and deploys the checkout, Arkesel callback, and SMS Edge Functions without reapplying migrations. Add `SUPABASE_ACCESS_TOKEN`, `PAYSTACK_SECRET_KEY`, `ARKESEL_API_KEY`, `ARKESEL_WEBHOOK_SECRET`, and `SMS_INTERNAL_SECRET` as secrets in the GitHub `production` environment, then run the workflow manually. Enter secret values directly in GitHub; never put them in the repository, workflow inputs, or `VITE_` variables. Google/Apple OAuth credentials and the Supabase Auth SMS provider are configured separately in Supabase Auth.

To enter the four provider values through hidden terminal prompts instead of the GitHub web form, authenticate `gh` with repository access and run `bash scripts/configure-production-backend-secrets.sh`. The script sends each value directly to the GitHub `production` environment, then offers to dispatch the backend workflow. Enter fresh provider-issued credentials only; never paste secret values into chat or save them in a plaintext file. `SMS_INTERNAL_SECRET` is already configured separately.

## Deploy to Fly.io

Fly.io deployment uses a non-root Nginx container to serve the prebuilt Vite app. `fly.toml` configures the app as `brukina-marketplace-ttwezetyljpvtdlvgyxr` in Johannesburg, with HTTPS, a health check, and scale-to-zero. Machines may incur hosting charges while running; check the current Fly.io pricing and account limits before creating the app.

1. Install `flyctl` from Fly.io's official installation instructions and sign in with `fly auth login` (or configure a scoped `FLY_API_TOKEN` securely). You can also install with `go install github.com/superfly/flyctl@latest`.
2. Ensure `.env.production` contains the real public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. These are embedded in the static browser build and are not server secrets. Never put a Supabase service-role key or payment/SMS secret in a `VITE_` variable.
3. Validate the build without creating Fly resources: `npm run deploy:fly -- --dry-run`.
4. After confirming the account and potential costs, run `npm run deploy:fly`. The script creates the configured app in the personal organization if it does not exist, then builds and deploys it. The app will be served at `https://brukina-marketplace-ttwezetyljpvtdlvgyxr.fly.dev` if that Fly app name is available.

To deploy from GitHub Actions, add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and an app-scoped Fly deploy token as Actions secrets available to the workflow (`FLY_API_TOKEN`). The workflow targets the existing app directly when using this restricted token. Run **Actions → Deploy Brukina Marketplace to Fly.io → Run workflow** to publish.

The Fly app and its `fly.dev` hostname are separate from the existing Netlify site and custom domains. Pointing a custom domain to Fly requires your DNS access and certificate configuration. The deploy only publishes the frontend; configure Supabase Auth redirect URLs and separately deploy its migrations/functions and provider secrets before enabling production checkout or social/SMS authentication.
