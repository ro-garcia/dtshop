(() => {
  const $=selector=>document.querySelector(selector);
  const labels={pending:'Por confirmar',confirmed:'Confirmado',preparing:'En preparación',shipped:'Enviado',delivered:'Entregado',cancelled:'Cancelado'};
  const transitions={pending:['confirmed','cancelled'],confirmed:['preparing','cancelled'],preparing:['shipped','cancelled'],shipped:['delivered'],delivered:[],cancelled:[]};
  const actions={confirmed:'Confirmar pedido',preparing:'Preparar pedido',shipped:'Marcar enviado',delivered:'Marcar entregado',cancelled:'Cancelar pedido'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const money=(cents,currency)=>new Intl.NumberFormat('es-GT',{style:'currency',currency}).format(Number(cents)/100);
  const date=value=>new Intl.DateTimeFormat('es-GT',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Guatemala'}).format(new Date(value));
  let rows=[],ready=false,busy=false,revision=0,cancelling=null;
  const openOrders=new Set(),draftNotes=new Map();
  window.adminOrders=Object.freeze({pendingCount:()=>rows.filter(row=>row.status==='pending').length,totalCount:()=>rows.length});
  function render(){
    $('#ordersPending').textContent=String(window.adminOrders.pendingCount());
    $('#ordersPreparing').textContent=String(rows.filter(row=>row.status==='preparing').length);
    $('#ordersDelivered').textContent=String(rows.filter(row=>row.status==='delivered').length);
    $('[data-view="orders"] .nav-count').textContent=String(rows.filter(row=>!['cancelled','delivered'].includes(row.status)).length);
    const filter=$('#ordersStatusFilter').value;
    const query=$('#ordersSearch').value.trim().toLocaleLowerCase('es');
    const visible=rows.filter(row=>(filter==='all'||row.status===filter)&&(!query||[row.id,row.customer?.first_name,row.customer?.last_name,row.phone].join(' ').toLocaleLowerCase('es').includes(query)));
    $('#ordersResultCount').textContent=visible.length+' '+(visible.length===1?'pedido':'pedidos');
    const canEdit=ready&&!busy&&['partner_ops','admin'].includes(window.adminIdentity?.role);
    $('#ordersList').innerHTML=visible.map(row=>orderMarkup(row,canEdit)).join('')||'<div class="empty-admin orders-empty"><h2>'+(!ready&&!rows.length?'Cargando pedidos…':query?'No encontramos ese pedido.':'No hay pedidos en este estado.')+'</h2><p>'+(query?'Prueba con otro nombre, teléfono o referencia.':'Las compras recibidas aparecerán aquí.')+'</p></div>';
    $('#refreshOrders').disabled=!window.adminIdentity||busy;
    document.dispatchEvent(new CustomEvent('dirtytask:orders-updated'));
  }
  async function load(){
    const userId=window.adminIdentity?.id;if(!userId||busy)return;
    const ticket=++revision;busy=true;ready=false;render();$('#ordersLoadStatus').dataset.state='quiet';$('#ordersLoadStatus').textContent='Cargando pedidos…';
    try{
      const next=await window.ordersApi.list();
      if(ticket!==revision||window.adminIdentity?.id!==userId)return;
      rows=next;ready=true;$('#ordersLoadStatus').textContent='Pedidos cargados: '+rows.length+'.';
    }catch(error){if(ticket===revision&&window.adminIdentity?.id===userId){$('#ordersLoadStatus').dataset.state='error';$('#ordersLoadStatus').textContent='No se pudieron actualizar. Lo visible puede ser anterior. '+(error.message||'Reintenta.');}}
    finally{if(ticket===revision){busy=false;render();}}
  }
  $('#refreshOrders').addEventListener('click',load);
  $('#ordersStatusFilter').addEventListener('change',render);
  $('#ordersSearch').addEventListener('input',render);
  $('#ordersList').addEventListener('toggle',event=>{const id=event.target.dataset.orderDetail;if(id){if(event.target.open)openOrders.add(id);else openOrders.delete(id)}},true);
  $('#ordersList').addEventListener('input',event=>{if(event.target.matches('[data-order-note]'))draftNotes.set(event.target.dataset.orderNote,event.target.value)});
  $('#ordersList').addEventListener('click',async event=>{
    if(event.target.closest('[data-abort-cancel]')){cancelling=null;render();return;}
    const button=event.target.closest('[data-order-id]');
    if(!button||!ready||busy||!['partner_ops','admin'].includes(window.adminIdentity?.role))return;
    const row=rows.find(row=>row.id===button.dataset.orderId);if(!row)return;
    const next=button.dataset.nextStatus;if(!(transitions[row.status]||[]).includes(next))return;
    if(next==='cancelled'&&!button.hasAttribute('data-confirm-cancel')){cancelling=row.id;render();return;}
    const note=Array.from(document.querySelectorAll('[data-order-note]')).find(input=>input.dataset.orderNote===row.id)?.value.trim()||'';
    const ticket=++revision,userId=window.adminIdentity.id;busy=true;
    $('#ordersList').querySelectorAll('button,textarea').forEach(control=>{control.disabled=true});$('#refreshOrders').disabled=true;
    $('#ordersLoadStatus').dataset.state='quiet';$('#ordersLoadStatus').textContent='Actualizando pedido…';
    try{
      await window.ordersApi.transition(row.id,row.status,next,note);
      if(ticket!==revision||window.adminIdentity?.id!==userId)return;
      cancelling=null;draftNotes.delete(row.id);busy=false;await load();
      document.dispatchEvent(new CustomEvent('dirtytask:order-stock-updated'));
    }catch(error){
      if(ticket!==revision||window.adminIdentity?.id!==userId)return;
      ready=false;busy=false;$('#refreshOrders').disabled=false;
      $('#ordersLoadStatus').dataset.state='error';
      $('#ordersLoadStatus').textContent='No se pudo confirmar el cambio. Actualiza los pedidos antes de reintentar. '+(error.message||'');
    }
  });
  document.addEventListener('dirtytask:auth',event=>{
    revision++;busy=false;ready=false;rows=[];cancelling=null;openOrders.clear();draftNotes.clear();$('#ordersSearch').value='';$('#ordersStatusFilter').value='all';render();
    $('#ordersLoadStatus').textContent='Pedidos pendientes de carga.';
    if(event.detail)load();
  });
  function orderMarkup(row,canEdit){
    const customer=row.customer||{},steps=transitions[row.status]||[];
    const quantity=(row.shop_order_line||[]).reduce((sum,line)=>sum+Number(line.qty),0);
    const payment={cash:'Efectivo',visa_installments:'Visa cuotas',visalink:'Tarjeta de crédito'}[row.payment_method_code]||row.payment_method_code;
    const primary=steps.find(status=>status!=='cancelled');
    const disabled=canEdit?'':' disabled';
    const action=(status,label,extra='')=>`<button class="admin-button ${status==='cancelled'?'admin-button-quiet':'admin-button-dark'}" type="button" data-order-id="${escape(row.id)}" data-next-status="${status}" ${extra}${disabled}>${label}</button>`;
    const history=[...(row.order_status_event||[])].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
    return `<article class="order-card"><details data-order-detail="${escape(row.id)}"${openOrders.has(row.id)?' open':''}>
      <summary class="order-row"><div class="order-identity"><span class="order-reference">#${escape(row.id.slice(0,8).toUpperCase())}</span><h2>${escape([customer.first_name,customer.last_name].filter(Boolean).join(' ')||'Cliente')}</h2><span class="order-date">${escape(date(row.placed_at))}</span></div>
      <div class="order-brief"><span>${quantity} ${quantity===1?'pieza':'piezas'}</span><small>${escape(payment)}</small></div><span class="order-status order-status-${escape(row.status)}">${escape(labels[row.status]||row.status)}</span><strong class="order-total">${escape(money(row.total_cents,row.currency))}</strong><span class="order-chevron" aria-hidden="true">⌄</span></summary>
      <div class="order-detail"><div class="order-detail-grid"><section><h3>Entrega</h3><p>${escape([row.street_address,row.neighborhood].filter(Boolean).join(', '))}<br>${escape([row.municipality,row.department?.name].filter(Boolean).join(', '))}</p><a class="order-phone" href="tel:${escape(String(row.phone||'').replace(/[^\d+]/g,''))}">${escape(row.phone)}</a><p class="order-secondary">NIT: ${escape(row.nit||'CF')}</p></section>
      <section><h3>Productos</h3><ul class="order-lines">${[...(row.shop_order_line||[])].sort((a,b)=>a.id.localeCompare(b.id)).map(line=>`<li><div><strong>${escape(line.product_name)}</strong><span>${escape(line.variant_label)} · ${escape(line.qty)} ${Number(line.qty)===1?'unidad':'unidades'}${line.preorder?' · Preventa':''}</span></div><span>${escape(money(Number(line.unit_price_cents)*Number(line.qty),row.currency))}</span></li>`).join('')}</ul><dl class="order-totals"><div><dt>Subtotal</dt><dd>${escape(money(row.subtotal_cents,row.currency))}</dd></div><div><dt>Envío</dt><dd>${escape(money(row.shipping_cents,row.currency))}</dd></div></dl><p class="order-secondary">${escape(payment)}${row.installment_count?' · '+escape(row.installment_count)+' cuotas':''}</p></section></div>
      <section class="order-history"><h3>Historial</h3><ol>${history.map(event=>`<li><div><strong>${escape(labels[event.status]||event.status)}</strong><time>${escape(date(event.created_at))}</time></div>${event.note?'<p>'+escape(event.note)+'</p>':''}</li>`).join('')}</ol></section>
      ${steps.length?`<section class="order-workflow"><label>Nota para el historial <span>(opcional)</span><textarea maxlength="240" placeholder="Agrega un detalle sobre este cambio…" data-order-note="${escape(row.id)}"${disabled}>${escape(draftNotes.get(row.id)||'')}</textarea></label><div class="order-actions">${cancelling===row.id?`<p class="order-cancel-copy">¿Cancelar este pedido? Se devolverán al inventario las unidades que correspondan.</p>${action('cancelled','Confirmar cancelación','data-confirm-cancel')}<button class="text-button" type="button" data-abort-cancel>Conservar pedido</button>`:(primary?action(primary,actions[primary]):'')+(steps.includes('cancelled')?action('cancelled','Cancelar pedido'):'')}</div></section>`:''}
      <p class="order-full-reference">Referencia completa <code>${escape(row.id)}</code></p></div></details></article>`;
  }
  render();
})();
