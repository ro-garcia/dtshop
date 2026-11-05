const {chromium}=require('playwright');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{
 const server=await chromium.launchServer({channel:'msedge',headless:true});
 const browser=await chromium.connect(server.wsEndpoint());
 try {
 const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./catalog-fixture.cjs')});
 if(u.origin!=='https://categories.example')return route.abort();
 if(u.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
 try{await route.fulfill({body:await fs.readFile(path.join(__dirname,'..',u.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(u.pathname)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
 });
 await page.goto('https://categories.example/admin.html');
 await page.locator('#loginEmail').fill('ops@example.com');await page.locator('#loginPassword').fill('test');await page.locator('.login-submit').click();
 await page.locator('#adminApp').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.querySelector('#catalogLoadStatus').textContent.includes('Supabase:'));
 await page.locator('[data-view="products"]').click();await page.locator('#addProductButton').click();
 const select=page.locator('[name="category"]');
 assert.match(await select.textContent(),/Camisetas desde Supabase/);
 await page.locator('[name="name"]').fill('Borrador conservado');
 await page.evaluate(()=>window.categoryResponse={data:null,error:{message:'network'}});
 await page.locator('#retryCategories').click();await page.waitForFunction(()=>document.querySelector('#categoryStatus').textContent.includes('No se pudieron'));
 assert.equal(await select.isDisabled(),true);
 await page.evaluate(()=>window.categoryResponse={data:[],error:null});await page.locator('#retryCategories').click();
 await page.waitForFunction(()=>document.querySelector('#categoryStatus').textContent.includes('No hay categorías'));
 await page.evaluate(()=>window.categoryResponse={data:[{code:'custom',label:'Categoría nueva',sort_order:1}],error:null});await page.locator('#retryCategories').click();
 await page.waitForFunction(()=>document.querySelector('[name="category"]').textContent.includes('Categoría nueva'));
 await select.selectOption('custom');
 assert.equal(await page.locator('[name="name"]').inputValue(),'Borrador conservado');
 assert.deepEqual(errors,[]);
 console.log('PASS remote category selector, failure, empty result, retry, new category and preserved draft');
 }finally{for(const context of browser.contexts())await context.close();await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);}
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
