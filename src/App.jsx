import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient.js';
import AccessibilityErrorBoundary from './AccessibilityErrorBoundary.jsx';

// FIXED: Wrapped in curly braces to match the explicit named export inside the updated engine file
import { DynamicMarketplaceEngine } from './components/DynamicMarketplaceEngine.jsx';

import VendorInventoryPanel from './components/VendorInventoryPanel.jsx';
import RiderTrackPanel from './components/RiderTrackPanel.jsx';
import WalletPanel from './components/WalletPanel.jsx';
import RiderWithdrawalPanel from './components/RiderWithdrawalPanel.jsx';
import AdminLedgerPanel from './components/AdminLedgerPanel.jsx';
import AdminPriceController from './components/AdminPriceController.jsx';
import AdminTerminalPanel from './components/AdminTerminalPanel.jsx';
import AdminApiLogger from './components/AdminApiLogger.jsx';
import AdminCategoryPanel from './components/AdminCategoryPanel.jsx';

export default function App() {
  const [activeRole, setActiveRole] = useState('Customer');
  const [activeTab, setActiveTab] = useState('marketplace');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function syncSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const rawRole = user.user_metadata?.role || 'Customer';
          const normalizedRole = rawRole.charAt(0).toUpperCase() + rawRole.slice(1).toLowerCase();
          setActiveRole(normalizedRole);
          if (normalizedRole === 'Vendor') setActiveTab('inventory');
          else if (normalizedRole === 'Admin') setActiveTab('terminal');
        }
      } catch (err) {
        console.error(err.message);
      } finally {
        setLoading(false);
      }
    }
    syncSession();
  }, []);

  const handleRoleSwitch = (role) => {
    setActiveRole(role);
    if (role === 'Customer') setActiveTab('marketplace');
    if (role === 'Vendor') setActiveTab('inventory');
    if (role === 'Rider') setActiveTab('telemetry');
    if (role === 'Admin') setActiveTab('terminal');
  };

  if (loading) return <div className="loading-state full-page">Booting Brukina Platform Matrix...</div>;

  return (
    <AccessibilityErrorBoundary>
      <div className="app-root">
        <section className="role-controller" aria-label="Simulator Controls">
          <div className="role-buttons" role="tablist">
            {['Customer', 'Vendor', 'Rider', 'Admin'].map(r => (
              <button key={r} role="tab" aria-selected={activeRole === r} onClick={() => handleRoleSwitch(r)} className={`role-btn ${activeRole === r ? 'active' : ''}`}>{r} Panel</button>
            ))}
          </div>
        </section>

        {activeRole === 'Admin' && (
          <nav className="admin-submenu" role="navigation">
            <ul role="tablist" style={{ listStyle: 'none', display: 'flex', gap: '10px', padding: 0 }}>
              <li><button role="tab" aria-selected={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')}>Terminal</button></li>
              <li><button role="tab" aria-selected={activeTab === 'apilogger'} onClick={() => setActiveTab('apilogger')}>Logs</button></li>
              <li><button role="tab" aria-selected={activeTab === 'accounting'} onClick={() => setActiveTab('accounting')}>Ledger</button></li>
              <li><button role="tab" aria-selected={activeTab === 'economics'} onClick={() => setActiveTab('economics')}>Prices</button></li>
              <li><button role="tab" aria-selected={activeTab === 'categories'} onClick={() => setActiveTab('categories')}>Categories</button></li>
            </ul>
          </nav>
        )}

        <main className="main-content">
          {activeTab === 'marketplace' && <DynamicMarketplaceEngine activeUserRole={activeRole} />}
          {activeTab === 'inventory' && <VendorInventoryPanel />}
          {activeTab === 'telemetry' && <RiderTrackPanel />}
          {activeTab === 'wallet' && <WalletPanel />}
          {activeTab === 'withdrawal' && <RiderWithdrawalPanel />}
          {activeTab === 'terminal' && <AdminTerminalPanel />}
          {activeTab === 'apilogger' && <AdminApiLogger />}
          {activeTab === 'accounting' && <AdminLedgerPanel />}
          {activeTab === 'economics' && <AdminPriceController />}
          {activeTab === 'categories' && <AdminCategoryPanel />}
        </main>

        <nav className="bottom-nav" role="navigation" aria-label="Feature Menu">
          <ul role="tablist" style={{ listStyle: 'none', display: 'flex', justifyContent: 'space-around', width: '100%', padding: 0 }}>
            <li><button role="tab" aria-selected={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')}><span aria-hidden="true">🏠</span> Market</button></li>
            {(activeRole === 'Vendor' || activeRole === 'Admin') && <li><button role="tab" aria-selected={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')}><span aria-hidden="true">🏪</span> Stock</button></li>}
            {(activeRole === 'Rider' || activeRole === 'Admin' || activeRole === 'Customer') && <li><button role="tab" aria-selected={activeTab === 'telemetry'} onClick={() => setActiveTab('telemetry')}><span aria-hidden="true">🛵</span> Rider</button></li>}
            <li><button role="tab" aria-selected={activeTab === 'wallet'} onClick={() => setActiveTab('wallet')}><span aria-hidden="true">📇</span> Wallet</button></li>
          </ul>
        </nav>
      </div>
    </AccessibilityErrorBoundary>
  );
}
