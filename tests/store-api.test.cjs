const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('store-api.js','utf8');
test('content/settings reads use shared client, singleton IDs, stable ordering and propagate errors',async()=>{
 const calls=[];let error=null;
 const window={dirtytaskSupabase:{schema(schema){assert.equal(schema,'dtshop');return {from(table){return {
  select(columns){calls.push([table,columns]);return this},eq(key,id){assert.equal(key,'id');assert.equal(id,1);return this},
  async single(){return {data:{id:1,table},error}},order(key){calls.push(['order',key]);return this},
  async range(start,end){assert.equal(start,0);assert.equal(end,999);return {data:[],error}}
 }}}}}};
 vm.runInNewContext(source,{window});
 assert.equal((await window.storeApi.readContent()).block.table,'content_block');
 assert.equal((await window.storeApi.readSettings()).settings.table,'store_setting');
 assert.ok(calls.some(([table,columns])=>table==='payment_method'&&columns.includes('enabled')));
 assert.ok(calls.some(([op,key])=>op==='order'&&key==='sort_order'));
 error=Error('No connection');await assert.rejects(()=>window.storeApi.readContent(),/No connection/);
 window.dirtytaskSupabase=null;await assert.rejects(()=>window.storeApi.readSettings(),/Supabase/);
});
test('save payloads convert cents and method codes and report missing migrations',async()=>{
 let call,error=null;
 const window={dirtytaskSupabase:{schema(){return {async rpc(name,args){call={name,args};return {data:{saved:true},error}}}}}};
 vm.runInNewContext(source,{window});
 await window.storeApi.saveSettings({shippingGuatemala:25.75,shippingOther:30.10,payments:{cash:true,visaInstallments:false,visalink:true},updatedAt:'version'});
 assert.equal(call.name,'save_store_settings');assert.equal(call.args.p_settings.shipping_guatemala_cents,2575);
 assert.equal(call.args.p_settings.shipping_other_cents,3010);assert.equal(call.args.p_settings.payments.visa_installments,false);
 assert.equal(call.args.p_settings.expected_updated_at,'version');
 await window.storeApi.saveContent({heroCopy:'Hero',feedCopy:'Feed',instagramUrl:'instagram',tiktokUrl:'tiktok',videos:[],updatedAt:'version'});
 assert.equal(call.name,'save_store_content');assert.equal(call.args.p_content.videos.length,0);
 assert.throws(()=>window.storeApi.saveSettings({shippingGuatemala:NaN}),/tarifa/);
 error={code:'PGRST202'};await assert.rejects(()=>window.storeApi.saveContent({}),/store-integration.sql/);
 error=Error('Denied');await assert.rejects(()=>window.storeApi.saveContent({}),/Denied/);
});
