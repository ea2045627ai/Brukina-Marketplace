import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://supabase.co',
  'sb_publishable_rwhXMUxNgN6r01HRLxwsdg_TmIOmy92'
);

const catalog = [
  { id: 101, name: 'Heavy-Duty Anti-Shock Phone Case Combo', vendor: 'Aflao Telecom Wholesale', price: 45.00 },
  { id: 102, name: 'Premium Toughened Screen Protectors (Bulk Box)', vendor: 'Circle Matrix Electronics', price: 120.00 },
  { id: 103, name: 'USB-C Fast Charging Adapters 20W', vendor: 'Accra Digital Supply', price: 35.00 }
];

function App() {
  const [tab, setTab] = useState('dashboard');
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('momo_deposits').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setOrders(data);
    });
  }, [tab]);

  const checkout = async () => {
    setMsg('Connecting to Paystack...');
    const total = cart.reduce((sum, item) => sum + item.price, 0);
    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: total, email: 'customer@brukina.com', userId: 'dev_user_01' })
      });
      const d = await res.json();
      if (d.url) window.location.href = d.url;
    } catch (err) {
      setMsg('Initialization failed');
    }
  };

  return (
    <div style={{ padding: '24px', background: '#FDFBF7', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #231F20', paddingBottom: '12px' }}>
        <h2>🌾 BRUKINA MARKETPLACE</h2>
        <div>
          <button onClick={() => setTab('dashboard')} style={{ margin: '0 4px', padding: '8px' }}>Feed</button>
          <button onClick={() => setTab('cart')} style={{ margin: '0 4px', padding: '8px' }}>Cart ({cart.length})</button>
          <button onClick={() => setTab('orders')} style={{ margin: '0 4px', padding: '8px' }}>Ledger ({orders.length})</button>
        </div>
      </div>
      {msg && <p style={{ color: 'orange', fontWeight: 'bold' }}>{msg}</p>}
      
      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginTop: '16px' }}>
          {catalog.map(p => (
            <div key={p.id} style={{ border: '2px solid #231F20', padding: '16px', background: '#fff' }}>
              <h3>{p.name}</h3>
              <p>Vendor: {p.vendor}</p>
              <p style={{ color: '#e67e22', fontWeight: 'bold' }}>GHS {p.price.toFixed(2)}</p>
              <button onClick={() => { setCart([...cart, p]); setMsg('Added!'); setTimeout(() => setMsg(''), 1000); }} style={{ width: '100%', padding: '8px', background: '#231F20', color: '#fff' }}>Add to Cart</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'cart' && (
        <div style={{ marginTop: '16px', background: '#fff', padding: '16px', border: '2px solid #231F20' }}>
          <h3>🛒 Your Order Cart</h3>
          {cart.length === 0 ? <p>Cart is empty.</p> : (
            <div>
              <ul>{cart.map((c, i) => <li key={i}>{c.name} - GHS {c.price.toFixed(2)}</li>)}</ul>
              <h4>Total: GHS {cart.reduce((s, i) => s + i.price, 0).toFixed(2)}</h4>
              <button onClick={checkout} style={{ padding: '12px', background: '#e67e22', color: '#fff', border: 'none', fontWeight: 'bold' }}>⚡ Place Secure Order</button>
            </div>
          )}
        </div>
      )}

      {tab === 'orders' && (
        <div style={{ marginTop: '16px', background: '#fff', padding: '16px', border: '2px solid #231F20' }}>
          <h3>📋 Items Ordered Ledger Matrix</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }} border="1" cellPadding="8">
            <thead>
              <tr style={{ background: '#231F20', color: '#fff' }}>
                <th>Reference</th><th>User ID</th><th>Amount</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => (
                <tr key={idx}>
                  <td>{o.reference}</td><td>{o.user_id}</td>
                  <td style={{ color: 'green', fontWeight: 'bold' }}>GHS {parseFloat(o.amount).toFixed(2)}</td>
                  <td><span style={{ background: 'green', color: '#fff', padding: '2px 6px', borderRadius: '4px' }}>{o.status.toUpperCase()}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
