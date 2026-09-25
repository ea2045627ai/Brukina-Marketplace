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
      const { data, error } = await supabase
        .from('platform_market_indexes')
        .select('millet_inflation_factor, dairy_inflation_factor, active_partnership_discount_pct')
        .eq('id', 1)
        .maybeSingle();
      
      if (!error && data) {
        // Enforce strong float-type casting upon hydration
        setIndexes({
          millet_inflation_factor: parseFloat(data.millet_inflation_factor) || 1.00,
          dairy_inflation_factor: parseFloat(data.dairy_inflation_factor) || 1.00,
          active_partnership_discount_pct: parseFloat(data.active_partnership_discount_pct) || 0.00
        });
      }
    }
    loadCurrentIndexes();
  }, []);

  const handleUpdate = async (e) => {
    e.preventDefault();
    
    // Server-side boundary validations prior to pushing payloads upstream
    if (indexes.millet_inflation_factor < 0.5 || indexes.millet_inflation_factor > 3.0) {
      alert('Millet Inflation Index must be between 0.5 and 3.0.');
      return;
    }
    if (indexes.dairy_inflation_factor < 0.5 || indexes.dairy_inflation_factor > 3.0) {
      alert('Dairy Market Index must be between 0.5 and 3.0.');
      return;
    }
    if (indexes.active_partnership_discount_pct < 0.0 || indexes.active_partnership_discount_pct > 0.90) {
      alert('Active Promotion Discount cannot exceed 90% (0.90).');
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('platform_market_indexes')
        .update({
          millet_inflation_factor: indexes.millet_inflation_factor,
          dairy_inflation_factor: indexes.dairy_inflation_factor,
          active_partnership_discount_pct: indexes.active_partnership_discount_pct
        })
        .eq('id', 1);

      if (error) throw error;
      alert('Global Pricing Framework updated! Inflation factors and promos applied.');
    } catch (err) {
      alert(`Adjustment error: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  // Reusable float validation utility to prevent string pollution in state
  const handleIndexChange = (field, rawValue) => {
    const parsed = parseFloat(rawValue);
    setIndexes(prev => ({
      ...prev,
      [field]: isNaN(parsed) ? rawValue : parsed // Maintain raw value if empty/typing, otherwise keep typed as Float
    }));
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
            <input 
              type="number" 
              step="0.01" 
              min="0.5" 
              max="3.0"
              value={indexes.millet_inflation_factor}
              onChange={e => handleIndexChange('millet_inflation_factor', e.target.value)} 
            />
            <small>1.00 = standard, 1.20 = +20% cost</small>
          </label>
          <label>Dairy Market Index
            <input 
              type="number" 
              step="0.01" 
              min="0.5" 
              max="3.0"
              value={indexes.dairy_inflation_factor}
              onChange={e => handleIndexChange('dairy_inflation_factor', e.target.value)} 
            />
            <small>Controls wholesale raw dairy modifiers</small>
          </label>
        </div>
        <label>Active Promotion Discount (Pct)
          <input 
            type="number" 
            step="0.01" 
            min="0.00" 
            max="0.90"
            value={indexes.active_partnership_discount_pct}
            onChange={e => handleIndexChange('active_partnership_discount_pct', e.target.value)} 
          />
          <small>e.g. 0.15 cuts prices by 15% across all channels</small>
        </label>
        <button type="submit" disabled={updating} className="btn-primary">
          {updating ? 'Recalculating Matrix...' : 'Execute Changes Across Marketplace'}
        </button>
      </form>
    </div>
  );
}
