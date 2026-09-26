-- Secure MarketHub order access and seller fulfillment.

-- Remove the overly broad policies from the legacy marketplace migration.
DROP POLICY IF EXISTS "auth_read_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;

-- Replace broad order update policies from the original schema.
DROP POLICY IF EXISTS "order operators update" ON public.orders;

-- Customers, sellers of ordered inventory, and admins can read relevant orders.
DROP POLICY IF EXISTS "orders participants read" ON public.orders;
CREATE POLICY "orders participants read"
ON public.orders FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.marketplace_inventory mi ON mi.id = oi.inventory_id
    JOIN public.global_vendors gv ON gv.id = mi.vendor_id
    WHERE oi.order_id = orders.id
      AND gv.owner_id = auth.uid()
  )
);

-- Customers may create orders only for themselves.
DROP POLICY IF EXISTS "customers create orders" ON public.orders;
CREATE POLICY "customers create orders"
ON public.orders FOR INSERT TO authenticated
WITH CHECK (customer_id = auth.uid());

-- Sellers can update only orders containing their inventory.
-- Customers may update their own order row; admins may update any.
CREATE POLICY "orders controlled update"
ON public.orders FOR UPDATE TO authenticated
USING (
  customer_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.marketplace_inventory mi ON mi.id = oi.inventory_id
    JOIN public.global_vendors gv ON gv.id = mi.vendor_id
    WHERE oi.order_id = orders.id
      AND gv.owner_id = auth.uid()
  )
)
WITH CHECK (
  customer_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN public.marketplace_inventory mi ON mi.id = oi.inventory_id
    JOIN public.global_vendors gv ON gv.id = mi.vendor_id
    WHERE oi.order_id = orders.id
      AND gv.owner_id = auth.uid()
  )
);

-- Sellers can read order items belonging to their inventory.
DROP POLICY IF EXISTS "order items participants read" ON public.order_items;
CREATE POLICY "order items participants read"
ON public.order_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (o.customer_id = auth.uid() OR public.is_admin())
  )
  OR EXISTS (
    SELECT 1
    FROM public.marketplace_inventory mi
    JOIN public.global_vendors gv ON gv.id = mi.vendor_id
    WHERE mi.id = order_items.inventory_id
      AND gv.owner_id = auth.uid()
  )
);
