import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useCourierLocation(riderId) {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!riderId) return;

    async function fetchLocation() {
      const { data } = await supabase
        .from('local_couriers')
        .select('current_lat, current_lng, is_online, full_name')
        .eq('user_id', riderId)
        .maybeSingle();
      if (data) setLocation(data);
      setLoading(false);
    }
    fetchLocation();

    const channel = supabase
      .channel(`courier-location-${riderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'local_couriers', filter: `user_id=eq.${riderId}` },
        (payload) => setLocation(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [riderId]);

  return { location, loading };
}
