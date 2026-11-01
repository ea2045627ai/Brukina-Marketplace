import { useState } from 'react';
import { supabase } from '../supabaseClient.js';

const supportedNetworks = new Set(['MTN', 'Telecel', 'AT']);
const ghanaPhonePattern = /^(?:\+233|0)\d{9}$/;

export function usePaymentGateway() {
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [transactionId, setTransactionId] = useState(null);
  const [paymentPending, setPaymentPending] = useState(false);

  const processMarketplaceCheckout = async orderPayload => {
    if (processing) {
      return { success: false, error: 'A checkout request is already in progress.' };
    }

    setProcessing(true);
    setPaymentError(null);
    setTransactionId(null);
    setPaymentPending(false);

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

      const phoneNumber = String(orderPayload.paymentDetails?.phoneNumber || '').replace(/[\s()-]/g, '');
      const networkProvider = orderPayload.paymentDetails?.networkProvider;

      if (!ghanaPhonePattern.test(phoneNumber)) {
        throw new Error('Enter a valid Ghanaian mobile money number.');
      }
      if (!supportedNetworks.has(networkProvider)) {
        throw new Error('Select a supported mobile money network.');
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) {
        throw new Error('Sign in before placing an order.');
      }

      const { data, error: checkoutError } = await supabase.functions.invoke(
        'marketplace-checkout',
        {
          body: {
            items,
            payment: { phone_number: phoneNumber, network_provider: networkProvider }
          }
        }
      );
      if (checkoutError) throw checkoutError;

      if (!data || !['pending', 'paid'].includes(data.status) || typeof data.reference !== 'string') {
        throw new Error('The checkout service returned an invalid payment response.');
      }

      setTransactionId(data.reference);
      setPaymentPending(data.status === 'pending');
      return {
        success: data.status === 'paid',
        pending: data.status === 'pending',
        reference: data.reference
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

  return {
    processMarketplaceCheckout,
    processing,
    paymentError,
    transactionId,
    paymentPending
  };
}
