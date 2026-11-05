// Data access only. Reuses the authenticated client created by admin-auth.js.
window.catalogApi = (() => {
  const productColumns = 'id,name,price_cents,description,category_code,variant_label,stock,status,published,preorder,updated_at,product_variant(id,label,sort_order),product_media(id,kind,storage_key)';
  const launchColumns = 'id,name,launch_on,arrival_label,image_key,status,updated_at,launch_product(product_id,sort_order)';
  function client() {
    if (!window.dirtytaskSupabase) throw new Error('Supabase no está configurado.');
    return window.dirtytaskSupabase;
  }
  async function readPages(table, columns, order) {
    const rows = [];
    const size = 1000;
    for (let start = 0; ; start += size) {
      let query = client().schema('dtshop').from(table).select(columns);
      for (const column of order) query = query.order(column, { ascending: true });
      const { data, error } = await query.range(start, start + size - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < size) return rows;
    }
  }
  async function rpc(name, args) {
    const { data, error } = await client().schema('dtshop').rpc(name, args);
    if (error) {
      if (error.code === 'PGRST202') throw new Error('Falta instalar sql/catalog-integration.sql en Supabase.');
      throw error;
    }
    return data;
  }
  function publicImageUrl(key) {
    return key ? client().storage.from('dtshop-products').getPublicUrl(key).data.publicUrl : '';
  }
  async function imageKey(value, userId) {
    if (!value) return null;
    const prefix = publicImageUrl('catalog-placeholder').replace(/catalog-placeholder$/, '');
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
    if (!/^data:image\/webp;base64,[A-Za-z0-9+/]+=*$/.test(value) && !/^assets\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(value)) {
      throw new Error('Selecciona una imagen válida para subir a Supabase.');
    }
    const response = await fetch(value);
    if (!response.ok) throw new Error('No se pudo leer la imagen.');
    const blob = await response.blob();
    const extension = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[blob.type];
    if (!extension || blob.size > 15 * 1024 * 1024) throw new Error('Imagen inválida o mayor de 15 MB.');
    const key = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await client().storage.from('dtshop-products').upload(key, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    return key;
  }
  return Object.freeze({
    listCategories: () => readPages('category', 'code,label,sort_order', ['sort_order', 'code']),
    listProducts: () => readPages('product', productColumns, ['name', 'id']),
    listLaunches: () => readPages('launch', launchColumns, ['launch_on', 'id']),
    publicImageUrl,
    async saveProduct(product, existing, userId) {
      const [image, look] = await Promise.all([imageKey(product.image, userId), imageKey(product.lookImage, userId)]);
      return rpc('save_catalog_product', { p_existing: existing, p_product: {
        id: product.id, name: product.name, category_code: product.category, description: product.description,
        price_cents: Math.round(product.price * 100), stock: product.stock, status: product.status,
        published: product.published, preorder: product.preorder, variant_label: product.variantName,
        variants: product.variants, image_key: image, look_key: look, expected_updated_at: product.updatedAt
      } });
    },
    async saveLaunch(launch, existing, userId) {
      return rpc('save_catalog_launch', { p_existing: existing, p_launch: {
        id: launch.id, name: launch.name, launch_on: launch.launchDate || null,
        arrival_label: launch.arrivalDate, status: launch.status, product_ids: launch.productIds,
        image_key: await imageKey(launch.image, userId), expected_updated_at: launch.updatedAt
      } });
    },
    archiveProduct: id => rpc('archive_catalog_product', { p_id: id }),
    closeLaunch: id => rpc('close_catalog_launch', { p_id: id })
  });
})();


