const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const raw = marker => ({accounts:[],obligations:[],requests:[],sales:[],saleLines:[],adjustments:[],receipts:[],settlements:[],allocations:[],entries:[],transfers:[],movements:[],read_at:marker});
function setup() {
  const document = new EventTarget();const pending=[];let notified=0;
  class CustomEvent extends Event {constructor(name,init={}){super(name);this.detail=init.detail;}}
  const window={Accounting:{},adminIdentity:{id:'one',role:'partner_finance'},dirtytaskSupabase:{schema:()=>({rpc:()=>new Promise(resolve=>pending.push(resolve))})}};
  document.addEventListener('finance:loaded',()=>notified++);
  const context=vm.createContext({window,document,Event,CustomEvent,structuredClone,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../finance-api.js'),'utf8'),context);
  return {window,document,pending,notify:()=>notified,finance:window.Finance};
}
test('forced finance refresh invalidates a pending snapshot; all readers converge on fresh data',async()=>{
  const h=setup();const old=h.finance.load();assert.equal(h.pending.length,1);
  const fresh=h.finance.load(true);assert.equal(h.pending.length,2);
  h.pending[1]({data:raw('fresh')});await fresh;
  h.pending[0]({data:raw('old')});assert.equal((await old).readAt,'fresh');
});
test('a background snapshot does not render while its interaction guard is false',async()=>{
  const h=setup();const promise=h.finance.refresh({canApply:()=>false});
  h.pending[0]({data:raw('fresh')});assert.equal(await promise,null);assert.equal(h.notify(),0);
});
test('session changes reject a previous financial response',async()=>{
  const h=setup();const promise=h.finance.load();
  h.document.dispatchEvent(new Event('dirtytask:auth'));h.pending[0]({data:raw('old')});
  await assert.rejects(promise,/sesión cambió/);
});
test('background finance refresh waits for dependent views and reports their failure',async()=>{
  const h=setup();let rejectView;
  h.document.addEventListener('finance:loaded',event=>event.detail.tasks.push(new Promise((resolve,reject)=>{rejectView=reject;})));
  const promise=h.finance.refresh({canApply:()=>true});
  h.pending[0]({data:raw('fresh')});
  for(let i=0;i<10;i++)await Promise.resolve();
  assert.equal(typeof rejectView,'function');
  rejectView(Error('report unavailable'));
  await assert.rejects(promise,/report unavailable/);
});
