import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function RiderTrackPanel() {
  const [openJobs, setOpenJobs] = useState([]);
  const [myManifest, setMyManifest] = useState([]);
  const [syncing, setSyncing] = useState(true);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    async function fetchLogisticsQueue() {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('id, quantity, total_amount, order_status, created_at, products(name, description)')
          .eq('order_status', 'Processing')
          .order('created_at', { ascending: true });
        if (error) throw error;
        setOpenJobs(data || []);
      } catch (err) {
        console.error('Logistics sync failure:', err.message);
      } finally {
        setSyncing(false);
      }
    }
    fetchLogisticsQueue();
  }, []);

  const handleAcceptShipment = async (job) => {
    setActionId(job.id);
    try {
      const { error } = await supabase.from('orders').update({ order_status: 'In Transit' }).eq('id', job.id);
      if (error) throw error;
      alert(`Route locked! Dispatch ${job.id.slice(0,8)} added to your manifest.`);
      setOpenJobs(openJobs.filter(item => item.id !== job.id));
      setMyManifest([{ ...job, order_status: 'In Transit' }, ...myManifest]);
    } catch (err) {
      alert(`Error claiming route: ${err.message}`);
    } finally {
      setActionId(null);
    }
  };

  const handleCompleteDelivery = async (orderId) => {
    setActionId(orderId);
    try {
      const { error } = await supabase.from('orders').update({ order_status: 'Delivered' }).eq('id', orderId);
      if (error) throw error;
      alert('Shipment confirmed! Earnings credited to your wallet.');
      setMyManifest(myManifest.filter(item => item.id !== orderId));
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
                >{actionId === job.id ? 'Securing route...' : 'Accept Delivery'}</button>
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
                >{actionId === delivery.id ? 'Confirming...' : 'Confirm Delivered'}</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
