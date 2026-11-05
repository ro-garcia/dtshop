const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('guest checkout uses its own session and restores it before submitting',async()=>{
 let session=null,signups=0,calls=[],options;
 const client={auth:{async getSession(){return {data:{session}}},async getUser(){return {data:{user:session?.user}}},async signInAnonymously(){signups++;session={user:{id:'guest'}};return {data:session}}},schema(name){assert.equal(name,'dtshop');return {async rpc(name,args){calls.push({name,args});return {data:{id:'order'}}}}}};
 const window={DIRTYTASK_SUPABASE:{url:'https://test.supabase.co',publishableKey:'sb_publishable_test'},supabase:{createClient(url,key,opts){options=opts;return client}}};
 vm.runInNewContext(fs.readFileSync('checkout-api.js','utf8'),{window});
 await assert.rejects(()=>window.checkoutApi.receipt('request'),/sesión/);
 assert.equal(signups,0);await window.checkoutApi.prepare();await window.checkoutApi.submit('request',{lines:[]});await window.checkoutApi.receipt('request');
 assert.equal(signups,1);assert.equal(options.auth.storageKey,'dirtytask-checkout-guest');assert.equal(options.auth.detectSessionInUrl,false);
 assert.equal(calls[0].name,'submit_shop_order');assert.equal(calls[0].args.p_request_id,'request');assert.equal(calls[1].name,'checkout_receipt');
});
test('guest signup and server failures propagate without an unverified submission',async()=>{
 let signupsFail=true,writes=0;
 const client={auth:{async getSession(){return {data:{session:null}}},async signInAnonymously(){return signupsFail?{error:Error('disabled')}:{data:{user:{id:'guest'}}}}},schema(){return {async rpc(){writes++;return {error:{code:'PGRST202'}}}}}};
 const window={DIRTYTASK_SUPABASE:{url:'https://test.supabase.co',publishableKey:'sb_publishable_test'},supabase:{createClient(){return client}}};
 vm.runInNewContext(fs.readFileSync('checkout-api.js','utf8'),{window});
 await assert.rejects(()=>window.checkoutApi.submit('id',{}),/sesión de compra/);assert.equal(writes,0);
 signupsFail=false;await assert.rejects(()=>window.checkoutApi.submit('id',{}),/habilitado/);assert.equal(writes,1);
});
test('admin orders read related records by pages and transition with expected status',async()=>{
 const calls=[];
 const window={dirtytaskSupabase:{schema(name){assert.equal(name,'dtshop');return {
  from(table){assert.equal(table,'shop_order');return {select(columns){calls.push(columns);return this},order(){return this},async range(start){return {data:start===0?Array.from({length:1000},(_,id)=>({id})):[]}}}},
  async rpc(name,args){calls.push({name,args});return {error:null}}
 }}}};
 vm.runInNewContext(fs.readFileSync('orders-api.js','utf8'),{window});
 assert.equal((await window.ordersApi.list()).length,1000);assert.match(calls[0],/shop_order_line/);assert.match(calls[0],/order_status_event/);
 await window.ordersApi.transition('id','pending','confirmed','Nota');const call=calls.at(-1);
 assert.equal(call.name,'transition_shop_order');assert.equal(call.args.p_expected,'pending');assert.equal(call.args.p_note,'Nota');
});
