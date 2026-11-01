BEGIN;

ALTER TABLE public.marketplace_order_payments
  DROP CONSTRAINT IF EXISTS marketplace_order_payments_payment_method_check;
ALTER TABLE public.marketplace_order_payments
  ADD CONSTRAINT marketplace_order_payments_payment_method_check
  CHECK (payment_method IN ('MTN', 'Telecel', 'AT', 'Paystack', 'Arkesel'));

CREATE OR REPLACE FUNCTION public.fail_marketplace_payment(
  p_order_id uuid,
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
  IF p_order_id IS NULL OR p_provider_reference IS NULL
    OR p_amount IS NULL OR p_amount <= 0 OR p_currency IS DISTINCT FROM 'GHS' THEN
    RAISE EXCEPTION 'invalid payment failure metadata' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.marketplace_order_payments AS payment
  WHERE payment.order_id = p_order_id
    AND payment.payment_method = 'Arkesel'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arkesel payment not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_payment.amount <> p_amount OR v_payment.currency <> p_currency THEN
    RAISE EXCEPTION 'payment amount or currency mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_payment.provider_reference IS NOT NULL
    AND v_payment.provider_reference IS DISTINCT FROM p_provider_reference THEN
    RAISE EXCEPTION 'provider reference does not match the initialized payment'
      USING ERRCODE = '22023';
  END IF;

  IF v_payment.payment_status = 'failed' THEN
    RETURN QUERY SELECT v_payment.order_id, v_payment.payment_status;
    RETURN;
  END IF;
  IF v_payment.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'payment is not pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.marketplace_order_payments
  SET payment_status = 'failed',
      provider_reference = p_provider_reference
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET status = 'cancelled'
  WHERE id = v_payment.order_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order cannot transition after failed payment' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY SELECT v_payment.order_id, 'failed'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_marketplace_payment(uuid, text, numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_marketplace_payment(uuid, text, numeric, text)
  TO service_role;

COMMIT;
