import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function WalletPanel() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [depositAmount, setDepositAmount] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadWallet() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: wallet } = await supabase.from('wallets').select('id,balance,escrow_balance').eq('user_id', user.id).maybeSingle();
      if (wallet) {
        setBalance(parseFloat(wallet.balance) || 0);
        const { data: entries } = await supabase.from('wallet_transactions')
          .select('amount,transaction_type,description,created_at')
          .eq('wallet_id', wallet.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (entries) setTransactions(entries);
      }
    }
    loadWallet();
  }, []);

  const handleDeposit = (e) => {
    e.preventDefault();
    const parsedAmount = parseFloat(depositAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const updated = balance + parsedAmount;
      setBalance(updated);
      setTransactions([{
        id: `TXN-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        type: 'Credit',
        amount: parsedAmount.toFixed(2),
        description: 'Wallet Deposit Confirmed',
        created_at: new Date().toISOString()
      }, ...transactions]);
      setDepositAmount('');
      setIsModalOpen(false);
      setLoading(false);
      alert(`GH₵ ${parsedAmount.toFixed(2)} added to your wallet!`);
    }, 800);
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
          <span>Paystack managed</span>
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
          transactions.map((txn, i) => (
            <div key={txn.id || i} className="txn-row">
              <div>
                <strong>{txn.description}</strong>
                <small>{new Date(txn.created_at).toLocaleDateString()}</small>
              </div>
              <div className="txn-amount positive">+ GH₵ {Math.abs(parseFloat(txn.amount)).toFixed(2)}</div>
            </div>
          ))
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
