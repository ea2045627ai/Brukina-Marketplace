/*
# Brukina Marketplace Starter Inventory

Inserts the starter catalog products into marketplace_inventory with real product images.
These rows serve as the initial catalog shown to customers when the marketplace goes live.

Products:
1. Premium roofing sheets - Building materials
2. Leeknives utility knife set - Tools & equipment
3. Solar power station 600W - Devices & gadgets
4. USB-C fast charge kit - Accessories & body products
5. Unisex workwear overshirt - Clothing
6. Stainless kitchen tap - Home & living

Notes:
- All products start active=true for immediate visibility
- Prices in GHS (Ghanaian Cedi)
- Stock quantities set for wholesale availability
- Images sourced from Pexels (license-free stock photography)
*/

insert into public.marketplace_inventory (product_name, vendor_name, category, price, price_display, badge, image_url, source_channel, source_country, stock_quantity, minimum_order_quantity, active)
values
  ('Premium roofing sheets', 'Akosombo Materials', 'Building materials', 1850, 'GH₵ 1,850.00', 'WHOLESALE', 'https://images.pexels.com/photos/48895/roof-plate-tiles-brick-black-48895.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'direct_vendor', 'Ghana', 500, 1, true),
  ('Leeknives utility knife set', 'Leeknives Supply Co.', 'Tools & equipment', 420, 'GH₵ 420.00', 'TRADE PRICE', 'https://images.pexels.com/photos/237997/pexels-photo-237997.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'american_brand', 'USA', 200, 1, true),
  ('Solar power station 600W', 'BrightGrid Devices', 'Devices & gadgets', 3280, 'GH₵ 3,280.00', 'BEST VALUE', 'https://images.pexels.com/photos/9799719/pexels-photo-9799719.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'shopify', 'Global', 150, 1, true),
  ('USB-C fast charge kit', 'Northstar Accessories', 'Accessories & body products', 185, 'GH₵ 185.00', 'BULK DEAL', 'https://images.pexels.com/photos/3921707/pexels-photo-3921707.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'american_brand', 'USA', 1000, 1, true),
  ('Unisex workwear overshirt', 'Common Thread Co.', 'Clothing', 290, 'GH₵ 290.00', 'NEW ARRIVAL', 'https://images.pexels.com/photos/4483944/pexels-photo-4483944.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'sourcing_network', 'Ghana', 300, 1, true),
  ('Stainless kitchen tap', 'Homeform Trade', 'Home & living', 610, 'GH₵ 610.00', 'CONTAINER RATE', 'https://images.pexels.com/photos/37771020/pexels-photo-37771020.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', 'made_in_china', 'China', 400, 1, true)
on conflict (id) do nothing;
