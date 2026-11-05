const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function fixture(){
 const calls=[];let fail=false;
 const product=(id,props={})=>({id,name:id,category_code:'tshirts',price_cents:29950,stock:3,status:'active',published:false,preorder:false,product_variant:[{id:'v-m',label:'M',sort_order:1},{id:'v-s',label:'S',sort_order:0}],...props});
 const tables={product:[product('public',{published:true}),product('draft',{status:'draft',published:true}),product('archived',{status:'archived',published:true}),product('hidden'),product('preorder',{preorder:true}),product('orphan',{preorder:true})],launch:[{id:'drop',name:'Drop',status:'open',launch_product:[{product_id:'preorder',sort_order:0},{product_id:'draft',sort_order:1}]},{id:'closed',status:'closed',launch_product:[{product_id:'orphan'}]}],category:[{code:'tshirts',label:'Camisetas'}],store_setting:[{currency:'GTQ',shipping_guatemala_cents:2550,shipping_other_cents:3550}],payment_method:[{code:'cash',enabled:true},{code:'disabled',enabled:false}],department:[{id:1,name:'Guatemala',is_metro:true}],content_block:[{hero_copy:'Hero',feed_copy:'Feed',instagram_url:'javascript:alert(1)',tiktok_url:'https://www.tiktok.com/@dirtytask'}],content_video:[]};
 const client={
  schema(schema){
   assert.equal(schema,'dtshop');
   return {from(table){return {
    select(columns){calls.push(['select',table,columns]);return this},
    eq(key,value){calls.push(['eq',table,key,value]);return this},in(){return this},order(){return this},
    async single(){return {data:tables[table][0],error:fail?Error('offline'):null}},
    async range(){return {data:tables[table],error:fail?Error('offline'):null}}
   }}};
  },
  storage:{from(bucket){assert.equal(bucket,'dtshop-products');return {getPublicUrl:key=>({data:{publicUrl:'https://storage.example/'+key}})}}}
 };
 const window={DIRTYTASK_SUPABASE:{url:'https://test.supabase.co',publishableKey:'sb_publishable_test'},supabase:{createClient(url,key,options){calls.push(['client',options]);return client}}};
 vm.runInNewContext(fs.readFileSync('storefront-api.js','utf8'),{window,URL});
 return {api:window.storefrontApi,calls,tables,setFailure:value=>{fail=value}};
}
test('anonymous catalog excludes drafts, archives and unlinked preorders; maps current cents and variant IDs',async()=>{
 const {api,calls}=fixture();const result=await api.readCatalog();
 assert.deepEqual(Array.from(result.products,p=>p.id),['public','preorder']);
 assert.deepEqual(Array.from(result.launches[0].productIds),['preorder']);
 assert.equal(result.products[0].priceCents,29950);assert.equal(result.products[0].price,299.5);
 assert.equal(result.products[0].variantRecords[0].id,'v-s');assert.equal(result.products[0].category,'Camisetas');
 const options=calls.find(c=>c[0]==='client')[1];assert.equal(options.auth.persistSession,false);assert.equal(options.auth.detectSessionInUrl,false);assert.equal(options.auth.autoRefreshToken,false);
 assert.equal(options.auth.storageKey,'dirtytask-public');
 assert.ok(calls.some(c=>c[0]==='eq'&&c[1]==='product'&&c[2]==='status'&&c[3]==='active'));
});
test('checkout reads live rates, departments and enabled payments; invalid prices and failures reject',async()=>{
 const {api,tables,setFailure}=fixture();const data=await api.readCheckout();
 assert.equal(data.settings.shippingGuatemalaCents,2550);assert.equal(data.payments.length,1);assert.equal(data.departments[0].is_metro,true);
 const content=await api.readContent();assert.equal(content.instagramUrl,'');assert.equal(content.videos.length,0);
 tables.product[0].price_cents='9007199254740992';await assert.rejects(()=>api.readCatalog(),/importe/);
 setFailure(true);await assert.rejects(()=>api.readContent(),/offline/);
});
