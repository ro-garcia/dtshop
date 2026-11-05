const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../accounting-data.js');
const loan = { bank: 'Banco Prueba', reference: 'P-1', name: 'Capital de trabajo', type: 'loan', currency: 'GTQ', openingBalance: '1000.00', installment: '100', dueDay: '31', startDate: '2026-01-01' };
test('money uses exact cents and rejects invalid values', () => {
  assert.equal(A.amount('0.29'), 29);
  for (const value of ['-1', '1.001', 'Infinity', '', '1e3']) assert.throws(() => A.amount(value));
});
test('only principal reduces loan balance; extra principal does not cover monthly installment', async () => {
  const repo = A.createRepository({ today: '2026-03-10' });
  const o = await repo.createObligation(loan);
  await repo.addMovement({ obligationId: o.id, type: 'payment', date: '2026-02-28', period: '2026-02', total: '100', principal: '70', interest: '20', fees: '10' });
  await repo.addMovement({ obligationId: o.id, type: 'principal', date: '2026-03-01', total: '50' });
  const data = await repo.list();
  assert.equal(A.balance(o, data.movements), 88000);
  assert.deepEqual(A.schedule(o, data.movements, '2026-02'), { dueDate: '2026-02-28', expected: 10000, paid: 10000, remaining: 0 });
  assert.equal(A.schedule(o, data.movements, '2026-03').remaining, 10000);
  await assert.rejects(repo.addMovement({ obligationId: o.id, type: 'principal', date: '2026-03-02', total: '881' }));
  await assert.rejects(repo.addMovement({ obligationId: o.id, type: 'payment', date: '2026-03-02', period: '2026-03', total: '100', principal: '90', interest: '20', fees: '0' }));
});
test('card purchases and fees increase debt; partial payments cover only their amount', async () => {
  const repo = A.createRepository({ today: '2026-03-10' });
  const o = await repo.createObligation({ ...loan, type: 'card' });
  await repo.addMovement({ obligationId: o.id, type: 'purchase', date: '2026-02-01', total: '10.29' });
  await repo.addMovement({ obligationId: o.id, type: 'charge', date: '2026-02-01', total: '2.01' });
  await repo.addMovement({ obligationId: o.id, type: 'payment', date: '2026-02-02', period: '2026-02', total: '40', principal: '40', interest: '0', fees: '0' });
  const data = await repo.list();
  assert.equal(A.balance(o, data.movements), 97230);
  assert.equal(A.schedule(o, data.movements, '2026-02').remaining, 6000);
  await assert.rejects(repo.addMovement({ obligationId: o.id, type: 'charge', date: '2026-03-11', total: '1' }));
  await assert.rejects(repo.addMovement({ obligationId: o.id, type: 'charge', date: '2025-12-31', total: '1' }));
});
test('validation, isolated snapshots and empty initialization', async () => {
  const repo = A.createRepository({ today: '2026-03-10' });
  for (const overrides of [{ dueDay: 32 }, { currency: 'BAD' }, { startDate: '2026-02-31' }, { bank: ' ' }, { installment: '0' }]) await assert.rejects(repo.createObligation({ ...loan, ...overrides }));
  const o = await repo.createObligation(loan);
  await assert.rejects(repo.createObligation(loan));
  await assert.rejects(repo.addMovement({ obligationId: o.id, type: 'purchase', date: '2026-02-01', total: '1' }));
  const snapshot = await repo.list(); snapshot.obligations[0].name = 'mutated';
  assert.equal((await repo.list()).obligations[0].name, loan.name);
  const empty = await A.createRepository({ today: '2026-03-10' }).list();
  assert.deepEqual(empty.obligations, []); assert.deepEqual(empty.movements, []);
});
test('end of month, leap year, first due date and historical balance', async () => {
  const repo = A.createRepository({ today: '2026-03-10' });
  const o = await repo.createObligation({ ...loan, type: 'card', openingBalance: '100' });
  assert.equal(A.schedule(o, [], '2024-02').dueDate, '2024-02-29');
  assert.equal(A.firstPeriod({ ...o, startDate: '2026-01-25', dueDay: 15 }), '2026-02');
  await repo.addMovement({ obligationId: o.id, type: 'purchase', date: '2026-02-15', total: '100' });
  await assert.rejects(repo.addMovement({ obligationId: o.id, type: 'principal', date: '2026-02-01', total: '150' }), /histórico/);
  await repo.addMovement({ obligationId: o.id, type: 'principal', date: '2026-02-20', total: '200' });
  assert.equal(A.nextPayment(o, (await repo.list()).movements, '2026-03-10'), null);
  assert.equal(A.schedule(o, (await repo.list()).movements, '2026-03').remaining, 0, 'No future installments after payoff');
  assert.equal(A.schedule(o, (await repo.list()).movements, '2026-01').remaining, 10000, 'Historical coverage remains visible');
  await repo.addMovement({ obligationId: o.id, type: 'purchase', date: '2026-03-01', total: '20' });
  assert.equal(A.schedule(o, (await repo.list()).movements, '2026-03').expected, 10000, 'New card purchases resume reference installments');
});
test('receipt metadata links to the file and invalid files cannot mutate data', async () => {
  const repo = A.createRepository({ today: '2026-03-10' });
  const o = await repo.createObligation(loan);
  const input = { obligationId: o.id, type: 'principal', date: '2026-02-01', total: '10' };
  await assert.rejects(repo.addMovement(input, { type: 'text/html', size: 10 }), /imagen/);
  await assert.rejects(repo.addMovement(input, { type: 'image/jpeg', size: 6000000 }), /5 MB/);
  assert.equal((await repo.list()).movements.length, 0);
  const file = new File(['demo'], 'comprobante.jpg', { type: 'image/jpeg' });
  const entry = await repo.addMovement(input, file);
  assert.equal(entry.attachment.name, 'comprobante.jpg');
  assert.equal(await repo.getAttachment(entry.attachment.id), file);
});
