const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../cash-data.js');
const today = '2026-11-03';
test('new repositories contain no preloaded accounts, sales or movements',async()=>{
  const snapshot=await C.createRepository({today}).list();
  for(const rows of Object.values(snapshot).filter(Array.isArray))assert.deepEqual(rows,[]);
});
async function setup() {
  const repo = C.createRepository({ today });
  const bank = await repo.createAccount({ name: 'Banrural', bank: 'Banrural', type: 'bank', currency: 'GTQ', openingBalance: '0', startDate: '2026-10-01' });
  const cash = await repo.createAccount({ name: 'Caja', type: 'cash', currency: 'GTQ', openingBalance: '0', startDate: '2026-10-01' });
  const sale = amount => repo.createSale({ channel: 'external', currency: 'GTQ', date: '2026-10-01', shippingMode: 'extra', shipping: '35', lines: [{ name: 'Prenda', qty: '1', price: amount }] });
  return { repo, bank, cash, sale };
}
test('Forza net deposit and expense are counted once, history respects settlement date', async () => {
  const { repo, bank, sale } = await setup(); const s = await sale('100');
  const settlement = await repo.createSettlement({ courier: 'Forza', date: '2026-10-02', allocations: [{ saleId: s.id, amount: '135' }] });
  assert.equal((await repo.saleStatus(s.id)).customerDue, 0);
  assert.equal((await repo.saleStatus(s.id)).courierDue, 13500);
  await repo.confirmSettlement({ id: settlement.id, accountId: bank.id, date: '2026-11-01', service: '7', commission: '0', discounts: '0', adjustment: '0', received: '128' });
  await repo.addEntry({ accountId: bank.id, date: today, direction: 'out', category: 'advertising', amount: '50', concept: 'Publicidad' });
  assert.equal((await repo.accountLedger(bank.id)).balance, 7800);
  assert.equal((await repo.saleStatus(s.id, '2026-10-31')).courierDue, 13500);
  assert.equal((await repo.saleStatus(s.id)).courierDue, 0);
  const report = await repo.report('2026-11-01', today);
  assert.equal(report.GTQ.incoming, 12800); assert.equal(report.GTQ.outgoing, 5000); assert.equal(report.GTQ.withheld, 700);
  await assert.rejects(repo.confirmSettlement({ id: settlement.id }), /confirmada/);
});
test('Fast grouped payments allocate cents and prevent duplicated or excess collections', async () => {
  const { repo, bank, sale } = await setup(); const a = await sale('100'), b = await sale('100');
  await assert.rejects(repo.createSettlement({ courier: 'Forza', date: today, allocations: [{ saleId: a.id, amount: '135' }, { saleId: b.id, amount: '135' }] }));
  const t = await repo.createSettlement({ courier: 'Fast Delivery', date: today, allocations: [{ saleId: a.id, amount: '135' }, { saleId: b.id, amount: '135' }] });
  await assert.rejects(repo.collect({ saleId: a.id, accountId: bank.id, date: today, amount: '1' }));
  await repo.confirmSettlement({ id: t.id, accountId: bank.id, date: today, service: '60', commission: '0', discounts: '0', adjustment: '0', received: '210' });
  assert.equal((await repo.accountLedger(bank.id)).balance, 21000);
  const data = await repo.list(); assert.equal(data.entries.length, 1);
  assert.equal(data.settlements[0].allocations.reduce((sum, x) => sum + x.net, 0), 21000);
});
test('mixed reservation payments, sale adjustments, neutral transfers and atomic failure', async () => {
  const { repo, bank, cash } = await setup();
  const s = await repo.createSale({ channel: 'physical', currency: 'GTQ', date: today, shippingMode: 'included', shipping: '0', lines: [{ name: 'Lanzamiento', qty: '1', price: '200' }] });
  await repo.collect({ saleId: s.id, accountId: bank.id, date: today, amount: '100' });
  await repo.collect({ saleId: s.id, accountId: cash.id, date: today, amount: '100' });
  assert.equal((await repo.saleStatus(s.id)).customerDue, 0);
  await repo.transfer({ fromId: bank.id, toId: cash.id, date: today, amount: '80', concept: 'Retiro' });
  assert.equal((await repo.accountLedger(bank.id)).balance, 2000);
  assert.equal((await repo.accountLedger(cash.id)).balance, 18000);
  assert.equal((await repo.report(today, today)).GTQ.incoming, 20000);
  const before = await repo.list();
  await assert.rejects(repo.transfer({ fromId: bank.id, toId: cash.id, date: today, amount: '21', concept: 'Sin saldo' }));
  assert.deepEqual(await repo.list(), before);
  await repo.adjustSale({ saleId: s.id, date: today, amount: '35', direction: 'increase', reason: 'Envío adicional' });
  assert.equal((await repo.saleStatus(s.id)).customerDue, 3500);
});
test('historical overdrafts, currencies, files and dates reject before changing state', async () => {
  const { repo, bank, sale } = await setup(); const s = await sale('100');
  await repo.collect({ saleId: s.id, accountId: bank.id, date: today, amount: '100' });
  await assert.rejects(repo.addEntry({ accountId: bank.id, date: '2026-10-20', direction: 'out', category: 'advertising', amount: '1', concept: 'Antes del ingreso' }));
  const usd = await repo.createAccount({ name: 'USD', type: 'bank', bank: 'Banco', currency: 'USD', openingBalance: '10', startDate: today });
  await assert.rejects(repo.collect({ saleId: s.id, accountId: usd.id, date: today, amount: '1' }));
  await assert.rejects(repo.collect({ saleId: s.id, accountId: bank.id, date: today, amount: '1' }, { type: 'text/html', size: 10 }));
  assert.equal((await repo.accountLedger(bank.id, '2026-10-01', '2026-10-31')).balance, 0);
  assert.equal((await repo.accountLedger(bank.id, today, today)).opening, 0);
});
test('settlement differences require explanation; allocated net reconciles every sale', async () => {
  const { repo, bank, sale } = await setup(); const a = await sale('100'), b = await sale('101');
  const t = await repo.createSettlement({ courier: 'Fast Delivery', date: today, allocations: [{ saleId: a.id, amount: '135' }, { saleId: b.id, amount: '136' }] });
  const before = await repo.list();
  await assert.rejects(repo.confirmSettlement({ id: t.id, accountId: bank.id, date: today, received: '270', service: '0' }));
  assert.deepEqual(await repo.list(), before);
  const confirmed = await repo.confirmSettlement({ id: t.id, accountId: bank.id, date: today, service: '1.01', commission: '0.01', discounts: '0.01', adjustment: '0.02', reason: 'Diferencia documentada', received: '269.99' });
  assert.equal(confirmed.allocations.reduce((sum, a) => sum + a.net, 0), 26999);
  for (const a of confirmed.allocations) assert.equal(a.net, a.amount - a.withheld + a.positiveAdjustment);
});
test('amount-only loan payments debit the source once, preserve unknown principal and roll back failures', async () => {
  const A = require('../accounting-data.js');
  const { repo, bank } = await setup();
  await repo.addEntry({ accountId: bank.id, date: today, direction: 'in', category: 'contribution', amount: '1500', concept: 'Capital' });
  const debt = A.createRepository({ today, cashRepository: repo });
  const o = await debt.createObligation({ bank: 'Banco', name: 'Préstamo', reference: 'T1', type: 'loan', currency: 'GTQ', startDate: today, openingBalance: '5000', installment: '1000', dueDay: '30' });
  await debt.addMovement({ obligationId: o.id, accountId: bank.id, type: 'payment', date: today, period: '2026-11', total: '1000' });
  assert.equal((await repo.accountLedger(bank.id)).balance, 50000);
  let d = await debt.list();
  assert.equal(A.balance(o, d.movements), 500000);
  assert.equal(A.balanceUnconfirmed(o, d.movements), true);
  const before = await debt.list(), cashBefore = await repo.list();
  await assert.rejects(debt.addMovement({ obligationId: o.id, accountId: bank.id, type: 'principal', date: today, total: '501' }));
  assert.deepEqual(await debt.list(), before); assert.deepEqual(await repo.list(), cashBefore);
  await debt.addMovement({ obligationId: o.id, accountId: bank.id, type: 'principal', date: today, total: '200' });
  d = await debt.list(); assert.equal(A.balance(o, d.movements), 480000);
  assert.equal((await repo.accountLedger(bank.id)).balance, 30000);
});
