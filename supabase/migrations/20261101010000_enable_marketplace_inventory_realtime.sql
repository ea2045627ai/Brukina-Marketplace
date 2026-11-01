BEGIN;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'marketplace_inventory'
  ) THEN
    ALTER PUBLICATION supabase_realtime
      ADD TABLE public.marketplace_inventory;
  END IF;
END;
$migration$;

COMMIT;