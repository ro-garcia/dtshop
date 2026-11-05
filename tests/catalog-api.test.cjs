const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('categories use shared client, explicit schema, columns and ordering; errors propagate',async()=>{
 const calls=[];let error=null;
 const query={select(x){calls.push(['select',x]);return this;},order(x){calls.push(['order',x]);return this;},then(resolve){resolve({data:[{code:'new',label:'Nueva',sort_order:1}],error});}};
 const window={dirtytaskSupabase:{schema(x){calls.push(['schema',x]);return {from(x){calls.push(['from',x]);return query;}};}}};
 vm.runInNewContext(fs.readFileSync('catalog-api.js','utf8'),{window});
 assert.equal((await window.catalogApi.listCategories())[0].code,'new');
 assert.deepEqual(calls,[['schema','dtshop'],['from','category'],['select','code,label,sort_order'],['order','sort_order'],['order','code']]);
 error=new Error('network');await assert.rejects(()=>window.catalogApi.listCategories(),/network/);
 window.dirtytaskSupabase=null;await assert.rejects(()=>window.catalogApi.listCategories(),/Supabase/);
});
