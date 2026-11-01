import { useRef, useState } from 'react';
import { supabase } from '../supabaseClient.js';

const isMockPaymentMode = import.meta.env.VITE_PAYMENT_MODE === 'mock';
const paymentFunction = isMockPaymentMode ? 'staging-mock-services' : 'marketplace-checkout';

export function usePaymentGateway() {
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [transactionId, setTransactionId] = useState(null);
  const [paymentPending, setPaymentPending] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState(null);
  const idempotencyKey = useRef(null);

  const processMarketplaceCheckout = async orderPayload => {
    if (processing) {
      return { success: false, error: 'A checkout request is already in progress.' };
    }

    setProcessing(true);
    setPaymentError(null);
    setTransactionId(null);
    setPaymentPending(false);
    setPaymentUrl(null);

    try {
      if (!supabase) {
        throw new Error('Checkout is unavailable because Supabase is not configured.');
      }

      if (!Array.isArray(orderPayload?.items) || orderPayload.items.length === 0) {
        throw new Error('Add at least one product before checking out.');
      }

      const items = orderPayload.items.map(item => {
        const quantity = Number(item.quantity);
        if (!item.id || !Number.isSafeInteger(quantity) || quantity < 1) {
          throw new Error('The cart contains an invalid product or quantity.');
        }

        return { inventory_id: item.id, quantity };
      });

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        throw new Error('Sign in before placing an order.');
      }

      const { data, error: checkoutError } = await supabase.functions.invoke(
        paymentFunction,
        {
          body: {
            ...(isMockPaymentMode ? { action: 'checkout' } : {}),
            items,
            idempotency_key: idempotencyKey.current || (idempotencyKey.current = crypto.randomUUID())
          }
        }
      );
      if (checkoutError) throw checkoutError;

      if (!data
        || !['pending', 'paid'].includes(data.status)
        || typeof data.reference !== 'string'
        || (isMockPaymentMode && (data.mode !== 'mock' || data.status !== 'pending'))) {
        throw new Error('The checkout service returned an invalid payment response.');
      }

      let checkoutUrl = null;
      if (data.status === 'pending' && !isMockPaymentMode) {
        if (typeof data.payment_url !== 'string') {
          throw new Error('Paystack did not return a checkout URL.');
        }
        const parsedUrl = new URL(data.payment_url);
        if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'checkout.paystack.com') {
          throw new Error('Paystack returned an untrusted checkout URL.');
        }
        checkoutUrl = parsedUrl.toString();
      }

      setTransactionId(data.reference);
      setPaymentPending(data.status === 'pending');
      setPaymentUrl(checkoutUrl);
      idempotencyKey.current = null;
      return {
        success: data.status === 'paid',
        pending: data.status === 'pending',
        reference: data.reference,
        mock: isMockPaymentMode
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Payment could not be verified. Please try again or contact support.';
      setPaymentError(message);
      return { success: false, error: message };
    } finally {
      setProcessing(false);
    }
  };

  const verifyMarketplacePayment = async () => {
    if (processing) {
      return { success: false, error: 'A checkout request is already in progress.' };
    }
    if (!supabase || !transactionId) {
      return { success: false, error: 'There is no payment reference to verify.' };
    }

    setProcessing(true);
    setPaymentError(null);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) throw new Error('Sign in before checking payment status.');

      const { data, error: verifyError } = await supabase.functions.invoke(
        paymentFunction,
        {
          body: {
            action: 'verify',
            reference: transactionId
          }
        }
      );
      if (verifyError) throw verifyError;
      if (!data
        || !['pending', 'paid'].includes(data.status)
        || data.reference !== transactionId
        || (isMockPaymentMode && (data.mode !== 'mock' || data.status !== 'pending'))) {
        throw new Error('The payment verification service returned an invalid response.');
      }

      const paid = data.status === 'paid';
      setPaymentPending(!paid);
      if (paid) setPaymentUrl(null);
      return { success: paid, pending: !paid, reference: transactionId };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Payment status could not be verified. Please try again.';
      setPaymentError(message);
      return { success: false, error: message };
    } finally {
      setProcessing(false);
    }
  };

  return {
    processMarketplaceCheckout,
    verifyMarketplacePayment,
    processing,
    paymentError,
    transactionId,
    paymentPending,
    paymentUrl,
    isMockPaymentMode
  };
}
