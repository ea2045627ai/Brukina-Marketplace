import React from 'react';

export default function ProductCard({ title, vendor, origin, price, tag, image }) {
  const handleBuyNow = () => {
    alert(`🎉 Initiating order process for: ${title} (${price})`);
  };

  return (
    <div className="deal-card">
      <div className="card-image-area">
        {tag && <span className="tag">{tag}</span>}
        {image ? (
          <img src={image} alt={title} className="card-product-img" />
        ) : (
          <span className="placeholder-text">M</span>
        )}
      </div>
      <div className="card-details">
        <div className="product-title">{title}</div>
        <div className="product-meta">
          {vendor}<br />
          {origin}
        </div>
        <div className="card-footer">
          <span className="price">
            {price} <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#777' }}>/ unit</span>
          </span>
          <button className="buy-btn" onClick={handleBuyNow}>Buy now</button>
        </div>
      </div>
    </div>
  );
}
import React from 'react';

// Added 'unit' to your existing property parameters list
export default function ProductCard({ title, vendor, origin, price, tag, image, unit = "unit" }) {
  const handleBuyNow = () => {
    alert(`🎉 Initiating order process for: ${title} (${price})`);
  };

  return (
    <div className="deal-card">
      <div className="card-image-area">
        {tag && <span className="tag">{tag}</span>}
        {image ? (
          <img src={image} alt={title} className="card-product-img" />
        ) : (
          <span className="placeholder-text">M</span>
        )}
      </div>
      <div className="card-details">
        <div className="product-title">{title}</div>
        <div className="product-meta">
          {vendor}<br />
          {origin}
        </div>
        <div className="card-footer">
          <span className="price">
            {/* Updated this specific text line to dynamically read the product unit type */}
            {price} <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#777' }}>/ {unit}</span>
          </span>
          <button className="buy-btn" onClick={handleBuyNow}>Buy now</button>
        </div>
      </div>
    </div>
  );
}