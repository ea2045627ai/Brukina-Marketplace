import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useRealtimeCatalog } from './hooks/useRealtimeCatalog.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const filters = [
  { value: 'all', label: 'All products' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale · free delivery' }
];

export default function App() {
  const { catalog, loading, error } = useRealtimeCatalog(supabase, { freeDeliveryOnly: false });
  const [filter, setFilter] = useState('all');

  const filteredCatalog = catalog.filter(item => {
    if (filter === 'wholesale') return item.is_wholesale && item.free_delivery;
    if (filter === 'retail') return !item.is_wholesale;
    return true;
  });

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Brukina Marketplace</p>
          <h1>Market hub</h1>
          <p className="subtitle">Browse retail and wholesale products from local suppliers.</p>
        </div>
        <span className="live-indicator"><span /> Live catalog</span>
      </header>

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
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
