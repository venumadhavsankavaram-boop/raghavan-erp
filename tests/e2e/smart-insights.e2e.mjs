// Smart Insights in a browser against a running (demo) server.  Run: BASE=http://127.0.0.1:4042 node tests/e2e/smart-insights.e2e.mjs
import assert from 'node:assert/strict';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const B = process.env.BASE || 'http://127.0.0.1:4042';
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1300, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
try {
  await pg.goto(B + '/'); await pg.fill('#loginUsername', 'demo.admin'); await pg.fill('#loginPassword', 'Demo@123'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#navInsights', { state: 'visible', timeout: 20000 }); ok('Admin sees Smart Insights in the menu');
  // controlled data
  await pg.evaluate(() => {
    const act = students.filter(isActive); window.__act = act.slice(0, 5).map(s => s.id);
    const iso = d => { const x = new Date(Date.now() - d * 86400000); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    window.__iso = iso;
    act[0].fatherPhone = '9876543210'; act[1].fatherPhone = '9123456780'; act[2].fatherPhone = '9000000001'; act[3].fatherPhone = ''; act[3].motherPhone = ''; act[3].guardianPhone = ''; act[4].dob = ''; act[4].fatherPhone = '9444444444';
    const rec = []; let i = 0;
    for (let d = 1; d <= 30; d++) { // student 0: absent last 4 days, present before
      rec.push({ id: 'a0' + d, studentId: act[0].id, date: iso(d), session: 'Morning', status: d <= 4 ? 'Absent' : 'Present' });
      rec.push({ id: 'a1' + d, studentId: act[1].id, date: iso(d), session: 'Morning', status: d % 2 ? 'Absent' : 'Present' }); // 50%
      rec.push({ id: 'a2' + d, studentId: act[2].id, date: iso(d), session: 'Morning', status: 'Present' });
    }
    window.__rec = rec; attendanceRecords = rec; _lazyDataPromises['attendanceRecords'] = Promise.resolve();
    window.__sfOrig = window.sfStudentSummary;
    window.sfStudentSummary = s => s.id === act[1].id
      ? { state: 'overdue', dueNow: 2000, totals: { collected: 3000, receivable: 2000 }, rows: { allRows: [{ overdueAmount: 2000, installments: [{ status: 'overdue', outstanding: 2000, due: iso(60) }] }] } }
      : s.id === act[2].id
      ? { state: 'overdue', dueNow: 5000, totals: { receivable: 5000 }, rows: { allRows: [{ overdueAmount: 5000, installments: [{ status: 'overdue', outstanding: 5000, due: iso(60) }] }] } }
      : s.id === act[4].id ? { state: 'pending', dueNow: 0, nextDue: iso(-20), totals: { collected: 0, receivable: 8000 }, rows: { allRows: [] } }
      : { state: 'paid', dueNow: 0, totals: { receivable: 0 }, rows: { allRows: [] } };
    window.refreshAdmissionInquiries = async () => {};
    admissionInquiries = window.__inq = [
      { id: 'q1', studentName: 'Asha', parentName: 'Ravi', parentPhone: '9811111111', applyingGrade: 'Class 1', submittedDate: iso(5), status: 'New' },
      { id: 'q2', studentName: 'Kiran', parentName: 'Lata', parentPhone: '9822222222', applyingGrade: 'Class 3', submittedDate: iso(12), status: 'Contacted' },
      { id: 'q3', studentName: 'Done', parentName: 'X', parentPhone: '9833333333', applyingGrade: 'Class 2', submittedDate: iso(1), status: 'Converted' },
    ];
  });
  await pg.evaluate(() => switchView('insights')); await pg.waitForSelector('#siTabs .mf-tab');
  const tabs = await pg.$$eval('#siTabs .mf-tab', els => els.map(e => e.textContent.trim()));
  assert.ok(tabs.some(t => /Fees/.test(t)) && tabs.some(t => /Attendance/.test(t)) && tabs.some(t => /Notice helper/.test(t)) && tabs.some(t => /Enquiries/.test(t)) && tabs.some(t => /Data health/.test(t)) && tabs.some(t => /Needs attention/.test(t))); ok('all six tabs are there');

  // Dashboard card
  await pg.evaluate(() => switchView('dashboard')); await pg.waitForSelector('#dashInsights .si-dash-tile', { timeout: 15000 });
  const dc = await pg.innerText('#dashInsights'); assert.match(dc, /Needs your attention today/i); assert.match(dc, /fees overdue/i); assert.match(dc, /attendance follow-up/i); assert.match(dc, /enquiries/i); ok('Dashboard: attention card shows fees, attendance and enquiries');
  await pg.click('#dashInsights .si-dash-tile >> nth=0'); await pg.waitForSelector('#siTabs .mf-tab'); assert.match(await pg.innerText('#siPane'), /overdue/i); ok('Dashboard: card opens Smart Insights on the right tab');
  await pg.evaluate(() => { attendanceRecords = window.__rec; _lazyDataPromises['attendanceRecords'] = Promise.resolve(); admissionInquiries = window.__inq || admissionInquiries; const a4 = window.__act[4]; window.computeStudentFinance = s => s.id === a4 ? { perCat: { fee: { collected: 0, receivable: 8000 } }, totals: {} } : { perCat: { fee: { collected: 1, receivable: 0 } }, totals: {} }; }); // the dashboard reloads real data; put the controlled data back
  // Fees: class summary first, then the list
  const feeTxt = await pg.innerText('#siPane');
  assert.match(feeTxt, /Students overdue/i); assert.match(feeTxt, /Nothing paid/i); assert.match(feeTxt, /₹7,000/); assert.match(feeTxt, /Open class/i); ok('Fees: class summary with totals and paid counts');
  await pg.click('#siPane button:has-text("See all students in one list")');
  const list = await pg.innerText('#siPane');
  assert.match(list, /Nothing paid/i); assert.match(list, /Part paid/i); assert.match(list, /₹3,000/); ok('Fees: list shows paid so far and Nothing paid / Part paid status');
  const was = await pg.$$eval('#siPane a[href*="wa.me"]', as => as.map(a => decodeURIComponent(a.href)));
  const none = was.find(w => /919000000001/.test(w)), part = was.find(w => /919123456780/.test(w));
  assert.ok(none && /60 days/.test(none) && /5,000/.test(none)); ok('Fees: nothing-paid family gets the urgent message');
  assert.ok(part && /Thank you for the payment already made/.test(part) && !/60 days/.test(part)); ok('Fees: part-paid family gets a thank-you and gentle reminder');
  await pg.selectOption('#siPane select >> nth=3', 'gentle');
  assert.ok((await pg.$$eval('#siPane a[href*="wa.me"]', as => as.map(a => decodeURIComponent(a.href)))).every(w => !/60 days/.test(w))); ok('Fees: always-gentle override works');
  await pg.selectOption('#siPane select >> nth=2', 'part'); assert.doesNotMatch(await pg.innerText('#siPane tbody'), /Nothing paid/); ok('Fees: paid filter works');
  const dl = await Promise.all([pg.waitForEvent('download'), pg.click('#siPane button:has-text("Download list")')]); assert.match(dl[0].suggestedFilename(), /overdue-fees-.*\.csv/); ok('Fees: CSV download');
  await pg.click('#siPane button:has-text("All classes")'); assert.match(await pg.innerText('#siPane'), /Open class/); ok('Fees: back to class summary');
  assert.match(await pg.innerText('#siPane'), /Tuition not paid at all/i); assert.match(await pg.innerText('#siPane'), /₹7,000/); ok('Fees: overdue view does not count fees not yet due');
  await pg.selectOption('#siPane select >> nth=0', 'unpaid'); const un = await pg.innerText('#siPane'); assert.match(un, /₹15,000/); await pg.click('#siPane button:has-text("See all students in one list")');
  const ul = await pg.innerText('#siPane tbody'); assert.match(ul, /Tuition not paid/i); assert.match(ul, /₹8,000/); ok('Fees: "Also tuition not paid yet" shows a family that has paid no tuition');
  const w3 = (await pg.$$eval('#siPane a[href*="wa.me"]', as => as.map(a => decodeURIComponent(a.href)))).find(w => /tuition fee/.test(w)); assert.ok(w3 && /8,000/.test(w3)); ok('Fees: not-yet-due message is a plain reminder');
  await pg.selectOption('#siPane select >> nth=0', 'overdue'); await pg.click('#siPane button:has-text("All classes")');

  // Attendance
  await pg.evaluate(() => siGo('attendance')); await pg.waitForFunction(() => /Need follow-up/i.test(document.getElementById('siPane').innerText));
  const at = await pg.innerText('#siPane'); assert.match(at, /Absent 3\+ days in a row/i); assert.match(at, /4 days in a row/); assert.match(at, /Low attendance/i); ok('Attendance: streak and low-attendance students are flagged');
  const stats = await pg.evaluate(() => __siTest.attStats().map(r => ({ id: r.s.id, r: r.reasons })));
  const ids = await pg.evaluate(() => window.__act); assert.ok(stats.find(x => x.id === ids[0]).r.includes('streak')); assert.ok(stats.find(x => x.id === ids[1]).r.includes('low')); assert.ok(!stats.find(x => x.id === ids[2])); ok('Attendance: a child who is always present is not flagged');
  const wa2 = await pg.$eval('#siPane a[href*="wa.me"]', a => decodeURIComponent(a.href)); assert.match(wa2, /absent from/); ok('Attendance: message names the streak');

  // Needs attention
  await pg.evaluate(() => siGo('attention')); await pg.waitForFunction(() => document.getElementById('siPane').innerText.includes('prompt to talk'));
  const na = await pg.evaluate(() => __siTest.attStats().length); assert.ok(na >= 2); ok('Needs attention: loads without errors');

  // Enquiries
  await pg.evaluate(() => siGo('enquiries')); await pg.waitForFunction(() => /Open enquiries/i.test(document.getElementById('siPane').innerText));
  const eq = await pg.innerText('#siPane'); assert.match(eq, /Asha/); assert.match(eq, /Kiran/); assert.ok(!/Done/.test(eq)); assert.match(eq, /Waiting 3\+ days/i); assert.match(eq, /Going cold/i); ok('Enquiries: only open ones, with waiting and going-cold labels');
  const wa3 = await pg.$eval('#siPane a[href*="wa.me"]', a => decodeURIComponent(a.href)); assert.match(wa3, /wa\.me\/919811111111/); assert.match(wa3, /Dear Ravi/); ok('Enquiries: reply goes to the parent by name');

  // Notices
  await pg.evaluate(() => siGo('notices')); await pg.waitForSelector('#siNoticeTitle');
  await pg.evaluate(() => { siNf('date', '2026-11-14'); siNf('what', "Children's Day"); });
  const t = await pg.inputValue('#siNoticeTitle'), b = await pg.inputValue('#siNoticeBody'); assert.match(t, /14 Nov 2026/); assert.match(b, /Children's Day/); ok('Notices: holiday draft fills in date and occasion');
  await pg.selectOption('#siPane select >> nth=0', 'exam'); assert.match(await pg.inputValue('#siNoticeBody'), /admit card/); ok('Notices: switching type changes the draft');
  await pg.evaluate(() => siNoticeUse()); await pg.waitForFunction(() => { const a = document.getElementById('commsTitle'); return a && a.value; }, null, { timeout: 8000 }); ok('Notices: "Use in Announcements" opens it with the text filled in');

  // Data health
  await pg.evaluate(() => { switchView('insights'); siGo('health'); }); await pg.waitForFunction(() => /Records with issues/i.test(document.getElementById('siPane').innerText));
  const hc = await pg.evaluate(() => Object.fromEntries(__siTest.healthChecks().checks.map(c => [c.k, c.rows.map(s => s.id)]))); const ids2 = await pg.evaluate(() => window.__act);
  assert.ok(hc.nophone.includes(ids2[3])); assert.ok(hc.nodob.includes(ids2[4])); ok('Data health: finds a student with no phone and one with no birth date');

  assert.deepEqual(errs, []); ok('no page errors');
} finally { await br.close(); }
console.log('ALL ' + n + ' CHECKS PASSED');
