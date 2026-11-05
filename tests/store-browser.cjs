const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const server=await chromium.launchServer({channel:'msedge',headless:true});
 const browser=await chromium.connect(server.wsEndpoint());
 try {
  const page=await browser.newPage();const errors=[];page.setDefaultTimeout(10000);
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./catalog-fixture.cjs')});
   if(u.origin!=='https://store.example')return route.abort();
   if(u.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
   try{await route.fulfill({body:await fs.readFile(path.join(__dirname,'..',u.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(u.pathname)]||'application/octet-stream'});}catch{await route.fulfill({status:404,body:''});}
  });
  const loaded=()=>page.waitForFunction(()=>['content','settings'].every(area=>document.querySelector('#'+area+'LoadStatus').textContent.includes('Datos cargados')));
  async function login(email){await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill('test');await page.locator('.login-submit').click();await loaded();}
  const writes=()=>page.evaluate(()=>window.catalogWrites.filter(w=>w.name.startsWith('save_store_')).length);
  await page.goto('https://store.example/admin.html');await login('ops@example.com');
  await page.locator('[data-view="content"]').click();
  assert.equal(await page.locator('[name="heroCopy"]').inputValue(),'Texto desde Supabase');
  assert.equal(await page.locator('[data-video-index]').count(),1);
  await page.locator('[name="heroCopy"]').fill('Mensaje persistente');
  await page.locator('[data-remove-video]').click();
  await page.evaluate(()=>window.storeSaveFailure=true);await page.locator('#saveContentButton').click();
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Guardado rechazado'));
  assert.equal(await page.locator('[name="heroCopy"]').inputValue(),'Mensaje persistente');
  assert.equal(await page.locator('[data-video-index]').count(),0);
  await page.evaluate(()=>window.storeSaveFailure=false);await page.locator('#saveContentButton').click();
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Cambios guardados'));
  await page.reload();await loaded();await page.locator('[data-view="content"]').click();
  assert.equal(await page.locator('[name="heroCopy"]').inputValue(),'Mensaje persistente');
  assert.equal(await page.locator('[data-video-index]').count(),0,'An empty remote feed must not restore sample videos');
  await page.locator('#addVideoButton').click();await page.locator('[data-video-index]').fill('bad-url');
  const before=await writes();await page.locator('#saveContentButton').click();
  assert.equal(await writes(),before);
  await page.locator('[data-video-index]').fill('https://www.tiktok.com/@dirtytask/video/7326274171879591173');
  await page.evaluate(()=>{window.storeSaveDelay=150;document.querySelector('#saveContentButton').click();document.querySelector('#saveContentButton').dispatchEvent(new Event('click'));});
  await page.waitForFunction(()=>document.querySelector('#contentLoadStatus').textContent.includes('Cambios guardados'));
  assert.equal(await writes(),before+1,'Double submission must not duplicate writes');
  await page.evaluate(()=>window.storeSaveDelay=0);
  await page.locator('[data-view="settings"]').click();
  assert.equal(await page.locator('[name="shippingGuatemala"]').inputValue(),'25.5');
  assert.equal(await page.locator('[name="visaInstallments"]').isChecked(),false);
  await page.locator('[name="shippingGuatemala"]').fill('30.25');await page.locator('[name="shippingOther"]').fill('40.75');
  await page.locator('[name="cash"]').uncheck();await page.locator('[name="visalink"]').uncheck();
  await page.locator('#saveSettingsButton').click();assert.equal(await writes(),before+1);
  assert.equal(await page.locator('[name="shippingGuatemala"]').inputValue(),'30.25');
  await page.locator('[name="visaInstallments"]').check();await page.locator('#saveSettingsButton').click();
  await page.waitForFunction(()=>document.querySelector('#settingsLoadStatus').textContent.includes('Cambios guardados'));
  assert.equal(await page.evaluate(()=>window.storeRows.store_setting[0].shipping_guatemala_cents),3025);
  await page.reload();await loaded();await page.locator('[data-view="settings"]').click();
  assert.equal(await page.locator('[name="shippingOther"]').inputValue(),'40.75');
  assert.equal(await page.locator('[name="cash"]').isChecked(),false);
  await page.evaluate(()=>window.storeFailure=true);await page.locator('#refreshSettings').click();
  await page.waitForFunction(()=>document.querySelector('#settingsLoadStatus').textContent.includes('No se pudo actualizar'));
  assert.equal(await page.locator('#saveSettingsButton').isDisabled(),true);
  assert.equal(await page.locator('[name="shippingOther"]').inputValue(),'40.75');
  await page.evaluate(()=>window.storeFailure=false);await page.locator('#refreshSettings').click();await loaded();
  await page.locator('[data-view="content"]').click();
  await page.evaluate(()=>window.storeDelay=200);await page.locator('#refreshContent').click();await page.locator('#logoutButton').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[name="heroCopy"]').inputValue(),'','Discard responses from the previous session');
  await page.evaluate(()=>window.storeDelay=0);await login('finance@example.com');
  await page.locator('[data-view="content"]').click();assert.equal(await page.locator('#saveContentButton').isDisabled(),true);
  assert.equal(await page.locator('[data-video-index]').isDisabled(),true);
  const financeWrites=await writes();await page.evaluate(()=>document.querySelector('#contentForm').dispatchEvent(new Event('submit',{cancelable:true})));
  assert.equal(await writes(),financeWrites);
  await page.locator('[data-view="settings"]').click();assert.equal(await page.locator('#saveSettingsButton').isDisabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS remote content/settings, empty videos, validation, decimals, reload persistence, failed reads/writes, duplicate submit, session race and finance controls');
 } finally {
  for(const context of browser.contexts())await context.close();
  await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);
 }
})().then(()=>process.exit(0),e=>{console.error(e);process.exit(1);});
