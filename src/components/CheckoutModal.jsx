import { useEffect } from 'react';
import { usePaymentGateway } from '../hooks/usePaymentGateway.js';
import './CheckoutModal.css';

export default function CheckoutModal({ cartItems = [], onCheckoutSuccess, onClose }) {
  const {
    processMarketplaceCheckout,
    verifyMarketplacePayment,
    processing,
    paymentError,
    transactionId,
    paymentPending,
    paymentUrl,
    isMockPaymentMode
  } = usePaymentGateway();

  const subtotal = cartItems.reduce((sum, item) => {
    const price = Number(item.price);
    const quantity = Number(item.quantity || 1);
    return sum + (Number.isFinite(price) && Number.isFinite(quantity) ? price * quantity : 0);
  }, 0);
  const isWholesale = cartItems.some(item => item.is_wholesale === true && item.free_delivery === true);
  const deliveryFee = isWholesale ? 0 : 15;
  const totalAmount = subtotal + deliveryFee;

  useEffect(() => {
    const handleKeyDown = event => {
      if (event.key === 'Escape' && !processing) onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, processing]);

  const handlePaymentSubmit = async event => {
    event.preventDefault();
    const result = await processMarketplaceCheckout({
      items: cartItems.map(item => ({ id: item.id, quantity: item.quantity || 1 }))
    });

    if (result.success) onCheckoutSuccess?.(result.reference);
  };

  const handlePaymentVerification = async () => {
    const result = await verifyMarketplacePayment();
    if (result.success) onCheckoutSuccess?.(result.reference);
  };

  return (
    <div
      className="checkout-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !processing) onClose?.();
      }}
    >
      <section
        aria-labelledby="checkout-title"
        aria-modal="true"
        className="checkout-modal"
        role="dialog"
      >
        <div className="checkout-heading">
          <div>
            <p className={isMockPaymentMode ? 'checkout-eyebrow checkout-mock-label' : 'checkout-eyebrow'}>
              {isMockPaymentMode ? 'STAGING · MOCK SERVICES · NO REAL CHARGES' : 'Brukina Marketplace'}
            </p>
            <h2 id="checkout-title">Secure checkout</h2>
          </div>
          <button
            aria-label="Close checkout"
            className="checkout-close"
            disabled={processing}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="checkout-summary">
          <h3>Order summary</h3>
          {cartItems.map(item => {
            const quantity = Number(item.quantity || 1);
            const price = Number(item.price || 0);
            return (
              <div className="checkout-line" key={item.id}>
                <span>{item.name || item.product_name || 'Market item'} × {quantity}</span>
                <span>GH₵ {(price * quantity).toFixed(2)}</span>
              </div>
            );
          })}
          <div className="checkout-line">
            <span>Delivery</span>
            <span>{isWholesale ? 'Free · qualifying wholesale order' : `GH₵ ${deliveryFee.toFixed(2)}`}</span>
          </div>
          <div className="checkout-line checkout-total">
            <strong>Estimated total</strong>
            <strong>GH₵ {totalAmount.toFixed(2)}</strong>
          </div>
          <p className="checkout-disclaimer">
            Final prices, stock, delivery, and payment status are verified by the checkout service.
          </p>
        </div>

        {transactionId ? (
          <div className="checkout-result" role="status">
            <h3>
              {isMockPaymentMode
                ? 'Mock checkout simulated — not paid'
                : paymentPending ? 'Complete payment with Paystack' : 'Payment confirmed'}
            </h3>
            <p>
              {isMockPaymentMode
                ? 'This staging-only response does not create an order, charge a customer, or mark payment as complete.'
                : paymentPending
                ? 'Continue to Paystack to authorize the mobile money payment. Your order is marked paid only after Paystack confirms it.'
                : 'Paystack confirmed your payment.'}
            </p>
            <p className="checkout-reference">Reference: {transactionId}</p>
            {paymentPending && paymentUrl && (
              <a
                className="checkout-paystack-link"
                href={paymentUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Continue to Paystack
              </a>
            )}
            {paymentError && <p className="checkout-error" role="alert">{paymentError}</p>}
            {paymentPending && (
              <div className="checkout-actions">
                <button
                  className="checkout-secondary"
                  disabled={processing}
                  onClick={onClose}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="checkout-primary"
                  disabled={processing}
                  onClick={handlePaymentVerification}
                  type="button"
                >
                  {processing ? 'Checking…' : 'Check payment status'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handlePaymentSubmit}>
            <p className="checkout-disclaimer">
              {isMockPaymentMode
                ? 'Staging mode: this only exercises the mock handler. It will not contact Paystack or charge a customer.'
                : 'Paystack will collect your mobile money network and phone number securely on its hosted checkout page.'}
            </p>

            {paymentError && <p className="checkout-error" role="alert">{paymentError}</p>}

            <div className="checkout-actions">
              <button
                className="checkout-secondary"
                disabled={processing}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button className="checkout-primary" disabled={processing || cartItems.length === 0} type="submit">
                {processing
                  ? isMockPaymentMode ? 'Simulating…' : 'Contacting provider…'
                  : `${isMockPaymentMode ? 'Simulate checkout' : 'Continue'} · GH₵ ${totalAmount.toFixed(2)}`}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
