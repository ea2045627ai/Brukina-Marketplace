/*
# Brukina Marketplace Core Schema

Creates the foundational tables for the Brukina Marketplace PWA:
- user_profiles: stores full name, role, territory, verification status
- global_vendors: vendor business records with tier and verification
- marketplace_categories: product categories (Building materials, Tools, Devices, etc.)
- marketplace_inventory: product listings with price, stock, source, images
- orders: customer orders with status tracking
- order_items: line items per order
- deliveries: delivery tracking with coordinates and ETA
- wallets: user wallet balances (available + escrow)
- wallet_transactions: ledger of wallet activity

Security:
- RLS enabled on all tables
- Owner-scoped policies using auth.uid()
- Admin helper function is_admin() checks app_metadata role
- Public read on active inventory and verified vendors
- Owner-only writes on profiles, vendors, orders, wallets

Notes:
- Admin roles granted server-side via app_metadata
- Financial ledger entries are trusted writes (admin/service role only)
- Email/password auth with roles: customer, vendor, driver, rider, admin
*/

create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'customer' check (role in ('customer', 'vendor', 'driver', 'rider', 'admin')),
  territory text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  document_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.global_vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  category text not null,
  territory text not null,
  vendor_tier text,
  vehicle_type text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  document_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_inventory (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.global_vendors(id) on delete set null,
  product_name text not null,
  vendor_name text not null,
  category text not null default 'General',
  category_id uuid references public.marketplace_categories(id) on delete set null,
  sku text,
  brand text,
  description text,
  source_channel text not null default 'direct_vendor' check (source_channel in ('direct_vendor', 'leeknives', 'shopify', 'made_in_china', 'american_brand', 'sourcing_network')),
  source_country text,
  unit text not null default 'unit',
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  minimum_order_quantity integer not null default 1 check (minimum_order_quantity > 0),
  fulfillment_type text not null default 'local_stock' check (fulfillment_type in ('local_stock', 'preorder', 'imported', 'dropship')),
  lead_time_days integer check (lead_time_days >= 0),
  marketplace_url text,
  featured boolean not null default false,
  price numeric(12,2) not null check (price >= 0),
  price_display text,
  badge text not null default 'TRADE PRICE',
  image_url text,
  paystack_checkout_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  customer_id uuid not null references auth.users(id) on delete restrict,
  vendor_id uuid references public.global_vendors(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled')),
  total numeric(12,2) not null default 0 check (total >= 0),
  delivery_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_id uuid not null references public.marketplace_inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references public.orders(id) on delete cascade,
  rider_id uuid references auth.users(id) on delete set null,
  status text not null default 'unassigned' check (status in ('unassigned', 'assigned', 'picked_up', 'in_transit', 'delivered')),
  pickup_lat numeric,
  pickup_lng numeric,
  dropoff_lat numeric,
  dropoff_lng numeric,
  eta_minutes integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  escrow_balance numeric(12,2) not null default 0 check (escrow_balance >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  amount numeric(12,2) not null,
  transaction_type text not null check (transaction_type in ('deposit', 'payment', 'settlement', 'withdrawal')),
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_active_idx on public.marketplace_inventory(active, category);
create index if not exists inventory_source_idx on public.marketplace_inventory(source_channel, source_country);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists vendors_owner_idx on public.global_vendors(owner_id);
create index if not exists deliveries_rider_idx on public.deliveries(rider_id, status);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false) $$;

alter table public.user_profiles enable row level security;
alter table public.marketplace_categories enable row level security;
alter table public.global_vendors enable row level security;
alter table public.marketplace_inventory enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.deliveries enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists "profiles own read" on public.user_profiles;
create policy "profiles own read" on public.user_profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles own insert" on public.user_profiles;
create policy "profiles own insert" on public.user_profiles for insert with check (auth.uid() = id and role <> 'admin');
drop policy if exists "profiles own update" on public.user_profiles;
create policy "profiles own update" on public.user_profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

drop policy if exists "categories public active read" on public.marketplace_categories;
create policy "categories public active read" on public.marketplace_categories for select using (active = true or public.is_admin());
drop policy if exists "categories admin write" on public.marketplace_categories;
create policy "categories admin write" on public.marketplace_categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "vendors public read verified" on public.global_vendors;
create policy "vendors public read verified" on public.global_vendors for select using (verification_status = 'verified' or auth.uid() = owner_id or public.is_admin());
drop policy if exists "vendors own insert" on public.global_vendors;
create policy "vendors own insert" on public.global_vendors for insert with check (auth.uid() = owner_id and public.is_admin() = false);
drop policy if exists "vendors own update" on public.global_vendors;
create policy "vendors own update" on public.global_vendors for update using (auth.uid() = owner_id or public.is_admin()) with check (auth.uid() = owner_id or public.is_admin());

drop policy if exists "inventory public active read" on public.marketplace_inventory;
create policy "inventory public active read" on public.marketplace_inventory for select using (active = true or public.is_admin());
drop policy if exists "inventory vendor manage" on public.marketplace_inventory;
create policy "inventory vendor manage" on public.marketplace_inventory for all using (public.is_admin() or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid())) with check (public.is_admin() or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid()));

drop policy if exists "orders participants read" on public.orders;
create policy "orders participants read" on public.orders for select using (customer_id = auth.uid() or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid()) or public.is_admin());
drop policy if exists "customers create orders" on public.orders;
create policy "customers create orders" on public.orders for insert with check (customer_id = auth.uid());
drop policy if exists "order operators update" on public.orders;
create policy "order operators update" on public.orders for update using (customer_id = auth.uid() or public.is_admin());

drop policy if exists "order items participants read" on public.order_items;
create policy "order items participants read" on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_admin())));

drop policy if exists "deliveries participants read" on public.deliveries;
create policy "deliveries participants read" on public.deliveries for select using (rider_id = auth.uid() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()) or public.is_admin());
drop policy if exists "delivery operators update" on public.deliveries;
create policy "delivery operators update" on public.deliveries for update using (rider_id = auth.uid() or public.is_admin());

drop policy if exists "wallet own read" on public.wallets;
create policy "wallet own read" on public.wallets for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "wallet transactions own read" on public.wallet_transactions;
create policy "wallet transactions own read" on public.wallet_transactions for select using (exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid()) or public.is_admin());

insert into public.marketplace_categories (name, description, sort_order)
values
  ('Building materials', 'Materials for construction, repair, and renovation', 10),
  ('Tools & equipment', 'Trade tools, workshop equipment, and machinery', 20),
  ('Devices & gadgets', 'Consumer electronics, power, and connected devices', 30),
  ('Accessories & body products', 'Personal care, accessories, and everyday essentials', 40),
  ('Clothing', 'Workwear, fashion, and apparel in different kinds', 50),
  ('Home & living', 'Fixtures, kitchen, home, and office goods', 60)
on conflict (name) do update set description = excluded.description, sort_order = excluded.sort_order;
/*
# Brukina Dispatch Providers and Backup Queue

Creates dispatch provider registry and fallback dispatch request queue:
- dispatch_providers: Bolt, Yango, Brukina Backup with availability and priority
- dispatch_requests: customer dispatch requests with status tracking

Security:
- RLS enabled on both tables
- Public read on dispatch_providers (health status is public)
- Admin-only writes on dispatch_providers
- Customer-scoped dispatch request creation and participant reads

Notes:
- Provider availability controlled by trusted admin/server jobs
- Bolt and Yango start unavailable; Brukina Backup is the default fallback
*/

create table if not exists public.dispatch_providers (
  id uuid primary key default gen_random_uuid(),
  provider_code text unique not null check (provider_code in ('bolt', 'yango', 'brukina_backup')),
  display_name text not null,
  enabled boolean not null default true,
  available boolean not null default false,
  priority integer not null default 100,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dispatch_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid not null references auth.users(id) on delete cascade,
  rider_id uuid references auth.users(id) on delete set null,
  provider_id uuid not null references public.dispatch_providers(id) on delete restrict,
  status text not null default 'queued' check (status in ('queued', 'assigned', 'picked_up', 'in_transit', 'completed', 'cancelled', 'failed')),
  pickup_address text,
  dropoff_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_provider_health_idx on public.dispatch_providers(enabled, available, priority);
create index if not exists dispatch_queue_idx on public.dispatch_requests(status, created_at);

alter table public.dispatch_providers enable row level security;
alter table public.dispatch_requests enable row level security;

drop policy if exists "dispatch providers public health read" on public.dispatch_providers;
create policy "dispatch providers public health read" on public.dispatch_providers for select using (true);
drop policy if exists "dispatch providers admin write" on public.dispatch_providers;
create policy "dispatch providers admin write" on public.dispatch_providers for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "dispatch requests participant read" on public.dispatch_requests;
create policy "dispatch requests participant read" on public.dispatch_requests for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());
drop policy if exists "dispatch requests customer create" on public.dispatch_requests;
create policy "dispatch requests customer create" on public.dispatch_requests for insert with check (customer_id = auth.uid());
drop policy if exists "dispatch requests operator update" on public.dispatch_requests;
create policy "dispatch requests operator update" on public.dispatch_requests for update using (rider_id = auth.uid() or public.is_admin()) with check (rider_id = auth.uid() or public.is_admin());

insert into public.dispatch_providers (provider_code, display_name, enabled, available, priority)
values
  ('bolt', 'Bolt', true, false, 10),
  ('yango', 'Yango', true, false, 20),
  ('brukina_backup', 'Brukina Backup', true, true, 100)
on conflict (provider_code) do update set display_name = excluded.display_name;
/*
# Brukina Local Operations Tables

Creates local vendor, courier, and cashflow tracking tables:
- local_vendors: local business records with locality and verification
- local_couriers: rider/driver records with online status and live coordinates
- cashflow_entries: financial ledger entries for sales, fees, payouts, deposits

Security:
- RLS enabled on all tables
- Public read on verified local vendors and online verified couriers
- Owner-scoped writes on vendor and courier profiles
- Owner-scoped reads on cashflow; admin-only inserts (trusted writes)

Notes:
- Cashflow entries must be created by admin or server-side payment/operations worker
- Courier online status and coordinates are updated by the rider/driver app
*/

create table if not exists public.local_vendors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  category text not null,
  locality text not null,
  phone text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.local_couriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  courier_type text not null check (courier_type in ('rider', 'driver')),
  full_name text not null,
  vehicle_type text not null,
  locality text not null,
  phone text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'rejected')),
  is_online boolean not null default false,
  current_lat numeric,
  current_lng numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.cashflow_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  dispatch_request_id uuid references public.dispatch_requests(id) on delete set null,
  direction text not null check (direction in ('inflow', 'outflow')),
  entry_type text not null check (entry_type in ('sale', 'purchase', 'delivery_fee', 'commission', 'payout', 'refund', 'deposit', 'withdrawal')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GHS' check (currency = 'GHS'),
  status text not null default 'pending' check (status in ('pending', 'settled', 'failed', 'reversed')),
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists local_vendor_location_idx on public.local_vendors(locality, is_active);
create index if not exists local_courier_dispatch_idx on public.local_couriers(courier_type, locality, is_online);
create index if not exists cashflow_user_date_idx on public.cashflow_entries(user_id, created_at desc);

alter table public.local_vendors enable row level security;
alter table public.local_couriers enable row level security;
alter table public.cashflow_entries enable row level security;

drop policy if exists "local vendors public verified read" on public.local_vendors;
create policy "local vendors public verified read" on public.local_vendors for select using (verification_status = 'verified' or owner_id = auth.uid() or public.is_admin());
drop policy if exists "local vendors owner write" on public.local_vendors;
create policy "local vendors owner write" on public.local_vendors for all using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists "local couriers dispatch read" on public.local_couriers;
create policy "local couriers dispatch read" on public.local_couriers for select using (verification_status = 'verified' and is_online = true or user_id = auth.uid() or public.is_admin());
drop policy if exists "local couriers owner write" on public.local_couriers;
create policy "local couriers owner write" on public.local_couriers for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "cashflow owner read" on public.cashflow_entries;
create policy "cashflow owner read" on public.cashflow_entries for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "cashflow trusted write" on public.cashflow_entries;
create policy "cashflow trusted write" on public.cashflow_entries for insert with check (public.is_admin());
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
/*
# Brukina Production Support and AI Assistant Foundation

Creates support preference, callback, and conversation tables:
- support_preferences: per-user language, voice, phone, and consent settings
- support_callback_requests: queued callback requests with status tracking
- support_conversations: web/phone conversation transcripts with language

Security:
- RLS enabled on all tables
- Owner-scoped access on preferences and conversations
- Callback: owner create, owner read, admin update
- All tables allow admin access via is_admin()

Notes:
- Phone/AI providers must be configured in a trusted server environment
- Telephony credentials and model keys must never be placed in app.js
- Language options: English, Twi/Akan, Ewe, Ga, Hausa, Swahili, French, Portuguese
*/

create table if not exists public.support_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_language text not null default 'en-GH',
  voice_enabled boolean not null default true,
  phone_number text,
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_callback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  phone_number text not null,
  preferred_language text not null default 'en-GH',
  role text not null default 'customer' check (role in ('customer', 'vendor', 'driver', 'rider', 'admin')),
  topic text not null default 'marketplace support',
  status text not null default 'queued' check (status in ('queued', 'contacted', 'completed', 'cancelled', 'failed')),
  provider text,
  consent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  channel text not null check (channel in ('web_voice', 'web_text', 'phone')),
  language text not null default 'en-GH',
  transcript jsonb not null default '[]'::jsonb,
  provider text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists callback_queue_idx on public.support_callback_requests(status, created_at);
create index if not exists support_conversations_user_idx on public.support_conversations(user_id, started_at desc);

alter table public.support_preferences enable row level security;
alter table public.support_callback_requests enable row level security;
alter table public.support_conversations enable row level security;

drop policy if exists "support preferences own access" on public.support_preferences;
create policy "support preferences own access" on public.support_preferences for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "callback own create" on public.support_callback_requests;
create policy "callback own create" on public.support_callback_requests for insert with check (auth.uid() = user_id or user_id is null);
drop policy if exists "callback own read" on public.support_callback_requests;
create policy "callback own read" on public.support_callback_requests for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "callback admin update" on public.support_callback_requests;
create policy "callback admin update" on public.support_callback_requests for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "conversation own access" on public.support_conversations;
create policy "conversation own access" on public.support_conversations for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or user_id is null);
/*
# Brukina Marketplace Starter Inventory

Inserts the starter catalog products into marketplace_inventory with real product images.
These rows serve as the initial catalog shown to customers when the marketplace goes live.

Products:
1. Premium roofing sheets - Building materials
2. Leeknives utility knife set - Tools & equipment
3. Solar power station 600W - Devices & gadgets
4. USB-C fast charge kit - Accessories & body products
5. Unisex workwear overshirt - Clothing
6. Stainless kitchen tap - Home & living

Notes:
- All products start active=true for immediate visibility
- Prices in GHS (Ghanaian Cedi)
- Stock quantities set for wholesale availability
- Images sourced from Pexels (license-free stock photography)
*/

insert into public.marketplace_inventory (product_name, vendor_name, category, price, price_display, badge, image_url, source_channel, source_country, stock_quantity, minimum_order_quantity, active)
values
  ('Premium roofing sheets', 'Akosombo Materials', 'Building materials', 1850, 'GH₵ 1,850.00', 'WHOLESALE', 'https://images.pexels.com/photos/48895/roof-plate-tiles-brick-black-48895.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'direct_vendor', 'Ghana', 500, 1, true),
  ('Leeknives utility knife set', 'Leeknives Supply Co.', 'Tools & equipment', 420, 'GH₵ 420.00', 'TRADE PRICE', 'https://images.pexels.com/photos/237997/pexels-photo-237997.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'american_brand', 'USA', 200, 1, true),
  ('Solar power station 600W', 'BrightGrid Devices', 'Devices & gadgets', 3280, 'GH₵ 3,280.00', 'BEST VALUE', 'https://images.pexels.com/photos/9799719/pexels-photo-9799719.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'shopify', 'Global', 150, 1, true),
  ('USB-C fast charge kit', 'Northstar Accessories', 'Accessories & body products', 185, 'GH₵ 185.00', 'BULK DEAL', 'https://images.pexels.com/photos/3921707/pexels-photo-3921707.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'american_brand', 'USA', 1000, 1, true),
  ('Unisex workwear overshirt', 'Common Thread Co.', 'Clothing', 290, 'GH₵ 290.00', 'NEW ARRIVAL', 'https://images.pexels.com/photos/4483944/pexels-photo-4483944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'sourcing_network', 'Ghana', 300, 1, true),
  ('Stainless kitchen tap', 'Homeform Trade', 'Home & living', 610, 'GH₵ 610.00', 'CONTAINER RATE', 'https://images.pexels.com/photos/37771020/pexels-photo-37771020.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'made_in_china', 'China', 400, 1, true)
on conflict (id) do nothing;
-- BRUKINA ACCRA HUB - FOUNDATIONAL SCHEMA MIGRATION SCRIPT
-- Path: supabase/schema.sql
-- Run this core file first to initialize structural tables and RLS boundaries error-free.

CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  icon VARCHAR(10) DEFAULT '📦',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_categories" ON public.product_categories;
CREATE POLICY "anon_read_categories" ON public.product_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_categories" ON public.product_categories;
CREATE POLICY "auth_insert_categories" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_categories" ON public.product_categories;
CREATE POLICY "auth_update_categories" ON public.product_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.product_categories (name, icon) VALUES
  ('Food & Beverage', '🥛'), ('Kitchenware', '🍳'), ('Cosmetics', '🧴')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_type VARCHAR(50) DEFAULT 'platform_admin',
  target_buyer_type VARCHAR(50) DEFAULT 'everyone',
  channel_source VARCHAR(50) DEFAULT 'native_platform',
  external_variant_id VARCHAR(200),
  category VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  brand_origin VARCHAR(100) DEFAULT 'Brukina Core',
  price NUMERIC(12,2) DEFAULT 0.00,
  vendor_base_retail_price NUMERIC(12,2) DEFAULT 0.00,
  stock_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_products" ON public.products;
CREATE POLICY "anon_read_products" ON public.products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_products" ON public.products;
CREATE POLICY "auth_insert_products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_products" ON public.products;
CREATE POLICY "auth_update_products" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_products" ON public.products;
CREATE POLICY "auth_delete_products" ON public.products FOR DELETE TO authenticated USING (true);

INSERT INTO public.products (category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT 'Food & Beverage', 'Premium Millet Brukina Mix (Wholesale Case)', 'Premium quality millet brukina mix. 24-pack wholesale case.', 'Brukina Core Factory', 480.00, 400.00, 50
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Premium Millet Brukina Mix (Wholesale Case)');

INSERT INTO public.products (category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT 'Kitchenware', 'Stainless Steel Cookware Set (5-Piece)', 'Professional grade stainless steel cookware set.', 'Accra Steel Works', 320.00, 280.00, 30
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Stainless Steel Cookware Set (5-Piece)');

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity INT DEFAULT 1,
  total_amount NUMERIC(12,2) DEFAULT 0.00,
  delivery_fee NUMERIC(12,2) DEFAULT 0.00,
  order_status VARCHAR(50) DEFAULT 'Processing',
  channel_origin VARCHAR(50) DEFAULT 'native_platform',
  pickup_zone VARCHAR(200),
  dropoff_zone VARCHAR(200),
  calculated_distance_km NUMERIC(8,2),
  selected_delivery_fleet VARCHAR(50) DEFAULT 'native_fleet',
  current_latitude NUMERIC(10,6),
  current_longitude NUMERIC(10,6),
  estimated_minutes_eta INT,
  navigation_step_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;
CREATE POLICY "anon_read_orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
CREATE POLICY "auth_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;
CREATE POLICY "auth_update_orders" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_messages" ON public.order_messages;
CREATE POLICY "auth_read_messages" ON public.order_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_messages" ON public.order_messages;
CREATE POLICY "auth_insert_messages" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

CREATE TABLE IF NOT EXISTS public.rider_logistics_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_earned_ghs NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_market_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  millet_inflation_factor NUMERIC(4,2) DEFAULT 1.00,
  dairy_inflation_factor NUMERIC(4,2) DEFAULT 1.00,
  active_partnership_discount_pct NUMERIC(4,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_fleet_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_code VARCHAR(50) UNIQUE NOT NULL,
  base_fare_ghs NUMERIC(8,2) NOT NULL,
  per_km_multiplier NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_source VARCHAR(100) NOT NULL,
  endpoint_url TEXT NOT NULL,
  status_code VARCHAR(10) NOT NULL,
  payload_dump TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.applied_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name VARCHAR(250) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_backups_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_file_name VARCHAR(250) NOT NULL,
  total_tables_archived INT NOT NULL,
  status VARCHAR(50) DEFAULT 'Success',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rider_logistics_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_market_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_fleet_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_backups_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_logistics" ON public.rider_logistics_wallets;
CREATE POLICY "allow_all_logistics" ON public.rider_logistics_wallets FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_indexes" ON public.platform_market_indexes;
CREATE POLICY "allow_all_indexes" ON public.platform_market_indexes FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_tariffs" ON public.delivery_fleet_tariffs;
CREATE POLICY "allow_all_tariffs" ON public.delivery_fleet_tariffs FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_api_logs" ON public.external_api_logs;
CREATE POLICY "allow_all_api_logs" ON public.external_api_logs FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_migrations" ON public.applied_migrations;
CREATE POLICY "allow_all_migrations" ON public.applied_migrations FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_backups" ON public.platform_backups_log;
CREATE POLICY "allow_all_backups" ON public.platform_backups_log FOR ALL TO authenticated USING (true);
