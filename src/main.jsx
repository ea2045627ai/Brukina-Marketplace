import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const DODO_ENDPOINT = '/.netlify/functions/initialize-dodo-payment';
const ORDERS_ENDPOINT = '/.netlify/functions/create-order';

async function getSessionToken() {
  const supabaseModule = await import('./lib/supabaseClient.js');
  const supabase = supabaseModule.supabase || supabaseModule.default;

  if (!supabase?.auth) {
    throw new Error('Supabase authentication client is unavailable.');
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data?.session?.access_token || null;
}

async function startDodoPayment() {
  const token = await getSessionToken();

  if (!token) {
    throw new Error('Please sign in before starting payment.');
  }

  const response = await fetch(DODO_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.error || 'Unable to start Dodo checkout.');
  }

  if (!result?.checkout_url) {
    throw new Error('Dodo checkout URL was not returned.');
  }

  window.location.assign(result.checkout_url);
}

async function createMarketplaceOrder(inventoryId, quantity) {
  const token = await getSessionToken();

  if (!token) {
    throw new Error('Please sign in before placing an order.');
  }

  const response = await fetch(ORDERS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inventory_id: inventoryId,
      quantity
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result?.error || 'Unable to create marketplace order.');
  }

  return result;
}

function Bootstrap() {
  const [error, setError] = useState(null);

  useEffect(() => {
    window.brukina = {
      ...(window.brukina || {}),
      startDodoPayment,
      createMarketplaceOrder
    };

    const payment = new URLSearchParams(window.location.search).get('payment');

    if (payment === 'dodo-return') {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.hash
      );
    }

    return () => {
      if (window.brukina) {
        delete window.brukina.startDodoPayment;
        delete window.brukina.createMarketplaceOrder;
      }
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Brukina Marketplace</h2>
        <p>{error}</p>
      </div>
    );
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Bootstrap />
  </React.StrictMode>
);

export { startDodoPayment, createMarketplaceOrder };
