// Persistent financial repositories. Only RPCs post money; pending requests never affect balances.
window.Finance = (() => {
  const A=window.Accounting;
  let cache=null,inflight=null,generation=0,dataVersion=0,fileCache=new WeakMap();
  const staff=()=>['partner_ops','partner_finance','admin'].includes(window.adminIdentity?.role);
  const context=()=>({generation,id:window.adminIdentity?.id});
  function check(ctx){if(!staff()||!ctx.id||ctx.id!==window.adminIdentity?.id||ctx.generation!==generation)throw Error('La sesión cambió. Vuelve a consultar Contabilidad.');}
  function client(){if(!staff()||!window.dirtytaskSupabase)throw Error('Inicia sesión con una cuenta de socio.');return window.dirtytaskSupabase;}
  const number=value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw Error('Un importe o contador supera el límite que puede mostrar la aplicación.');return n;};
  async function rpc(name,args={}){
    const ctx=context();check(ctx);
    const {data,error}=await client().schema('dtshop').rpc(name,args);check(ctx);
    if(error?.code==='PGRST202')throw Error('Esta función no está disponible. Contacta al administrador.');
    if(error)throw error;return data;
  }
  async function load(force=false){
    if(force){cache=null;dataVersion++;inflight=null;}
    if(cache)return cache;
    if(inflight)return inflight;
    const ctx=context(),version=dataVersion;
    const promise=rpc('finance_snapshot').then(raw=>{check(ctx);if(version!==dataVersion)return load();cache=mapSnapshot(raw);return cache}).finally(()=>{if(inflight===promise)inflight=null});
    inflight=promise;return promise;
  }
  const account=row=>({id:row.id,name:row.name,type:row.account_type,bank:row.bank_name,reference:row.reference_last4,currency:row.currency,openingBalance:number(row.opening_balance_cents),startDate:row.opened_on,createdAt:row.created_at});
  function mapSnapshot(raw){
    if(!raw||!Array.isArray(raw.accounts)||!Array.isArray(raw.obligations)||!Array.isArray(raw.requests))throw Error('La respuesta de Contabilidad está incompleta.');
    const meta=new Map((raw.attachments||[]).map(row=>[row.id,{id:row.id,name:row.file_name,type:row.media_type,size:number(row.byte_size),storageKey:row.storage_key}]));
    const customers=new Map((raw.customers||[]).map(row=>[row.id,row.name]));
    const attachment=id=>meta.get(id)||null;
    const cash={schemaVersion:3,accounts:raw.accounts.map(account),
      sales:raw.sales.map(row=>({id:row.id,shopOrderId:row.shop_order_id,reference:row.reference,date:row.business_date,channel:row.channel,currency:row.currency,customer:row.customer_name||customers.get(row.customer_id)||'',launchId:row.launch_id,shippingMode:row.shipping_mode,shipping:number(row.shipping_cents),subtotal:number(row.subtotal_cents),total:number(row.total_cents),createdAt:row.created_at,
        lines:raw.saleLines.filter(line=>line.sale_id===row.id).map(line=>({id:line.id,productId:line.product_id,name:line.name,qty:number(line.qty),unitPrice:number(line.unit_price_cents)}))})),
      adjustments:raw.adjustments.map(row=>({id:row.id,saleId:row.sale_id,date:row.business_date,amount:number(row.amount_cents),reason:row.reason,createdAt:row.created_at})),
      receipts:raw.receipts.map(row=>({id:row.id,saleId:row.sale_id,accountId:row.account_id,date:row.business_date,amount:number(row.amount_cents),reference:row.reference,attachment:attachment(row.attachment_id),createdAt:row.created_at})),
      settlements:raw.settlements.map(row=>{const allocations=raw.allocations.filter(link=>link.settlement_id===row.id).map(link=>({saleId:link.sale_id,amount:number(link.amount_cents),withheld:link.withheld_cents==null?null:number(link.withheld_cents),adjustment:link.positive_adjustment_cents==null?null:number(link.positive_adjustment_cents),net:link.net_cents==null?null:number(link.net_cents)}));return {id:row.id,courier:row.courier,date:row.business_date,currency:row.currency,reference:row.reference,status:row.status,confirmedDate:row.confirmed_on,accountId:row.account_id,service:number(row.service_cents),commission:number(row.commission_cents),discounts:number(row.discount_cents),adjustment:number(row.adjustment_cents),received:row.received_cents==null?null:number(row.received_cents),gross:allocations.reduce((sum,item)=>sum+item.amount,0),reason:row.reason,attachment:attachment(row.attachment_id),allocations,createdAt:row.created_at}}),
      entries:raw.entries.map(row=>entry(row,attachment)),
      transfers:raw.transfers.map(row=>({id:row.id,fromId:row.from_account_id,toId:row.to_account_id,date:row.business_date,amount:number(row.amount_cents),currency:row.currency,concept:row.concept,attachment:attachment(row.attachment_id),createdAt:row.created_at}))};
    const debt={schemaVersion:3,obligations:raw.obligations.map(row=>({id:row.id,bank:row.bank_name,reference:row.reference,name:row.name,type:row.obligation_type,currency:row.currency,openingBalance:number(row.opening_balance_cents),installment:number(row.installment_cents),dueDay:number(row.due_day),startDate:row.start_date,createdAt:row.created_at,knownBalance:number(row.known_balance_cents),balancePending:row.needs_bank_update})),
      movements:raw.movements.map(row=>({id:row.id,obligationId:row.obligation_id,sourceAccountId:row.account_id,type:row.movement_type,date:row.business_date,period:row.period_month?.slice(0,7)||'',total:number(row.total_cents),principal:row.principal_cents==null?null:number(row.principal_cents),principalKnown:row.principal_known,interest:row.interest_cents==null?0:number(row.interest_cents),fees:row.fee_cents==null?0:number(row.fee_cents),statementBalance:row.statement_balance_cents==null?null:number(row.statement_balance_cents),notes:row.notes,sequence:number(row.sequence),attachment:attachment(row.attachment_id),createdAt:row.created_at}))};
    return {cash,debt,requests:raw.requests,reconciliations:raw.reconciliations||[],people:raw.people||[],orders:raw.orders||[],attachments:meta,readAt:raw.read_at};
  }
  function entry(row,attachment){return {id:row.id,accountId:row.account_id,date:row.business_date,direction:row.direction,amount:number(row.amount_cents),currency:row.currency,category:row.category,concept:row.concept,saleId:row.sale_id,sourceType:row.source_type==='obligation_movement'?'obligation':row.source_type,sourceId:row.source_id,sequence:number(row.sequence),attachment:attachment(row.attachment_id),reversalOf:row.reversal_of,createdAt:row.created_at,...(row.balance_cents!=null?{balance:number(row.balance_cents)}:{})};}
  function role(allowed){if(window.adminIdentity?.role!=='admin'&&!allowed.includes(window.adminIdentity?.role))throw Error('Esta operación corresponde al otro socio.');}
  function key(input){if(!input.requestKey)throw Error('Abre de nuevo el formulario para iniciar la solicitud.');return input.requestKey;}
  async function attachment(file){
    if(!file)return null;
    if(!file.size)throw Error('El comprobante está vacío. Elige otro archivo.');
    const ctx=context();check(ctx);
    const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'}[file.type];
    if(!extension||file.size>5*1024*1024)throw Error('Adjunta una imagen o PDF de hasta 5 MB.');
    let record=fileCache.get(file);
    if(!record){record={key:`${ctx.id}/${crypto.randomUUID()}.${extension}`};fileCache.set(file,record);}
    if(record.id)return record.id;
    if(!record.uploaded){const {error}=await client().storage.from('dtshop-receipts').upload(record.key,file,{upsert:false,contentType:file.type});check(ctx);if(error&&!['409','Duplicate'].includes(String(error.statusCode||error.code)))throw error;record.uploaded=true;}
    record.id=await rpc('finance_register_attachment',{p_key:record.key,p_name:file.name.slice(0,200),p_type:file.type,p_bytes:file.size});return record.id;
  }
  async function changed(){cache=null;dataVersion++;inflight=null;document.dispatchEvent(new Event('finance:changed'));}
  async function request(operation,payload,input,file){
    role(['partner_finance',...(['receipt','settlement_open','sale_adjustment'].includes(operation)?['partner_ops']:[])]);
    const ctx=context();const attachmentId=await attachment(file);check(ctx);
    if(attachmentId)payload.attachment_id=attachmentId;
    const id=await rpc('submit_operation',{p_operation:operation,p_payload:payload,p_idempotency_key:key(input)});
    const direct=window.adminIdentity?.role==='admin';await changed();const applied=direct?(await load()).requests.find(r=>r.id===id)?.result_id:null;return {id:applied||id,pending:!direct,obligationId:input.obligationId};
  }
  async function getAttachment(id){
    const ctx=context(),snapshot=await load(),meta=snapshot.attachments.get(id);if(!meta)throw Error('No se encontró el comprobante.');
    const {data,error}=await client().storage.from('dtshop-receipts').download(meta.storageKey);check(ctx);if(error)throw error;
    return new File([data],meta.name,{type:meta.type});
  }
  const cash={
    async list(){return structuredClone((await load()).cash)},getAttachment,
    async createAccount(input){return request('account_open',{name:input.name,account_type:input.type,bank_name:input.type==='cash'?'':input.bank,reference_last4:input.reference||'',currency:input.currency,opening_balance_cents:A.amount(input.openingBalance),opened_on:input.startDate},input)},
    async createSale(input){
      role(['partner_ops']);
      const payload={reference:input.reference?.trim()||'V-'+key(input).slice(0,12).toUpperCase(),business_date:input.date,channel:input.channel,currency:input.currency,customer_name:input.customer||'',launch_id:input.launchId||null,shop_order_id:input.shopOrderId||null,shipping_mode:input.shippingMode,shipping_cents:A.amount(input.shippingMode==='extra'?input.shipping||'0':'0'),lines:input.lines?.map(line=>({product_id:line.productId||null,name:line.name,qty:Number(line.qty),unit_price_cents:A.amount(line.price)}))};
      const id=await rpc('finance_create_sale',{p_key:key(input),p_payload:payload});await changed();document.dispatchEvent(new Event('dirtytask:order-stock-updated'));return {id};
    },
    async collect(input,file){return request('receipt',{sale_id:input.saleId,account_id:input.accountId,business_date:input.date,amount_cents:A.amount(input.amount),reference:input.reference||''},input,file)},
    async adjustSale(input){return request('sale_adjustment',{sale_id:input.saleId,business_date:input.date,amount_cents:A.amount(input.amount)*(input.direction==='decrease'?-1:1),reason:input.reason},input)},
    async createSettlement(input){const data=(await load()).cash;const first=data.sales.find(s=>s.id===input.allocations?.[0]?.saleId);if(!first)throw Error('Selecciona al menos una venta.');if(input.allocations.some(a=>data.sales.find(s=>s.id===a.saleId)?.currency!==first.currency))throw Error('Las ventas deben tener la misma moneda.');return request('settlement_open',{courier:input.courier,business_date:input.date,reference:input.reference||'',currency:first.currency,allocations:input.allocations.map(a=>({sale_id:a.saleId,amount_cents:A.amount(a.amount)}))},input)},
    async confirmSettlement(input,file){return request('settlement_confirm',{settlement_id:input.id,account_id:input.accountId,confirmed_on:input.date,service_cents:A.amount(input.service||'0'),commission_cents:A.amount(input.commission||'0'),discount_cents:A.amount(input.discounts||'0'),adjustment_cents:A.amount(input.adjustment||'0'),received_cents:A.amount(input.received),reason:input.reason||''},input,file)},
    async addEntry(input,file){return request(input.direction==='in'?'income':'expense',{account_id:input.accountId,business_date:input.date,category:input.category,amount_cents:A.amount(input.amount),concept:input.concept,sale_id:input.saleId||null},input,file)},
    async transfer(input,file){return request('transfer',{from_account_id:input.fromId,to_account_id:input.toId,business_date:input.date,amount_cents:A.amount(input.amount),concept:input.concept},input,file)},
    async prepareReconciliation(input,file){const ctx=context(),attachmentId=await attachment(file);check(ctx);const id=await rpc('finance_prepare_reconciliation',{p_key:key(input),p_payload:{account_id:input.accountId,as_of_date:input.date,observed_balance_cents:A.amount(input.observed),notes:input.notes||'',attachment_id:attachmentId}});await changed();return {id,pending:window.adminIdentity?.role!=='admin'}},
    async saleStatus(id,asOf=A.today()){const data=await rpc('finance_sale_status',{p_sale:id,p_as_of:asOf});return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,number(v)]))},
    async accountLedger(id,from='2000-01-01',to=A.today()){const data=await rpc('finance_account_ledger',{p_account:id,p_from:from,p_to:to}),snapshot=await load();return {account:account(data.account),opening:number(data.opening),balance:number(data.balance),rows:data.rows.map(row=>entry(row,id=>snapshot.attachments.get(id)||null))}},
    async report(from,to){const data=await rpc('finance_report',{p_from:from,p_to:to});return Object.fromEntries(Object.entries(data).map(([currency,values])=>[currency,Object.fromEntries(Object.entries(values).map(([k,v])=>[k,number(v)]))]))}
  };
  const obligations={
    async list(){return structuredClone((await load()).debt)},getAttachment,
    async createObligation(input){return request('obligation_open',{bank_name:input.bank,reference:input.reference,name:input.name,obligation_type:input.type,currency:input.currency,opening_balance_cents:A.amount(input.openingBalance),installment_cents:A.amount(input.installment),due_day:Number(input.dueDay),start_date:input.startDate},input)},
    async addMovement(input,file){return request('obligation_movement',{obligation_id:input.obligationId,account_id:['payment','principal'].includes(input.type)?input.accountId:null,movement_type:input.type,business_date:input.date,period_month:input.type==='payment'?input.period+'-01':null,total_cents:input.type==='statement'?0:A.amount(input.total),principal_known:false,statement_balance_cents:input.statementBalance?.trim()?A.amount(input.statementBalance):null,notes:input.notes||''},input,file)}
  };
  document.addEventListener('dirtytask:auth',()=>{generation++;dataVersion++;cache=null;inflight=null;fileCache=new WeakMap()});
  return Object.freeze({cash,obligations,load,async refresh(realtime=null){
    const ctx=context();
    const result=await load(true);
    if(realtime&&!realtime.canApply())return null;
    const tasks=[];
    document.dispatchEvent(new CustomEvent('finance:loaded',{detail:{realtime,tasks}}));
    const applied=await Promise.all(tasks);
    check(ctx);
    if(realtime&&(!realtime.canApply()||applied.includes(false)))return null;
    return result;
  },
    async review(id,approve,note=''){await rpc('review_operation',{p_request:id,p_approve:approve,p_note:note});await changed()},
    async reviewReconciliation(id){await rpc('review_reconciliation',{p_id:id});await changed()},getAttachment});
})();
