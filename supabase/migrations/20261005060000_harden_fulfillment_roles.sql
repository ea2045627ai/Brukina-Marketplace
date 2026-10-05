BEGIN;

-- ============================================================
-- BRUKINA: HARDEN FULFILLMENT ROLE + LIFECYCLE CHECKS
-- ============================================================

-- ------------------------------------------------------------
-- VENDOR CONFIRM
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vendor_confirm_marketplace_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.global_vendors v
      WHERE v.id = v_order.vendor_id
        AND v.owner_id = auth.uid()
        AND v.verification_status = 'verified'
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to confirm this order';
  END IF;

  IF v_order.status <> 'processing' THEN
    RAISE EXCEPTION 'Order must be processing before confirmation';
  END IF;

  UPDATE public.orders
  SET status = 'confirmed'
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'confirmed'
  );
END;
$$;

-- ------------------------------------------------------------
-- VENDOR PACK
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vendor_pack_marketplace_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.global_vendors v
      WHERE v.id = v_order.vendor_id
        AND v.owner_id = auth.uid()
        AND v.verification_status = 'verified'
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to pack this order';
  END IF;

  IF v_order.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Order must be confirmed before packing';
  END IF;

  UPDATE public.orders
  SET status = 'packed'
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'packed'
  );
END;
$$;

-- ------------------------------------------------------------
-- DISPATCH
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dispatch_marketplace_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_delivery public.deliveries%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only authorized dispatch administrators can dispatch orders';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status <> 'packed' THEN
    RAISE EXCEPTION 'Order must be packed before dispatch';
  END IF;

  UPDATE public.orders
  SET status = 'out_for_delivery'
  WHERE id = p_order_id;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.deliveries (
      order_id,
      status,
      updated_at
    )
    VALUES (
      p_order_id,
      'unassigned',
      now()
    )
    RETURNING * INTO v_delivery;
  ELSE
    IF v_delivery.status <> 'unassigned' THEN
      RAISE EXCEPTION 'Delivery has already entered rider fulfillment';
    END IF;

    UPDATE public.deliveries
    SET updated_at = now()
    WHERE id = v_delivery.id
    RETURNING * INTO v_delivery;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'delivery_id', v_delivery.id,
    'order_status', 'out_for_delivery',
    'delivery_status', v_delivery.status
  );
END;
$$;

-- ------------------------------------------------------------
-- RIDER ACCEPT
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rider_accept_delivery(
  p_delivery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_role text;
BEGIN
  SELECT role
  INTO v_role
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF v_role NOT IN ('rider', 'admin') THEN
    RAISE EXCEPTION 'Only registered riders can accept deliveries';
  END IF;

  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = v_delivery.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent order not found';
  END IF;

  IF v_order.status <> 'out_for_delivery' THEN
    RAISE EXCEPTION 'Order is not ready for rider fulfillment';
  END IF;

  IF v_delivery.status <> 'unassigned' THEN
    RAISE EXCEPTION 'Delivery has already been assigned';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.deliveries
    WHERE rider_id = auth.uid()
      AND status IN ('assigned', 'picked_up', 'in_transit')
  ) THEN
    RAISE EXCEPTION 'You already have an active delivery';
  END IF;

  UPDATE public.deliveries
  SET
    rider_id = auth.uid(),
    status = 'assigned',
    updated_at = now()
  WHERE id = p_delivery_id
    AND status = 'unassigned';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery was claimed by another rider';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'order_id', v_order.id,
    'status', 'assigned'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_confirm_marketplace_order(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.vendor_pack_marketplace_order(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.dispatch_marketplace_order(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rider_accept_delivery(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vendor_confirm_marketplace_order(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.vendor_pack_marketplace_order(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.dispatch_marketplace_order(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.rider_accept_delivery(uuid)
  TO authenticated;

COMMIT;
