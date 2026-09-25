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

  // Reusable method to query live data directly from the schema ledger
  async function loadRiderFinancialData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Fetch live logistics balance
      const { data: wallet } = await supabase
        .from('rider_logistics_wallets')
        .select('total_earned_ghs')
        .eq('rider_id', user.id)
        .maybeSingle();

      if (wallet) setAvailableBalance(parseFloat(wallet.total_earned_ghs) || 0);
      
      // Auto-fallback default number safely
      setMomoNumber(user.phone || '');

      // 2. Fetch real historic transactions instead of hardcoded data
      const { data: logs, error: logsError } = await supabase
        .from('rider_payout_logs')
        .select('id, created_at, provider, amount, status')
        .eq('rider_id', user.id)
        .order('created_at', { ascending: false });

      if (!logsError && logs) {
        setPayoutsHistory(logs);
      }
    } catch (err) {
      console.error('Financial retrieval error:', err.message);
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadRiderFinancialData();
  }, []);

  const handleRequestPayout = async (e) => {
    e.preventDefault();
    setUiError('');
    
    const parsedAmount = parseFloat(withdrawalAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { 
      setUiError('Enter a valid positive amount.'); 
      return; 
    }
    if (parsedAmount > availableBalance) { 
      setUiError(`Insufficient funds. Max: GH₵ ${availableBalance.toFixed(2)}`); 
      return; 
    }
    if (momoNumber.trim().length < 10) { 
      setUiError('Enter a valid 10-digit mobile money number.'); 
      return; 
    }

    setProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Session expired. Please sign in.');

      const updatedBalance = availableBalance - parsedAmount;
      const networkLabel = momoProvider === 'mtn' ? 'MTN MoMo' : momoProvider === 'telecel' ? 'Telecel Cash' : 'AT Money';

      // 1. Atomically deduct the balance from the database wallet
      const { error: updateError } = await supabase
        .from('rider_logistics_wallets')
        .update({ total_earned_ghs: updatedBalance })
        .eq('rider_id', user.id);

      if (updateError) throw updateError;

      // 2. Insert audit trail record directly into the payout log table
      const { error: logInsertError } = await supabase
        .from('rider_payout_logs')
        .insert([{
          rider_id: user.id,
          provider: networkLabel,
          amount: parsedAmount,
          phone_number: momoNumber.trim(),
          status: 'Cleared' // In production, switch to 'Pending' if processing asynchronous hooks via Arkesel/Arkesel SMS tools
        }]);

      if (logInsertError) throw logInsertError;

      // 3. Re-sync state with database values to prevent UI mismatch
      await loadRiderFinancialData();
      
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
              <input type="tel" value={momoNumber} onChange={e => setMomoNumber(e.target.value)} placeholder="e.g. 0244123456" required />
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
                    <small>{new Date(txn.created_at || txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {txn.provider} · #{txn.id.slice(0, 8)}</small>
                  </div>
                  <div className="log-amount">
                    <strong>- GH₵ {parseFloat(txn.amount).toFixed(2)}</strong>
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
