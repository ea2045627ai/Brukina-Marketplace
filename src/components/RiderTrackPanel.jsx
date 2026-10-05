import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function RiderTrackPanel() {
  const [openJobs, setOpenJobs] = useState([]);
  const [myManifest, setMyManifest] = useState([]);
  const [syncing, setSyncing] = useState(true);
  const [actionId, setActionId] = useState(null);

  async function fetchLogisticsQueue() {
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data: available, error: availableError } = await supabase
        .from('deliveries')
        .select(`
          id,
          order_id,
          rider_id,
          status,
          updated_at,
          orders (
            id,
            order_number,
            total,
            status,
            order_items (
              quantity,
              marketplace_inventory (
                product_name,
                description
              )
            )
          )
        `)
        .eq('status', 'unassigned')
        .order('updated_at', { ascending: true });

      if (availableError) throw availableError;

      const { data: locked, error: lockedError } = await supabase
        .from('deliveries')
        .select(`
          id,
          order_id,
          rider_id,
          status,
          updated_at,
          orders (
            id,
            order_number,
            total,
            status,
            order_items (
              quantity,
              marketplace_inventory (
                product_name,
                description
              )
            )
          )
        `)
        .eq('rider_id', user.id)
        .in('status', ['assigned', 'picked_up', 'in_transit'])
        .order('updated_at', { ascending: true });

      if (lockedError) throw lockedError;

      const dispatched = (available || []).filter(
        (delivery) => delivery.orders?.status === 'out_for_delivery'
      );

      setOpenJobs(dispatched);
      setMyManifest(locked || []);
    } catch (err) {
      console.error('Logistics sync failure:', err.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    fetchLogisticsQueue();

    const channel = supabase
      .channel('brukina-rider-deliveries')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries'
        },
        () => fetchLogisticsQueue()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const callRpc = async (rpcName, deliveryId) => {
    setActionId(deliveryId);

    try {
      const { data, error } = await supabase.rpc(rpcName, {
        p_delivery_id: deliveryId
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Delivery action was rejected.');
      }

      await fetchLogisticsQueue();
    } catch (err) {
      alert(`Fulfillment error: ${err.message}`);
    } finally {
      setActionId(null);
    }
  };

  const handleAcceptShipment = (job) =>
    callRpc('rider_accept_delivery', job.id);

  const handlePickup = (job) =>
    callRpc('rider_pickup_delivery', job.id);

  const handleStartTransit = (job) =>
    callRpc('rider_start_delivery', job.id);

  const handleCompleteDelivery = (job) =>
    callRpc('rider_complete_delivery', job.id);

  const getFirstItem = (delivery) =>
    delivery.orders?.order_items?.[0]?.marketplace_inventory;

  const getQuantity = (delivery) =>
    delivery.orders?.order_items?.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );

  if (syncing) {
    return (
      <div className="loading-state">
        Querying real-time transit logs...
      </div>
    );
  }

  return (
    <div className="rider-panel">
      <div className="panel-header">
        <h2 className="panel-title">Logistics Dispatch Board</h2>
        <p className="panel-subtitle">
          Claim pending shipments and execute route distributions live.
        </p>
      </div>

      <div className="rider-grid">
        <div className="rider-column">
          <h3 className="rider-section-title">
            Open Shipments
            <span className="count-badge">{openJobs.length} available</span>
          </h3>

          {openJobs.length === 0 ? (
            <div className="empty-state-box">
              No dispatched cargo ready for pickup.
            </div>
          ) : (
            openJobs.map((job) => {
              const item = getFirstItem(job);
              const total = Number(job.orders?.total || 0);
              const fee = total * 0.08;

              return (
                <div key={job.id} className="job-card">
                  <div className="job-card-top">
                    <div>
                      <h4>{item?.product_name || 'Marketplace Package'}</h4>
                      <small>
                        Order #{job.orders?.order_number || job.order_id?.slice(0, 8)}
                      </small>
                    </div>

                    <span className="fee-badge">
                      GH₵ {fee.toFixed(2)}
                    </span>
                  </div>

                  <div className="job-location">
                    Pickup: Accra Wholesale Core Region
                    <br />
                    Qty: {getQuantity(job)}
                  </div>

                  <button
                    disabled={actionId !== null}
                    onClick={() => handleAcceptShipment(job)}
                    className="btn-primary"
                  >
                    {actionId === job.id
                      ? 'Securing route...'
                      : 'Accept Delivery'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="rider-column">
          <h3 className="rider-section-title">
            Your Active Manifest
            <span className="count-badge blue">
              {myManifest.length} active
            </span>
          </h3>

          {myManifest.length === 0 ? (
            <div className="empty-state-box">
              No shipments assigned to your manifest yet.
            </div>
          ) : (
            myManifest.map((delivery) => {
              const item = getFirstItem(delivery);
              const status = delivery.status;

              return (
                <div key={delivery.id} className="job-card active">
                  <div className="job-card-top">
                    <span className="status-tag">
                      {status.replace('_', ' ')}
                    </span>

                    <small>
                      #{delivery.orders?.order_number || delivery.order_id?.slice(0, 8)}
                    </small>
                  </div>

                  <div className="job-location">
                    Cargo: {item?.product_name || 'Marketplace Package'}
                    <br />
                    Qty: {getQuantity(delivery)}
                    <br />
                    Drop: Customer delivery address
                  </div>

                  {status === 'assigned' && (
                    <button
                      disabled={actionId !== null}
                      onClick={() => handlePickup(delivery)}
                      className="btn-primary"
                    >
                      {actionId === delivery.id
                        ? 'Confirming...'
                        : 'Confirm Pickup'}
                    </button>
                  )}

                  {status === 'picked_up' && (
                    <button
                      disabled={actionId !== null}
                      onClick={() => handleStartTransit(delivery)}
                      className="btn-primary"
                    >
                      {actionId === delivery.id
                        ? 'Starting...'
                        : 'Start Delivery'}
                    </button>
                  )}

                  {status === 'in_transit' && (
                    <button
                      disabled={actionId !== null}
                      onClick={() => handleCompleteDelivery(delivery)}
                      className="btn-success"
                    >
                      {actionId === delivery.id
                        ? 'Confirming...'
                        : 'Confirm Delivered'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
