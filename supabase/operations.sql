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

create index if not exists local_vendor_location_idx on public.local_vendors(locality, is_active);
create index if not exists local_courier_dispatch_idx on public.local_couriers(courier_type, locality, is_online);
create index if not exists cashflow_user_date_idx on public.cashflow_entries(user_id, created_at desc);
create index if not exists payment_events_reference_idx on public.payment_events(reference, created_at desc);

alter table public.local_vendors enable row level security;
alter table public.local_couriers enable row level security;
alter table public.cashflow_entries enable row level security;
alter table public.payment_events enable row level security;

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
drop policy if exists "payment events admin read" on public.payment_events;
create policy "payment events admin read" on public.payment_events for select using (public.is_admin());

-- A production payment webhook should create settled cashflow entries with the service role.
