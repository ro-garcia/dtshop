const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('categories use shared client, explicit schema, columns and ordering; errors propagate',async()=>{
 const calls=[];let error=null;
 const query={select(x){calls.push(['select',x]);return this;},order(x){calls.push(['order',x]);return this;},range(a,b){calls.push(['range',a,b]);return Promise.resolve({data:[{code:'new',label:'Nueva',sort_order:1}],error});}};
 const window={dirtytaskSupabase:{schema(x){calls.push(['schema',x]);return {from(x){calls.push(['from',x]);return query;}};}}};
 vm.runInNewContext(fs.readFileSync('catalog-api.js','utf8'),{window});
 assert.equal((await window.catalogApi.listCategories())[0].code,'new');
 assert.deepEqual(calls,[['schema','dtshop'],['from','category'],['select','code,label,sort_order'],['order','sort_order'],['order','code'],['range',0,999]]);
 error=new Error('network');await assert.rejects(()=>window.catalogApi.listCategories(),/network/);
 window.dirtytaskSupabase=null;await assert.rejects(()=>window.catalogApi.listCategories(),/Supabase/);
});
test('reads all product pages with relationships and launches; RPC failures propagate',async()=>{
 const calls=[];
 const window={dirtytaskSupabase:{schema(){return {from(table){return {select(columns){calls.push([table,columns]);return this},order(){return this},async range(start){return {data:start===0&&table==='product'?Array.from({length:1000},(_,id)=>({id})):[],error:null}}}},async rpc(){return {error:{code:'PGRST202'}}}}}}};
 vm.runInNewContext(fs.readFileSync('catalog-api.js','utf8'),{window});
 assert.equal((await window.catalogApi.listProducts()).length,1000);
 await window.catalogApi.listLaunches();
 assert.match(calls[0][1],/product_variant\(id,label,sort_order\)/);
 assert.match(calls[0][1],/product_media\(id,kind,storage_key\)/);
 assert.match(calls.at(-1)[1],/launch_product\(product_id,sort_order\)/);
 await assert.rejects(()=>window.catalogApi.archiveProduct('shirt'),/catalog-integration.sql/);
});
test('product writes convert prices and reuse existing Storage images',async()=>{
 let args;
 const base='https://test.supabase.co/storage/v1/object/public/dtshop-products/';
 const window={dirtytaskSupabase:{storage:{from(){return {getPublicUrl:key=>({data:{publicUrl:base+key}})}}},schema(){return {async rpc(name,payload){args={name,payload};return {data:'shirt',error:null}}}}}};
 vm.runInNewContext(fs.readFileSync('catalog-api.js','utf8'),{window});
 await window.catalogApi.saveProduct({id:'shirt',price:299.50,variants:['M'],image:base+'ops/photo.webp',lookImage:''},null,'ops');
 assert.equal(args.name,'save_catalog_product');
 assert.equal(args.payload.p_product.price_cents,29950);
 assert.equal(args.payload.p_product.image_key,'ops/photo.webp');
 assert.equal(args.payload.p_product.look_key,null);
});
test('new images upload before saving; a failed upload never writes the product',async()=>{
 let uploadError=null,uploads=0,writes=0,saved;
 const window={dirtytaskSupabase:{storage:{from(){return {
  getPublicUrl:key=>({data:{publicUrl:'https://test.supabase.co/storage/v1/object/public/dtshop-products/'+key}}),
  async upload(key,blob,options){uploads++;assert.equal(key,'ops/unique.webp');assert.equal(options.upsert,false);assert.equal(blob.type,'image/webp');return {error:uploadError}}
 }}},schema(){return {async rpc(name,args){writes++;saved=args.p_product;return {data:'shirt',error:null}}}}}};
 vm.runInNewContext(fs.readFileSync('catalog-api.js','utf8'),{window,crypto:{randomUUID:()=> 'unique'},fetch:async()=>({ok:true,blob:async()=>new Blob(['image'],{type:'image/webp'})})});
 const product={id:'shirt',price:10,image:'data:image/webp;base64,aW1hZ2U=',lookImage:'',variants:['M']};
 await window.catalogApi.saveProduct(product,null,'ops');
 assert.equal(uploads,1);assert.equal(saved.image_key,'ops/unique.webp');assert.equal(writes,1);
 uploadError=Error('Storage unavailable');
 await assert.rejects(()=>window.catalogApi.saveProduct(product,null,'ops'),/Storage unavailable/);
 assert.equal(writes,1);
});
