#!/usr/bin/env bash
set -euo pipefail

export SUPABASE_PROJECT_REF="ttwezetyljpvtdlvgyxr"
export APP_BUILD_DIR="./dist"

echo "=== BRUKINA PRODUCTION DEPLOYMENT ==="
if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN must be exported locally before running this deployment script." >&2
  exit 1
fi

echo "Linking Supabase project ${SUPABASE_PROJECT_REF}..."
npx supabase link --project-ref "${SUPABASE_PROJECT_REF}"

echo "Deploying Arkesel callback..."
npx supabase functions deploy arkesel-payment-callback --project-ref "${SUPABASE_PROJECT_REF}"

echo "This will apply all pending migrations to the linked Supabase project."
read -r -p "Type APPLY ${SUPABASE_PROJECT_REF} to continue with the production database migration: " confirmation
if [[ "${confirmation}" != "APPLY ${SUPABASE_PROJECT_REF}" ]]; then
  echo "Database migration cancelled." >&2
  exit 1
fi

echo "Applying production database migrations..."
npx supabase db push --project-ref "${SUPABASE_PROJECT_REF}"

echo "=== APPLICATION BUILD SYNCHRONIZATION ==="
npm run build

echo "SUCCESS: Deployment commands and application build completed."
