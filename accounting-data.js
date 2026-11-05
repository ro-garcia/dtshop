/* Domain rules and replaceable async repository. All money is integer cents. */
(function (root) {
  'use strict';
  const TYPES = { loan: 'Préstamo', financing: 'Financiamiento', card: 'Tarjeta' };
  const MOVEMENTS = { payment: 'Cuota pagada', principal: 'Abono a capital', purchase: 'Consumo', charge: 'Cargo de tarjeta' };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const copy = value => structuredClone(value);
  function amount(value) {
    const text = String(value).trim();
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) throw new Error('Ingresa un monto válido con máximo dos decimales.');
    const [whole, fraction = ''] = text.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }
  function date(value) {
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(value || '') || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Ingresa una fecha válida entre 2000 y 2099.');
    return value;
  }
  function month(value) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value || '')) throw new Error('Selecciona un período válido.');
    return value;
  }
  function shiftMonth(value, count) {
    const d = new Date(value + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + count); return d.toISOString().slice(0, 7);
  }
  function dueDate(o, period) {
    month(period);
    const [year, m] = period.split('-').map(Number);
    const day = Math.min(o.dueDay, new Date(Date.UTC(year, m, 0)).getUTCDate());
    return `${period}-${String(day).padStart(2, '0')}`;
  }
  function firstPeriod(o) {
    const period = o.startDate.slice(0, 7);
    return dueDate(o, period) < o.startDate ? shiftMonth(period, 1) : period;
  }
  function balance(o, movements) {
    return movements.filter(m => m.obligationId === o.id).sort((a, b) => a.date.localeCompare(b.date) || (a.sequence || 0) - (b.sequence || 0)).reduce((sum, m) => m.statementBalance != null ? m.statementBalance : sum + (['purchase', 'charge'].includes(m.type) ? m.total : -(m.principal || 0)), o.openingBalance);
  }
  function balanceUnconfirmed(o, movements) {
    let unknown = false;
    for (const m of movements.filter(m => m.obligationId === o.id).sort((a, b) => a.date.localeCompare(b.date) || (a.sequence || 0) - (b.sequence || 0))) {
      if (m.statementBalance != null) unknown = false;
      else if (m.type === 'payment' && m.principalKnown === false) unknown = true;
    }
    return unknown;
  }
  function schedule(o, movements, period) {
    const paid = movements.filter(m => m.obligationId === o.id && m.type === 'payment' && m.period === period).reduce((sum, m) => sum + m.total, 0);
    const beforePeriod = movements.filter(m => m.date.slice(0, 7) < period);
    const debtAtStart = o.startDate.slice(0, 7) <= period ? balance(o, beforePeriod) : 0;
    const newDebt = movements.some(m => m.obligationId === o.id && m.date.slice(0, 7) === period && ['purchase', 'charge'].includes(m.type));
    // Retain past coverage, but do not project installments into debt-free months.
    const expected = period < firstPeriod(o) || (debtAtStart === 0 && !newDebt) ? 0 : o.installment;
    return { dueDate: dueDate(o, period), expected, paid, remaining: Math.max(0, expected - paid) };
  }
  function nextPayment(o, movements, asOf = today()) {
    if (balance(o, movements) === 0) return null;
    const limit = shiftMonth(asOf.slice(0, 7), 12);
    for (let period = firstPeriod(o); period <= limit; period = shiftMonth(period, 1)) {
      const entry = schedule(o, movements, period);
      if (entry.remaining > 0) return { ...entry, period, overdue: entry.dueDate < asOf };
    }
    return null;
  }
  function text(value, label, limit = 100) {
    const result = String(value || '').trim();
    if (!result || result.length > limit) throw new Error(`${label}: completa el campo (máximo ${limit} caracteres).`);
    return result;
  }
  function createRepository(options = {}) {
    const asOf = options.today || today();
    let obligations = [], movements = [];
    const attachments = new Map();
    const id = () => globalThis.crypto.randomUUID();
    function createObligation(input) {
      const o = { id: id(), bank: text(input.bank, 'Banco'), reference: text(input.reference, 'Referencia', 60), name: text(input.name, 'Nombre'), type: input.type, currency: input.currency, openingBalance: amount(input.openingBalance), installment: amount(input.installment), dueDay: Number(input.dueDay), startDate: date(input.startDate), createdAt: new Date().toISOString() };
      if (!Object.hasOwn(TYPES, o.type) || !['GTQ', 'USD'].includes(o.currency)) throw new Error('Selecciona un tipo y una moneda válidos.');
      if (!Number.isInteger(o.dueDay) || o.dueDay < 1 || o.dueDay > 31) throw new Error('El día de pago debe estar entre 1 y 31.');
      if (o.openingBalance <= 0 || o.installment <= 0) throw new Error('El saldo y la cuota deben ser mayores que cero.');
      if (o.startDate > asOf) throw new Error('La fecha inicial no puede ser futura.');
      if (obligations.some(item => item.bank.toLocaleLowerCase() === o.bank.toLocaleLowerCase() && item.reference.toLocaleLowerCase() === o.reference.toLocaleLowerCase())) throw new Error('Ya existe esa referencia en el banco.');
      obligations.push(o); return copy(o);
    }
    function addMovement(input, file) {
      const o = obligations.find(item => item.id === input.obligationId);
      if (!o) throw new Error('La obligación no existe.');
      if (!Object.hasOwn(MOVEMENTS, input.type)) throw new Error('Selecciona un movimiento válido.');
      const when = date(input.date);
      if (when < o.startDate || when > asOf) throw new Error('La fecha debe estar entre el inicio de la obligación y hoy.');
      const total = amount(input.total);
      if (!total) throw new Error('El monto debe ser mayor que cero.');
      const payment = input.type === 'payment';
      const debt = ['purchase', 'charge'].includes(input.type);
      if (debt && o.type !== 'card') throw new Error('Los consumos y cargos solo aplican a tarjetas.');
      const hasBreakdown = payment && input.principal != null && input.principal !== '';
      const principal = hasBreakdown ? amount(input.principal) : (payment || debt ? 0 : total);
      const interest = hasBreakdown ? amount(input.interest) : 0;
      const fees = hasBreakdown ? amount(input.fees) : 0;
      const statementBalance = payment && input.statementBalance != null && input.statementBalance !== '' ? amount(input.statementBalance) : null;
      if (hasBreakdown && principal + interest + fees !== total) throw new Error('Capital + intereses + cargos debe coincidir con el monto pagado.');
      if (!debt && principal > balance(o, movements)) throw new Error('El capital pagado supera el saldo pendiente.');
      const period = payment ? month(input.period) : null;
      if (payment && total > schedule(o, movements, period).remaining) throw new Error('El pago supera la cuota pendiente del período. Registra el excedente como abono a capital.');
      if (payment && period < firstPeriod(o)) throw new Error('El período es anterior a la primera cuota.');
      if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) throw new Error('Adjunta una imagen JPG, PNG o WEBP de hasta 5 MB.');
      const movement = { id: id(), sequence: movements.length + 1, sourceAccountId: input.accountId || null, statementBalance, principalKnown: !payment || hasBreakdown, obligationId: o.id, type: input.type, date: when, period, total, principal, interest, fees, notes: String(input.notes || '').trim().slice(0, 500), createdAt: new Date().toISOString(), attachment: file ? { id: id(), name: file.name, type: file.type, size: file.size } : null };
      // Reject backdated changes that would make any running balance negative.
      let running = o.openingBalance;
      for (const m of [...movements.filter(item => item.obligationId === o.id), movement].sort((a, b) => a.date.localeCompare(b.date))) {
        running = m.statementBalance != null ? m.statementBalance : running + (['purchase', 'charge'].includes(m.type) ? m.total : -(m.principal || 0));
        if (running < 0) throw new Error('El movimiento dejaría un saldo histórico negativo.');
      }
      if (file) attachments.set(movement.attachment.id, file);
      movements.push(movement); return copy(movement);
    }
    const cash = options.cashRepository;
    let queue = Promise.resolve();
    return {
      async list() { return copy({ schemaVersion: 1, obligations, movements }); },
      async createObligation(input) { return createObligation(input); },
      async addMovement(input, file) {
        const run = queue.then(async () => {
          const before = movements.slice(), oldFiles = new Map(attachments);
          try {
            const movement = addMovement(input, file);
            if (cash && ['payment', 'principal'].includes(movement.type)) {
              const o = obligations.find(o => o.id === movement.obligationId);
              await cash.addEntry({ accountId: input.accountId, currency: o.currency, date: movement.date, direction: 'out', category: 'debt', amount: (movement.total / 100).toFixed(2), concept: `${MOVEMENTS[movement.type]} · ${o.name}`, sourceType: 'obligation', sourceId: movement.id }, file);
            }
            return movement;
          } catch (e) { movements = before; attachments.clear(); for (const [id, file] of oldFiles) attachments.set(id, file); throw e; }
        });
        queue = run.catch(() => {}); return run;
      },
      async getAttachment(attachmentId) { const file = attachments.get(attachmentId); if (!file) throw new Error('Comprobante no disponible en esta sesión.'); return file; }
    };
  }
  const api = { TYPES, MOVEMENTS, today, amount, balance, balanceUnconfirmed, schedule, nextPayment, firstPeriod, shiftMonth, createRepository };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Accounting = api;
})(globalThis);
