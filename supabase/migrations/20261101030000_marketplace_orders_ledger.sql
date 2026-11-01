BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  delivery_charge numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_charge >= 0),
  currency text NOT NULL DEFAULT 'GHS' CHECK (currency = 'GHS'),
  payment_method text NOT NULL
    CHECK (payment_method IN ('MTN', 'Telecel', 'AT')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'cancelled')),
  transaction_ref text UNIQUE,
  provider_reference text UNIQUE,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS marketplace_order_payments_customer_created_idx
  ON public.marketplace_order_payments (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_order_payments_order_idx
  ON public.marketplace_order_payments (order_id);

CREATE OR REPLACE FUNCTION public.set_marketplace_payment_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS marketplace_order_payments_updated_at
  ON public.marketplace_order_payments;
CREATE TRIGGER marketplace_order_payments_updated_at
  BEFORE UPDATE ON public.marketplace_order_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_marketplace_payment_updated_at();

ALTER TABLE public.marketplace_order_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_order_payments_customer_read
  ON public.marketplace_order_payments;
CREATE POLICY marketplace_order_payments_customer_read
  ON public.marketplace_order_payments
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.marketplace_order_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.marketplace_order_payments TO authenticated;
REVOKE ALL ON FUNCTION public.set_marketplace_payment_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;
