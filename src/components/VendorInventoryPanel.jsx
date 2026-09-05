import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function VendorInventoryPanel() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newBasePrice, setNewBasePrice] = useState('');
  const [syncingId, setSyncingId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  useEffect(() => {
    async function loadVendorCatalog() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data, error } = await supabase
          .from('products')
          .select('id, name, vendor_base_retail_price, price, stock_count, category')
          .eq('vendor_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setProducts(data || []);
      } catch (err) {
        console.error('Error loading vendor items:', err.message);
      } finally {
        setLoading(false);
      }
    }
    loadVendorCatalog();
  }, []);

  const handleUpdatePrice = async (productId) => {
    const parsedPrice = parseFloat(newBasePrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid positive base price.');
      return;
    }
    setSyncingId(productId);
    try {
      const { error } = await supabase
        .from('products')
        .update({ vendor_base_retail_price: parsedPrice })
        .eq('id', productId);
      if (error) throw error;
      alert('Base price updated! The system has recalculated the final marketplace price.');
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from('products')
        .select('id, name, vendor_base_retail_price, price, stock_count, category')
        .eq('vendor_id', user.id);
      setProducts(data || []);
      setEditingId(null);
      setNewBasePrice('');
    } catch (err) {
      alert(`Pricing error: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  if (loading) return <div className="loading-state">Syncing vendor stock logs...</div>;

  return (
    <div className="vendor-panel">
      <div className="panel-header">
        <h2 className="panel-title">Storefront Pricing & Control</h2>
        <p className="panel-subtitle">Set your base pricing. The platform automatically applies market calculations.</p>
        <button onClick={() => setIsUploadOpen(true)} className="btn-primary">+ List New Product</button>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Your Base Cost</th>
              <th>Live App Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr><td colSpan="4" className="empty-row">No products listed yet. Click "List New Product" to start.</td></tr>
            ) : (
              products.map(p => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="row-meta">{p.category} · {p.stock_count} units left</div>
                  </td>
                  <td>
                    {editingId === p.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={newBasePrice}
                        onChange={(e) => setNewBasePrice(e.target.value)}
                        placeholder={p.vendor_base_retail_price}
                        className="inline-input"
                      />
                    ) : (
                      `GH₵ ${p.vendor_base_retail_price || '—'}`
                    )}
                  </td>
                  <td className="price-highlight">GH₵ {p.price}</td>
                  <td>
                    {editingId === p.id ? (
                      <div className="action-row">
                        <button onClick={() => setEditingId(null)} className="btn-text">Cancel</button>
                        <button
                          disabled={syncingId !== null}
                          onClick={() => handleUpdatePrice(p.id)}
                          className="btn-small"
                        >{syncingId === p.id ? 'Saving...' : 'Save'}</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingId(p.id); setNewBasePrice(p.vendor_base_retail_price || ''); }} className="btn-outline">
                        Adjust Price
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isUploadOpen && <VendorUploadModal isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} onUploadSuccess={() => {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          const { data } = await supabase.from('products').select('id, name, vendor_base_retail_price, price, stock_count, category').eq('vendor_id', user.id);
          setProducts(data || []);
        });
      }} />}
    </div>
  );
}

function VendorUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food & Beverage');
  const [price, setPrice] = useState('');
  const [stockCount, setStockCount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication missing. Please sign in.');
      const { error: insertError } = await supabase.from('products').insert([{
        vendor_id: user.id,
        owner_type: 'vendor',
        target_buyer_type: 'customer_only',
        name: name.trim(),
        category,
        price: parseFloat(price),
        stock_count: parseInt(stockCount, 10),
        description: description.trim()
      }]);
      if (insertError) throw insertError;
      alert(`"${name}" listed successfully!`);
      setName(''); setPrice(''); setStockCount(''); setDescription('');
      onUploadSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="modal-close">×</button>
        <h3>List a New Product</h3>
        <p className="modal-subtitle">Release products across active marketplace categories.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit} className="form-stack">
          <label>Product Title
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Stainless Steel Whisk Set" required />
          </label>
          <label>Category
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option>Food & Beverage</option>
              <option>Kitchenware</option>
              <option>Cosmetics</option>
            </select>
          </label>
          <div className="form-row">
            <label>Price (GH₵)
              <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" required />
            </label>
            <label>Initial Stock
              <input type="number" value={stockCount} onChange={e => setStockCount(e.target.value)} placeholder="0" required />
            </label>
          </div>
          <label>Description
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Material, weight, instructions..." required />
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Publishing...' : 'Publish to Marketplace'}
          </button>
        </form>
      </div>
    </div>
  );
}
