const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const server=await chromium.launchServer({channel:'msedge',headless:true});const browser=await chromium.connect(server.wsEndpoint());
 try{
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  let fail=false,empty=false,changedStock=false;
  let releaseApp;const appGate=new Promise(resolve=>{releaseApp=resolve});
  const extra=String.raw`
  window.catalogRows.product[0].stock=2;
  const first=structuredClone(window.catalogRows.product[0]);
  window.catalogRows.product.push({...first,id:'hoodie',name:'Hoodie remoto',category_code:'custom',price_cents:40025},
    {...first,id:'sold-out',name:'Sin stock',stock:0},{...first,id:'draft',name:'Borrador privado',status:'draft'},
    {...first,id:'archived',name:'Archivado privado',status:'archived'},
    {...first,id:'preorder',name:'Preventa remota',published:false,preorder:true,stock:0},
    {...first,id:'orphan',name:'Preventa oculta',published:false,preorder:true});
  window.catalogRows.launch[0].launch_product.push({product_id:'preorder',sort_order:1},{product_id:'draft',sort_order:2});
  window.categoryResponse={data:[{code:'tshirts',label:'Camisetas desde Supabase'},{code:'custom',label:'Categoría nueva'}],error:null};
  window.storeRows.content_video=[];
  const create=window.supabase.createClient;
  window.supabase.createClient=(...args)=>{window.publicClientOptions=args[2];return create(...args)};
  `;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./catalog-fixture.cjs')+extra+
    (fail?'window.catalogFailure=true;':'')+(empty?'window.catalogRows={product:[],launch:[]};':'')+(changedStock?'window.catalogRows.product[0].stock=0;':'')});
   if(url.hostname==='example.supabase.co'&&url.pathname.includes('/storage/'))return route.fulfill({contentType:'image/jpeg',body:await fs.readFile(path.join(__dirname,'../assets/graphic-tee.jpg'))});
   if(url.origin!=='https://public.example')return route.abort();
   if(url.pathname==='/app.js')await appGate;
   if(url.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
   try{await route.fulfill({body:await fs.readFile(path.join(__dirname,'..',url.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(url.pathname)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://public.example/index.html',{waitUntil:'commit'});
  await page.locator('.hero-copy').waitFor({state:'attached'});
  assert.equal(await page.locator('.hero-copy').textContent(),'','No old banner copy before backend content loads');
  assert.equal(await page.locator('.instagram-caption').textContent(),'','No old feed copy before backend content loads');
  releaseApp();
  await page.waitForFunction(()=>document.querySelector('#resultCount').textContent==='3 piezas');
  assert.equal(await page.locator('.product-card').count(),3);assert.equal(await page.locator('[data-product-id="draft"]').count(),0);
  assert.equal(await page.locator('[data-product-id="archived"]').count(),0);assert.equal(await page.locator('[data-product-id="orphan"]').count(),0);
  assert.equal(await page.locator('.hero-copy').textContent(),'Texto desde Supabase');assert.equal(await page.locator('.tiktok-embed-player').count(),0);
  assert.match(await page.locator('#publicContentStatus').textContent(),/no hay videos/);
  assert.equal(await page.evaluate(()=>window.publicClientOptions.auth.persistSession),false);
  assert.equal(await page.locator('#categoryGrid .category-card').count(),2);
  assert.equal(await page.evaluate(()=>document.querySelector('main').lastElementChild.id),'categorias','Categories sit immediately before the footer');
  assert.equal(await page.evaluate(()=>document.querySelector('main').nextElementSibling.matches('footer.site-footer')),true,'Footer remains outside the category section');
  await page.locator('#categoryGrid [data-category-link="custom"]').click();
  assert.equal(await page.locator('.product-card:visible').count(),1);
  assert.equal(await page.locator('[data-filter="custom"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#categoryGrid [data-category-link="custom"]').getAttribute('aria-current'),'true');
  assert.equal(new URL(page.url()).hash,'#coleccion');
  await page.locator('.category-heading [data-category-link="all"]').click();
  assert.equal(await page.locator('.product-card:visible').count(),3);
  if(process.env.DT_UI_SCREENSHOTS_DIR){await fs.mkdir(process.env.DT_UI_SCREENSHOTS_DIR,{recursive:true});await page.locator('#categorias').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'storefront-categories.png')});}
  await page.setViewportSize({width:390,height:900});
  if(process.env.DT_UI_SCREENSHOTS_DIR)await page.locator('#categorias').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'storefront-categories-mobile.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'The loaded mobile catalog must fit');
  await page.setViewportSize({width:1280,height:900});
  await page.locator('[data-filter="custom"]').click();assert.equal(await page.locator('.product-card:visible').count(),1);
  await page.locator('[data-filter="all"]').click();await page.locator('#productSearch').fill('Hoodie');assert.equal(await page.locator('.product-card:visible').count(),1);
  await page.locator('#productSearch').fill('');await page.locator('#sortSelect').selectOption('price-desc');
  assert.equal(await page.locator('#productGrid .product-card').first().getAttribute('data-product-id'),'hoodie');
  await page.locator('#productGrid [data-open-product="sold-out"]').first().click();assert.equal(await page.locator('[data-size-choice="S"]').isDisabled(),true);
  await page.locator('[data-close-product]').click();
  await page.locator('#productGrid [data-open-product="remote-shirt"]').first().click();await page.locator('[data-size-choice="S"]').click();await page.locator('#addToBag').click();
  await page.locator('#productGrid [data-open-product="remote-shirt"]').first().click();await page.locator('[data-size-choice="M"]').click();await page.locator('#addToBag').click();
  assert.equal(await page.locator('#bagCount').textContent(),'2');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#bagCount').textContent==='2');
  await page.locator('#openCart').click();await page.locator('[data-quantity="1"]').first().click();assert.equal(await page.locator('#bagCount').textContent(),'2');
  await page.locator('#checkoutButton').click();await page.waitForURL('**/checkout.html');
  await page.waitForFunction(()=>document.querySelector('#checkoutLoadStatus').textContent.includes('Precios y envío consultados'));
  assert.equal(await page.locator('#checkoutItems .checkout-item').count(),2);
  assert.equal(await page.locator('[name="paymentMethod"]').count(),2);assert.equal(await page.locator('[value="visa_installments"]').count(),0);
  await page.locator('#department').selectOption('Guatemala');assert.match(await page.locator('#orderShipping').textContent(),/25[.,]50/);
  assert.match(await page.locator('#orderTotal').textContent(),/624[.,]50/);
  await page.locator('#department').selectOption('Petén');assert.match(await page.locator('#orderTotal').textContent(),/634[.,]50/);
  // Tamper with stored prices and names: the summary must still come from Supabase.
  await page.evaluate(()=>{const lines=JSON.parse(sessionStorage.getItem('dirtytask-checkout-order'));lines.forEach(line=>{line.price=1;line.name='Precio falso';line.image='javascript:alert(1)'});sessionStorage.setItem('dirtytask-checkout-order',JSON.stringify(lines))});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#checkoutLoadStatus').textContent.includes('Precios y envío consultados'));
  assert.match(await page.locator('#orderSubtotal').textContent(),/599[.,]00/);assert.doesNotMatch(await page.locator('#checkoutItems').textContent(),/Precio falso/);
  assert.equal(await page.locator('.place-order-button').textContent(),'Enviar pedido');
  assert.equal(new URL(page.url()).search,'','Personal information must not appear in a GET query');
  assert.equal(await page.evaluate(()=>window.catalogWrites.length),0,'Reading the summary must not write orders');
  changedStock=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#checkoutLoadStatus').textContent.includes('Cambió la disponibilidad'));
  assert.equal(await page.locator('.place-order-button').isDisabled(),true);changedStock=false;
  fail=true;await page.goto('https://public.example/index.html');await page.waitForFunction(()=>document.querySelector('#resultCount').textContent.includes('no disponible'));
  assert.equal(await page.locator('#retryStorefront').count(),0);assert.equal(await page.locator('#openCart').isDisabled(),true);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dirtytask-cart')).length),2,'Failed reads must not erase a saved bag');
  fail=false;empty=true;await page.reload();await page.waitForFunction(()=>document.querySelector('#emptyTitle').textContent==='El catálogo está vacío.');
  assert.equal(await page.locator('.product-card').count(),0);assert.equal(await page.locator('#new-in').isVisible(),false);
  await page.locator('#openCart').click();assert.equal(await page.locator('#cartEmpty h3').textContent(),'La bolsa está vacía.');await page.locator('[data-close-cart]').click();
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  assert.deepEqual(errors,[]);
  console.log('PASS public catalog, private data exclusion, categories, search/sort, variants/stock, bag persistence, live checkout prices/rates/payments, tampering, failures and empty data');
 }finally{for(const context of browser.contexts())await context.close();await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);}
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)});
