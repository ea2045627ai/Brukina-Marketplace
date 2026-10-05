BEGIN;

-- ============================================================
-- BRUKINA: SECURE ORDER FULFILLMENT TRANSITIONS
-- Customer payment/order creation is already handled by the
-- paid-order RPC from 20261005040000.
--
-- Lifecycle:
-- processing
--    -> confirmed       vendor
--    -> packed          vendor
--    -> out_for_delivery dispatch/admin
--
-- Delivery:
-- unassigned
--    -> assigned        rider/admin
--    -> picked_up       assigned rider/admin
--    -> in_transit      assigned rider/admin
--    -> delivered       assigned rider/admin
-- ============================================================

-- Remove legacy/broad order mutation policies.
DROP POLICY IF EXISTS "order operators update" ON public.orders;
DROP POLICY IF EXISTS "orders controlled update" ON public.orders;
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;
DROP POLICY IF EXISTS "customers create orders" ON public.orders;
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;

-- Orders are created by the secure server-side payment RPC.
-- Customers/vendors/admins read only according to the existing
-- participants policy recreated below.

DROP POLICY IF EXISTS "orders participants read" ON public.orders;

CREATE POLICY "orders participants read"
ON public.orders
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.global_vendors v
    WHERE v.id = vendor_id
      AND v.owner_id = auth.uid()
  )
  OR public.is_admin()
);

-- Explicitly prevent normal authenticated clients from inserting
-- or updating orders directly.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;

-- ------------------------------------------------------------
-- ORDER ITEMS
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "order items participants read" ON public.order_items;

CREATE POLICY "order items participants read"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.global_vendors v
          WHERE v.id = o.vendor_id
            AND v.owner_id = auth.uid()
        )
        OR public.is_admin()
      )
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.order_items FROM anon, authenticated;

-- ------------------------------------------------------------
-- DELIVERIES
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "deliveries participants read" ON public.deliveries;

CREATE POLICY "deliveries participants read"
ON public.deliveries
FOR SELECT
TO authenticated
USING (
  rider_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.global_vendors v
          WHERE v.id = o.vendor_id
            AND v.owner_id = auth.uid()
        )
        OR public.is_admin()
      )
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.deliveries FROM anon, authenticated;

-- ============================================================
-- VENDOR: processing -> confirmed
-- ============================================================

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

-- ============================================================
-- VENDOR: confirmed -> packed
-- ============================================================

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

-- ============================================================
-- DISPATCH: packed -> out_for_delivery
-- ============================================================

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
      status
    )
    VALUES (
      p_order_id,
      'unassigned'
    )
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

-- ============================================================
-- RIDER: unassigned -> assigned
-- ============================================================

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
BEGIN
  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
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
    'status', 'assigned'
  );
END;
$$;

-- ============================================================
-- RIDER: assigned -> picked_up
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_pickup_delivery(
  p_delivery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries%ROWTYPE;
BEGIN
  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR v_delivery.rider_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this delivery';
  END IF;

  IF v_delivery.status <> 'assigned' THEN
    RAISE EXCEPTION 'Delivery must be assigned before pickup';
  END IF;

  UPDATE public.deliveries
  SET
    status = 'picked_up',
    updated_at = now()
  WHERE id = p_delivery_id;

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'status', 'picked_up'
  );
END;
$$;

-- ============================================================
-- RIDER: picked_up -> in_transit
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_start_delivery(
  p_delivery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries%ROWTYPE;
BEGIN
  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR v_delivery.rider_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this delivery';
  END IF;

  IF v_delivery.status <> 'picked_up' THEN
    RAISE EXCEPTION 'Delivery must be picked up before transit';
  END IF;

  UPDATE public.deliveries
  SET
    status = 'in_transit',
    updated_at = now()
  WHERE id = p_delivery_id;

  UPDATE public.orders
  SET status = 'out_for_delivery'
  WHERE id = v_delivery.order_id
    AND status IN ('packed', 'out_for_delivery');

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'status', 'in_transit'
  );
END;
$$;

-- ============================================================
-- RIDER: in_transit -> delivered
-- ============================================================

CREATE OR REPLACE FUNCTION public.rider_complete_delivery(
  p_delivery_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery public.deliveries%ROWTYPE;
BEGIN
  SELECT *
  INTO v_delivery
  FROM public.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF NOT (
    public.is_admin()
    OR v_delivery.rider_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this delivery';
  END IF;

  IF v_delivery.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Delivery must be in transit before completion';
  END IF;

  UPDATE public.deliveries
  SET
    status = 'delivered',
    updated_at = now()
  WHERE id = p_delivery_id;

  UPDATE public.orders
  SET status = 'delivered'
  WHERE id = v_delivery.order_id
    AND status = 'out_for_delivery';

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'order_id', v_delivery.order_id,
    'delivery_status', 'delivered',
    'order_status', 'delivered'
  );
END;
$$;

-- ------------------------------------------------------------
-- RPC permissions
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION public.vendor_confirm_marketplace_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vendor_pack_marketplace_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_marketplace_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rider_accept_delivery(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rider_pickup_delivery(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rider_start_delivery(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rider_complete_delivery(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.vendor_confirm_marketplace_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vendor_pack_marketplace_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_marketplace_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_accept_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_pickup_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_start_delivery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rider_complete_delivery(uuid) TO authenticated;

COMMIT;
