import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

// UNIVERSAL REBUILT PORTAL SECURE DATA LEDGERS
const sb = createClient(
  'https://supabase.co', 
  'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92'
);

const items = [
  { id: 101, name: 'Anti-Shock Phone Case Combo', vendor: 'Aflao Wholesale', price: 45 },
  { id: 102, name: 'Premium Screen Protectors Box', vendor: 'Circle Electronics', price: 120 },
  { id: 103, name: 'USB-C Fast Chargers 20W', vendor: 'Accra Digital Supply', price: 35 }
];

function App() {
  const [tab, setTab] = useState('feed');
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // FETCH ALL DEPOSIT ROWS REGARDLESS OF USER ID FILTER STRINGS
  useEffect(() => {
    sb.from('momo_deposits')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setOrders(data);
      });
  }, [tab, cart]);

  const pay = async () => {
    setLoading(true);
    const amt = cart.reduce((s, i) => s + i.price, 0);
    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, email: 'customer@brukina.com', userId: 'dev_user_01' })
      });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
    } catch (e) {
      console.error('Connection failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif', background: '#FDFBF7', minHeight: '100vh' }}>
      {/* NAVIGATION HEADER INTERFACE CONTROLS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 10 }}>
        <h2>🌾 BRUKINA MARKETPLACE</h2>
        <div>
          <button onClick={() => setTab('feed')} style={{ margin: '0 4px', padding: 8, cursor: 'pointer' }}>Marketplace Feed</button>
          <button onClick={() => setTab('cart')} style={{ margin: '0 4px', padding: 8, cursor: 'pointer' }}>Cart Drawer ({cart.length})</button>
          <button onClick={() => setTab('orders')} style={{ margin: '0 4px', padding: 8, cursor: 'pointer' }}>📋 Ledger Matrix ({orders.length})</button>
        </div>
      </div>

      {/* DYNAMIC SCREEN VIEWS */}
      {tab === 'feed' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 15, marginTop: 20 }}>
          {items.map(p => (
            <div key={p.id} style={{ border: '2px solid #000', padding: 15, background: '#fff', borderRadius: 8 }}>
              <h4>{p.name}</h4>
              <p style={{ color: '#666' }}>Supplier: {p.vendor}</p>
              <p style={{ color: '#e67e22', fontWeight: 'bold' }}>GHS {p.price.toFixed(2)}</p>
              <button onClick={() => { setCart([...cart, p]); }} style={{ width: '100%', padding: '8px', background: '#231F20', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Add Choice to Cart</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'cart' && (
        <div style={{ marginTop: 20, background: '#fff', padding: 20, border: '2px solid #000', borderRadius: 8 }}>
          <h3>🛒 Active Order Drawer Basket</h3>
          {cart.length === 0 ? <p>Your order cart drawer basket list is empty.</p> : (
            <div>
              {cart.map((c, i) => <p key={i} style={{ padding: '6px 0', borderBottom: '1px dashed #eee' }}>{c.name} - <strong>GHS {c.price.toFixed(2)}</strong></p>)}
              <h4>Total Cumulative Cost: GHS {cart.reduce((s, i) => s + i.price, 0).toFixed(2)}</h4>
              <button onClick={pay} disabled={loading} style={{ padding: '12px 24px', background: '#E67E22', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
                {loading ? 'Connecting Paystack Core...' : '⚡ Place Secure Order (Pay with MoMo)'}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div style={{ marginTop: 20, background: '#fff', padding: 20, border: '2px solid #000', borderRadius: 8 }}>
          <h3>📋 Items Ordered Ledger Matrix (Supabase Synced Rows)</h3>
          {orders.length === 0 ? <p>No completed transaction records found inside your database tracking table rows yet.</p> : (
            <table width='100%' border='1' cellPadding='10' style={{ borderCollapse: 'collapse', marginTop: 15, border: '1px solid #eae0d5' }}>
              <thead>
                <tr style={{ background: '#231F20', color: '#fff' }}>
                  <th>Order Reference ID Token</th>
                  <th>Customer Account ID</th>
                  <th>Settlement Value Gross</th>
                  <th>Fulfillment Routing Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'monospace' }}>{o.reference}</td>
                    <td>{o.user_id}</td>
                    <td style={{ color: '#27ae60', fontWeight: 'bold' }}>GHS {parseFloat(o.amount).toFixed(2)}</td>
                    <td><span style={{ background: '#27ae60', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: '12px', fontWeight: 'bold' }}>{o.status ? o.status.toUpperCase() : 'SUCCESS'}</span></td>
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
