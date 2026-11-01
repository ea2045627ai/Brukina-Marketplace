BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_order_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('retail', 'wholesale')),
  channel text NOT NULL CHECK (channel = 'sms'),
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'failed')),
  provider_reference text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, notification_type, channel)
);

CREATE INDEX IF NOT EXISTS marketplace_order_notifications_status_created_idx
  ON public.marketplace_order_notifications (status, created_at);

ALTER TABLE public.marketplace_order_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.marketplace_order_notifications
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.marketplace_order_notifications TO service_role;

CREATE OR REPLACE FUNCTION public.claim_marketplace_order_sms(p_order_id uuid)
RETURNS TABLE (notification_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_notification_id uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
  END IF;
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'order ID is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.marketplace_order_notifications (
    order_id, notification_type, channel, status
  )
  SELECT
    orders.id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.order_items AS order_items
        JOIN public.marketplace_inventory AS inventory
          ON inventory.id = order_items.inventory_id
        WHERE order_items.order_id = orders.id
          AND (
            inventory.is_wholesale
            OR inventory.tags @> ARRAY['wholesale']::text[]
          )
      ) THEN 'wholesale'
      ELSE 'retail'
    END,
    'sms',
    'sending'
  FROM public.orders AS orders
  JOIN public.marketplace_order_payments AS payment
    ON payment.order_id = orders.id
  WHERE orders.id = p_order_id
    AND orders.status IN ('confirmed', 'processing', 'packed', 'out_for_delivery', 'delivered')
    AND payment.payment_status = 'paid'
  ON CONFLICT (order_id, notification_type, channel)
  DO UPDATE SET
    status = 'sending',
    error_message = NULL,
    provider_reference = NULL,
    updated_at = now()
  WHERE public.marketplace_order_notifications.status = 'failed'
  RETURNING id INTO v_notification_id;

  IF v_notification_id IS NOT NULL THEN
    RETURN QUERY SELECT v_notification_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_marketplace_order_sms(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_order_sms(uuid)
  TO service_role;

COMMIT;
