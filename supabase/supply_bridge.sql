-- Secure sourcing request bridge. Run after sourcing.sql.
-- Requires Supabase's pg_net and Vault extensions.
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.route_to_supply_partners()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  bridge_url text;
  request_id bigint;
begin
  select decrypted_secret into bridge_url
  from vault.decrypted_secrets
  where name = 'supply_bridge_url'
  limit 1;

  if bridge_url is null or bridge_url !~ '^https://[^/]+/\.netlify/functions/supply-bridge$' then
    raise exception 'Supply bridge URL is missing or invalid; store the Netlify function URL in Vault as supply_bridge_url';
  end if;

  select net.http_post(
    url := bridge_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'table', tg_table_name,
      'type', tg_op,
      'record', to_jsonb(new)
    )
  ) into request_id;

  return new;
end;
$$;

drop trigger if exists tr_sourcing_request_insert on public.sourcing_requests;
create trigger tr_sourcing_request_insert
after insert on public.sourcing_requests
for each row execute function public.route_to_supply_partners();

revoke all on function public.route_to_supply_partners() from public;

-- One-time setup in the Supabase SQL editor, replacing the URL with your site:
-- select vault.create_secret(
--   'https://YOUR-SITE.netlify.app/.netlify/functions/supply-bridge',
--   'supply_bridge_url',
--   'Brukina sourcing bridge endpoint'
-- );
