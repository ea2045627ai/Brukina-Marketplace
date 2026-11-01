BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  escrow_balance numeric(12, 2) NOT NULL DEFAULT 0 CHECK (escrow_balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  vendor_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled')),
  total numeric(12, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  total_price numeric(12, 2) CHECK (total_price >= 0),
  delivery_address text,
  delivery_location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS total_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS delivery_location text;

CREATE OR REPLACE FUNCTION public.sync_order_compatibility_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.total_price IS NOT NULL AND (NEW.total IS NULL OR NEW.total = 0) THEN
      NEW.total := NEW.total_price;
    ELSE
      NEW.total_price := NEW.total;
    END IF;
    NEW.delivery_address := COALESCE(NEW.delivery_address, NEW.delivery_location);
    NEW.delivery_location := COALESCE(NEW.delivery_location, NEW.delivery_address);
  ELSE
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      NEW.total_price := NEW.total;
    ELSIF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
      NEW.total := NEW.total_price;
    END IF;
    IF NEW.delivery_address IS DISTINCT FROM OLD.delivery_address THEN
      NEW.delivery_location := NEW.delivery_address;
    ELSIF NEW.delivery_location IS DISTINCT FROM OLD.delivery_location THEN
      NEW.delivery_address := NEW.delivery_location;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_sync_compatibility_fields ON public.orders;
CREATE TRIGGER orders_sync_compatibility_fields
BEFORE INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_compatibility_fields();

CREATE TABLE IF NOT EXISTS public.marketplace_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  vendor_name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  description text,
  unit text NOT NULL DEFAULT 'unit',
  stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  minimum_order_quantity integer NOT NULL DEFAULT 1 CHECK (minimum_order_quantity > 0),
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  price_display text,
  badge text NOT NULL DEFAULT 'WHOLESALE',
  tags text[] NOT NULL DEFAULT '{}',
  free_delivery boolean NOT NULL DEFAULT false,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_name, vendor_name)
);

ALTER TABLE public.marketplace_inventory
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS free_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minimum_order_quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  inventory_id uuid NOT NULL REFERENCES public.marketplace_inventory(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_inventory_active_category_idx
  ON public.marketplace_inventory(active, category);
CREATE INDEX IF NOT EXISTS marketplace_inventory_tags_idx
  ON public.marketplace_inventory USING gin(tags);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx
  ON public.orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON public.order_items(order_id);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallets_owner_read ON public.wallets;
CREATE POLICY wallets_owner_read ON public.wallets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS orders_customer_read ON public.orders;
CREATE POLICY orders_customer_read ON public.orders
  FOR SELECT TO authenticated
  USING (
    customer_id = (SELECT auth.uid())
    OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
  );

DROP POLICY IF EXISTS order_items_customer_read ON public.order_items;
CREATE POLICY order_items_customer_read ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND (
          o.customer_id = (SELECT auth.uid())
          OR COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
        )
    )
  );

DROP POLICY IF EXISTS marketplace_inventory_active_read ON public.marketplace_inventory;
CREATE POLICY marketplace_inventory_active_read ON public.marketplace_inventory
  FOR SELECT TO anon, authenticated
  USING (active);

GRANT SELECT ON public.wallets, public.orders, public.order_items TO authenticated;
GRANT SELECT ON public.marketplace_inventory TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.wallets, public.orders, public.order_items
  FROM anon, authenticated;

CREATE OR REPLACE VIEW public.inventory
WITH (security_invoker = true)
AS
SELECT
  id,
  product_name,
  vendor_name,
  category,
  description,
  unit,
  stock_quantity,
  minimum_order_quantity,
  price,
  price_display,
  badge,
  tags,
  free_delivery,
  image_url,
  active,
  created_at
FROM public.marketplace_inventory;

GRANT SELECT ON public.inventory TO anon, authenticated;

WITH seed (
  product_name,
  vendor_name,
  category,
  description,
  unit,
  stock_quantity,
  minimum_order_quantity,
  price,
  price_display,
  badge,
  tags,
  free_delivery,
  image_url,
  active
)
VALUES
  (
    'Premium maize grain', 'Brukina Wholesale', 'Grains & Cereals',
    'Wholesale maize grain with a minimum order of one 50 kg bag.',
    '50 kg bag', 500, 1, 420.00, 'GH₵ 420.00', 'FREE DELIVERY',
    ARRAY['wholesale', 'free-delivery', 'maize'], true, '/Brukina-Marketplace/icon-512.png', true
  ),
  (
    'Long-grain rice', 'Brukina Wholesale', 'Food & Groceries',
    'Bulk long-grain rice for retailers and food-service operators.',
    '25 kg bag', 300, 1, 360.00, 'GH₵ 360.00', 'FREE DELIVERY',
    ARRAY['wholesale', 'free-delivery', 'rice'], true, '/Brukina-Marketplace/icon-512.png', true
  ),
  (
    'Portland cement', 'Brukina Wholesale', 'Building Materials',
    'Bulk Portland cement for construction and building supply orders.',
    '50 kg bag', 800, 10, 105.00, 'GH₵ 105.00', 'FREE DELIVERY',
    ARRAY['wholesale', 'free-delivery', 'construction'], true, '/Brukina-Marketplace/icon-512.png', true
  )
INSERT INTO public.marketplace_inventory (
  product_name,
  vendor_name,
  category,
  description,
  unit,
  stock_quantity,
  minimum_order_quantity,
  price,
  price_display,
  badge,
  tags,
  free_delivery,
  image_url,
  active
)
SELECT
  seed.product_name,
  seed.vendor_name,
  seed.category,
  seed.description,
  seed.unit,
  seed.stock_quantity,
  seed.minimum_order_quantity,
  seed.price,
  seed.price_display,
  seed.badge,
  seed.tags,
  seed.free_delivery,
  seed.image_url,
  seed.active
FROM seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.marketplace_inventory existing
  WHERE existing.product_name = seed.product_name
    AND existing.vendor_name = seed.vendor_name
);

COMMIT;