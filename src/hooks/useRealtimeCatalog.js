import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useRealtimeCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchInitialCatalog() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });
        if (!error) setProducts(data || []);
      } catch (err) {
        console.error('Initial catalog sync failure:', err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchInitialCatalog();

    const catalogChannel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setProducts((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setProducts((prev) =>
              prev.map((item) => (item.id === payload.new.id ? payload.new : item))
            );
          } else if (payload.eventType === 'DELETE') {
            setProducts((prev) => prev.filter((item) => item.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(catalogChannel);
    };
  }, []);

  return { products, setProducts, loading };
}
