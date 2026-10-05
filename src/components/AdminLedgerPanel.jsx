import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminLedgerPanel() {
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [financials, setFinancials] = useState({
    grossSales: '0.00',
    platformFees: '0.00',
    activeVolume: 0
  });

  useEffect(() => {
    async function fetchSystemLedger() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            id,
            order_number,
            total,
            status,
            created_at,
            vendor_id,
            order_items (
              quantity,
              marketplace_inventory (
                product_name,
                vendor_name,
                vendor_id
              )
            )
          `)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        const safeData = data || [];
        setLedger(safeData);

        let totalGross = 0;
        let totalCommissions = 0;

        safeData.forEach((order) => {
          const amount = Number(order.total || 0);
          totalGross += amount;

          const item = order.order_items?.[0]?.marketplace_inventory;
          const hasVendor = Boolean(
            order.vendor_id || item?.vendor_id || item?.vendor_name
          );

          totalCommissions += hasVendor
            ? amount * 0.10
            : amount;
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

  if (loading) {
    return (
      <div className="loading-state">
        Syncing platform escrow accounting...
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <span className="admin-tag">Admin Finance Node</span>
        <h2 className="panel-title">Ecosystem Transaction Ledger</h2>
        <p className="panel-subtitle">
          Audit cross-channel settlements and commission margins.
        </p>
      </div>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Gross Trade Volume</div>
          <div className="stat-value">
            GH₵ {financials.grossSales}
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-label accent">
            Your Accumulated Profits
          </div>
          <div className="stat-value accent">
            GH₵ {financials.platformFees}
          </div>
          <small className="stat-note">
            100% Retail + 10% B2B Commissions
          </small>
        </div>

        <div className="stat-card">
          <div className="stat-label">Total Orders Processed</div>
          <div className="stat-value">
            {financials.activeVolume} sales
          </div>
        </div>
      </section>

      <div className="data-table-wrapper">
        <h3>Settlement Activity Log</h3>

        {ledger.length === 0 ? (
          <div className="empty-state-box">
            No transactions tracked yet.
          </div>
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
              {ledger.map((order) => {
                const item =
                  order.order_items?.[0]?.marketplace_inventory;

                const amount = Number(order.total || 0);

                const hasVendor = Boolean(
                  order.vendor_id ||
                  item?.vendor_id ||
                  item?.vendor_name
                );

                const revenueCut = hasVendor
                  ? amount * 0.10
                  : amount;

                const quantity =
                  order.order_items?.reduce(
                    (sum, line) =>
                      sum + Number(line.quantity || 0),
                    0
                  ) || 0;

                return (
                  <tr key={order.id}>
                    <td>
                      <strong>
                        {item?.product_name || 'Marketplace item'}
                      </strong>

                      <div className="row-meta">
                        #{order.order_number || order.id.slice(0, 8)}
                        {' · '}
                        Qty: {quantity}
                      </div>
                    </td>

                    <td>
                      <span className="channel-tag">
                        {hasVendor ? 'vendor' : 'native'}
                      </span>
                    </td>

                    <td>
                      GH₵ {amount.toFixed(2)}
                    </td>

                    <td className="positive">
                      GH₵ {revenueCut.toFixed(2)}
                    </td>

                    <td>
                      <span className="status-badge">
                        {order.status}
                      </span>
                    </td>
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
