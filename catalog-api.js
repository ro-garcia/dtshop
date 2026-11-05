// Data access only: no DOM or localStorage. Reuses the authenticated client.
window.catalogApi = Object.freeze({
  async listCategories() {
    if (!window.dirtytaskSupabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await window.dirtytaskSupabase.schema('dtshop')
      .from('category').select('code,label,sort_order')
      .order('sort_order', { ascending: true }).order('code', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async listProducts(){
    //1 conexion que ya creo el login
    const client = window.dirtytaskSupabase;
    //2 comprobar que existe conexion
    if (!client) throw new Error('Supabase no está configurado.');
    //3 consultar la tabla product
    const { data, error } = await client
      .schema('dtshop')
      .from('product')
      .select('id,name,price_cents,description,category_code,variant_label,stock,status,published,preorder,product_variant(id,label,sort_order),product_media(id, kind,storage_key)')
      .order('name');
    //4 comprobar si hay error
    if (error) 
      throw error;
    //5 devolver los datos o un array vacío
    return data || [];
  }
});


