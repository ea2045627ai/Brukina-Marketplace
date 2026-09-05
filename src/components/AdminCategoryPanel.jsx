import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminCategoryPanel() {
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const { data, error } = await supabase.from('product_categories').select('*').order('name');
        if (error) throw error;
        setCategories(data || []);
      } catch (err) {
        console.error('Failed to sync categories:', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('product_categories')
        .insert([{ name: newCatName.trim(), icon: newCatIcon }]).select();
      if (error) throw error;
      alert(`Category "${newCatName}" created!`);
      setCategories([...categories, ...data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCatName('');
      setNewCatIcon('📦');
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-state">Syncing taxonomy records...</div>;

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <span className="admin-tag">Platform Category Administration</span>
        <h2 className="panel-title">Category Management</h2>
        <p className="panel-subtitle">Add new product classifications to expand frontend filters.</p>
      </div>
      <div className="category-admin-grid">
        <div className="form-card">
          <h3>Create Category</h3>
          <form onSubmit={handleCreate} className="form-stack">
            <label>Category Title
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Electronics" required />
            </label>
            <label>Visual Icon
              <select value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)}>
                <option value="📦">📦 Package</option>
                <option value="⚡">⚡ Electronics</option>
                <option value="👕">👕 Apparel</option>
                <option value="🧴">🧴 Personal Care</option>
                <option value="🏺">🏺 Home Decor</option>
              </select>
            </label>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Processing...' : 'Add New Category'}
            </button>
          </form>
        </div>
        <div className="form-card">
          <h3>Active Classifications</h3>
          <div className="category-list">
            {categories.map(cat => (
              <div key={cat.id} className="category-row">
                <div className="category-info">
                  <span className="category-icon">{cat.icon}</span>
                  <span className="category-name">{cat.name}</span>
                </div>
                <small className="category-id">UID: {cat.id.slice(0,8)}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
