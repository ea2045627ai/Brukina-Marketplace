import { useEffect, useState } from 'react';
import { useRealtimeCatalog } from './hooks/useRealtimeCatalog.js';
import { supabase } from './supabaseClient.js';
import CheckoutModal from './components/CheckoutModal.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import { signOut } from './auth.js';

const filters = [
  { value: 'all', label: 'All products' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale · free delivery' }
];

export default function App() {
  const { catalog, loading, error } = useRealtimeCatalog(supabase, { freeDeliveryOnly: false });
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState(null);
  const [signOutError, setSignOutError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [cart, setCart] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderReference, setOrderReference] = useState(null);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setSignOutError(null);
      }
    });

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError) throw sessionError;
        if (active) setSession(data.session);
      })
      .catch(error => {
        if (active) setAuthError(error instanceof Error ? error.message : 'Could not load your session.');
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const addToCart = product => {
    setOrderReference(null);
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      if (existing) {
        return current.map(item => item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const filteredCatalog = catalog.filter(item => {
    if (filter === 'wholesale') return item.is_wholesale && item.free_delivery;
    if (filter === 'retail') return !item.is_wholesale;
    return true;
  });

  if (authLoading) {
    return <main className="auth-page"><p role="status">Checking your session…</p></main>;
  }

  if (!supabase) {
    return (
      <main className="auth-page">
        <section className="auth-card" role="alert">
          <p className="eyebrow">Brukina Marketplace</p>
          <h1>Authentication is not configured</h1>
          <p className="auth-intro">
            Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.
          </p>
        </section>
      </main>
    );
  }

  if (!session) {
    return (
      <>
        {authError && <p className="auth-message error" role="alert">{authError}</p>}
        <AuthPanel />
      </>
    );
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Brukina Marketplace</p>
          <h1>Market hub</h1>
          <p className="subtitle">Browse retail and wholesale products from local suppliers.</p>
        </div>
        <div className="header-actions">
          <span className="live-indicator"><span /> Live catalog</span>
          <span className="signed-in-user">{session.user.email || session.user.phone}</span>
          <button
            className="sign-out-button"
            onClick={async () => {
              setSignOutError(null);
              try {
                await signOut();
              } catch (error) {
                setSignOutError(error instanceof Error ? error.message : 'Could not sign out.');
              }
            }}
            type="button"
          >
            Sign out
          </button>
          <button
            className="cart-button"
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
            type="button"
          >
            Checkout{cart.length > 0 ? ` · ${cart.reduce((sum, item) => sum + item.quantity, 0)}` : ''}
          </button>
        </div>
      </header>

      {orderReference && (
        <p className="status-message" role="status">
          Payment confirmed. Order reference: {orderReference}
        </p>
      )}
      {signOutError && <p className="status-message error" role="alert">{signOutError}</p>}

      <nav className="catalog-filters" aria-label="Filter products">
        {filters.map(option => (
          <button
            aria-pressed={filter === option.value}
            className={filter === option.value ? 'filter-button active' : 'filter-button'}
            key={option.value}
            onClick={() => setFilter(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </nav>

      {loading && <p className="status-message" role="status">Loading marketplace catalog…</p>}
      {error && <p className="status-message error" role="alert">Catalog sync issue: {error.message}</p>}
      {!loading && !error && filteredCatalog.length === 0 && (
        <p className="status-message">No products match this filter.</p>
      )}

      <main className="catalog-grid" aria-label="Marketplace products">
        {filteredCatalog.map(item => (
          <article className="product-card" key={item.id}>
            {item.image_url && <img className="product-image" src={item.image_url} alt="" />}
            <div className="product-content">
              <div className="product-labels">
                {item.is_wholesale && <span className="badge wholesale">Wholesale</span>}
                {item.free_delivery && <span className="badge delivery">Free delivery</span>}
              </div>
              <h2>{item.name || 'Market item'}</h2>
              <p className="product-description">{item.description || 'No description provided.'}</p>
              <p className="vendor">{item.vendor_name || 'Brukina Marketplace'}</p>
              <div className="product-price">
                <strong>{item.price_display || `GH₵ ${Number(item.price || 0).toFixed(2)}`}</strong>
                {item.unit && <span>per {item.unit}</span>}
              </div>
              {item.minimum_order_quantity > 1 && (
                <p className="minimum-order">Minimum order: {item.minimum_order_quantity} {item.unit || 'units'}</p>
              )}
              <button className="add-to-cart" onClick={() => addToCart(item)} type="button">
                Add to cart
              </button>
            </div>
          </article>
        ))}
      </main>
      {checkoutOpen && (
        <CheckoutModal
          cartItems={cart}
          onCheckoutSuccess={reference => {
            setCart([]);
            setCheckoutOpen(false);
            setOrderReference(reference);
          }}
          onClose={() => setCheckoutOpen(false)}
        />
      )}
    </div>
  );
}
