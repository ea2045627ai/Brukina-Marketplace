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

const roles = ['customer', 'vendor', 'driver', 'rider'];

const COUNTRY_CURRENCIES = {
  Ghana: { code: 'GHS', symbol: 'GH₵' },
  Nigeria: { code: 'NGN', symbol: '₦' },
  'United States': { code: 'USD', symbol: '$' },
  'United Kingdom': { code: 'GBP', symbol: '£' },
  Canada: { code: 'CAD', symbol: 'C$' },
  Australia: { code: 'AUD', symbol: 'A$' },
  Kenya: { code: 'KES', symbol: 'KSh' },
  Tanzania: { code: 'TZS', symbol: 'TSh' },
  Uganda: { code: 'UGX', symbol: 'USh' },
  'South Africa': { code: 'ZAR', symbol: 'R' },
  'Côte d’Ivoire': { code: 'XOF', symbol: 'CFA' },
  Senegal: { code: 'XOF', symbol: 'CFA' },
  Cameroon: { code: 'XAF', symbol: 'FCFA' },
  'Sierra Leone': { code: 'SLE', symbol: 'Le' },
  Liberia: { code: 'LRD', symbol: '$' },
  Egypt: { code: 'EGP', symbol: 'E£' },
  India: { code: 'INR', symbol: '₹' },
  China: { code: 'CNY', symbol: '¥' },
  Japan: { code: 'JPY', symbol: '¥' },
  'United Arab Emirates': { code: 'AED', symbol: 'د.إ' },
  'Saudi Arabia': { code: 'SAR', symbol: '﷼' },
  Germany: { code: 'EUR', symbol: '€' },
  France: { code: 'EUR', symbol: '€' },
  Italy: { code: 'EUR', symbol: '€' },
  Spain: { code: 'EUR', symbol: '€' },
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
  if (path === '/vendor' || path.includes('/vendor/')) return 'vendor';
  if (path === '/rider' || path.includes('/rider/')) return 'rider';
  if (path === '/driver' || path.includes('/driver/')) return 'driver';
  if (path === '/wallet' || path.includes('/wallet/')) return 'wallet';
  if (path === '/orders' || path.includes('/orders/')) return 'orders';
  if (path === '/profile' || path.includes('/profile/')) return 'profile';
  
  const segment = path.split('/').pop();
  if (CATEGORIES.some(cat => cat.id === segment)) {
    return segment;
  }
  return 'dashboard';
};

export default function App() {
  const [page, setPage] = useState(() => pageForPath(location.pathname));
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
      devices: '/devices',
      electronics: '/electronics',
      accessories: '/accessories',
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
      wallet: '/wallet',
      profile: '/profile',
      vendor: '/vendor',
      rider: '/rider',
      driver: '/driver',
      login: '/login',
      signup: '/signup'
    };

    const path = routes[next] || '/dashboard';
    history.pushState({}, '', path);
    setPage(next);
  };

  useEffect(() => {
    const onPopState = () => setPage(pageForPath(location.pathname));
    window.addEventListener('popstate', onPopState);
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
      window.removeEventListener('popstate', onPopState);
      authSubscription?.unsubscribe();
    };
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
                    {item} — {COUNTRY_CURRENCIES[item].code}
                  </option>
                ))}
              </select>
            </label>
          )}
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
  const [ordersError, setOrdersError] = useState('');
  const [wallet, setWallet] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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
        }
      } catch (err) {
        console.error("Error loading marketplace data:", err);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadWorkspace();
    return () => { active = false; };
  }, [user.id]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>Loading marketplace modules...</div>;
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

  if (page === 'orders') {
    return (
      <PageShell title="My Orders" onNavigate={onNavigate} onLogout={onLogout}>
        <OrdersPanel orders={orders} user={user} error={ordersError} />
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
    <ProductCatalog 
      catalog={catalog}
      query={query}
      page={page}
      onNavigate={onNavigate}
      user={user}
      role={role}
      onLogout={onLogout}
    />
  );
}

function PageShell({ title, children, onNavigate, onLogout }) {
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
        <div>
          <button
            className="btn-text"
            onClick={() => onNavigate?.('dashboard')}
            style={{ marginBottom: '8px' }}
          >
            ← Marketplace
          </button>
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
                ×
              </button>
            </div>

            <div>
              {Object.entries(selectedOrder)
                .map(([label, value]) => displayField(label, value))}
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
          <span className="wallet-chip">◎</span>
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