const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const server=await chromium.launchServer({channel:'msedge',headless:true});
 const browser=await chromium.connect(server.wsEndpoint());
 try {
  const page=await browser.newPage();const errors=[];
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message);});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./catalog-fixture.cjs')});
   if(u.origin!=='https://catalog.example')return route.abort();
   if(u.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
   try{await route.fulfill({body:await fs.readFile(path.join(__dirname,'..',u.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(u.pathname)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://catalog.example/admin.html');
  async function login(email){await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill('test');await page.locator('.login-submit').click();await page.waitForFunction(()=>document.querySelector('#catalogLoadStatus').textContent.includes('Catálogo:'));}
  await login('ops@example.com');
  await page.locator('[data-view="products"]').click();
  assert.match(await page.locator('#productTableBody').textContent(),/Camiseta remota/);
  await page.locator('[data-edit-product="remote-shirt"]').click();
  assert.equal(await page.locator('[name="price"]').inputValue(),'299.5');
  assert.equal(await page.locator('[name="variants"]').inputValue(),'S, M');
  await page.locator('[name="name"]').fill('Producto editado');
  await page.evaluate(()=>window.catalogSaveFailure=true);
  await page.locator('#editorForm [type="submit"]').click();
  await page.locator('#editorMessage').waitFor({state:'visible'});
  assert.equal(await page.locator('[name="name"]').inputValue(),'Producto editado');
  assert.match(await page.locator('#productTableBody').textContent(),/Camiseta remota/);
  await page.evaluate(()=>window.catalogSaveFailure=false);
  await page.locator('#editorForm [type="submit"]').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#productTableBody').textContent.includes('Producto editado'));
  assert.equal(await page.evaluate(()=>window.catalogWrites.at(-1).args.p_product.price_cents),29950);
  await page.locator('#addProductButton').click();
  await page.locator('[name="id"]').fill('new-shirt');await page.locator('[name="name"]').fill('Producto creado');
  await page.locator('[name="category"]').selectOption('tshirts');
  await page.evaluate(()=>document.querySelector('[name="image"]').value='https://example.supabase.co/storage/v1/object/public/dtshop-products/ops/new.webp');
  await page.locator('#editorForm [type="submit"]').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.adminCatalog.products().length===2);
  await page.evaluate(()=>document.querySelector('#profileForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('dirtytask-admin-data')));
  assert.equal(Object.hasOwn(stored,'products'),false);
  assert.equal(Object.hasOwn(stored,'launches'),false);
  await page.locator('[data-view="drops"]').click();
  await page.locator('[data-edit-drop="remote-drop"]').click();
  assert.equal(await page.locator('input[name="productIds"][value="remote-shirt"]').isChecked(),true);
  await page.locator('[name="name"]').fill('Drop editado');
  await page.locator('#editorForm [type="submit"]').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#dropAdminList').textContent.includes('Drop editado'));
  await page.locator('[data-edit-drop="remote-drop"]').click();await page.locator('#deleteEntryButton').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.adminCatalog.launches()[0].status==='closed');
  await page.locator('[data-view="products"]').click();
  await page.locator('[data-edit-product="remote-shirt"]').click();await page.locator('#deleteEntryButton').click();
  await page.locator('#editorDialog').waitFor({state:'hidden'});
  await page.waitForFunction(()=>window.adminCatalog.products().find(p=>p.id==='remote-shirt').status==='archived');
  await page.evaluate(()=>window.catalogFailure=true);await page.locator('#refreshCatalog').click();
  await page.waitForFunction(()=>document.querySelector('#catalogLoadStatus').textContent.includes('No se pudo'));
  assert.equal(await page.locator('#addProductButton').isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.adminCatalog.products().length),2);
  await page.evaluate(()=>{window.catalogFailure=false;window.catalogRows={product:[],launch:[]};});
  await page.locator('#refreshCatalog').click();
  await page.waitForFunction(()=>document.querySelector('#catalogLoadStatus').textContent.includes('0 productos'));
  assert.equal(await page.evaluate(()=>window.adminCatalog.products().length),0);
  await page.evaluate(()=>{window.catalogDelay=150;});
  await page.locator('#refreshCatalog').click();await page.locator('#logoutButton').click();
  await page.locator('#loginScreen').waitFor({state:'visible'});
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.adminCatalog.products().length),0);
  await page.evaluate(()=>window.catalogDelay=0);
  await login('finance@example.com');
  await page.locator('[data-view="products"]').click();
  assert.equal(await page.locator('#addProductButton').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS remote catalog display, create/edit/archive, relationships, failed writes, retry, empty data, logout race and finance read-only');
 } finally {
  for(const context of browser.contexts()) await context.close();
  // Edge can leave its driver waiting after the isolated browser has exited on Windows.
  await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);
 }
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
