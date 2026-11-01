#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  printf 'Docker must be installed and running to start local Supabase staging.\n' >&2
  exit 1
fi

status_file="$(mktemp "${TMPDIR:-/tmp}/brukina-staging-status.XXXXXX")"
mock_env_file="$(mktemp "${TMPDIR:-/tmp}/brukina-staging-env.XXXXXX")"
chmod 600 "$status_file" "$mock_env_file"
functions_pid=""
vite_pid=""
started_supabase=0

cleanup() {
  result=$?
  trap - EXIT INT TERM
  if [[ -n "$vite_pid" ]]; then
    kill "$vite_pid" 2>/dev/null || true
    wait "$vite_pid" 2>/dev/null || true
  fi
  if [[ -n "$functions_pid" ]]; then
    kill "$functions_pid" 2>/dev/null || true
    wait "$functions_pid" 2>/dev/null || true
  fi
  rm -f -- "$status_file" "$mock_env_file"
  if (( started_supabase )); then
    npx --yes supabase@latest stop --workdir "$repo_root" >/dev/null
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! npx --yes supabase@latest status --workdir "$repo_root" --output env >"$status_file" 2>/dev/null; then
  printf 'Starting an isolated local Supabase stack. No remote project is used.\n'
  npx --yes supabase@latest start --workdir "$repo_root"
  started_supabase=1
  npx --yes supabase@latest status --workdir "$repo_root" --output env >"$status_file"
fi

read_status_value() {
  awk -F= -v name="$1" '
    $1 == name {
      sub(/^[^=]*=/, "")
      if ($0 ~ /^".*"$/) {
        sub(/^"/, "")
        sub(/"$/, "")
      }
      print
      exit
    }
  ' "$status_file"
}

supabase_url="$(read_status_value API_URL)"
supabase_anon_key="$(read_status_value ANON_KEY)"
if [[ -z "$supabase_url" || -z "$supabase_anon_key" ]]; then
  printf 'Could not read the local Supabase API URL and anon key from CLI status.\n' >&2
  exit 1
fi

printf 'APP_ORIGIN=http://127.0.0.1:5173\n' >"$mock_env_file"

npx --yes supabase@latest functions serve staging-mock-services \
  --workdir "$repo_root" \
  --env-file "$mock_env_file" &
functions_pid=$!

function_status=""
for _ in {1..90}; do
  function_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --request OPTIONS \
    --header 'Origin: http://127.0.0.1:5173' \
    --header "apikey: $supabase_anon_key" \
    "$supabase_url/functions/v1/staging-mock-services" || true)"
  if [[ "$function_status" == "204" ]]; then
    break
  fi
  if ! kill -0 "$functions_pid" 2>/dev/null; then
    printf 'The local mock function server stopped before it became ready.\n' >&2
    exit 1
  fi
  sleep 1
done

if [[ "$function_status" != "204" ]]; then
  printf 'Local mock function did not become ready (HTTP %s).\n' "${function_status:-000}" >&2
  exit 1
fi

printf 'Local staging is ready at http://127.0.0.1:5173\n'
printf 'Only staging-mock-services is served; payment stays pending and SMS is simulated, never sent.\n'
printf 'Press Ctrl+C to stop the local staging servers.\n'
VITE_SUPABASE_URL="$supabase_url" \
VITE_SUPABASE_ANON_KEY="$supabase_anon_key" \
VITE_PAYMENT_MODE=mock \
  npm run dev -- --host 127.0.0.1 &
vite_pid=$!

wait -n "$functions_pid" "$vite_pid"
