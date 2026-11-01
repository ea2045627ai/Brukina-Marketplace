#!/usr/bin/env bash
set -euo pipefail

repo="ea2045627ai/Brukina-Marketplace"
environment="production"
secrets=(
  SUPABASE_ACCESS_TOKEN
  PAYSTACK_SECRET_KEY
  ARKESEL_API_KEY
  ARKESEL_WEBHOOK_SECRET
)

if ! command -v gh >/dev/null 2>&1; then
  printf 'GitHub CLI (gh) is required. Install it and retry.\n' >&2
  exit 1
fi

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  printf 'Authenticate GitHub CLI first with: gh auth login --hostname github.com\n' >&2
  exit 1
fi

if ! gh api "repos/$repo/environments/$environment" >/dev/null; then
  printf 'Could not access the %s environment in %s.\n' "$environment" "$repo" >&2
  exit 1
fi

printf 'Enter fresh provider-issued values at the hidden prompts. Values are sent directly to GitHub and are not displayed.\n'

for name in "${secrets[@]}"; do
  IFS= read -r -s -p "$name: " value || {
    printf '\nInput cancelled.\n' >&2
    exit 1
  }
  printf '\n'
  if [[ -z "$value" ]]; then
    printf '%s cannot be empty.\n' "$name" >&2
    exit 1
  fi
  printf '%s' "$value" |
    gh secret set "$name" --env "$environment" --repo "$repo"
  unset value
  printf 'Stored %s in the %s environment.\n' "$name" "$environment"
done

printf '\nRequired secret names now configured:\n'
gh secret list --env "$environment" --repo "$repo"

read -r -p 'Dispatch the Supabase backend deployment workflow now? [y/N] ' dispatch
if [[ "$dispatch" =~ ^[Yy]$ ]]; then
  gh workflow run deploy-supabase.yml --repo "$repo"
  printf 'Deployment workflow dispatched. Check it with:\n'
  printf 'gh run list --repo %s --workflow deploy-supabase.yml --limit 3\n' "$repo"
else
  printf 'Secrets saved; deployment was not started.\n'
fi
