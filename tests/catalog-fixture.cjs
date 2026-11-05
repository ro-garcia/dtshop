module.exports = require('./auth-fixture.cjs') + String.raw`
(() => {
 const original=window.supabase.createClient;
 window.catalogRows={
  product:[{id:'remote-shirt',name:'Camiseta remota',category_code:'tshirts',price_cents:29950,stock:8,status:'active',published:true,preorder:false,variant_label:'talla',updated_at:'2026-11-04T10:00:00Z',product_variant:[{id:'v-m',label:'M',sort_order:1},{id:'v-s',label:'S',sort_order:0}],product_media:[{kind:'product',storage_key:'ops/shirt.webp'}]}],
  launch:[{id:'remote-drop',name:'Drop remoto',launch_on:'2026-12-01',arrival_label:'Diciembre',image_key:'ops/drop.webp',status:'upcoming',updated_at:'2026-11-04T10:00:00Z',launch_product:[{product_id:'remote-shirt',sort_order:0}]}]
 };
 window.catalogWrites=[];
 window.testUploads=[];
 window.storeRows=JSON.parse(sessionStorage.getItem('test-store-rows')||'null')||{
  content_block:[{id:1,hero_copy:'Texto desde Supabase',feed_copy:'Feed remoto',instagram_url:'https://www.instagram.com/dirtytask/',tiktok_url:'https://www.tiktok.com/@dirtytask',updated_at:'2026-11-04T10:00:00Z'}],
  content_video:[{id:'video-1',url:'https://www.tiktok.com/@dirtytask/video/7326274171879591173',sort_order:0}],
  store_setting:[{id:1,shipping_guatemala_cents:2550,shipping_other_cents:3550,currency:'GTQ',updated_at:'2026-11-04T10:00:00Z'}],
  payment_method:[{code:'cash',label:'Efectivo',enabled:true},{code:'visa_installments',label:'Cuotas',enabled:false},{code:'visalink',label:'Visalink',enabled:true}],
  department:[{id:1,name:'Guatemala',is_metro:true},{id:2,name:'Petén',is_metro:false}]
 };
 window.supabase.createClient=(...args)=>{
  const client=original(...args), schema=client.schema.bind(client);
  client.storage={from(){return {getPublicUrl:key=>({data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/dtshop-products/'+key}}),async upload(key,file){window.testUploads.push({key,size:file.size,type:file.type});return {error:null}}}}};
  client.schema=(name)=>({
   from(table){
    if(table==='app_user')return schema(name).from(table);
    return {select(){return this},order(){return this},eq(){return this},in(){return this},async single(){
     if(window.storeDelay)await new Promise(r=>setTimeout(r,window.storeDelay));
     return window.storeFailure?{data:null,error:{message:'Sin conexión'}}:{data:structuredClone(window.storeRows[table]?.[0]),error:null};
    },async range(){
     if(window.catalogDelay) await new Promise(r=>setTimeout(r,window.catalogDelay));
     if(table==='category')return window.categoryResponse||{data:[{code:'tshirts',label:'Camisetas desde Supabase',sort_order:1}],error:null};
     if(table in window.storeRows){
      if(window.storeDelay)await new Promise(r=>setTimeout(r,window.storeDelay));
      return window.storeFailure?{data:null,error:{message:'Sin conexión'}}:{data:structuredClone(window.storeRows[table]),error:null};
     }
     return window.catalogFailure?{data:null,error:{message:'Sin conexión'}}:{data:structuredClone(window.catalogRows[table]||[]),error:null};
    }};
   },
   async rpc(name,args){
    window.catalogWrites.push({name,args});
    if(name.startsWith('save_store_')){
     if(window.storeSaveFailure)return {error:{message:'Guardado rechazado de prueba'}};
     if(window.storeSaveDelay)await new Promise(r=>setTimeout(r,window.storeSaveDelay));
     const updated_at=new Date().toISOString();
     let data;
     if(name==='save_store_content'){
      const c=args.p_content;
      window.storeRows.content_block=[{id:1,...c,updated_at}];
      window.storeRows.content_video=c.videos.map((url,i)=>({id:'video-'+i,url,sort_order:i}));
      data={block:window.storeRows.content_block[0],videos:window.storeRows.content_video};
     }else{
      const s=args.p_settings;
      window.storeRows.store_setting=[{...window.storeRows.store_setting[0],...s,updated_at}];
      window.storeRows.payment_method=window.storeRows.payment_method.map(p=>({...p,enabled:s.payments[p.code]}));
      data={settings:window.storeRows.store_setting[0],payments:window.storeRows.payment_method};
     }
     sessionStorage.setItem('test-store-rows',JSON.stringify(window.storeRows));
     return {data:structuredClone(data),error:null};
    }
    if(window.catalogSaveFailure)return {error:{message:'Error de guardado de prueba'}};
    if(name==='save_catalog_product'){
     const p=args.p_product;
     const row={...p,updated_at:'2026-11-04T11:00:00Z',product_variant:p.variants.map((label,i)=>({id:'variant-'+i,label,sort_order:i})),product_media:[{kind:'product',storage_key:p.image_key},...(p.look_key?[{kind:'look',storage_key:p.look_key}]:[])]};
     window.catalogRows.product=window.catalogRows.product.filter(p=>p.id!==row.id).concat(row);
    }
    if(name==='save_catalog_launch'){
     const l=args.p_launch;
     const row={...l,launch_product:l.product_ids.map((product_id,i)=>({product_id,sort_order:i}))};
     window.catalogRows.launch=window.catalogRows.launch.filter(l=>l.id!==row.id).concat(row);
    }
    if(name==='archive_catalog_product')window.catalogRows.product.find(p=>p.id===args.p_id).status='archived';
    if(name==='close_catalog_launch')window.catalogRows.launch.find(l=>l.id===args.p_id).status='closed';
    return {data:args.p_product?.id||args.p_launch?.id||null,error:null};
   }
  });
  return client;
 };
})();`;
