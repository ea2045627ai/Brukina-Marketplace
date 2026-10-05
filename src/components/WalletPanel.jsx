import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function WalletPanel() {
  const [walletId, setWalletId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [provider, setProvider] = useState('dodo');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadWallet() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, escrow_balance')
      .eq('user_id', user.id)
      .maybeSingle();

    if (wallet) {
      setWalletId(wallet.id);
      setBalance(parseFloat(wallet.balance) || 0);

      const { data: entries } = await supabase
        .from('wallet_transactions')
        .select('id, amount, transaction_type, description, created_at')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (entries) setTransactions(entries);
    }
  }

  useEffect(() => {
    loadWallet();
  }, []);

  const handleDeposit = async (e) => {
    e.preventDefault();

    if (provider === 'paystack') {
      const parsedAmount = Number(depositAmount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        alert('Please enter a valid positive amount.');
        return;
      }
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const isDodo = provider === 'dodo';
      const endpoint = isDodo
        ? '/.netlify/functions/initialize-dodo-payment'
        : '/.netlify/functions/initialize-payment';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(
          isDodo
            ? {}
            : { amount: Number(Number(depositAmount).toFixed(2)) }
        )
      });

      const result = await response.json();
      const checkoutUrl = isDodo
        ? result?.checkout_url
        : result?.authorization_url;

      if (!response.ok || !checkoutUrl) {
        throw new Error(result?.error || 'Unable to initialize payment.');
      }

      setDepositAmount('');
      setIsModalOpen(false);
      window.location.assign(checkoutUrl);
    } catch (error) {
      console.error('Payment initialization error:', error);
      alert(error.message || 'Unable to start payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wallet-panel">
      <div className="wallet-card">
        <div className="wallet-card-top">
          <span className="wallet-chip">◈</span>
          <span className="wallet-label">SECURE · GHS</span>
        </div>
        <p>Available Balance</p>
        <strong>GH₵ {balance.toFixed(2)}</strong>
        <div className="wallet-card-bottom">
          <span>Live account balance</span>
          <span>Database wallet</span>
        </div>
      </div>

      <button
        onClick={() => setIsModalOpen(true)}
        className="btn-primary wallet-action-btn"
      >
        + Load Virtual Funds
      </button>

      <div className="transactions-box">
        <h3>Transaction History</h3>
        {transactions.length === 0 ? (
          <div className="empty-state-box">No transactions yet.</div>
        ) : (
          transactions.map((txn) => {
            const isCredit = ['credit', 'deposit'].includes(
              txn.transaction_type?.toLowerCase()
            );
            return (
              <div key={txn.id} className="txn-row">
                <div>
                  <strong>{txn.description}</strong>
                  <small>
                    {new Date(txn.created_at).toLocaleDateString()}
                  </small>
                </div>
                <div className={`txn-amount ${isCredit ? 'positive' : 'negative'}`}>
                  {isCredit ? '+' : '-'} GH₵{' '}
                  {Math.abs(parseFloat(txn.amount)).toFixed(2)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => !loading && setIsModalOpen(false)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsModalOpen(false)}
              className="modal-close"
              disabled={loading}
            >
              ×
            </button>

            <h3>Wallet Top-up</h3>
            <p className="modal-subtitle">
              Choose a payment method to fund your wallet.
            </p>

            <form onSubmit={handleDeposit} className="form-stack">
              <label>Payment Method</label>
              <div className="quick-amounts">
                <button
                  type="button"
                  className={`quick-btn ${provider === 'paystack' ? 'active' : ''}`}
                  onClick={() => setProvider('paystack')}
                  disabled={loading}
                >
                  Paystack · GHS
                </button>
                <button
                  type="button"
                  className={`quick-btn ${provider === 'dodo' ? 'active' : ''}`}
                  onClick={() => setProvider('dodo')}
                  disabled={loading}
                >
                  Dodo · USD
                </button>
              </div>

              {provider === 'paystack' ? (
                <>
                  <label>
                    Deposit Amount (GHS)
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      required
                      disabled={loading}
                    />
                  </label>
                  <div className="quick-amounts">
                    {['50', '100', '200'].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setDepositAmount(val)}
                        className="quick-btn"
                        disabled={loading}
                      >
                        + GH₵ {val}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="empty-state-box">
                  Dodo checkout uses the USD amount and exchange rate
                  configured on the server. The wallet will be credited in GHS
                  after payment is confirmed.
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
              >
                {loading
                  ? 'Processing...'
                  : provider === 'dodo'
                    ? 'Continue to Dodo Checkout'
                    : 'Confirm Funding'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
