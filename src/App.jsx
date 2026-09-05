import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import DynamicMarketplaceEngine from './components/DynamicMarketplaceEngine';
import VendorInventoryPanel from './components/VendorInventoryPanel';
import RiderTrackPanel from './components/RiderTrackPanel';
import AdminLedgerPanel from './components/AdminLedgerPanel';
import AdminPriceController from './components/AdminPriceController';
import AdminTerminalPanel from './components/AdminTerminalPanel';
import AdminApiLogger from './components/AdminApiLogger';
import AdminCategoryPanel from './components/AdminCategoryPanel';
import WalletPanel from './components/WalletPanel';
import RiderWithdrawalPanel from './components/RiderWithdrawalPanel';

export default function App() {
  const [activeRole, setActiveRole] = useState('Customer');
  const [activeTab, setActiveTab] = useState('marketplace');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function syncSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const role = user.user_metadata?.role || 'Customer';
          setActiveRole(role);
          if (role === 'vendor') setActiveTab('inventory');
          else if (role === 'admin') setActiveTab('terminal');
        }
      } catch (err) {
        console.error('Session init failure:', err.message);
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

  if (loading) return <div className="loading-state full-page">Booting Brukina Access Platform...</div>;

  return (
    <div className="app-root">
      <div className="role-controller">
        <div className="role-label">
          <span className="pulse-dot"></span>
          <span>SYSTEM CONTROLLER:</span> Switch workspace:
        </div>
        <div className="role-buttons">
          {['Customer', 'Vendor', 'Rider', 'Admin'].map(role => (
            <button
              key={role}
              onClick={() => handleRoleSwitch(role)}
              className={`role-btn ${activeRole === role ? 'active' : ''}`}
            >{role}</button>
          ))}
        </div>
      </div>

      {activeRole === 'Admin' && (
        <div className="admin-submenu">
          <button onClick={() => setActiveTab('terminal')} className={activeTab === 'terminal' ? 'active' : ''}>Cloud Terminal</button>
          <button onClick={() => setActiveTab('apilogger')} className={activeTab === 'apilogger' ? 'active' : ''}>API Logs</button>
          <button onClick={() => setActiveTab('accounting')} className={activeTab === 'accounting' ? 'active' : ''}>Sales Ledger</button>
          <button onClick={() => setActiveTab('economics')} className={activeTab === 'economics' ? 'active' : ''}>Price Controls</button>
          <button onClick={() => setActiveTab('categories')} className={activeTab === 'categories' ? 'active' : ''}>Categories</button>
          <button onClick={() => setActiveTab('marketplace')} className={activeTab === 'marketplace' ? 'active' : ''}>Public View</button>
        </div>
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

      <nav className="bottom-nav">
        <button onClick={() => setActiveTab('marketplace')} className={activeTab === 'marketplace' ? 'active' : ''}>
          <span className="nav-icon">🏠</span><span>Market</span>
        </button>
        {(activeRole === 'Vendor' || activeRole === 'Admin') && (
          <button onClick={() => setActiveTab('inventory')} className={activeTab === 'inventory' ? 'active' : ''}>
            <span className="nav-icon">🏪</span><span>Stock Hub</span>
          </button>
        )}
        {(activeRole === 'Rider' || activeRole === 'Admin' || activeRole === 'Customer') && (
          <button onClick={() => setActiveTab('telemetry')} className={activeTab === 'telemetry' ? 'active' : ''}>
            <span className="nav-icon">🛵</span><span>Rider</span>
          </button>
        )}
        <button onClick={() => setActiveTab('wallet')} className={activeTab === 'wallet' ? 'active' : ''}>
          <span className="nav-icon">📇</span><span>Wallet</span>
        </button>
        {activeRole === 'Admin' && (
          <button onClick={() => setActiveTab('terminal')} className={activeTab === 'terminal' || activeTab === 'apilogger' ? 'active' : ''}>
            <span className="nav-icon">🛡️</span><span>Admin</span>
          </button>
        )}
      </nav>
    </div>
  );
}
