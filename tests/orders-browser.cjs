const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const server=await chromium.launchServer({channel:'msedge',headless:true});const browser=await chromium.connect(server.wsEndpoint());
 try {
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./orders-fixture.cjs')});
   if(u.origin!=='https://orders.example')return route.abort();
   if(u.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
   try{await route.fulfill({body:await fs.readFile(path.join(__dirname,'..',u.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(u.pathname)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://orders.example/index.html');await page.waitForFunction(()=>document.querySelector('#resultCount').textContent==='1 pieza');
  await page.evaluate(()=>{
   const line={id:'remote-shirt',size:'M',variantId:'v-m',qty:1};localStorage.setItem('dirtytask-cart',JSON.stringify([line]));sessionStorage.setItem('dirtytask-checkout-order',JSON.stringify([line]));
  });
  await page.goto('https://orders.example/checkout.html');
  await page.waitForFunction(()=>document.querySelector('#checkoutLoadStatus').textContent.includes('Precios y envío consultados'));
  for(const [id,value] of Object.entries({firstName:'Ana <b>',lastName:'Pérez',streetAddress:'Calle 1',neighborhood:'Zona 1',municipality:'Guatemala',phone:'55555555'}))await page.locator('#'+id).fill(value);
  await page.locator('#department').selectOption('Guatemala');await page.locator('[value="visa_installments"]').check();
  await page.locator('#installmentCount').selectOption('6');
  await page.evaluate(()=>window.guestDisabled=true);await page.locator('.place-order-button').click();
  await page.waitForFunction(()=>document.querySelector('#checkoutStatus').textContent.includes('No se pudo confirmar'));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('dirtytask-checkout-attempt')),null,'Failed identity setup must not leave an unresolvable attempt');
  assert.equal(await page.locator('#firstName').inputValue(),'Ana <b>');
  await page.locator('#retryCheckout').click();
  await page.waitForFunction(()=>document.querySelector('#retryCheckout').hidden);
  assert.equal(await page.locator('#firstName').inputValue(),'Ana <b>','Refreshing the quote must preserve personal details');
  assert.equal(await page.locator('#department').inputValue(),'Guatemala');assert.equal(await page.locator('#installmentCount').inputValue(),'6');
  assert.equal(await page.locator('#checkoutItems .checkout-item').count(),1);
  await page.evaluate(()=>{window.guestDisabled=false;window.orderSubmitDelay=100;window.orderResponseLost=true;});
  await page.locator('.place-order-button').click();await page.evaluate(()=>document.querySelector('#billingForm').dispatchEvent(new Event('submit',{cancelable:true})));
  await page.locator('#orderConfirmation').waitFor({state:'visible'});
  assert.match(await page.locator('.receipt-payment').textContent(),/Visa cuotas.*6 cuotas/);
  assert.match(await page.locator('.receipt-next').textContent(),/enviaremos el enlace/);
  assert.equal(await page.locator('.receipt-table tbody tr').count(),1);
  assert.match(await page.locator('.receipt-table').textContent(),/Camiseta remota/);
  assert.equal(await page.locator('#orderConfirmation b').count(),0,'Customer details are rendered as text');
  assert.doesNotMatch(await page.locator('#orderConfirmation').textContent(),/Contactar a Dirtytask/);
  for(const width of [390,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(process.env.DT_UI_SCREENSHOTS_DIR){await fs.mkdir(process.env.DT_UI_SCREENSHOTS_DIR,{recursive:true});await page.locator('#orderConfirmation').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'receipt-'+width+'.png')});}}
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.receipt-actions').isVisible(),false);await page.emulateMedia({media:'screen'});
  const orderId=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-orders-backend')).rows[0].id);
  assert.equal(await page.locator('.receipt-reference').textContent(),orderId.replace(/-/g,'').slice(-12));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-orders-backend')).rows.length),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-orders-backend')).rows[0].installment_count),6);
  assert.equal(await page.evaluate(()=>window.orderCalls.filter(call=>call.name==='submit_shop_order').length),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dirtytask-cart')).length),0);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('dirtytask-checkout-attempt')),null);
  assert.equal(new URL(page.url()).search,'');
  await page.evaluate(()=>localStorage.setItem('dirtytask-cart',JSON.stringify([{id:'remote-shirt',size:'M',qty:2}])));
  await page.reload();await page.locator('#orderConfirmation').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dirtytask-cart'))[0].qty),2,'Reloading a receipt must not clear newly added units');
  // Receipt messages are read from the saved backend order, also after reload.
  for(const method of ['cash','visalink']){
   await page.evaluate(method=>{const db=JSON.parse(localStorage.getItem('test-orders-backend'));db.rows[0].payment_method_code=method;db.rows[0].installment_count=null;localStorage.setItem('test-orders-backend',JSON.stringify(db));},method);
   await page.reload();await page.locator('#orderConfirmation').waitFor({state:'visible'});
   assert.match(await page.locator('.receipt-next').textContent(),method==='cash'?/Paga al recibir.*cancelar el total/s:/tarjeta de crédito/);
   assert.equal(await page.locator('.receipt-table tbody tr').count(),1);
   if(process.env.DT_UI_SCREENSHOTS_DIR)for(const width of [390,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#orderConfirmation').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'receipt-'+method+'-'+width+'.png')});}
  }
  await page.goto('https://orders.example/admin.html');
  async function login(email){await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill('test');await page.locator('.login-submit').click();await page.waitForFunction(()=>document.querySelector('#ordersLoadStatus').textContent.includes('Pedidos cargados'));}
  await login('ops@example.com');await page.locator('[data-view="orders"]').click();
  assert.equal(await page.locator('#ordersPending').textContent(),'1');assert.equal(await page.locator('#metricOrders').textContent(),'1');
  assert.match(await page.locator('#ordersList').textContent(),/Ana <b> Pérez/);assert.equal(await page.locator('#ordersList b').count(),0);
  await page.locator('#ordersList summary').click();assert.match(await page.locator('#ordersList').textContent(),/Calle 1/);
  assert.equal(await page.locator('.auth-data-notice').count(),0);
  if(process.env.DT_UI_SCREENSHOTS_DIR){await fs.mkdir(process.env.DT_UI_SCREENSHOTS_DIR,{recursive:true});await page.locator('#view-orders').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'orders-desktop.png')});await page.setViewportSize({width:390,height:900});await page.locator('#view-orders').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'orders-mobile.png')});await page.setViewportSize({width:1280,height:900});}
  await page.locator('#ordersSearch').fill('sin coincidencias');assert.equal(await page.locator('.order-card').count(),0);await page.locator('#ordersSearch').fill('');
  if(!await page.locator('[data-order-note]').isVisible())await page.locator('#ordersList summary').click();
  await page.locator('[data-order-note]').fill('Nota <b>confirmada</b>');
  await page.evaluate(()=>window.orderTransitionFailure=true);await page.locator('[data-next-status="confirmed"]').click();
  await page.waitForFunction(()=>document.querySelector('#ordersLoadStatus').textContent.includes('No se pudo confirmar'));
  assert.equal(await page.locator('[data-next-status="confirmed"]').isDisabled(),true);
  await page.evaluate(()=>window.orderTransitionFailure=false);await page.locator('#refreshOrders').click();
  await page.waitForFunction(()=>!document.querySelector('[data-next-status="confirmed"]').disabled);
  await page.locator('[data-order-note]').fill('Confirmado');await page.locator('[data-next-status="confirmed"]').click();
  await page.waitForFunction(()=>!!document.querySelector('[data-next-status="preparing"]'));
  assert.equal(await page.locator('#ordersPending').textContent(),'0');assert.equal(await page.locator('#metricOrders').textContent(),'1');
  await page.locator('#logoutButton').click();await login('finance@example.com');await page.locator('[data-view="orders"]').click();
  assert.equal(await page.locator('[data-next-status="preparing"]').isDisabled(),true);
  const financeActions=await page.evaluate(()=>window.orderCalls.filter(call=>call.name==='transition_shop_order').length);
  await page.evaluate(()=>document.querySelector('[data-next-status="preparing"]').dispatchEvent(new Event('click',{bubbles:true})));
  assert.equal(await page.evaluate(()=>window.orderCalls.filter(call=>call.name==='transition_shop_order').length),financeActions);
  await page.locator('#logoutButton').click();await login('ops@example.com');await page.locator('[data-view="orders"]').click();
  await page.locator('#ordersList summary').click();
  await page.locator('[data-next-status="preparing"]').click();await page.waitForFunction(()=>!!document.querySelector('[data-next-status="shipped"]'));
  assert.equal(await page.locator('#ordersPreparing').textContent(),'1');
  await page.locator('[data-next-status="cancelled"]').click();assert.equal(await page.locator('[data-confirm-cancel]').isVisible(),true);await page.locator('[data-confirm-cancel]').click();await page.waitForFunction(()=>document.querySelector('#ordersLoadStatus').textContent.includes('Pedidos cargados')&&!document.querySelector('[data-next-status]'));
  assert.match(await page.locator('#ordersList').textContent(),/Cancelado/);
  await page.locator('#ordersStatusFilter').selectOption('pending');assert.equal(await page.locator('.order-card').count(),0);
  await page.locator('#ordersStatusFilter').selectOption('all');
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.evaluate(()=>window.ordersDelay=200);await page.locator('#refreshOrders').click();await page.locator('#logoutButton').click();await page.waitForTimeout(300);
  assert.equal(await page.locator('.order-card').count(),0);assert.equal(await page.locator('#metricOrders').textContent(),'0');
  await page.evaluate(()=>window.ordersDelay=0);await login('finance@example.com');await page.locator('[data-view="orders"]').click();
  assert.equal(await page.locator('.order-card').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS guest setup failure, lost-response recovery, duplicate submit, receipt reload, bag cleanup, admin details/statuses/errors, stock refresh, logout race and responsive orders');
 }finally{for(const context of browser.contexts())await context.close();await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);}
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
