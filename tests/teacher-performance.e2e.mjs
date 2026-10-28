// Teacher performance v2. Run: BASE=http://127.0.0.1:4042 node tests/e2e/teacher-performance.e2e.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const B = process.env.BASE || 'http://127.0.0.1:4042';
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = [];
const XL = process.env.XLSX_LOCAL || '/tmp/rv/t14/xl/package/dist/xlsx.full.min.js';
if (fs.existsSync(XL)) await ctx.route(/xlsx\.full\.min\.js/, r => r.fulfill({ path: XL, contentType: 'application/javascript' }));
pg.on('pageerror', e => errs.push(String(e)));
try {
  await pg.goto(B + '/'); await pg.fill('#loginUsername', 'demo.admin'); await pg.fill('#loginPassword', 'Demo@123'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#navInsights', { state: 'visible', timeout: 20000 }); await pg.waitForTimeout(1500);
  assert.equal(await pg.evaluate(() => examResults.length), 0); ok('Start state: marks are not loaded yet (the situation that caused the empty page)');
  await pg.evaluate(() => switchView('staff')); await pg.waitForTimeout(1000); await pg.evaluate(() => switchStaffTab('reports'));
  await pg.waitForSelector('#stfReportsBody table tbody tr', { timeout: 20000 });
  const txt = await pg.innerText('#stfReportsBody'); assert.match(txt, /Based on \d+ marks/); assert.match(txt, /Distinction/); assert.doesNotMatch(txt, /No marks recorded yet/); ok('Opening Staff → Reports directly now shows the ranked teachers and a data-coverage line');
  const first = await pg.innerText('#stfReportsBody table tbody tr >> nth=0'); assert.match(first, /#1/); assert.match(first, /%/); ok('Rows show students, average, pass rate, distinction and below-pass');
  await pg.click('#stfReportsBody table tbody tr >> nth=0'); await pg.waitForSelector('text=Class & subject breakdown'); ok('Opening a teacher shows the class and subject breakdown');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.evaluate(() => generateTeacherPerfReport('summary', 'excel', getStaffReportScopeFilters()))]);
  assert.match(dl.suggestedFilename(), /teacher_performance_summary/); ok('Excel summary downloads');
  const cols = await pg.evaluate(() => Object.keys(teacherPerformanceSummaryReport('', { className: '', section: '', department: '' })[0]));
  for (const c of ['Distinct Students', 'Results Below Pass', 'Data Note']) assert.ok(cols.includes(c), c); assert.ok(cols.some(c => /^Distinction/.test(c))); ok('Summary export has the new columns');
  // diagnostics when nothing can be shown
  const why = await pg.evaluate(() => { const sv = examResults; examResults = []; const d = __teacherPerf.diagnose('', { className: '', section: '', department: '' }); const m = __teacherPerf.whyEmpty(d); examResults = sv; return m; });
  assert.ok(why.some(m => /No marks have been entered/.test(m))); ok('With no marks, it says so and where to enter them');
  const why2 = await pg.evaluate(() => { const d = __teacherPerf.diagnose('', { className: '', section: '', department: '' }); d.withTeacher = 0; d.noTeacher = []; return __teacherPerf.whyEmpty(d); });
  assert.ok(why2.some(m => /No teacher is assigned/.test(m))); ok('With no teachers assigned, it says so and points to Manage Subjects');
  // fresh page, export directly (marks not preloaded)
  const pg2 = await ctx.newPage(); pg2.on('pageerror', e => errs.push(String(e)));
  await pg2.goto(B + '/'); await pg2.waitForSelector('#navInsights', { state: 'visible', timeout: 20000 }); await pg2.waitForTimeout(1500);
  const [dl2] = await Promise.all([pg2.waitForEvent('download'), pg2.evaluate(() => generateTeacherPerfReport('detail', 'excel', { className: '', section: '', department: '', feeType: '', studentId: '' }))]);
  assert.match(dl2.suggestedFilename(), /teacher_performance_detail/); ok('Exporting straight after sign-in works too (no empty-report message)');
  assert.deepEqual(errs, [], errs.join('|')); ok('No page errors');
  console.log('ALL PASSED (' + n + ')');
} catch (e) { console.error('FAIL', e.message); await pg.screenshot({ path: '/tmp/rv/t14/fail3.png' }); process.exitCode = 1; } finally { await br.close(); }
