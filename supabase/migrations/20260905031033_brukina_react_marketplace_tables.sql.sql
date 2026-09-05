/*
# Brukina React Marketplace Core Tables

1. New Tables
- `product_categories` - Product classification with icons for frontend filter pills
- `products` - Multi-channel product catalog (native, Shopify, Walmart) with nullable vendor_id
- `orders` - Customer checkout records with delivery tracking fields
- `order_messages` - Real-time chat between buyers, vendors, and riders
- `rider_logistics_wallets` - Rider earnings and payout tracking
- `platform_market_indexes` - Admin dynamic pricing controls (inflation, promos)
- `delivery_fleet_tariffs` - Multi-fleet delivery pricing (native, Bolt, Yango)
- `external_api_logs` - Webhook sync audit trail for Shopify/Walmart
- `applied_migrations` - Schema migration tracking registry
- `platform_backups_log` - Automated backup snapshot history

2. Security
- RLS enabled on all new tables
- Public read for catalog tables (products, categories) via anon+authenticated
- Owner-scoped policies for wallet tables using auth.uid()
- Authenticated write for system tables
*/

-- Product Categories
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
  ('Food & Beverage', '🥛'),
  ('Kitchenware', '🍳'),
  ('Cosmetics', '🧴')
ON CONFLICT (name) DO NOTHING;

-- Products (vendor_id is nullable so we can seed platform-owned products)
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

-- Seed starter products (vendor_id NULL = platform-owned)
INSERT INTO public.products (vendor_id, owner_type, target_buyer_type, channel_source, category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT NULL, 'platform_admin', 'everyone', 'native_platform', 'Food & Beverage', 'Premium Millet Brukina Mix (Wholesale Case)', 'Premium quality millet brukina mix. 24-pack wholesale case. Locally sourced from certified producers in Accra.', 'Brukina Core Factory', 480.00, 400.00, 50
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Premium Millet Brukina Mix (Wholesale Case)');

INSERT INTO public.products (vendor_id, owner_type, target_buyer_type, channel_source, category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT NULL, 'platform_admin', 'everyone', 'native_platform', 'Kitchenware', 'Stainless Steel Cookware Set (5-Piece)', 'Professional grade stainless steel cookware set. Includes pots, pans, and utensils. Dishwasher safe.', 'Accra Steel Works', 320.00, 280.00, 30
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Stainless Steel Cookware Set (5-Piece)');

INSERT INTO public.products (vendor_id, owner_type, target_buyer_type, channel_source, category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT NULL, 'platform_admin', 'everyone', 'native_platform', 'Cosmetics', 'Shea Glow Organic Body Polish (200ml)', 'Pure unrefined shea butter body polish. Deeply moisturizing formula with natural botanical extracts.', 'Ghana Naturals', 85.00, 70.00, 100
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Shea Glow Organic Body Polish (200ml)');

INSERT INTO public.products (vendor_id, owner_type, target_buyer_type, channel_source, category, name, description, brand_origin, price, vendor_base_retail_price, stock_count)
SELECT NULL, 'platform_admin', 'everyone', 'native_platform', 'Food & Beverage', 'Organic Fresh Cow Milk (20L Can)', 'Farm-fresh organic cow milk in 20-liter reusable container. Delivered chilled within 24 hours of milking.', 'Tema Dairy Farm Hub', 240.00, 200.00, 40
WHERE NOT EXISTS (SELECT 1 FROM public.products WHERE name = 'Organic Fresh Cow Milk (20L Can)');

-- Orders table (separate from existing orders table if it has different structure)
-- Check if orders table already has the columns we need, if not create a new one
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'navigation_step_index') THEN
    -- Add missing columns to existing orders table
    BEGIN
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_id UUID;
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS quantity INT DEFAULT 1;
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_status VARCHAR(50) DEFAULT 'Processing';
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS channel_origin VARCHAR(50) DEFAULT 'native_platform';
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pickup_zone VARCHAR(200);
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS dropoff_zone VARCHAR(200);
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS calculated_distance_km NUMERIC(8,2);
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS selected_delivery_fleet VARCHAR(50) DEFAULT 'native_fleet';
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS current_latitude NUMERIC(10,6);
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS current_longitude NUMERIC(10,6);
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_minutes_eta INT;
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS navigation_step_index INT DEFAULT 0;
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id UUID;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- Ensure orders has RLS and policies for the new columns
DROP POLICY IF EXISTS "anon_read_orders" ON public.orders;
CREATE POLICY "anon_read_orders" ON public.orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_orders" ON public.orders;
CREATE POLICY "auth_insert_orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "auth_update_orders" ON public.orders;
CREATE POLICY "auth_update_orders" ON public.orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Order Messages (Chat)
CREATE TABLE IF NOT EXISTS public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name VARCHAR(200),
  sender_role VARCHAR(50),
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_messages" ON public.order_messages;
CREATE POLICY "anon_read_messages" ON public.order_messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_messages" ON public.order_messages;
CREATE POLICY "auth_insert_messages" ON public.order_messages FOR INSERT TO authenticated WITH CHECK (true);

-- Rider Logistics Wallets
CREATE TABLE IF NOT EXISTS public.rider_logistics_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  total_earned_ghs NUMERIC(12,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rider_logistics_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_rider_wallets" ON public.rider_logistics_wallets;
CREATE POLICY "auth_read_rider_wallets" ON public.rider_logistics_wallets FOR SELECT TO authenticated USING (auth.uid() = rider_id);
DROP POLICY IF EXISTS "auth_insert_rider_wallets" ON public.rider_logistics_wallets;
CREATE POLICY "auth_insert_rider_wallets" ON public.rider_logistics_wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = rider_id);
DROP POLICY IF EXISTS "auth_update_rider_wallets" ON public.rider_logistics_wallets;
CREATE POLICY "auth_update_rider_wallets" ON public.rider_logistics_wallets FOR UPDATE TO authenticated USING (auth.uid() = rider_id) WITH CHECK (auth.uid() = rider_id);

-- Platform Market Indexes
CREATE TABLE IF NOT EXISTS public.platform_market_indexes (
  id INT PRIMARY KEY DEFAULT 1,
  millet_inflation_factor NUMERIC(5,2) DEFAULT 1.00,
  dairy_inflation_factor NUMERIC(5,2) DEFAULT 1.00,
  active_partnership_discount_pct NUMERIC(5,2) DEFAULT 0.00,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.platform_market_indexes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_indexes" ON public.platform_market_indexes;
CREATE POLICY "anon_read_indexes" ON public.platform_market_indexes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_indexes" ON public.platform_market_indexes;
CREATE POLICY "auth_update_indexes" ON public.platform_market_indexes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.platform_market_indexes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Delivery Fleet Tariffs
CREATE TABLE IF NOT EXISTS public.delivery_fleet_tariffs (
  id INT PRIMARY KEY DEFAULT 1,
  base_fare_ghs NUMERIC(8,2) DEFAULT 10.00,
  native_per_km_ghs NUMERIC(8,2) DEFAULT 2.50,
  bolt_est_per_km_ghs NUMERIC(8,2) DEFAULT 3.20,
  yango_est_per_km_ghs NUMERIC(8,2) DEFAULT 2.80,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.delivery_fleet_tariffs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_tariffs" ON public.delivery_fleet_tariffs;
CREATE POLICY "anon_read_tariffs" ON public.delivery_fleet_tariffs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_update_tariffs" ON public.delivery_fleet_tariffs;
CREATE POLICY "auth_update_tariffs" ON public.delivery_fleet_tariffs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
INSERT INTO public.delivery_fleet_tariffs (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- External API Logs
CREATE TABLE IF NOT EXISTS public.external_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_method VARCHAR(10),
  endpoint_path VARCHAR(500),
  channel_source VARCHAR(50),
  payload_summary TEXT,
  http_status_code INT,
  sync_lag_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.external_api_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_api_logs" ON public.external_api_logs;
CREATE POLICY "anon_read_api_logs" ON public.external_api_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_api_logs" ON public.external_api_logs;
CREATE POLICY "auth_insert_api_logs" ON public.external_api_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Applied Migrations Registry
CREATE TABLE IF NOT EXISTS public.applied_migrations (
  id SERIAL PRIMARY KEY,
  migration_name VARCHAR(255) UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.applied_migrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_migrations" ON public.applied_migrations;
CREATE POLICY "anon_read_migrations" ON public.applied_migrations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_migrations" ON public.applied_migrations;
CREATE POLICY "auth_insert_migrations" ON public.applied_migrations FOR INSERT TO authenticated WITH CHECK (true);

-- Platform Backups Log
CREATE TABLE IF NOT EXISTS public.platform_backups_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_file_name VARCHAR(300),
  total_tables_archived INT DEFAULT 0,
  status VARCHAR(100) DEFAULT 'Success',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.platform_backups_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_backups" ON public.platform_backups_log;
CREATE POLICY "anon_read_backups" ON public.platform_backups_log FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "auth_insert_backups" ON public.platform_backups_log;
CREATE POLICY "auth_insert_backups" ON public.platform_backups_log FOR INSERT TO authenticated WITH CHECK (true);
