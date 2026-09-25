const handleCreate = async (e) => {
  e.preventDefault();
  if (!newCatName.trim()) return;
  setSaving(true);
  try {
    // RLS checks if user is Admin via internal metadata validation
    const { data, error } = await supabase
      .from('product_categories')
      .insert([{ name: newCatName.trim(), icon: newCatIcon }])
      .select();
      
    if (error) throw error;
    
    alert(`Category "${newCatName}" created successfully under secure RLS!`);
    setCategories([...categories, ...data].sort((a, b) => a.name.localeCompare(b.name)));
    setNewCatName('');
    setNewCatIcon('📦');
  } catch (err) {
    alert(`Security Violation / Error: ${err.message}`);
  } finally {
    setSaving(false);
  }
};
