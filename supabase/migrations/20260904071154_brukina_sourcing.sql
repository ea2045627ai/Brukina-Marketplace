/*
# Brukina Sourcing and Brand Partner Registry

Creates sourcing request and vendor quote tables:
- marketplace_sources: verified brand/channel/supplier registry (Leeknives, Shopify, Made-in-China, American brands, local vendors)
- sourcing_requests: buyer wholesale requests with quantity, budget, and territory
- sourcing_quotes: vendor quotes against sourcing requests with unit price and lead time

Security:
- RLS enabled on all tables
- Public read on verified/active sources; admin-only writes
- Sourcing requests: owner read, verified vendor open-request read, owner create/update
- Sourcing quotes: participant read (requester + vendor), verified vendor create, participant update

Notes:
- External brand credentials (Shopify, Made-in-China, Leeknives, American brands) must be handled server-side
- The starter catalog is an outage fallback when live inventory query fails
*/

create table if not exists public.marketplace_sources (
  id uuid primary key default gen_random_uuid(),
  source_code text unique not null check (source_code in ('leeknives', 'shopify', 'made_in_china', 'american_brand', 'local_vendor')),
  display_name text not null,
  source_kind text not null check (source_kind in ('brand', 'channel', 'supplier_network')),
  website_url text,
  contact_email text,
  verified boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sourcing_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_number text unique not null,
  title text not null,
  description text,
  category text not null,
  preferred_source text,
  quantity integer not null default 1 check (quantity > 0),
  target_budget numeric(12,2) check (target_budget >= 0),
  currency text not null default 'GHS' check (currency = 'GHS'),
  delivery_territory text not null,
  status text not null default 'open' check (status in ('open', 'quoted', 'accepted', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sourcing_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.sourcing_requests(id) on delete cascade,
  vendor_id uuid not null references public.global_vendors(id) on delete cascade,
  source_id uuid references public.marketplace_sources(id) on delete set null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  shipping_fee numeric(12,2) not null default 0 check (shipping_fee >= 0),
  lead_time_days integer not null check (lead_time_days >= 0),
  notes text,
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now()
);

create index if not exists sourcing_requests_owner_idx on public.sourcing_requests(requester_id, created_at desc);
create index if not exists sourcing_requests_status_idx on public.sourcing_requests(status, category);
create index if not exists sourcing_quotes_request_idx on public.sourcing_quotes(request_id, created_at desc);

alter table public.marketplace_sources enable row level security;
alter table public.sourcing_requests enable row level security;
alter table public.sourcing_quotes enable row level security;

drop policy if exists "sources public verified read" on public.marketplace_sources;
create policy "sources public verified read" on public.marketplace_sources for select using ((active = true and verified = true) or public.is_admin());
drop policy if exists "sources admin write" on public.marketplace_sources;
create policy "sources admin write" on public.marketplace_sources for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sourcing requests owner read" on public.sourcing_requests;
create policy "sourcing requests owner read" on public.sourcing_requests for select using (
  requester_id = auth.uid()
  or public.is_admin()
  or (status = 'open' and exists (
    select 1 from public.global_vendors v
    where v.owner_id = auth.uid() and v.verification_status = 'verified'
  ))
);
drop policy if exists "sourcing requests owner create" on public.sourcing_requests;
create policy "sourcing requests owner create" on public.sourcing_requests for insert with check (requester_id = auth.uid());
drop policy if exists "sourcing requests owner update" on public.sourcing_requests;
create policy "sourcing requests owner update" on public.sourcing_requests for update using (requester_id = auth.uid() or public.is_admin()) with check (requester_id = auth.uid() or public.is_admin());

drop policy if exists "sourcing quotes participants read" on public.sourcing_quotes;
create policy "sourcing quotes participants read" on public.sourcing_quotes for select using (
  public.is_admin()
  or exists (select 1 from public.sourcing_requests r where r.id = request_id and r.requester_id = auth.uid())
  or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid())
);
drop policy if exists "sourcing quotes verified vendor create" on public.sourcing_quotes;
create policy "sourcing quotes verified vendor create" on public.sourcing_quotes for insert with check (
  exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid() and v.verification_status = 'verified')
);
drop policy if exists "sourcing quotes participants update" on public.sourcing_quotes;
create policy "sourcing quotes participants update" on public.sourcing_quotes for update using (
  public.is_admin()
  or exists (select 1 from public.sourcing_requests r where r.id = request_id and r.requester_id = auth.uid())
  or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid())
) with check (
  public.is_admin()
  or exists (select 1 from public.sourcing_requests r where r.id = request_id and r.requester_id = auth.uid())
  or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid())
);

insert into public.marketplace_sources (source_code, display_name, source_kind, verified, active, notes)
values
  ('leeknives', 'Leeknives', 'brand', false, true, 'Brand partner connection pending verification'),
  ('shopify', 'Shopify partner stores', 'channel', false, true, 'Import approved partner catalogues through a server-side connector'),
  ('made_in_china', 'Made-in-China suppliers', 'supplier_network', false, true, 'Import verified supplier offers and lead times'),
  ('american_brand', 'American market brands', 'brand', false, true, 'Approved American brands and authorized distributors'),
  ('local_vendor', 'Brukina local vendors', 'supplier_network', true, true, 'Verified vendors selling from local stock')
on conflict (source_code) do update set display_name = excluded.display_name, notes = excluded.notes;
