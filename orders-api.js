window.ordersApi = (() => {
  function db(){
    if(!window.dirtytaskSupabase)throw new Error('Supabase no está configurado.');
    return window.dirtytaskSupabase.schema('dtshop');
  }
  return Object.freeze({
    async list(){
      const rows=[];
      for(let start=0;;start+=1000){
        const {data,error}=await db().from('shop_order').select('id,status,currency,subtotal_cents,shipping_cents,total_cents,placed_at,street_address,neighborhood,municipality,phone,nit,payment_method_code,installment_count,customer(first_name,last_name),department(name),shop_order_line(id,product_name,variant_label,qty,unit_price_cents,preorder),order_status_event(id,status,note,created_at)')
          .order('placed_at',{ascending:false}).order('id').range(start,start+999);
        if(error)throw error;
        rows.push(...(data||[]));if(!data||data.length<1000)return rows;
      }
    },
    async transition(id,expected,status,note=''){
      const {error}=await db().rpc('transition_shop_order',{p_order:id,p_expected:expected,p_status:status,p_note:note});
      if(error?.code==='PGRST202')throw new Error('Falta ejecutar sql/orders-integration.sql en Supabase.');
      if(error)throw error;
    }
  });
})();
