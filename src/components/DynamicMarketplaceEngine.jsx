import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function DynamicMarketplaceEngine({ activeUserRole }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // 1. Fetch products from the central marketplace inventory
  const loadMarketplaceCatalog = async () => {
    try {
      const { data, error } = await supabase
        .from('marketplace_inventory')
        .select(
          'id, name, price, stock_quantity, minimum_order_quantity, category'
        )
        .eq('active', true)
        .order('name', { ascending: true });

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

    // 2. Live inventory synchronization
    const catalogChannel = supabase
      .channel('public:marketplace_inventory')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'marketplace_inventory',
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
      const current = prev[itemId] || 0;
      let target = current + change;

      if (target <= 0) {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      }

      // Enforce minimum wholesale order quantity
      if (change > 0 && current === 0) {
        target = minQty;
      }

      if (target > maxStock) {
        target = maxStock;
      }

      return {
        ...prev,
        [itemId]: target,
      };
    });
  };

  const executeBulkCheckout = async (itemId) => {
    const qty = cart[itemId];

    if (!qty) return;

    setCheckoutLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          'Authentication required. Please sign into your session profile.'
        );
      }

      // Call the atomic marketplace order procedure
      const { error } = await supabase.rpc(
        'place_marketplace_order_transaction',
        {
          p_order_number: `BK-${Date.now()
            .toString(36)
            .toUpperCase()}`,
          p_customer_id: user.id,
          p_inventory_id: itemId,
          p_quantity: qty,
        }
      );

      if (error) throw error;

      alert(
        'Order successfully generated and routed to the Operations Desk!'
      );

      setCart((prev) => {
        const updated = { ...prev };
        delete updated[itemId];
        return updated;
      });

      await loadMarketplaceCatalog();
    } catch (err) {
      alert(`Checkout processing error: ${err.message}`);
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
          marginTop: '20px',
        }}
      >
        {catalog.length === 0 ? (
          <div
            className="empty-catalog"
            style={{
              gridColumn: '1/-1',
              textAlign: 'center',
              color: '#666',
              padding: '40px',
            }}
          >
            No live inventory lines available on the floor
            currently.
          </div>
        ) : (
          catalog.map((item) => {
            const currentCartQty =
              cart[item.id] || 0;

            const minimumOrderQuantity =
              Number(item.minimum_order_quantity) || 1;

            const stockQuantity =
              Number(item.stock_quantity) || 0;

            const price =
              Number(item.price) || 0;

            return (
              <div
                key={item.id}
                className="catalog-card"
                style={{
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  padding: '16px',
                  background: '#fff',
                }}
              >
                <span
                  className="badge-category"
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    color: '#999',
                    fontWeight: 'bold',
                  }}
                >
                  {item.category || 'General'}
                </span>

                <h4
                  style={{
                    margin: '4px 0 8px 0',
                    fontSize: '18px',
                    color: '#111',
                  }}
                >
                  {item.name}
                </h4>

                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#2ecc71',
                    marginBottom: '12px',
                  }}
                >
                  GH₵ {price.toFixed(2)}
                </div>

                <div
                  className="item-specs"
                  style={{
                    fontSize: '13px',
                    color: '#666',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    Stock Available:{' '}
                    <strong>
                      {stockQuantity} units
                    </strong>
                  </div>

                  <div>
                    Minimum Order Qty:{' '}
                    <strong>
                      {minimumOrderQuantity} units
                    </strong>
                  </div>
                </div>

                <div
                  className="interaction-row"
                  style={{
                    marginTop: 'auto',
                  }}
                >
                  {stockQuantity === 0 ? (
                    <button
                      disabled
                      style={{
                        width: '100%',
                        padding: '10px',
                        background: '#eee',
                        color: '#999',
                        border: 'none',
                        borderRadius: '4px',
                      }}
                    >
                      Out of Stock
                    </button>
                  ) : (
                    <div>
                      <div
                        className="qty-picker"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent:
                            'space-between',
                          marginBottom: '10px',
                          background: '#f9f9f9',
                          padding: '6px',
                          borderRadius: '4px',
                        }}
                      >
                        <button
                          onClick={() =>
                            updateCartQuantity(
                              item.id,
                              -1,
                              minimumOrderQuantity,
                              stockQuantity
                            )
                          }
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            padding: '4px 10px',
                            fontSize: '16px',
                          }}
                        >
                          -
                        </button>

                        <span
                          style={{
                            fontWeight: 'bold',
                          }}
                        >
                          {currentCartQty ||
                            'Select Qty'}
                        </span>

                        <button
                          onClick={() =>
                            updateCartQuantity(
                              item.id,
                              1,
                              minimumOrderQuantity,
                              stockQuantity
                            )
                          }
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            padding: '4px 10px',
                            fontSize: '16px',
                          }}
                        >
                          +
                        </button>
                      </div>

                      {currentCartQty > 0 && (
                        <button
                          disabled={checkoutLoading}
                          onClick={() =>
                            executeBulkCheckout(
                              item.id
                            )
                          }
                          style={{
                            width: '100%',
                            padding: '10px',
                            background: '#111',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          {checkoutLoading
                            ? 'Routing Order...'
                            : `Buy (GH₵ ${(
                                price *
                                currentCartQty
                              ).toFixed(2)})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
