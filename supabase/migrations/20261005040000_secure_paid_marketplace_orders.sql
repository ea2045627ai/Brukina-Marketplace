-- ============================================================
-- BRUKINA MARKETPLACE
-- SECURE PAID ORDER TRANSACTION
--
-- Flow:
-- Dodo -> wallet deposit -> paid wallet -> marketplace order
--
-- The wallet debit, order creation, inventory reservation and
-- delivery creation happen in ONE database transaction.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Add processing to the canonical orders status lifecycle.
-- ------------------------------------------------------------

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (
    status IN (
      'pending',
      'processing',
      'confirmed',
      'packed',
      'out_for_delivery',
      'delivered',
      'cancelled'
    )
  );

-- ------------------------------------------------------------
-- 2. Protect wallet transactions against invalid amounts/types.
-- ------------------------------------------------------------

ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_amount_check;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_amount_check
  CHECK (amount <> 0);

-- ------------------------------------------------------------
-- 3. Trusted paid marketplace order transaction.
--
-- IMPORTANT:
-- This function is callable ONLY by service_role.
-- Identity is supplied by the already-authenticated Netlify
-- function, not by auth.uid().
--
-- Atomic operations:
--   lock inventory
--   validate stock/MOQ
--   lock customer wallet
--   validate balance
--   debit wallet
--   create order
--   create order item
--   reduce inventory
--   create delivery
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_paid_marketplace_order_transaction(
  p_order_number text,
  p_customer_id uuid,
  p_inventory_id uuid,
  p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_vendor_id uuid;
  v_price numeric(12,2);
  v_total numeric(12,2);
  v_stock_quantity integer;
  v_min_order_qty integer;
  v_active boolean;

  v_wallet_id uuid;
  v_wallet_balance numeric(12,2);

  v_order_id uuid;
  v_delivery_id uuid;
  v_transaction_id uuid;
BEGIN
  -- ----------------------------------------------------------
  -- Basic validation
  -- ----------------------------------------------------------

  IF p_customer_id IS NULL
     OR p_inventory_id IS NULL
     OR p_quantity IS NULL
     OR p_quantity < 1
     OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'Invalid customer, inventory item, or quantity'
      USING ERRCODE = '22000';
  END IF;

  IF p_order_number IS NULL
     OR length(trim(p_order_number)) < 8 THEN
    RAISE EXCEPTION 'Order number is required'
      USING ERRCODE = '22000';
  END IF;

  -- ----------------------------------------------------------
  -- Lock inventory FIRST.
  -- This prevents two simultaneous customers from consuming
  -- the same stock.
  -- ----------------------------------------------------------

  SELECT
    vendor_id,
    price,
    stock_quantity,
    minimum_order_quantity,
    active
  INTO
    v_vendor_id,
    v_price,
    v_stock_quantity,
    v_min_order_qty,
    v_active
  FROM public.marketplace_inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inventory item is no longer available'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_price IS NULL OR v_price < 0 THEN
    RAISE EXCEPTION 'Inventory item has an invalid price'
      USING ERRCODE = '22000';
  END IF;

  IF p_quantity < COALESCE(v_min_order_qty, 1) THEN
    RAISE EXCEPTION
      'Minimum order quantity is %',
      COALESCE(v_min_order_qty, 1)
      USING ERRCODE = '22000';
  END IF;

  IF p_quantity > COALESCE(v_stock_quantity, 0) THEN
    RAISE EXCEPTION
      'Insufficient stock. Stock remaining: %',
      COALESCE(v_stock_quantity, 0)
      USING ERRCODE = '22000';
  END IF;

  v_total := round(v_price * p_quantity, 2);

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Order total must be greater than zero'
      USING ERRCODE = '22000';
  END IF;

  -- ----------------------------------------------------------
  -- Lock wallet.
  -- If it does not exist, create it.
  -- ----------------------------------------------------------

  SELECT id, balance
  INTO v_wallet_id, v_wallet_balance
  FROM public.wallets
  WHERE user_id = p_customer_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (
      user_id,
      balance,
      escrow_balance
    )
    VALUES (
      p_customer_id,
      0,
      0
    )
    RETURNING id, balance
    INTO v_wallet_id, v_wallet_balance;
  END IF;

  v_wallet_balance := COALESCE(v_wallet_balance, 0);

  -- ----------------------------------------------------------
  -- NEVER allow the order to be created without paid funds.
  -- ----------------------------------------------------------

  IF v_wallet_balance < v_total THEN
    RAISE EXCEPTION
      'Insufficient wallet balance. Required: GH₵ %, Available: GH₵ %',
      to_char(v_total, 'FM999999990.00'),
      to_char(v_wallet_balance, 'FM999999990.00')
      USING ERRCODE = 'P0001';
  END IF;

  -- ----------------------------------------------------------
  -- Debit wallet.
  -- ----------------------------------------------------------

  UPDATE public.wallets
  SET balance = round(balance - v_total, 2)
  WHERE id = v_wallet_id
    AND balance >= v_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Wallet balance changed before payment could be completed'
      USING ERRCODE = 'P0001';
  END IF;

  -- ----------------------------------------------------------
  -- Create order ONLY after wallet funds are secured.
  -- ----------------------------------------------------------

  INSERT INTO public.orders (
    order_number,
    customer_id,
    vendor_id,
    total,
    status
  )
  VALUES (
    trim(p_order_number),
    p_customer_id,
    v_vendor_id,
    v_total,
    'processing'
  )
  RETURNING id INTO v_order_id;

  -- ----------------------------------------------------------
  -- Create order item.
  -- ----------------------------------------------------------

  INSERT INTO public.order_items (
    order_id,
    inventory_id,
    quantity,
    unit_price
  )
  VALUES (
    v_order_id,
    p_inventory_id,
    p_quantity,
    v_price
  );

  -- ----------------------------------------------------------
  -- Reserve/decrement inventory atomically.
  -- ----------------------------------------------------------

  UPDATE public.marketplace_inventory
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_inventory_id
    AND stock_quantity >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Inventory changed before the order could be completed'
      USING ERRCODE = 'P0001';
  END IF;

  -- ----------------------------------------------------------
  -- Record the wallet payment.
  -- Negative amount = money leaving the wallet.
  -- ----------------------------------------------------------

  INSERT INTO public.wallet_transactions (
    wallet_id,
    order_id,
    amount,
    transaction_type,
    description
  )
  VALUES (
    v_wallet_id,
    v_order_id,
    -v_total,
    'payment',
    'Marketplace order payment ' || trim(p_order_number)
  )
  RETURNING id INTO v_transaction_id;

  -- ----------------------------------------------------------
  -- Create delivery job immediately after successful payment.
  -- ----------------------------------------------------------

  INSERT INTO public.deliveries (
    order_id,
    status,
    updated_at
  )
  VALUES (
    v_order_id,
    'unassigned',
    now()
  )
  RETURNING id INTO v_delivery_id;

  -- ----------------------------------------------------------
  -- Return authoritative result.
  -- ----------------------------------------------------------

  RETURN jsonb_build_object(
    'success', true,
    'paid', true,
    'status', 'processing',
    'order_id', v_order_id,
    'order_number', trim(p_order_number),
    'delivery_id', v_delivery_id,
    'wallet_transaction_id', v_transaction_id,
    'amount_paid', v_total,
    'remaining_wallet_balance',
      round(v_wallet_balance - v_total, 2)
  );
END;
$function$;

-- ------------------------------------------------------------
-- 4. Remove direct client execution.
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.place_paid_marketplace_order_transaction(
  text, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.place_paid_marketplace_order_transaction(
  text, uuid, uuid, integer
) TO service_role;

-- The old RPC must not remain available to normal clients.
REVOKE ALL ON FUNCTION public.place_marketplace_order_transaction(
  text, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;

-- It may remain available to service_role for compatibility,
-- but the application will use the paid transaction above.
GRANT EXECUTE ON FUNCTION public.place_marketplace_order_transaction(
  text, uuid, uuid, integer
) TO service_role;

-- ------------------------------------------------------------
-- 5. Helpful indexes.
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON public.orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS deliveries_status_updated_idx
  ON public.deliveries(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS wallet_transactions_order_idx
  ON public.wallet_transactions(order_id, created_at DESC);

COMMIT;
