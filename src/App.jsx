/**
 * BRUKINA ACCESS MARKETPLACE - CENTRAL APP CORE SHELL LOADER
 * Path: src/App.jsx
 * Configures the live multi-role workspace simulator, cross-channel navigation tabs, and session state routers.
 */

import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import AccessibilityErrorBoundary from './AccessibilityErrorBoundary.jsx';
import DynamicMarketplaceEngine from './components/DynamicMarketplaceEngine.jsx';
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
        console.error('Ecosystem session initialization failure:', err.message);
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

  if (loading) {
    return (
      <div className="loading-state full-page" role="status" aria-live="polite">
        Booting Brukina Access Platform Shell...
      </div>
    );
  }

  return (
    <AccessibilityErrorBoundary>
      <div className="app-root">
        {/* Dynamic Master Interactive Simulation Bar */}
        <section className="role-controller" aria-label="Workspace Simulator Dashboard Tools">
          <div className="role-label">
            <span className="pulse-dot" aria-hidden="true"></span>
            <span>SYSTEM CONTROLLER:</span> Switch workspace:
          </div>
          <div className="role-buttons" role="tablist" aria-label="Ecosystem Working Roles">
            {['Customer', 'Vendor', 'Rider', 'Admin'].map(role => (
              <button
                key={role}
                role="tab"
                aria-selected={activeRole === role}
                onClick={() => handleRoleSwitch(role)}
                className={`role-btn ${activeRole === role ? 'active' : ''}`}
              >
                {role} Panel
              </button>
            ))}
          </div>
        </section>

        {/* Administrative Submenu wrapped in semantic navigational landmarks */}
        {activeRole === 'Admin' && (
          <nav className="admin-submenu" role="navigation" aria-label="System Executive Control Submenu">
            <ul role="tablist" style={{ listStyle: 'none', display: 'flex', padding: 0, margin: 0 }}>
              <li role="presentation"><button role="tab" aria-selected={activeTab === 'terminal'} onClick={() => setActiveTab('terminal')} className={activeTab === 'terminal' ? 'active' : ''}>Cloud Terminal</button></li>
              <li role="presentation"><button role="tab" aria-selected={activeTab === 'apilogger'} onClick={() => setActiveTab('apilogger')} className={activeTab === 'apilogger' ? 'active' : ''}>API Logs</button></li>
              <li role="presentation"><button role="tab" aria-selected={activeTab === 'accounting'} onClick={() => setActiveTab('accounting')} className={activeTab === 'accounting' ? 'active' : ''}>Sales Ledger</button></li>
              <li role="presentation"><button role="tab" aria-selected={activeTab === 'economics'} onClick={() => setActiveTab('economics')} className={activeTab === 'economics' ? 'active' : ''}>Price Controls</button></li>
              <li role="presentation"><button role="tab" aria-selected={activeTab === 'categories'} onClick={() => setActiveTab('categories')} className={activeTab === 'categories' ? 'active' : ''}>Categories</button></li>
              <li role="presentation"><button role="tab" aria-selected={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} className={activeTab === 'marketplace' ? 'active' : ''}>Public View</button></li>
            </ul>
          </nav>
        )}

        {/* Main Reactive Workspace Container Yield Tree */}
        <main className="main-content" id="main-content-focus-node">
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

        {/* Bottom Nav redesigned with explicit ARIA selectors and icon concealment maps */}
        <nav className="bottom-nav" role="navigation" aria-label="Ecosystem Feature Channel Modules">
          <ul role="tablist" style={{ listStyle: 'none', display: 'flex', width: '100%', padding: 0, margin: 0 }}>
            <li role="presentation" style={{ flex: 1 }}>
              <button role="tab" aria-selected={activeTab === 'marketplace'} onClick={() => setActiveTab('marketplace')} className={activeTab === 'marketplace' ? 'active' : ''}>
                <span className="nav-icon" aria-hidden="true">🏠</span><span>Market</span>
              </button>
            </li>
            
            {(activeRole === 'Vendor' || activeRole === 'Admin') && (
              <li role="presentation" style={{ flex: 1 }}>
                <button role="tab" aria-selected={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')} className={activeTab === 'inventory' ? 'active' : ''}>
                  <span className="nav-icon" aria-hidden="true">🏪</span><span>Stock Hub</span>
                </button>
              </li>
            )}
            
            {(activeRole === 'Rider' || activeRole === 'Admin' || activeRole === 'Customer') && (
              <li role="presentation" style={{ flex: 1 }}>
                <button role="tab" aria-selected={activeTab === 'telemetry'} onClick={() => setActiveTab('telemetry')} className={activeTab === 'telemetry' ? 'active' : ''}>
                  <span className="nav-icon" aria-hidden="true">🛵</span><span>Rider</span>
                </button>
              </li>
            )}
            
            <li role="presentation" style={{ flex: 1 }}>
              <button role="tab" aria-selected={activeTab === 'wallet'} onClick={() => setActiveTab('wallet')} className={activeTab === 'wallet' ? 'active' : ''}>
                <span className="nav-icon" aria-hidden="true">📇</span><span>Wallet</span>
              </button>
            </li>
            
            {activeRole === 'Admin' && (
              <li role="presentation" style={{ flex: 1 }}>
                <button role="tab" aria-selected={activeTab === 'terminal' || activeTab === 'apilogger'} onClick={() => setActiveTab('terminal')} className={activeTab === 'terminal' || activeTab === 'apilogger' ? 'active' : ''}>
                  <span className="nav-icon" aria-hidden="true">🛡️</span><span>Admin</span>
                </button>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </AccessibilityErrorBoundary>
  );
}
