import { useEffect, useState } from 'react';

const isCatalogProduct = (product, freeDeliveryOnly) =>
  product?.active === true && (!freeDeliveryOnly || product.free_delivery === true);

const upsertById = (products, product) => {
  const index = products.findIndex(item => item.id === product.id);
  if (index === -1) return [product, ...products];

  const updated = [...products];
  updated[index] = product;
  return updated;
};

export function useRealtimeCatalog(supabase, { freeDeliveryOnly = true } = {}) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    let revision = 0;

    if (!supabase?.from || !supabase?.channel || !supabase?.removeChannel) {
      setProducts([]);
      setError(new Error('A configured Supabase client is required.'));
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);

    const channel = supabase
      .channel('marketplace-inventory-catalog')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'marketplace_inventory' },
        payload => {
          revision += 1;

          if (!active) return;

          if (payload.eventType === 'DELETE') {
            setProducts(current => current.filter(item => item.id !== payload.old?.id));
            return;
          }

          const product = payload.new;
          if (!product?.id) return;

          setProducts(current => {
            if (!isCatalogProduct(product, freeDeliveryOnly)) {
              return current.filter(item => item.id !== product.id);
            }
            return upsertById(current, product);
          });
        }
      )
      .subscribe((status, subscriptionError) => {
        if (!active) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError(subscriptionError || new Error(`Catalog subscription ${status.toLowerCase()}.`));
        }
      });

    const initialRevision = revision;
    const loadCatalog = async () => {
      try {
        let query = supabase
          .from('marketplace_inventory')
          .select('*')
          .eq('active', true);

        if (freeDeliveryOnly) query = query.eq('free_delivery', true);

        const { data, error: queryError } = await query.order('created_at', { ascending: false });
        if (queryError) throw queryError;

        if (active && revision === initialRevision) {
          setProducts((data || []).filter(product => isCatalogProduct(product, freeDeliveryOnly)));
        }
      } catch (loadError) {
        if (active) setError(loadError);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadCatalog();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [supabase, freeDeliveryOnly]);

  return { products, loading, error };
}