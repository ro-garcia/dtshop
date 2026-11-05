(() => {
  'use strict';
  const A = window.Accounting, C = window.Cash;
  const repo = window.cashRepository = window.Finance.cash;
  const root = document.querySelector('#cashRoot'), nav = document.querySelector('#financeNav');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (value, currency = 'GTQ') => new Intl.NumberFormat('es-GT', { style: 'currency', currency }).format(value / 100);
  const can=kind=>['account','confirm','expense','income','transfer'].includes(kind)?['partner_finance','admin'].includes(window.adminIdentity?.role):['sale','import-order'].includes(kind)?['partner_ops','admin'].includes(window.adminIdentity?.role):['partner_ops','partner_finance','admin'].includes(window.adminIdentity?.role);
  const mutations=['account','sale','collect','adjust','settlement','confirm','expense','income','transfer','reconcile','import-order'];
  const btn = (label, action, id = '', primary = false) => `<button type="button" class="admin-button ${primary ? 'admin-button-dark' : 'admin-button-quiet'}" data-cash-action="${action}" data-id="${esc(id)}"${mutations.includes(action)&&!can(action)?' disabled':''}>${label}</button>`;
  const channel = { web: 'Web', external: 'Externa', physical: 'Física' };
  let tab = 'summary', data, accountId = '', saleId = '', from = A.today().slice(0, 7) + '-01', to = A.today(), renderVersion = 0;
  const modal = document.createElement('dialog'); modal.className = 'acc-dialog cash-dialog'; modal.setAttribute('aria-labelledby', 'cashDialogTitle'); document.body.append(modal);
  let opener, saving = false;
  modal.addEventListener('cancel', e => { if (saving) e.preventDefault(); });
  modal.addEventListener('close', () => { if (opener?.isConnected) opener.focus(); else root.querySelector('button')?.focus(); });
  const dates = () => `<div class="cash-range"><label>Desde<input type="date" id="cashFrom" value="${from}" max="${A.today()}" min="2000-01-01"></label><label>Hasta<input type="date" id="cashTo" value="${to}" max="${A.today()}" min="2000-01-01"></label><div class="acc-actions">${btn('Hoy', 'today')}${btn('Esta semana', 'week')}${btn('Este mes', 'month')}</div></div>`;
  const accountName = id => data.accounts.find(a => a.id === id)?.name || 'Cuenta';
  const saleName = id => data.sales.find(s => s.id === id)?.reference || 'Venta';
  const receipt = meta => meta ? btn('Comprobante', 'file', meta.id) : '<span class="cash-muted">Sin adjunto</span>';
  const status = s => s.customerDue > 0 ? 'Por cobrar' : s.courierDue > 0 ? 'En mensajería' : 'Pagada';
  const panel = (title, content) => `<section class="admin-panel cash-panel"><h3>${title}</h3>${content}</section>`;
  const table = (headings, rows, empty = 'Sin movimientos en este período.') => `<div class="table-wrap paper-ledger"><table class="admin-table"><thead><tr>${headings.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${headings.length}">${empty}</td></tr>`}</tbody></table></div>`;
  async function render() {
    const version = ++renderVersion;
    const snapshot = await repo.list(); if (version !== renderVersion) return; data = snapshot;
    accountId ||= data.accounts[0]?.id; saleId ||= data.sales[0]?.id;
    const titles = { summary: ['Tu dinero, a la vista.', 'Resumen'], accounts: ['Cada cuenta, cada movimiento.', 'Cuentas y caja'], sales: ['Ventas, apartados y cobros.', 'Ventas y cobros'], courier: ['Del pedido al depósito.', 'Mensajería'], entries: ['Entradas y salidas bajo control.', 'Ingresos y gastos'] };
    if (tab === 'debt' || tab === 'approvals') return;
    let body = '';
    if (tab === 'summary') {
      const report = await repo.report(from, to);
      body = dates() + Object.entries(report).map(([currency, r]) => `<section class="cash-currency"><p class="admin-kicker">${currency} / AL ${to}</p><div class="acc-kpis">${[['Disponible', r.balance], ['Entradas del período', r.incoming], ['Salidas del período', r.outgoing], ['Flujo neto', r.incoming - r.outgoing]].map(([label, value]) => `<article class="admin-panel"><span>${label.toUpperCase()}</span><strong>${money(value, currency)}</strong></article>`).join('')}</div><div class="cash-report-grid">${panel('Ventas y cobros', `<dl class="cash-metrics"><div><dt>Ventas acordadas en el período</dt><dd>${money(r.sales, currency)}</dd></div><div><dt>Clientes pendientes al cierre</dt><dd>${money(r.customerDue, currency)}</dd></div><div><dt>Mensajería pendiente al cierre</dt><dd>${money(r.courierDue, currency)}</dd></div></dl>`)}${panel('Destino del dinero', `<dl class="cash-metrics"><div><dt>Gastos operativos pagados</dt><dd>${money(r.operatingExpenses, currency)}</dd></div><div><dt>Retenciones de mensajería</dt><dd>${money(r.withheld, currency)}</dd></div><div><dt>Pagos de obligaciones</dt><dd>${money(r.debtPayments, currency)}</dd></div><div><dt>Aportes y financiamiento recibido</dt><dd>${money(r.contributions, currency)}</dd></div></dl>`)}</div></section>`).join('');
      body += '<p class="acc-help">El disponible incluye los saldos iniciales. El flujo excluye transferencias internas. Las retenciones ya se descontaron del depósito de mensajería: no son otra salida bancaria. Estos indicadores muestran flujo de dinero, no utilidad neta.</p>';
      body += await accountCards();
    }
    if (tab === 'accounts') {
      body = `<div class="cash-toolbar">${btn('＋ Cuenta o caja', 'account', '', true)}${btn('Transferir entre cuentas', 'transfer')}${data.accounts.length?btn('Conciliar saldo','reconcile',accountId):''}</div>` + await accountCards() + dates();
      if (accountId) {
        const l = await repo.accountLedger(accountId, from, to);
        body += panel(`Libro de ${esc(l.account.name)}`, `<div class="cash-book-heading"><span>Saldo inicial del rango: <b>${money(l.opening, l.account.currency)}</b></span><span>Saldo al cierre: <b>${money(l.balance, l.account.currency)}</b></span></div>` + table(['FECHA', 'REFERENCIA / CONCEPTO', 'ENTRADA', 'SALIDA', 'SALDO', 'ADJUNTO'], l.rows.map(e => `<tr><td>${e.date}</td><td>${esc(e.concept)}<small>${esc(e.sourceType)} · ${esc(e.id.slice(0, 8))}</small></td><td>${e.direction === 'in' ? money(e.amount, e.currency) : '—'}</td><td>${e.direction === 'out' ? money(e.amount, e.currency) : '—'}</td><td><b>${money(e.balance, e.currency)}</b></td><td>${receipt(e.attachment)}</td></tr>`)));
      }
    }
    if (tab === 'sales') {
      const states = await Promise.all(data.sales.map(s => repo.saleStatus(s.id)));
      body = `<div class="cash-toolbar">${btn('＋ Registrar venta', 'sale', '', true)}</div>` + table(['VENTA / CLIENTE', 'CANAL', 'TOTAL', 'POR COBRAR', 'EN MENSAJERÍA', 'ESTADO', ''], data.sales.map((s, i) => `<tr><td>${esc(s.reference)}<small>${esc(s.customer || 'Sin cliente')}</small></td><td>${channel[s.channel]}</td><td>${money(states[i].total, s.currency)}</td><td>${money(states[i].customerDue, s.currency)}</td><td>${money(states[i].courierDue, s.currency)}</td><td>${status(states[i])}</td><td>${btn('Ver venta', 'sale-detail', s.id)}</td></tr>`), 'Registra tu primera venta.');
      const eligible=(await window.Finance.load()).orders;
      if(eligible.length&&['partner_ops','admin'].includes(window.adminIdentity?.role))body+=panel('Pedidos listos para registrar como venta',eligible.map(order=>`<div class="cash-book-heading"><span>#${esc(order.id.slice(0,8))} · ${money(order.total_cents,order.currency)}</span>${btn('Registrar venta del pedido','import-order',order.id)}</div>`).join(''));
      const s = data.sales.find(s => s.id === saleId);
      if (s) {
        const st = await repo.saleStatus(s.id);
        const direct = data.receipts.filter(r => r.saleId === s.id);
        const courier = data.settlements.filter(t => t.allocations.some(a => a.saleId === s.id));
        body += panel(`Venta ${esc(s.reference)}`, `<p>${esc(s.customer || 'Cliente sin nombre')} · ${channel[s.channel]} · ${s.date}</p><p>Envío: ${s.shippingMode === 'extra' ? money(s.shipping, s.currency) + ' adicional' : s.shippingMode === 'included' ? 'Incluido en el precio' : 'No aplica'}</p><ul class="cash-lines">${s.lines.map(l => `<li>${esc(l.name)} × ${l.qty}<b>${money(l.qty * l.unitPrice, s.currency)}</b></li>`).join('')}</ul><div class="cash-book-heading"><span>Total vigente: <b>${money(st.total, s.currency)}</b></span><span>Pendiente del cliente: <b>${money(st.customerDue, s.currency)}</b></span></div><div class="cash-toolbar">${btn('Registrar cobro / anticipo', 'collect', s.id, true)}${btn('Ajustar total acordado', 'adjust', s.id)}</div><h4>Cobros directos y efectivo</h4>` + table(['FECHA', 'DESTINO', 'MONTO', 'COMPROBANTE'], direct.map(r => `<tr><td>${r.date}</td><td>${esc(accountName(r.accountId))}</td><td>${money(r.amount, s.currency)}</td><td>${receipt(r.attachment)}</td></tr>`)) + `<h4>Cobros de mensajería</h4>` + table(['TRANSPORTISTA', 'COBRADO AL CLIENTE', 'ESTADO', 'DEPÓSITO'], courier.map(t => `<tr><td>${t.courier}<small>${t.date}</small></td><td>${money(t.allocations.find(a => a.saleId === s.id).amount, s.currency)}</td><td>${t.status === 'pending' ? 'Por liquidar' : 'Depositado'}</td><td>${t.confirmedDate || '—'} ${receipt(t.attachment)}</td></tr>`)) + (data.adjustments.some(a => a.saleId === s.id) ? `<h4>Ajustes al total</h4><ul class="cash-lines">${data.adjustments.filter(a => a.saleId === s.id).map(a => `<li>${a.date} · ${esc(a.reason)}<b>${money(a.amount, s.currency)}</b></li>`).join('')}</ul>` : ''));
      }
    }
    if (tab === 'courier') {
      body = `<div class="cash-toolbar">${btn('＋ Cobro de mensajería', 'settlement', '', true)}</div><p class="acc-help">Registra aquí importes que el transportista ya cobró al cliente. El dinero estará pendiente hasta confirmar el depósito. Forza: un pedido. Fast Delivery: uno o varios.</p><div class="cash-settlements">` + data.settlements.map(t => panel(`${t.courier} <span class="status-pill ${t.status === 'pending' ? 'status-warning' : 'status-active'}">${t.status === 'pending' ? 'Por liquidar' : 'Depositado'}</span>`, `<p>Cobrado el ${t.date} · ${esc(t.reference || t.id.slice(0, 8))}</p><ul class="cash-lines">${t.allocations.map(a => `<li>${esc(saleName(a.saleId))}<b>${money(a.amount, t.currency)}</b></li>`).join('')}</ul><dl class="cash-metrics"><div><dt>Bruto cobrado al cliente</dt><dd>${money(t.gross, t.currency)}</dd></div>${t.status === 'confirmed' ? `<div><dt>Mensajería / comisión / descuentos</dt><dd>${money(t.service + t.commission + t.discounts, t.currency)}</dd></div><div><dt>Ajuste positivo</dt><dd>${money(t.adjustment, t.currency)}</dd></div><div><dt>Depósito real</dt><dd>${money(t.received, t.currency)}</dd></div>` : ''}</dl>${t.status === 'pending' ? btn('Confirmar depósito', 'confirm', t.id, true) : `<p>${esc(accountName(t.accountId))} · ${t.confirmedDate}</p><p>${esc(t.reason || '')}</p>${receipt(t.attachment)}`}`)).join('') + '</div>';
    }
    if (tab === 'entries') {
      const entries = data.entries.filter(e => e.date >= from && e.date <= to && ['manual', 'obligation'].includes(e.sourceType)).sort((a, b) => b.date.localeCompare(a.date) || b.sequence - a.sequence);
      body = `<div class="cash-toolbar">${btn('＋ Gasto', 'expense', '', true)}${btn('＋ Otro ingreso', 'income')}</div>` + dates() + '<p class="acc-help">Registra ventas desde Ventas y cobros. No vuelvas a ingresar aquí depósitos de liquidaciones ni cobros ya registrados.</p>' + table(['FECHA', 'CUENTA / CAJA', 'CONCEPTO', 'CATEGORÍA', 'ENTRADA', 'SALIDA', 'ADJUNTO'], entries.map(e => `<tr><td>${e.date}</td><td>${esc(accountName(e.accountId))}</td><td>${esc(e.concept)}</td><td>${esc(C.categories[e.category] || e.category)}</td><td>${e.direction === 'in' ? money(e.amount, e.currency) : '—'}</td><td>${e.direction === 'out' ? money(e.amount, e.currency) : '—'}</td><td>${receipt(e.attachment)}</td></tr>`));
    }
    if (version !== renderVersion) return;
    root.innerHTML = `<div class="view-intro"><div><p class="admin-kicker">CONTABILIDAD / ${titles[tab][1].toUpperCase()}</p><h1>${titles[tab][1]}<span>.</span></h1><p>${titles[tab][0]}</p></div></div>${body}<section class="admin-panel cash-export"><div><h3>Exportar para análisis</h3><p>Datos relacionados por identificadores, importes en centavos y monedas separadas.</p></div><div class="acc-actions">${btn('JSON completo', 'export-json')}<select id="cashExportEntity" aria-label="Entidad a exportar">${['accounts', 'sales', 'saleLines', 'receipts', 'settlements', 'settlementAllocations', 'entries', 'transfers', 'adjustments'].map((x, i) => `<option value="${x}">${['Cuentas', 'Ventas', 'Productos vendidos', 'Cobros', 'Liquidaciones', 'Pedidos por liquidación', 'Libro de cuentas', 'Transferencias', 'Ajustes'][i]}</option>`).join('')}</select>${btn('CSV', 'export-csv')}</div></section><p id="cashMessage" role="status"></p>`;
  }
  async function accountCards() {
    const ledgers = await Promise.all(data.accounts.map(a => repo.accountLedger(a.id, from, to)));
    return `<div class="cash-account-cards">${ledgers.map(l => `<article class="admin-panel ${l.account.id === accountId ? 'cash-selected' : ''}"><p class="admin-kicker">${l.account.type === 'cash' ? 'EFECTIVO' : esc(l.account.bank)}</p><h3>${esc(l.account.name)}</h3><p>${l.account.reference ? '•••• ' + esc(l.account.reference) : l.account.currency}</p><strong>${money(l.balance, l.account.currency)}</strong><small>Saldo al ${to}</small>${btn('Ver libro', 'account-detail', l.account.id)}</article>`).join('')}</div>`;
  }
  const input = (label, name, type = 'text', value = '', attrs = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
  const select = (label, name, options) => `<label>${label}<select name="${name}">${options.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select></label>`;
  const amountInput = (label, name = 'amount', value = '', optional = false) => input(label, name, 'number', value, `${optional ? '' : 'required'} min="${optional ? 0 : '0.01'}" step="0.01" max="9999999999.99"`);
  const dateInput = () => input('Fecha', 'date', 'date', A.today(), `required min="2000-01-01" max="${A.today()}"`);
  const accountSelect = (label = 'Cuenta / caja', name = 'accountId', currency) => select(label, name, data.accounts.filter(a => !currency || a.currency === currency).map(a => [a.id, `${a.name} · ${a.currency}`]));
  const fileInput = () => '<label class="acc-wide">Comprobante (opcional)<input type="file" name="receipt" accept="image/jpeg,image/png,image/webp,application/pdf"><small>Imagen o PDF · máximo 5 MB · archivo privado</small></label>';
  function lineRow() {
    const products = window.adminCatalog.products();
    return `<div class="cash-sale-line">${select('Producto', 'product', [['', 'Artículo externo / manual'], ...products.map(p => [p.id, p.name])])}${input('Nombre', 'lineName', 'text', '', 'required maxlength="150"')}${input('Cantidad', 'qty', 'number', '1', 'required min="1" max="10000" step="1"')}${amountInput('Precio unitario', 'price')}<button type="button" class="text-button" data-remove-line>Quitar</button></div>`;
  }
  async function openForm(kind, id) {
    if(!can(kind))throw Error('Esta operación corresponde al otro socio.');
    const userId=window.adminIdentity?.id,requestKey=crypto.randomUUID();
    opener = document.activeElement; data = await repo.list();if(window.adminIdentity?.id!==userId)return;
    const s = data.sales.find(s => s.id === id), t = data.settlements.find(t => t.id === id);
    const names = { account: 'Nueva cuenta o caja', sale: 'Registrar venta', collect: 'Cobro o anticipo', adjust: 'Ajuste del total acordado', settlement: 'Cobro recibido por mensajería', confirm: 'Confirmar depósito', expense: 'Registrar gasto', income: 'Registrar otro ingreso', transfer: 'Transferir entre cuentas', reconcile:'Conciliar saldo de cuenta' };
    let fields = '', help = '';
    if (kind === 'account') fields = select('Tipo', 'type', [['bank', 'Cuenta bancaria'], ['cash', 'Caja de efectivo']]) + input('Nombre identificable', 'name', 'text', '', 'required maxlength="150"') + input('Banco (solo cuenta bancaria)', 'bank', 'text', '', 'maxlength="150"') + input('Últimos 4 dígitos (opcional)', 'reference', 'text', '', 'maxlength="4"') + select('Moneda', 'currency', [['GTQ', 'GTQ'], ['USD', 'USD']]) + amountInput('Saldo inicial', 'openingBalance', '0', true) + input('Fecha inicial', 'startDate', 'date', A.today(), `required min="2000-01-01" max="${A.today()}"`);
    if (kind === 'sale') {
      fields = input('Referencia (opcional)', 'reference', 'text', '', 'maxlength="60"') + input('Cliente / referencia (opcional)', 'customer', 'text', '', 'maxlength="100"') + dateInput() + select('Canal', 'channel', Object.entries(channel).filter(([value])=>value!=='web')) + select('Moneda', 'currency', [['GTQ', 'GTQ'], ['USD', 'USD']]) + select('Envío', 'shippingMode', [['extra', 'Adicional'], ['included', 'Incluido en el precio'], ['none', 'No aplica']]) + amountInput('Envío cobrado adicional', 'shipping', '0', true) + select('Lanzamiento (opcional)', 'launchId', [['', 'Sin lanzamiento'], ...window.adminCatalog.launches().map(l => [l.id, l.name])]) + `<div class="acc-wide" id="cashSaleLines">${lineRow()}</div><button type="button" class="admin-button admin-button-quiet" id="cashAddLine">＋ Otro producto</button>`;
      help = 'El catálogo está en GTQ. Para ventas en USD ingresa el precio acordado manualmente. Un envío incluido no se suma al total.';
    }
    if (kind === 'collect') { const st = await repo.saleStatus(id); fields = dateInput() + accountSelect('Recibido en', 'accountId', s.currency) + amountInput(`Monto · pendiente ${money(st.customerDue, s.currency)}`) + input('Referencia del pago (opcional)', 'reference', 'text', '', 'maxlength="100"') + fileInput(); help = `Venta ${s.reference}: admite anticipos y pagos restantes en cuentas distintas o efectivo.`; }
    if (kind === 'adjust') fields = dateInput() + select('Tipo de ajuste', 'direction', [['increase', 'Aumentar'], ['decrease', 'Disminuir']]) + amountInput('Importe del ajuste') + input('Motivo', 'reason', 'text', '', 'required maxlength="150"');
    if (kind === 'settlement') {
      const available = [];
      for (const sale of data.sales) { const st = await repo.saleStatus(sale.id); if (st.customerDue > 0) available.push({ sale, st }); }
      fields = select('Transportista', 'courier', [['Forza', 'Forza'], ['Fast Delivery', 'Fast Delivery']]) + dateInput() + input('Referencia de mensajería (opcional)', 'reference', 'text', '', 'maxlength="100"') + `<fieldset class="acc-wide cash-allocation-list"><legend>Pedidos cobrados por el transportista</legend>${available.map(({ sale, st }) => `<label class="cash-allocation"><input type="checkbox" name="saleIds" value="${sale.id}"><span>${esc(sale.reference)} · ${sale.currency}<small>Pendiente ${money(st.customerDue, sale.currency)}</small></span><input type="number" data-sale-amount="${sale.id}" aria-label="Monto cobrado ${esc(sale.reference)}" value="${(st.customerDue / 100).toFixed(2)}" min="0.01" max="${st.customerDue / 100}" step="0.01" disabled></label>`).join('') || '<p>No hay ventas pendientes por cobrar.</p>'}</fieldset>`;
      help = 'Selecciona solo importes que el transportista ya cobró. Fast permite agrupar pedidos de la misma moneda; Forza, uno. Todavía no ingresan a tu cuenta.';
    }
    if (kind === 'confirm') {
      fields = dateInput() + accountSelect('Cuenta del depósito', 'accountId', t.currency) + amountInput('Servicio de mensajería retenido', 'service', '0', true) + amountInput('Comisión retenida (importe)', 'commission', '0', true) + amountInput('Otros descuentos', 'discounts', '0', true) + amountInput('Ajuste positivo', 'adjustment', '0', true) + amountInput('Depósito efectivamente recibido', 'received', (t.gross / 100).toFixed(2)) + input('Motivo de ajustes / descuentos', 'reason', 'text', '', 'maxlength="150"') + fileInput();
      help = `${t.courier}: bruto cobrado ${money(t.gross, t.currency)}. El depósito debe coincidir con el bruto menos retenciones más ajustes. No se inventan porcentajes.`;
    }
    if (['income', 'expense'].includes(kind)) fields = dateInput() + accountSelect() + amountInput('Monto') + select('Categoría', 'category', kind === 'income' ? [['operating', 'Otro ingreso operativo'], ['contribution', 'Aporte de capital'], ['financing', 'Financiamiento recibido']] : [['advertising', 'Publicidad'], ['delivery', 'Mensajería'], ['supplies', 'Insumos'], ['other', 'Otros']]) + input('Concepto', 'concept', 'text', '', 'required maxlength="150"') + (kind === 'expense' ? select('Venta relacionada (opcional)', 'saleId', [['', 'Sin venta'], ...data.sales.map(s => [s.id, `${s.reference} · ${s.currency}`])]) : '') + fileInput();
    if (kind === 'transfer') fields = accountSelect('Cuenta de origen', 'fromId') + accountSelect('Cuenta de destino', 'toId') + dateInput() + amountInput('Monto') + input('Concepto', 'concept', 'text', '', 'required maxlength="150"') + fileInput();
    if(kind==='reconcile')fields=accountSelect('Cuenta / caja','accountId')+dateInput()+amountInput('Saldo observado','observed','0',true)+input('Notas','notes','text','','maxlength="500"')+fileInput();
    modal.innerHTML = `<form id="cashForm"><header><div><p class="admin-kicker">CONTROL DE DINERO</p><h2 id="cashDialogTitle">${names[kind]}</h2></div><button class="editor-close" type="button" data-close aria-label="Cerrar">×</button></header><div class="acc-form-fields">${fields}</div><p class="acc-help">${esc(help)}</p><p id="cashLiveTotal" role="status"></p><p id="cashFormError" class="acc-error" role="alert" hidden></p><footer><button type="button" class="admin-button admin-button-quiet" data-close>Cancelar</button><button type="submit" class="admin-button admin-button-dark">${kind==='sale'?'Registrar venta':'Enviar a revisión'}</button></footer></form>`;
    const form = modal.querySelector('form');if(kind==='reconcile'&&id)form.elements.accountId.value=id;
    form.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { if (!saving) modal.close(); });
    const update = () => {
      if(kind==='account'){const bank=form.elements.type.value==='bank';form.elements.bank.required=bank;form.elements.bank.disabled=!bank;form.elements.bank.closest('label').hidden=!bank;}
      if (kind === 'sale') {
        form.elements.shipping.disabled = form.elements.shippingMode.value !== 'extra';
        try {
          const total = [...form.querySelectorAll('.cash-sale-line')].reduce((sum, row) => sum + A.amount(row.querySelector('[name="price"]').value) * Number(row.querySelector('[name="qty"]').value), 0) + (form.elements.shipping.disabled ? 0 : A.amount(form.elements.shipping.value || '0'));
          form.querySelector('#cashLiveTotal').textContent = 'Total acordado: ' + money(total, form.elements.currency.value);
        } catch { form.querySelector('#cashLiveTotal').textContent = 'Completa los precios para calcular el total.'; }
      }
      if (kind === 'confirm') {
        try { const expected = t.gross - A.amount(form.elements.service.value || '0') - A.amount(form.elements.commission.value || '0') - A.amount(form.elements.discounts.value || '0') + A.amount(form.elements.adjustment.value || '0'); form.querySelector('#cashLiveTotal').textContent = 'Neto esperado: ' + money(expected, t.currency) + ' · Diferencia: ' + money(A.amount(form.elements.received.value || '0') - expected, t.currency); } catch { form.querySelector('#cashLiveTotal').textContent = 'Completa los montos.'; }
      }
    };
    form.addEventListener('input', update);
    form.addEventListener('change', e => {
      if (e.target.name === 'product') { const row = e.target.closest('.cash-sale-line'), p = window.adminCatalog.products().find(p => p.id === e.target.value); if (p) { row.querySelector('[name="lineName"]').value = p.name; row.querySelector('[name="price"]').value = form.elements.currency.value === 'GTQ' ? p.price : ''; } }
      if (e.target.name === 'currency' && kind === 'sale') form.querySelectorAll('.cash-sale-line').forEach(row => { if (row.querySelector('[name="product"]').value) row.querySelector('[name="price"]').value = ''; });
      if (e.target.name === 'saleIds') { const amount = form.querySelector(`[data-sale-amount="${e.target.value}"]`); amount.disabled = !e.target.checked; amount.required = e.target.checked; }
      update();
    });
    form.addEventListener('click', e => {
      if (e.target.closest('#cashAddLine') && form.querySelectorAll('.cash-sale-line').length < 30) form.querySelector('#cashSaleLines').insertAdjacentHTML('beforeend', lineRow());
      if (e.target.closest('[data-remove-line]') && form.querySelectorAll('.cash-sale-line').length > 1) e.target.closest('.cash-sale-line').remove();
      update();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return; saving = true;
      const error = form.querySelector('#cashFormError'); error.hidden = true;
      if(window.adminIdentity?.id!==userId||!can(kind)){saving=false;return;}
      const values = {...Object.fromEntries(new FormData(form)),requestKey}, file = form.elements.receipt?.files[0];
      const buttons = [...form.querySelectorAll('button,input,select,textarea')].filter(control=>!control.disabled); buttons.forEach(b => b.disabled = true);
      try {
        let result;
        if (kind === 'account') { result = await repo.createAccount(values); if(!result.pending)accountId = result.id; tab = 'accounts'; }
        if (kind === 'sale') { values.lines = [...form.querySelectorAll('.cash-sale-line')].map(row => ({ productId: row.querySelector('[name="product"]').value, name: row.querySelector('[name="lineName"]').value, qty: row.querySelector('[name="qty"]').value, price: row.querySelector('[name="price"]').value })); result = await repo.createSale(values); saleId = result.id; }
        if (kind === 'collect') result = await repo.collect({ ...values, saleId: id }, file);
        if (kind === 'adjust') result = await repo.adjustSale({ ...values, saleId: id });
        if (kind === 'settlement') result = await repo.createSettlement({ ...values, allocations: [...form.querySelectorAll('[name="saleIds"]:checked')].map(el => ({ saleId: el.value, amount: form.querySelector(`[data-sale-amount="${el.value}"]`).value })) });
        if (kind === 'confirm') result = await repo.confirmSettlement({ ...values, id }, file);
        if (kind === 'income' || kind === 'expense') result = await repo.addEntry({ ...values, direction: kind === 'income' ? 'in' : 'out' }, file);
        if (kind === 'transfer') result = await repo.transfer(values, file);
        if(kind==='reconcile')result=await repo.prepareReconciliation(values,file);
        if(window.adminIdentity?.id!==userId)return;
        modal.close(); await render(); syncNav(); const message=root.querySelector('#cashMessage');if(message)message.textContent=result?.pending?'Solicitud enviada. El saldo cambiará después de la revisión del otro socio.':'Operación registrada.';
      } catch (e) { if(window.adminIdentity?.id!==userId)return;error.textContent = e.message || 'No se pudo guardar.'; error.hidden = false; }
      finally { saving = false; buttons.forEach(b => b.disabled = false); }
    });
    modal.showModal(); update();
  }
  function syncNav() {
    nav.querySelectorAll('button').forEach(b => { if (b.dataset.cashTab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    root.hidden = tab === 'debt' || tab === 'approvals'; document.querySelector('#accountingRoot').hidden = tab !== 'debt';
    document.querySelector('#financeApprovalPanel').hidden = tab !== 'approvals';
  }
  nav.addEventListener('click', e => { const b = e.target.closest('[data-cash-tab]'); if (!b) return; tab = b.dataset.cashTab; syncNav(); refresh(); });
  async function refresh() { if(!window.adminIdentity)return;const userId=window.adminIdentity.id;try { await render(); } catch (e) { if(window.adminIdentity?.id!==userId)return;const msg = root.querySelector('#cashMessage'); if (msg) msg.textContent = e.message; else root.textContent = e.message; } }
  root.addEventListener('change', e => { if (['cashFrom', 'cashTo'].includes(e.target.id)) { const nextFrom = root.querySelector('#cashFrom').value, nextTo = root.querySelector('#cashTo').value; if (nextFrom && nextTo && nextFrom <= nextTo && nextTo <= A.today()) { from = nextFrom; to = nextTo; refresh(); } else root.querySelector('#cashMessage').textContent = 'Selecciona un rango válido hasta hoy.'; } });
  const csv = rows => { const columns = [...new Set(rows.flatMap(Object.keys))]; const cell = v => { let s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''); if (/^\s*[=+@-]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }; return '\uFEFF' + [columns, ...rows.map(r => columns.map(k => r[k]))].map(r => r.map(cell).join(',')).join('\r\n'); };
  function download(content, name, type) { const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-cash-action]'); if (!b) return; const { cashAction: action, id } = b.dataset;
    try {
      if(action==='import-order'){if(!can(action))return;const input={requestKey:crypto.randomUUID(),shopOrderId:id,date:A.today(),reference:'WEB-'+id.slice(0,16),shippingMode:'extra',shipping:'0'};await repo.createSale(input);return await refresh();}
      if (['account', 'sale', 'collect', 'adjust', 'settlement', 'confirm', 'expense', 'income', 'transfer','reconcile'].includes(action)) return await openForm(action, id);
      if (action === 'account-detail') { accountId = id; tab = 'accounts'; syncNav(); return await render(); }
      if (action === 'sale-detail') { saleId = id; return await render(); }
      if (['today', 'week', 'month'].includes(action)) { to = A.today(); from = to; if (action === 'month') from = to.slice(0, 7) + '-01'; if (action === 'week') { const d = new Date(to + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); from = d.toISOString().slice(0, 10); } return await render(); }
      if (action === 'file') {
        const file = await repo.getAttachment(id), url = URL.createObjectURL(file); opener = b;
        modal.innerHTML = `<header><h2 id="cashDialogTitle">Comprobante</h2><button class="editor-close" type="button" aria-label="Cerrar">×</button></header><p>${esc(file.name)}</p>${file.type.startsWith('image/') ? `<img class="acc-receipt" src="${url}" alt="Comprobante">` : '<p>Comprobante PDF disponible para descargar.</p>'}<p><a href="${url}" download="${esc(file.name)}">Descargar archivo</a></p>`;
        modal.querySelector('button').onclick = () => modal.close(); modal.addEventListener('close', () => URL.revokeObjectURL(url), { once: true }); modal.showModal(); return;
      }
      if (action === 'export-json') { const cash = await repo.list(), obligations = await window.obligationsRepository?.list(); download(JSON.stringify({ ...cash, obligations, exportedAt: new Date().toISOString(), moneyUnit: 'minor', attachmentsIncluded: false }, null, 2), 'control-dinero.json', 'application/json'); }
      if (action === 'export-csv') { const key = root.querySelector('#cashExportEntity').value; const snapshot = await repo.list(); const rows = key === 'saleLines' ? snapshot.sales.flatMap(s => s.lines.map(l => ({ ...l, saleId: s.id, currency: s.currency }))) : key === 'settlementAllocations' ? snapshot.settlements.flatMap(t => t.allocations.map(a => ({ ...a, settlementId: t.id, currency: t.currency }))) : snapshot[key]; download(csv(rows), `${key}.csv`, 'text/csv;charset=utf-8'); }
    } catch (err) { const message=root.querySelector('#cashMessage');if(message)message.textContent=err.message; }
  });
  document.addEventListener('cash:changed', refresh);
  document.addEventListener('finance:loaded',refresh);
  document.addEventListener('dirtytask:auth',event=>{renderVersion++;data=null;accountId='';saleId='';if(modal.open)modal.close();modal.replaceChildren();opener=null;root.replaceChildren();if(event.detail)refresh();});
  refresh();
})();
