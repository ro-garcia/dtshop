(function (root) {
  'use strict';
  const A = typeof module !== 'undefined' && module.exports ? require('./accounting-data.js') : root.Accounting;
  const clone = value => structuredClone(value);
  const categories = { advertising: 'Publicidad', delivery: 'Mensajería', supplies: 'Insumos', other: 'Otros', operating: 'Otros ingresos operativos', contribution: 'Aporte de capital', financing: 'Financiamiento recibido', debt: 'Pago de obligación' };
  const positive = value => { const n = A.amount(value); if (!n) throw new Error('El monto debe ser mayor que cero.'); return n; };
  const label = (value, name) => { const s = String(value || '').trim(); if (!s || s.length > 150) throw new Error(`${name}: completa el campo (máximo 150 caracteres).`); return s; };
  function createRepository(options = {}) {
    const today = options.today || A.today();
    let data = { schemaVersion: 2, accounts: [], sales: [], adjustments: [], receipts: [], settlements: [], entries: [], transfers: [] };
    let sequence = 0;
    const files = new Map();
    const stamp = () => ({ id: crypto.randomUUID(), sequence: ++sequence, createdAt: new Date().toISOString() });
    const date = value => {
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value > today) throw new Error('La fecha debe ser válida y no posterior a hoy.');
      return value;
    };
    const currency = value => { if (!['GTQ', 'USD'].includes(value)) throw new Error('Moneda no válida.'); return value; };
    const account = id => { const a = data.accounts.find(x => x.id === id); if (!a) throw new Error('Selecciona una cuenta o caja.'); return a; };
    const sale = id => { const s = data.sales.find(x => x.id === id); if (!s) throw new Error('Venta no encontrada.'); return s; };
    const sameCurrency = (a, b) => { if (a.currency !== b.currency) throw new Error('La moneda debe coincidir; no se convierten monedas automáticamente.'); };
    function attachment(file) {
      if (!file || file.size === 0 && !file.name) return null;
      if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Adjunta una imagen o PDF de hasta 5 MB.');
      return { id: crypto.randomUUID(), name: String(file.name).slice(0, 200), type: file.type, size: file.size };
    }
    function attachFile(meta, file) { if (meta) files.set(meta.id, file); }
    function ledger(id, from = '2000-01-01', to = today) {
      const a = account(id); let running = a.startDate <= to ? a.openingBalance : 0;
      let opening = a.startDate < from ? a.openingBalance : 0;
      const rows = [];
      for (const entry of data.entries.filter(e => e.accountId === id && e.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.sequence - b.sequence)) {
        running += entry.direction === 'in' ? entry.amount : -entry.amount;
        if (entry.date < from) opening = running;
        else rows.push({ ...entry, balance: running });
      }
      // Opening balances belong to the account, never to operating income.
      if (a.startDate >= from && a.startDate <= to) opening = a.openingBalance;
      return { account: clone(a), opening, balance: running, rows: clone(rows) };
    }
    function checkEntries(entries) {
      for (const id of new Set(entries.map(e => e.accountId))) {
        const a = account(id); let running = a.openingBalance;
        for (const e of [...data.entries, ...entries].filter(e => e.accountId === id).sort((x, y) => x.date.localeCompare(y.date) || x.sequence - y.sequence)) {
          if (e.date < a.startDate) throw new Error('El movimiento es anterior al inicio de la cuenta.');
          running += e.direction === 'in' ? e.amount : -e.amount;
          if (running < 0) throw new Error('Saldo insuficiente: el movimiento deja un saldo histórico negativo.');
          if (!Number.isSafeInteger(running)) throw new Error('El saldo excede el límite permitido.');
        }
      }
    }
    function saleStatus(id, asOf = today) {
      const s = sale(id);
      const total = s.date > asOf ? 0 : s.total + data.adjustments.filter(x => x.saleId === id && x.date <= asOf).reduce((sum, x) => sum + x.amount, 0);
      const direct = data.receipts.filter(r => r.saleId === id && r.date <= asOf).reduce((sum, r) => sum + r.amount, 0);
      const relevant = data.settlements.filter(t => t.date <= asOf);
      const courier = relevant.reduce((sum, t) => sum + t.allocations.filter(a => a.saleId === id).reduce((v, a) => v + a.amount, 0), 0);
      const courierDue = relevant.filter(t => !t.confirmedDate || t.confirmedDate > asOf).reduce((sum, t) => sum + t.allocations.filter(a => a.saleId === id).reduce((v, a) => v + a.amount, 0), 0);
      return { total, direct, courier, customerDue: total - direct - courier, courierDue };
    }
    function checkCollection(id, when, amount) {
      const s = sale(id); if (when < s.date) throw new Error('El cobro es anterior a la venta.');
      // Validate both historical and final position, including later adjustments/collections.
      const dates = new Set([when, today, ...data.adjustments.filter(x => x.saleId === id && x.date >= when).map(x => x.date), ...data.receipts.filter(x => x.saleId === id && x.date >= when).map(x => x.date), ...data.settlements.filter(t => t.date >= when).map(t => t.date)]);
      for (const d of dates) if (saleStatus(id, d).customerDue < amount) throw new Error('El monto supera el saldo disponible por cobrar de la venta.');
    }
    function createAccount(input) {
      if (!['cash', 'bank'].includes(input.type)) throw new Error('Selecciona banco o efectivo.');
      const a = { ...stamp(), name: label(input.name, 'Nombre'), type: input.type, bank: input.type === 'bank' ? label(input.bank, 'Banco') : '', reference: String(input.reference || '').slice(-4), currency: currency(input.currency), openingBalance: A.amount(input.openingBalance), startDate: date(input.startDate) };
      if (data.accounts.some(x => x.name.toLowerCase() === a.name.toLowerCase())) throw new Error('Ya existe una cuenta con ese nombre.');
      data.accounts.push(a); return clone(a);
    }
    function createSale(input) {
      if (!['web', 'external', 'physical'].includes(input.channel) || !['extra', 'included', 'none'].includes(input.shippingMode)) throw new Error('Selecciona canal y modalidad de envío.');
      if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 30) throw new Error('Agrega entre 1 y 30 productos.');
      const lines = input.lines.map(line => {
        const qty = Number(line.qty); if (!Number.isInteger(qty) || qty < 1 || qty > 10000) throw new Error('La cantidad debe ser un entero positivo.');
        return { id: crypto.randomUUID(), productId: line.productId || null, name: label(line.name, 'Producto'), qty, unitPrice: positive(line.price) };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0), shipping = input.shippingMode === 'extra' ? A.amount(input.shipping || '0') : 0;
      if (!Number.isSafeInteger(subtotal + shipping)) throw new Error('Total fuera del límite.');
      const s = { ...stamp(), reference: String(input.reference || `V-${String(data.sales.length + 1).padStart(4, '0')}`).slice(0, 60), date: date(input.date), channel: input.channel, currency: currency(input.currency), customer: String(input.customer || '').slice(0, 100), launchId: input.launchId || null, shippingMode: input.shippingMode, shipping, subtotal, total: subtotal + shipping, lines };
      if (data.sales.some(x => x.reference.toLowerCase() === s.reference.toLowerCase())) throw new Error('La referencia de venta ya existe.');
      data.sales.push(s); return clone(s);
    }
    function adjustSale(input) {
      const s = sale(input.saleId), when = date(input.date);
      if (when < s.date || !['increase', 'decrease'].includes(input.direction)) throw new Error('Ajuste o fecha no válidos.');
      const amount = positive(input.amount) * (input.direction === 'decrease' ? -1 : 1);
      const a = { ...stamp(), saleId: s.id, date: when, amount, reason: label(input.reason, 'Motivo') };
      data.adjustments.push(a);
      const dates = [when, today, ...data.receipts.filter(r => r.date >= when).map(r => r.date), ...data.settlements.filter(t => t.date >= when).map(t => t.date), ...data.adjustments.filter(t => t.date >= when).map(t => t.date)];
      if (dates.some(d => saleStatus(s.id, d).customerDue < 0)) { data.adjustments.pop(); throw new Error('El ajuste reduce el total por debajo de lo ya cobrado o comprometido.'); }
      return clone(a);
    }
    function collect(input, file) {
      const s = sale(input.saleId), a = account(input.accountId), when = date(input.date), amount = positive(input.amount);
      sameCurrency(s, a); checkCollection(s.id, when, amount);
      const meta = attachment(file), r = { ...stamp(), saleId: s.id, accountId: a.id, date: when, amount, reference: String(input.reference || '').slice(0, 100), attachment: meta };
      const e = { ...stamp(), accountId: a.id, date: when, direction: 'in', amount, currency: a.currency, category: 'sale', concept: `Cobro ${s.reference}${s.customer ? ' · ' + s.customer : ''}`, sourceType: 'receipt', sourceId: r.id, attachment: meta };
      checkEntries([e]); data.receipts.push(r); data.entries.push(e); attachFile(meta, file); return clone(r);
    }
    function createSettlement(input) {
      const when = date(input.date), allocations = input.allocations;
      if (!['Forza', 'Fast Delivery'].includes(input.courier) || !Array.isArray(allocations) || !allocations.length || input.courier === 'Forza' && allocations.length !== 1) throw new Error('Forza requiere un pedido; Fast Delivery permite uno o varios.');
      if (new Set(allocations.map(x => x.saleId)).size !== allocations.length) throw new Error('No repitas la misma venta dentro de una liquidación.');
      const c = sale(allocations[0].saleId).currency;
      const clean = allocations.map(x => { const s = sale(x.saleId), amount = positive(x.amount); sameCurrency(s, { currency: c }); checkCollection(s.id, when, amount); return { saleId: s.id, amount }; });
      const t = { ...stamp(), courier: input.courier, date: when, currency: c, reference: String(input.reference || '').slice(0, 100), allocations: clean, gross: clean.reduce((sum, x) => sum + x.amount, 0), status: 'pending', confirmedDate: null };
      data.settlements.push(t); return clone(t);
    }
    // Exact proportional distribution with deterministic largest-remainder cents.
    function distribute(total, allocations) {
      const denominator = BigInt(allocations.reduce((sum, a) => sum + a.amount, 0));
      const result = allocations.map((a, index) => { const v = BigInt(total) * BigInt(a.amount); return { index, value: Number(v / denominator), remainder: v % denominator }; });
      let left = total - result.reduce((sum, r) => sum + r.value, 0);
      [...result].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1).forEach(r => { if (left > 0) { r.value++; left--; } });
      return result.map(r => r.value);
    }
    function confirmSettlement(input, file) {
      const t = data.settlements.find(x => x.id === input.id);
      if (!t || t.status === 'confirmed') throw new Error('Liquidación inexistente o ya confirmada.');
      const a = account(input.accountId), when = date(input.date); sameCurrency(t, a);
      if (when < t.date) throw new Error('El depósito no puede ser anterior al cobro de mensajería.');
      const service = A.amount(input.service || '0'), commission = A.amount(input.commission || '0'), discounts = A.amount(input.discounts || '0'), adjustment = A.amount(input.adjustment || '0'), received = positive(input.received);
      if (t.gross - service - commission - discounts + adjustment !== received) throw new Error('El depósito no cuadra: identifica la diferencia en descuentos o ajustes positivos.');
      const reason = adjustment || discounts ? label(input.reason, 'Motivo del ajuste/descuento') : String(input.reason || '').slice(0, 150);
      const meta = attachment(file);
      const e = { ...stamp(), accountId: a.id, date: when, direction: 'in', amount: received, currency: a.currency, category: 'settlement', concept: `${t.courier} · ${t.allocations.length} pedido(s)`, sourceType: 'settlement', sourceId: t.id, attachment: meta };
      checkEntries([e]);
      const costs = distribute(service + commission + discounts, t.allocations), extras = distribute(adjustment, t.allocations);
      Object.assign(t, { status: 'confirmed', confirmedDate: when, accountId: a.id, service, commission, discounts, adjustment, received, reason, attachment: meta, allocations: t.allocations.map((x, i) => ({ ...x, net: x.amount - costs[i] + extras[i], withheld: costs[i], positiveAdjustment: extras[i], allocationMethod: 'proportional' })) });
      data.entries.push(e); attachFile(meta, file); return clone(t);
    }
    function addEntry(input, file) {
      const a = account(input.accountId), when = date(input.date), amount = positive(input.amount);
      if (!['in', 'out'].includes(input.direction) || !Object.hasOwn(categories, input.category)) throw new Error('Selecciona movimiento y categoría.');
      if (input.currency) sameCurrency(a, input);
      if (input.saleId) { const s = sale(input.saleId); sameCurrency(a, s); if (when < s.date) throw new Error('El gasto es anterior a la venta.'); }
      if (input.sourceId && data.entries.some(e => e.sourceId === input.sourceId && e.sourceType === input.sourceType)) throw new Error('Este movimiento ya está registrado.');
      const meta = attachment(file), e = { ...stamp(), accountId: a.id, date: when, direction: input.direction, amount, currency: a.currency, category: input.category, concept: label(input.concept, 'Concepto'), saleId: input.saleId || null, sourceType: input.sourceType || 'manual', sourceId: input.sourceId || null, attachment: meta };
      checkEntries([e]); data.entries.push(e); attachFile(meta, file); return clone(e);
    }
    function transfer(input, file) {
      const a = account(input.fromId), b = account(input.toId), when = date(input.date), amount = positive(input.amount); sameCurrency(a, b);
      if (a.id === b.id) throw new Error('Selecciona dos cuentas distintas.');
      const meta = attachment(file), t = { ...stamp(), fromId: a.id, toId: b.id, date: when, amount, currency: a.currency, concept: label(input.concept, 'Concepto'), attachment: meta };
      const entries = [{ ...stamp(), accountId: a.id, direction: 'out' }, { ...stamp(), accountId: b.id, direction: 'in' }].map(x => ({ ...x, date: when, amount, currency: a.currency, category: 'transfer', concept: t.concept, sourceType: 'transfer', sourceId: t.id, attachment: meta }));
      checkEntries(entries); data.transfers.push(t); data.entries.push(...entries); attachFile(meta, file); return clone(t);
    }
    function report(from, to) {
      date(from); date(to); if (from > to) throw new Error('El inicio del rango debe ser anterior al final.');
      const result = {};
      for (const c of new Set([...data.accounts, ...data.sales].map(x => x.currency))) {
        const entries = data.entries.filter(e => e.currency === c && e.date >= from && e.date <= to && e.category !== 'transfer');
        const sums = predicate => entries.filter(predicate).reduce((s, e) => s + e.amount, 0);
        const statuses = data.sales.filter(s => s.currency === c && s.date <= to).map(s => saleStatus(s.id, to));
        result[c] = { balance: data.accounts.filter(a => a.currency === c).reduce((s, a) => s + ledger(a.id, from, to).balance, 0), incoming: sums(e => e.direction === 'in'), outgoing: sums(e => e.direction === 'out'), operatingIncome: sums(e => e.direction === 'in' && !['contribution', 'financing'].includes(e.category)), operatingExpenses: sums(e => e.direction === 'out' && e.category !== 'debt'), debtPayments: sums(e => e.category === 'debt'), contributions: sums(e => ['contribution', 'financing'].includes(e.category)), sales: data.sales.filter(s => s.currency === c && s.date >= from && s.date <= to).reduce((v, s) => v + s.total, 0) + data.adjustments.filter(x => sale(x.saleId).currency === c && x.date >= from && x.date <= to).reduce((v, x) => v + x.amount, 0), customerDue: statuses.reduce((s, x) => s + x.customerDue, 0), courierDue: statuses.reduce((s, x) => s + x.courierDue, 0), withheld: data.settlements.filter(t => t.currency === c && t.status === 'confirmed' && t.confirmedDate >= from && t.confirmedDate <= to).reduce((v, t) => v + t.service + t.commission + t.discounts, 0) };
      }
      return result;
    }
    if (options.seed !== false) {
      const previous = A.shiftMonth(today.slice(0, 7), -1), start = previous + '-01';
      const b = createAccount({ name: 'Banrural · operación', bank: 'Banrural (ejemplo)', type: 'bank', currency: 'GTQ', openingBalance: '5000', startDate: start });
      const g = createAccount({ name: 'BI · reservas', bank: 'Banco Industrial (ejemplo)', type: 'bank', currency: 'GTQ', openingBalance: '2000', startDate: start });
      const c = createAccount({ name: 'Caja de tienda', type: 'cash', currency: 'GTQ', openingBalance: '500', startDate: start });
      const product = options.products?.[0];
      const line = price => [{ productId: product?.id || null, name: product?.name || 'Prenda de ejemplo', qty: '1', price }];
      const sales = ['web', 'external', 'web', 'physical'].map((channel, i) => createSale({ reference: `DEMO-V0${i + 1}`, date: today, channel, currency: 'GTQ', customer: `Cliente de ejemplo ${i + 1}`, shippingMode: i === 3 ? 'included' : 'extra', shipping: '35', lines: line(i === 3 ? '200' : '100') }));
      const forza = createSettlement({ courier: 'Forza', date: today, allocations: [{ saleId: sales[0].id, amount: '135' }] });
      confirmSettlement({ id: forza.id, accountId: b.id, date: today, service: '7', received: '128' });
      createSettlement({ courier: 'Fast Delivery', date: today, allocations: [{ saleId: sales[1].id, amount: '135' }, { saleId: sales[2].id, amount: '135' }] });
      collect({ saleId: sales[3].id, accountId: g.id, date: today, amount: '100' });
      collect({ saleId: sales[3].id, accountId: c.id, date: today, amount: '100' });
      addEntry({ accountId: b.id, date: today, direction: 'out', category: 'advertising', amount: '50', concept: 'Publicidad de ejemplo' });
      transfer({ fromId: b.id, toId: c.id, date: today, amount: '80', concept: 'Fondo de caja' });
    }
    const wrap = fn => async (...args) => { const before = clone(data), seq = sequence, oldFileIds = new Set(files.keys()); try { return fn(...args); } catch (e) { data = before; sequence = seq; for (const id of files.keys()) if (!oldFileIds.has(id)) files.delete(id); throw e; } };
    return { list: async () => clone(data), createAccount: wrap(createAccount), createSale: wrap(createSale), adjustSale: wrap(adjustSale), collect: wrap(collect), createSettlement: wrap(createSettlement), confirmSettlement: wrap(confirmSettlement), addEntry: wrap(addEntry), transfer: wrap(transfer), saleStatus: async (...args) => saleStatus(...args), accountLedger: async (...args) => ledger(...args), report: async (...args) => report(...args), getAttachment: async id => { if (!files.has(id)) throw new Error('Comprobante no disponible.'); return files.get(id); } };
  }
  const api = { createRepository, categories };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Cash = api;
})(globalThis);
