// Student bulk import v2. Run: BASE=http://127.0.0.1:4042 node tests/e2e/student-import.e2e.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const B = process.env.BASE || 'http://127.0.0.1:4042';
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1300, height: 900 } }); const errs = [];
const XL = process.env.XLSX_LOCAL || '/tmp/rv/t14/xl/package/dist/xlsx.full.min.js';
if (fs.existsSync(XL)) await pg.route(/xlsx\.full\.min\.js/, r => r.fulfill({ path: XL, contentType: 'application/javascript' }));
pg.on('pageerror', e => errs.push(String(e)));
try {
  await pg.goto(B + '/'); await pg.fill('#loginUsername', 'demo.admin'); await pg.fill('#loginPassword', 'Demo@123'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#navInsights', { state: 'visible', timeout: 20000 });
  await pg.evaluate(() => switchView('students')); await pg.waitForTimeout(1500);
  const info = await pg.evaluate(() => {
    const a = students.filter(s => !s.deleted && s.firstName && s.lastName && s.className && s.section);
    const s1 = a[0], s2 = a[1], s3 = a[2], s4 = a[3];
    s2.dob = '2013-05-17'; s3.dob = ''; s4.admissionNo = s4.admissionNo || 'ZZ1';
    return { before: students.length, s1: { adm: s1.admissionNo, f: s1.firstName, l: s1.lastName, c: s1.className, sec: s1.section },
      s2: { f: s2.firstName, l: s2.lastName, c: s2.className, sec: s2.section }, s3: { f: s3.firstName, l: s3.lastName, c: s3.className, sec: s3.section },
      s4: { adm: s4.admissionNo, c: s4.className, sec: s4.section } };
  });
  const { s1, s2, s3, s4 } = info; const RS = Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6); const ZN = 'Zorb' + RS, BN = 'Brand' + RS; const C = (x) => `"${x}"`;
  const rows = [
    ['Admission No', 'First Name', 'Last Name', 'Class', 'Section', 'Date of Birth', 'Father Phone'],
    [s1.adm.toLowerCase().replace(/-/g, ''), s1.f.toUpperCase(), s1.l, s1.c, s1.sec, '', '9876501234'],            // 1 exact (formatted differently)
    ['', s2.l + ' ' + s2.f, '', s2.c, s2.sec, '17/05/2013', ''],                                                    // 2 -> will error (last name blank)
    ['', s2.f.toLowerCase(), s2.l, s2.c, s2.sec, '17/05/2013', '9876501235'],                                        // 3 name+dob
    ['', ZN, 'Testington', s1.c, s1.sec, '2014-02-02', '9000011111'],                                         // 4 brand new
    ['', ZN.toLowerCase(), 'testington', s1.c, s1.sec, '02/02/2014', ''],                                                   // 5 repeated in file
    [s4.adm, 'Qwerty', 'Different', s4.c, s4.sec, '', ''],                                                           // 6 admission no belongs to someone else
    ['', s3.f, s3.l, s3.c, s3.sec, '', ''],                                                                          // 7 name+class, no dob -> check
    ['', BN, 'Person', s1.c, s1.sec, '', ''],                                                                // 8 brand new
  ].map(r => r.map(C).join(',')).join('\n');
  fs.writeFileSync('/tmp/rv/t14/import.csv', rows);
  await pg.evaluate(() => openImportWizard('students'));
  assert.match(await pg.innerText('#importWizardBody'), /Safe to upload the same sheet again/); ok('Step 1 explains duplicate safety');
  await pg.setInputFiles('#importWizardFileInput', '/tmp/rv/t14/import.csv');
  await pg.waitForSelector('#importMap_firstName'); ok('Columns auto-matched');
  await pg.click('button:has-text("Continue to Preview")'); await pg.waitForSelector('#importWizardBody table');
  const v = await pg.evaluate(() => importWizard.validated.map(r => ({ row: r.rowNum, st: r.status, ac: r.action, lv: r.level })));
  const by = k => v.find(x => x.row === k);
  assert.equal(by(2).st, 'update'); assert.equal(by(2).lv, 'exact'); ok('Admission no. written differently still matches the existing student');
  assert.equal(by(3).st, 'error'); ok('Row with missing last name is an error');
  assert.equal(by(4).st, 'update'); assert.equal(by(4).lv, 'strong'); ok('Name (any case) + DOB (other format) matches existing student');
  assert.equal(by(5).st, 'new'); assert.equal(by(5).ac, 'new'); ok('Genuinely new student is New');
  assert.equal(by(6).st, 'dupfile'); assert.equal(by(6).ac, 'skip'); ok('Repeated row inside the file is skipped');
  assert.equal(by(7).st, 'review'); assert.equal(by(7).ac, 'skip'); ok('Admission no. belonging to someone else needs review and defaults to Skip');
  assert.equal(by(8).st, 'review'); assert.equal(by(8).ac, 'skip'); ok('Same name+class without DOB needs review, defaults to Skip');
  assert.equal(by(9).st, 'new'); ok('Second new student is New');
  const t = await pg.innerText('#importWizardBody'); assert.match(t, /2 will be added/); assert.match(t, /2 will be updated/); assert.match(t, /2 to check/); ok('Summary pills correct');
  // commit; double click must not duplicate
  await pg.click('button:has-text("Import 4")'); 
  await pg.click('#confirmDialogOkBtn');
  await pg.waitForSelector('text=Import complete', { timeout: 15000 }); ok('Import completes with a summary');
  const after = await pg.evaluate(zn => ({ n: students.length, z: students.filter(s => s.firstName === zn).length, adms: students.map(s => (s.admissionNo || '').toLowerCase()) }), ZN);
  assert.equal(after.n, info.before + 2); assert.equal(after.z, 1); ok('Only the 2 genuinely new students were created');
  const dup = after.adms.filter((a, i) => a && after.adms.indexOf(a) !== i); assert.equal(dup.length, 0, 'duplicate admission numbers: ' + dup); ok('All admission numbers are unique');
  const upd = await pg.evaluate(a => students.find(s => (s.admissionNo || '').toLowerCase().replace(/-/g, '') === a).fatherPhone, s1.adm.toLowerCase().replace(/-/g, ''));
  assert.equal(upd, '9876501234'); ok('Existing student was updated, not copied');
  // second upload of same file adds nobody
  await pg.evaluate(() => openImportWizard('students')); await pg.setInputFiles('#importWizardFileInput', '/tmp/rv/t14/import.csv');
  await pg.waitForSelector('#importMap_firstName'); await pg.click('button:has-text("Continue to Preview")'); await pg.waitForSelector('#importWizardBody table');
  const v2 = await pg.evaluate(() => importWizard.validated.filter(r => r.action === 'new').length); assert.equal(v2, 0); ok('Re-uploading the same file would add nobody');
  const nx = await pg.evaluate(() => { const a = nextAdmissionNo(), b = nextAdmissionNo(); return [a, b, students.some(s => s.admissionNo === a)]; }); assert.equal(nx[2], false); ok('nextAdmissionNo() returns an unused number');
  // ---- server guard + safer duplicate cleanup ----
  const g = await pg.evaluate(async (RS) => {
    const H = () => Object.assign({ 'Content-Type': 'application/json' }, actorHeaders());
    const ex = students.find(x => x.admissionNo && !x.deleted);
    const mk = (id, adm, cls) => ({ id, firstName: 'Dup' + RS, lastName: 'Check', className: cls, section: 'A', status: 'Active', admissionNo: adm, name: 'Dup' + RS + ' Check' });
    const r1 = await fetch('/api/students', { method: 'POST', headers: H(), body: JSON.stringify(mk('t_dup_1' + RS, 'TD-' + RS + '-001', ex.className)) });
    const r2 = await fetch('/api/students', { method: 'POST', headers: H(), body: JSON.stringify(mk('t_dup_2' + RS, 'TD-' + RS + '-002', ex.className)) });
    const r3 = await fetch('/api/students', { method: 'POST', headers: H(), body: JSON.stringify(mk('t_dup_3' + RS, 'TD-' + RS + '-003', 'Some Other Class')) });
    const r4 = await fetch('/api/students', { method: 'POST', headers: H(), body: JSON.stringify(mk('t_dup_4' + RS, 'td' + RS.toLowerCase() + '001', ex.className)) });
    const body4 = await r4.json().catch(() => ({}));
    const r5 = await fetch('/api/students?action=delete-duplicates', { method: 'POST', headers: H(), body: '{}' });
    const out = await r5.json();
    const list = await (await fetch('/api/students', { headers: H() })).json();
    const left = list.filter(x => x.firstName === 'Dup' + RS).map(x => x.id).sort();
    return { s: [r1.status, r2.status, r3.status, r4.status], e4: body4.error, delStatus: r5.status, deleted: out.deletedCount, left };
  }, RS);
  assert.deepEqual(g.s, [201, 201, 201, 409]); assert.match(g.e4, /already belongs/); ok('Server refuses a second student with the same admission number (even written differently)');
  assert.equal(g.deleted >= 1, true); assert.deepEqual(g.left, ['t_dup_1' + RS, 't_dup_3' + RS]); ok('Duplicate cleanup removed the copy in the same class but kept the same name in another class');
  assert.deepEqual(errs, [], 'page errors: ' + errs.join('|')); ok('No page errors');
  console.log('ALL PASSED (' + n + ')');
} catch (e) { console.error('FAIL', e.message); await pg.screenshot({ path: '/tmp/rv/t14/fail.png' }); process.exitCode = 1; } finally { await br.close(); }
