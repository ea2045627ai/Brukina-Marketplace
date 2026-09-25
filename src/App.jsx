import React, { useState } from 'react';
import { DynamicMarketplaceEngine } from './components/DynamicMarketplaceEngine.jsx';
import VendorInventoryPanel from './components/VendorInventoryPanel.jsx';
import RiderTrackPanel from './components/RiderTrackPanel.jsx';
import WalletPanel from './components/WalletPanel.jsx';

// 1. Fully embedded local boundary to bypass external file paths completely
class LocalAccessibilityGuard extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err) { console.error('♿ Interface boundary caught:', err.message); }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding: '20px', fontFamily: 'sans-serif' }}><h3>Interface Fallback</h3><button onClick={() => window.location.reload()}>Retry</button></div>;
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('marketplace');

  return (
    <LocalAccessibilityGuard>
      <div className="app-root" style={{ fontFamily: 'sans-serif', padding: '20px' }}>
        {/* Core System Role Switcher Bar */}
        <nav style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button onClick={() => setActiveTab('marketplace')} style={{ padding: '10px' }}>Customer Market</button>
          <button onClick={() => setActiveTab('inventory')} style={{ padding: '10px' }}>Vendor Hub</button>
          <button onClick={() => setActiveTab('telemetry')} style={{ padding: '10px' }}>Rider Track</button>
          <button onClick={() => setActiveTab('wallet')} style={{ padding: '10px' }}>Wallet Ledger</button>
        </nav>

        {/* Semantic Content Yield Grid */}
        <main style={{ minHeight: '300px', border: '1px solid #eee', padding: '15px', borderRadius: '8px' }}>
          {activeTab === 'marketplace' && <DynamicMarketplaceEngine activeUserRole="Customer" />}
          {activeTab === 'inventory' && <VendorInventoryPanel />}
          {activeTab === 'telemetry' && <RiderTrackPanel />}
          {activeTab === 'wallet' && <WalletPanel />}
        </main>
      </div>
    </LocalAccessibilityGuard>
  );
}
