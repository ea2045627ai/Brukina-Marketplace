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
