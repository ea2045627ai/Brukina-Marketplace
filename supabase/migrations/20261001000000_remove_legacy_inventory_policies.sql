BEGIN;

DROP POLICY IF EXISTS "Allow public read access to inventory"
  ON public.marketplace_inventory;
DROP POLICY IF EXISTS "inventory vendor manage"
  ON public.marketplace_inventory;

COMMIT;
