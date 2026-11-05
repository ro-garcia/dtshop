// Content and store preferences share the client initialized by admin-auth.js.
window.storeApi = (() => {
  function db() {
    if (!window.dirtytaskSupabase) throw new Error('Supabase no está configurado.');
    return window.dirtytaskSupabase.schema('dtshop');
  }
  async function singleton(table, columns) {
    const {data, error} = await db().from(table).select(columns).eq('id', 1).single();
    if (error) throw error;
    if (!data) throw new Error(`Falta el registro principal de ${table}.`);
    return data;
  }
  async function rows(table, columns, order) {
    const result = [];
    for (let start = 0; ; start += 1000) {
      let query = db().from(table).select(columns);
      for (const key of order) query = query.order(key);
      const {data, error} = await query.range(start, start + 999);
      if (error) throw error;
      result.push(...(data || []));
      if (!data || data.length < 1000) return result;
    }
  }
  async function rpc(name, args) {
    const {data, error} = await db().rpc(name, args);
    if (error?.code === 'PGRST202') throw new Error('Falta ejecutar sql/store-integration.sql en Supabase.');
    if (error) throw error;
    return data;
  }
  function cents(value) {
    if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) throw new Error('Ingresa una tarifa válida.');
    return Math.round(value * 100);
  }
  return Object.freeze({
    async readContent() {
      const [block, videos] = await Promise.all([
        singleton('content_block', 'id,hero_copy,feed_copy,instagram_url,tiktok_url,updated_at'),
        rows('content_video', 'id,url,sort_order', ['sort_order', 'id'])
      ]);
      return {block, videos};
    },
    async readSettings() {
      const [settings, payments] = await Promise.all([
        singleton('store_setting', 'id,shipping_guatemala_cents,shipping_other_cents,currency,updated_at'),
        rows('payment_method', 'code,label,detail,enabled,sort_order', ['sort_order', 'code'])
      ]);
      return {settings, payments};
    },
    saveContent(content) {
      return rpc('save_store_content', {p_content: {
        hero_copy: content.heroCopy, feed_copy: content.feedCopy,
        instagram_url: content.instagramUrl, tiktok_url: content.tiktokUrl,
        videos: content.videos, expected_updated_at: content.updatedAt
      }});
    },
    saveSettings(settings) {
      return rpc('save_store_settings', {p_settings: {
        shipping_guatemala_cents: cents(settings.shippingGuatemala),
        shipping_other_cents: cents(settings.shippingOther),
        payments: {cash: settings.payments.cash, visa_installments: settings.payments.visaInstallments, visalink: settings.payments.visalink},
        expected_updated_at: settings.updatedAt
      }});
    }
  });
})();
