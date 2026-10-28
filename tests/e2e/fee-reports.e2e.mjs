// Fee reports v2. Run: BASE=http://127.0.0.1:4042 node tests/e2e/fee-reports.e2e.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const B = process.env.BASE || 'http://127.0.0.1:4042';
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = [];
const XL = process.env.XLSX_LOCAL || '/tmp/rv/t14/xl/package/dist/xlsx.full.min.js';
if (fs.existsSync(XL)) await ctx.route(/xlsx\.full\.min\.js/, r => r.fulfill({ path: XL, contentType: 'application/javascript' }));
pg.on('pageerror', e => errs.push(String(e)));
try {
  await pg.goto(B + '/'); await pg.fill('#loginUsername', 'demo.admin'); await pg.fill('#loginPassword', 'Demo@123'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#navInsights', { state: 'visible', timeout: 20000 });
  await pg.evaluate(async () => { await ensureDataLoaded('payments', loadPaymentsData); });
  // 1. engine == the ERP's own finance numbers for every student
  const cmp = await pg.evaluate(() => {
    const all = Object.keys(CATS); let bad = [];
    students.filter(isActive).forEach(s => {
      const a = computeStudentFinance(s).totals, b = __feeReports.studentFigures(s, { types: all, old: true, extras: true, asOn: '' });
      if (Math.round(a.expected) !== Math.round(b.totalFee) || Math.round(a.collected) !== Math.round(b.paid) || Math.round(a.receivable) !== Math.round(b.due)) bad.push([s.firstName, a.expected, b.totalFee, a.collected, b.paid, a.receivable, b.due].join('/'));
    });
    return { n: students.filter(isActive).length, bad: bad.slice(0, 5), nbad: bad.length };
  });
  assert.equal(cmp.nbad, 0, 'engine mismatch: ' + cmp.bad.join(' | ')); ok('Report engine matches the ERP fee calculation for all ' + cmp.n + ' active students');
  // 2. identities
  const idn = await pg.evaluate(() => {
    const R = __feeReports.buildRegister({}, { types: Object.keys(CATS), old: true, extras: true, asOn: '', show: 'all', sort: 'id' });
    const bad = R.rows.filter(r => Math.round(r.totalFee - r.concession) !== Math.round(r.payable) || r.due < 0 || Math.round(r.payable - r.paid + r.excess) !== Math.round(r.due)).length;
    const sumG = R.groups.reduce((a, g) => a + g.subtotal.due, 0);
    return { bad, grandDue: R.grand.due, sumG, rows: R.rows.length, grandPaid: R.grand.paid };
  });
  assert.equal(idn.bad, 0); assert.equal(Math.round(idn.grandDue), Math.round(idn.sumG)); ok('Total − Concession = Payable, Payable − Paid (+excess) = Due, grand total = sum of classes');
  // 2b. old balance + extra fees (incl. a part-paid one) are inside the balance
  const ex = await pg.evaluate(() => {
    const s = students.filter(isActive)[0];
    const all = { types: Object.keys(CATS), old: true, extras: true, asOn: '' };
    const base = __feeReports.studentFigures(s, { types: Object.keys(CATS), old: false, extras: false, asOn: '' });
    studentExtraFees.push({ id: 'tx_old', studentId: s.id, name: 'Previous Year Dues', amount: 5000, paid: false, paidAmount: 2000 });
    studentExtraFees.push({ id: 'tx_ex', studentId: s.id, name: 'Admission Fee', amount: 1000, paid: false });
    const w = __feeReports.studentFigures(s, all), onlyOld = __feeReports.studentFigures(s, { types: [], old: true, extras: false, asOn: '' });
    const fin = computeStudentFinance(s).totals;
    return { dueAdd: Math.round(w.due - base.due), paidAdd: Math.round(w.paid - base.paid), oldDue: w.oldDue, extraDue: w.extraDue, onlyOldDue: onlyOld.due, finDueAdd: Math.round(fin.receivable - base.due) };
  });
  assert.equal(ex.dueAdd, 4000); assert.equal(ex.paidAdd, 2000); assert.equal(ex.oldDue, 3000); assert.equal(ex.extraDue, 1000); assert.equal(ex.onlyOldDue, 3000); assert.equal(ex.finDueAdd, 4000);
  ok('Old balance (₹3,000 left of ₹5,000) and extra fee (₹1,000) are in the balance; part-paid counted correctly, also in the ERP totals');
  await pg.evaluate(() => { studentExtraFees = studentExtraFees.filter(e => !/^tx_/.test(e.id)); });
  // 3. only-due list & as-on date
  const f = await pg.evaluate(() => {
    const o = { types: Object.keys(CATS), old: true, extras: true, asOn: '', show: 'due', sort: 'due', minDue: 0 };
    const D = __feeReports.buildRegister({}, o); const A = __feeReports.buildRegister({}, Object.assign({}, o, { show: 'all' }));
    const early = __feeReports.buildRegister({}, Object.assign({}, o, { show: 'all', asOn: '2000-01-01' }));
    const firstClass = D.groups[0].students; const sorted = firstClass.every((r, i) => !i || firstClass[i - 1].due >= r.due);
    return { dueRows: D.rows.length, allRows: A.rows.length, allDue: A.rows.filter(r => r.due > 0).length, allOk: D.rows.every(r => r.due > 0), earlyPaid: early.grand.paid, nowPaid: A.grand.paid, sorted };
  });
  assert.equal(f.dueRows, f.allDue); assert.ok(f.allOk); ok('Due list contains exactly the students who owe something');
  assert.equal(f.earlyPaid, 0); assert.ok(f.nowPaid >= 0); ok('"As on date" before any receipt shows nothing paid');
  // 4. dialog -> excel
  await pg.evaluate(() => generateLibraryReport('fee_due_list', 'excel'));
  await pg.waitForSelector('#fr2_overlay'); const prev = await pg.innerText('#fr2_preview'); assert.match(prev, /students/); ok('Options window shows a live preview: ' + prev.replace(/\s+/g, ' '));
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#fr2_overlay button:has-text("Excel")')]);
  const path = await dl.path(); assert.match(dl.suggestedFilename(), /fee_due_list/); assert.ok(fs.statSync(path).size > 2000); ok('Excel downloads: ' + dl.suggestedFilename());
  await pg.click('#fr2_overlay button:has-text("Cancel")');
  // 5. print layout
  await pg.evaluate(() => generateLibraryReport('fee_due_payable_classwise', 'pdf')); await pg.waitForSelector('#fr2_overlay');
  const [pop] = await Promise.all([ctx.waitForEvent('page'), pg.click('#fr2_overlay button:has-text("Print")')]);
  await pop.waitForLoadState(); const html = await pop.content();
  assert.match(html, /Fee Paid, Payable and Due Report for Student wise/); assert.match(html, /Class : /); assert.match(html, /Grand Total/); assert.match(html, /Report Generated on/); assert.match(html, /S\.No\./); assert.match(html, /Due Amount/); ok('Print view has the register layout: title, class blocks, totals, generated-on footer');
  await pop.close(); await pg.evaluate(() => fr2Close());
  // 6. summary + receipts
  const sm = await pg.evaluate(() => { const R = __feeReports.buildRegister({}, { types: Object.keys(CATS), old: true, extras: true, asOn: '', show: 'all', sort: 'id' }); return R.groups.length; });
  assert.ok(sm > 0); await pg.evaluate(() => generateLibraryReport('fee_class_summary', 'pdf')); await pg.waitForSelector('#fr2_overlay');
  const [p2] = await Promise.all([ctx.waitForEvent('page'), pg.click('#fr2_overlay button:has-text("Print")')]); await p2.waitForLoadState(); assert.match(await p2.content(), /Collected/); await p2.close(); await pg.evaluate(() => fr2Close()); ok('Class-wise summary prints');
  await pg.evaluate(() => generateLibraryReport('fee_receipts_between', 'excel')); await pg.waitForSelector('#fr2_overlay');
  await pg.fill('#fr2_from', '2000-01-01'); await pg.fill('#fr2_to', new Date().toISOString().slice(0, 10));
  const rp = await pg.innerText('#fr2_preview'); assert.match(rp, /receipts/); ok('Receipts report preview: ' + rp.replace(/\s+/g, ' '));
  await pg.evaluate(() => fr2Close());
  // 7. Reports menu lists the new reports under Accounts
  const lib = await pg.evaluate(() => REPORT_LIBRARY.filter(r => r.category === 'Accounts').map(r => r.id));
  for (const id of ['fee_due_list', 'fee_paid_list', 'fee_class_summary', 'fee_receipts_between', 'fee_due_payable_classwise']) assert.ok(lib.includes(id), id); ok('All five fee reports are in the Accounts reports list');
  assert.deepEqual(errs, [], 'page errors: ' + errs.join('|')); ok('No page errors');
  console.log('ALL PASSED (' + n + ')');
} catch (e) { console.error('FAIL', e.message); await pg.screenshot({ path: '/tmp/rv/t14/fail2.png' }); process.exitCode = 1; } finally { await br.close(); }
