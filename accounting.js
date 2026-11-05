(() => {
  'use strict';
  const A = window.Accounting;
  const movementLabels={...A.MOVEMENTS,statement:'Actualización de saldo'};
  // Remote records and approval requests share the financial adapter.
  const repository = window.obligationsRepository = window.Finance.obligations;
  const root = document.querySelector('#accountingRoot');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (cents, currency) => new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(cents / 100);
  const displayDate = value => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
  const canEdit=()=>window.adminIdentity?.role==='partner_finance';
  const knownBalance=(o,movements)=>o.knownBalance??A.balance(o,movements);
  const balancePending=(o,movements)=>o.balancePending??A.balanceUnconfirmed(o,movements);
  const button = (label, action, id = '', dark = false) => `<button type="button" class="admin-button ${dark ? 'admin-button-dark' : 'admin-button-quiet'}" data-acc-action="${action}" data-id="${escape(id)}"${['create','movement'].includes(action)&&!canEdit()?' disabled':''}>${label}</button>`;
  let snapshot = { obligations: [], movements: [] }, selected = null, bank = '', period = A.today().slice(0, 7), exportBusy = false;
  let cashAccountNames = new Map();
  const escAccount = id => escape(cashAccountNames.get(id) || '—');
  const objectUrls = new Set();
  const modal = document.createElement('dialog');
  modal.className = 'acc-dialog'; modal.setAttribute('aria-labelledby', 'accDialogTitle');
  document.body.append(modal);
  let returnFocus = null,revision=0,saving=false;
  modal.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
  modal.addEventListener('close', () => { if (returnFocus?.isConnected) returnFocus.focus(); else root.querySelector('button')?.focus(); });
  window.addEventListener('pagehide', () => objectUrls.forEach(url => URL.revokeObjectURL(url)));

  function message(text, error = false) {
    const target = root.querySelector('#accMessage');
    if (target) { target.textContent = text; target.classList.toggle('acc-error', error); }
  }
  function currencyTotals(fn) {
    return [...new Set(snapshot.obligations.map(o => o.currency))].map(currency => `<strong>${money(snapshot.obligations.filter(o => o.currency === currency).reduce((total, o) => total + fn(o), 0), currency)}</strong>`).join('') || '<strong>—</strong>';
  }
  function render() {
    const { obligations, movements } = snapshot;
    if (!selected || !obligations.some(o => o.id === selected)) selected = obligations[0]?.id;
    const filtered = obligations.filter(o => !bank || o.bank === bank);
    const banks = [...new Set(obligations.map(o => o.bank))];
    const overdue = obligations.filter(o => A.nextPayment(o, movements)?.overdue).length;
    root.innerHTML = `
      <div class="view-intro"><div><p class="admin-kicker">FINANZAS / CONTROL DE OBLIGACIONES</p><h1>Contabilidad<span>.</span></h1><p>Tu deuda, tus pagos y el siguiente paso.</p></div>${button('＋ Nueva obligación', 'create', '', true)}</div>

      <div class="acc-kpis">
        <article class="admin-panel"><span>SALDO CONOCIDO</span>${currencyTotals(o => knownBalance(o, movements))}<small>Puede incluir saldos por actualizar tras pagar cuotas</small></article>
        <article class="admin-panel"><span>CUOTAS MENSUALES</span>${currencyTotals(o => knownBalance(o, movements) > 0 ? o.installment : 0)}<small>Importe de referencia configurado</small></article>
        <article class="admin-panel"><span>PAGADO ESTE MES</span>${currencyTotals(o => movements.filter(m => m.obligationId === o.id && ['payment', 'principal'].includes(m.type) && m.date.slice(0, 7) === A.today().slice(0, 7)).reduce((s, m) => s + m.total, 0))}<small>Cuotas y abonos extraordinarios</small></article>
        <article class="admin-panel acc-kpi-dark"><span>POR REVISAR</span><strong>${overdue}</strong><small>Obligaciones con cuotas vencidas según el registro</small></article>
      </div>
      <div class="acc-section-heading"><div><h3>Obligaciones por banco</h3><p>${obligations.length} obligaciones · ${banks.length} bancos</p></div><label class="acc-filter">Banco<select id="accBank"><option value="">Todos los bancos</option>${banks.map(value => `<option ${bank === value ? 'selected' : ''} value="${escape(value)}">${escape(value)}</option>`).join('')}</select></label></div>
      <div class="acc-obligations">${filtered.map(o => {
        const pending = knownBalance(o, movements), next = A.nextPayment(o, movements);
        if (o.type === 'card') {
          const lastFour = /\d{4}$/.test(o.reference) ? o.reference.slice(-4) : '••••';
          return `<article class="admin-panel acc-obligation acc-credit-obligation ${selected === o.id ? 'is-selected' : ''}">
            <div class="acc-credit-face">
              <div class="acc-credit-header"><span>${escape(o.bank)}</span><span class="acc-credit-kind">CRÉDITO</span></div>
              <div class="acc-credit-hardware" aria-hidden="true"><span class="acc-credit-chip"><i></i></span><svg class="acc-contactless" viewBox="0 0 24 32" fill="none"><path d="M4 11q5 5 0 10M10 6q9 10 0 20M16 1q13 15 0 30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>
              <p class="acc-credit-number" aria-label="Número de tarjeta enmascarado">•••• •••• •••• ${escape(lastFour)}</p>
              <div class="acc-credit-bottom"><div><small>${balancePending(o, movements) ? 'SALDO POR ACTUALIZAR' : 'SALDO PENDIENTE'} · ${escape(o.currency)}</small><strong>${money(pending, o.currency)}</strong></div><span class="acc-credit-mark" aria-hidden="true"><i></i><i></i></span></div>
            </div>
            <div class="acc-credit-info"><h3>${escape(o.name)}</h3><p class="acc-due ${next?.overdue ? 'acc-overdue' : ''}">${next ? `${next.overdue ? 'Vencida' : 'Próximo pago'} · ${displayDate(next.dueDate)}<br>${money(next.remaining, o.currency)} por cubrir` : 'Sin saldo pendiente'}</p></div>
            <div class="acc-actions">${button('Ver detalle', 'detail', o.id)}${button('Registrar movimiento', 'movement', o.id, true)}</div>
          </article>`;
        }
        return `<article class="admin-panel acc-obligation ${selected === o.id ? 'is-selected' : ''}"><div class="acc-card-top"><span class="status-pill status-draft">${A.TYPES[o.type]}</span><span>${escape(o.currency)}</span></div><p class="acc-bank-name">${escape(o.bank)}</p><h3>${escape(o.name)}</h3><p class="acc-reference">${escape(o.reference)}</p><strong class="acc-balance">${money(pending, o.currency)}</strong>${balancePending(o, movements) ? '<small class="acc-overdue">Saldo pendiente de actualizar con el banco</small>' : ''}<p class="acc-due ${next?.overdue ? 'acc-overdue' : ''}">${next ? `${next.overdue ? 'Vencida' : 'Próximo pago'} · ${displayDate(next.dueDate)}<br>${money(next.remaining, o.currency)} por cubrir` : 'Sin saldo pendiente'}</p><div class="acc-actions">${button('Ver detalle', 'detail', o.id)}${button('Registrar movimiento', 'movement', o.id, true)}</div></article>`;
      }).join('') || '<p class="admin-panel">No hay obligaciones para este banco.</p>'}</div>
      <div id="accDetail">${detail()}</div>
      <section class="admin-panel acc-export"><div><h3>Datos para análisis</h3><p>Exporta obligaciones y movimientos con identificadores, moneda y desglose de pagos.</p></div><div class="acc-actions">${button('JSON completo', 'json')}${button('Obligaciones CSV', 'obligations-csv')}${button('Movimientos CSV', 'movements-csv')}</div><small>Los comprobantes no se incluyen. Los importes exportados están expresados en centavos.</small></section>
      <p id="accMessage" role="status"></p>`;
  }
  function detail() {
    const o = snapshot.obligations.find(entry => entry.id === selected);
    if (!o) return '';
    const movements = snapshot.movements.filter(m => m.obligationId === o.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const schedule = A.schedule(o, movements, period), remaining = knownBalance(o, movements);
    const status = !schedule.expected ? 'Sin cuota programada' : schedule.remaining === 0 ? 'Cuota cubierta' : schedule.paid ? 'Pago parcial' : 'Pendiente';
    return `<section class="admin-panel acc-detail"><div class="acc-section-heading"><div><p class="admin-kicker">DETALLE / ${escape(A.TYPES[o.type])}</p><h2>${escape(o.name)}</h2><p>${escape(o.bank)} · ${escape(o.reference)}</p></div>${button('＋ Movimiento', 'movement', o.id, true)}</div>
      <dl class="acc-facts"><div><dt>Saldo inicial registrado</dt><dd>${money(o.openingBalance, o.currency)}</dd></div><div><dt>${balancePending(o, movements) ? 'Saldo conocido · por actualizar' : 'Saldo actual'}</dt><dd>${money(remaining, o.currency)}</dd></div><div><dt>Fecha inicial</dt><dd>${displayDate(o.startDate)}</dd></div><div><dt>Día mensual de pago</dt><dd>${o.dueDay}</dd></div></dl>
      <div class="acc-schedule"><label>Consultar período<input id="accPeriod" type="month" value="${period}" min="2000-01" max="2099-12"></label><div><strong>${status}</strong><p>Vence ${displayDate(schedule.dueDate)} · Pagado ${money(schedule.paid, o.currency)} de ${money(schedule.expected, o.currency)}</p><progress max="${schedule.expected || 1}" value="${Math.min(schedule.paid, schedule.expected)}" aria-label="Cobertura de cuota"></progress></div><strong>${money(schedule.remaining, o.currency)}<small>pendiente de cuota</small></strong></div>
      <p class="acc-help">Las cuotas se registran por el total pagado, sin pedir desglose. El saldo solo se actualiza si informas el saldo del banco; en caso contrario se conserva el último conocido. Un abono a capital reduce ese saldo, pero no cubre la cuota del período. No se calculan intereses futuros.</p>
      <h3>Historial de movimientos</h3><div class="table-wrap paper-ledger"><table class="admin-table acc-table"><thead><tr><th>FECHA / PERÍODO</th><th>MOVIMIENTO</th><th>MONTO</th><th>CAPITAL</th><th>SALDO INFORMADO</th><th>CUENTA</th><th>COMPROBANTE</th></tr></thead><tbody>${movements.map(m => `<tr><td>${displayDate(m.date)}<small>${m.period || '—'}</small></td><td><strong>${escape(movementLabels[m.type]||m.type)}</strong><small class="acc-notes">${escape(m.notes)}</small></td><td>${money(m.total, o.currency)}</td><td>${m.principalKnown === false ? 'Sin desglose' : money(m.principal, o.currency)}</td><td>${m.statementBalance != null ? money(m.statementBalance, o.currency) : '—'}</td><td>${escAccount(m.sourceAccountId)}</td><td>${m.attachment ? button('Ver comprobante', 'attachment', m.attachment.id) : 'Sin adjunto'}</td></tr>`).join('') || '<tr><td colspan="7">Todavía no hay movimientos registrados.</td></tr>'}</tbody></table></div></section>`;
  }
  function input(label, name, type = 'text', value = '', attrs = '') {
    return `<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${attrs}></label>`;
  }
  function select(label, name, options) {
    return `<label>${label}<select name="${name}">${Object.entries(options).map(([key, label]) => `<option value="${escape(key)}">${escape(label)}</option>`).join('')}</select></label>`;
  }
  async function openForm(kind, obligationId) {
    if(!canEdit())return;
    const userId=window.adminIdentity.id,requestKey=crypto.randomUUID();
    const cashAccounts = (await window.cashRepository.list()).accounts;if(window.adminIdentity?.id!==userId)return;
    cashAccountNames = new Map(cashAccounts.map(a => [a.id, a.name]));
    returnFocus = document.activeElement;
    const o = snapshot.obligations.find(item => item.id === obligationId);
    const types = o?.type === 'card' ? movementLabels : { payment: movementLabels.payment, principal: movementLabels.principal,statement:movementLabels.statement };
    const positive = 'required min="0.01" max="9999999999.99" step="0.01"';
    const nonnegative = 'required min="0" max="9999999999.99" step="0.01"';
    modal.innerHTML = `<form id="accForm"><header><div><p class="admin-kicker">${kind === 'create' ? 'REGISTRO / OBLIGACIÓN' : escape(o.name) + ' / ' + escape(o.currency)}</p><h2 id="accDialogTitle">${kind === 'create' ? 'Nueva obligación' : 'Registrar movimiento'}</h2></div><button type="button" class="editor-close" data-close aria-label="Cerrar">×</button></header>
      <div class="acc-form-fields">${kind === 'create' ?
      input('Banco', 'bank', 'text', '', 'required maxlength="100"') + input('No. préstamo / referencia', 'reference', 'text', '', 'required maxlength="60"') + input('Nombre de la obligación', 'name', 'text', '', 'required maxlength="100"') + select('Tipo', 'type', A.TYPES) + select('Moneda', 'currency', { GTQ: 'GTQ · Quetzales', USD: 'USD · Dólares' }) + input('Saldo inicial pendiente', 'openingBalance', 'number', '', positive) + input('Cuota mensual de referencia', 'installment', 'number', '', positive) + input('Día mensual de pago', 'dueDay', 'number', '15', 'required min="1" max="31" step="1"') + input('Fecha inicial del registro', 'startDate', 'date', A.today(), `required min="2000-01-01" max="${A.today()}"`) :
      `<input type="hidden" name="obligationId" value="${escape(o.id)}">` + select('Tipo de movimiento', 'type', types) + input('Fecha del movimiento', 'date', 'date', A.today(), `required min="${o.startDate}" max="${A.today()}"`) + input('Monto total', 'total', 'number', '', positive) + `<div data-payment-field>${input('Período de la cuota', 'period', 'month', A.today().slice(0, 7), `required min="${A.firstPeriod(o)}" max="2099-12"`)}</div><div data-statement-field>${input('Saldo pendiente según el banco (opcional)', 'statementBalance', 'number', '', 'min="0" step="0.01"')}</div><div data-account-field>${select('Cuenta / caja de salida', 'accountId', Object.fromEntries(cashAccounts.filter(a => a.currency === o.currency).map(a => [a.id, a.name + ' · ' + a.currency])))}</div><p class="acc-help acc-wide" id="accCalculation" aria-live="polite"></p><label class="acc-wide">Comprobante (opcional)<input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf"><small>Imagen o PDF · máximo 5 MB · guardado en almacenamiento privado</small></label><label class="acc-wide">Notas (opcional)<textarea name="notes" rows="2" maxlength="500"></textarea></label>`}</div>
      ${kind === 'create' ? '<p class="acc-help">Registra el saldo a partir del cual comenzarás el seguimiento. No ingreses movimientos anteriores a esa fecha. Los días 29–31 se ajustan al último día del mes.</p>' : ''}
      <p id="accFormError" class="acc-error" role="alert" hidden></p><footer>${button('Cancelar', 'cancel')}<button class="admin-button admin-button-dark" type="submit">Guardar ${kind === 'create' ? 'obligación' : 'movimiento'}</button></footer></form>`;
    const form = modal.querySelector('form');
    const error = form.querySelector('#accFormError');
    const update = () => {
      if (kind === 'create') return;
      const isPayment = form.elements.type.value === 'payment',isStatement=form.elements.type.value==='statement';
      const statementField=form.querySelector('[data-statement-field]');statementField.hidden=!isPayment&&!isStatement;form.elements.statementBalance.disabled=statementField.hidden;form.elements.statementBalance.required=isStatement;
      form.elements.total.closest('label').hidden=isStatement;form.elements.total.disabled=isStatement;form.elements.total.required=!isStatement;
      form.querySelectorAll('[data-payment-field]').forEach(el => { el.hidden = !isPayment; el.querySelectorAll('input').forEach(input => { input.disabled = !isPayment; }); });
      const output = form.querySelector('#accCalculation');
      const isOutflow = ['payment', 'principal'].includes(form.elements.type.value);
      const accountField = form.querySelector('[data-account-field]');
      accountField.hidden = !isOutflow;
      form.elements.accountId.disabled = !isOutflow;
      form.elements.accountId.required = isOutflow;
      output.textContent = isStatement?'Registra el saldo que informa el banco. No genera una salida de dinero.':isPayment ? 'Ingresa solo lo que pagaste. Si no informas el saldo del banco, se conserva el último saldo conocido y queda pendiente de actualizar.' : form.elements.type.value === 'principal' ? 'Todo el monto reduce el capital y sale de la cuenta seleccionada. No cubre una cuota.' : 'Este movimiento aumenta la deuda de tarjeta; no mueve dinero de tus cuentas.';
    };
    form.addEventListener('input', update); form.addEventListener('change', update);
    form.querySelector('[data-close]').onclick = () => {if(!saving)modal.close()};
    form.querySelector('[data-acc-action="cancel"]').onclick = () => {if(!saving)modal.close()};

    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving||!canEdit()||window.adminIdentity?.id!==userId) return;
      saving = true; error.hidden = true;
      const values = {...Object.fromEntries(new FormData(form)),requestKey};
      const file = form.elements.receipt?.files[0];
      const controls = [...form.querySelectorAll('button,input,select,textarea')].filter(control=>!control.disabled); controls.forEach(button => button.disabled = true);
      try {
        const result = kind === 'create' ? await repository.createObligation(values) : await repository.addMovement(values, file);
        if(window.adminIdentity?.id!==userId)return;
        if(!result.pending)selected = kind === 'create' ? result.id : result.obligationId;
        bank = ''; snapshot = await repository.list(); modal.close(); render();
        document.dispatchEvent(new Event('cash:changed'));
        message('Solicitud enviada. Se aplicará cuando la revise el otro socio.');
      } catch (err) { if(window.adminIdentity?.id!==userId)return;error.textContent = err.message || 'No se pudo guardar. Intenta de nuevo.'; error.hidden = false; }
      finally { saving = false; controls.forEach(button => button.disabled = false); }
    });
    modal.showModal(); update();
  }
  function download(content, name, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function csv(rows, columns) {
    const cell = value => {
      let text = String(value ?? '');
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [columns, ...rows.map(row => columns.map(key => row[key]))].map(row => row.map(cell).join(',')).join('\r\n');
  }
  root.addEventListener('change', event => {
    if (event.target.id === 'accBank') { bank = event.target.value; const match = snapshot.obligations.find(o => !bank || o.bank === bank); selected = match?.id; render(); root.querySelector('#accBank').focus(); }
    if (event.target.id === 'accPeriod' && event.target.value && event.target.validity.valid) { period = event.target.value; root.querySelector('#accDetail').innerHTML = detail(); root.querySelector('#accPeriod').focus(); }
  });
  root.addEventListener('click', async event => {
    const control = event.target.closest('[data-acc-action]'); if (!control) return;
    const action = control.dataset.accAction, id = control.dataset.id;
    try {
      if (action === 'create' || action === 'movement') return await openForm(action, id);
      if (action === 'detail') { selected = id; render(); const detail = root.querySelector('#accDetail'); detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); detail.querySelector('button')?.focus({ preventScroll: true }); return; }
      if (action === 'attachment') {
        const file = await repository.getAttachment(id), url = URL.createObjectURL(file); objectUrls.add(url);
        returnFocus = control;
        modal.innerHTML = `<header><h2 id="accDialogTitle">Comprobante</h2><button class="editor-close" type="button" aria-label="Cerrar">×</button></header><p>${escape(file.name)}</p>${file.type.startsWith('image/')?`<img class="acc-receipt" src="${url}" alt="Comprobante de pago">`:'<p>Comprobante PDF disponible para descargar.</p>'}<p><a href="${url}" download="${escape(file.name)}">Descargar comprobante</a></p>`;
        modal.querySelector('button').onclick = () => {if(!saving)modal.close()};
        modal.addEventListener('close', () => { URL.revokeObjectURL(url); objectUrls.delete(url); }, { once: true });
        modal.showModal(); return;
      }
      if (exportBusy) return; exportBusy = true;
      const data = await repository.list();
      if (action === 'json') download(JSON.stringify({ ...data, exportedAt: new Date().toISOString(), moneyUnit: 'minor', attachmentsIncluded: false }, null, 2), 'contabilidad.json', 'application/json');
      if (action === 'obligations-csv') download(csv(data.obligations, ['id', 'bank', 'reference', 'name', 'type', 'currency', 'openingBalance', 'installment', 'dueDay', 'startDate', 'createdAt']), 'obligaciones.csv', 'text/csv;charset=utf-8');
      if (action === 'movements-csv') download(csv(data.movements.map(m => ({ ...m, currency: data.obligations.find(o => o.id === m.obligationId).currency, attachmentId: m.attachment?.id || '' })), ['id', 'obligationId', 'sequence', 'type', 'date', 'period', 'currency', 'total', 'principal', 'principalKnown', 'statementBalance', 'sourceAccountId', 'interest', 'fees', 'notes', 'attachmentId', 'createdAt']), 'movimientos.csv', 'text/csv;charset=utf-8');
      message('Exportación preparada. Los comprobantes se conservan en almacenamiento privado.');
    } catch (error) { message(error.message || 'No se pudo completar la acción.', true); }
    finally { exportBusy = false; }
  });
  async function refresh(){
    if(!window.adminIdentity)return;
    const ticket=++revision;
    try{const [data,cash]=await Promise.all([repository.list(),window.cashRepository.list()]);if(ticket!==revision)return;cashAccountNames=new Map(cash.accounts.map(a=>[a.id,a.name]));snapshot=data;render();}
    catch(error){if(ticket===revision)root.textContent=error.message||'No se pudo cargar Contabilidad.';}
  }
  document.addEventListener('finance:loaded',refresh);
  document.addEventListener('dirtytask:auth',event=>{revision++;snapshot={obligations:[],movements:[]};selected=null;bank='';cashAccountNames.clear();for(const url of objectUrls)URL.revokeObjectURL(url);objectUrls.clear();if(modal.open)modal.close();modal.replaceChildren();returnFocus=null;root.replaceChildren();if(event.detail)refresh();});
  refresh();
})();
