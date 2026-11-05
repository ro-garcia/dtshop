// Public reads use an isolated anonymous client, including when a partner is signed in.
window.storefrontApi = (() => {
  let publicClient;
  function client() {
    if (publicClient) return publicClient;
    const config = window.DIRTYTASK_SUPABASE;
    if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) throw new Error('No se pudo conectar con la tienda.');
    publicClient = window.supabase.createClient(config.url, config.publishableKey, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'dirtytask-public'}
    });
    return publicClient;
  }
  async function rows(table, columns, order, configure = query => query) {
    const result = [];
    for (let start = 0; ; start += 1000) {
      let query = configure(client().schema('dtshop').from(table).select(columns));
      for (const key of order) query = query.order(key);
      const {data, error} = await query.range(start, start + 999);
      if (error) throw error;
      result.push(...(data || []));
      if (!data || data.length < 1000) return result;
    }
  }
  async function singleton(table, columns) {
    const {data, error} = await client().schema('dtshop').from(table).select(columns).eq('id', 1).single();
    if (error) throw error;
    if (!data) throw new Error('No se pudo consultar la configuración de la tienda.');
    return data;
  }
  function imageUrl(key) {
    return key ? client().storage.from('dtshop-products').getPublicUrl(key).data.publicUrl : '';
  }
  function moneyCents(value) {
    const cents = Number(value);
    if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('La tienda contiene un importe inválido.');
    return cents;
  }
  function socialUrl(value, host) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && [host, 'www.' + host].includes(url.hostname) ? url.href : '';
    } catch { return ''; }
  }
  return Object.freeze({
    socialUrl,
    async readCatalog() {
      const [rawProducts, rawLaunches, categories, settings] = await Promise.all([
        rows('product', 'id,name,category_code,description,price_cents,stock,status,published,preorder,variant_label,created_at,product_variant(id,label,sort_order),product_media(kind,storage_key)', ['created_at', 'id'], q => q.eq('status','active')),
        rows('launch', 'id,name,launch_on,arrival_label,image_key,status,launch_product(product_id,sort_order)', ['launch_on', 'id'], q => q.in('status',['open','upcoming'])),
        rows('category', 'code,label,sort_order', ['sort_order','code']),
        singleton('store_setting','currency,shipping_guatemala_cents,shipping_other_cents')
      ]);
      const launches = rawLaunches.filter(row => ['open','upcoming'].includes(row.status));
      const launchIds = new Set(launches.flatMap(row => (row.launch_product || []).map(link => link.product_id)));
      const categoryNames = new Map(categories.map(row => [row.code,row.label]));
      const products = rawProducts.filter(row => row.status === 'active' && (row.published || (row.preorder && launchIds.has(row.id)))).map(row => {
        const variants = [...(row.product_variant || [])].sort((a,b) => a.sort_order-b.sort_order || a.label.localeCompare(b.label));
        const media = kind => imageUrl((row.product_media || []).find(photo => photo.kind === kind)?.storage_key);
        const priceCents = moneyCents(row.price_cents);
        return {id: row.id, name: row.name, categoryCode: row.category_code, category: categoryNames.get(row.category_code) || row.category_code,
          description: row.description || '', priceCents, price: priceCents / 100,
          stock: Math.max(0, Number(row.stock) || 0), published: row.published, preorder: row.preorder,
          variantName: row.variant_label || 'talla', variantRecords: variants, variants: variants.map(variant => variant.label),
          image: media('product') || 'assets/dirtytask-logo.png', lookImage: media('look'), lookAlt: 'Look para ' + row.name};
      });
      const productIds = new Set(products.map(product => product.id));
      return {products, categories, settings: {currency: settings.currency,
        shippingGuatemalaCents: moneyCents(settings.shipping_guatemala_cents), shippingOtherCents: moneyCents(settings.shipping_other_cents)},
        launches: launches.map(row => ({id: row.id, name: row.name, launchDate: row.launch_on || '', arrivalDate: row.arrival_label || '',
          status: row.status, image: imageUrl(row.image_key), productIds: [...(row.launch_product || [])]
            .sort((a,b) => a.sort_order-b.sort_order || a.product_id.localeCompare(b.product_id)).map(link => link.product_id).filter(id => productIds.has(id))}))};
    },
    async readContent() {
      const [block, videos] = await Promise.all([
        singleton('content_block','hero_copy,feed_copy,instagram_url,tiktok_url,hero_image_key').catch(error=>{
          if(!['42703','PGRST204'].includes(error.code))throw error;
          return singleton('content_block','hero_copy,feed_copy,instagram_url,tiktok_url');
        }),
        rows('content_video','id,url,sort_order',['sort_order','id'])
      ]);
      return {heroCopy: block.hero_copy, feedCopy: block.feed_copy, heroImage: imageUrl(block.hero_image_key) || 'assets/campaign-city.jpg',
        instagramUrl: socialUrl(block.instagram_url,'instagram.com'), tiktokUrl: socialUrl(block.tiktok_url,'tiktok.com'), videos};
    },
    async readCheckout() {
      const [catalog, payments, departments] = await Promise.all([
        this.readCatalog(), rows('payment_method','code,label,detail,enabled,sort_order',['sort_order','code'],q=>q.eq('enabled',true)),
        rows('department','id,name,is_metro',['name','id'])
      ]);
      return {...catalog, payments: payments.filter(method => method.enabled), departments};
    }
  });
})();
