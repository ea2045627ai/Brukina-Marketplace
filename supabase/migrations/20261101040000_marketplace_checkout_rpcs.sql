BEGIN;

CREATE OR REPLACE FUNCTION public.create_marketplace_checkout_order(
  p_customer_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_idempotency_key uuid
)
RETURNS TABLE (
  order_id uuid,
  order_number text,
  transaction_ref text,
  subtotal numeric,
  delivery_charge numeric,
  total numeric,
  payment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_existing record;
  v_order_id uuid;
  v_order_number text;
  v_transaction_ref text;
  v_subtotal numeric(12, 2);
  v_delivery_charge numeric(12, 2);
  v_total numeric(12, 2);
  v_has_free_delivery boolean;
  v_requested_count integer;
  v_found_count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_customer_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'customer and idempotency key are required' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method NOT IN ('MTN', 'Telecel', 'AT') THEN
    RAISE EXCEPTION 'unsupported payment method' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) < 1
    OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'cart must contain between 1 and 50 lines' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS line(value)
    WHERE COALESCE(line.value ->> 'inventory_id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR COALESCE(line.value ->> 'quantity', '') !~ '^[1-9][0-9]{0,5}$'
  ) THEN
    RAISE EXCEPTION 'cart contains an invalid product or quantity' USING ERRCODE = '22023';
  END IF;

  SELECT payment.order_id, payment.transaction_ref,
         payment.amount - payment.delivery_charge AS existing_subtotal,
         payment.delivery_charge, payment.amount, payment.payment_status,
         orders.order_number
  INTO v_existing
  FROM public.marketplace_order_payments AS payment
  JOIN public.orders AS orders ON orders.id = payment.order_id
  WHERE payment.customer_id = p_customer_id
    AND payment.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.order_id, v_existing.order_number,
      v_existing.transaction_ref, v_existing.existing_subtotal,
      v_existing.delivery_charge, v_existing.amount, v_existing.payment_status;
    RETURN;
  END IF;

  SELECT count(*)::integer
  INTO v_requested_count
  FROM (
    SELECT (line.value ->> 'inventory_id')::uuid
    FROM jsonb_array_elements(p_items) AS line(value)
    GROUP BY (line.value ->> 'inventory_id')::uuid
  ) AS requested;

  PERFORM inventory.id
  FROM public.marketplace_inventory AS inventory
  JOIN (
    SELECT (line.value ->> 'inventory_id')::uuid AS inventory_id,
           sum((line.value ->> 'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS line(value)
    GROUP BY (line.value ->> 'inventory_id')::uuid
  ) AS requested ON requested.inventory_id = inventory.id
  WHERE inventory.active
  ORDER BY inventory.id
  FOR UPDATE OF inventory;

  SELECT count(*)::integer
  INTO v_found_count
  FROM public.marketplace_inventory AS inventory
  JOIN (
    SELECT (line.value ->> 'inventory_id')::uuid AS inventory_id
    FROM jsonb_array_elements(p_items) AS line(value)
    GROUP BY (line.value ->> 'inventory_id')::uuid
  ) AS requested ON requested.inventory_id = inventory.id
  WHERE inventory.active;

  IF v_found_count <> v_requested_count THEN
    RAISE EXCEPTION 'one or more products are unavailable' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.marketplace_inventory AS inventory
    JOIN (
      SELECT (line.value ->> 'inventory_id')::uuid AS inventory_id,
             sum((line.value ->> 'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(p_items) AS line(value)
      GROUP BY (line.value ->> 'inventory_id')::uuid
    ) AS requested ON requested.inventory_id = inventory.id
    WHERE requested.quantity > inventory.stock_quantity
      OR requested.quantity < inventory.minimum_order_quantity
  ) THEN
    RAISE EXCEPTION 'requested quantity is unavailable or below the minimum order' USING ERRCODE = '22023';
  END IF;

  SELECT
    round(sum(inventory.price * requested.quantity), 2),
    COALESCE(bool_or(
      inventory.is_wholesale
      AND inventory.free_delivery
      AND requested.quantity >= inventory.wholesale_min_quantity
    ), false)
  INTO v_subtotal, v_has_free_delivery
  FROM public.marketplace_inventory AS inventory
  JOIN (
    SELECT (line.value ->> 'inventory_id')::uuid AS inventory_id,
           sum((line.value ->> 'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS line(value)
    GROUP BY (line.value ->> 'inventory_id')::uuid
  ) AS requested ON requested.inventory_id = inventory.id;

  v_delivery_charge := CASE WHEN v_has_free_delivery THEN 0 ELSE 15 END;
  v_total := v_subtotal + v_delivery_charge;
  v_order_id := gen_random_uuid();
  v_order_number := 'BM-' || upper(replace(v_order_id::text, '-', ''));
  v_transaction_ref := 'BM-' || upper(replace(p_idempotency_key::text, '-', ''));

  INSERT INTO public.orders (
    id, order_number, customer_id, status, total, total_price
  ) VALUES (
    v_order_id, v_order_number, p_customer_id, 'pending', v_total, v_total
  );

  INSERT INTO public.order_items (order_id, inventory_id, quantity, unit_price)
  SELECT v_order_id, inventory.id, requested.quantity, inventory.price
  FROM public.marketplace_inventory AS inventory
  JOIN (
    SELECT (line.value ->> 'inventory_id')::uuid AS inventory_id,
           sum((line.value ->> 'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) AS line(value)
    GROUP BY (line.value ->> 'inventory_id')::uuid
  ) AS requested ON requested.inventory_id = inventory.id;

  INSERT INTO public.marketplace_order_payments (
    order_id, customer_id, amount, delivery_charge, payment_method,
    payment_status, transaction_ref, idempotency_key
  ) VALUES (
    v_order_id, p_customer_id, v_total, v_delivery_charge, p_payment_method,
    'pending', v_transaction_ref, p_idempotency_key
  );

  RETURN QUERY SELECT v_order_id, v_order_number, v_transaction_ref,
    v_subtotal, v_delivery_charge, v_total, 'pending'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_marketplace_payment(
  p_transaction_ref text,
  p_provider_reference text,
  p_amount numeric,
  p_currency text
)
RETURNS TABLE (order_id uuid, payment_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_payment public.marketplace_order_payments%ROWTYPE;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_transaction_ref IS NULL OR p_provider_reference IS NULL
    OR p_amount IS NULL OR p_currency IS DISTINCT FROM 'GHS' THEN
    RAISE EXCEPTION 'invalid payment confirmation metadata' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.marketplace_order_payments AS payment
  WHERE payment.transaction_ref = p_transaction_ref
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment reference not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.amount <> p_amount OR v_payment.currency <> p_currency THEN
    RAISE EXCEPTION 'payment amount or currency mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_payment.payment_status = 'paid' THEN
    IF v_payment.provider_reference IS DISTINCT FROM p_provider_reference THEN
      RAISE EXCEPTION 'payment already confirmed with a different provider reference'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_payment.order_id, v_payment.payment_status;
    RETURN;
  END IF;

  IF v_payment.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'payment is not pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.marketplace_order_payments
  SET payment_status = 'paid',
      provider_reference = p_provider_reference
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET status = 'confirmed'
  WHERE id = v_payment.order_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order cannot transition to confirmed' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT v_payment.order_id, 'paid'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_marketplace_checkout_order(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_marketplace_payment(text, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_marketplace_checkout_order(uuid, jsonb, text, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_marketplace_payment(text, text, numeric, text)
  TO service_role;

COMMIT;
