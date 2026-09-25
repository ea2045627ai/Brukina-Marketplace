import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function RiderTrackPanel() {
  const [openJobs, setOpenJobs] = useState([]);
  const [myManifest, setMyManifest] = useState([]);
  const [syncing, setSyncing] = useState(true);
  const [actionId, setActionId] = useState(null);

  // Core orchestration engine to download clear contextual lines from Supabase
  async function fetchLogisticsQueue() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch available jobs that haven't been claimed by any dispatch rider yet
      const { data: available, error: availableError } = await supabase
        .from('orders')
        .select('id, quantity, total_amount, order_status, created_at, products(name, description)')
        .eq('order_status', 'Processing')
        .order('created_at', { ascending: true });
      if (availableError) throw availableError;

      // 2. Hydrate active manifest dynamically from database logs to survive browser reloads
      const { data: locked, error: lockedError } = await supabase
        .from('orders')
        .select('id, quantity, total_amount, order_status, created_at, products(name, description)')
        .eq('order_status', 'In Transit')
        .eq('rider_id', user.id) // Ensure explicit data boundary matching your auth framework
        .order('created_at', { ascending: true });
      if (lockedError) throw lockedError;

      setOpenJobs(available || []);
      setMyManifest(locked || []);
    } catch (err) {
      console.error('Logistics sync failure:', err.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchLogisticsQueue();
  }, []);

  const handleAcceptShipment = async (job) => {
    setActionId(job.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication expired. Sign in again.');

      // CRITICAL FIX: Ensure we only update if it is STILL processing to prevent double-claiming
      const { data, error } = await supabase
        .from('orders')
        .update({ 
          order_status: 'In Transit',
          rider_id: user.id 
        })
        .eq('id', job.id)
        .eq('order_status', 'Processing') // Conditional constraint protects ledger against race mutations
        .select();

      if (error) throw error;

      // If data array comes back empty, another rider has claimed it milliseconds prior
      if (!data || data.length === 0) {
        throw new Error('This shipment has already been locked by another dispatcher.');
      }

      alert(`Route locked! Dispatch ${job.id.slice(0,8)} added to your manifest.`);
      await fetchLogisticsQueue(); // Re-sync ground-truth data cleanly
    } catch (err) {
      alert(`Error claiming route: ${err.message}`);
    } finally {
      setActionId(null);
    }
  };

  const handleCompleteDelivery = async (orderId) => {
    setActionId(orderId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Authentication expired.');

      // Secure payload update targeting specific order rows matching current rider account
      const { error } = await supabase
        .from('orders')
        .update({ order_status: 'Delivered' })
        .eq('id', orderId)
        .eq('rider_id', user.id);
        
      if (error) throw error;

      alert('Shipment confirmed! Earnings credited to your wallet.');
      await fetchLogisticsQueue();
    } catch (err) {
      alert(`Fulfillment error: ${err.message}`);
    } finally {
      setActionId(null);
    }
  };

  if (syncing) return <div className="loading-state">Querying real-time transit logs...</div>;

  return (
    <div className="rider-panel">
      <div className="panel-header">
        <h2 className="panel-title">Logistics Dispatch Board</h2>
        <p className="panel-subtitle">Claim pending batches and execute route distributions live.</p>
      </div>

      <div className="rider-grid">
        <div className="rider-column">
          <h3 className="rider-section-title">
            Open Shipments
            <span className="count-badge">{openJobs.length} available</span>
          </h3>
          {openJobs.length === 0 ? (
            <div className="empty-state-box">No processing cargo ready for pickup.</div>
          ) : (
            openJobs.map(job => (
              <div key={job.id} className="job-card">
                <div className="job-card-top">
                  <div>
                    <h4>{job.products?.name || 'Wholesale Package'}</h4>
                    <small>Ref: #{job.id.slice(0, 8)}</small>
                  </div>
                  <span className="fee-badge">GH₵ {(parseFloat(job.total_amount) * 0.08).toFixed(2)}</span>
                </div>
                <div className="job-location">Pickup: Accra Wholesale Core Region</div>
                <button
                  disabled={actionId !== null}
                  onClick={() => handleAcceptShipment(job)}
                  className="btn-primary"
                >
                  {actionId === job.id ? 'Securing route...' : 'Accept Delivery'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="rider-column">
          <h3 className="rider-section-title">
            Your Active Manifest
            <span className="count-badge blue">{myManifest.length} locked</span>
          </h3>
          {myManifest.length === 0 ? (
            <div className="empty-state-box">No shipments locked to your manifest yet.</div>
          ) : (
            myManifest.map(delivery => (
              <div key={delivery.id} className="job-card active">
                <div className="job-card-top">
                  <span className="status-tag">En Route</span>
                  <small>Ref: #{delivery.id.slice(0,8)}</small>
                </div>
                <div className="job-location">
                  Cargo: {delivery.products?.name} (Qty: {delivery.quantity})<br/>
                  Drop: Korle Klottey, Accra
                </div>
                <button
                  disabled={actionId !== null}
                  onClick={() => handleCompleteDelivery(delivery.id)}
                  className="btn-success"
                >
                  {actionId === delivery.id ? 'Confirming...' : 'Confirm Delivered'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
