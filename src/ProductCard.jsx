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

  // LOCAL DATA FALLBACK: If the database table is empty, we force these products to display
  const localProducts = [
    { id: 'mock-1', product_name: 'Premium White Maize', description: 'High-quality local white maize grains, dried and well-bagged. Perfect for wholesale.', price: 4.50, category: 'grain', vendor_name: 'Tamale Supply Hub' },
    { id: 'mock-2', product_name: 'Polished Long-Grain Rice', description: 'Locally harvested long-grain brown rice. Organic and completely stones-free.', price: 6.20, category: 'grain', vendor_name: 'Techiman Farms' },
    { id: 'mock-3', product_name: 'Fresh Vine Tomatoes', description: 'Plump red tomatoes straight from the farm. Packed in boxes for transit safety.', price: 12.00, category: 'vegetable', vendor_name: 'Anloga Veggies' },
    { id: 'mock-4', product_name: 'Red Onions (Bulk)', description: 'Sharp, crisp red onions sorted for long shelf life. Available by the bag.', price: 8.50, category: 'vegetable', vendor_name: 'Keta Gardens' },
    { id: 'mock-5', product_name: 'Sweet MD2 Pineapples', description: 'Export-quality sweet pineapples. Harvested fresh on order.', price: 3.00, category: 'fruit', vendor_name: 'Somanya Orchards' }
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
    if (!selectedProduct) return;
    
    setIsSubmitting(true);
    setNotice('Processing order locally...');
    
    setTimeout(() => {
      setIsSubmitting(false);
      setNotice(`🎉 Order successful! Purchased ${quantity}x ${selectedProduct.product_name}.`);
      setTimeout(() => {
        setNotice('');
        setSelectedProduct(null);
        setQuantity(1);
      }, 3000);
    }, 1500);
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
      <div className="deals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '48px', color: '#333' }}>
        {filteredCatalog && filteredCatalog.length > 0 ? (
          filteredCatalog.map(item => (
            <div key={item.id || item.product_name} className="product-card" style={{ border: '1px solid #EAE0D5', borderRadius: '12px', padding: '16px', background: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ margin: '0 0 8px 0' }}>{item.product_name}</h4>
                <p style={{ fontSize: '14px', color: '#666', margin: '0 0 12px 0' }}>{item.description}</p>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 'bold', color: '#C85A32', fontSize: '18px' }}>${item.price}</span>
                  <span style={{ fontSize: '12px', color: '#999' }}>{item.vendor_name || 'My Store'}</span>
                </div>
                {!isVendor && !isCourier && (
                  <button onClick={() => { setSelectedProduct(item); setQuantity(1); }} style={{ width: '100%', padding: '10px', background: '#231F20', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Buy Now
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: '40px 0' }}>No products found matching your search.</div>
        )}
      </div>

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
