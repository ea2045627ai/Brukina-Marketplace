import { useEffect } from 'react';
import { supabase } from './supabaseClient';

export function useCourierLocation(role) {
  useEffect(() => {
    if (!supabase || !['driver', 'rider'].includes(role) || !navigator.geolocation) return undefined;
    let active = true;

    const publishLocation = async ({ latitude, longitude }) => {
      if (!active) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch('/api/v1/couriers/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude, longitude })
      });
    };

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => publishLocation(coords),
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
    );
    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [role]);
}