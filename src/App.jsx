import { useEffect, useState } from 'react';
import { executeDatabaseLogin, validateSignupForm } from '../lib/validation.mjs';
import { supabase, supabaseConfigMissing } from './lib/supabaseClient';

const roles = ['customer', 'vendor', 'driver', 'rider'];
const pageForPath = (path) => {
  if (path === '/login') return 'login';
  if (path === '/signup') return 'signup';
  if (path.includes('vendor')) return 'inventory';
  if (path.includes('rider') || path.includes('driver')) return 'dispatch';
  if (path.includes('wallet')) return 'wallet';
  if (path.includes('orders')) return 'orders';
  if (path.includes('profile')) return 'profile';
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
  if (page === 'login' || page === 'signup') return <Auth mode={page} onNavigate={navigate} onSuccess={(nextUser, nextRole) => { setUser(nextUser); setRole(nextRole); navigate('dashboard'); }} />;
  if (!user) return <Auth mode="login" onNavigate={navigate} onSuccess={(nextUser, nextRole) => { setUser(nextUser); setRole(nextRole); navigate('dashboard'); }} />;
  return <Workspace page={page} role={role} user={user} onNavigate={navigate} onLogout={async () => { await supabase.auth.signOut(); setUser(null); navigate('login'); }} />;
}

function ConfigurationNotice() {
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">BRUKINA ACCESS</span><h1>Workspace not configured</h1><p>Add <strong>VITE_SUPABASE_URL</strong> and <strong>VITE_SUPABASE_ANON_KEY</strong> to the deployment environment, then reload the app.</p></section></main>;
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
        const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), role: selectedRole } } });
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
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">BRUKINA ACCESS</span><h1>{isSignup ? 'Create your workspace' : 'Welcome back'}</h1><p>{isSignup ? 'Choose how you participate in the marketplace.' : 'Sign in to resume managing your marketplace workspace.'}</p>{error && <div className="error">{error}</div>}{isSignup && <div className="role-grid">{roles.map(item => <button className={selectedRole === item ? 'role selected' : 'role'} type="button" key={item} onClick={() => setSelectedRole(item)}>{item}<small>{item === 'customer' ? 'Shop and track' : item === 'vendor' ? 'Sell inventory' : 'Move orders'}</small></button>)}</div>}<form onSubmit={submit}>{isSignup && <label>Full name<input value={name} onChange={event => setName(event.target.value)} required /></label>}<label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label><button className="primary" disabled={busy}>{busy ? 'Connecting...' : isSignup ? 'Create account' : 'Sign in to workspace'} <span>→</span></button></form><button className="link" onClick={() => onNavigate(isSignup ? 'login' : 'signup')}>{isSignup ? 'Already have an account? Sign in' : 'Create account'} ↗</button></section></main>;
}

function Workspace({ page, role, user, onNavigate, onLogout }) {
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
    const response = await fetch(orderEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token || ''}`, 'Idempotency-Key': checkoutKey || crypto.randomUUID() }, body: JSON.stringify({ inventory_id: selectedProduct.id, quantity }) });
    const result = await response.json();
    if (!response.ok) return setNotice(result.error || 'Order could not be created.');
    setSelectedProduct(null);
    setCheckoutKey(null);
    setNotice(`Order ${result.order_number} created and awaiting confirmation.`);
    setOrders(current => [{ id: result.order_id, order_number: result.order_number, status: 'pending', total: Number(selectedProduct.price) * quantity, created_at: new Date().toISOString() }, ...current]);
  };

  const filteredCatalog = catalog.filter(item => `${item.product_name} ${item.description || ''} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  const title = page === 'inventory' ? 'Catalog management' : page === 'dispatch' ? 'Dispatch center' : page === 'wallet' ? 'My wallet' : page === 'orders' ? 'Order history' : 'Marketplace dashboard';
  return <div className="shell"><header><button className="brand" onClick={() => onNavigate('dashboard')}>brukina<span>.</span></button><button className="link" onClick={onLogout}>Sign out</button></header><div className="layout"><aside><b>{role} workspace</b>{['dashboard', 'profile', 'inventory', 'orders', 'dispatch', 'wallet'].map(item => <button key={item} className={page === item ? 'active' : ''} onClick={() => onNavigate(item)}>{item}</button>)}</aside><main className="content"><span className="eyebrow">{role.toUpperCase()} WORKSPACE</span><h1>{title}</h1><p>Welcome back, {user.user_metadata?.full_name || user.email}.</p>{notice && <div className="notice">{notice}</div>}{loading ? <div className="panel"><p>Loading live workspace data...</p></div> : page === 'dashboard' || page === 'inventory' ? <Catalog products={filteredCatalog} query={query} setQuery={setQuery} onSelect={product => { setSelectedProduct(product); setCheckoutKey(crypto.randomUUID()); setQuantity(product.minimum_order_quantity || 1); }} /> : page === 'orders' ? <OrderList orders={orders} /> : page === 'wallet' ? <Wallet wallet={wallet} /> : page === 'dispatch' ? <Dispatch deliveries={deliveries} /> : <Panel title="Account profile"><p>{user.email} · {role}</p></Panel>}{selectedProduct && <ProductDialog product={selectedProduct} quantity={quantity} setQuantity={setQuantity} onBuy={buy} onClose={() => { setSelectedProduct(null); setCheckoutKey(null); }} />}</main></div></div>;
}

function Catalog({ products, query, setQuery, onSelect }) { return <section><input className="catalog-search" placeholder="Search live inventory" value={query} onChange={event => setQuery(event.target.value)} />{products.length ? <div className="product-grid">{products.map(product => <article className="product" key={product.id}><span>{product.badge || 'TRADE PRICE'}</span><h2>{product.product_name}</h2><p>{product.description || 'Verified marketplace inventory.'}</p><strong>GH₵ {Number(product.price).toFixed(2)}</strong><small>{product.stock_quantity} {product.unit || 'units'} available</small><button className="primary" onClick={() => onSelect(product)}>View item <span>→</span></button></article>)}</div> : <Panel title="No inventory found"><p>Run the Supabase migrations and add an active inventory row to populate the marketplace.</p></Panel>}</section>; }
function ProductDialog({ product, quantity, setQuantity, onBuy, onClose }) { return <div className="modal-backdrop"><section className="modal"><button className="close" onClick={onClose}>×</button><span className="eyebrow">{product.category}</span><h2>{product.product_name}</h2><p>{product.description || 'Verified marketplace inventory.'}</p><strong>GH₵ {Number(product.price).toFixed(2)} per {product.unit || 'unit'}</strong><label>Quantity<input type="number" min={product.minimum_order_quantity || 1} max={product.stock_quantity} value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label><button className="primary" onClick={onBuy}>Create order <span>→</span></button></section></div>; }
function OrderList({ orders }) { return <Panel title="Recent orders">{orders.length ? orders.map(order => <div className="list-row" key={order.id}><strong>{order.order_number}</strong><span>{order.status} · GH₵ {Number(order.total).toFixed(2)}</span></div>) : <p>No orders yet. Browse the marketplace to get started.</p>}</Panel>; }
function Wallet({ wallet }) { return <Panel title="Secure wallet"><div className="wallet-total">GH₵ {Number(wallet?.balance || 0).toFixed(2)}</div><p>Available balance. Escrow: GH₵ {Number(wallet?.escrow_balance || 0).toFixed(2)}.</p></Panel>; }
function Dispatch({ deliveries }) { return <Panel title="Active deliveries">{deliveries.length ? deliveries.map(delivery => <div className="list-row" key={delivery.id}><strong>{delivery.status}</strong><span>{delivery.eta_minutes ? `${delivery.eta_minutes} min ETA` : 'ETA pending'}</span></div>) : <p>No active deliveries are assigned yet.</p>}</Panel>; }
function Panel({ title, children }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
export default App;
