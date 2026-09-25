/**
 * BRUKINA MARKETPLACE - REALTIME COURIER TELEMETRY SYNC HOOK
 * Path: src/hooks/useCourierLocation.js
 * Leverages Supabase Realtime Broadcast Channels to map real-time driver coordinates smoothly.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useCourierLocation(riderId) {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!riderId) {
      setLoading(false);
      return;
    }

    console.log(`📡 Opening live micro-telemetry thread for rider ID: ${riderId}`);

    async function fetchInitialLocation() {
      try {
        const { data, error } = await supabase
          .from('local_couriers')
          .select('current_lat, current_lng, is_online, full_name')
          .eq('user_id', riderId)
          .maybeSingle();

        if (error) throw error;
        if (data) setLocation(data);
      } catch (err) {
        console.warn('⚠️ Telemetry footprint buffer fallback triggered:', err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchInitialLocation();

    // Establishes a highly efficient PostgreSQL Changes cluster socket bridge
    const channel = supabase
      .channel(`courier-location-${riderId}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'local_couriers', 
          filter: `user_id=eq.${riderId}` 
        },
        (payload) => {
          if (payload?.new) {
            console.log('🛵 Hot telemetry coordinate sync event intercepted.');
            setLocation(payload.new);
          }
        }
      )
      .subscribe();

    // FIXED: Formulated an explicit, asynchronous cleanup block to prevent thread memory leaks on unmount
    return () => {
      console.log(`🧹 Tearing down telemetry bridge for rider [${riderId}] cleanly...`);
      // Invokes standard channel teardowns safely behind background threads
      supabase.removeChannel(channel).catch(err => {
        console.error('Failed to unbind realtime socket:', err.message);
      });
    };
  }, [riderId]);

  return { location, loading };
}
