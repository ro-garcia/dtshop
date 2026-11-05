const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage();
 let configured=false;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='cdn.jsdelivr.net') return route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient(){return {
 auth:{async getSession(){return {data:{session:JSON.parse(localStorage.getItem('test-session'))}}},async getUser(){return {data:{user:JSON.parse(localStorage.getItem('test-session'))?.user}}},
 async signInWithPassword({email,password}){if(password!=='correct')return {error:{code:'invalid_credentials'}};localStorage.setItem('test-session',JSON.stringify({user:{id:email,email}}));return {data:{}}},
 async signOut(){localStorage.removeItem('test-session');return {error:null}},onAuthStateChange(fn){window.testAuthEvent=fn;return {data:{subscription:{unsubscribe(){}}}}}},
 schema(){return {from(){return {select(){return {eq(k,id){return {async single(){return {data:{id,display_name:id,role:id.startsWith('customer')?'customer':id.startsWith('finance')?'partner_finance':'partner_ops',is_active:!id.startsWith('inactive')}}}}}}}}}}}
 }}};`});
  if(url.origin!=='https://auth-test.example')return route.abort();
  if(url.pathname==='/supabase-config.js'&&configured)return route.fulfill({contentType:'text/javascript',body:`window.DIRTYTASK_SUPABASE={url:'https://example.supabase.co',publishableKey:'sb_publishable_test'};`});
  try {return route.fulfill({body:await fs.readFile(path.join(__dirname,'..',url.pathname)),contentType:({'.js':'text/javascript','.html':'text/html','.css':'text/css'})[path.extname(url.pathname)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:''});}
 });
 await page.goto('https://auth-test.example/admin.html');
 await page.waitForTimeout(100);
 assert.equal(await page.locator('.login-submit').isDisabled(),true,'Missing config must disable login');
 configured=true;
 await page.reload();
 async function login(email,password='correct') {await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill(password);await page.locator('.login-submit').click();}
 await login('ops@example.com','bad');
 await page.waitForFunction(()=>!document.querySelector('#loginError').hidden);
 assert.equal(await page.locator('#adminApp').isVisible(),false);
 for(const email of ['customer@example.com','inactive@example.com']) {await login(email);await page.waitForTimeout(100);assert.equal(await page.locator('#adminApp').isVisible(),false);}
 await login('ops@example.com');await page.locator('#adminApp').waitFor({state:'visible'});
 await page.reload();await page.locator('#adminApp').waitFor({state:'visible'});
 await page.locator('[data-view="products"]').click();
 await page.locator('#addProductButton').click();
 await page.locator('#editorFields input[name="name"]').fill('Conservar borrador');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(100);
 assert.equal(await page.locator('#editorDialog').isVisible(),true);
 assert.equal(await page.locator('#editorFields input[name="name"]').inputValue(),'Conservar borrador');
 await page.locator('#cancelEditor').click();
 await page.locator('#logoutButton').click();await page.locator('#loginScreen').waitFor({state:'visible'});
 await login('finance@example.com');await page.locator('#adminApp').waitFor({state:'visible'});
 await page.locator('[data-view="products"]').click();
 assert.equal(await page.locator('#addProductButton').isDisabled(),true);
 await page.locator('[data-view="content"]').click();
 assert.equal(await page.locator('#addVideoButton').isDisabled(),true);
 assert.equal(await page.locator('#videoList input').first().isDisabled(),true);
 await page.evaluate(()=>window.testAuthEvent('SIGNED_OUT',null));
 await page.locator('#loginScreen').waitFor({state:'visible'});
 console.log('PASS configuration, rejected login, denied profiles, partner login, reload, logout, role controls, session expiry');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
