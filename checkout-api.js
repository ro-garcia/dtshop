// Guest checkout identity is separate from public reads and partner authentication.
window.checkoutApi = (() => {
  let guestClient;
  function client() {
    if (guestClient) return guestClient;
    const config=window.DIRTYTASK_SUPABASE;
    if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) throw new Error('No se pudo conectar con la tienda.');
    guestClient=window.supabase.createClient(config.url,config.publishableKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'dirtytask-checkout-guest'}
    });
    return guestClient;
  }
  async function identity(create) {
    const {data:{session}={},error}=await client().auth.getSession();
    if(error)throw error;
    if(session){
      const {data,error}=await client().auth.getUser();
      if(error || !data?.user)throw new Error('No se pudo verificar tu sesión de compra. Recarga e inténtalo de nuevo.');
      return data.user;
    }
    if(!create)throw new Error('La confirmación requiere la sesión de compra de este navegador.');
    const result=await client().auth.signInAnonymously();
    if(result.error || !result.data?.user)throw new Error('No se pudo abrir una sesión de compra. Reintenta; si continúa, contacta a Dirtytask.');
    return result.data.user;
  }
  async function rpc(name,args){
    const {data,error}=await client().schema('dtshop').rpc(name,args);
    if(error?.code==='PGRST202')throw new Error('El registro de pedidos aún no está habilitado en la tienda.');
    if(error)throw error;
    return data;
  }
  return Object.freeze({
    prepare:()=>identity(true),
    async submit(requestId,payload){await identity(true);return rpc('submit_shop_order',{p_request_id:requestId,p_payload:payload});},
    async receipt(requestId){await identity(false);return rpc('checkout_receipt',{p_request_id:requestId});}
  });
})();
