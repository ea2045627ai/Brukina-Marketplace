# Authentication setup

The market hub supports email/password, Google OAuth, Apple OAuth, and phone/SMS OTP through Supabase Auth. All successful sign-ins return to the application root on the same origin. The browser client uses the PKCE flow and Supabase's URL session detection.

## Application configuration

1. Use `.env.example` as a template and add any missing variables to `.env.local` for local development; preserve existing local settings.
2. Set `VITE_SUPABASE_URL` to the Supabase project URL and `VITE_SUPABASE_ANON_KEY` to its publishable/anon key. These browser values are public; never put a service-role key in a `VITE_` variable.
3. Configure the same two variables in the hosting platform's build environment.
4. The current production origin is `https://brukina-marketplace-ttwezetyljpvtdlvgyxr.fly.dev`. Set it as the Supabase Site URL and add it to the redirect allow-list. The deployment script uses this origin by default; override `APP_ORIGIN` only when using a different production domain. The provided text `brukinaMarkethub` is not a valid URL, so it cannot be activated as a redirect origin.

## Supabase Auth dashboard

1. Apply the project migrations (`npx supabase link --project-ref <project-ref>` and `npx supabase db push`). The inventory policy migration removes obsolete broad policies while retaining public reads for active inventory and scoped vendor access.
2. In **Authentication → URL Configuration**, set **Site URL** to the real production origin. Add that origin and the local development origin (normally `http://localhost:5173`) to **Redirect URLs**. Do not use wildcard production redirects.
3. Enable email signup and configure email confirmation/SMTP. The email callback returns to the application root.
4. Enable Google and Apple in **Authentication → Sign In / Providers**. Register each provider's Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) in that provider's console, then enter its client ID and secret in Supabase's provider settings. Keep secrets in provider dashboards, not this repository.
5. Enable phone authentication and configure the SMS delivery provider or a Supabase Auth **Send SMS Hook** for the custom SMS provider. Store hook/provider credentials in Supabase secrets. The existing Arkesel order-notification function is not the Auth OTP delivery integration.
6. Configure provider-side redirect/callback URLs and enable abuse protections (rate limits, CAPTCHA if required) before accepting production signups.

## Unified profiles and identity linking

`public.profiles.id` is a one-to-one foreign key to `auth.users.id`. A database trigger creates or synchronizes the profile when an Auth user is inserted or their email, phone, or provider metadata changes. Row-level security lets a signed-in user read their own profile and edit only `display_name` and `avatar_url`; email and phone should be changed through Supabase Auth.

The same Auth user retains one profile when Google or Apple is explicitly linked to that signed-in account. Do not merge accounts by trusting a client-supplied email or phone number. A user who signs in separately with an unlinked method may have a separate Auth user/profile; have them sign into their existing account and link the provider using the SDK:

```js
import { linkIdentityWithOAuth, linkPhoneWithOtp, verifyLinkedPhoneOtp } from './src/auth.js';

await linkIdentityWithOAuth('google'); // or 'apple'
await linkPhoneWithOtp('+233XXXXXXXXX');
await verifyLinkedPhoneOtp('+233XXXXXXXXX', codeFromSms);
```

The provider must be enabled in Supabase before linking. Phone linking requires an authenticated session and SMS verification.
