const {chromium}=require('playwright');const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const server=await chromium.launchServer({channel:'msedge',headless:true});const browser=await chromium.connect(server.wsEndpoint());
 try{
  const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./catalog-fixture.cjs')});
   if(url.hostname==='example.supabase.co'&&url.pathname.includes('/storage/'))return route.fulfill({body:await fs.readFile(path.join(__dirname,'../assets/look-daylight.jpg')),contentType:'image/jpeg'});
   if(url.origin!=='https://banner.example')return route.abort();
   if(url.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
   try{await route.fulfill({body:await fs.readFile(path.join(__dirname,'..',url.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'})[path.extname(url.pathname)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  await page.goto('https://banner.example/admin.html');
  await page.locator('#loginEmail').fill('ops@example.com');await page.locator('#loginPassword').fill('test');await page.locator('.login-submit').click();
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Datos cargados'));
  await page.locator('[data-view="content"]').click();
  assert.equal(await page.locator('.auth-data-notice').count(),0);
  assert.equal(await page.locator('#contentLoadStatus').evaluate(el=>getComputedStyle(el).position),'absolute');
  await page.evaluate(()=>{window.originalBitmap=window.createImageBitmap.bind(window);window.createImageBitmap=async file=>{await new Promise(resolve=>setTimeout(resolve,150));return window.originalBitmap(file)}});
  await page.locator('#heroBannerInput').setInputFiles(path.join(__dirname,'../assets/look-daylight.jpg'));
  await page.locator('#resetHeroBanner').click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#saveContentButton').isDisabled(),false,'Reset during decoding must unlock save');
  assert.match(await page.locator('#heroBannerPreview').getAttribute('src'),/campaign-city.jpg$/);
  await page.evaluate(()=>window.createImageBitmap=window.originalBitmap);
  await page.locator('#heroBannerInput').setInputFiles(path.join(__dirname,'../assets/look-daylight.jpg'));
  await page.waitForFunction(()=>document.querySelector('#heroBannerStatus').textContent.includes('Imagen seleccionada'));
  assert.match(await page.locator('#heroBannerPreview').getAttribute('src'),/^blob:/);
  if(process.env.DT_UI_SCREENSHOTS_DIR){await fs.mkdir(process.env.DT_UI_SCREENSHOTS_DIR,{recursive:true});await page.locator('#view-content').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'banner-editor.png')});}
  await page.evaluate(()=>window.storeSaveFailure=true);await page.locator('#saveContentButton').click();
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').dataset.state==='error');
  assert.equal(await page.locator('#contentLoadStatus').isVisible(),true);
  await page.evaluate(()=>window.storeSaveFailure=false);await page.locator('#saveContentButton').click();
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Cambios guardados'));
  const key=await page.evaluate(()=>window.storeRows.content_block[0].hero_image_key);
  assert.match(key,/^ops@example.com\/banner\/.+\.jpg$/);assert.equal(await page.evaluate(()=>window.testUploads.length),1,'Retry after RPC failure should reuse the uploaded file');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Datos cargados'));
  await page.locator('[data-view="content"]').click();assert.match(await page.locator('#heroBannerPreview').getAttribute('src'),/\/banner\//);
  await page.goto('https://banner.example/index.html');await page.waitForFunction(()=>document.querySelector('.hero-image').src.includes('/banner/'));
  await page.goto('https://banner.example/admin.html');await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Datos cargados'));
  await page.locator('[data-view="content"]').click();await page.locator('#resetHeroBanner').click();await page.locator('#saveContentButton').click();
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Cambios guardados'));
  assert.equal(await page.evaluate(()=>window.storeRows.content_block[0].hero_image_key),null);
  await page.goto('https://banner.example/index.html');await page.waitForFunction(()=>document.querySelector('#resultCount').textContent.includes('pieza'));
  assert.match(await page.locator('.hero-image').getAttribute('src'),/campaign-city.jpg$/);
  assert.deepEqual(errors,[]);
  console.log('PASS banner file preview, upload, failed-save retry without duplicate uploads, persistence, public rendering and original-image reset');
 }finally{for(const context of browser.contexts())await context.close();await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1)});
