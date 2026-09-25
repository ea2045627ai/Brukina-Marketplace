-- BRUKINA ACCRA HUB - FOUNDATIONAL SCHEMA MIGRATION SCRIPT
-- Path: supabase/schema.sql
-- Run this core file first to initialize structural tables and RLS boundaries error-free.

CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  icon VARCHAR(10) DEFAULT '📦',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_categories" ON public.product_categories;
CREATE POLICY "anon_read_categories" ON public.product_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_categories" ON public.product_categories;
CREATE POLICY "auth_insert_categories" ON public.product_categories FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_categories" ON public.product_categories;
CREATE POLICY "auth_update_categories" ON public.product_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.product_categories (name, icon) VALUES
  ('Food & Beverage', '🥛'), ('Kitchenware', '🍳'), ('Cosmetics', '🧴')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_type VARCHAR(50) DEFAULT 'platform_admin',
  target_buyer_type VARCHAR(50) DEFAULT 'everyone',
  channel_source VARCHAR(50) DEFAULT 'native_platform',
  external_variant_id VARCHAR(200),
  category VARCHAR(100) NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  brand_origin VARCHAR(100) DEFAULT 'Brukina Core',
  price NUMERIC(12,2) DEFAULT 0.00,
  vendor_base_retail_price NUMERIC(12,2) DEFAULT 0.00,
  stock_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_products" ON public.products;
CREATE POLICY "anon_read_products" ON public.products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_products" ON public.products;
CREATE POLICY "auth_insert_products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_products" ON public.products;
CREATE POLICY "auth_update_products" ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_delete_products" ON public.products;
CREATE POLICY "auth_delete_products" ON public.products FOR DELETE TO authenticated USING (true);

INSERT INTO public.products (category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT 'Food & Beverage', 'Premium Millet Brukina Mix (Wholesale Case)', 'Premium quality millet brukina mix. 24-pack wholesale case.', 'Brukina Core Factory', 480.00, 400.00, 50
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Premium Millet Brukina Mix (Wholesale Case)');

INSERT INTO public.products (category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT 'Kitchenware', 'Stainless Steel Cookware Set (5-Piece)', 'Professional grade stainless steel cookware set.', 'Accra Steel Works', 320.00, 280.00, 30
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Stainless Steel Cookware Set (5-Piece)');

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  quantity INT DEFAULT 1,
  total_amount NUMERIC(12,2) DEFAULT 0.00,
  delivery_fee NUMERIC(12,2) DEFAULT 0.00,
  order_status VARCHAR(50) DEFAULT 'Processing',
  channel_origin VARCHAR(50) DEFAULT 'native_platform',
  pickup_zone VARCHAR(200),
  dropoff_zone VARCHAR(200),
  calculated_distance_km NUMERIC(8,2),
  selected_delivery_fleet VARCHAR(50) DEFAULT 'native_fleet',
  current_latitude NUMERIC(10,6),
  current_longitude NUMERIC(10,6),
  estimated_minutes_eta INT,
  navigation_step_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;
CREATE POLICY "anon_read_orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
CREATE POLICY "auth_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;
CREATE POLICY "auth_update_orders" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_messages" ON public.order_messages;
CREATE POLICY "auth_read_messages" ON public.order_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_messages" ON public.order_messages;
CREATE POLICY "auth_insert_messages" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

CREATE TABLE IF NOT EXISTS public.rider_logistics_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_earned_ghs NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_market_indexes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  millet_inflation_factor NUMERIC(4,2) DEFAULT 1.00,
  dairy_inflation_factor NUMERIC(4,2) DEFAULT 1.00,
  active_partnership_discount_pct NUMERIC(4,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.delivery_fleet_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_code VARCHAR(50) UNIQUE NOT NULL,
  base_fare_ghs NUMERIC(8,2) NOT NULL,
  per_km_multiplier NUMERIC(8,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_source VARCHAR(100) NOT NULL,
  endpoint_url TEXT NOT NULL,
  status_code VARCHAR(10) NOT NULL,
  payload_dump TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.applied_migrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_name VARCHAR(250) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_backups_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_file_name VARCHAR(250) NOT NULL,
  total_tables_archived INT NOT NULL,
  status VARCHAR(50) DEFAULT 'Success',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.rider_logistics_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_market_indexes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_fleet_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_backups_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_logistics" ON public.rider_logistics_wallets;
CREATE POLICY "allow_all_logistics" ON public.rider_logistics_wallets FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_indexes" ON public.platform_market_indexes;
CREATE POLICY "allow_all_indexes" ON public.platform_market_indexes FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_tariffs" ON public.delivery_fleet_tariffs;
CREATE POLICY "allow_all_tariffs" ON public.delivery_fleet_tariffs FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_api_logs" ON public.external_api_logs;
CREATE POLICY "allow_all_api_logs" ON public.external_api_logs FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_migrations" ON public.applied_migrations;
CREATE POLICY "allow_all_migrations" ON public.applied_migrations FOR ALL TO authenticated USING (true);
DROP POLICY IF EXISTS "allow_all_backups" ON public.platform_backups_log;
CREATE POLICY "allow_all_backups" ON public.platform_backups_log FOR ALL TO authenticated USING (true);
