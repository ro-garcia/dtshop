// Run with Playwright available on NODE_PATH and Microsoft Edge installed.
// All Supabase calls are simulated. This test never contacts the live project.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname,'..');

function mockBackend() {
  const user={id:'00000000-0000-4000-8000-000000000001',display_name:'Operaciones',role:'partner_ops',is_active:true};
  const timestamp='2026-11-08T12:00:00Z';
  const product={id:'tee-test',name:'Camiseta inicial',price_cents:12000,description:'Prueba',category_code:'tshirts',variant_label:'Talla',stock:5,status:'active',published:true,preorder:false,updated_at:timestamp,product_variant:[{id:'v1',label:'M',sort_order:0}],product_media:[]};
  const order={id:'00000000-0000-4000-8000-000000000002',status:'pending',currency:'GTQ',subtotal_cents:12000,shipping_cents:2500,total_cents:14500,placed_at:timestamp,street_address:'Calle 1',neighborhood:'Zona 1',municipality:'Guatemala',phone:'55555555',nit:'CF',payment_method_code:'cash',customer:{first_name:'Ana',last_name:'Prueba'},department:{name:'Guatemala'},shop_order_line:[{id:'l1',product_name:'Camiseta',variant_label:'M',qty:1,unit_price_cents:12000,preorder:false}],order_status_event:[]};
  const tables={app_user:[user],product:[product],launch:[],category:[{code:'tshirts',label:'Camisetas',sort_order:0}],shop_order:[order],
    content_block:[{id:1,hero_copy:'Original',feed_copy:'Feed',instagram_url:'https://instagram.com/test',tiktok_url:'https://tiktok.com/@test',updated_at:timestamp,hero_image_key:null}],content_video:[],
    store_setting:[{id:1,shipping_guatemala_cents:2500,shipping_other_cents:3500,currency:'GTQ',updated_at:timestamp}],payment_method:['cash','visa_installments','visalink'].map(code=>({code,label:code,detail:'',enabled:true,sort_order:0}))};
  const snapshot={accounts:[],obligations:[],requests:[],sales:[],saleLines:[],adjustments:[],receipts:[],settlements:[],allocations:[],entries:[],transfers:[],movements:[],people:[user],read_at:timestamp};
  const backend=window.testBackend={tables,snapshot,channels:[],reads:{},rpcs:{},balance:10000,hold:null,release:null,session:true};
  backend.emit=(table,eventType='UPDATE')=>{for(const ch of backend.channels)if(!ch.removed)for(const h of ch.handlers)if(h.filter.table===table)h.callback({table,eventType});};
  function query(table) {
    const q={singleRow:false,start:0,end:999,select(){return this;},eq(){return this;},order(){return this;},single(){this.singleRow=true;return this;},range(start,end){this.start=start;this.end=end;return this;},
      async then(resolve,reject){try{backend.reads[table]=(backend.reads[table]||0)+1;const data=structuredClone(this.singleRow?tables[table]?.[0]:tables[table]?.slice(this.start,this.end+1)||[]);if(backend.hold===table)await new Promise(r=>backend.release=r);return resolve({data,error:null});}catch(e){return reject(e);}}};return q;
  }
  const client={schema(){return {from:query,async rpc(name,args){backend.rpcs[name]=(backend.rpcs[name]||0)+1;if(name==='finance_snapshot')return {data:structuredClone(snapshot)};if(name==='finance_account_ledger'){const account=snapshot.accounts.find(a=>a.id===args.p_account);return account?{data:{account:structuredClone(account),opening:0,balance:0,rows:[]}}:{error:{message:'La cuenta ya no existe.'}};}if(name==='finance_report')return {data:{GTQ:{balance:backend.balance,incoming:0,outgoing:0,sales:0,customerDue:0,courierDue:0,operatingExpenses:0,withheld:0,debtPayments:0,contributions:0}}};return {data:null};}};},
    auth:{async getSession(){return {data:{session:backend.session?{user}:null}};},async getUser(){return {data:{user:{...user,email:'test@example.test'}}};},onAuthStateChange(){},async signOut(){backend.session=false;return {};},async signInWithPassword(){backend.session=true;return {};}},
    storage:{from(){return {getPublicUrl:key=>({data:{publicUrl:'https://example.test/'+key}})};}},
    channel(name){const ch={name,handlers:[],on(type,filter,callback){this.handlers.push({filter,callback});return this;},subscribe(callback){this.status=callback;setTimeout(()=>{if(!this.removed)callback('SUBSCRIBED');},0);return this;}};backend.channels.push(ch);return ch;},
    async removeChannel(ch){ch.removed=true;return 'ok';}};
  window.supabase={createClient:()=>client};
}

(async()=>{
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
    try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'msedge',headless:true});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url.includes('cdn.jsdelivr.net/npm/@supabase/'))return route.fulfill({contentType:'text/javascript',body:`(${mockBackend.toString()})();`});
      if(!url.startsWith('http://127.0.0.1:'))return route.abort();
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
    const settled=()=>page.waitForFunction(()=>document.querySelector('#adminRealtimeStatus')?.textContent==='Actualizaciones automáticas conectadas.');
    await settled();assert.deepEqual(errors,[]);
    const originalReads=await page.evaluate(()=>({...testBackend.reads}));
    await page.evaluate(()=>{testBackend.tables.product[0].name='Camiseta remota';testBackend.tables.product[0].stock=8;for(let i=0;i<8;i++)testBackend.emit('product');});
    await page.waitForFunction(()=>window.adminCatalog.products()[0].name==='Camiseta remota');await settled();
    assert.equal(await page.evaluate(()=>testBackend.reads.product),originalReads.product+1);
    // An open catalog editor must keep its draft, including a response already in flight.
    await page.click('[data-view="products"]');
    await page.click('[data-edit-product]');
    await page.fill('#editorForm [name="name"]','Mi borrador');
    await page.evaluate(()=>{testBackend.tables.product[0].name='Segunda versión';testBackend.emit('product');});
    await page.waitForTimeout(700);
    assert.equal(await page.inputValue('#editorForm [name="name"]'),'Mi borrador');
    assert.equal(await page.evaluate(()=>adminCatalog.products()[0].name),'Camiseta remota');
    await page.click('#cancelEditor');
    await page.waitForFunction(()=>adminCatalog.products()[0].name==='Segunda versión');await settled();
    await page.evaluate(()=>{testBackend.hold='product';testBackend.tables.product[0].name='Respuesta tardía';testBackend.emit('product');});
    await page.waitForFunction(()=>Boolean(testBackend.release));
    await page.click('[data-edit-product]');await page.fill('#editorForm [name="name"]','Otro borrador');
    await page.evaluate(()=>{testBackend.hold=null;testBackend.release();testBackend.release=null;});
    await page.waitForTimeout(100);
    assert.equal(await page.inputValue('#editorForm [name="name"]'),'Otro borrador');
    assert.equal(await page.evaluate(()=>adminCatalog.products()[0].name),'Segunda versión');
    await page.click('#cancelEditor');await settled();

    // Filter, expanded order and note are retained on a remote status update.
    await page.click('[data-view="orders"]');
    await page.fill('#ordersSearch','Ana');
    await page.locator('[data-order-detail] summary').click();
    await page.locator('[data-order-note]').fill('Nota sin guardar');
    await page.evaluate(()=>{testBackend.tables.shop_order[0].status='confirmed';testBackend.emit('shop_order');});
    await page.waitForTimeout(700);
    assert.equal(await page.inputValue('[data-order-note]'),'Nota sin guardar');
    await page.click('#viewTitle');await settled();
    assert.equal(await page.inputValue('#ordersSearch'),'Ana');
    assert.equal(await page.inputValue('[data-order-note]'),'Nota sin guardar');
    assert.equal(await page.locator('[data-order-detail]').evaluate(el=>el.open),true);
    assert.match(await page.textContent('#ordersList'),/Confirmado/);
    await page.evaluate(()=>{testBackend.tables.shop_order=[];testBackend.emit('shop_order','DELETE');});
    await page.waitForFunction(()=>adminOrders.totalCount()===0);await settled();

    // One snapshot refresh updates finance and keeps the chosen date range/export.
    await page.click('[data-view="accounting"]');
    await page.selectOption('#cashExportEntity','receipts');
    await page.click('#viewTitle');
    const financeBefore=await page.evaluate(()=>testBackend.rpcs.finance_snapshot);
    await page.evaluate(()=>{testBackend.balance=25000;testBackend.emit('receipt');testBackend.emit('ledger_entry');});
    await settled();await page.waitForFunction(()=>document.querySelector('#cashRoot').textContent.includes('250.00'));
    assert.equal(await page.evaluate(()=>testBackend.rpcs.finance_snapshot),financeBefore+1);
    assert.equal(await page.inputValue('#cashExportEntity'),'receipts');
    await page.evaluate(()=>{adminIdentity.role='partner_finance';testBackend.tables.app_user[0].role='partner_finance';});
    await page.click('[data-cash-tab="accounts"]');
    await page.click('[data-cash-action="account"]');
    await page.fill('.cash-dialog [name="name"]','Caja borrador');
    await page.evaluate(()=>testBackend.emit('money_account'));
    await page.waitForTimeout(600);assert.equal(await page.inputValue('.cash-dialog [name="name"]'),'Caja borrador');
    await page.locator('.cash-dialog [data-close]').first().click();await settled();

    // A deleted selection must fall back to an existing account, then to empty.
    await page.evaluate(()=>{
      testBackend.snapshot.accounts=['a1','a2'].map((id,index)=>({id,name:'Cuenta '+(index+1),account_type:'cash',bank_name:'',reference_last4:'',currency:'GTQ',opening_balance_cents:0,opened_on:'2026-11-01',created_at:'2026-11-01T12:00:00Z'}));
      testBackend.emit('money_account','INSERT');
    });
    await page.waitForFunction(()=>document.querySelector('#cashRoot').textContent.includes('Libro de Cuenta 1'));
    await page.evaluate(()=>{testBackend.snapshot.accounts.shift();testBackend.emit('money_account','DELETE');});
    await page.waitForFunction(()=>document.querySelector('#cashRoot').textContent.includes('Libro de Cuenta 2'),{},{timeout:5000});
    await page.evaluate(()=>{testBackend.snapshot.accounts=[];testBackend.emit('money_account','DELETE');});
    await page.waitForFunction(()=>!document.querySelector('#cashRoot').textContent.includes('Libro de Cuenta'),{},{timeout:5000});await settled();

    // Excluded tables are never queried in response to Realtime.
    await page.evaluate(()=>{testBackend.emit('content_block');testBackend.emit('store_setting');testBackend.emit('payment_method');});
    await page.waitForTimeout(500);
    const finalReads=await page.evaluate(()=>testBackend.reads);
    for(const table of ['content_block','content_video','store_setting','payment_method'])assert.equal(finalReads[table],originalReads[table]);
    await page.evaluate(()=>testBackend.channels.at(-1).status('CHANNEL_ERROR'));
    await page.waitForFunction(()=>testBackend.channels.length===2);await settled();
    await page.click('#logoutButton');
    assert.equal(await page.evaluate(()=>testBackend.channels.every(ch=>ch.removed)),true);
    assert.equal(await page.locator('#adminApp').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('Browser integration OK: routing, drafts, late responses, order filters/notes/details, DELETE, shared finance snapshot, excluded modules, reconnect and logout.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
