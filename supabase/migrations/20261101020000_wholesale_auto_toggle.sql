BEGIN;

ALTER TABLE public.marketplace_inventory
  ADD COLUMN IF NOT EXISTS wholesale_min_quantity integer NOT NULL DEFAULT 1
    CHECK (wholesale_min_quantity > 0),
  ADD COLUMN IF NOT EXISTS is_wholesale boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.trigger_auto_toggle_wholesale_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.wholesale_min_quantity >= 10 OR NEW.price >= 500.00 THEN
    NEW.is_wholesale := true;
    NEW.free_delivery := true;
  ELSE
    NEW.is_wholesale := false;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_auto_toggle_wholesale ON public.marketplace_inventory;

CREATE TRIGGER tr_auto_toggle_wholesale
  BEFORE INSERT OR UPDATE ON public.marketplace_inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_toggle_wholesale_status();

UPDATE public.marketplace_inventory
SET wholesale_min_quantity = minimum_order_quantity;

CREATE INDEX IF NOT EXISTS idx_marketplace_inventory_wholesale_delivery
  ON public.marketplace_inventory (is_wholesale, free_delivery)
  WHERE is_wholesale = true;

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
  created_at,
  wholesale_min_quantity,
  is_wholesale
FROM public.marketplace_inventory;

COMMIT;
