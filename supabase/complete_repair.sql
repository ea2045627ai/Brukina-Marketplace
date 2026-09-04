-- Brukina hosted-schema repair migration.
-- Run after schema.sql, dispatch.sql, operations.sql, sourcing.sql, and production.sql.
-- This is idempotent and fills tables missing from an incomplete Supabase deployment.

create extension if not exists pgcrypto;

alter table if exists public.orders add column if not exists idempotency_key text;
create unique index if not exists orders_customer_idempotency_idx on public.orders(customer_id, idempotency_key) where idempotency_key is not null;

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

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'paystack',
  provider_event_id text not null,
  event_type text not null,
  reference text not null,
  amount numeric(12,2),
  currency text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists wallet_transactions_wallet_idx on public.wallet_transactions(wallet_id, created_at desc);
create index if not exists dispatch_queue_idx on public.dispatch_requests(status, created_at);
create index if not exists sourcing_quotes_request_idx on public.sourcing_quotes(request_id, created_at desc);
create index if not exists local_couriers_dispatch_idx on public.local_couriers(courier_type, locality, is_online);
create index if not exists callback_queue_idx on public.support_callback_requests(status, created_at);
create index if not exists support_conversations_user_idx on public.support_conversations(user_id, started_at desc);
create index if not exists payment_events_reference_idx on public.payment_events(reference, created_at desc);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.dispatch_requests enable row level security;
alter table public.sourcing_quotes enable row level security;
alter table public.local_couriers enable row level security;
alter table public.support_callback_requests enable row level security;
alter table public.support_conversations enable row level security;
alter table public.payment_events enable row level security;

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
drop policy if exists "payment events admin read" on public.payment_events;
create policy "payment events admin read" on public.payment_events for select using (public.is_admin());
