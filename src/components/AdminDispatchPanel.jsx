import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function AdminDispatchPanel() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [message, setMessage] = useState('');

  const loadDispatchQueue = useCallback(async () => {
    setLoading(true);
    setMessage('');

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('Admin authentication is required.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (profile?.role !== 'admin') {
        setOrders([]);
        setMessage('Admin access is required to dispatch orders.');
        return;
      }

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          status,
          total,
          delivery_address,
          created_at,
          vendor_id,
          order_items (
            id,
            quantity,
            unit_price,
            inventory_id,
            marketplace_inventory (
              id,
              product_name,
              vendor_name,
              vendor_id
            )
          ),
          deliveries (
            id,
            status,
            rider_id,
            updated_at
          )
        `)
        .eq('status', 'packed')
        .order('created_at', { ascending: true });

      if (error) throw error;

      setOrders(data || []);
    } catch (error) {
      console.error('[ADMIN DISPATCH]', error);
      setMessage(error?.message || 'Unable to load dispatch queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDispatchQueue();

    const channel = supabase
      .channel('admin-dispatch-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          loadDispatchQueue();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deliveries',
        },
        () => {
          loadDispatchQueue();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDispatchQueue]);

  const dispatchOrder = async (orderId) => {
    setActionId(orderId);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'dispatch_marketplace_order',
        {
          p_order_id: orderId,
        }
      );

      if (error) throw error;

      setMessage(
        data?.message ||
          'Order dispatched successfully. It is now available for rider assignment.'
      );

      await loadDispatchQueue();
    } catch (error) {
      console.error('[ADMIN DISPATCH]', error);
      setMessage(error?.message || 'Unable to dispatch this order.');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border p-4">
        <h2 className="text-lg font-semibold">Dispatch Queue</h2>
        <p className="mt-2 text-sm opacity-70">Loading packed orders...</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Dispatch Queue</h2>
          <p className="text-sm opacity-70">
            Packed orders waiting for admin dispatch.
          </p>
        </div>

        <button
          type="button"
          onClick={loadDispatchQueue}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Refresh
        </button>
      </div>

      {message && (
        <div className="mt-4 rounded-lg border p-3 text-sm">
          {message}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="mt-4 rounded-lg border p-4 text-sm opacity-70">
          No packed orders are currently waiting for dispatch.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {orders.map((order) => {
            const delivery = Array.isArray(order.deliveries)
              ? order.deliveries[0]
              : order.deliveries;

            return (
              <article
                key={order.id}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">
                      {order.order_number}
                    </h3>

                    <p className="text-sm opacity-70">
                      Status: {order.status}
                    </p>

                    {order.delivery_address && (
                      <p className="mt-1 text-sm">
                        Delivery: {order.delivery_address}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-semibold">
                      GH₵ {Number(order.total || 0).toFixed(2)}
                    </div>

                    <div className="text-xs opacity-60">
                      Delivery: {delivery?.status || 'not created'}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {(order.order_items || []).map((item) => (
                    <div
                      key={item.id}
                      className="flex justify-between gap-3 rounded-lg border p-2 text-sm"
                    >
                      <span>
                        {item.marketplace_inventory?.product_name ||
                          'Marketplace item'}
                      </span>

                      <span>
                        × {item.quantity}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    disabled={actionId === order.id}
                    onClick={() => dispatchOrder(order.id)}
                    className="rounded-lg border px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionId === order.id
                      ? 'Dispatching...'
                      : 'Dispatch to Riders'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
