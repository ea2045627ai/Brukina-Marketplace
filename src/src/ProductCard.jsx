import React from 'react';

export default function ProductCatalog({ 
  catalog = [], 
  query = '', 
  page = 'dashboard', 
  onNavigate, 
  user, 
  role, 
  onLogout 
}) {
  // Sync filtering logic to match items by both search query text and selected tab categories
  const filteredCatalog = catalog.filter(item => {
    const matchesSearch = `${item.product_name || ''} ${item.description || ''} ${item.vendor_name || ''}`
      .toLowerCase()
      .includes(query.toLowerCase());

    if (page === 'dashboard' || page === 'all') {
      return matchesSearch;
    }
    return matchesSearch && item.category === page;
  });

  return (
    <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
      
      {/* Top Banner Row */}
      <div className="hub-banner" style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <div className="hub-card" onClick={() => onNavigate('dashboard')} style={{ flex: 1, background: '#231F20', color: '#fff', padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Urban hubs</h3>
            <small style={{ color: '#aaa' }}>Best wholesale rates</small>
          </div>
          <span>&gt;</span>
        </div>
        
        <div className="hub-card rural" onClick={() => onNavigate('dashboard')} style={{ flex: 1, background: '#FFFDFC', color: '#333', border: '1px solid #EAE0D5', padding: '16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Rural markets</h3>
            <small style={{ color: '#777' }}>Local & regional supply</small>
          </div>
          <span>&gt;</span>
        </div>
      </div>

      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>Browse categories</h2>
        <span style={{ color: '#C85A32', cursor: 'pointer', fontSize: '14px' }} onClick={() => onNavigate('dashboard')}>View all &rarr;</span>
      </div>

      {/* Synchronized categories layout scroll bar */}
      <div className="tab-container" style={{ display: 'flex', gap: '10px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px' }}>
        <button className={`tab-btn ${page === 'dashboard' ? 'active' : ''}`} onClick={() => onNavigate('dashboard')}>
          All products
        </button>
        <button className={`tab-btn ${page === 'heavy-machinery' ? 'active' : ''}`} onClick={() => onNavigate('heavy-machinery')}>
          Heavy Machinery
        </button>
        <button className={`tab-btn ${page === 'mobile-usage' ? 'active' : ''}`} onClick={() => onNavigate('mobile-usage')}>
          Mobile Usage
        </button>
        <button className={`tab-btn ${page === 'food-groceries' ? 'active' : ''}`} onClick={() => onNavigate('food-groceries')}>
          Food & Groceries
        </button>
        <button className={`tab-btn ${page === 'home-appliances' ? 'active' : ''}`} onClick={() => onNavigate('home-appliances')}>
          Appliances
        </button>
        <button className={`tab-btn ${page === 'building-materials' ? 'active' : ''}`} onClick={() => onNavigate('building-materials')}>
          Building Materials
        </button>
        <button className={`tab-btn ${page === 'electricals' ? 'active' : ''}`} onClick={() => onNavigate('electricals')}>
          Electricals
        </button>
        <button className={`tab-btn ${page === 'accessories' ? 'active' : ''}`} onClick={() => onNavigate('accessories')}>
          All Accessories
        </button>
      </div>

      {/* Deals Grid Layout */}
      <div className="deals-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px', marginBottom: '48px', color: '#333' }}>
        {filteredCatalog && filteredCatalog.length > 0 ? (
          filteredCatalog.map(item => (
            <div 
              key={item.id || item.product_name} 
              className="product-card" 
              style={{ border: '1px solid #EAE0D5', borderRadius: '12px', padding: '16px', background: '#fff' }}
            >
              <h4 style={{ margin: '0 0 8px 0' }}>{item.product_name}</h4>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 12px 0' }}>{item.description}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#C85A32' }}>${item.price}</span>
                <span style={{ fontSize: '12px', color: '#999' }}>{item.vendor_name}</span>
              </div>
            </div>
          ))
        ) : (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#999', padding: '40px 0' }}>
            No products found matching your search.
          </div>
        )}
      </div>

      {/* Control Area Footer Panel */}
      <footer style={{ marginTop: '48px', paddingTop: '16px', borderTop: '1px solid #EAE0D5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Connected: <strong>{user?.email || 'Guest'}</strong> ({role || 'User'})</span>
        <button onClick={onLogout} style={{ background: 'none', border: 'none', color: '#C85A32', cursor: 'pointer', fontWeight: 'bold' }}>
          Logout
        </button>
      </footer>

    </div>
  );
}