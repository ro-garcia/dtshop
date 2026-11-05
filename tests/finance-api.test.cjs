const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
function fixture(){
 const calls=[],uploads=[];let failure=null,snapshotWait=null;
 const raw={accounts:[],sales:[],saleLines:[],adjustments:[],receipts:[],settlements:[],allocations:[],entries:[],transfers:[],obligations:[],movements:[],attachments:[],requests:[],reconciliations:[],people:[],orders:[]};
 const document=new EventTarget();
 const window={Accounting:require('../accounting-data.js'),adminIdentity:{id:'finance',role:'partner_finance'},dirtytaskSupabase:{schema(name){assert.equal(name,'dtshop');return {async rpc(name,args){calls.push({name,args});if(name==='finance_snapshot'&&snapshotWait)await snapshotWait;if(failure)return {error:failure};return {data:name==='finance_snapshot'?structuredClone(raw):name==='finance_register_attachment'?'attachment-id':'result-id'}}}},storage:{from(bucket){assert.equal(bucket,'dtshop-receipts');return {async upload(key,file,options){uploads.push({key,type:file.type,options});return {error:null}},async download(){return {data:new Blob(['receipt'],{type:'application/pdf'})}}}}}}};
 vm.runInNewContext(fs.readFileSync('finance-api.js','utf8'),{window,document,Event,structuredClone,crypto:webcrypto,File});
 return {api:window.Finance,window,document,calls,uploads,raw,fail:value=>failure=value,wait:value=>snapshotWait=value};
}
test('financial requests convert cents, keep idempotency keys and enforce role boundaries',async()=>{
 const {api,window,calls,raw}=fixture();
 await api.cash.createAccount({requestKey:'a',name:'Caja',type:'cash',currency:'GTQ',openingBalance:'100.25',startDate:'2026-01-01'});
 assert.equal(calls.at(-1).name,'submit_operation');assert.equal(calls.at(-1).args.p_operation,'account_open');assert.equal(calls.at(-1).args.p_payload.opening_balance_cents,10025);assert.equal(calls.at(-1).args.p_idempotency_key,'a');
 const payment=await api.obligations.addMovement({requestKey:'payment',obligationId:'debt',accountId:'cash',type:'payment',date:'2026-01-02',period:'2026-01',total:'25.50',statementBalance:'74.75'});
 assert.equal(payment.pending,true);assert.equal(calls.at(-1).args.p_payload.period_month,'2026-01-01');assert.equal(calls.at(-1).args.p_payload.total_cents,2550);assert.equal(calls.at(-1).args.p_payload.statement_balance_cents,7475);assert.equal(calls.at(-1).args.p_payload.principal_known,false);
 await api.cash.confirmSettlement({requestKey:'deposit',id:'settlement',accountId:'cash',date:'2026-01-02',service:'1.25',received:'98.75'});
 assert.equal(calls.at(-1).args.p_payload.service_cents,125);assert.equal(calls.at(-1).args.p_payload.received_cents,9875);
 await api.cash.transfer({requestKey:'transfer',fromId:'one',toId:'two',date:'2026-01-01',amount:'10.01',concept:'Caja'});assert.equal(calls.at(-1).args.p_payload.amount_cents,1001);
 window.adminIdentity={id:'ops',role:'partner_ops'};
 await assert.rejects(()=>api.cash.createAccount({requestKey:'forbidden',openingBalance:'0'}),/otro socio/);
 await api.cash.adjustSale({requestKey:'adjust',saleId:'sale',date:'2026-01-02',direction:'decrease',amount:'10.25',reason:'Ajuste'});assert.equal(calls.at(-1).args.p_payload.amount_cents,-1025);
 await api.cash.createSale({requestKey:'sale',reference:'V1',date:'2026-01-02',channel:'external',currency:'GTQ',shippingMode:'none',lines:[{name:'Pieza',qty:'2',price:'15.25'}]});
 assert.equal(calls.at(-1).name,'finance_create_sale');assert.equal(calls.at(-1).args.p_payload.lines[0].unit_price_cents,1525);
 raw.sales=[{id:'courier-sale',reference:'S1',business_date:'2026-01-01',channel:'external',currency:'GTQ',shipping_mode:'none',shipping_cents:0,subtotal_cents:10025,total_cents:10025}];
 await api.cash.createSettlement({requestKey:'courier',courier:'Forza',date:'2026-01-01',allocations:[{saleId:'courier-sale',amount:'100.25'}]});
 assert.equal(calls.at(-1).args.p_payload.allocations[0].amount_cents,10025);assert.equal(calls.at(-1).args.p_payload.currency,'GTQ');
});
test('receipts upload privately, reuse their File on retry and download through authenticated Storage',async()=>{
 const {api,calls,uploads,raw,fail}=fixture();const file=new File(['%PDF-1.4 receipt'],'receipt.pdf',{type:'application/pdf'});
 fail({message:'Temporary failure'});await assert.rejects(()=>api.cash.collect({requestKey:'r',saleId:'sale',accountId:'cash',date:'2026-01-01',amount:'10'},file));
 fail(null);await api.cash.collect({requestKey:'r',saleId:'sale',accountId:'cash',date:'2026-01-01',amount:'10'},file);
 assert.equal(uploads.length,1);assert.equal(uploads[0].options.upsert,false);assert.match(uploads[0].key,/^finance\//);
 assert.equal(calls.at(-1).args.p_payload.attachment_id,'attachment-id');
 raw.attachments=[{id:'attachment-id',file_name:'receipt.pdf',media_type:'application/pdf',byte_size:10,storage_key:uploads[0].key}];
 const downloaded=await api.getAttachment('attachment-id');assert.equal(downloaded.name,'receipt.pdf');assert.equal(downloaded.type,'application/pdf');
});
test('logout invalidates pending snapshots, and missing migrations remain visible errors',async()=>{
 const {api,window,document,wait,fail}=fixture();let resolve;wait(new Promise(done=>resolve=done));const pending=api.load();
 window.adminIdentity=null;document.dispatchEvent(new Event('dirtytask:auth'));resolve();await assert.rejects(()=>pending,/sesión/);
 wait(null);window.adminIdentity={id:'new-finance',role:'partner_finance'};document.dispatchEvent(new Event('dirtytask:auth'));
 fail({code:'PGRST202'});await assert.rejects(()=>api.load(),/finance-integration.sql/);
});
