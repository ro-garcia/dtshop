module.exports=require('./catalog-fixture.cjs')+String.raw`
(() => {
 const create=window.supabase.createClient;
 const read=()=>JSON.parse(localStorage.getItem('test-orders-backend')||'{"rows":[],"requests":{}}');
 const save=db=>localStorage.setItem('test-orders-backend',JSON.stringify(db));
 const receipt=row=>({id:row.id,status:row.status,currency:row.currency,subtotal_cents:row.subtotal_cents,shipping_cents:row.shipping_cents,total_cents:row.total_cents,placed_at:row.placed_at,payment_method_code:row.payment_method_code,installment_count:row.installment_count,customer_name:[row.customer.first_name,row.customer.last_name].join(" "),nit:row.nit,phone:row.phone,street_address:row.street_address,neighborhood:row.neighborhood,municipality:row.municipality,department:row.department.name,
  lines:row.shop_order_line.map(line=>({product_id:line.product_id,variant_id:line.variant_id,variant_label:line.variant_label,qty:line.qty,product_name:line.product_name,unit_price_cents:line.unit_price_cents,preorder:line.preorder}))});
 window.orderCalls=[];
 window.storeRows.payment_method.find(p=>p.code==='visa_installments').enabled=true;
 window.supabase.createClient=(...args)=>{
  const client=create(...args),schema=client.schema.bind(client);
  if(args[2]?.auth?.storageKey==='dirtytask-checkout-guest')client.auth={
   async getSession(){return {data:{session:JSON.parse(localStorage.getItem('test-guest-session')||'null')}}},
   async getUser(){return {data:{user:JSON.parse(localStorage.getItem('test-guest-session')||'null')?.user}}},
   async signInAnonymously(){if(window.guestDisabled)return {error:{message:'disabled'}};const session={user:{id:'guest'}};localStorage.setItem('test-guest-session',JSON.stringify(session));return {data:session}}
  };
  client.schema=name=>({
   from(table){
    if(table!=='shop_order')return schema(name).from(table);
    return {select(){return this},order(){return this},async range(){if(window.ordersDelay)await new Promise(r=>setTimeout(r,window.ordersDelay));return window.ordersFailure?{error:{message:'No conexión'}}:{data:read().rows.slice().reverse(),error:null}}};
   },
   async rpc(name,args){
    if(!['checkout_receipt','submit_shop_order','transition_shop_order'].includes(name))return schema('dtshop').rpc(name,args);
    window.orderCalls.push({name,args});const db=read();
    if(name==='checkout_receipt'){
     const id=db.requests[args.p_request_id]?.id,row=db.rows.find(row=>row.id===id);
     return row?{data:receipt(row)}:{error:{code:'P0002',message:'No encontrado'}};
    }
    if(name==='submit_shop_order'){
     const p=args.p_payload,prior=db.requests[args.p_request_id];
     if(prior)return JSON.stringify(p)===prior.payload?{data:receipt(db.rows.find(row=>row.id===prior.id))}:{error:{message:'Otros datos'}};
     if(window.orderSubmitFailure)return {error:{message:'Stock insuficiente'}};
     if(window.orderSubmitDelay)await new Promise(r=>setTimeout(r,window.orderSubmitDelay));
     const now=new Date().toISOString();
     const lines=p.lines.map(line=>{const product=window.catalogRows.product.find(item=>item.id===line.product_id);const variant=product.product_variant.find(v=>v.id===line.variant_id);return {...line,id:crypto.randomUUID(),product_name:product.name,variant_label:variant.label,unit_price_cents:product.price_cents,preorder:product.preorder}});
     const subtotal=lines.reduce((sum,line)=>sum+line.qty*line.unit_price_cents,0),shipping=p.department==='Guatemala'?window.storeRows.store_setting[0].shipping_guatemala_cents:window.storeRows.store_setting[0].shipping_other_cents;
     const row={id:crypto.randomUUID(),status:'pending',currency:'GTQ',placed_at:now,subtotal_cents:subtotal,shipping_cents:shipping,total_cents:subtotal+shipping,
      street_address:p.street,neighborhood:p.neighborhood,municipality:p.municipality,phone:p.phone,nit:p.nit,payment_method_code:p.payment_method,installment_count:p.installments,
      customer:{first_name:p.first_name,last_name:p.last_name},department:{name:p.department},shop_order_line:lines,
      order_status_event:[{id:crypto.randomUUID(),status:'pending',note:'',created_at:now}]};
     db.rows.push(row);db.requests[args.p_request_id]={id:row.id,payload:JSON.stringify(p)};save(db);
     if(window.orderResponseLost){window.orderResponseLost=false;return {error:{message:'Respuesta interrumpida'}};}
     return {data:receipt(row)};
    }
    if(window.orderTransitionFailure)return {error:{message:'Transición rechazada'}};
    const row=db.rows.find(row=>row.id===args.p_order);
    row.status=args.p_status;row.order_status_event.push({id:crypto.randomUUID(),status:args.p_status,note:args.p_note,created_at:new Date().toISOString()});save(db);return {data:null};
   }
  });
  return client;
 };
})();`;
