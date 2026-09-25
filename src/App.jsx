import React, { useEffect, useState } from 'react';
import { supabase } from './lib/supabaseClient.js';

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

class LocalAccessibilityGuard extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError() {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error) {
    console.error('Interface boundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '30px',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          <h2>Something went wrong</h2>

          <p>
            The application encountered an interface error.
          </p>

          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [activeRole, setActiveRole] = useState('Customer');
  const [activeTab, setActiveTab] = useState('marketplace');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function syncSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const rawRole =
            user.user_metadata?.role || 'Customer';

          const normalizedRole =
            rawRole.charAt(0).toUpperCase() +
            rawRole.slice(1).toLowerCase();

          setActiveRole(normalizedRole);

          if (normalizedRole === 'Vendor') {
            setActiveTab('inventory');
          } else if (normalizedRole === 'Rider') {
            setActiveTab('telemetry');
          } else if (normalizedRole === 'Admin') {
            setActiveTab('terminal');
          } else {
            setActiveTab('marketplace');
          }
        }
      } catch (error) {
        console.error('Session error:', error);
      } finally {
        setLoading(false);
      }
    }

    syncSession();
  }, []);

  const handleRoleSwitch = (role) => {
    setActiveRole(role);

    if (role === 'Customer') {
      setActiveTab('marketplace');
    }

    if (role === 'Vendor') {
      setActiveTab('inventory');
    }

    if (role === 'Rider') {
      setActiveTab('telemetry');
    }

    if (role === 'Admin') {
      setActiveTab('terminal');
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Booting Brukina Platform...
      </div>
    );
  }

  return (
    <LocalAccessibilityGuard>
      <div
        className="app-root"
        style={{
          fontFamily: 'Arial, sans-serif',
          minHeight: '100vh',
          padding: '20px',
          boxSizing: 'border-box',
        }}
      >
        <header>
          <h1>Brukina Marketplace</h1>

          <p>
            Customer, Vendor, Rider and Administrator platform.
          </p>
        </header>

        <section
          className="role-controller"
          aria-label="Role Controls"
          style={{
            marginBottom: '20px',
          }}
        >
          <h2>Select Workspace</h2>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            {[
              'Customer',
              'Vendor',
              'Rider',
              'Admin',
            ].map((role) => (
              <button
                key={role}
                onClick={() => handleRoleSwitch(role)}
                aria-pressed={activeRole === role}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontWeight:
                    activeRole === role ? 'bold' : 'normal',
                }}
              >
                {role} Panel
              </button>
            ))}
          </div>
        </section>

        {activeRole === 'Admin' && (
          <nav
            className="admin-submenu"
            aria-label="Administrator Menu"
            style={{
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <button
                onClick={() => setActiveTab('terminal')}
              >
                Terminal
              </button>

              <button
                onClick={() => setActiveTab('apilogger')}
              >
                Logs
              </button>

              <button
                onClick={() => setActiveTab('accounting')}
              >
                Ledger
              </button>

              <button
                onClick={() => setActiveTab('economics')}
              >
                Prices
              </button>

              <button
                onClick={() => setActiveTab('categories')}
              >
                Categories
              </button>
            </div>
          </nav>
        )}

        <main
          className="main-content"
          style={{
            minHeight: '300px',
            border: '1px solid #eee',
            padding: '20px',
            borderRadius: '8px',
          }}
        >
          {activeTab === 'marketplace' && (
            <DynamicMarketplaceEngine
              activeUserRole={activeRole}
            />
          )}

          {activeTab === 'inventory' && (
            <VendorInventoryPanel />
          )}

          {activeTab === 'telemetry' && (
            <RiderTrackPanel />
          )}

          {activeTab === 'wallet' && (
            <WalletPanel />
          )}

          {activeTab === 'withdrawal' && (
            <RiderWithdrawalPanel />
          )}

          {activeTab === 'terminal' && (
            <AdminTerminalPanel />
          )}

          {activeTab === 'apilogger' && (
            <AdminApiLogger />
          )}

          {activeTab === 'accounting' && (
            <AdminLedgerPanel />
          )}

          {activeTab === 'economics' && (
            <AdminPriceController />
          )}

          {activeTab === 'categories' && (
            <AdminCategoryPanel />
          )}
        </main>

        <nav
          className="bottom-nav"
          aria-label="Feature Menu"
          style={{
            marginTop: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <button
              onClick={() => setActiveTab('marketplace')}
            >
              🏠 Market
            </button>

            {(activeRole === 'Vendor' ||
              activeRole === 'Admin') && (
              <button
                onClick={() => setActiveTab('inventory')}
              >
                🏪 Stock
              </button>
            )}

            {(activeRole === 'Rider' ||
              activeRole === 'Admin' ||
              activeRole === 'Customer') && (
              <button
                onClick={() => setActiveTab('telemetry')}
              >
                🛵 Rider
              </button>
            )}

            <button
              onClick={() => setActiveTab('wallet')}
            >
              💳 Wallet
            </button>
          </div>
        </nav>
      </div>
    </LocalAccessibilityGuard>
  );
}
