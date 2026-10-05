import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function VendorInventoryPanel() {
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [newBasePrice, setNewBasePrice] = useState('');
  const [syncingId, setSyncingId] = useState(null);
  const [orderActionId, setOrderActionId] = useState(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [vendorId, setVendorId] = useState(null);

  async function getVendor() {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data, error } = await supabase
      .from('global_vendors')
      .select('id, business_name')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (error) throw error;

    return data;
  }

  async function loadVendorCatalog() {
    try {
      const vendor = await getVendor();

      if (!vendor) {
        setInventory([]);
        setVendorId(null);
        return;
      }

      setVendorId(vendor.id);

      const { data, error } = await supabase
        .from('marketplace_inventory')
        .select(
          'id, product_name, price, stock_quantity, minimum_order_quantity, active, category, vendor_name, created_at'
        )
        .eq('vendor_id', vendor.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setInventory(data || []);
    } catch (err) {
      console.error('Error loading vendor items:', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadVendorOrders() {
    try {
      setOrdersLoading(true);

      const vendor = await getVendor();

      if (!vendor) {
        setOrders([]);
        return;
      }

      setVendorId(vendor.id);

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          customer_id,
          vendor_id,
          status,
          total,
          delivery_address,
          created_at,
          order_items (
            id,
            quantity,
            unit_price,
            inventory_id,
            marketplace_inventory (
              id,
              product_name,
              vendor_name
            )
          )
        `)
        .eq('vendor_id', vendor.id)
        .in('status', ['processing', 'confirmed'])
        .order('created_at', { ascending: true });

      if (error) throw error;

      setOrders(data || []);
    } catch (err) {
      console.error('Error loading vendor orders:', err.message);
    } finally {
      setOrdersLoading(false);
    }
  }

  async function refreshVendorData() {
    await Promise.all([
      loadVendorCatalog(),
      loadVendorOrders()
    ]);
  }

  useEffect(() => {
    refreshVendorData();

    const channel = supabase
      .channel('brukina-vendor-fulfillment')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        () => {
          loadVendorOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdatePrice = async (inventoryId) => {
    const parsedPrice = parseFloat(newBasePrice);

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid positive market price.');
      return;
    }

    setSyncingId(inventoryId);

    try {
      const { error } = await supabase
        .from('marketplace_inventory')
        .update({ price: parsedPrice })
        .eq('id', inventoryId)
        .eq('vendor_id', vendorId);

      if (error) throw error;

      alert('Catalog price updated successfully.');

      await loadVendorCatalog();

      setEditingId(null);
      setNewBasePrice('');
    } catch (err) {
      alert(`Pricing error: ${err.message}`);
    } finally {
      setSyncingId(null);
    }
  };

  const runOrderAction = async (rpcName, orderId, successMessage) => {
    setOrderActionId(orderId);

    try {
      const { data, error } = await supabase.rpc(rpcName, {
        p_order_id: orderId
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(
          data?.error || 'The fulfillment transition was rejected.'
        );
      }

      alert(successMessage);

      await loadVendorOrders();
    } catch (err) {
      console.error('Vendor fulfillment error:', err);
      alert(`Fulfillment error: ${err.message}`);
    } finally {
      setOrderActionId(null);
    }
  };

  const handleConfirmOrder = (order) =>
    runOrderAction(
      'vendor_confirm_marketplace_order',
      order.id,
      `Order ${order.order_number} confirmed.`
    );

  const handlePackOrder = (order) =>
    runOrderAction(
      'vendor_pack_marketplace_order',
      order.id,
      `Order ${order.order_number} packed and ready for dispatch.`
    );

  const formatAmount = (value) =>
    `GH₵ ${Number(value || 0).toFixed(2)}`;

  const getOrderItems = (order) =>
    Array.isArray(order.order_items) ? order.order_items : [];

  if (loading) {
    return (
      <div className="loading-state">
        Syncing vendor stock and fulfillment logs...
      </div>
    );
  }

  return (
    <div className="vendor-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          Storefront Pricing & Control
        </h2>

        <p className="panel-subtitle">
          Manage inventory, pricing, and paid marketplace fulfillment.
        </p>

        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="btn-primary"
        >
          + List New Product
        </button>
      </div>

      <section style={{ marginBottom: '36px' }}>
        <div className="panel-header">
          <h3 className="panel-title">
            Customer Orders
          </h3>

          <p className="panel-subtitle">
            Confirm paid orders, then pack them for dispatch.
          </p>
        </div>

        {ordersLoading ? (
          <div className="loading-state">
            Loading customer orders...
          </div>
        ) : orders.length === 0 ? (
          <div className="empty-state-box">
            No paid orders are waiting for vendor fulfillment.
          </div>
        ) : (
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Products</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>
                        #{order.order_number}
                      </strong>

                      <div className="row-meta">
                        {new Date(order.created_at).toLocaleString()}
                      </div>
                    </td>

                    <td>
                      {getOrderItems(order).map((item) => (
                        <div key={item.id}>
                          {item.marketplace_inventory?.product_name ||
                            'Marketplace item'}{' '}
                          × {item.quantity}
                        </div>
                      ))}
                    </td>

                    <td>
                      {formatAmount(order.total)}
                    </td>

                    <td>
                      <span className="status-tag">
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>

                    <td>
                      {order.status === 'processing' && (
                        <button
                          type="button"
                          disabled={orderActionId !== null}
                          onClick={() => handleConfirmOrder(order)}
                          className="btn-small"
                        >
                          {orderActionId === order.id
                            ? 'Confirming...'
                            : 'Confirm Order'}
                        </button>
                      )}

                      {order.status === 'confirmed' && (
                        <button
                          type="button"
                          disabled={orderActionId !== null}
                          onClick={() => handlePackOrder(order)}
                          className="btn-primary"
                        >
                          {orderActionId === order.id
                            ? 'Packing...'
                            : 'Mark Packed'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="panel-header">
          <h3 className="panel-title">
            Inventory
          </h3>

          <p className="panel-subtitle">
            Manage your active marketplace catalog and stock.
          </p>
        </div>

        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product Asset</th>
                <th>Market Price</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {inventory.length === 0 ? (
                <tr>
                  <td colSpan="3" className="empty-row">
                    No products listed yet. Click "List New Product" to start.
                  </td>
                </tr>
              ) : (
                inventory.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.product_name}</strong>

                      <div className="row-meta">
                        {p.category || 'Native'} ·{' '}
                        {p.stock_quantity} units available
                        {' '}
                        (MOQ: {p.minimum_order_quantity || 1})
                      </div>
                    </td>

                    <td>
                      {editingId === p.id ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={newBasePrice}
                          onChange={(e) =>
                            setNewBasePrice(e.target.value)
                          }
                          placeholder={Number(p.price).toFixed(2)}
                          className="inline-input"
                          aria-label={`Edit price for ${p.product_name}`}
                        />
                      ) : (
                        formatAmount(p.price)
                      )}
                    </td>

                    <td>
                      {editingId === p.id ? (
                        <div className="action-row">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setNewBasePrice('');
                            }}
                            className="btn-text"
                          >
                            Cancel
                          </button>

                          <button
                            type="button"
                            disabled={syncingId !== null}
                            onClick={() => handleUpdatePrice(p.id)}
                            className="btn-small"
                          >
                            {syncingId === p.id
                              ? 'Saving...'
                              : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(p.id);
                            setNewBasePrice(p.price || '');
                          }}
                          className="btn-outline"
                        >
                          Adjust Cost
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isUploadOpen && (
        <VendorUploadModal
          isOpen={isUploadOpen}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={loadVendorCatalog}
        />
      )}
    </div>
  );
}

function VendorUploadModal({
  isOpen,
  onClose,
  onUploadSuccess
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Food & Beverage');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('');
  const [minOrderQty, setMinOrderQty] = useState('1');
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    setSubmitting(true);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error(
          'Authentication session missing. Please sign in again.'
        );
      }

      const { data: vendor, error: vendorError } = await supabase
        .from('global_vendors')
        .select('id, business_name')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (vendorError) throw vendorError;

      if (!vendor) {
        throw new Error(
          'Create your vendor profile before listing products.'
        );
      }

      const cleanName = name.trim();
      const parsedPrice = Number(price);
      const parsedStock = Number(stockQuantity);
      const parsedMoq = Number(minOrderQty);

      if (!cleanName) {
        throw new Error('Product name is required.');
      }

      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throw new Error('Enter a valid positive product price.');
      }

      if (
        !Number.isInteger(parsedStock) ||
        parsedStock < 0
      ) {
        throw new Error('Enter a valid stock quantity.');
      }

      if (
        !Number.isInteger(parsedMoq) ||
        parsedMoq < 1
      ) {
        throw new Error('Minimum order quantity must be at least 1.');
      }

      if (parsedStock < parsedMoq) {
        throw new Error(
          'Available stock cannot be lower than the minimum order quantity.'
        );
      }

      if (!imageFile) {
        throw new Error('Please select a product image.');
      }

      if (!imageFile.type.startsWith('image/')) {
        throw new Error('Please select a valid image file.');
      }

      if (imageFile.size > 5 * 1024 * 1024) {
        throw new Error('Image must be 5MB or smaller.');
      }

      const fileExt =
        imageFile.name.split('.').pop()?.toLowerCase() || 'jpg';

      const filePath =
        `${user.id}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, imageFile, {
          contentType: imageFile.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: publicImage } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      const imageUrl = publicImage.publicUrl;

      const { error: insertError } = await supabase
        .from('marketplace_inventory')
        .insert([
          {
            vendor_id: vendor.id,
            product_name: cleanName,
            vendor_name: vendor.business_name,
            category,
            price: parsedPrice,
            stock_quantity: parsedStock,
            minimum_order_quantity: parsedMoq,
            image_url: imageUrl,
            active: true
          }
        ]);

      if (insertError) throw insertError;

      alert(
        `"${cleanName}" successfully cataloged in the marketplace.`
      );

      setName('');
      setPrice('');
      setStockQuantity('');
      setMinOrderQty('1');
      setImageFile(null);

      await onUploadSuccess();
      onClose();
    } catch (err) {
      setError(err?.message || 'Product could not be published.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="modal-close"
          aria-label="Close inventory upload panel"
        >
          ×
        </button>

        <h3>List a New Product</h3>

        <p className="modal-subtitle">
          Publish products across active trading categories.
        </p>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="form-stack"
        >
          <label>
            Product Asset Title
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Premium Millet Bags (Wholesale)"
              required
            />
          </label>

          <label>
            Product Image
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                setImageFile(e.target.files?.[0] || null)
              }
              required
            />
          </label>

          <label>
            Category Group
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="Food & Beverage">
                Food & Beverage
              </option>
              <option value="Kitchenware">
                Kitchenware
              </option>
              <option value="Cosmetics">
                Cosmetics
              </option>
            </select>
          </label>

          <div className="form-row">
            <label>
              Wholesale Price (GH₵)
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>

            <label>
              Available Stock
              <input
                type="number"
                min="0"
                step="1"
                value={stockQuantity}
                onChange={(e) =>
                  setStockQuantity(e.target.value)
                }
                placeholder="0"
                required
              />
            </label>
          </div>

          <label>
            Minimum Order Quantity (MOQ)
            <input
              type="number"
              min="1"
              step="1"
              value={minOrderQty}
              onChange={(e) =>
                setMinOrderQty(e.target.value)
              }
              placeholder="1"
              required
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary"
          >
            {submitting
              ? 'Publishing Asset...'
              : 'Confirm Inventory Entry'}
          </button>
        </form>
      </div>
    </div>
  );
}
