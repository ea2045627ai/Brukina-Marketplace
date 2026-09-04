-- BEGIN supabase/schema.sql
-- Brukina Marketplace database
-- Run this file in Supabase SQL Editor before using production data.

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

drop policy if exists "categories public active read" on public.marketplace_categories;
create policy "categories public active read" on public.marketplace_categories for select using (active = true or public.is_admin());
drop policy if exists "categories admin write" on public.marketplace_categories;
create policy "categories admin write" on public.marketplace_categories for all using (public.is_admin()) with check (public.is_admin());
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

create policy "orders participants read" on public.orders for select using (customer_id = auth.uid() or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid()) or public.is_admin());
create policy "customers create orders" on public.orders for insert with check (customer_id = auth.uid());
create policy "order operators update" on public.orders for update using (customer_id = auth.uid() or public.is_admin());
create policy "order items participants read" on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_admin())));
create policy "deliveries participants read" on public.deliveries for select using (rider_id = auth.uid() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()) or public.is_admin());
create policy "delivery operators update" on public.deliveries for update using (rider_id = auth.uid() or public.is_admin());
create policy "wallet own read" on public.wallets for select using (user_id = auth.uid() or public.is_admin());
create policy "wallet transactions own read" on public.wallet_transactions for select using (exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid()) or public.is_admin());

insert into public.marketplace_inventory (product_name, vendor_name, category, price, price_display, badge, image_url)
select 'Premium roofing sheets', 'Akosombo Materials', 'Material Dealership', 1850, 'GH₵ 1,850.00', 'WHOLESALE', 'icon.svg'
where not exists (select 1 from public.marketplace_inventory where product_name = 'Premium roofing sheets');

insert into public.marketplace_categories (name, description, sort_order)
values
  ('Building materials', 'Materials for construction, repair, and renovation', 10),
  ('Tools & equipment', 'Trade tools, workshop equipment, and machinery', 20),
  ('Devices & gadgets', 'Consumer electronics, power, and connected devices', 30),
  ('Accessories & body products', 'Personal care, accessories, and everyday essentials', 40),
  ('Clothing', 'Workwear, fashion, and apparel in different kinds', 50),
  ('Home & living', 'Fixtures, kitchen, home, and office goods', 60)
on conflict (name) do update set description = excluded.description, sort_order = excluded.sort_order;

-- Admin roles must be granted server-side with the service role:
-- update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb where email = 'admin@your-domain.com';
-- END supabase/schema.sql

-- BEGIN supabase/dispatch.sql
-- Brukina dispatch provider registry and fallback queue
-- Run after schema.sql. Provider availability is controlled by trusted admin/server jobs.

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

-- Only a trusted server/admin should update health:
-- update public.dispatch_providers set available = true, last_checked_at = now() where provider_code = 'bolt';
-- END supabase/dispatch.sql

-- BEGIN supabase/operations.sql
-- Local vendor, rider/driver, and cashflow operations
-- Run after schema.sql and dispatch.sql.

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

-- A production payment webhook should create settled cashflow entries with the service role.
-- END supabase/operations.sql

-- BEGIN supabase/sourcing.sql
-- Brukina sourcing and brand partner registry
-- Run after schema.sql, dispatch.sql, and operations.sql.

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

-- Keep source credentials and external API tokens server-side. Never store them in the browser.
-- END supabase/sourcing.sql

-- BEGIN supabase/production.sql
-- Production support and AI assistant foundation.
-- Run after schema.sql, dispatch.sql, operations.sql, and sourcing.sql.

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

-- Phone/AI providers must be configured in a trusted server environment.
-- Never put telephony credentials or model keys in app.js.
-- END supabase/production.sql

-- BEGIN supabase/complete_repair.sql
-- Brukina hosted-schema repair migration.
-- Run after schema.sql, dispatch.sql, operations.sql, sourcing.sql, and production.sql.
-- This is idempotent and fills tables missing from an incomplete Supabase deployment.

create extension if not exists pgcrypto;

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

create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists wallet_transactions_wallet_idx on public.wallet_transactions(wallet_id, created_at desc);
create index if not exists dispatch_queue_idx on public.dispatch_requests(status, created_at);
create index if not exists sourcing_quotes_request_idx on public.sourcing_quotes(request_id, created_at desc);
create index if not exists local_couriers_dispatch_idx on public.local_couriers(courier_type, locality, is_online);
create index if not exists callback_queue_idx on public.support_callback_requests(status, created_at);
create index if not exists support_conversations_user_idx on public.support_conversations(user_id, started_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.dispatch_requests enable row level security;
alter table public.sourcing_quotes enable row level security;
alter table public.local_couriers enable row level security;
alter table public.support_callback_requests enable row level security;
alter table public.support_conversations enable row level security;

-- Policies are recreated so this migration also repairs a partially applied schema.
drop policy if exists "orders participants read" on public.orders;
create policy "orders participants read" on public.orders for select using (customer_id = auth.uid() or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid()) or public.is_admin());
drop policy if exists "customers create orders" on public.orders;
create policy "customers create orders" on public.orders for insert with check (customer_id = auth.uid());
drop policy if exists "order items participants read" on public.order_items;
create policy "order items participants read" on public.order_items for select using (exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.is_admin())));
drop policy if exists "wallet own read" on public.wallets;
create policy "wallet own read" on public.wallets for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "wallet transactions own read" on public.wallet_transactions;
create policy "wallet transactions own read" on public.wallet_transactions for select using (exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid()) or public.is_admin());
drop policy if exists "dispatch requests participant read" on public.dispatch_requests;
create policy "dispatch requests participant read" on public.dispatch_requests for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());
drop policy if exists "dispatch requests customer create" on public.dispatch_requests;
create policy "dispatch requests customer create" on public.dispatch_requests for insert with check (customer_id = auth.uid());
drop policy if exists "sourcing quotes participants read" on public.sourcing_quotes;
create policy "sourcing quotes participants read" on public.sourcing_quotes for select using (public.is_admin() or exists (select 1 from public.sourcing_requests r where r.id = request_id and r.requester_id = auth.uid()) or exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid()));
drop policy if exists "sourcing quotes verified vendor create" on public.sourcing_quotes;
create policy "sourcing quotes verified vendor create" on public.sourcing_quotes for insert with check (exists (select 1 from public.global_vendors v where v.id = vendor_id and v.owner_id = auth.uid() and v.verification_status = 'verified'));
drop policy if exists "local couriers dispatch read" on public.local_couriers;
create policy "local couriers dispatch read" on public.local_couriers for select using ((verification_status = 'verified' and is_online = true) or user_id = auth.uid() or public.is_admin());
drop policy if exists "local couriers owner write" on public.local_couriers;
create policy "local couriers owner write" on public.local_couriers for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "callback own create" on public.support_callback_requests;
create policy "callback own create" on public.support_callback_requests for insert with check (auth.uid() = user_id or user_id is null);
drop policy if exists "callback own read" on public.support_callback_requests;
create policy "callback own read" on public.support_callback_requests for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "conversation own access" on public.support_conversations;
create policy "conversation own access" on public.support_conversations for all using (auth.uid() = user_id or public.is_admin()) with check (auth.uid() = user_id or user_id is null);
-- END supabase/complete_repair.sql

-- BEGIN supabase/supply_bridge.sql
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
-- END supabase/supply_bridge.sql
