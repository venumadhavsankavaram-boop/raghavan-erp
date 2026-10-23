// Student fee balances: collected, discounts, refunds, voids, class changes.   Run:  node tests/fee-balance.test.mjs
import assert from 'node:assert/strict';
import { loadMany, test, done } from './helpers.mjs';

function sandbox(o = {}) {
  return loadMany([
    ['04-finance-data-layer.js', ['classStruct', 'studentBusFare', 'studentHostelFee', 'computeStudentFinance']],
    ['08c-fee-refunds.js', ['rfMaps', 'payRefunded', 'payPendingRefund', 'payNet', 'payRefundable']],
  ], {
    CATS: { fee: 'Tuition Fee', bus: 'Bus Fee', stock: 'Stock', hostel: 'Hostel' },
    classFeeStructure: { 'Class 5': { fee: 30000, bus: 6000, stock: 2000 } },
    payments: [], studentDiscounts: [], studentExtraFees: [], feeRefunds: [], transportRoutes: [], hostelRooms: [],
    financeSettings: { hostel: 0 }, _rfCache: null, ...o,
  });
}
const stu = { id: 's1', className: 'Class 5', needsTransport: 'No', isBoarder: 'No' };
const pay = (id, amount, extra = {}) => ({ id, studentId: 's1', category: 'fee', amount, discount: 0, classAtPayment: 'Class 5', ...extra });

console.log('Collected and receivable');
test('nothing paid: receivable equals the class fee', () => {
  const f = sandbox().computeStudentFinance(stu);
  assert.equal(f.perCat.fee.expected, 30000); assert.equal(f.perCat.fee.receivable, 30000);
});
test('part payments add up and reduce the balance', () => {
  const f = sandbox({ payments: [pay('p1', 10000), pay('p2', 5000)] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.collected, 15000); assert.equal(f.perCat.fee.receivable, 15000);
});
test('overpaying never produces a negative balance', () => {
  const f = sandbox({ payments: [pay('p1', 40000)] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.receivable, 0);
});
test('a voided receipt stops counting as collected', () => {
  const f = sandbox({ payments: [pay('p1', 10000), pay('p2', 5000, { voided: true })] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.collected, 10000);
});
test("an old class's payments are not counted against the new class", () => {
  const f = sandbox({ payments: [pay('p1', 30000, { classAtPayment: 'Class 4' })] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.collected, 0); assert.equal(f.perCat.fee.receivable, 30000);
});
test('another student\'s payments are never mixed in', () => {
  const f = sandbox({ payments: [{ ...pay('p1', 9000), studentId: 's2' }] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.collected, 0);
});

console.log('\nDiscounts');
test('approved percentage discount reduces what is payable', () => {
  const f = sandbox({ studentDiscounts: [{ studentId: 's1', status: 'Approved', appliesTo: 'fee', mode: 'percentage', value: 10 }] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.discount, 3000); assert.equal(f.perCat.fee.netPayable, 27000);
});
test('approved fixed discount reduces what is payable', () => {
  const f = sandbox({ studentDiscounts: [{ studentId: 's1', status: 'Approved', appliesTo: 'fee', mode: 'amount', value: 2500 }] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.receivable, 27500);
});
test('a discount that is not approved is ignored', () => {
  const f = sandbox({ studentDiscounts: [{ studentId: 's1', status: 'Pending', appliesTo: 'fee', mode: 'amount', value: 2500 }] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.discount, 0);
});
test('a discount recorded on the receipt itself counts once', () => {
  const f = sandbox({ payments: [pay('p1', 25000, { discount: 5000 })] }).computeStudentFinance(stu);
  assert.equal(f.perCat.fee.receivable, 0);
});

console.log('\nRefunds');
test('a processed refund reduces collected; a pending one does not yet', () => {
  const E = sandbox({ payments: [pay('p1', 10000)], feeRefunds: [{ status: 'processed', lines: [{ paymentId: 'p1', amount: 3000 }] }, { status: 'pending', lines: [{ paymentId: 'p1', amount: 2000 }] }] });
  assert.equal(E.computeStudentFinance(stu).perCat.fee.collected, 7000);
  assert.equal(E.payRefundable({ id: 'p1', amount: 10000 }), 5000);
});
test('cannot refund more than was paid', () => {
  const E = sandbox({ feeRefunds: [{ status: 'processed', lines: [{ paymentId: 'p1', amount: 10000 }] }] });
  assert.equal(E.payNet({ id: 'p1', amount: 10000 }), 0); assert.equal(E.payRefundable({ id: 'p1', amount: 10000 }), 0);
});
test('a voided payment has nothing left to refund', () => {
  assert.equal(sandbox().payRefundable({ id: 'p1', amount: 5000, voided: true }), 0);
});

console.log('\nBus, hostel and extras');
test('bus fee applies only to students who use transport', () => {
  const E = sandbox();
  assert.equal(E.computeStudentFinance(stu).perCat.bus.expected, 0);
  assert.equal(E.computeStudentFinance({ ...stu, needsTransport: 'Yes' }).perCat.bus.expected, 6000);
});
test('route stop fare overrides the class bus fare', () => {
  const E = sandbox({ transportRoutes: [{ id: 'r1', stops: [{ id: 'st1', fare: 8500 }] }] });
  assert.equal(E.computeStudentFinance({ ...stu, needsTransport: 'Yes', transportRouteId: 'r1', transportStopId: 'st1' }).perCat.bus.expected, 8500);
});
test('hostel fee applies only to boarders', () => {
  const E = sandbox({ financeSettings: { hostel: 40000 } });
  assert.equal(E.computeStudentFinance(stu).perCat.hostel.expected, 0);
  assert.equal(E.computeStudentFinance({ ...stu, isBoarder: 'Yes' }).perCat.hostel.expected, 40000);
});
test('unpaid extra fees add to the family receivable, paid ones to collected', () => {
  const f = sandbox({ studentExtraFees: [{ studentId: 's1', amount: 500, paid: false }, { studentId: 's1', amount: 300, paid: true }] }).computeStudentFinance(stu);
  assert.equal(f.totals.receivable, 30000 + 2000 + 500); assert.equal(f.totals.collected, 300);
});
done('fee balances');
