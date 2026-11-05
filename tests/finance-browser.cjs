// Browser UI backed by real PostgreSQL RPCs in PGlite; no hosted project is modified.
const {chromium}=require('playwright');const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const fs=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
(async()=>{
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets,name text,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated,service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated;`);
 for(const file of ['supabase.sql','finance-integration.sql'])await db.exec(await fs.readFile(path.join(__dirname,'../sql',file),'utf8'));
 const ops=randomUUID(),finance=randomUUID();
 for(const [id,role] of [[ops,'partner_ops'],[finance,'partner_finance']]){await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);await db.query('UPDATE dtshop.app_user SET role=$1,display_name=$1 WHERE id=$2',[role,id]);}
 const actors={'ops@example.com':{id:ops,role:'partner_ops'},'finance@example.com':{id:finance,role:'partner_finance'}};
 let sqlQueue=Promise.resolve();const files=new Map();let delaySnapshot=0;
 function run(actor,fn){const work=sqlQueue.then(async()=>{await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor]);try{return await fn()}finally{await db.exec('RESET ROLE')}});sqlQueue=work.catch(()=>{});return work;}
 const extension=`
 (()=>{const actors=${JSON.stringify(actors)},create=window.supabase.createClient;
 window.supabase.createClient=(...args)=>{const client=create(...args),schema=client.schema.bind(client);
 const current=()=>JSON.parse(localStorage.getItem('finance-test-session')||'null');
 client.auth={async getSession(){return {data:{session:current()}}},async getUser(){return {data:{user:current()?.user}}},async signInWithPassword({email}){const actor=actors[email];if(!actor)return {error:{code:'invalid_credentials'}};localStorage.setItem('finance-test-session',JSON.stringify({user:{id:actor.id,email}}));return {data:{}}},async signOut(){localStorage.removeItem('finance-test-session');return {error:null}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}}};
 client.schema=name=>({from(table){if(table!=='app_user')return schema(name).from(table);let id;return {select(){return this},eq(k,v){id=v;return this},async single(){const role=Object.values(actors).find(a=>a.id===id)?.role;return {data:{id,display_name:role,role,is_active:true}}}}},async rpc(name,args){const response=await fetch('/__rpc',{method:'POST',body:JSON.stringify({actor:current()?.user.id,name,args})});return response.json()}});
 const storage=client.storage;
 client.storage={from(bucket){if(bucket!=='dtshop-receipts')return storage.from(bucket);return {async upload(key,file){const response=await fetch('/__upload',{method:'POST',body:JSON.stringify({actor:current()?.user.id,key,type:file.type,bytes:Array.from(new Uint8Array(await file.arrayBuffer()))})});return response.json()},async download(key){const response=await fetch('/__download',{method:'POST',body:JSON.stringify({actor:current()?.user.id,key})});return response.ok?{data:await response.blob()}:{error:{message:'No autorizado'}}}}}};
 return client};})();`;
 new (require('node:vm').Script)(require('./catalog-fixture.cjs')+extension);
 const server=await chromium.launchServer({channel:'msedge',headless:true}),browser=await chromium.connect(server.wsEndpoint());
 try{
  const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'text/javascript',body:require('./catalog-fixture.cjs')+extension});
   if(url.origin!=='https://finance.example')return route.abort();
   if(url.pathname==='/supabase-config.js')return route.fulfill({contentType:'text/javascript',body:'window.DIRTYTASK_SUPABASE={url:"https://example.supabase.co",publishableKey:"sb_publishable_test"}'});
   if(url.pathname.startsWith('/__')){
    const body=route.request().postDataJSON();
    try{
     if(!Object.values(actors).some(a=>a.id===body.actor))throw Error('Unknown actor');
     if(url.pathname==='/__rpc'){
      if(!/^[a-z_]+$/.test(body.name))throw Error('Invalid RPC');
      const keys=Object.keys(body.args||{});if(keys.some(key=>!/^[a-z_]+$/.test(key)))throw Error('Invalid argument');
      if(body.name==='finance_snapshot'&&delaySnapshot)await new Promise(resolve=>setTimeout(resolve,delaySnapshot));
      const result=await run(body.actor,()=>db.query(`SELECT dtshop.${body.name}(${keys.map((key,i)=>`${key} => $${i+1}`).join(',')}) AS result`,keys.map(key=>body.args[key])));
      return route.fulfill({contentType:'application/json',body:JSON.stringify({data:result.rows[0].result,error:null})});
     }
     if(url.pathname==='/__upload'){
      await run(body.actor,()=>db.query("INSERT INTO storage.objects(bucket_id,name) VALUES('dtshop-receipts',$1)",[body.key]));files.set(body.key,{bytes:Buffer.from(body.bytes),type:body.type});return route.fulfill({contentType:'application/json',body:'{"error":null}'});
     }
     const allowed=await run(body.actor,()=>db.query("SELECT name FROM storage.objects WHERE bucket_id='dtshop-receipts' AND name=$1",[body.key]));
     if(!allowed.rows.length)throw Error('No attachment access');
     const file=files.get(body.key);return route.fulfill({contentType:file.type,body:file.bytes});
    }catch(error){return route.fulfill({contentType:'application/json',body:JSON.stringify({error:{message:error.message,code:error.code}})});}
   }
   try{return route.fulfill({body:await fs.readFile(path.join(__dirname,'..',url.pathname)),contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[path.extname(url.pathname)]||'application/octet-stream'})}catch{return route.fulfill({status:404,body:''})}
  });
  async function login(email){await page.locator('#loginEmail').fill(email);await page.locator('#loginPassword').fill('test');await page.locator('.login-submit').click();await page.waitForFunction(()=>document.querySelector('#financeLoadStatus').textContent==='Contabilidad cargada.');await page.locator('[data-view="accounting"]').click();}
  async function changeUser(email){await page.locator('#logoutButton').click();await login(email);}
  async function approveLatest(){await page.locator('[data-cash-tab="approvals"]').click();await page.locator('[data-finance-review][data-approve="true"]').first().click();await page.waitForFunction(()=>document.querySelector('#financeLoadStatus').textContent==='Contabilidad cargada.');}
  const count=table=>db.query(`SELECT count(*)::int AS n FROM dtshop.${table}`).then(result=>result.rows[0].n);
  await page.goto('https://finance.example/admin.html');await login('finance@example.com');
  assert.equal(await page.locator('#financeApprovalPanel').isVisible(),false,'Approvals do not appear above accounting');
  await page.locator('[data-cash-tab="approvals"]').click();assert.equal(await page.locator('#cashRoot').isVisible(),false);
  assert.match(await page.locator('#financeApprovals').textContent(),/No hay solicitudes pendientes/);
  await page.locator('[data-cash-tab="accounts"]').click();await page.locator('[data-cash-action="account"]').click();
  await page.locator('#cashForm [name="type"]').selectOption('cash');await page.locator('#cashForm [name="name"]').fill('Caja real');await page.locator('[name="openingBalance"]').fill('1000');
  await page.locator('#cashForm [type="submit"]').click();await page.locator('.cash-dialog').waitFor({state:'hidden'});
  assert.equal(await count('money_account'),0,'A pending account must not be posted');
  await changeUser('ops@example.com');
  assert.equal(await page.locator('#financePendingCount').textContent(),'1');
  await page.locator('[data-cash-tab="approvals"]').click();
  if(process.env.DT_UI_SCREENSHOTS_DIR){await fs.mkdir(process.env.DT_UI_SCREENSHOTS_DIR,{recursive:true});await page.locator('#view-accounting').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'finance-approval-pending.png')});}
  await approveLatest();assert.equal(await count('money_account'),1);
  await page.locator('[data-finance-filter="history"]').click();assert.match(await page.locator('.finance-request').textContent(),/Aprobada/);
  await page.locator('[data-finance-filter="pending"]').click();
  await page.locator('[data-cash-tab="accounts"]').click();assert.equal(await page.locator('[data-cash-action="account"]').isDisabled(),true);
  await page.locator('[data-cash-tab="sales"]').click();await page.locator('[data-cash-action="sale"]').click();
  await page.locator('[name="channel"]').selectOption('external');await page.locator('[name="lineName"]').fill('Artículo manual');await page.locator('[name="price"]').fill('100');await page.locator('[name="shippingMode"]').selectOption('none');
  await page.locator('#cashForm [type="submit"]').click();await page.locator('.cash-dialog').waitFor({state:'hidden'});assert.equal(await count('cash_sale'),1);
  await page.locator('[data-cash-action="collect"]').click();await page.locator('[name="amount"]').fill('100');
  await page.locator('[name="receipt"]').setInputFiles({name:'recibo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\ncomprobante de prueba')});
  await page.locator('#cashForm [type="submit"]').click();await page.locator('.cash-dialog').waitFor({state:'hidden'});assert.equal(await count('receipt'),0);
  await changeUser('finance@example.com');await approveLatest();assert.equal(await count('receipt'),1);assert.equal(files.size,1);
  await page.locator('[data-cash-tab="accounts"]').click();await page.locator('[data-cash-action="file"]').first().click();
  await page.locator('.cash-dialog').waitFor({state:'visible'});assert.match(await page.locator('.cash-dialog').textContent(),/recibo.pdf/);await page.locator('.cash-dialog .editor-close').click();
  await page.locator('[data-cash-tab="debt"]').click();await page.locator('[data-acc-action="create"]').click();
  for(const [name,value] of Object.entries({bank:'Banco de prueba',reference:'P-01',name:'Préstamo real',openingBalance:'500',installment:'100'}))await page.locator(`#accForm [name="${name}"]`).fill(value);
  await page.locator('#accForm [type="submit"]').click();await page.locator('#accForm').waitFor({state:'hidden'});assert.equal(await count('obligation'),0);
  await changeUser('ops@example.com');await approveLatest();assert.equal(await count('obligation'),1);
  await changeUser('finance@example.com');await page.locator('[data-cash-tab="debt"]').click();await page.locator('[data-acc-action="movement"]').first().click();
  await page.locator('#accForm [name="total"]').fill('100');await page.locator('#accForm [type="submit"]').click();await page.locator('#accForm').waitFor({state:'hidden'});assert.equal(await count('obligation_movement'),0);
  await changeUser('ops@example.com');await approveLatest();assert.equal(await count('obligation_movement'),1);
  assert.equal(Number((await db.query('SELECT dtshop.account_balance(id) AS balance FROM dtshop.money_account')).rows[0].balance),100000,'1000 initial + 100 receipt - 100 debt payment');
  await changeUser('finance@example.com');await page.locator('[data-cash-tab="debt"]').click();await page.locator('[data-acc-action="movement"]').first().click();
  await page.locator('#accForm [name="type"]').selectOption('statement');await page.locator('#accForm [name="statementBalance"]').fill('400');
  await page.locator('#accForm [type="submit"]').click();await page.locator('#accForm').waitFor({state:'hidden'});
  await changeUser('ops@example.com');await approveLatest();
  assert.equal(Number((await db.query('SELECT dtshop.obligation_balance(id) AS balance FROM dtshop.obligation')).rows[0].balance),40000);
  assert.equal(Number((await db.query('SELECT dtshop.account_balance(id) AS balance FROM dtshop.money_account')).rows[0].balance),100000,'Updating a bank statement does not post another payment');
  await changeUser('finance@example.com');await page.locator('[data-cash-tab="entries"]').click();await page.locator('[data-cash-action="expense"]').click();
  await page.locator('#cashForm [name="amount"]').fill('2000');await page.locator('#cashForm [name="concept"]').fill('Gasto sin fondos');
  await page.locator('#cashForm [type="submit"]').click();await page.locator('.cash-dialog').waitFor({state:'hidden'});
  await changeUser('ops@example.com');await page.locator('[data-cash-tab="approvals"]').click();await page.locator('[data-finance-review][data-approve="true"]').first().click();
  await page.waitForFunction(()=>document.querySelector('#financeLoadStatus').textContent.includes('No se pudo confirmar'));
  assert.equal(Number((await db.query('SELECT dtshop.account_balance(id) AS balance FROM dtshop.money_account')).rows[0].balance),100000,'An invalid approval rolls back');
  await page.locator('[data-finance-note]').first().fill('Rechazado: fondos insuficientes');await page.locator('[data-finance-review][data-approve="false"]').first().click();
  await page.waitForFunction(()=>document.querySelector('#financeLoadStatus').textContent==='Contabilidad cargada.');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#financeLoadStatus').textContent==='Contabilidad cargada.');await page.locator('[data-view="accounting"]').click();
  await page.locator('[data-cash-tab="debt"]').click();await page.waitForFunction(()=>document.querySelector('#accountingRoot').textContent.includes('Préstamo real'));assert.doesNotMatch(await page.locator('#accountingRoot').textContent(),/Tres registros ficticios|DEMOSTRACIÓN/);
  await page.locator('[data-cash-tab="approvals"]').click();await page.locator('[data-finance-filter="history"]').click();
  assert.match(await page.locator('#financeApprovals').textContent(),/Rechazado: fondos insuficientes/);
  await page.locator('[data-finance-filter="mine"]').click();assert.equal(await page.locator('.finance-request').count(),Number((await db.query('SELECT count(*) AS n FROM dtshop.finance_action_request WHERE requested_by=$1',[ops])).rows[0].n));
  await page.locator('[data-finance-filter="history"]').click();
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);if(process.env.DT_UI_SCREENSHOTS_DIR)await page.locator('#view-accounting').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'finance-approvals-'+width+'.png')});}
  if(process.env.DT_UI_SCREENSHOTS_DIR){await fs.mkdir(process.env.DT_UI_SCREENSHOTS_DIR,{recursive:true});await page.locator('#view-accounting').screenshot({path:path.join(process.env.DT_UI_SCREENSHOTS_DIR,'finance-connected.png')});}
  delaySnapshot=200;await page.locator('#refreshFinance').click();await page.locator('#logoutButton').click();await page.waitForTimeout(300);
  assert.equal(await page.locator('#financeApprovals').textContent(),'');assert.equal(await page.locator('#accountingRoot').textContent(),'');assert.equal(await page.locator('#cashRoot').textContent(),'');assert.equal(await page.locator('.acc-dialog [name="reference"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS real PostgreSQL UI: pending account, cross-partner approval, sale/receipt/private PDF, obligations/payment, persistence, responsive view and logout race');
 }finally{for(const context of browser.contexts())await context.close();await Promise.race([server.kill(),new Promise(resolve=>setTimeout(resolve,3000))]);await sqlQueue;await db.close();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1)});
