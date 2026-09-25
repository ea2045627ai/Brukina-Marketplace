import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function VendorInventoryPanel() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newBasePrice, setNewBasePrice] = useState('');
  const [syncingId, setSyncingId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // Unified orchestration hook to load items from the production marketplace_inventory table context
  async function loadVendorCatalog() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      
      const { data, error } = await supabase
        .from('marketplace_inventory')
        .select('id, name, price, stock_quantity, minimum_order_quantity, active, category')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setInventory(data || []);
    } catch (err) {
      console.error('Error loading vendor items:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVendorCatalog();
  }, []);

  const handleUpdatePrice = async (inventoryId) => {
    const parsedPrice = parseFloat(newBasePrice);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid positive market price.');
      return;
    }
    setSyncingId(inventoryId);
    try {
      // Modifies the precise cost parameters under the correct system metrics
      const { error } = await supabase
        .from('marketplace_inventory')
        .update({ price: parsedPrice })
        .eq('id', inventoryId);
        
      if (error) throw error;
      alert('Catalog price updated successfully!');
      await loadVendorCatalog();
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
        <p className="panel-subtitle">Manage your item inventory and market cost variables live.</p>
        <button onClick={() => setIsUploadOpen(true)} className="btn-primary">+ List New Product</button>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Product Asset</th>
              <th>Market Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {inventory.length === 0 ? (
              <tr><td colSpan="3" className="empty-row">No products listed yet. Click "List New Product" to start.</td></tr>
            ) : (
              inventory.map(p => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="row-meta">{p.category || 'Native'} · {p.stock_quantity} units available (MOQ: {p.minimum_order_quantity || 1})</div>
                  </td>
                  <td>
                    {editingId === p.id ? (
                      <input
                        type="number"
                        step="0.01"
                        value={newBasePrice}
                        onChange={(e) => setNewBasePrice(e.target.value)}
                        placeholder={parseFloat(p.price).toFixed(2)}
                        className="inline-input"
                        aria-label={`Edit price for ${p.name}`}
                      />
                    ) : (
                      `GH₵ ${parseFloat(p.price).toFixed(2)}`
                    )}
                  </td>
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
                      <button onClick={() => { setEditingId(p.id); setNewBasePrice(p.price || ''); }} className="btn-outline">
                        Adjust Cost
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isUploadOpen && (
        <VendorUploadModal 
          isOpen={isUploadOpen} 
          onClose={() => setIsUploadOpen(false)} 
          onUploadSuccess={loadVendorCatalog} 
        />
      )}
    </div>
  );
}

function VendorUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food & Beverage');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication session missing. Please sign in again.');
      
      // Structural insert matching the marketplace_inventory constraints
      const { error: insertError } = await supabase.from('marketplace_inventory').insert([{
        vendor_id: user.id,
        name: name.trim(),
        category,
        price: parseFloat(price),
        stock_quantity: parseInt(stockQuantity, 10),
        minimum_order_quantity: parseInt(minOrderQty, 10),
        active: true
      }]);
      
      if (insertError) throw insertError;
      alert(`"${name}" successfully cataloged in the trade matrix!`);
      
      setName(''); setPrice(''); setStockQuantity(''); setMinOrderQty('1');
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
        <button onClick={onClose} className="modal-close" aria-label="Close inventory upload layout panel">×</button>
        <h3>List a New Product</h3>
        <p className="modal-subtitle">Publish products across active trading categories.</p>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <form onSubmit={handleSubmit} className="form-stack">
          <label>Product Asset Title
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Premium Millet Bags (Wholesale)" required />
          </label>
          <label>Category Group
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="Food & Beverage">Food & Beverage</option>
              <option value="Kitchenware">Kitchenware</option>
              <option value="Cosmetics">Cosmetics</option>
            </select>
          </label>
          <div className="form-row">
            <label>Wholesale Price (GH₵)
              <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" required />
            </label>
            <label>Available Stock
              <input type="number" value={stockQuantity} onChange={e => setStockQuantity(e.target.value)} placeholder="0" required />
            </label>
          </div>
          <label>Minimum Order Quantity (MOQ)
            <input type="number" value={minOrderQty} onChange={e => setMinOrderQty(e.target.value)} min="1" placeholder="1" required />
          </label>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Publishing Asset...' : 'Confirm Inventory Entry'}
          </button>
        </form>
      </div>
    </div>
  );
}
