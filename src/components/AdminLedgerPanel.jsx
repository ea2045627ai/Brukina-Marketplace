import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminLedgerPanel() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [financials, setFinancials] = useState({ grossSales: '0.00', platformFees: '0.00', activeVolume: 0 });

  useEffect(() => {
    async function fetchSystemLedger() {
      try {
        // FIXED: Explicitly pull relevant columns and add safety constraints
        const { data, error } = await supabase
          .from('orders')
          .select('id, quantity, total_amount, order_status, channel_origin, created_at, products(name, owner_type)')
          .order('created_at', { ascending: false })
          .limit(100); // Enforce a performance safety ceiling limit for active lists
          
        if (error) throw error;
        
        const safeData = data || [];
        setLedger(safeData);

        // Compute balances safely handles nullable relational models
        let totalGross = 0;
        let totalCommissions = 0;

        safeData.forEach(order => {
          const amount = parseFloat(order.total_amount) || 0;
          totalGross += amount;

          // Catch edge case where product record is missing or soft-deleted
          const ownerType = order.products?.owner_type;
          if (ownerType === 'vendor') {
            totalCommissions += amount * 0.10;
          } else if (ownerType === 'admin' || ownerType === 'native') {
            totalCommissions += amount;
          } else {
            // Safe fallback for soft-deleted inventory: log 10% commission minimum to prevent false audit profits
            totalCommissions += amount * 0.10;
          }
        });

        setFinancials({
          grossSales: totalGross.toFixed(2),
          platformFees: totalCommissions.toFixed(2),
          activeVolume: safeData.length
        });
      } catch (err) {
        console.error('Ledger retrieval error:', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSystemLedger();
  }, []);

  if (loading) return <div className="loading-state">Syncing platform escrow accounting...</div>;

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <span className="admin-tag">Admin Finance Node</span>
        <h2 className="panel-title">Ecosystem Transaction Ledger</h2>
        <p className="panel-subtitle">Audit cross-channel settlements and commission margins.</p>
      </div>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Gross Trade Volume</div>
          <div className="stat-value">GH₵ {financials.grossSales}</div>
        </div>
        <div className="stat-card highlight">
          <div className="stat-label accent">Your Accumulated Profits</div>
          <div className="stat-value accent">GH₵ {financials.platformFees}</div>
          <small className="stat-note">100% Retail + 10% B2B Commissions</small>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Orders Processed</div>
          <div className="stat-value">{financials.activeVolume} sales</div>
        </div>
      </section>

      <div className="data-table-wrapper">
        <h3>Settlement Activity Log</h3>
        {ledger.length === 0 ? (
          <div className="empty-state-box">No transactions tracked yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Channel</th>
                <th>Gross Total</th>
                <th>Your Share</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(order => {
                const ownerType = order.products?.owner_type;
                const amount = parseFloat(order.total_amount) || 0;
                
                // Keep UI visual math consistent with ledger array state parsing rules
                const revenueCut = ownerType === 'vendor' 
                  ? amount * 0.10 
                  : ownerType ? amount : amount * 0.10;

                return (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.products?.name || 'Deleted Product'}</strong>
                      <div className="row-meta">#{order.id.slice(0, 8)} · Qty: {order.quantity}</div>
                    </td>
                    <td>
                      <span className="channel-tag">
                        {order.channel_origin ? order.channel_origin.replace('_', ' ') : 'native'}
                      </span>
                    </td>
                    <td>GH₵ {amount.toFixed(2)}</td>
                    <td className="positive">GH₵ {revenueCut.toFixed(2)}</td>
                    <td><span className="status-badge">{order.order_status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
