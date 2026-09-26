import React, { useState } from 'react';
import { supabase } from './lib/supabaseClient';

export default function ProductCatalog({ 
  catalog = [], 
  query = '', 
  page = 'dashboard', 
  onNavigate, 
  user, 
  role, 
  onLogout 
}) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [viewProduct, setViewProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  // Vendor inventory form fields
  const [newProductName, setNewProductName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newCategory, setNewCategory] = useState('grain');

  // Simulated live courier dispatch logs state updates
  const [activeDeliveries, setActiveDeliveries] = useState([
    { id: 'DLV-401', route: 'Urban Hub A → Area 12 Logistics', status: 'In Transit', eta: 14, payout: 15.50 },
    { id: 'DLV-902', route: 'Rural Supply Depot 3 → Coastal Hub', status: 'Pending Pickup', eta: 35, payout: 28.00 }
  ]);

  // LOCAL DATA FALLBACK: broad marketplace catalog for demos and empty databases
  const localProducts = [
    // FOOD & AGRICULTURE
    { id: 'mock-1', product_name: 'Premium White Maize', description: 'High-quality local white maize grains, dried and well-bagged for wholesale supply.', price: 4.50, category: 'grain', vendor_name: 'Tamale Supply Hub' },
    { id: 'mock-2', product_name: 'Polished Long-Grain Rice', description: 'Clean locally harvested long-grain rice for homes, restaurants and resale.', price: 6.20, category: 'grain', vendor_name: 'Techiman Farms' },
    { id: 'mock-3', product_name: 'Fresh Vine Tomatoes', description: 'Fresh red tomatoes carefully packed for household, restaurant and wholesale use.', price: 12.00, category: 'vegetable', vendor_name: 'Anloga Veggies' },
    { id: 'mock-4', product_name: 'Red Onions Bulk Pack', description: 'Crisp red onions sorted for long shelf life and bulk supply.', price: 8.50, category: 'vegetable', vendor_name: 'Keta Gardens' },
    { id: 'mock-5', product_name: 'Sweet MD2 Pineapples', description: 'Fresh sweet pineapples harvested on order and packed for safe transport.', price: 3.00, category: 'fruit', vendor_name: 'Somanya Orchards' },
    { id: 'mock-6', product_name: 'Fresh Plantain Bunch', description: 'Fresh Ghanaian plantains suitable for homes, restaurants and food businesses.', price: 18.00, category: 'food', vendor_name: 'Eastern Farm Hub' },
    { id: 'mock-7', product_name: 'Cooking Oil 5L', description: 'Everyday cooking oil suitable for households, restaurants and food businesses.', price: 145.00, category: 'food', vendor_name: 'MarketFresh Supplies' },
    { id: 'mock-8', product_name: 'Beans 25kg Bag', description: 'Clean quality beans packed for households, restaurants and bulk buyers.', price: 420.00, category: 'food', vendor_name: 'Northern Food Hub' },

    // BUILDING MATERIALS
    { id: 'mock-9', product_name: 'Portland Cement 50kg', description: 'General-purpose cement for foundations, blocks, plastering and construction projects.', price: 95.00, category: 'building', vendor_name: 'Accra Building Depot' },
    { id: 'mock-10', product_name: 'Concrete Blocks 6 Inch', description: 'Durable concrete blocks for walls, partitions and general construction.', price: 8.50, category: 'building', vendor_name: 'Prime Block Works' },
    { id: 'mock-11', product_name: 'Roofing Sheets 3m', description: 'Affordable corrugated roofing sheets for residential and commercial buildings.', price: 185.00, category: 'building', vendor_name: 'Akosombo Materials' },
    { id: 'mock-12', product_name: 'Binding Wire 25kg', description: 'Strong construction binding wire for reinforcement and building work.', price: 320.00, category: 'building', vendor_name: 'BuildPro Ghana' },
    { id: 'mock-13', product_name: 'Ceramic Floor Tiles', description: 'Modern affordable floor tiles for homes, offices, shops and apartments.', price: 85.00, category: 'building', vendor_name: 'HomeTile Centre' },
    { id: 'mock-14', product_name: 'Wall Paint 20L', description: 'Interior and exterior wall paint for renovation and construction projects.', price: 280.00, category: 'building', vendor_name: 'ColorHouse Supplies' },
    { id: 'mock-15', product_name: 'PVC Plumbing Pipe', description: 'Durable PVC pipe for household plumbing, drainage and water installations.', price: 38.00, category: 'plumbing', vendor_name: 'BuildPro Ghana' },
    { id: 'mock-16', product_name: 'Bathroom Sink', description: 'Modern affordable bathroom basin suitable for homes, offices and apartments.', price: 450.00, category: 'plumbing', vendor_name: 'Homeform Trade' },

    // ELECTRICAL & APPLIANCES
    { id: 'mock-17', product_name: 'LED Bulb 12W', description: 'Energy-efficient LED bulb for homes, offices, shops and outdoor spaces.', price: 18.00, category: 'electrical', vendor_name: 'PowerLine Electrical' },
    { id: 'mock-18', product_name: 'Electrical Cable Roll', description: 'Quality electrical cable for residential wiring and electrical installations.', price: 420.00, category: 'electrical', vendor_name: 'Accra Electrical Mart' },
    { id: 'mock-19', product_name: 'Digital Multimeter', description: 'Compact tester for voltage, current and resistance measurements.', price: 145.00, category: 'electrical', vendor_name: 'TechTools Ghana' },
    { id: 'mock-20', product_name: 'Rechargeable Standing Fan', description: 'Portable rechargeable fan with multiple speed settings for home and office use.', price: 480.00, category: 'appliance', vendor_name: 'HomeTech Appliances' },
    { id: 'mock-21', product_name: 'Electric Blender', description: 'Multi-purpose kitchen blender for smoothies, sauces and everyday food preparation.', price: 350.00, category: 'appliance', vendor_name: 'KitchenPro Ghana' },
    { id: 'mock-22', product_name: 'Microwave Oven', description: 'Compact microwave oven suitable for homes, offices and small businesses.', price: 980.00, category: 'appliance', vendor_name: 'HomeTech Appliances' },
    { id: 'mock-23', product_name: 'Electric Kettle', description: 'Fast-boiling electric kettle for homes, offices and hospitality businesses.', price: 220.00, category: 'appliance', vendor_name: 'HomeTech Appliances' },
    { id: 'mock-24', product_name: 'Tabletop Refrigerator', description: 'Compact refrigerator for apartments, offices, shops and small businesses.', price: 1850.00, category: 'appliance', vendor_name: 'HomeTech Appliances' },

    // PHONES & COMPUTERS
    { id: 'mock-25', product_name: 'Android Smartphone 128GB', description: 'Affordable modern smartphone with large display, dual cameras and 128GB storage.', price: 1850.00, category: 'phones', vendor_name: 'MobileHub Ghana' },
    { id: 'mock-26', product_name: 'Budget Android Phone 64GB', description: 'Reliable everyday smartphone for calls, messaging, social media and entertainment.', price: 1150.00, category: 'phones', vendor_name: 'Accra Mobile Centre' },
    { id: 'mock-27', product_name: 'Android Tablet 10 Inch', description: 'Large-screen tablet for study, entertainment, browsing and business use.', price: 1650.00, category: 'devices', vendor_name: 'Digital Market Hub' },
    { id: 'mock-28', product_name: 'Laptop 15.6 Inch', description: 'Affordable everyday laptop for business, school, browsing and office work.', price: 4200.00, category: 'computers', vendor_name: 'Computer Plaza Ghana' },
    { id: 'mock-29', product_name: 'Wireless Keyboard & Mouse', description: 'Comfortable wireless keyboard and mouse combination for computers and workstations.', price: 280.00, category: 'accessories', vendor_name: 'Northstar Accessories' },
    { id: 'mock-30', product_name: 'USB-C Fast Charger', description: 'Fast charging adapter compatible with modern USB-C phones and devices.', price: 120.00, category: 'accessories', vendor_name: 'Northstar Accessories' },
    { id: 'mock-31', product_name: 'Power Bank 20000mAh', description: 'High-capacity portable power bank for phones, tablets and USB devices.', price: 260.00, category: 'accessories', vendor_name: 'GadgetWorld Ghana' },
    { id: 'mock-32', product_name: 'Wireless Bluetooth Earbuds', description: 'Compact wireless earbuds with charging case for music and calls.', price: 220.00, category: 'accessories', vendor_name: 'GadgetWorld Ghana' },
    { id: 'mock-33', product_name: 'Smart Watch', description: 'Modern smartwatch with activity tracking, notifications and Bluetooth connectivity.', price: 390.00, category: 'devices', vendor_name: 'Digital Market Hub' },
    { id: 'mock-34', product_name: 'Bluetooth Speaker', description: 'Portable wireless speaker for home entertainment, events and outdoor use.', price: 340.00, category: 'electronics', vendor_name: 'GadgetWorld Ghana' },

    // TOOLS & EQUIPMENT
    { id: 'mock-35', product_name: 'Cordless Power Drill', description: 'Rechargeable cordless drill for household repairs, furniture and construction work.', price: 650.00, category: 'tools', vendor_name: 'ToolHouse Ghana' },
    { id: 'mock-36', product_name: 'Professional Tool Set', description: 'Multi-piece hand tool kit for mechanics, technicians and home repairs.', price: 780.00, category: 'tools', vendor_name: 'ToolHouse Ghana' },
    { id: 'mock-37', product_name: 'Adjustable Wrench Set', description: 'Durable wrench set for plumbing, mechanical and maintenance work.', price: 190.00, category: 'tools', vendor_name: 'Workshop Supply Hub' },
    { id: 'mock-38', product_name: 'Screwdriver Set', description: 'Multi-size screwdriver set for household, electrical and workshop repairs.', price: 95.00, category: 'tools', vendor_name: 'Workshop Supply Hub' },
    { id: 'mock-39', product_name: 'Wheelbarrow Heavy Duty', description: 'Heavy-duty wheelbarrow for construction sites, farms and material transport.', price: 520.00, category: 'equipment', vendor_name: 'BuildPro Ghana' },
    { id: 'mock-40', product_name: 'Water Pump 1HP', description: 'Compact water pump suitable for household, farm and general water transfer.', price: 1250.00, category: 'equipment', vendor_name: 'AgroTech Equipment' },
    { id: 'mock-41', product_name: 'Ladder 6ft', description: 'Strong household and professional ladder for maintenance and installation work.', price: 480.00, category: 'equipment', vendor_name: 'ToolHouse Ghana' },

    // SOLAR & POWER
    { id: 'mock-42', product_name: 'Solar Panel 200W', description: 'Efficient solar panel for small homes, shops, backup systems and off-grid projects.', price: 1250.00, category: 'solar', vendor_name: 'BrightGrid Energy' },
    { id: 'mock-43', product_name: 'Solar Inverter 1.5kVA', description: 'Compact inverter for solar backup and household power applications.', price: 1850.00, category: 'solar', vendor_name: 'BrightGrid Energy' },
    { id: 'mock-44', product_name: 'Portable Power Station 600W', description: 'Portable rechargeable power station for electronics and emergency backup.', price: 3280.00, category: 'power', vendor_name: 'BrightGrid Devices' },
    { id: 'mock-45', product_name: 'Rechargeable Emergency Lamp', description: 'Bright rechargeable lamp for home, shop and emergency lighting.', price: 150.00, category: 'power', vendor_name: 'BrightGrid Energy' },

    // HOME & FURNITURE
    { id: 'mock-46', product_name: 'Stainless Kitchen Tap', description: 'Modern stainless steel kitchen tap suitable for residential and commercial kitchens.', price: 610.00, category: 'home', vendor_name: 'Homeform Trade' },
    { id: 'mock-47', product_name: 'Plastic Storage Cabinet', description: 'Practical storage cabinet for bedrooms, offices, shops and utility rooms.', price: 480.00, category: 'furniture', vendor_name: 'HomeStyle Ghana' },
    { id: 'mock-48', product_name: 'Office Desk', description: 'Simple modern office desk suitable for home offices, businesses and study areas.', price: 850.00, category: 'furniture', vendor_name: 'Workspace Furniture' },
    { id: 'mock-49', product_name: 'Dining Chair', description: 'Comfortable durable chair suitable for homes, restaurants and offices.', price: 260.00, category: 'furniture', vendor_name: 'HomeStyle Ghana' },

    // AUTO
    { id: 'mock-50', product_name: 'Car Battery 12V', description: 'Reliable 12V vehicle battery for compatible cars and light commercial vehicles.', price: 950.00, category: 'auto', vendor_name: 'AutoParts Ghana' },
    { id: 'mock-51', product_name: 'Motor Oil 5L', description: 'Engine oil for routine vehicle servicing and maintenance.', price: 280.00, category: 'auto', vendor_name: 'AutoCare Supply' },
    { id: 'mock-52', product_name: 'Car Air Filter', description: 'Replacement air filter for compatible vehicles and routine maintenance.', price: 95.00, category: 'auto', vendor_name: 'AutoParts Ghana' },

    // FASHION & PERSONAL CARE
    { id: 'mock-53', product_name: 'Unisex Workwear Overshirt', description: 'Durable everyday workwear suitable for trade, warehouse and outdoor activities.', price: 290.00, category: 'fashion', vendor_name: 'Common Thread Co.' },
    { id: 'mock-54', product_name: 'Safety Work Boots', description: 'Protective work boots designed for construction, workshop and industrial environments.', price: 420.00, category: 'fashion', vendor_name: 'WorkSafe Ghana' },
    { id: 'mock-55', product_name: 'Casual Sneakers', description: 'Comfortable everyday sneakers suitable for casual wear and active lifestyles.', price: 350.00, category: 'fashion', vendor_name: 'Common Thread Co.' },
    { id: 'mock-56', product_name: 'Personal Care Starter Pack', description: 'Everyday personal care essentials packed together for convenient household use.', price: 180.00, category: 'beauty', vendor_name: 'CarePoint Ghana' }
  ];

  // Use live database catalog if it has items, otherwise use our local fallback products list
  const activeCatalog = catalog && catalog.length > 0 ? catalog : localProducts;

  // Filters workspace inventory items by search queries or category tabs
  const filteredCatalog = activeCatalog.filter(item => {
    const matchesSearch = `${item.product_name || ''} ${item.description || ''} ${item.vendor_name || ''}`
      .toLowerCase()
      .includes(query.toLowerCase());

    if (page === 'dashboard' || page === 'all') {
      return matchesSearch;
    }
    return matchesSearch && item.category === page;
  });

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !user?.id) return;

    const parsedQuantity = parseInt(quantity, 10);
    const unitPrice = Number(selectedProduct.price);
    const total = unitPrice * parsedQuantity;

    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setNotice('Please enter a valid quantity.');
      return;
    }

    if (!selectedProduct.id || String(selectedProduct.id).startsWith('mock-')) {
      setNotice('This product is a local demo item and cannot be ordered. Please choose a live marketplace item.');
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      setNotice('This product has an invalid price.');
      return;
    }

    setIsSubmitting(true);
    setNotice('Creating your order...');

    try {
      const orderNumber = `BRK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          order_number: orderNumber,
          customer_id: user.id,
          total,
          status: 'pending'
        }])
        .select('id, order_number, status, total, created_at')
        .single();

      if (orderError) throw orderError;

      const { error: itemError } = await supabase
        .from('order_items')
        .insert([{
          order_id: order.id,
          inventory_id: selectedProduct.id,
          quantity: parsedQuantity,
          unit_price: unitPrice
        }]);

      if (itemError) throw itemError;

      setNotice(`Order ${order.order_number} created successfully. Opening your orders...`);

      setTimeout(() => {
        setNotice('');
        setSelectedProduct(null);
        setQuantity(1);

        if (onNavigate) {
          onNavigate('orders');
        }
      }, 1200);

    } catch (error) {
      console.error('Order creation error:', error);
      setNotice(`Order failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddProduct = (e) => {
    e.preventDefault();
    if (!newProductName || !newPrice) return;

    setIsSubmitting(true);
    setNotice('Adding item locally...');

    setTimeout(() => {
      setIsSubmitting(false);
      setNotice(`📦 Listing created! "${newProductName}" added successfully.`);
      setNewProductName('');
      setNewDescription('');
      setNewPrice('');
      setNewCategory('grain');
      setTimeout(() => setNotice(''), 3000);
    }, 1200);
  };

  const handleAcceptDelivery = (deliveryId) => {
    setNotice(`🚚 Route ${deliveryId} assigned to your profile! Driving tracking active.`);
    setActiveDeliveries(prev => 
      prev.map(d => d.id === deliveryId ? { ...d, status: 'Departing Hub', eta: d.eta - 2 } : d)
    );
    setTimeout(() => setNotice(''), 3000);
  };

  const isVendor = role === 'vendor';
  const isCourier = role === 'driver' || role === 'rider';

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px', position: 'relative' }}>
      
      {/* Dynamic Status Notification Overlay banner */}
      {notice && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', background: '#231F20', color: '#fff', padding: '16px 24px', borderRadius: '8px', zIndex: 2000, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', fontWeight: 'bold' }}>
          {notice}
        </div>
      )}

      {/* Top Banner Row */}
      <div className="hub-banner" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div className="hub-card" onClick={() => onNavigate('dashboard')} style={{ flex: 1, background: '#231F20', color: '#fff', padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Urban hubs</h3>
            <small style={{ color: '#aaa' }}>Best wholesale rates</small>
          </div>
          <span>&gt;</span>
        </div>
        
        <div className="hub-card rural" onClick={() => onNavigate('dashboard')} style={{ flex: 1, background: '#FFFDFC', color: '#333', border: '1px solid #EAE0D5', padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Rural markets</h3>
            <small style={{ color: '#777' }}>Local & regional supply</small>
          </div>
          <span>&gt;</span>
        </div>
      </div>

      {/* 📦 VENDOR CONTROL OVERVIEW BOARD PANEL */}
      {isVendor && (
        <div style={{ background: '#FFFDFC', border: '1px solid #EAE0D5', borderRadius: '12px', padding: '24px', marginBottom: '32px' }}>
          <h2 style={{ margin: '0 0 8px 0', color: '#231F20' }}>Vendor Console</h2>
          <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px 0' }}>List new marketplace inventory items directly to your live marketplace workspace feed.</p>
          
          <form onSubmit={handleAddProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 'bold' }}>
              Product Name
              <input type="text" value={newProductName} onChange={e => setNewProductName(e.target.value)} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #EAE0D5' }} placeholder="e.g. White Maize" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 'bold' }}>
              Description
              <input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #EAE0D5' }} placeholder="e.g. Premium local grade grains" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 'bold' }}>
              Wholesale Price ($)
              <input type="number" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} required style={{ padding: '10px', borderRadius: '6px', border: '1px solid #EAE0D5' }} placeholder="0.00" />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '14px', fontWeight: 'bold' }}>
              Category Tag
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #EAE0D5', background: '#fff' }}>
                <option value="grain">Grains & Cereals</option>
                <option value="vegetable">Vegetables</option>
                <option value="fruit">Fruits</option>
              </select>
            </label>
            <button type="submit" disabled={isSubmitting} style={{ padding: '12px', background: '#C85A32', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
              {isSubmitting ? 'Listing...' : 'Publish Product'}
            </button>
          </form>
        </div>
      )}

      {/* 🚚 COURIER LIVE TRACKING DISPATCH PANEL */}
      {isCourier && (
        <div style={{ background: '#FFFDFC', border: '1px solid #EAE0D5', borderRadius: '12px', padding: '24px', marginBottom: '32px' }}>
          <h2 style={{ margin: '0 0 4px 0', color: '#231F20' }}>Courier Dispatch Board</h2>
          <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px 0' }}>Manage assigned logistics runs, examine payouts, and update order fulfillment ETAs.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeDeliveries.map(delivery => (
              <div key={delivery.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', border: '1px solid #EAE0D5', padding: '16px', borderRadius: '8px' }}>
                <div>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#C85A32', background: '#FFFDFC', padding: '4px 8px', borderRadius: '4px', border: '1px solid #EAE0D5', marginRight: '12px' }}>{delivery.id}</span>
                  <strong style={{ fontSize: '15px', color: '#231F20' }}>{delivery.route}</strong>
                  <div style={{ marginTop: '6px', fontSize: '13px', color: '#666' }}>
                    <button 
                      onClick={() => handleAcceptDelivery(delivery.id)} 
                      style={{ padding: '10px 16px', background: '#231F20', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      Accept Route
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid Header Title */}
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>{isVendor ? 'Your Listed Items' : isCourier ? 'Marketplace Supply Reference' : 'Browse Categories'}</h2>
        <span style={{ color: '#C85A32', cursor: 'pointer', fontSize: '14px' }} onClick={() => onNavigate('dashboard')}>View all &rarr;</span>
      </div>

      <div className="tab-container" style={{ display: 'flex', gap: '10px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
        <button className={`tab-btn ${page === 'dashboard' ? 'active' : ''}`} onClick={() => onNavigate('dashboard')}>All products</button>
        <button className={`tab-btn ${page === 'grain' ? 'active' : ''}`} onClick={() => onNavigate('grain')}>Grains & Cereals</button>
        <button className={`tab-btn ${page === 'vegetable' ? 'active' : ''}`} onClick={() => onNavigate('vegetable')}>Vegetables</button>
        <button className={`tab-btn ${page === 'fruit' ? 'active' : ''}`} onClick={() => onNavigate('fruit')}>Fruits</button>
      </div>
      <div
        className="deals-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '22px',
          marginBottom: '48px',
          color: '#333'
        }}
      >
        {filteredCatalog && filteredCatalog.length > 0 ? (
          filteredCatalog.map((item, index) => {
            const category = (item.category || 'product').toLowerCase();
            const visualThemes = {
              grain: { icon: '🌾', label: 'Grains & Cereals' },
              vegetable: { icon: '🥬', label: 'Vegetables' },
              fruit: { icon: '🍍', label: 'Fresh Fruits' },
              'food & beverage': { icon: '🥗', label: 'Food & Beverage' },
              kitchenware: { icon: '🍳', label: 'Kitchenware' },
              cosmetics: { icon: '✨', label: 'Cosmetics' }
            };

            const theme = visualThemes[category] || { icon: '🛍️', label: item.category || 'Marketplace' };

            return (
              <article
                key={item.id || item.product_name}
                className="product-card"
                style={{
                  overflow: 'hidden',
                  border: '1px solid #eee5dc',
                  borderRadius: '20px',
                  background: '#fff',
                  boxShadow: '0 8px 28px rgba(35,31,32,0.07)',
                  transition: 'transform .2s ease, box-shadow .2s ease',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div
                  style={{
                    minHeight: '170px',
                    padding: '24px',
                    background: 'linear-gradient(135deg, #f8efe7 0%, #fff8f2 55%, #f2eee9 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                  }}
                >
                  <div
                    style={{
                      width: '112px',
                      height: '112px',
                      borderRadius: '50%',
                      background: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '58px',
                      boxShadow: '0 10px 28px rgba(35,31,32,0.10)'
                    }}
                  >
                    {theme.icon}
                  </div>

                  <span
                    style={{
                      position: 'absolute',
                      top: '14px',
                      left: '14px',
                      padding: '7px 11px',
                      borderRadius: '999px',
                      background: '#231F20',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: '800',
                      letterSpacing: '.3px'
                    }}
                  >
                    {theme.label}
                  </span>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '18px', lineHeight: 1.25, color: '#231F20' }}>
                      {item.product_name}
                    </h3>
                  </div>

                  <p
                    style={{
                      margin: '10px 0 16px',
                      color: '#6d6865',
                      fontSize: '13px',
                      lineHeight: 1.55,
                      minHeight: '42px'
                    }}
                  >
                    {item.description || 'Quality marketplace product available from a verified supplier.'}
                  </p>

                  <div style={{ marginTop: 'auto' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-end',
                        gap: '12px',
                        marginBottom: '16px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '3px' }}>
                          Starting price
                        </div>
                        <strong style={{ fontSize: '23px', color: '#C85A32' }}>
                          ${Number(item.price || 0).toFixed(2)}
                        </strong>
                      </div>

                      <div style={{ textAlign: 'right', maxWidth: '120px' }}>
                        <div style={{ fontSize: '11px', color: '#999', marginBottom: '3px' }}>
                          Supplier
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: '#403b39' }}>
                          {item.vendor_name || 'Marketplace Seller'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px' }}>
                      <button
                        onClick={() => setViewProduct(item)}
                        style={{
                          padding: '11px 10px',
                          border: '1px solid #ded5cd',
                          background: '#fff',
                          color: '#231F20',
                          borderRadius: '11px',
                          cursor: 'pointer',
                          fontWeight: '800',
                          fontSize: '12px'
                        }}
                      >
                        View product
                      </button>

                      {!isVendor && !isCourier && (
                        <button
                          onClick={() => {
                            setSelectedProduct(item);
                            setQuantity(1);
                          }}
                          style={{
                            padding: '11px 10px',
                            background: '#231F20',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '11px',
                            cursor: 'pointer',
                            fontWeight: '800',
                            fontSize: '12px'
                          }}
                        >
                          Buy now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div
            style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: '#999',
              padding: '60px 0'
            }}
          >
            No products found matching your search.
          </div>
        )}
      </div>

      {viewProduct && (
        <div
          onClick={() => setViewProduct(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,16,14,.58)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 1100
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              borderRadius: '24px',
              boxShadow: '0 24px 80px rgba(0,0,0,.25)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                minHeight: '220px',
                background: 'linear-gradient(135deg, #f8efe7, #fff8f2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
            >
              <div style={{ fontSize: '100px' }}>
                {(
                  {
                    grain: '🌾',
                    vegetable: '🥬',
                    fruit: '🍍',
                    'food & beverage': '🥗',
                    kitchenware: '🍳',
                    cosmetics: '✨'
                  }[(viewProduct.category || '').toLowerCase()] || '🛍️'
                )}
              </div>

              <button
                onClick={() => setViewProduct(null)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'rgba(35,31,32,.9)',
                  color: '#fff',
                  fontSize: '22px',
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '28px' }}>
              <div style={{ fontSize: '12px', color: '#C85A32', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '.8px' }}>
                {viewProduct.category || 'Marketplace Product'}
              </div>

              <h2 style={{ margin: '8px 0 10px', color: '#231F20', fontSize: '30px' }}>
                {viewProduct.product_name}
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', marginBottom: '22px' }}>
                <strong style={{ fontSize: '28px', color: '#C85A32' }}>
                  ${Number(viewProduct.price || 0).toFixed(2)}
                </strong>
                <span style={{ color: '#666', fontSize: '13px' }}>
                  Sold by <strong>{viewProduct.vendor_name || 'Marketplace Seller'}</strong>
                </span>
              </div>

              <div
                style={{
                  padding: '18px',
                  borderRadius: '16px',
                  background: '#faf7f3',
                  marginBottom: '24px'
                }}
              >
                <h4 style={{ margin: '0 0 8px', color: '#231F20' }}>Product overview</h4>
                <p style={{ margin: 0, color: '#625d59', lineHeight: 1.7, fontSize: '14px' }}>
                  {viewProduct.description || 'This marketplace product is supplied through Brukina Marketplace. Product availability, pricing and supplier information are shown from the current marketplace listing.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
                <span style={{ padding: '8px 12px', borderRadius: '999px', background: '#f1ebe5', color: '#514b47', fontSize: '12px', fontWeight: '700' }}>
                  Verified marketplace listing
                </span>
                <span style={{ padding: '8px 12px', borderRadius: '999px', background: '#f1ebe5', color: '#514b47', fontSize: '12px', fontWeight: '700' }}>
                  Supplier: {viewProduct.vendor_name || 'Marketplace Seller'}
                </span>
              </div>

              {!isVendor && !isCourier && (
                <button
                  onClick={() => {
                    setSelectedProduct(viewProduct);
                    setQuantity(1);
                    setViewProduct(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '15px',
                    background: '#C85A32',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '13px',
                    cursor: 'pointer',
                    fontWeight: '800',
                    fontSize: '15px'
                  }}
                >
                  Buy this product →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedProduct && !isVendor && !isCourier && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 1000 }}>
          <div style={{ width: '100%', maxWidth: '400px', background: '#fff', height: '100%', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0 }}>Review Order</h3>
                <button onClick={() => setSelectedProduct(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#999' }}>&times;</button>
              </div>
              <div style={{ borderBottom: '1px solid #EAE0D5', paddingBottom: '16px', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 4px 0' }}>{selectedProduct.product_name}</h4>
                <p style={{ color: '#666', fontSize: '14px', margin: '0 0 8px 0' }}>{selectedProduct.description}</p>
                <small style={{ color: '#999' }}>Vendor: {selectedProduct.vendor_name}</small>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Quantity</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{ padding: '6px 12px', border: '1px solid #EAE0D5', background: '#fff', borderRadius: '4px', cursor: 'pointer' }}>-</button>
                  <span style={{ minWidth: '40px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>{quantity}</span>
                  <button type="button" onClick={() => setQuantity(quantity + 1)} style={{ padding: '6px 12px', border: '1px solid #EAE0D5', background: '#fff', borderRadius: '4px', cursor: 'pointer' }}>+</button>
                </div>
              </div>
            </div>
            <div>
              <div style={{ borderTop: '1px solid #EAE0D5', paddingTop: '16px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#666' }}>
                  <span>Item price:</span>
                  <span>${selectedProduct.price}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px', color: '#231F20' }}>
                  <span>Total cost:</span>
                  <span style={{ color: '#C85A32' }}>${(selectedProduct.price * quantity).toFixed(2)}</span>
                </div>
              </div>
              <button onClick={handleCheckout} disabled={isSubmitting} style={{ width: '100%', padding: '14px', background: '#C85A32', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>
                {isSubmitting ? 'Confirming order...' : 'Place Secure Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #EAE0D5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Connected: <strong>{user?.email || 'Guest'}</strong> ({role || 'User'})</span>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#C85A32', cursor: 'pointer', fontWeight: 'bold' }}>Logout</button>
      </footer>
    </div>
  );
}
