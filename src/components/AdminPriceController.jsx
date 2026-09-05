import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminPriceController() {
  const [indexes, setIndexes] = useState({
    millet_inflation_factor: 1.00,
    dairy_inflation_factor: 1.00,
    active_partnership_discount_pct: 0.00
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    async function loadCurrentIndexes() {
      const { data } = await supabase.from('platform_market_indexes').select('*').eq('id', 1).maybeSingle();
      if (data) setIndexes(data);
    }
    loadCurrentIndexes();
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setUpdating(true);
    try {
      const { error } = await supabase.from('platform_market_indexes').update({
        millet_inflation_factor: parseFloat(indexes.millet_inflation_factor),
        dairy_inflation_factor: parseFloat(indexes.dairy_inflation_factor),
        active_partnership_discount_pct: parseFloat(indexes.active_partnership_discount_pct)
      }).eq('id', 1);
      if (error) throw error;
      alert('Global Pricing Framework updated! Inflation factors and promos applied.');
    } catch (err) {
      alert(`Adjustment error: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <span className="admin-tag">Admin Economic Dashboard</span>
        <h2 className="panel-title">Dynamic Pricing Configurator</h2>
        <p className="panel-subtitle">Control local market parameters to scale wholesale returns.</p>
      </div>
      <form onSubmit={handleUpdate} className="form-stack">
        <div className="form-row">
          <label>Millet Inflation Index
            <input type="number" step="0.01" min="0.5" max="3.0"
              value={indexes.millet_inflation_factor}
              onChange={e => setIndexes({...indexes, millet_inflation_factor: e.target.value})} />
            <small>1.00 = standard, 1.20 = +20% cost</small>
          </label>
          <label>Dairy Market Index
            <input type="number" step="0.01" min="0.5" max="3.0"
              value={indexes.dairy_inflation_factor}
              onChange={e => setIndexes({...indexes, dairy_inflation_factor: e.target.value})} />
          </label>
        </div>
        <label>Active Promotion Discount (Pct)
          <input type="number" step="0.01" min="0.00" max="0.90"
            value={indexes.active_partnership_discount_pct}
            onChange={e => setIndexes({...indexes, active_partnership_discount_pct: e.target.value})} />
          <small>e.g. 0.15 cuts prices by 15% across all channels</small>
        </label>
        <button type="submit" disabled={updating} className="btn-primary">
          {updating ? 'Recalculating...' : 'Execute Changes Across Marketplace'}
        </button>
      </form>
    </div>
  );
}
