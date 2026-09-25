import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

export default function AdminCategoryPanel() {
  const [categories, setCategories] = useState([]);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📦');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCategories = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('product_categories')
        .select('id, name, icon')
        .order('name', { ascending: true });

      if (error) throw error;

      setCategories(data || []);
    } catch (err) {
      console.error(
        'Error loading product categories:',
        err.message
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();

    if (!newCatName.trim()) return;

    setSaving(true);

    try {
      // RLS should enforce administrator permissions
      const { data, error } = await supabase
        .from('product_categories')
        .insert([
          {
            name: newCatName.trim(),
            icon: newCatIcon,
          },
        ])
        .select();

      if (error) throw error;

      alert(
        `Category "${newCatName}" created successfully under secure RLS!`
      );

      setCategories(
        [...categories, ...(data || [])].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );

      setNewCatName('');
      setNewCatIcon('📦');
    } catch (err) {
      alert(
        `Security Violation / Error: ${err.message}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="admin-category-panel"
      style={{
        padding: '20px',
      }}
    >
      <div
        style={{
          marginBottom: '24px',
        }}
      >
        <h2>Product Categories</h2>

        <p>
          Create and manage marketplace product categories.
        </p>
      </div>

      <form
        onSubmit={handleCreate}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center',
          marginBottom: '30px',
        }}
      >
        <input
          type="text"
          value={newCatName}
          onChange={(e) =>
            setNewCatName(e.target.value)
          }
          placeholder="Category name"
          disabled={saving}
          style={{
            padding: '10px',
            minWidth: '220px',
            border: '1px solid #ccc',
            borderRadius: '5px',
          }}
        />

        <input
          type="text"
          value={newCatIcon}
          onChange={(e) =>
            setNewCatIcon(e.target.value)
          }
          placeholder="Icon"
          maxLength={4}
          disabled={saving}
          style={{
            padding: '10px',
            width: '70px',
            textAlign: 'center',
            border: '1px solid #ccc',
            borderRadius: '5px',
          }}
        />

        <button
          type="submit"
          disabled={
            saving || !newCatName.trim()
          }
          style={{
            padding: '10px 16px',
            cursor:
              saving || !newCatName.trim()
                ? 'not-allowed'
                : 'pointer',
            border: 'none',
            borderRadius: '5px',
          }}
        >
          {saving
            ? 'Creating...'
            : 'Create Category'}
        </button>
      </form>

      <div>
        <h3>Current Categories</h3>

        {loading ? (
          <p>Loading categories...</p>
        ) : categories.length === 0 ? (
          <p>
            No product categories have been created yet.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '12px',
              marginTop: '15px',
            }}
          >
            {categories.map((category) => (
              <div
                key={category.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: '8px',
                  padding: '16px',
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    fontSize: '28px',
                    marginBottom: '8px',
                  }}
                >
                  {category.icon || '📦'}
                </div>

                <strong>
                  {category.name}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
