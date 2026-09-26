import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function WalletPanel() {
  const [walletId, setWalletId] = useState(null);
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Reusable function to fetch live wallet data from Supabase
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
    const parsedAmount = parseFloat(depositAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }
    if (!walletId) {
      alert('Wallet account could not be resolved.');
      return;
    }

    setLoading(true);

    try {
      const updatedBalance = balance + parsedAmount;

      // 1. Update the actual database balance
      const { error: walletError } = await supabase
        .from('wallets')
        .update({ balance: updatedBalance })
        .eq('id', walletId);

      if (walletError) throw walletError;

      // 2. Insert the transaction log into the database
      const { error: txnError } = await supabase
        .from('wallet_transactions')
        .insert([{
          wallet_id: walletId,
          amount: parsedAmount,
          transaction_type: 'deposit',
          description: 'Wallet Deposit Confirmed'
        }]);

      if (txnError) throw txnError;

      // 3. Refresh state to guarantee total accuracy
      await loadWallet();

      setDepositAmount('');
      setIsModalOpen(false);
      alert(`GH₵ ${parsedAmount.toFixed(2)} added to your wallet!`);
    } catch (error) {
      console.error('Payment Error:', error.message);
      alert('Transaction failed to sync. Please try again.');
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

      <button onClick={() => setIsModalOpen(true)} className="btn-primary wallet-action-btn">
        + Load Virtual Funds
      </button>

      <div className="transactions-box">
        <h3>Transaction History</h3>
        {transactions.length === 0 ? (
          <div className="empty-state-box">No transactions yet.</div>
        ) : (
          transactions.map((txn) => {
            const isCredit = ['credit', 'deposit'].includes(txn.transaction_type?.toLowerCase());
            return (
              <div key={txn.id} className="txn-row">
                <div>
                  <strong>{txn.description}</strong>
                  <small>{new Date(txn.created_at).toLocaleDateString()}</small>
                </div>
                <div className={`txn-amount ${isCredit ? 'positive' : 'negative'}`}>
                  {isCredit ? '+' : '-'} GH₵ {Math.abs(parseFloat(txn.amount)).toFixed(2)}
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsModalOpen(false)} className="modal-close">×</button>
            <h3>Mobile Money Topup</h3>
            <p className="modal-subtitle">Deposit credits via payment networks.</p>
            <form onSubmit={handleDeposit} className="form-stack">
              <label>Deposit Amount (GHS)
                <input type="number" step="0.01" placeholder="0.00" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} required />
              </label>
              <div className="quick-amounts">
                {['50', '100', '200'].map(val => (
                  <button key={val} type="button" onClick={() => setDepositAmount(val)} className="quick-btn">+ GH₵ {val}</button>
                ))}
              </div>
              <button type="submit" disabled={loading} className="btn-primary">
                {loading ? 'Processing...' : 'Confirm Funding'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
