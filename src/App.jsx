import { useEffect, useState } from 'react';
import { executeDatabaseLogin, validateSignupForm } from './lib/validation.mjs';
import { supabase, supabaseConfigMissing } from './lib/supabaseClient';
import { useCourierLocation } from './lib/useCourierLocation';

// Direct path to your component file sitting right next to App.jsx in src/
import ProductCatalog from './ProductCard';
import VendorInventoryPanel from './components/VendorInventoryPanel';
import WalletPanel from './components/WalletPanel';
import RiderTrackPanel from './components/RiderTrackPanel';
import RiderWithdrawalPanel from './components/RiderWithdrawalPanel';
import OrderChatComponent from './components/OrderChatComponent';
import AdminApiLogger from './components/AdminApiLogger';
import AdminCategoryPanel from './components/AdminCategoryPanel';
import AdminLedgerPanel from './components/AdminLedgerPanel';
import AdminPriceController from './components/AdminPriceController';
import AdminTerminalPanel from './components/AdminTerminalPanel';
import DeveloperControlCenter from './components/developer/DeveloperControlCenter.jsx';
import './components/developer/developer-control-center.css';
import CartPanel from './components/CartPanel.jsx';
import AdminDispatchPanel from './components/AdminDispatchPanel.jsx';

const roles = ['customer', 'vendor', 'driver', 'rider'];

const COUNTRY_CURRENCIES = {
  Ghana: { code: 'GHS', symbol: 'GHâ‚µ' },
  Nigeria: { code: 'NGN', symbol: 'â‚¦' },
  'United States': { code: 'USD', symbol: '$' },
  'United Kingdom': { code: 'GBP', symbol: 'Â£' },
  Canada: { code: 'CAD', symbol: 'C$' },
  Australia: { code: 'AUD', symbol: 'A$' },
  Kenya: { code: 'KES', symbol: 'KSh' },
  Tanzania: { code: 'TZS', symbol: 'TSh' },
  Uganda: { code: 'UGX', symbol: 'USh' },
  'South Africa': { code: 'ZAR', symbol: 'R' },
  'CÃ´te dâ€™Ivoire': { code: 'XOF', symbol: 'CFA' },
  Senegal: { code: 'XOF', symbol: 'CFA' },
  Cameroon: { code: 'XAF', symbol: 'FCFA' },
  'Sierra Leone': { code: 'SLE', symbol: 'Le' },
  Liberia: { code: 'LRD', symbol: '$' },
  Egypt: { code: 'EGP', symbol: 'EÂ£' },
  India: { code: 'INR', symbol: 'â‚¹' },
  China: { code: 'CNY', symbol: 'Â¥' },
  Japan: { code: 'JPY', symbol: 'Â¥' },
  'United Arab Emirates': { code: 'AED', symbol: 'Ø¯.Ø¥' },
  'Saudi Arabia': { code: 'SAR', symbol: 'ï·¼' },
  Germany: { code: 'EUR', symbol: 'â‚¬' },
  France: { code: 'EUR', symbol: 'â‚¬' },
  Italy: { code: 'EUR', symbol: 'â‚¬' },
  Spain: { code: 'EUR', symbol: 'â‚¬' },
  Brazil: { code: 'BRL', symbol: 'R$' }
};

const COUNTRIES = Object.keys(COUNTRY_CURRENCIES);
const CURRENCY_RATES_FROM_GHS = {
  GHS: 1,
  NGN: 130,
  USD: 0.065,
  GBP: 0.048,
  CAD: 0.089,
  AUD: 0.099,
  KES: 8.45,
  TZS: 167,
  UGX: 246,
  ZAR: 1.18,
  XOF: 39.5,
  XAF: 39.5,
  SLE: 1.45,
  LRD: 10.2,
  EGP: 3.18,
  INR: 5.45,
  CNY: 0.47,
  JPY: 9.55,
  AED: 0.238,
  SAR: 0.244,
  EUR: 0.055,
  BRL: 0.35
};

const formatLocalCurrency = (amount, user) => {
  const metadata = user?.user_metadata || {};
  const currency = metadata.currency || 'GHS';
  const rate = CURRENCY_RATES_FROM_GHS[currency] || 1;
  const convertedAmount = Number(amount || 0) * rate;

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(convertedAmount);
};


// Synced with your catalog categories to ensure accurate tab filtering
const CATEGORIES = [
  { id: 'dashboard', label: 'All products', path: '/' },
  { id: 'grain', label: 'Grains & Cereals', path: '/grain' },
  { id: 'vegetable', label: 'Vegetables', path: '/vegetable' },
  { id: 'fruit', label: 'Fruits', path: '/fruit' },
  { id: 'food', label: 'Food & Groceries', path: '/food' },
  { id: 'building', label: 'Building Materials', path: '/building' },
  { id: 'plumbing', label: 'Plumbing', path: '/plumbing' },
  { id: 'electrical', label: 'Electrical', path: '/electrical' },
  { id: 'appliance', label: 'Appliances', path: '/appliance' },
  { id: 'phones', label: 'Phones', path: '/phones' },
  { id: 'computers', label: 'Computers', path: '/computers' },
  { id: 'screens', label: 'Screens & Monitors', path: '/screens' },
  { id: 'screen-accessories', label: 'Screen Accessories', path: '/screen-accessories' },
  { id: 'devices', label: 'Devices', path: '/devices' },
  { id: 'electronics', label: 'Electronics', path: '/electronics' },
  { id: 'accessories', label: 'Accessories', path: '/accessories' },
  { id: 'components', label: 'Computer Components', path: '/components' },
  { id: 'storage', label: 'Storage', path: '/storage' },
  { id: 'laptop-parts', label: 'Laptop Parts', path: '/laptop-parts' },
  { id: 'chargers', label: 'Laptop Chargers', path: '/chargers' },
  { id: 'networking', label: 'Networking', path: '/networking' },
  { id: 'audio', label: 'Computer Audio', path: '/audio' },
  { id: 'office-devices', label: 'Office Devices', path: '/office-devices' },
  { id: 'tools', label: 'Tools', path: '/tools' },
  { id: 'equipment', label: 'Equipment', path: '/equipment' },
  { id: 'solar', label: 'Solar', path: '/solar' },
  { id: 'power', label: 'Power', path: '/power' },
  { id: 'furniture', label: 'Furniture', path: '/furniture' },
  { id: 'home', label: 'Home', path: '/home' },
  { id: 'auto', label: 'Auto', path: '/auto' },
  { id: 'fashion', label: 'Fashion', path: '/fashion' },
  { id: 'beauty', label: 'Beauty', path: '/beauty' }
];

const pageForPath = (path) => {
  if (path === '/login') return 'login';
  if (path === '/signup') return 'signup';
  if (path === '/developer' || path.includes('/developer/')) return 'developer';
  if (path === '/admin' || path.includes('/admin/')) return 'admin';
  if (path === '/vendor' || path.includes('/vendor/')) return 'vendor';
  if (path === '/rider' || path.includes('/rider/')) return 'rider';
  if (path === '/driver' || path.includes('/driver/')) return 'driver';
  if (path === '/wallet' || path.includes('/wallet/')) return 'wallet';
  if (path === '/cart' || path.includes('/cart/')) return 'cart';
  if (path === '/orders' || path.includes('/orders/')) return 'orders';
  if (path === '/profile' || path.includes('/profile/')) return 'profile';
  
  const segment = path.split('/').pop();
  if (CATEGORIES.some(cat => cat.id === segment)) {
    return segment;
  }
  return 'dashboard';
};

export default function App() {
  const [page, setPage] = useState(() =>
    pageForPath(location.hash.startsWith('#/') ? location.hash.slice(1) : location.pathname)
  );
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('customer');
  
  const navigate = (next) => {
    const routes = {
      dashboard: '/dashboard',
      grain: '/grain',
      vegetable: '/vegetable',
      fruit: '/fruit',
      food: '/food',
      building: '/building',
      plumbing: '/plumbing',
      electrical: '/electrical',
      appliance: '/appliance',
      phones: '/phones',
      computers: '/computers',
      screens: '/screens',
      'screen-accessories': '/screen-accessories',
      devices: '/devices',
      electronics: '/electronics',
      accessories: '/accessories',
      components: '/components',
      storage: '/storage',
      'laptop-parts': '/laptop-parts',
      chargers: '/chargers',
      networking: '/networking',
      audio: '/audio',
      'office-devices': '/office-devices',
      tools: '/tools',
      equipment: '/equipment',
      solar: '/solar',
      power: '/power',
      furniture: '/furniture',
      home: '/home',
      auto: '/auto',
      fashion: '/fashion',
      beauty: '/beauty',
      orders: '/orders',
      cart: '/cart',
      wallet: '/wallet',
      profile: '/profile',
      admin: '/admin',
      vendor: '/vendor',
      rider: '/rider',
      driver: '/driver',
      login: '/login',
      signup: '/signup',
      developer: '/developer'
    };

    const safePage = Object.prototype.hasOwnProperty.call(routes, next)
      ? next
      : 'dashboard';
    const path = routes[safePage];

    if (location.hash !== `#${path}`) {
      location.hash = path;
    }

    setPage(safePage);
  };

  useEffect(() => {
    const onRouteChange = () => {
      const path = location.hash.startsWith('#/')
        ? location.hash.slice(1)
        : location.pathname;
      setPage(pageForPath(path));
    };
    window.addEventListener('hashchange', onRouteChange);
    window.addEventListener('popstate', onRouteChange);
    let authSubscription;

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setUser(data.session.user);
          setRole(data.session.user.user_metadata?.role || 'customer');
        }
      });

      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser(session.user);
          setRole(session.user.user_metadata?.role || 'customer');
        } else {
          setUser(null);
          setRole('customer');
        }
      });

      authSubscription = data.subscription;
    }

    return () => {
      window.removeEventListener('hashchange', onRouteChange);
      window.removeEventListener('popstate', onRouteChange);
      authSubscription?.unsubscribe();
    };
  }, []);

  if (page === 'developer') {
    return <DeveloperControlCenter />;
  }

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
  const [country, setCountry] = useState('Ghana');
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
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: name.trim(),
              role: selectedRole,
              country,
              currency: COUNTRY_CURRENCIES[country].code,
              currency_symbol: COUNTRY_CURRENCIES[country].symbol
            }
          } 
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
          {isSignup && (
            <label>
              Country
              <select value={country} onChange={event => setCountry(event.target.value)} required>
                {COUNTRIES.map(item => (
                  <option key={item} value={item}>
                    {item} â€” {COUNTRY_CURRENCIES[item].code}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
          <button className="primary" disabled={busy}>{busy ? 'Connecting...' : isSignup ? 'Create account' : 'Sign in to workspace'} <span>â†’</span></button>
        </form>
        <button className="link" onClick={() => onNavigate(isSignup ? 'login' : 'signup')}>{isSignup ? 'Already have an account? Sign in' : 'Create account'} â†—</button>
      </section>
    </main>
  );
}

function Workspace({ page, role, user, onNavigate, onLogout }) {
  useCourierLocation((role === 'rider' || role === 'driver') ? user?.id : null);
  const [catalog, setCatalog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');
  const [cart, setCart] = useState(() => {
    try {
      const stored = localStorage.getItem('brukina_cart_v1');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [wallet, setWallet] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('brukina_cart_v1', JSON.stringify(cart));
    } catch (error) {
      console.warn('[CART] Could not persist cart:', error);
    }
  }, [cart]);

  const addToCart = (product, quantity = 1) => {
    if (!product?.id) return;

    const minimum = Number(product.minimum_order_quantity) > 0
      ? Number(product.minimum_order_quantity)
      : 1;

    const stock = Number(product.stock_quantity);
    const maximum = Number.isFinite(stock) && stock > 0 ? stock : 1000;

    const requested = Math.max(minimum, Number(quantity) || minimum);

    setCart(previous => {
      const existing = previous.find(item => item.id === product.id);

      if (existing) {
        return previous.map(item =>
          item.id === product.id
            ? {
                ...item,
                quantity: Math.min(
                  maximum,
                  Math.max(minimum, Number(item.quantity || minimum) + requested)
                )
              }
            : item
        );
      }

      return [
        ...previous,
        {
          id: product.id,
          product_name: product.product_name,
          vendor_name: product.vendor_name,
          category: product.category,
          price: Number(product.price || 0),
          stock_quantity: product.stock_quantity,
          minimum_order_quantity: product.minimum_order_quantity,
          image_url: product.image_url,
          quantity: Math.min(maximum, requested)
        }
      ];
    });
  };

  const updateCartQuantity = (id, quantity) => {
    setCart(previous =>
      previous.map(item =>
        item.id === id
          ? { ...item, quantity: Math.max(1, Number(quantity) || 1) }
          : item
      )
    );
  };

  const removeFromCart = id => {
    setCart(previous => previous.filter(item => item.id !== id));
  };

  const clearCart = () => setCart([]);

  const refreshOrders = async () => {
    if (!user?.id || !supabase) {
      setOrders([]);
      return;
    }

    try {
      setOrdersError('');

      const { data: orderRows, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (orderError) throw orderError;

      const safeOrders = Array.isArray(orderRows) ? orderRows : [];

      if (!safeOrders.length) {
        setOrders([]);
        return;
      }

      const orderIds = safeOrders
        .map(order => order.id)
        .filter(Boolean);

      const { data: itemRows, error: itemError } = await supabase
        .from('order_items')
        .select(`
          id,
          order_id,
          inventory_id,
          quantity,
          unit_price,
          created_at,
          marketplace_inventory (
            id,
            product_name,
            vendor_name,
            category,
            brand,
            description,
            image_url,
            price,
            price_display,
            unit,
            sku,
            active
          )
        `)
        .in('order_id', orderIds)
        .order('created_at', { ascending: true });

      if (itemError) {
        console.error('[ORDERS] order_items load failed:', itemError);

        setOrders(
          safeOrders.map(order => ({
            ...order,
            order_items: []
          }))
        );

        setOrdersError(
          'Orders loaded, but product details could not be displayed.'
        );

        return;
      }

      const itemsByOrder = new Map();

      for (const item of itemRows || []) {
        if (!itemsByOrder.has(item.order_id)) {
          itemsByOrder.set(item.order_id, []);
        }

        itemsByOrder.get(item.order_id).push(item);
      }

      setOrders(
        safeOrders.map(order => ({
          ...order,
          order_items: itemsByOrder.get(order.id) || []
        }))
      );
    } catch (error) {
      console.error('[ORDERS] Failed to load orders:', error);

      setOrdersError(
        error?.message || 'Unable to load your orders right now.'
      );

      setOrders([]);
    }
  };


  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      setLoading(true);
      try {
        const [catalogResult, orderResult, walletResult, deliveryResult] = await Promise.all([
          supabase.from('marketplace_inventory').select('*').eq('active', true).order('created_at', { ascending: false }),
          supabase.from('orders').select('*').eq('customer_id', user.id).order('created_at', { ascending: false }).limit(20),
          supabase.from('wallets').select('balance, escrow_balance').eq('user_id', user.id).maybeSingle(),
          supabase.from('deliveries').select('id, order_id, status, eta_minutes, updated_at').order('updated_at', { ascending: false }).limit(20)
        ]);

        if (active) {
          setCatalog(catalogResult.data || []);
          setOrders(orderResult.data || []);
          setOrdersError(orderResult.error?.message || '');
          setWallet(walletResult.data || null);
          setDeliveries(deliveryResult.data || []);

          // Load the products belonging to each customer order.
          const initialOrders = orderResult.data || [];
          const initialOrderIds = initialOrders
            .map(order => order.id)
            .filter(Boolean);

          if (initialOrderIds.length) {
            const { data: initialItems, error: initialItemsError } =
              await supabase
                .from('order_items')
                .select(`
                  id,
                  order_id,
                  inventory_id,
                  quantity,
                  unit_price,
                  created_at,
                  marketplace_inventory (
                    id,
                    product_name,
                    vendor_name,
                    category,
                    brand,
                    description,
                    image_url,
                    price,
                    price_display,
                    unit,
                    sku,
                    active
                  )
                `)
                .in('order_id', initialOrderIds)
                .order('created_at', { ascending: true });

            if (initialItemsError) {
              console.error(
                '[ORDERS] Initial order_items load failed:',
                initialItemsError
              );
            } else {
              const initialItemsByOrder = new Map();

              for (const item of initialItems || []) {
                if (!initialItemsByOrder.has(item.order_id)) {
                  initialItemsByOrder.set(item.order_id, []);
                }

                initialItemsByOrder.get(item.order_id).push(item);
              }

              setOrders(
                initialOrders.map(order => ({
                  ...order,
                  order_items:
                    initialItemsByOrder.get(order.id) || []
                }))
              );
            }
          }
        }
      } catch (err) {
        console.error("Error loading marketplace data:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadWorkspace();
    return () => { active = false; };
  }, [user.id, page]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading marketplace modules...</div>;
  }

  if (page === 'admin') {
    if (role !== 'admin') {
      return (
        <PageShell title="Admin Access" role={role} onNavigate={onNavigate} onLogout={onLogout}>
          <div className="empty-state-box">
            <h2>Admin access required</h2>
            <p>This workspace is restricted to administrator accounts.</p>
            <button className="btn-primary" onClick={() => onNavigate('dashboard')}>
              Back to Marketplace
            </button>
          </div>
        </PageShell>
      );
    }

    return (
      <PageShell title="Admin Control Center" role={role} onNavigate={onNavigate} onLogout={onLogout}>
        <div className="admin-panel" style={{ marginBottom: '20px' }}>
          <div className="panel-header">
            <span className="admin-tag">BRUKINA ADMIN</span>
            <h2 className="panel-title">Marketplace Control Center</h2>
            <p className="panel-subtitle">
              Manage marketplace categories, pricing, financial activity, integrations and system health.
            </p>
          </div>
        </div>

        <AdminCategoryPanel />
        <div style={{ marginTop: '24px' }}><AdminPriceController /></div>
        <div style={{ marginTop: '24px' }}><AdminDispatchPanel /></div>
<div style={{ marginTop: '24px' }}><AdminLedgerPanel /></div>
        <div style={{ marginTop: '24px' }}><AdminApiLogger /></div>
        <div style={{ marginTop: '24px' }}><AdminTerminalPanel /></div>
      </PageShell>
    );
  }

  if (page === 'vendor') {
    if (role !== 'vendor' && role !== 'admin') {
      return (
        <PageShell title="Vendor Access">
          <p>Your account is not registered as a vendor.</p>
          <button className="btn-primary" onClick={() => onNavigate('dashboard')}>
            Back to Marketplace
          </button>
        </PageShell>
      );
    }

    return (
      <PageShell title="Vendor Console" onNavigate={onNavigate} onLogout={onLogout}>
        <VendorInventoryPanel />
      </PageShell>
    );
  }

  if (page === 'wallet') {
    return (
      <PageShell title="My Wallet" onNavigate={onNavigate} onLogout={onLogout}>
        <WalletPanel />
      </PageShell>
    );
  }

  if (page === 'rider' || page === 'driver') {
    if (role !== 'rider' && role !== 'driver' && role !== 'admin') {
      return (
        <PageShell title="Courier Access" onNavigate={onNavigate} onLogout={onLogout}>
          <p>Your account is not registered as a rider or driver.</p>
          <button className="btn-primary" onClick={() => onNavigate('dashboard')}>
            Back to Marketplace
          </button>
        </PageShell>
      );
    }

    return (
      <PageShell title="Logistics Center" onNavigate={onNavigate} onLogout={onLogout}>
        <RiderTrackPanel />
        <div style={{ marginTop: '24px' }}>
          <RiderWithdrawalPanel />
        </div>
      </PageShell>
    );
  }

  if (page === 'cart') {
    return (
      <PageShell title="My Cart" onNavigate={onNavigate} onLogout={onLogout}>
        <CartPanel
          cart={cart}
          user={user}
          onUpdateQuantity={updateCartQuantity}
          onRemove={removeFromCart}
          onClear={clearCart}
          onNavigate={onNavigate}
          onOrdersRefresh={refreshOrders}
        />
      </PageShell>
    );
  }

  if (page === 'orders') {
    return (
      <PageShell title="My Orders" onNavigate={onNavigate} onLogout={onLogout}>
        <OrdersPanel
          orders={orders}
          user={user}
          error={ordersError}
          onNavigate={onNavigate}
        />
      </PageShell>
    );
  }

  if (page === 'profile') {
    return (
      <PageShell title="My Profile" onNavigate={onNavigate} onLogout={onLogout}>
        <ProfilePanel user={user} role={role} />
      </PageShell>
    );
  }

  return (
    <>
      {!isVendor && !isCourier && (
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '16px 16px 0',
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px'
          }}
        >
          <button
            type="button"
            onClick={() => onNavigate('cart')}
            style={{
              textAlign: 'left',
              border: '1px solid #eadfd6',
              background: '#fff',
              borderRadius: '20px',
              padding: '20px',
              cursor: 'pointer',
              boxShadow:
                '0 8px 25px rgba(35,31,32,.06)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '30px' }}>🛒</span>

              <span
                style={{
                  minWidth: '30px',
                  height: '30px',
                  padding: '0 8px',
                  borderRadius: '999px',
                  background:
                    cart.length ? '#C85A32' : '#eee7e1',
                  color:
                    cart.length ? '#fff' : '#777',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '12px'
                }}
              >
                {cart.reduce(
                  (sum, item) =>
                    sum + Number(item.quantity || 0),
                  0
                )}
              </span>
            </div>

            <strong
              style={{
                display: 'block',
                marginTop: '13px',
                color: '#231F20',
                fontSize: '17px'
              }}
            >
              My Cart
            </strong>

            <span
              style={{
                display: 'block',
                marginTop: '5px',
                color: '#777',
                fontSize: '12px'
              }}
            >
              Review products and checkout securely.
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('orders')}
            style={{
              textAlign: 'left',
              border: '1px solid #eadfd6',
              background: '#fff',
              borderRadius: '20px',
              padding: '20px',
              cursor: 'pointer',
              boxShadow:
                '0 8px 25px rgba(35,31,32,.06)'
            }}
          >
            <div style={{ fontSize: '30px' }}>📦</div>

            <strong
              style={{
                display: 'block',
                marginTop: '13px',
                color: '#231F20',
                fontSize: '17px'
              }}
            >
              Items Ordered
            </strong>

            <span
              style={{
                display: 'block',
                marginTop: '5px',
                color: '#777',
                fontSize: '12px'
              }}
            >
              View products, quantities, totals and
              delivery status.
            </span>
          </button>
        </div>
      )}

      <ProductCatalog 
      catalog={catalog}
      query={query}
      page={page}
      onNavigate={onNavigate}
      user={user}
      role={role}
      onLogout={onLogout}
      onAddToCart={addToCart}
      cartCount={cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}
    />
  );
}

function PageShell({ title, children, role, onNavigate, onLogout }) {
  const navItems = [
    ['dashboard', 'Marketplace'],
    ['cart', 'Cart'],
    ['orders', 'Items Ordered'],
    ['profile', 'Profile'],
    ['wallet', 'Wallet'],
    ...(role === 'vendor' || role === 'admin' ? [['vendor', 'Vendor']] : []),
    ...(role === 'rider' || role === 'driver' || role === 'admin' ? [['rider', 'Rider / Driver']] : []),
    ...(role === 'admin' ? [['admin', 'Admin Control']] : [])
  ];

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ flex: '1 1 auto', minWidth: '280px' }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '14px'
          }}>
            {navItems.map(([target, label]) => (
              <button
                key={target}
                className={target === 'dashboard' ? 'btn-primary' : 'btn-outline'}
                onClick={() => onNavigate?.(target)}
              >
                {label}
              </button>
            ))}
          </div>

          <h1 style={{ margin: 0 }}>{title}</h1>
        </div>

        {onLogout && (
          <button className="btn-outline" onClick={onLogout}>
            Logout
          </button>
        )}
      </header>

      {children}
    </div>
  );
}

function OrdersPanel({ orders = [], user, error = '' }) {
  const [selectedOrder, setSelectedOrder] = useState(null);

  if (error) {
    return <div className="empty-state-box">Could not load your orders: {error}</div>;
  }

  if (!orders.length) {
    return (
      <div className="empty-state-box">
        You have no orders yet. Return to the marketplace to place your first order.
      </div>
    );
  }

  const statusLabel = (status) =>
    String(status || 'pending').replaceAll('_', ' ');

  const displayField = (label, value) => {
    if (value === null || value === undefined || value === '') return null;
    if (label === 'customer_id') return null;
    if (label === 'id') return null;

    let displayValue = value;

    if (label === 'created_at' || label === 'updated_at') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        displayValue = date.toLocaleString();
      }
    }

    if (label === 'total' || label === 'amount') {
      displayValue = formatLocalCurrency(value, user);
    }

    return (
      <div
        key={label}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '20px',
          padding: '12px 0',
          borderBottom: '1px solid #eee'
        }}
      >
        <strong style={{ textTransform: 'capitalize' }}>
          {label.replaceAll('_', ' ')}
        </strong>
        <span style={{ textAlign: 'right', wordBreak: 'break-word' }}>
          {String(displayValue)}
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Total</th>
              <th>Date</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                style={{ cursor: 'pointer' }}
                title="Open order details"
              >
                <td><strong>{order.order_number}</strong></td>
                <td>{statusLabel(order.status)}</td>
                <td>{formatLocalCurrency(order.total, user)}</td>
                <td>{new Date(order.created_at).toLocaleDateString()}</td>
                <td>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedOrder(order);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedOrder && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedOrder(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 1000
          }}
        >
          <div
            className="modal-content"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#fff',
              width: '100%',
              maxWidth: '650px',
              maxHeight: '85vh',
              overflowY: 'auto',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              <div>
                <p style={{ margin: 0, color: '#999', fontSize: '13px' }}>
                  ORDER DETAILS
                </p>
                <h2 style={{ margin: '6px 0' }}>
                  {selectedOrder.order_number || 'Order'}
                </h2>
                <strong style={{ textTransform: 'capitalize' }}>
                  {statusLabel(selectedOrder.status)}
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                aria-label="Close order details"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '28px',
                  cursor: 'pointer',
                  color: '#777'
                }}
              >
                Ã—
              </button>
            </div>

            <div>
              {Object.entries(selectedOrder)
                .map(([label, value]) => displayField(label, value))}
            </div>

            <div style={{ marginTop: '24px' }}>
              <OrderChatComponent
                orderId={selectedOrder.id}
                currentUserName={
                  user?.user_metadata?.full_name ||
                  user?.email ||
                  'Customer'
                }
                currentUserRole={user?.user_metadata?.role || 'customer'}
              />
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={() => setSelectedOrder(null)}
              style={{ marginTop: '20px', width: '100%' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function ProfilePanel({ user, role }) {
  return (
    <div className="wallet-panel">
      <div className="wallet-card">
        <div className="wallet-card-top">
          <span className="wallet-chip">â—Ž</span>
          <span className="wallet-label">ACCOUNT</span>
        </div>
        <p>Email</p>
        <strong style={{ wordBreak: 'break-word' }}>
          {user?.email || 'Unknown'}
        </strong>
        <div className="wallet-card-bottom">
          <span>Role</span>
          <span>{role || 'customer'}</span>
        </div>
      </div>

      <div className="transactions-box" style={{ marginTop: '20px' }}>
        <h3>Account Information</h3>
        <div className="txn-row">
          <div>
            <strong>User ID</strong>
            <small>{user?.id || 'Unavailable'}</small>
          </div>
        </div>
        <div className="txn-row">
          <div>
            <strong>Account status</strong>
            <small>Email authentication active</small>
          </div>
        </div>
      </div>
    </div>
  );
}

