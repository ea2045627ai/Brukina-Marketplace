import React, { useState, useEffect } from 'react';
import { useRealtimeCatalog } from '../hooks/useRealtimeCatalog';
import { supabase } from '../lib/supabaseClient';

export default function DynamicMarketplaceEngine({ activeUserRole = 'Customer' }) {
  const { products, setProducts, loading } = useRealtimeCatalog();
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutProduct, setCheckoutProduct] = useState(null);
  const [buyingId, setBuyingId] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from('product_categories').select('*').order('name');
      if (data) setCategories(data);
    }
    loadCategories();
  }, []);

  useEffect(() => {
    let result = products;
    if (activeCategory !== 'All') {
      result = result.filter(p => p.category === activeCategory);
    }
    if (searchQuery.trim() !== '') {
      result = result.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredProducts(result);
  }, [activeCategory, searchQuery, products]);

  const handleAddToCart = (product, e) => {
    if (e) e.stopPropagation();
    if (product.stock_count <= 0) return;
    const existing = cart.find(c => c.id === product.id);
    if (existing) {
      if (existing.quantity >= product.stock_count) return;
      setCart(cart.map(c => c.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const handleCheckout = async () => {
    setBuyingId('cart-checkout');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Session missing. Please sign in to your workspace.');
        return;
      }
      for (const item of cart) {
        await supabase.from('orders').insert({
          customer_id: user.id,
          product_id: item.id,
          quantity: item.quantity,
          total_amount: item.price * item.quantity,
          channel_origin: item.channel_source
        });
        await supabase.from('products').update({ stock_count: item.stock_count - item.quantity }).eq('id', item.id);
      }
      alert('Order confirmed! Your tracking timeline is active.');
      setCart([]);
      setIsCartOpen(false);
      const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false });
      setProducts(data || []);
    } catch (err) {
      alert(`Checkout failed: ${err.message}`);
    } finally {
      setBuyingId(null);
    }
  };

  if (loading) return <div className="loading-state">Syncing marketplace catalog...</div>;

  return (
    <div className="marketplace-container">
      <header className="marketplace-header">
        <div>
          <span className="eyebrow-tag">Brukina Access Hub</span>
          <h1 className="marketplace-title">E-Commerce Trading Matrix</h1>
          <p className="marketplace-subtitle">Active Workspace: <span className="role-tag">{activeUserRole} View</span></p>
        </div>
        <button onClick={() => setIsCartOpen(true)} className="cart-button">
          <span>Cart</span>
          <span className="cart-badge">{cart.reduce((t, i) => t + i.quantity, 0)}</span>
        </button>
      </header>

      <div className="search-row">
        <input
          type="text"
          placeholder="Search products, cosmetics, cookware, wholesale supplies..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      <nav className="category-pills">
        <button
          onClick={() => setActiveCategory('All')}
          className={`pill ${activeCategory === 'All' ? 'active' : ''}`}
        >All</button>
        {categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.name)}
            className={`pill ${activeCategory === c.name ? 'active' : ''}`}
          >{c.icon} {c.name}</button>
        ))}
      </nav>

      <div className="product-grid">
        {filteredProducts.length === 0 ? (
          <div className="empty-catalog">No products found in the "{activeCategory}" category.</div>
        ) : (
          filteredProducts.map(p => {
            const isOut = p.stock_count <= 0;
            const displayPrice = activeUserRole === 'Vendor'
              ? (parseFloat(p.price) * 0.85).toFixed(2)
              : parseFloat(p.price).toFixed(2);
            return (
              <div key={p.id} onClick={() => setSelectedProduct(p)} className="product-card">
                <div className={`product-thumb ${p.channel_source === 'shopify_store' ? 'shopify' : p.channel_source === 'walmart_dealership' ? 'walmart' : 'native'}`}>
                  {p.name.charAt(0)}
                  <span className="channel-badge">{p.channel_source ? p.channel_source.replace('_', ' ') : 'Native'}</span>
                </div>
                <div className="product-body">
                  <h3 className="product-name">{p.name}</h3>
                  <p className="product-desc">{p.description || 'No description available.'}</p>
                  <div className="product-footer">
                    <div>
                      <span className="product-price">GH₵ {displayPrice}</span>
                      <span className={`stock-info ${isOut ? 'out' : ''}`}>{isOut ? 'Sold Out' : `${p.stock_count} units`}</span>
                    </div>
                    <button
                      disabled={isOut}
                      onClick={(e) => handleAddToCart(p, e)}
                      className="add-button"
                    >{isOut ? 'Out' : 'Add +'}</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSelectedProduct(null)} className="modal-close">×</button>
            <span className="modal-category-badge">{selectedProduct.category}</span>
            <h2 className="modal-title">{selectedProduct.name}</h2>
            <div className="modal-price-box">
              <div>
                <span className="modal-price-label">Market Cost</span>
                <div className="modal-price-value">GH₵ {parseFloat(selectedProduct.price).toFixed(2)}</div>
              </div>
              <div className="modal-stock">
                <span className="modal-price-label">Stock</span>
                <div>{selectedProduct.stock_count > 0 ? `${selectedProduct.stock_count} units` : 'Out of stock'}</div>
              </div>
            </div>
            <div className="modal-bio">
              <h4>Product Details</h4>
              <p>{selectedProduct.description || 'No description available.'}</p>
              <p>Brand Origin: {selectedProduct.brand_origin || 'Platform Native'}</p>
              <p>External ID: {selectedProduct.external_variant_id || 'N/A'}</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setSelectedProduct(null)} className="btn-secondary">Back to Catalog</button>
              <button
                disabled={selectedProduct.stock_count <= 0}
                onClick={() => { setCheckoutProduct(selectedProduct); setSelectedProduct(null); }}
                className="btn-primary"
              >Checkout →</button>
            </div>
          </div>
        </div>
      )}

      {checkoutProduct && (
        <div className="modal-overlay" onClick={() => setCheckoutProduct(null)}>
          <div className="modal-content checkout-modal" onClick={e => e.stopPropagation()}>
            <button onClick={() => setCheckoutProduct(null)} className="modal-close">×</button>
            <h3>Secure Payment Gateway</h3>
            <p className="modal-subtitle">Finalizing: {checkoutProduct.name}</p>
            <div className="checkout-summary">
              <div className="checkout-line"><span>Product Cost:</span><span>GH₵ {parseFloat(checkoutProduct.price).toFixed(2)}</span></div>
              <div className="checkout-line"><span>Delivery Fee:</span><span>GH₵ 15.00</span></div>
              <div className="checkout-total"><span>Total:</span><span className="total-value">GH₵ {(parseFloat(checkoutProduct.price) + 15).toFixed(2)}</span></div>
            </div>
            <button
              disabled={buyingId !== null}
              onClick={async () => {
                setBuyingId('checkout');
                try {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (!user) { alert('Please sign in first.'); return; }
                  await supabase.from('orders').insert({
                    customer_id: user.id,
                    product_id: checkoutProduct.id,
                    quantity: 1,
                    total_amount: checkoutProduct.price,
                    delivery_fee: 15,
                    order_status: 'Processing',
                    channel_origin: checkoutProduct.channel_source
                  });
                  await supabase.from('products').update({ stock_count: checkoutProduct.stock_count - 1 }).eq('id', checkoutProduct.id);
                  alert('Order confirmed!');
                  setCheckoutProduct(null);
                } catch (err) { alert(`Checkout failed: ${err.message}`); }
                finally { setBuyingId(null); }
              }}
              className="btn-primary checkout-btn"
            >{buyingId ? 'Processing...' : 'Pay Now →'}</button>
          </div>
        </div>
      )}

      {isCartOpen && (
        <div className="modal-overlay" onClick={() => setIsCartOpen(false)}>
          <div className="modal-content cart-modal" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsCartOpen(false)} className="modal-close">×</button>
            <h3>Shopping Cart</h3>
            {cart.length === 0 ? (
              <p className="empty-cart">Your cart is empty.</p>
            ) : (
              <>
                {cart.map(item => (
                  <div key={item.id} className="cart-item">
                    <div>
                      <strong>{item.name}</strong>
                      <small>Qty: {item.quantity} · GH₵ {item.price} each</small>
                    </div>
                    <span>GH₵ {(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="cart-total">
                  <span>Total: GH₵ {cart.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2)}</span>
                </div>
                <button
                  disabled={buyingId !== null}
                  onClick={handleCheckout}
                  className="btn-primary checkout-btn"
                >{buyingId ? 'Processing...' : 'Confirm Checkout'}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
