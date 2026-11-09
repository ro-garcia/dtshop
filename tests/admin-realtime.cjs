const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function harness() {
  let now = 0, sequence = 0;
  const timers = new Map(), channels = [], removed = [], calls = [];
  const document = new EventTarget(), window = new EventTarget();
  const status = {textContent:'', dataset:{}, hidden:false};
  let editing = false, modal = false;
  document.hidden = false;
  document.activeElement = {matches:()=>editing, closest:()=>editing};
  document.querySelector = selector => selector === '#adminRealtimeStatus' ? status : modal ? {} : null;
  const navigator = {onLine:true};
  class CustomEvent extends Event { constructor(name, init={}) {super(name); this.detail=init.detail;} }
  window.dirtytaskSupabase = {
    channel(name) {
      const channel = {name, handlers:[], on(type,filter,callback) {this.handlers.push({filter,callback});return this;}, subscribe(callback) {this.status=callback;return this;}};
      channels.push(channel);return channel;
    },
    removeChannel(channel) {removed.push(channel);return Promise.resolve('ok');}
  };
  const context = vm.createContext({window,document,navigator,CustomEvent,Event,console,
    setTimeout(fn,delay=0) {const id=++sequence;timers.set(id,{fn,time:now+delay});return id;},
    clearTimeout(id) {timers.delete(id);}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../admin-realtime.js'),'utf8'), context);
  const api = window.adminRealtime;
  for (const name of ['catalog','orders','finance']) api.register(name,{refresh:async()=>{calls.push(name);return true;},blocked:()=>false});
  async function tick(ms=1000) {
    const end=now+ms;
    for(let i=0;i<1000;i++) {
      await Promise.resolve();await Promise.resolve();await Promise.resolve();
      const next=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];
      if(!next)break;
      now=next[1].time;timers.delete(next[0]);next[1].fn();
    }
    now=end;await Promise.resolve();await Promise.resolve();
  }
  function auth(id) {window.adminIdentity=id?{id,role:'partner_ops'}:null;document.dispatchEvent(new CustomEvent('dirtytask:auth',{detail:window.adminIdentity}));}
  function emit(table, channel=channels.at(-1)) {for(const h of channel.handlers)if(h.filter.table===table)h.callback({table,eventType:'UPDATE'});}
  async function connect() {auth('one');channels.at(-1).status('SUBSCRIBED');await tick();calls.length=0;}
  return {api,channels,calls,removed,status,auth,emit,tick,connect,document,window,navigator,editing(value){editing=value;},modal(value){modal=value;}};
}

test('subscribes only after auth; explicit tables exclude content/settings',async()=>{
  const h=harness();assert.equal(h.channels.length,0);await h.connect();
  const filters=h.channels[0].handlers.map(x=>x.filter);
  assert.equal(filters.length,28);assert.ok(filters.every(f=>f.schema==='dtshop'&&f.event==='*'));
  for(const table of ['content_block','content_video','store_setting','payment_method']) assert.ok(!filters.some(f=>f.table===table));
  h.emit('content_block');await h.tick();assert.deepEqual(h.calls,[]);
});
test('coalesces a burst and routes shared order data to finance',async()=>{
  const h=harness();await h.connect();
  for(let i=0;i<20;i++){h.emit('product');h.emit('product_variant');}
  await h.tick();assert.deepEqual(h.calls,['catalog']);h.calls.length=0;
  h.emit('shop_order');await h.tick();assert.deepEqual(h.calls.sort(),['finance','orders']);
});
test('retains an event arriving during a read without concurrent reads',async()=>{
  const h=harness();await h.connect();let release,count=0;
  h.api.register('catalog',{blocked:()=>false,refresh:()=>{count++;return new Promise(resolve=>{release=resolve;});}});
  h.emit('product');await h.tick();assert.equal(count,1);
  h.emit('product');await h.tick();assert.equal(count,1);
  release(true);await h.tick();assert.equal(count,2);release(true);await h.tick();
});
test('holds updates while editing and resumes after interaction',async()=>{
  const h=harness();await h.connect();h.editing(true);h.emit('product');await h.tick();assert.deepEqual(h.calls,[]);
  h.editing(false);h.document.dispatchEvent(new Event('focusout'));await h.tick();assert.deepEqual(h.calls,['catalog']);
});
test('retries a deferred application and a failed fetch',async()=>{
  const h=harness();await h.connect();let count=0;
  h.api.register('orders',{blocked:()=>false,refresh:async()=>{count++;if(count===1)throw Error('network');return count>2;}});
  h.emit('shop_order_line');await h.tick(40000);assert.equal(count,3);
});
test('reconnect resyncs all modules; obsolete channel events are ignored',async()=>{
  const h=harness();await h.connect();const old=h.channels[0];
  old.status('CHANNEL_ERROR');await h.tick(40000);assert.equal(h.channels.length,2);
  h.channels[1].status('SUBSCRIBED');await h.tick();assert.deepEqual(h.calls.sort(),['catalog','finance','orders']);h.calls.length=0;
  h.emit('product',old);await h.tick();assert.deepEqual(h.calls,[]);
});
test('reconnection does not reuse a topic while asynchronous unsubscribe is pending',async()=>{
  const h=harness();await h.connect();const original=h.window.dirtytaskSupabase.channel;
  // Supabase reuses an existing channel for a topic until removal finishes.
  h.window.dirtytaskSupabase.channel=name=>h.channels.find(ch=>ch.name===name)||original(name);
  h.window.dirtytaskSupabase.removeChannel=()=>new Promise(()=>{});
  h.channels[0].status('TIMED_OUT');await h.tick(3000);
  assert.equal(h.channels.length,2);
});
test('logout cancels queued work and invalidates in-flight context even for same-user login',async()=>{
  const h=harness();await h.connect();let ctx,release;
  h.api.register('orders',{blocked:()=>false,refresh:context=>{ctx=context;return new Promise(r=>release=r);}});
  h.emit('shop_order_line');await h.tick();assert.equal(ctx.isCurrent(),true);
  h.auth(null);assert.equal(ctx.isCurrent(),false);assert.equal(h.removed.length,1);
  h.auth('one');assert.equal(ctx.isCurrent(),false);release(true);await h.tick();
});
test('a response cannot apply after editing starts; offline queues resume online',async()=>{
  const h=harness();await h.connect();let ctx,release;
  h.api.register('catalog',{blocked:()=>false,refresh:context=>{ctx=context;return new Promise(r=>release=r);}});
  h.emit('product');await h.tick();h.editing(true);assert.equal(ctx.canApply(),false);release(false);await h.tick();
  h.editing(false);h.navigator.onLine=false;h.emit('receipt');await h.tick();assert.deepEqual(h.calls,[]);
  h.navigator.onLine=true;h.window.dispatchEvent(new Event('online'));await h.tick();assert.ok(h.calls.includes('finance'));
});
