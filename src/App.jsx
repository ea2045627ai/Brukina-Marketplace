import { useEffect, useState } from 'react';
import { executeDatabaseLogin, validateSignupForm } from '../lib/validation.mjs';
import { supabase, supabaseConfigMissing } from './lib/supabaseClient';
import { useCourierLocation } from './lib/useCourierLocation';

const roles = ['customer', 'vendor', 'driver', 'rider'];

// 1. One clean definition for active store tracking tags
const CATEGORIES = [
  { id: 'dashboard', label: 'All products', path: '/' },
  { id: 'heavy-machinery', label: 'Heavy Machinery', path: '/heavy-machinery' },
  { id: 'mobile-usage', label: 'Mobile Usage', path: '/mobile-usage' },
  { id: 'food-groceries', label: 'Food & Groceries', path: '/food-groceries' },
  { id: 'home-appliances', label: 'Appliances', path: '/home-appliances' },
  { id: 'building-materials', label: 'Building Materials', path: '/building-materials' },
  { id: 'electricals', label: 'Electricals', path: '/electricals' },
  { id: 'accessories', label: 'All Accessories', path: '/accessories' }
];

const pageForPath = (path) => {
  if (path === '/login') return 'login';
  if (path === '/signup') return 'signup';
  if (path.includes('vendor')) return 'inventory';
  if (path.includes('rider') || path.includes('driver')) return 'dispatch';
  if (path.includes('wallet')) return 'wallet';
  if (path.includes('orders')) return 'orders';
  if (path.includes('profile')) return 'profile';
  
  const segment = path.split('/').pop();
  if (CATEGORIES.some(cat => cat.id === segment)) {
    return segment;
  }
  return 'dashboard';
};

function App() {
  const [page, setPage] = useState(() => pageForPath(location.pathname));
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('customer');
  
  const navigate = (next) => {
    const path = ['login', 'signup'].includes(next) ? `/${next}` : `/dashboard/${next}`;
    history.pushState({}, '', path);
    setPage(next);
  };

  useEffect(() => {
    const onPopState = () => setPage(pageForPath(location.pathname));
    window.addEventListener('popstate', onPopState);
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setUser(data.session.user);
          setRole(data.session.user.user_metadata?.role || 'customer');
        }
      });
    }
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (supabaseConfigMissing) return <ConfigurationNotice />;
  
  if (page === 'login' || page === 'signup') {
    return (
      <Auth 
        mode={page} 
        onNavigate={navigate} 
        onSuccess={(nextUser, nextRole) => { 
          setUser(nextUser); 
          setRole(nextRole); 
          navigate('dashboard'); 
        }} 
      />
    );
  }
  
  if (!user) {
    return (
      <Auth 
        mode="login" 
        onNavigate={navigate} 
        onSuccess={(nextUser, nextRole) => { 
          setUser(nextUser); 
          setRole(nextRole); 
          navigate('dashboard'); 
        }} 
      />
    );
  }
  
  return (
    <Workspace 
      page={page} 
      role={role} 
      user={user} 
      onNavigate={navigate} 
      onLogout={async () => { 
        await supabase.auth.signOut(); 
        setUser(null); 
        navigate('login'); 
      }} 
    />
  );
}

function ConfigurationNotice() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">BRUKINA ACCESS</span>
        <h1>Workspace not configured</h1>
        <p>Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to the deployment environment, then reload the app.</p>
      </section>
    </main>
  );
}

function Auth({ mode, onNavigate, onSuccess }) {
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('customer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const validation = isSignup ? validateSignupForm({ fullName: name, email, password }) : null;
    if (validation && !validation.isValid) return setError(Object.values(validation.errors)[0]);
    if (!isSignup && (!email.trim() || !password)) return setError('Enter your email address and password.');
    setBusy(true);
    try {
      if (!isSignup) {
        const result = await executeDatabaseLogin(supabase, email, password);
        if (!result.success) throw new Error(result.error);
        onSuccess(result.user, result.role);
      } else {
        const { data, error: authError } = await supabase.auth.signUp({ 
          email: email.trim(), 
          password, 
          options: { data: { full_name: name.trim(), role: selectedRole } } 
        });
        if (authError) throw authError;
        if (!data.session) return setError('Check your email to confirm your account before signing in.');
        onSuccess(data.user, selectedRole);
      }
    } catch (errorValue) {
      setError(errorValue.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">BRUKINA ACCESS</span>
        <h1>{isSignup ? 'Create your workspace' : 'Welcome back'}</h1>
        <p>{isSignup ? 'Choose how you participate in the marketplace.' : 'Sign in to resume managing your marketplace workspace.'}</p>
        {error && <div className="error">{error}</div>}
        {isSignup && (
          <div className="role-grid">
            {roles.map(item => (
              <button className={selectedRole === item ? 'role selected' : 'role'} type="button" key={item} onClick={() => setSelectedRole(item)}>
                {item}<small>{item === 'customer' ? 'Shop and track' : item === 'vendor' ? 'Sell inventory' : 'Move orders'}</small>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit}>
          {isSignup && <label>Full name<input value={name} onChange={event => setName(event.target.value)} required /></label>}
          <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          <button className="primary" disabled={busy}>{busy ? 'Connecting...' : isSignup ? 'Create account' : 'Sign in to workspace'} <span>→</span></button>
        </form>
        <button className="link" onClick={() => onNavigate(isSignup ? 'login' : 'signup')}>{isSignup ? 'Already have an account? Sign in' : 'Create account'} ↗</button>
      </section>
    </main>
  );
}

function Workspace({ page, role, user, onNavigate, onLogout }) {
  useCourierLocation(role);
  const [catalog, setCatalog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutKey, setCheckoutKey] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      setLoading(true);
      const [catalogResult, orderResult, walletResult, deliveryResult] = await Promise.all([
        supabase.from('marketplace_inventory').select('*').eq('active', true).order('created_at', { ascending: false }),
        supabase.from('orders').select('id, order_number, status, total, created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('wallets').select('balance, escrow_balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('deliveries').select('id, order_id, status, eta_minutes, updated_at').order('updated_at', { ascending: false }).limit(20)
      ]);
      if (!active) return;
      setCatalog(catalogResult.data || []);
      setOrders(orderResult.data || []);
      setWallet(walletResult.data);
      setDeliveries(deliveryResult.data || []);
      setLoading(false);
    }
    loadWorkspace();
    return () => { active = false; };
  }, [page, user.id]);

  const buy = async () => {
    if (!selectedProduct) return;
    setNotice('');
    const { data: sessionData } = await supabase.auth.getSession();
    const orderEndpoint = window.location.hostname.endsWith('netlify.app') ? '/.netlify/functions/create-order' : '/api/v1/orders';
    const response = await fetch(orderEndpoint, { 
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json', 
        Authorization: `Bearer ${sessionData.session?.access_token || ''}`, 
        'Idempotency-Key': checkoutKey || crypto.randomUUID() 
      }, 
      body: JSON.stringify({ inventory_id: selectedProduct.id, quantity }) 
    });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error || 'Order could not be created.');
    setSelectedProduct(null);
    setCheckoutKey(null);
    setNotice(`Order ${result.order_number} created and awaiting confirmation.`);
    setOrders(current => [{ id: result.order_id, order_number: result.order_number, status: 'pending', total: Number(selectedProduct.unit_wholesale_price || selectedProduct.price) * quantity, created_at: new Date().toISOString() }, ...current]);
  };

  const filteredCatalog = catalog.filter(item => {
    const matchesSearch = `${item.product_name || ''} ${item.description || ''} ${item.vendor_name || ''}`
      .toLowerCase()
      .includes(query.toLowerCase());
      
    if (page === 'dashboard' || page === 'all') {
      return matchesSearch;
    }
    return matchesSearch && item.category === page;
  });

     return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
      {/* Top Hub Header Banner Layout */}
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

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>Browse categories</h2>
        <span style={{ color: '#C85A32', cursor: 'pointer', fontSize: '14px' }} onClick={() => onNavigate('dashboard')}>View all &rarr;</span>
      </div>

      {/* Categories Filter Strip */}
      <div className="tab-container" style={{ display: 'flex', gap: '10px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
        {CATEGORIES.map(cat => (
          <button 
            key={cat.id} 
            className={`tab-btn ${page === cat.id ? 'active' : ''}`} 
            onClick={() => onNavigate(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Dynamic Search Component */}
      <div style={{ marginBottom: '24px' }}>
        <input 
          type="text" 
          placeholder="Search products, suppliers, or origins..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #EAE0D5', fontSize: '15px', boxSizing: 'border-box' }}
        />
      </div>

      <div className="deals-header" style={{ marginBottom: '16px', fontSize: '20px', fontWeight: 'bold' }}>Deals near you</div>
      {notice && <div style={{ padding: '12px', background: '#e1f5fe', borderRadius: '6px', marginBottom: '16px', fontSize: '14px', color: '#0288d1' }}>{notice}</div>}

      {/* Database Listing Streaming Render Grid */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#777' }}>Loading marketplace listings...</div>
      ) : (
        <div className="deals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {filteredCatalog.length > 0 ? (
            filteredCatalog.map(product => (
              <div className="deal-card" key={product.id} style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #EAE0D5', display: 'flex', flexDirection: 'column' }}>
                <div className="card-image-area" style={{ background: '#C85A32', height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', position: 'relative' }}>
                  {product.tag && <span className="tag" style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(255, 255, 255, 0.9)', color: '#333', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{product.tag}</span>}
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <span style={{ fontSize: '72px', fontWeight: '900' }}>M</span>
                  )}
                </div>
                <div className="card-details" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1 }}>
                  <div className="product-title" style={{ fontWeight: '600', fontSize: '16px' }}>{product.product_name}</div>
                  <div className="product-meta" style={{ fontSize: '12px', color: '#777' }}>
                    {product.vendor_name || 'Verified Supplier'}<br />
                    {product.origin || 'Marketplace'}
                  </div>
                  <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                    <span className="price" style={{ fontWeight: 'bold' }}>
                      GH₵ {Number(product.price).toLocaleString(undefined, { minimumFractionDigits: 2 })} 
                      <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#777' }}> / {product.unit || 'unit'}</span>
                    </span>
                    <button 
                      className="buy-btn" 
                      style={{ background: '#C85A32', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
                      onClick={() => {
                        setSelectedProduct(product);
                        setCheckoutKey(crypto.randomUUID());
                        buy();
                      }}
                    >
                      Buy now
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '40px', color: '#777', gridColumn: '1/-1', textAlign: 'center' }}>
              No active listings found matching this selection criteria.
            </div>
          )}
        </div>
      )}

      {/* Footer Interface Panel controls */}
      <footer style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #EAE0D5', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#777' }}>
        <span>Connected: <strong>{user.email}</strong> ({role})</span>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#C85A32', cursor: 'pointer', fontWeight: '600' }}>Logout from Workspace</button>
      </footer>
    </div>
  );
}