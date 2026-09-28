-- Allow both payment providers without changing existing Paystack records.
alter table public.payment_intents
  drop constraint if exists payment_intents_provider_check;

alter table public.payment_intents
  add constraint payment_intents_provider_check
  check (provider in ('paystack', 'dodo'));

alter table public.payment_webhook_events
  drop constraint if exists payment_webhook_events_provider_check;

alter table public.payment_webhook_events
  add constraint payment_webhook_events_provider_check
  check (provider in ('paystack', 'dodo'));

-- Dodo settlement: accept only a matching pending Dodo intent,
-- record the webhook once, then credit the GHS wallet once.
create or replace function public.settle_dodo_deposit(
  p_reference text,
  p_provider_amount_ghs numeric,
  p_event_type text,
  p_event_reference text,
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
begin
  if p_reference is null
     or p_provider_amount_ghs is null
     or p_provider_amount_ghs <= 0
     or p_event_type <> 'payment.succeeded'
     or p_event_reference is null then
    raise exception 'Invalid Dodo settlement';
  end if;

  insert into public.payment_webhook_events(
    provider, event_reference, event_type, status, payload
  )
  values (
    'dodo', p_event_reference, p_event_type,
    'received', coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, event_reference, event_type)
  do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('accepted', true, 'idempotent', true);
  end if;

  select * into v_intent
  from public.payment_intents
  where reference = p_reference
    and provider = 'dodo'
  for update;

  if v_intent.id is null then
    update public.payment_webhook_events
    set status = 'ignored', processed_at = now()
    where id = v_event_id;

    return jsonb_build_object(
      'accepted', false, 'ignored', true,
      'reason', 'payment_intent_not_found'
    );
  end if;

  if round(v_intent.amount, 2) <>
     round(p_provider_amount_ghs, 2) then
    update public.payment_webhook_events
    set status = 'failed', processed_at = now()
    where id = v_event_id;
    raise exception 'Dodo amount conversion mismatch';
  end if;

  if v_intent.status = 'paid' then
    update public.payment_webhook_events
    set status = 'processed', processed_at = now()
    where id = v_event_id;

    return jsonb_build_object(
      'accepted', true, 'idempotent', true, 'already_paid', true
    );
  end if;

  update public.payment_intents
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = v_intent.id;

  insert into public.wallet_transactions(
    wallet_id, amount, transaction_type, description,
    provider, provider_reference
  )
  values (
    v_intent.wallet_id, v_intent.amount, 'deposit',
    'Dodo USD deposit converted to GHS',
    'dodo', p_reference
  )
  on conflict (provider, provider_reference) do nothing;

  update public.wallets
  set balance = balance + v_intent.amount
  where id = v_intent.wallet_id;

  update public.payment_webhook_events
  set status = 'processed', processed_at = now()
  where id = v_event_id;

  return jsonb_build_object(
    'accepted', true, 'idempotent', false,
    'payment_intent_id', v_intent.id,
    'wallet_id', v_intent.wallet_id,
    'amount', v_intent.amount
  );
end;
$$;

revoke all on function public.settle_dodo_deposit(text, numeric, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_dodo_deposit(text, numeric, text, text, jsonb)
  to service_role;

-- Create Dodo intents with provider='dodo' (not the Paystack default).
create or replace function public.create_dodo_payment_intent(
  p_user_id uuid,
  p_amount numeric,
  p_reference text,
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
    raise exception 'Invalid Dodo payment intent';
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
    user_id, wallet_id, provider, reference, amount, currency, metadata
  )
  values (
    p_user_id, v_wallet_id, 'dodo', trim(p_reference),
    round(p_amount, 2), 'GHS', coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_dodo_payment_intent(uuid, numeric, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_dodo_payment_intent(uuid, numeric, text, jsonb)
  to service_role;
