#!/usr/bin/env bash
set -euo pipefail

export TARGET_PROJECT_REFERENCE="ttwezetyljpvtdlvgyxr"
export APP_BUILD_OUTPUT_DIRECTORY="./dist"
export ARKESEL_SENDER_ID="${ARKESEL_SENDER_ID:-BrukinaHub}"
export APP_ORIGIN="${APP_ORIGIN:-https://brukina-marketplace-ttwezetyljpvtdlvgyxr.fly.dev}"

fail() {
  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

require_secret() {
  local name="$1"
  local value="${!name:-}"

  if [[ -z "$value" ]]; then
    fail "$name must be configured in the environment."
  fi
  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    fail "$name must not contain newline characters."
  fi
  case "${value,,}" in
    your_*|paste_*|*_placeholder*|placeholder*)
      fail "$name contains a placeholder value."
      ;;
  esac
}

printf '%s\n' '=== BRUKINA MARKETHUB PRODUCTION DEPLOYMENT ==='

for required_name in \
  SUPABASE_ACCESS_TOKEN \
  ARKESEL_API_KEY \
  ARKESEL_WEBHOOK_SECRET \
  SMS_INTERNAL_SECRET \
  PAYSTACK_SECRET_KEY \
  APP_ORIGIN
do
  require_secret "$required_name"
done

if ! node -e '
  const url = new URL(process.argv[1]);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) process.exit(1);
' "$APP_ORIGIN"; then
  fail "APP_ORIGIN must be an HTTPS origin without a path, query, or fragment."
fi

printf '%s\n' '=== BUILDING AND CHECKING LOCAL APPLICATION ==='
npm run build
for asset in \
  "$APP_BUILD_OUTPUT_DIRECTORY/index.html" \
  "$APP_BUILD_OUTPUT_DIRECTORY/manifest.webmanifest" \
  "$APP_BUILD_OUTPUT_DIRECTORY/sw.js" \
  "$APP_BUILD_OUTPUT_DIRECTORY/icon.svg" \
  "$APP_BUILD_OUTPUT_DIRECTORY/icon-192.png" \
  "$APP_BUILD_OUTPUT_DIRECTORY/icon-512.png"
do
  [[ -s "$asset" ]] || fail "Required build asset is missing or empty: $asset"
done

printf 'Linking Supabase project %s...\n' "$TARGET_PROJECT_REFERENCE"
npx --yes supabase@latest link --project-ref "$TARGET_PROJECT_REFERENCE"

secrets_file="$(mktemp "${TMPDIR:-/tmp}/brukina-supabase-secrets.XXXXXX")"
chmod 600 "$secrets_file"
trap 'rm -f -- "$secrets_file"' EXIT
umask 077
{
  printf 'ARKESEL_API_KEY=%s\n' "$ARKESEL_API_KEY"
  printf 'ARKESEL_WEBHOOK_SECRET=%s\n' "$ARKESEL_WEBHOOK_SECRET"
  printf 'SMS_INTERNAL_SECRET=%s\n' "$SMS_INTERNAL_SECRET"
  printf 'PAYSTACK_SECRET_KEY=%s\n' "$PAYSTACK_SECRET_KEY"
  printf 'APP_ORIGIN=%s\n' "$APP_ORIGIN"
  printf 'ARKESEL_SENDER_ID=%s\n' "$ARKESEL_SENDER_ID"
} >"$secrets_file"

printf '%s\n' 'Uploading required server secrets to Supabase...'
npx --yes supabase@latest secrets set \
  --project-ref "$TARGET_PROJECT_REFERENCE" \
  --env-file "$secrets_file"

printf '\n%s\n' 'PRODUCTION DATABASE SAFETY CHECK'
read -r -p "Type APPLY ${TARGET_PROJECT_REFERENCE} to authorize database migrations: " confirmation_token
if [[ "$confirmation_token" != "APPLY ${TARGET_PROJECT_REFERENCE}" ]]; then
  fail "Database migration authorization did not match; no migration or function deployment was performed."
fi

printf '%s\n' 'Applying database migrations...'
npx --yes supabase@latest db push --project-ref "$TARGET_PROJECT_REFERENCE" --yes

printf '%s\n' 'Deploying checkout, payment callback, and SMS functions...'
npx --yes supabase@latest functions deploy marketplace-checkout \
  --project-ref "$TARGET_PROJECT_REFERENCE" \
  --no-verify-jwt
npx --yes supabase@latest functions deploy arkesel-payment-callback \
  --project-ref "$TARGET_PROJECT_REFERENCE" \
  --no-verify-jwt
npx --yes supabase@latest functions deploy send-order-sms \
  --project-ref "$TARGET_PROJECT_REFERENCE" \
  --no-verify-jwt

printf '%s\n' '=== DEPLOYMENT COMMANDS COMPLETED ==='
