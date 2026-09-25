import { useEffect, useState } from 'react';
import { executeDatabaseLogin, validateSignupForm } from './lib/validation.mjs';
import { supabase, supabaseConfigMissing } from './lib/supabaseClient';
import { useCourierLocation } from './lib/useCourierLocation';

// Direct path to your component file sitting right next to App.jsx in src/
import ProductCatalog from './ProductCard'; 

const roles = ['customer', 'vendor', 'driver', 'rider'];

// Synced with your catalog categories to ensure accurate tab filtering
const CATEGORIES = [
  { id: 'dashboard', label: 'All products', path: '/' },
  { id: 'grain', label: 'Grains & Cereals', path: '/grain' },
  { id: 'vegetable', label: 'Vegetables', path: '/vegetable' },
  { id: 'fruit', label: 'Fruits', path: '/fruit' }
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

export default function App() {
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

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      setLoading(true);
      try {
        const [catalogResult, orderResult, walletResult, deliveryResult] = await Promise.all([
          supabase.from('marketplace_inventory').select('*').eq('active', true).order('created_at', { ascending: false }),
          supabase.from('orders').select('id, order_number, status, total, created_at').order('created_at', { ascending: false }).limit(20),
          supabase.from('wallets').select('balance, escrow_balance').eq('user_id', user.id).maybeSingle(),
          supabase.from('deliveries').select('id, order_id, status, eta_minutes, updated_at').order('updated_at', { ascending: false }).limit(20)
        ]);

        if (active) {
          setCatalog(catalogResult.data || []);
          setOrders(orderResult.data || []);
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