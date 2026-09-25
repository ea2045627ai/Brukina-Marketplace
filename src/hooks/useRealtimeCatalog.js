/**
 * BRUKINA ACCESS MARKETPLACE - REALTIME B2B CATALOG HOOK
 * Path: src/hooks/useRealtimeCatalog.js
 * Streams real-time wholesale updates, new inventory arrivals, and item removal events.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useRealtimeCatalog() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Retrieve the baseline initial catalog dataset safely
    async function fetchInitialCatalog() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        setProducts(data || []);
      } catch (err) {
        console.error('Initial catalog sync failure:', err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchInitialCatalog();

    // 2. Establish an active WebSocket broadcast connection to stream data mutations
    const catalogChannel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          console.log(`⚡ Real-time catalog mutation detected: ${payload.eventType}`);
          
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

    // FIXED: Formulated an explicit, asynchronous cleanup handler to prevent socket memory leaks on unmount
    return () => {
      console.log('🧹 Tearing down real-time catalog broadcast channels cleanly...');
      supabase.removeChannel(catalogChannel).catch((err) => {
        console.error('Failed to unbind realtime catalog socket channel:', err.message);
      });
    };
  }, []);

  return { products, setProducts, loading };
}
