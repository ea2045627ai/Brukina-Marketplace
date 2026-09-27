import React from 'react';

const roles = [
  { id: 'admin', name: 'Administrator', description: 'Full platform administration and system controls.' },
  { id: 'manager', name: 'Manager', description: 'Business operations, staff, orders and reporting.' },
  { id: 'accountant', name: 'Accountant', description: 'Payments, transactions, reconciliation and financial records.' },
  { id: 'assistant', name: 'Assistant', description: 'Customer, order and operational assistance.' },
  { id: 'vendor', name: 'Vendor', description: 'Products, inventory, pricing and sales.' },
  { id: 'rider', name: 'Rider', description: 'Shipment acceptance, tracking and delivery.' },
  { id: 'driver', name: 'Driver', description: 'Transport and delivery operations.' },
  { id: 'customer', name: 'Customer', description: 'Shopping, orders, payments and feedback.' }
];

export default function BusinessRoles({ onSelect }) {
  return (
    <section className="business-roles">
      <h2>Business Management</h2>
      <p>Select a workspace to manage that part of the business.</p>

      <div className="business-role-grid">
        {roles.map((role) => (
          <button
            key={role.id}
            type="button"
            onClick={() => onSelect?.(role.id)}
            className="business-role-card"
          >
            <strong>{role.name}</strong>
            <span>{role.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
