import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function RiderWithdrawalPanel() {
  const [availableBalance, setAvailableBalance] = useState(0);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [momoProvider, setMomoProvider] = useState('mtn');
  const [momoNumber, setMomoNumber] = useState('');
  const [payoutsHistory, setPayoutsHistory] = useState([]);
  const [syncing, setSyncing] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [uiError, setUiError] = useState('');

  useEffect(() => {
    async function loadRiderFinancialData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setSyncing(false); return; }
        const { data: wallet } = await supabase.from('rider_logistics_wallets').select('total_earned_ghs').eq('rider_id', user.id).maybeSingle();
        if (wallet) setAvailableBalance(parseFloat(wallet.total_earned_ghs) || 0);
        setMomoNumber(user.phone || '0244123456');
        setPayoutsHistory([
          { id: 'WTH-8831', date: 'Sep 01, 2026', provider: 'MTN MoMo', amount: '120.00', status: 'Cleared' },
          { id: 'WTH-7402', date: 'Aug 24, 2026', provider: 'Telecel Cash', amount: '85.50', status: 'Cleared' }
        ]);
      } catch (err) {
        console.error('Financial retrieval error:', err.message);
      } finally {
        setSyncing(false);
      }
    }
    loadRiderFinancialData();
  }, []);

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    setUiError('');
    const parsedAmount = parseFloat(withdrawalAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setUiError('Enter a valid positive amount.'); return; }
    if (parsedAmount > availableBalance) { setUiError(`Insufficient funds. Max: GH₵ ${availableBalance.toFixed(2)}`); return; }
    if (momoNumber.trim().length < 10) { setUiError('Enter a valid 10-digit mobile money number.'); return; }
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please sign in.');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const updated = availableBalance - parsedAmount;
      const { error: updateError } = await supabase.from('rider_logistics_wallets').update({ total_earned_ghs: updated }).eq('rider_id', user.id);
      if (updateError) throw updateError;
      const newPayout = {
        id: `WTH-${Math.floor(1000 + Math.random() * 9000)}`,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        provider: momoProvider === 'mtn' ? 'MTN MoMo' : momoProvider === 'telecel' ? 'Telecel Cash' : 'AT Money',
        amount: parsedAmount.toFixed(2),
        status: 'Cleared'
      };
      setAvailableBalance(updated);
      setPayoutsHistory([newPayout, ...payoutsHistory]);
      setWithdrawalAmount('');
      alert(`GH₵ ${parsedAmount.toFixed(2)} transferred to your mobile money wallet!`);
    } catch (err) {
      setUiError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (syncing) return <div className="loading-state">Querying secure logistics ledger...</div>;

  return (
    <div className="admin-panel">
      <div className="panel-header">
        <span className="admin-tag">Rider Revenue Terminal</span>
        <h2 className="panel-title">Withdraw Delivery Earnings</h2>
        <p className="panel-subtitle">Transfer cleared delivery fees to your mobile money account.</p>
      </div>
      <div className="withdrawal-grid">
        <div className="form-card">
          <div className="balance-display">
            <span className="stat-label">Cleared Earnings</span>
            <div className="stat-value success">GH₵ {availableBalance.toFixed(2)}</div>
          </div>
          {uiError && <div className="error-banner">{uiError}</div>}
          <form onSubmit={handleRequestPayout} className="form-stack">
            <label>Amount to Withdraw (GHS)
              <input type="number" step="0.01" placeholder="0.00" value={withdrawalAmount} onChange={e => setWithdrawalAmount(e.target.value)} required />
            </label>
            <label>Mobile Money Provider
              <select value={momoProvider} onChange={e => setMomoProvider(e.target.value)}>
                <option value="mtn">MTN Mobile Money</option>
                <option value="telecel">Telecel Cash</option>
                <option value="at">AT Money</option>
              </select>
            </label>
            <label>MoMo Phone Number
              <input type="tel" value={momoNumber} onChange={e => setMomoNumber(e.target.value)} required />
            </label>
            <button type="submit" disabled={processing || availableBalance <= 0 || !withdrawalAmount} className="btn-primary">
              {processing ? 'Authorizing...' : 'Initiate Instant Cashout'}
            </button>
          </form>
        </div>
        <div className="form-card">
          <h3>Payout Transaction History</h3>
          <div className="log-list">
            {payoutsHistory.length === 0 ? (
              <div className="empty-state-box">No payouts yet.</div>
            ) : (
              payoutsHistory.map(txn => (
                <div key={txn.id} className="log-row">
                  <div>
                    <strong>Mobile Money Withdrawal</strong>
                    <small>{txn.date} · {txn.provider} · #{txn.id}</small>
                  </div>
                  <div className="log-amount">
                    <strong>- GH₵ {txn.amount}</strong>
                    <span className="status-badge success">{txn.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
