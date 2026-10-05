import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const CURRENCY_RATES_FROM_GHS = {
  GHS: 1, NGN: 130, USD: 0.065, GBP: 0.048, CAD: 0.089,
  AUD: 0.099, KES: 8.45, TZS: 167, UGX: 246, ZAR: 1.18,
  XOF: 39.5, XAF: 39.5, SLE: 1.45, LRD: 10.2, EGP: 3.18,
  INR: 5.45, CNY: 0.47, JPY: 9.55, AED: 0.238, SAR: 0.244,
  EUR: 0.055, BRL: 0.35
};

function formatCurrency(amount, user) {
  const currency = user?.user_metadata?.currency || 'GHS';
  const rate = CURRENCY_RATES_FROM_GHS[currency] || 1;

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(amount || 0) * rate);
}

export default function CartPanel({
  cart = {},
  user,
  onUpdateCart,
  onRemoveFromCart,
  onClearCart,
  onNavigate,
  onOrdersRefresh
}) {
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const items = useMemo(() => Object.values(cart || {}), [cart]);

  const total = useMemo(
    () => items.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    ),
    [items]
  );

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [items]
  );

  const updateQuantity = (item, nextQuantity) => {
    const minimum = Math.max(1, Number(item.minimum_order_quantity || 1));
    const stock = Number(item.stock_quantity || 0);

    let quantity = Math.max(minimum, Math.floor(Number(nextQuantity) || minimum));

    if (stock > 0) {
      quantity = Math.min(quantity, stock);
    }

    onUpdateCart(item, quantity);
  };

  const checkout = async () => {
    setMessage('');
    setError('');

    if (!items.length) {
      setError('Your cart is empty.');
      return;
    }

    if (!supabase || !user) {
      setError('Please sign in again before checking out.');
      return;
    }

    setProcessing(true);

    try {
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const successful = [];
      const failed = [];

      for (const item of items) {
        try {
          const response = await fetch('/.netlify/functions/create-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              inventory_id: item.id,
              quantity: Number(item.quantity)
            })
          });

          const result = await response.json().catch(() => ({}));

          if (!response.ok || !result.accepted) {
            throw new Error(
              result.error ||
              `Order processing failed for ${item.product_name || 'this item'}.`
            );
          }

          successful.push({
            item,
            order: result
          });
        } catch (itemError) {
          failed.push({
            item,
            error: itemError.message || 'Order processing failed.'
          });
        }
      }

      successful.forEach(({ item }) => onRemoveFromCart(item.id));

      if (successful.length) {
        await onOrdersRefresh?.();

        if (failed.length) {
          setMessage(
            `${successful.length} item${successful.length === 1 ? '' : 's'} ordered successfully. ` +
            `${failed.length} item${failed.length === 1 ? '' : 's'} could not be processed.`
          );
          setError(failed.map(
            ({ item, error: itemError }) =>
              `${item.product_name}: ${itemError}`
          ).join(' | '));
        } else {
          setMessage(
            `${successful.length} item${successful.length === 1 ? '' : 's'} ordered successfully.`
          );
        }

        setTimeout(() => onNavigate?.('orders'), 900);
      } else {
        setError(
          failed.map(
            ({ item, error: itemError }) =>
              `${item.product_name}: ${itemError}`
          ).join(' | ') || 'No orders could be processed.'
        );
      }
    } catch (checkoutError) {
      console.error('[CART] Checkout failed:', checkoutError);
      setError(checkoutError.message || 'Checkout could not be completed.');
    } finally {
      setProcessing(false);
    }
  };

  if (!items.length) {
    return (
      <div className="panel" style={{ maxWidth: '900px' }}>
        <div style={{ textAlign: 'center', padding: '45px 20px' }}>
          <div style={{ fontSize: '52px', marginBottom: '12px' }}>🛒</div>
          <h2 style={{ margin: '0 0 10px' }}>Your cart is empty</h2>
          <p style={{ color: '#827b73', marginBottom: '24px' }}>
            Add products from the Brukina Marketplace and they will appear here.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate?.('dashboard')}
          >
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div className="panel" style={{ maxWidth: '900px', marginTop: 0 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '18px'
        }}>
          <div>
            <h2 style={{ margin: 0 }}>Shopping Cart</h2>
            <p style={{ margin: '6px 0 0', color: '#827b73' }}>
              {itemCount} item{itemCount === 1 ? '' : 's'} ready for checkout.
            </p>
          </div>

          <button
            type="button"
            className="btn-outline"
            onClick={() => onClearCart?.()}
            disabled={processing}
          >
            Clear Cart
          </button>
        </div>

        {message && (
          <div className="notice" role="status">
            {message}
          </div>
        )}

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: '12px' }}>
          {items.map(item => {
            const minimum = Math.max(
              1,
              Number(item.minimum_order_quantity || 1)
            );

            return (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '18px',
                  alignItems: 'center',
                  padding: '18px',
                  border: '1px solid #e7dfd7',
                  borderRadius: '14px',
                  background: '#fffdfa'
                }}
              >
                <div>
                  <strong style={{ fontSize: '16px' }}>
                    {item.product_name}
                  </strong>

                  <div style={{
                    color: '#827b73',
                    fontSize: '12px',
                    marginTop: '5px'
                  }}>
                    {item.vendor_name || 'Marketplace Seller'}
                    {item.category ? ` • ${item.category}` : ''}
                  </div>

                  <div style={{
                    marginTop: '8px',
                    color: '#C85A32',
                    fontWeight: '800'
                  }}>
                    {formatCurrency(item.price, user)} each
                  </div>

                  {minimum > 1 && (
                    <div style={{
                      marginTop: '5px',
                      color: '#827b73',
                      fontSize: '11px'
                    }}>
                      Minimum order: {minimum}
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end'
                }}>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() =>
                      updateQuantity(item, Number(item.quantity) - 1)
                    }
                    disabled={
                      processing ||
                      Number(item.quantity) <= minimum
                    }
                  >
                    −
                  </button>

                  <strong style={{
                    minWidth: '42px',
                    textAlign: 'center'
                  }}>
                    {item.quantity}
                  </strong>

                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() =>
                      updateQuantity(item, Number(item.quantity) + 1)
                    }
                    disabled={
                      processing ||
                      (
                        Number(item.stock_quantity) > 0 &&
                        Number(item.quantity) >= Number(item.stock_quantity)
                      )
                    }
                  >
                    +
                  </button>

                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => onRemoveFromCart?.(item.id)}
                    disabled={processing}
                  >
                    Remove
                  </button>
                </div>

                <div style={{
                  gridColumn: '1 / -1',
                  borderTop: '1px solid #eee',
                  paddingTop: '12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}>
                  <span style={{ color: '#827b73' }}>Item total</span>
                  <strong>
                    {formatCurrency(
                      Number(item.price || 0) * Number(item.quantity || 0),
                      user
                    )}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className="panel"
        style={{
          maxWidth: '900px',
          marginTop: 0,
          display: 'grid',
          gap: '16px'
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <strong>Cart total</strong>
          <strong style={{
            fontSize: '24px',
            color: '#C85A32'
          }}>
            {formatCurrency(total, user)}
          </strong>
        </div>

        <div style={{
          padding: '12px 14px',
          borderRadius: '10px',
          background: '#faf7f3',
          color: '#625d59',
          fontSize: '12px',
          lineHeight: 1.6
        }}>
          Checkout creates each marketplace order through Brukina's
          authenticated Netlify order service. Stock validation and the
          database transaction remain server-side.
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={checkout}
          disabled={processing}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '15px'
          }}
        >
          {processing ? 'Processing Orders...' : 'Checkout & Place Orders'}
        </button>

        <button
          type="button"
          className="btn-outline"
          onClick={() => onNavigate?.('dashboard')}
          disabled={processing}
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
}
