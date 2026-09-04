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
