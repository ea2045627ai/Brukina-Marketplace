import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function DynamicMarketplaceEngine({ activeUserRole }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const loadMarketplaceCatalog = async () => {
    try {
      const { data, error } = await supabase
        .from('marketplace_inventory')
        .select(
          'id, product_name, price, stock_quantity, minimum_order_quantity, category, vendor_name, image_url'
        )
        .eq('active', true)
        .gt('stock_quantity', 0)
        .order('product_name', { ascending: true });

      if (error) throw error;

      setCatalog(data || []);
    } catch (err) {
      console.error(
        'Error fetching marketplace inventory:',
        err.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarketplaceCatalog();

    const catalogChannel = supabase
      .channel('brukina-dynamic-marketplace')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'marketplace_inventory'
        },
        () => {
          loadMarketplaceCatalog();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(catalogChannel);
    };
  }, []);

  const updateCartQuantity = (
    itemId,
    change,
    minQty,
    maxStock
  ) => {
    setCart((prev) => {
      const current = Number(prev[itemId] || 0);

      if (change > 0 && current === 0) {
        const initialQty = Math.min(minQty, maxStock);

        if (initialQty <= 0) {
          return prev;
        }

        return {
          ...prev,
          [itemId]: initialQty
        };
      }

      let target = current + change;

      if (target <= 0) {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      }

      target = Math.min(target, maxStock);

      if (target < minQty) {
        target = minQty;
      }

      return {
        ...prev,
        [itemId]: target
      };
    });
  };

  const executeBulkCheckout = async (itemId) => {
    const qty = Number(cart[itemId] || 0);

    if (!Number.isInteger(qty) || qty < 1) {
      return;
    }

    setCheckoutLoading(true);

    try {
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.access_token) {
        throw new Error(
          'Authentication session expired. Please sign in again.'
        );
      }

      const response = await fetch(
        '/.netlify/functions/create-order',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            inventory_id: itemId,
            quantity: qty
          })
        }
      );

      let result = {};

      try {
        result = await response.json();
      } catch {
        result = {};
      }

      if (response.status === 402 || result.payment_required) {
        throw new Error(
          result.error ||
            'Insufficient wallet balance. Please fund your Brukina wallet before checkout.'
        );
      }

      if (response.status === 409 || result.inventory_error) {
        throw new Error(
          result.error ||
            'The requested inventory is no longer available in the required quantity.'
        );
      }

      if (!response.ok || !result.accepted) {
        throw new Error(
          result.error ||
            'The order could not be created.'
        );
      }

      alert(
        `Order ${result.order_number} successfully generated and routed to the Operations Desk.`
      );

      setCart((prev) => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });

      await loadMarketplaceCatalog();
    } catch (err) {
      console.error('Checkout processing error:', err);

      alert(
        `Checkout processing error: ${
          err?.message || 'Unable to complete checkout.'
        }`
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        Syncing live wholesale trading matrix...
      </div>
    );
  }

  return (
    <div className="marketplace-engine">
      <div className="engine-header">
        <h2 className="engine-title">
          Brukina Wholesale Trading Floor
        </h2>

        <p className="engine-subtitle">
          Review real-time supply indexes and route bulk asset
          sourcing orders securely.
        </p>

        {activeUserRole && (
          <p>
            Active workspace:{' '}
            <strong>{activeUserRole}</strong>
          </p>
        )}
      </div>

      <div
        className="catalog-grid"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '20px',
          marginTop: '20px'
        }}
      >
        {catalog.length === 0 ? (
          <div
            className="empty-catalog"
            style={{
              gridColumn: '1/-1',
              textAlign: 'center',
              color: '#666',
              padding: '40px'
            }}
          >
            No live inventory lines available on the floor currently.
          </div>
        ) : (
          catalog.map((item) => {
            const currentCartQty =
              Number(cart[item.id] || 0);

            const minimumOrderQuantity =
              Number(item.minimum_order_quantity) || 1;

            const stockQuantity =
              Number(item.stock_quantity) || 0;

            const price =
              Number(item.price) || 0;

            const total =
              currentCartQty * price;

            return (
              <div
                key={item.id}
                className="catalog-card"
                style={{
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  padding: '16px',
                  background: '#fff'
                }}
              >
                <span
                  className="badge-category"
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    color: '#999',
                    fontWeight: 'bold'
                  }}
                >
                  {item.category || 'Marketplace'}
                </span>

                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.product_name}
                    loading="lazy"
                    style={{
                      width: '100%',
                      height: '180px',
                      objectFit: 'cover',
                      borderRadius: '6px',
                      marginTop: '10px'
                    }}
                  />
                )}

                <h3 style={{ marginTop: '12px' }}>
                  {item.product_name}
                </h3>

                <p className="row-meta">
                  {item.vendor_name || 'Brukina Vendor'}
                </p>

                <strong>
                  GH₵ {price.toFixed(2)}
                </strong>

                <div
                  style={{
                    marginTop: '10px',
                    fontSize: '13px'
                  }}
                >
                  Stock: {stockQuantity}
                  <br />
                  MOQ: {minimumOrderQuantity}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '14px'
                  }}
                >
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={
                      checkoutLoading ||
                      currentCartQty <= 0
                    }
                    onClick={() =>
                      updateCartQuantity(
                        item.id,
                        -minimumOrderQuantity,
                        minimumOrderQuantity,
                        stockQuantity
                      )
                    }
                  >
                    −
                  </button>

                  <strong>
                    {currentCartQty}
                  </strong>

                  <button
                    type="button"
                    className="btn-outline"
                    disabled={
                      checkoutLoading ||
                      currentCartQty >= stockQuantity
                    }
                    onClick={() =>
                      updateCartQuantity(
                        item.id,
                        minimumOrderQuantity,
                        minimumOrderQuantity,
                        stockQuantity
                      )
                    }
                  >
                    +
                  </button>
                </div>

                {currentCartQty > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div>
                      Order total:{' '}
                      <strong>
                        GH₵ {total.toFixed(2)}
                      </strong>
                    </div>

                    <button
                      type="button"
                      className="btn-primary"
                      disabled={checkoutLoading}
                      onClick={() =>
                        executeBulkCheckout(item.id)
                      }
                      style={{ marginTop: '10px' }}
                    >
                      {checkoutLoading
                        ? 'Processing...'
                        : 'Checkout Securely'}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
