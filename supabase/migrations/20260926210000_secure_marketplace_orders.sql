-- Secure marketplace order access and seller fulfillment.

-- Remove broad legacy order policies.
DROP POLICY IF EXISTS "auth_read_orders" ON public.orders;
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;
DROP POLICY IF EXISTS "order operators update" ON public.orders;

-- Replace order read access.
DROP POLICY IF EXISTS "orders participants read" ON public.orders;

CREATE POLICY "orders participants read"
ON public.orders
FOR SELECT
TO authenticated
USING (
  customer_id = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.global_vendors gv
    WHERE gv.id = orders.vendor_id
      AND gv.owner_id = auth.uid()
  )
);

-- Customers can create orders only for themselves.
DROP POLICY IF EXISTS "customers create orders" ON public.orders;

CREATE POLICY "customers create orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = auth.uid()
);

-- Only the seller assigned to the order or an admin can update it.
DROP POLICY IF EXISTS "orders controlled update" ON public.orders;

CREATE POLICY "orders controlled update"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.global_vendors gv
    WHERE gv.id = orders.vendor_id
      AND gv.owner_id = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.global_vendors gv
    WHERE gv.id = orders.vendor_id
      AND gv.owner_id = auth.uid()
  )
);

-- Remove broad direct UPDATE privileges.
REVOKE UPDATE ON public.orders FROM anon, authenticated;

-- Authenticated sellers/admins can directly update status only,
-- subject to the row-level policy above.
GRANT UPDATE (status) ON public.orders TO authenticated;

-- Customers, admins, and sellers can read relevant order items.
DROP POLICY IF EXISTS "order items participants read" ON public.order_items;

CREATE POLICY "order items participants read"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.customer_id = auth.uid()
        OR public.is_admin()
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.marketplace_inventory mi
    JOIN public.global_vendors gv ON gv.id = mi.vendor_id
    WHERE mi.id = order_items.inventory_id
      AND gv.owner_id = auth.uid()
  )
);
