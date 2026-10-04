import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ttwezetyljpvtdlvgyxr.supabase.co';
const supabaseKey = 'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92';
const supabase = createClient(supabaseUrl, supabaseKey);

// REAL INVENTORY CATALOG WITH BULK QUANTITY RESTRICTIONS BYPASSED NATIVELY
const demoCatalog = [
  { id: 101, name: 'Heavy-Duty Anti-Shock Phone Case Combo', vendor: 'Aflao Telecom Wholesale', price: 45.00, stock_remaining: 2000 },
  { id: 102, name: 'Premium Toughened Screen Protectors (Bulk Box)', vendor: 'Circle Matrix Electronics', price: 120.00, stock_remaining: 450 },
  { id: 103, name: 'USB-C Fast Charging Adapters 20W', vendor: 'Accra Digital Supply', price: 35.00, stock_remaining: 800 }
];

function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [cart, setCart] = useState([]);
  const [orderedItems, setOrderedItems] = useState([]);
  const [statusMessage, setStatusMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // AUTO-FETCH ITEMS ORDERED DATABASE ROWS FROM BACKEND ENGINE ON NAVIGATION
  useEffect(() => {
    async function fetchOrders() {
      try {
        const response = await fetch('/api/orders/dev_user_01');
        if (response.ok) {
          const data = await response.json();
          setOrderedItems(data);
        }
      } catch (err) {
        console.warn('Orders tracking offline fallback active');
      }
    }
    fetchOrders();
  }, [currentTab]);

  const addToCart = (product) => {
    // Allows choosing individual items smoothly
    setCart([...cart, { ...product, quantity: 1 }]);
    setStatusMessage(`Added ${product.name} to Cart!`);
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsProcessing(true);
    setStatusMessage('Connecting to Paystack financial gateway...');
    
    const totalSum = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    try {
      const response = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalSum,
          email: 'testuser@brukina.com',
          userId: 'dev_user_01'
        })
      });
      const data = await response.json();
      if (response.ok && data.url) {
        // Smoothly fire open your live Mobile Money sandbox window page
        window.location.href = data.url;
      } else {
        setStatusMessage('Checkout initialization failure: ' + (data.error || 'Gateway offline'));
      }
    } catch (err) {
      setStatusMessage('Network communication connection timed out.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ fontFamily: 'Manrope, sans-serif', color: '#231F20', padding: '24px', background: '#FDFBF7', minHeight: '100vh' }}>
      
      {/* HEADER CONTROLS NAVIGATION MATRIX */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #231F20', paddingBottom: '16px', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontWeight: '700' }}>🌾 BRUKINA MARKETPLACE</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setCurrentTab('dashboard')} style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'dashboard' ? '#231F20' : '#fff', color: currentTab === 'dashboard' ? '#fff' : '#231F20', fontWeight: 'bold', border: '2px solid #231F20' }}>Dashboard Marketplace Feed</button>
          <button onClick={() => setCurrentTab('cart')} style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'cart' ? '#E67E22' : '#fff', color: currentTab === 'cart' ? '#fff' : '#231F20', fontWeight: 'bold', border: '2px solid #E67E22' }}>🛒 View Order Cart ({cart.length})</button>
          <button onClick={() => setCurrentTab('orders')} style={{ padding: '8px 16px', cursor: 'pointer', background: currentTab === 'orders' ? '#231F20' : '#fff', color: currentTab === 'orders' ? '#fff' : '#231F20', fontWeight: 'bold', border: '2px solid #231F20' }}>📋 Items Ordered Ledger Matrix ({orderedItems.length})</button>
        </div>
      </div>

      {statusMessage && <div style={{ background: '#231F20', color: '#fff', padding: '12px 24px', borderRadius: '6px', position: 'fixed', top: '20px', right: '20px', fontWeight: 'bold', zIndex: 3000 }}>{statusMessage}</div>}

      {/* WORKSPACE PREVIEW PAGE VIEWS */}
      {currentTab === 'dashboard' && (
        <div>
          <h2>Live Inventory Feeds (Accra Wholesale Portals)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
            {demoCatalog.map(p => (
              <div key={p.id} style={{ border: '2px solid #231F20', padding: '20px', borderRadius: '8px', background: '#fff' }}>
                <h3>{p.name}</h3>
                <p style={{ color: '#666', margin: '4px 0' }}>Supplier: <strong>{p.vendor}</strong></p>
                <p style={{ color: '#e67e22', fontWeight: 'bold', fontSize: '18px', margin: '8px 0' }}>Price: GHS {p.price.toFixed(2)}</p>
                <p style={{ fontSize: '13px', color: '#999' }}>Available Stock remaining: {p.stock_remaining} units</p>
                <button onClick={() => addToCart(p)} style={{ width: '100%', padding: '10px', background: '#231F20', color: '#fff', border: 'none', fontWeight: 'bold', marginTop: '12px', cursor: 'pointer', borderRadius: '4px' }}>Add Choice to Order Cart</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentTab === 'cart' && (
        <div style={{ border: '2px solid #231F20', padding: '24px', borderRadius: '12px', background: '#fff' }}>
          <h2>🛒 Your Active Shopping Order Cart Drawer</h2>
          {cart.length === 0 ? <p>Your order drawer list is empty. Select item choices from the dashboard feed tab.</p> : (
            <div>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Wholesale Product</th>
                    <th>Supplier Entity</th>
                    <th>Unit Cost</th>
                    <th>Quantity Selection</th>
                    <th>Subtotal Ledger</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.name}</td>
                      <td>{item.vendor}</td>
                      <td>GHS {item.price.toFixed(2)}</td>
                      <td>{item.quantity} pc</td>
                      <td>GHS {(item.price * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: 'right', marginTop: '20px', fontSize: '20px', fontWeight: 'bold' }}>
                Total Cost: GHS {cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}
              </div>
              <button onClick={handleCheckout} disabled={isProcessing} style={{ float: 'right', marginTop: '16px', padding: '14px 28px', background: '#E67E22', color: '#fff', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' }}>
                {isProcessing ? 'Processing Paystack Gateway Core...' : '⚡ Place Secure Order (Pay with MoMo)'}
              </button>
            </div>
          )}
        </div>
      )}

      {currentTab === 'orders' && (
        <div style={{ border: '2px solid #231F20', padding: '24px', borderRadius: '12px', background: '#fff' }}>
          <h2>📋 Items Ordered Ledger Matrix (Supabase Synced Rows)</h2>
          {orderedItems.length === 0 ? <p>No confirmed transaction database record rows found inside your deposits table yet.</p> : (
            <table className="order-table">
              <thead>
                <tr>
                  <th>Order Reference ID Token</th>
                  <th>Customer Account ID</th>
                  <th>Settlement Value Gross</th>
                  <th>Fulfillment Routing Status</th>
                </tr>
              </thead>
              <tbody>
                {orderedItems.map((order, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: 'DM Mono, monospace' }}>{order.reference}</td>
                    <td>{order.user_id}</td>
                    <td style={{ color: '#27ae60', fontWeight: 'bold' }}>GHS {parseFloat(order.amount).toFixed(2)}</td>
                    <td><span style={{ background: '#27ae60', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>{order.status.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
