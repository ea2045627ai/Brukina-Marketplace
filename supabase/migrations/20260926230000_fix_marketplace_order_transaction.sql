CREATE OR REPLACE FUNCTION public.place_marketplace_order_transaction(p_order_number text, p_customer_id uuid, p_inventory_id uuid, p_quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id uuid;
  v_price numeric(12,2);
  v_stock_quantity integer;
  v_min_order_qty integer;
  v_order_id uuid;
  v_active boolean;
BEGIN
  IF p_customer_id IS NULL OR p_inventory_id IS NULL OR p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000 THEN
    RAISE EXCEPTION 'Invalid customer, inventory item, or quantity' USING ERRCODE = '22000';
  END IF;
  SELECT vendor_id, price, stock_quantity, minimum_order_quantity, active INTO v_vendor_id, v_price, v_stock_quantity, v_min_order_qty, v_active FROM public.marketplace_inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND OR v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Inventory item is no longer available' USING ERRCODE = 'P0002';
  END IF;
  IF p_quantity < v_min_order_qty OR p_quantity > v_stock_quantity THEN
    RAISE EXCEPTION 'Quantity out of range. Stock remaining: %', v_stock_quantity USING ERRCODE = '22000';
  END IF;
  INSERT INTO public.orders (order_number, customer_id, vendor_id, total, status) VALUES (p_order_number, p_customer_id, v_vendor_id, v_price * p_quantity, 'pending') RETURNING id INTO v_order_id;
  INSERT INTO public.order_items (order_id, inventory_id, quantity, unit_price) VALUES (v_order_id, p_inventory_id, p_quantity, v_price);
  UPDATE public.marketplace_inventory SET stock_quantity = stock_quantity - p_quantity WHERE id = p_inventory_id;
  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;
REVOKE ALL ON FUNCTION public.place_marketplace_order_transaction(text, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_marketplace_order_transaction(text, uuid, uuid, integer) TO service_role;
