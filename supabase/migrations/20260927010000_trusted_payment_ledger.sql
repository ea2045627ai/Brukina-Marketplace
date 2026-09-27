-- Brukina Marketplace
-- Trusted payment ledger foundation.
-- Financial mutations must occur through SECURITY DEFINER functions
-- called by the trusted Railway payment worker.

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('paystack')),
  event_reference text not null,
  event_type text not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, event_reference, event_type)
);

create index if not exists payment_webhook_events_status_idx
  on public.payment_webhook_events(status, created_at desc);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  wallet_id uuid references public.wallets(id) on delete restrict,
  provider text not null default 'paystack'
    check (provider in ('paystack')),
  reference text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GHS' check (currency = 'GHS'),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'reversed', 'cancelled')),
  checkout_url text,
  provider_customer_code text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_user_idx
  on public.payment_intents(user_id, created_at desc);

create index if not exists payment_intents_status_idx
  on public.payment_intents(status, created_at desc);

alter table public.wallet_transactions
  add column if not exists provider text,
  add column if not exists provider_reference text;

create unique index if not exists wallet_transactions_provider_reference_uidx
  on public.wallet_transactions(provider, provider_reference)
  where provider is not null and provider_reference is not null;

create table if not exists public.rider_payout_logs (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete restrict,
  provider text not null,
  amount numeric(12,2) not null check (amount > 0),
  phone_number text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'success', 'failed', 'reversed')),
  provider_reference text,
  provider_recipient_code text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rider_payout_logs
  add column if not exists provider text,
  add column if not exists amount numeric(12,2),
  add column if not exists phone_number text,
  add column if not exists status text default 'pending',
  add column if not exists provider_reference text,
  add column if not exists provider_recipient_code text,
  add column if not exists failure_reason text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists rider_payout_logs_rider_idx
  on public.rider_payout_logs(rider_id, created_at desc);

create unique index if not exists rider_payout_logs_provider_reference_uidx
  on public.rider_payout_logs(provider_reference)
  where provider_reference is not null;

alter table public.rider_logistics_wallets
  add column if not exists pending_payout_ghs numeric(12,2) not null default 0
    check (pending_payout_ghs >= 0);

alter table public.payment_webhook_events enable row level security;
alter table public.payment_intents enable row level security;
alter table public.rider_payout_logs enable row level security;

drop policy if exists "payment events no client access" on public.payment_webhook_events;

drop policy if exists "payment intents own read" on public.payment_intents;
create policy "payment intents own read"
  on public.payment_intents
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "payment intents no client write" on public.payment_intents;

drop policy if exists "rider payouts own read" on public.rider_payout_logs;
create policy "rider payouts own read"
  on public.rider_payout_logs
  for select
  to authenticated
  using (rider_id = auth.uid() or public.is_admin());

drop policy if exists "rider payouts no client write" on public.rider_payout_logs;

-- Replace the dangerous authenticated FOR ALL policy.
drop policy if exists "allow_all_logistics" on public.rider_logistics_wallets;
drop policy if exists "rider logistics own read" on public.rider_logistics_wallets;
create policy "rider logistics own read"
  on public.rider_logistics_wallets
  for select
  to authenticated
  using (rider_id = auth.uid() or public.is_admin());

-- Trusted server function: create a deposit intent.
create or replace function public.create_payment_intent(
  p_user_id uuid,
  p_amount numeric,
  p_reference text,
  p_checkout_url text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet_id uuid;
  v_id uuid;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0
     or p_reference is null or length(trim(p_reference)) < 8 then
    raise exception 'Invalid payment intent';
  end if;

  select id into v_wallet_id
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_wallet_id is null then
    insert into public.wallets(user_id)
    values (p_user_id)
    returning id into v_wallet_id;
  end if;

  insert into public.payment_intents(
    user_id, wallet_id, reference, amount, checkout_url, metadata
  )
  values (
    p_user_id, v_wallet_id, trim(p_reference), round(p_amount, 2),
    p_checkout_url, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (reference) do update
    set checkout_url = excluded.checkout_url,
        metadata = excluded.metadata,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Trusted server function: settle a successful Paystack deposit exactly once.
create or replace function public.settle_paystack_deposit(
  p_reference text,
  p_provider_amount numeric,
  p_currency text,
  p_event_type text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent public.payment_intents%rowtype;
  v_event_id uuid;
  v_existing uuid;
begin
  if p_reference is null or p_provider_amount is null
     or p_currency <> 'GHS'
     or p_event_type <> 'charge.success' then
    raise exception 'Invalid payment settlement';
  end if;

  insert into public.payment_webhook_events(
    provider, event_reference, event_type, status, payload
  )
  values ('paystack', p_reference, p_event_type, 'received', coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_reference, event_type)
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select id into v_existing
    from public.payment_webhook_events
    where provider = 'paystack'
      and event_reference = p_reference
      and event_type = p_event_type;

    return jsonb_build_object(
      'accepted', true,
      'idempotent', true,
      'event_id', v_existing
    );
  end if;

  select * into v_intent
  from public.payment_intents
  where reference = p_reference
  for update;

  if v_intent.id is null then
    update public.payment_webhook_events
    set status = 'ignored', processed_at = now()
    where id = v_event_id;

    return jsonb_build_object(
      'accepted', false,
      'ignored', true,
      'reason', 'payment_intent_not_found'
    );
  end if;

  if v_intent.currency <> p_currency
     or round(v_intent.amount, 2) <> round(p_provider_amount, 2) then
    update public.payment_webhook_events
    set status = 'failed', processed_at = now()
    where id = v_event_id;

    raise exception 'Payment amount or currency mismatch';
  end if;

  if v_intent.status = 'paid' then
    update public.payment_webhook_events
    set status = 'processed', processed_at = now()
    where id = v_event_id;

    return jsonb_build_object(
      'accepted', true,
      'idempotent', true,
      'already_paid', true
    );
  end if;

  update public.payment_intents
  set status = 'paid',
      paid_at = now(),
      updated_at = now()
  where id = v_intent.id;

  insert into public.wallet_transactions(
    wallet_id,
    amount,
    transaction_type,
    description,
    provider,
    provider_reference
  )
  values (
    v_intent.wallet_id,
    v_intent.amount,
    'deposit',
    'Paystack deposit confirmed',
    'paystack',
    p_reference
  )
  on conflict (provider, provider_reference) do nothing;

  update public.wallets
  set balance = balance + v_intent.amount
  where id = v_intent.wallet_id;

  update public.payment_webhook_events
  set status = 'processed', processed_at = now()
  where id = v_event_id;

  return jsonb_build_object(
    'accepted', true,
    'idempotent', false,
    'payment_intent_id', v_intent.id,
    'wallet_id', v_intent.wallet_id,
    'amount', v_intent.amount
  );
end;
$$;

-- Trusted server function: reserve rider earnings for a payout.
create or replace function public.create_rider_payout(
  p_rider_id uuid,
  p_provider text,
  p_amount numeric,
  p_phone_number text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.rider_logistics_wallets%rowtype;
  v_id uuid;
begin
  if p_rider_id is null or p_amount is null or p_amount <= 0
     or p_provider is null
     or p_phone_number is null
     or length(trim(p_phone_number)) < 10 then
    raise exception 'Invalid payout request';
  end if;

  select * into v_wallet
  from public.rider_logistics_wallets
  where rider_id = p_rider_id
  for update;

  if v_wallet.id is null then
    raise exception 'Rider logistics wallet not found';
  end if;

  if round(v_wallet.total_earned_ghs - v_wallet.pending_payout_ghs, 2)
     < round(p_amount, 2) then
    raise exception 'Insufficient available rider earnings';
  end if;

  insert into public.rider_payout_logs(
    rider_id, provider, amount, phone_number, status
  )
  values (
    p_rider_id, p_provider, round(p_amount, 2), trim(p_phone_number), 'pending'
  )
  returning id into v_id;

  update public.rider_logistics_wallets
  set pending_payout_ghs = pending_payout_ghs + round(p_amount, 2)
  where id = v_wallet.id;

  return v_id;
end;
$$;

revoke all on function public.create_payment_intent(uuid, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.settle_paystack_deposit(text, numeric, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_rider_payout(uuid, text, numeric, text) from public, anon, authenticated;

grant execute on function public.create_payment_intent(uuid, numeric, text, text, jsonb) to service_role;
grant execute on function public.settle_paystack_deposit(text, numeric, text, text, jsonb) to service_role;
grant execute on function public.create_rider_payout(uuid, text, numeric, text) to service_role;
