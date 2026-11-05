(() => {
  const root=document.querySelector('#financeApprovals'),status=document.querySelector('#financeLoadStatus'),refreshButton=document.querySelector('#refreshFinance');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const titles={account_open:'Nueva cuenta o caja',obligation_open:'Nueva obligación',receipt:'Cobro o anticipo',expense:'Gasto',income:'Ingreso',transfer:'Transferencia',settlement_open:'Cobro de mensajería',settlement_confirm:'Depósito de mensajería',obligation_movement:'Movimiento de obligación',sale_adjustment:'Ajuste de venta',reverse_manual:'Reversión de ingreso o gasto'};
  const names={name:'Nombre',account_type:'Tipo de cuenta',bank_name:'Banco',reference_last4:'Últimos dígitos',currency:'Moneda',opening_balance_cents:'Saldo inicial',opened_on:'Fecha inicial',reference:'Referencia',obligation_type:'Tipo de obligación',installment_cents:'Cuota mensual',due_day:'Día de pago',start_date:'Fecha inicial',sale_id:'Venta',account_id:'Cuenta',business_date:'Fecha',amount_cents:'Importe',category:'Categoría',concept:'Concepto',from_account_id:'Origen',to_account_id:'Destino',reason:'Motivo',obligation_id:'Obligación',movement_type:'Movimiento',period_month:'Período',total_cents:'Total',principal_known:'Capital desglosado',statement_balance_cents:'Saldo informado por el banco',notes:'Notas',courier:'Mensajería',settlement_id:'Liquidación',confirmed_on:'Fecha del depósito',service_cents:'Servicio retenido',commission_cents:'Comisión retenida',discount_cents:'Descuentos',adjustment_cents:'Ajuste positivo',received_cents:'Depósito recibido',attachment_id:'Comprobante',allocations:'Ventas incluidas',entry_id:'Movimiento original'};
  const valueLabels={bank:'Cuenta bancaria',cash:'Efectivo',loan:'Préstamo',financing:'Financiamiento',card:'Tarjeta',payment:'Cuota',principal:'Abono a capital',purchase:'Consumo',charge:'Cargo',statement:'Actualización de saldo'};
  const date=value=>new Intl.DateTimeFormat('es-GT',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Guatemala'}).format(new Date(value));
  let snapshot=null,revision=0,busy=false,filter='pending';const notes=new Map();let objectUrl;
  function money(value,currency){return new Intl.NumberFormat('es-GT',{style:'currency',currency:currency||'GTQ'}).format(Number(value)/100)}
  function render(){
    if(!snapshot){root.replaceChildren();document.querySelector('#financePendingCount').hidden=true;return;}
    const person=id=>snapshot.people.find(p=>p.id===id)?.display_name||'Socio';
    const pending=snapshot.requests.filter(r=>r.status==='pending');
    const recent=snapshot.requests.filter(r=>r.status!=='pending');
    const reconciliations=snapshot.reconciliations.filter(r=>!r.reviewed_by);
    const mine=snapshot.requests.filter(r=>r.requested_by===window.adminIdentity?.id);
    const visibleReconciliations=snapshot.reconciliations.filter(r=>filter==='pending'?!r.reviewed_by:filter==='mine'?r.prepared_by===window.adminIdentity?.id:filter==='history'?Boolean(r.reviewed_by):true);
    const requests=filter==='pending'?pending:filter==='mine'?mine:filter==='history'?recent:[...pending,...recent];
    const badge=document.querySelector('#financePendingCount');badge.textContent=pending.length+reconciliations.length;badge.hidden=!Number(badge.textContent);
    const filters=[['pending','Pendientes',pending.length+reconciliations.length],['mine','Mis solicitudes',mine.length+snapshot.reconciliations.filter(r=>r.prepared_by===window.adminIdentity?.id).length],['history','Historial',recent.length+snapshot.reconciliations.filter(r=>r.reviewed_by).length],['all','Todas',snapshot.requests.length+snapshot.reconciliations.length]];
    root.innerHTML=`<div class="finance-review-summary"><div><strong>${pending.length}</strong><span>Solicitudes pendientes</span></div><div><strong>${reconciliations.length}</strong><span>Cuadres por verificar</span></div><div><strong>${recent.length}</strong><span>Solicitudes resueltas</span></div></div><p class="acc-help">Las solicitudes pendientes no modifican los saldos. Los socios requieren revisión cruzada. El administrador aplica sus operaciones directamente.</p><div class="finance-review-filters" role="group" aria-label="Filtrar aprobaciones">${filters.map(([key,label,count])=>`<button type="button" data-finance-filter="${key}" aria-pressed="${filter===key}">${label} <span>${count}</span></button>`).join('')}</div><div class="finance-request-list">${requests.map(r=>{
      const canReview=r.status==='pending'&&(window.adminIdentity?.role==='admin'||r.requested_by!==window.adminIdentity?.id&&snapshot.people.find(p=>p.id===r.requested_by)?.role!==window.adminIdentity?.role);
      const state={pending:'Pendiente',approved:'Aprobada',rejected:'Rechazada'}[r.status];
      const payload=r.payload||{};const currency=payload.currency||snapshot.cash.accounts.find(a=>a.id===(payload.account_id||payload.from_account_id))?.currency||snapshot.cash.sales.find(s=>s.id===payload.sale_id)?.currency||snapshot.debt.obligations.find(o=>o.id===payload.obligation_id)?.currency||snapshot.cash.settlements.find(s=>s.id===payload.settlement_id)?.currency||'GTQ';
      function value(key,v){
        if(v==null||v==='')return '—';
        if(key==='attachment_id'){const meta=snapshot.attachments.get(v);return meta?`<button class="text-button" type="button" data-finance-file="${esc(v)}">${esc(meta.name)}</button>`:'Sin adjunto';}
        if(key==='allocations')return Array.isArray(v)?v.map(a=>esc(snapshot.cash.sales.find(s=>s.id===a.sale_id)?.reference||a.sale_id)+' · '+esc(money(a.amount_cents,currency))).join('<br>'):'—';
        if(key.endsWith('_cents'))return esc(money(v,currency));
        if(['account_id','from_account_id','to_account_id'].includes(key))return esc(snapshot.cash.accounts.find(a=>a.id===v)?.name||v);
        if(key==='sale_id')return esc(snapshot.cash.sales.find(s=>s.id===v)?.reference||v);
        if(key==='obligation_id')return esc(snapshot.debt.obligations.find(o=>o.id===v)?.name||v);
        if(key==='settlement_id')return esc(snapshot.cash.settlements.find(t=>t.id===v)?.reference||v);
        if(key==='category')return esc(Object.hasOwn(window.Cash.categories,v)?window.Cash.categories[v]:v);
        if(typeof v==='boolean')return v?'Sí':'No';
        return esc(['account_type','obligation_type','movement_type'].includes(key)&&Object.hasOwn(valueLabels,v)?valueLabels[v]:v);
      }
      return `<article class="finance-request" data-request="${esc(r.id)}"><header><div><h3>${esc(titles[r.operation]||r.operation)}</h3><p>${esc(person(r.requested_by))} · ${esc(date(r.created_at))}</p></div><span class="status-pill ${r.status==='approved'?'status-active':r.status==='rejected'?'status-archived':'status-draft'}">${state}</span></header><details ${canReview?'open':''}><summary>Ver importes y datos de la solicitud</summary><dl class="finance-payload">${Object.entries(payload).map(([k,v])=>`<div><dt>${esc(Object.hasOwn(names,k)?names[k]:k)}</dt><dd>${value(k,v)}</dd></div>`).join('')}</dl></details>${canReview?`<label>Nota de revisión <span>(obligatoria para rechazar)</span><textarea data-finance-note="${esc(r.id)}" maxlength="500">${esc(notes.get(r.id)||'')}</textarea></label><div class="acc-actions"><button class="admin-button admin-button-dark" type="button" data-finance-review="${esc(r.id)}" data-approve="true" ${busy?'disabled':''}>Aprobar y aplicar</button><button class="admin-button admin-button-quiet" type="button" data-finance-review="${esc(r.id)}" data-approve="false" ${busy?'disabled':''}>Rechazar</button></div>`:r.status==='pending'?'<p class="acc-help">Pendiente de la revisión del otro socio.</p>':`<p class="acc-help">${esc(person(r.reviewed_by))}${r.reviewed_at?' · '+esc(date(r.reviewed_at)):''} · ${esc(r.review_note||'Sin nota')}</p>`}</article>`;
    }).join('')||(visibleReconciliations.length?'':'<div class="finance-review-empty"><h3>'+({pending:'No hay solicitudes pendientes',mine:'Aún no has enviado solicitudes',history:'Sin solicitudes resueltas',all:'No hay solicitudes registradas'}[filter])+'</h3><p>Las solicitudes aparecerán aquí con su estado y los datos de revisión.</p></div>')}${visibleReconciliations.map(r=>`<article class="finance-request"><header><h3>Cuadre · ${esc(snapshot.cash.accounts.find(a=>a.id===r.account_id)?.name||r.account_id)}</h3><span class="status-pill ${r.reviewed_by?'status-active':'status-draft'}">${r.reviewed_by?'Verificado':'Pendiente'} · ${esc(r.as_of_date)}</span></header><p>Saldo del libro: ${esc(money(r.recorded_balance_cents,snapshot.cash.accounts.find(a=>a.id===r.account_id)?.currency))} · Observado: ${esc(money(r.observed_balance_cents,snapshot.cash.accounts.find(a=>a.id===r.account_id)?.currency))} · Diferencia: ${esc(money(r.difference_cents,snapshot.cash.accounts.find(a=>a.id===r.account_id)?.currency))}</p><p>${esc(r.notes||'')} · Preparado por ${esc(person(r.prepared_by))}</p><p class="acc-help">Revisar el cuadre cierra las fechas hasta ${esc(r.as_of_date)} para nuevos movimientos de esta cuenta.</p>${r.reviewed_by?`<p class="acc-help">Verificado por ${esc(person(r.reviewed_by))}${r.reviewed_at?' · '+esc(date(r.reviewed_at)):''}</p>`:(window.adminIdentity?.role==='admin'||r.prepared_by!==window.adminIdentity?.id)?`<button class="admin-button admin-button-dark" type="button" data-finance-reconcile="${esc(r.id)}" ${busy?'disabled':''}>Revisar y cerrar período</button>`:'<p class="acc-help">Pendiente del otro socio.</p>'}</article>`).join('')}</div>`;
  }
  async function refresh(){
    if(!window.adminIdentity||busy)return;
    const ticket=++revision;refreshButton.disabled=true;status.dataset.state='quiet';status.textContent='Cargando contabilidad…';
    try{const next=await window.Finance.refresh();if(ticket!==revision)return;snapshot=next;status.textContent='Contabilidad cargada.';render()}
    catch(error){if(ticket===revision){status.dataset.state='error';status.textContent='No se pudo actualizar Contabilidad. Los datos visibles pueden ser anteriores. '+(error.message||'Reintenta.');}}
    finally{if(ticket===revision)refreshButton.disabled=false;}
  }
  root.addEventListener('input',event=>{if(event.target.matches('[data-finance-note]'))notes.set(event.target.dataset.financeNote,event.target.value)});
  root.addEventListener('click',async event=>{
    const filterButton=event.target.closest('[data-finance-filter]');
    if(filterButton){filter=filterButton.dataset.financeFilter;render();root.querySelector('[data-finance-filter="'+filter+'"]').focus();return;}
    const file=event.target.closest('[data-finance-file]');
    if(file){const userId=window.adminIdentity?.id;try{const data=await window.Finance.getAttachment(file.dataset.financeFile);if(userId!==window.adminIdentity?.id)return;if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=URL.createObjectURL(data);const link=document.createElement('a');link.href=objectUrl;link.download=data.name;link.click();}catch(error){status.dataset.state='error';status.textContent=error.message;}return;}
    const control=event.target.closest('[data-finance-review],[data-finance-reconcile]');if(!control||busy)return;
    const id=control.dataset.financeReview,approve=control.dataset.approve==='true',note=notes.get(id)||'';
    if(id&&!approve&&!note.trim()){root.querySelector(`[data-finance-note="${id}"]`).focus();status.dataset.state='error';status.textContent='Escribe el motivo de rechazo.';return;}
    const ticket=revision,userId=window.adminIdentity?.id;busy=true;render();status.dataset.state='quiet';status.textContent='Aplicando revisión…';
    try{if(id)await window.Finance.review(id,approve,note);else await window.Finance.reviewReconciliation(control.dataset.financeReconcile);if(ticket!==revision||userId!==window.adminIdentity?.id)return;notes.delete(id);busy=false;await refresh();}
    catch(error){if(ticket===revision&&userId===window.adminIdentity?.id){busy=false;render();status.dataset.state='error';status.textContent='No se pudo confirmar la revisión. '+(error.message||'Actualiza antes de reintentar.');}}
  });
  refreshButton.addEventListener('click',refresh);
  document.addEventListener('finance:changed',refresh);
  document.addEventListener('dirtytask:auth',event=>{revision++;busy=false;snapshot=null;filter='pending';notes.clear();if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null}render();status.textContent='';refreshButton.disabled=!event.detail;if(event.detail)refresh()});
  if(window.adminIdentity)refresh();
})();
