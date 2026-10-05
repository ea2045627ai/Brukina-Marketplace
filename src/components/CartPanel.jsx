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

function getMaxQuantity(item) {
  const stock = Number(item.stock_quantity);
  return Number.isFinite(stock) && stock > 0 ? stock : 1000;
}

function getMinimumQuantity(item) {
  const minimum = Number(item.minimum_order_quantity);
  return Number.isInteger(minimum) && minimum > 0 ? minimum : 1;
}

export default function CartPanel({
  cart = [],
  user,
  onUpdateQuantity,
  onRemove,
  onClear,
  onNavigate,
  onOrdersRefresh
}) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [checkoutResult, setCheckoutResult] = useState(null);

  const total = useMemo(
    () => cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    ),
    [cart]
  );

  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [cart]
  );

  const updateQuantity = (item, nextQuantity) => {
    const minimum = getMinimumQuantity(item);
    const maximum = getMaxQuantity(item);

    let quantity = Number(nextQuantity);

    if (!Number.isInteger(quantity)) return;

    if (quantity < minimum) quantity = minimum;
    if (quantity > maximum) quantity = maximum;

    onUpdateQuantity?.(item.id, quantity);
  };

  const checkout = async () => {
    setMessage('');
    setCheckoutResult(null);

    if (!cart.length) {
      setMessage('Your cart is empty.');
      return;
    }

    if (!supabase) {
      setMessage('Marketplace configuration is unavailable.');
      return;
    }

    setCheckoutLoading(true);

    try {
      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error('Please sign in again before placing your orders.');
      }

      const successful = [];
      const failed = [];

      for (const item of cart) {
        const quantity = Number(item.quantity);

        if (
          !item.id ||
          String(item.id).startsWith('mock-') ||
          String(item.id).startsWith('tech-')
        ) {
          failed.push({
            item,
            error: 'This product is not a live marketplace inventory item.'
          });
          continue;
        }

        if (!Number.isInteger(quantity) || quantity < 1) {
          failed.push({
            item,
            error: 'Invalid quantity.'
          });
          continue;
        }

        const minimum = getMinimumQuantity(item);
        const maximum = getMaxQuantity(item);

        if (quantity < minimum) {
          failed.push({
            item,
            error: `Minimum order quantity is ${minimum}.`
          });
          continue;
        }

        if (quantity > maximum) {
          failed.push({
            item,
            error: `Only ${maximum} units are currently available.`
          });
          continue;
        }

        try {
          const response = await fetch('/.netlify/functions/create-order', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              inventory_id: item.id,
              quantity
            })
          });

          const result = await response.json().catch(() => ({}));

          if (response.status === 402 || result.payment_required) {
            throw Object.assign(
              new Error(
                result.error ||
                'Your wallet balance is not enough to pay for this order.'
              ),
              {
                code: 'PAYMENT_REQUIRED',
                paymentRequired: true
              }
            );
          }

          if (!response.ok || !result.accepted) {
            throw new Error(
              result.error ||
              result.message ||
              'The order service rejected this item.'
            );
          }

          successful.push({
            item,
            orderId: result.order_id,
            orderNumber: result.order_number,
            deliveryId: result.delivery_id,
            amountPaid: result.amount_paid,
            remainingWalletBalance: result.remaining_wallet_balance
          });
        } catch (error) {
          failed.push({
            item,
            error: error.message || 'Order creation failed.',
            paymentRequired: Boolean(error?.paymentRequired)
          });
        }
      }

      for (const order of successful) {
        onRemove?.(order.item.id);
      }

      setCheckoutResult({
        successful,
        failed
      });

      if (successful.length) {
        await onOrdersRefresh?.();

        const paymentRequired = failed.some(item => item.paymentRequired);

        if (!failed.length) {
          setMessage(
            `${successful.length} order${successful.length === 1 ? '' : 's'} created successfully.`
          );
        } else if (paymentRequired) {
          setMessage(
            `${successful.length} order${successful.length === 1 ? '' : 's'} created. Add funds to your wallet for the remaining item${failed.length === 1 ? '' : 's'}.`
          );
        } else {
          setMessage(
            `${successful.length} order${successful.length === 1 ? '' : 's'} created. ${failed.length} item${failed.length === 1 ? '' : 's'} need attention.`
          );
        }
      } else {
        const paymentRequired = failed.some(item => item.paymentRequired);

        if (paymentRequired) {
          setMessage(
            'Your wallet does not have enough funds to place these orders. Add funds to your wallet, then return to the cart.'
          );
        } else {
          setMessage('No orders were created. Please review the errors below.');
        }
      }
    } catch (error) {
      console.error('[CART] Checkout failed:', error);
      setMessage(error.message || 'Checkout failed.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (!cart.length) {
    return (
      <div
        style={{
          maxWidth: '850px',
          margin: '0 auto',
          background: '#fff',
          borderRadius: '22px',
          padding: '42px',
          textAlign: 'center',
          boxShadow: '0 10px 35px rgba(35,31,32,.08)'
        }}
      >
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🛒</div>
        <h2 style={{ margin: '0 0 10px', color: '#231F20' }}>
          Your cart is empty
        </h2>
        <p style={{ color: '#6d6762', lineHeight: 1.6 }}>
          Browse Brukina Marketplace and add products here before placing your orders.
        </p>
        <button
          className="btn-primary"
          onClick={() => onNavigate?.('dashboard')}
          style={{ marginTop: '18px' }}
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '15px',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <span
            style={{
              color: '#C85A32',
              fontWeight: 800,
              fontSize: '12px',
              textTransform: 'uppercase'
            }}
          >
            BRUKINA CART
          </span>
          <h2 style={{ margin: '5px 0' }}>Review your items</h2>
          <p style={{ margin: 0, color: '#777' }}>
            {itemCount} item{itemCount === 1 ? '' : 's'} across {cart.length} product
            {cart.length === 1 ? '' : 's'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onClear?.()}
          disabled={checkoutLoading}
          style={{
            border: '1px solid #ded5cd',
            background: '#fff',
            borderRadius: '10px',
            padding: '10px 14px',
            cursor: checkoutLoading ? 'not-allowed' : 'pointer',
            fontWeight: 700
          }}
        >
          Clear cart
        </button>
      </div>

      {message && (
        <div
          style={{
            marginBottom: '18px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: checkoutResult?.failed?.length ? '#fff4e8' : '#eef8f0',
            color: '#403b39',
            fontWeight: 700
          }}
        >
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gap: '12px' }}>
        {cart.map(item => {
          const minimum = getMinimumQuantity(item);
          const maximum = getMaxQuantity(item);
          const quantity = Number(item.quantity || minimum);

          return (
            <article
              key={item.id}
              style={{
                background: '#fff',
                border: '1px solid #eee4dc',
                borderRadius: '18px',
                padding: '18px',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '20px',
                alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 5px', color: '#231F20' }}>
                  {item.product_name}
                </h3>

                <div style={{ color: '#777', fontSize: '13px', marginBottom: '8px' }}>
                  {item.vendor_name || 'Marketplace Seller'}
                  {item.category ? ` · ${item.category}` : ''}
                </div>

                <strong style={{ color: '#C85A32', fontSize: '17px' }}>
                  {formatCurrency(item.price, user)}
                </strong>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '7px',
                    marginBottom: '9px'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => updateQuantity(item, quantity - 1)}
                    disabled={checkoutLoading || quantity <= minimum}
                    style={{
                      width: '34px',
                      height: '34px',
                      border: '1px solid #ddd2c9',
                      background: '#fff',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    −
                  </button>

                  <strong style={{ minWidth: '38px', textAlign: 'center' }}>
                    {quantity}
                  </strong>

                  <button
                    type="button"
                    onClick={() => updateQuantity(item, quantity + 1)}
                    disabled={checkoutLoading || quantity >= maximum}
                    style={{
                      width: '34px',
                      height: '34px',
                      border: '1px solid #ddd2c9',
                      background: '#fff',
                      borderRadius: '8px',
                      cursor: 'pointer'
                    }}
                  >
                    +
                  </button>
                </div>

                <div style={{ fontWeight: 800, marginBottom: '7px' }}>
                  {formatCurrency(Number(item.price || 0) * quantity, user)}
                </div>

                <button
                  type="button"
                  onClick={() => onRemove?.(item.id)}
                  disabled={checkoutLoading}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#a34d30',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 800
                  }}
                >
                  Remove
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {checkoutResult?.failed?.length > 0 && (
        <div
          style={{
            marginTop: '18px',
            padding: '16px',
            background: '#fff7f1',
            border: '1px solid #f0d8c5',
            borderRadius: '14px'
          }}
        >
          <strong>Items needing attention</strong>

          {checkoutResult.failed.map(({ item, error, paymentRequired }) => (
            <div key={item.id} style={{ marginTop: '8px', fontSize: '13px' }}>
              <strong>{item.product_name}:</strong> {error}

              {paymentRequired && (
                <button
                  type="button"
                  onClick={() => onNavigate?.('wallet')}
                  style={{
                    marginLeft: '10px',
                    marginTop: '6px',
                    border: 'none',
                    background: '#231F20',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '7px 10px',
                    cursor: 'pointer',
                    fontWeight: 800
                  }}
                >
                  Open Wallet
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: '20px',
          background: '#231F20',
          color: '#fff',
          borderRadius: '20px',
          padding: '22px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap'
        }}
      >
        <div>
          <div style={{ fontSize: '12px', opacity: .7 }}>Cart total</div>
          <strong style={{ fontSize: '28px' }}>
            {formatCurrency(total, user)}
          </strong>
        </div>

        <button
          type="button"
          onClick={checkout}
          disabled={checkoutLoading || !cart.length}
          style={{
            padding: '14px 22px',
            border: 'none',
            borderRadius: '12px',
            background: '#C85A32',
            color: '#fff',
            fontWeight: 800,
            cursor: checkoutLoading ? 'wait' : 'pointer'
          }}
        >
          {checkoutLoading ? 'Processing orders...' : 'Checkout & Place Orders →'}
        </button>
      </div>

      {checkoutResult?.successful?.length > 0 && (
        <div
          style={{
            marginTop: '18px',
            padding: '18px',
            background: '#f5faf5',
            borderRadius: '15px'
          }}
        >
          <strong>Orders created</strong>

          {checkoutResult.successful.map(order => (
            <div key={order.orderId || order.orderNumber} style={{ marginTop: '7px' }}>
              {order.item.product_name} — <strong>{order.orderNumber}</strong>
            </div>
          ))}

          <button
            type="button"
            onClick={() => onNavigate?.('orders')}
            style={{
              marginTop: '14px',
              border: 'none',
              background: '#231F20',
              color: '#fff',
              borderRadius: '10px',
              padding: '10px 14px',
              cursor: 'pointer',
              fontWeight: 800
            }}
          >
            Open My Orders
          </button>
        </div>
      )}
    </div>
  );
}
