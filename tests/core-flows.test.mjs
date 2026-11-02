// Automatic safety net for the four things that must never break: sign-in, fees, marks release, online exam timer.
// Starts its own server on an EMPTY test database, makes its own test users, and checks the rules through the real API.
// Run:   DB_HOST=127.0.0.1 DB_USER=... DB_PASSWORD=... DB_NAME=<empty test database> node tests/core-flows.test.mjs
// (npm test runs it only when DB_NAME is set; GitHub runs it on every push.)  Never point it at a real school's database.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

if (!process.env.DB_NAME) { console.log('core-flows: DB_NAME not set - skipped (needs an empty MySQL test database)'); process.exit(0); }
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.TEST_PORT || '4391', B = 'http://127.0.0.1:' + PORT, PW = 'Test1234!x';
const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
const [pre] = await db.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students'");
if (pre[0].n) { const [c] = await db.query('SELECT COUNT(*) AS n FROM students'); if (c[0].n) { console.error('REFUSING to run: this database already has students. Use an empty test database.'); process.exit(2); } }

const srv = spawn('node', ['server.js'], { cwd: root, env: { ...process.env, PORT, TZ: 'UTC', TEST_MODE: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => log += d); srv.stderr.on('data', d => log += d);
const stop = () => { try { srv.kill(); } catch (_) {} };
process.on('exit', stop);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.error('  FAIL ' + name + (extra === undefined ? '' : '  -> ' + JSON.stringify(extra).slice(0, 300))); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ipn = 10;
async function call(method, p, cookie, body, ip) {
  const r = await fetch(B + p, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), 'x-forwarded-for': ip || '9.9.9.' + (ipn++ % 200) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (_) {}
  return { s: r.status, j, ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') };
}
const login = async (u, pw = PW, aud, ip) => call('POST', '/api/login', null, { username: u, password: pw, audience: aud }, ip);

try {
  // ---- boot: wait for the server and the first-run admin row ----
  let up = false; for (let i = 0; i < 90 && !up; i++) { try { up = (await fetch(B + '/api/demo-info')).ok; } catch (_) { await sleep(1000); } }
  if (!up) throw new Error('server did not start:\n' + log.slice(-1500));
  for (let i = 0; i < 60; i++) { const [u] = await db.query("SELECT id FROM users WHERE id = 'u_admin'").catch(() => [[]]); if (u.length) break; await sleep(1000); }
  const hash = await bcrypt.hash(PW, 10);
  await db.query("UPDATE users SET password = ? WHERE id = 'u_admin'", [hash]);
  const mk = (id, name, user, role, stu) => db.query('INSERT INTO users (id, name, username, password, role, linked_student_id, recovery_code) VALUES (?,?,?,?,?,?,?)', [id, name, user, hash, role, stu || '', 'RC' + id.slice(-4).toUpperCase()]);
  await mk('u_t1', 'Test Teacher', 'tteacher', 'Teacher'); await mk('u_p1', 'Parent One', 'pone', 'Parent', 'zs1'); await mk('u_p2', 'Parent Two', 'ptwo', 'Parent', 'zs2');
  await mk('u_p3', 'Parent Three', 'pthree', 'Parent', 'zs3'); await mk('u_lock', 'Lock Test', 'lockme', 'Teacher');

  // ================= SIGN-IN =================
  console.log('\nSign-in');
  ok('wrong password is refused', (await login('admin', 'nope-nope-1')).s === 401);
  ok('unknown user is refused', (await login('nobody', PW)).s === 401);
  const A = await login('admin', PW, 'staff'); ok('right password signs in', A.s === 200 && !!A.ck, A.s);
  const T = await login('tteacher', PW, 'staff'), P1 = await login('pone', PW), P2 = await login('ptwo', PW), P3 = await login('pthree', PW);
  ok('teacher and parents can sign in', T.s === 200 && P1.s === 200 && P2.s === 200 && P3.s === 200, [T.s, P1.s, P2.s, P3.s]);
  ok('no sign-in -> data refused', (await call('GET', '/api/students')).s === 401);
  ok('no sign-in -> backup refused', [401, 403].includes((await call('GET', '/api/backup')).s));
  ok('teacher cannot download the backup', (await call('GET', '/api/backup', T.ck)).s === 403);
  ok('parent cannot download the backup', (await call('GET', '/api/backup', P1.ck)).s === 403);
  ok('parent cannot read the audit log', (await call('GET', '/api/audit-log', P1.ck)).s === 403);
  ok('teacher cannot see auto backups', (await call('GET', '/api/backup/auto', T.ck)).s === 403);
  ok('admin can see auto backups', (await call('GET', '/api/backup/auto', A.ck)).s === 200);
  let locked = false; for (let i = 0; i < 15 && !locked; i++) locked = (await login('lockme', 'bad-bad-bad1', undefined, '8.8.8.8')).s === 429;
  ok('many wrong passwords lock the account for a while', locked);
  ok('locked account cannot sign in even with the right password', (await login('lockme', PW, undefined, '8.8.8.8')).s === 429);

  // the teacher's login must be linked to a staff profile (as in a real school)
  const stf = await call('POST', '/api/staff', A.ck, { id: 'zstf1', firstName: 'Test', lastName: 'Teacher', department: 'Teaching', designation: 'Teacher', status: 'Active', staffId: 'ZZ-T1', linkedUserId: 'u_t1', classTeacherClass: '1st Class', classTeacherSection: 'A' });
  if (![200, 201].includes(stf.s)) console.error('staff create', stf.s, stf.j);
  await db.query("INSERT INTO subjects (id, name, code, class_name, sections, section_staff, staff_ids) VALUES ('zsub1','Maths','ZM','1st Class','[\"A\"]',?,?)", [JSON.stringify({ A: ['zstf1'] }), JSON.stringify(['zstf1'])]);

  // ================= STUDENTS + FEES =================
  console.log('\nFees');
  for (const [id, f] of [['zs1', 'Asha'], ['zs2', 'Bala'], ['zs3', 'Chitra']]) {
    const r = await call('POST', '/api/students', A.ck, { id, firstName: f, lastName: 'Test', className: id === 'zs3' ? '2nd Class' : '1st Class', section: 'A', status: 'Active', admissionNo: 'ZZ-' + id });
    if (![200, 201].includes(r.s)) console.error('student create', id, r.s, r.j);
  }
  const pay = (id, sid, amt, extra) => ({ id, receiptNo: 'ZZR-' + id, studentId: sid, studentName: 'Test', category: 'Tuition', mode: 'Cash', amount: amt, discount: 0, instalment: 'Term 1', date: '2031-01-05', note: '', classAtPayment: '1st Class', ...extra });
  const pr = await call('POST', '/api/payments', A.ck, pay('zpay1', 'zs1', 5000)); ok('admin records a fee payment', [200, 201].includes(pr.s), pr);
  ok('teacher cannot record a fee payment', (await call('POST', '/api/payments', T.ck, pay('zpay2', 'zs1', 100))).s === 403);
  ok('parent cannot record a fee payment', (await call('POST', '/api/payments', P1.ck, pay('zpay3', 'zs1', 100))).s === 403);
  let list = await call('GET', '/api/payments', A.ck); ok('admin sees the payment with the exact amount', Array.isArray(list.j) && Number(list.j.find(x => x.id === 'zpay1')?.amount) === 5000, list.s);
  list = await call('GET', '/api/payments', P1.ck); ok('parent sees their own child payment', list.s === 200 && list.j.some(x => x.id === 'zpay1'), list);
  list = await call('GET', '/api/payments', P2.ck); ok("another child's parent does NOT see it", list.s === 200 && !list.j.some(x => x.id === 'zpay1'), list.j);
  const dup = await call('POST', '/api/payments', A.ck, pay('zpay9', 'zs1', 10, { receiptNo: 'ZZR-zpay1' }));
  ok('a repeated receipt number is not accepted twice', dup.s >= 400, dup.s);
  const vd = await call('PUT', '/api/payments', A.ck, { ...pay('zpay1', 'zs1', 5000), voided: true, voidType: 'Cancelled', voidReason: 'test', voidedBy: 'Administrator', voidedAt: new Date().toISOString() });
  ok('admin can void a payment (with a reason)', vd.s === 200, vd);
  list = await call('GET', '/api/payments', A.ck); const v1 = list.j.find(x => x.id === 'zpay1'); ok('the voided payment is kept, marked void (not deleted)', !!v1 && (v1.voided === true || v1.voided === 1 || v1.voided === 'true'), v1);
  ok('teacher cannot delete payments', [403, 405].includes((await call('DELETE', '/api/payments?id=zpay1', T.ck)).s));

  // ================= MARKS RELEASE =================
  console.log('\nMarks release');
  const setRel = async (rel, ck) => call('PUT', '/api/kv/exam-releases', ck, rel);
  ok('teacher cannot release marks', (await setRel({ legacy: [], released: { 'zx1|1st Class': { at: 'x' } } }, T.ck)).s === 403);
  ok('parent cannot release marks', (await setRel({ legacy: [], released: { 'zx1|1st Class': { at: 'x' } } }, P1.ck)).s === 403);
  ok('admin switches on release control (nothing released yet)', (await setRel({ legacy: [], released: { 'zother|1st Class': { at: 'x', by: 'a' } }, revised: {} }, A.ck)).s === 200);
  await call('POST', '/api/exam-results', A.ck, { id: 'zr1', examId: 'zx1', studentId: 'zs1', subject: 'Maths', marks: 42, absent: false });
  await call('POST', '/api/exam-results', A.ck, { id: 'zr2', examId: 'zx1', studentId: 'zs2', subject: 'Maths', marks: 37, absent: false });
  let m = await call('GET', '/api/exam-results', A.ck); ok('admin sees all entered marks', Array.isArray(m.j) && m.j.some(x => x.id === 'zr1') && m.j.some(x => x.id === 'zr2'), m.s);
  m = await call('GET', '/api/exam-results', P1.ck); ok('parent does NOT see marks before release', m.s === 200 && !m.j.some(x => x.examId === 'zx1'), m.j);
  const st = await call('GET', '/api/my-exam-status', P1.ck); ok('parent is told marks are being entered (no marks shown)', st.s === 200 && st.j.some(x => x.examId === 'zx1' && x.state === 'entering') && !JSON.stringify(st.j).includes('42'), st.j);
  ok('admin releases the exam for 1st Class', (await setRel({ legacy: [], released: { 'zother|1st Class': { at: 'x', by: 'a' }, 'zx1|1st Class': { at: new Date().toISOString(), by: 'Administrator' } }, revised: {} }, A.ck)).s === 200);
  m = await call('GET', '/api/exam-results', P1.ck); ok('after release the parent sees ONLY their own child marks', m.s === 200 && m.j.some(x => x.id === 'zr1' && Number(x.marks) === 42) && !m.j.some(x => x.id === 'zr2'), m.j);
  m = await call('GET', '/api/exam-results', P3.ck); ok('a parent from another class sees nothing from this exam', m.s === 200 && !m.j.some(x => x.examId === 'zx1'), m.j);
  ok('parent cannot change marks', [403, 405].includes((await call('PUT', '/api/exam-results', P1.ck, { id: 'zr1', examId: 'zx1', studentId: 'zs1', subject: 'Maths', marks: 99, absent: false })).s));

  // ================= ONLINE EXAM TIMER =================
  console.log('\nOnline exam timer');
  const now = Date.now(), qs = [{ type: 'mcq', text: 'One plus one?', options: ['1', '2', '3'], answer: 1, marks: 2 }, { type: 'tf', text: 'The sun is a star', answer: 0, marks: 1 }];
  const ex = body => call('POST', '/api/online-exams', T.ck, { title: 'Quiz', className: '1st Class', section: 'A', subject: 'Maths', durationMin: 10, instructions: '', questions: qs, ...body });
  const e1 = await ex({ startMs: now - 3600e3, endMs: now + 86400e3 }); ok('teacher sets an online exam', e1.s === 201 && !!e1.j.id, e1);
  ok('student cannot start before it is approved', (await call('POST', `/api/online-exams/${e1.j.id}/start`, P1.ck)).s === 404);
  ok('teacher cannot approve own exam', (await call('POST', `/api/online-exams/${e1.j.id}/review`, T.ck, { action: 'approve' })).s === 403);
  ok('admin approves it', (await call('POST', `/api/online-exams/${e1.j.id}/review`, A.ck, { action: 'approve' })).s === 200);
  ok('a student of another class cannot start it', (await call('POST', `/api/online-exams/${e1.j.id}/start`, P3.ck)).s === 404);
  const s1 = await call('POST', `/api/online-exams/${e1.j.id}/start`, P1.ck);
  ok('the student starts; server gives a 10-minute deadline', s1.s === 200 && Math.abs((s1.j.deadlineMs - s1.j.serverNowMs) - 600000) < 5000, s1.j && { s: s1.s, d: s1.j.deadlineMs - s1.j.serverNowMs });
  ok('the paper never contains the answers', s1.s === 200 && !JSON.stringify(s1.j.questions).includes('"answer"') && !JSON.stringify(s1.j.questions).includes('keyAnswer'));
  const s1b = await call('POST', `/api/online-exams/${e1.j.id}/start`, P1.ck);
  ok('re-opening does NOT give extra time (same deadline)', s1b.s === 200 && s1b.j.deadlineMs === s1.j.deadlineMs, [s1.j?.deadlineMs, s1b.j?.deadlineMs]);
  const q1 = s1.j.questions.find(q => q.text.startsWith('One plus')); const optTwo = q1.options.find(o => o.t === '2').i;
  ok('an answer is saved in time', (await call('POST', `/api/online-exams/${e1.j.id}/save`, P1.ck, { answers: { [q1.id]: optTwo } })).s === 200);
  const fin = await call('POST', `/api/online-exams/${e1.j.id}/finish`, P1.ck, { answers: { [q1.id]: optTwo } }); ok('finishing in time is accepted (not late)', fin.s === 200 && fin.j.done && !fin.j.late, fin.j);
  ok('a second attempt is refused', (await call('POST', `/api/online-exams/${e1.j.id}/start`, P1.ck)).s === 409);
  const res1 = await call('GET', `/api/online-exams/${e1.j.id}/my-result`, P1.ck); ok('result stays hidden until released', res1.s === 200 && res1.j.state === 'Waiting', res1.j);
  ok('results cannot be released while the exam is still open', (await call('POST', `/api/online-exams/${e1.j.id}/release`, T.ck, {})).s === 409);
  await db.query('UPDATE online_exams SET end_ms = ? WHERE id = ?', [Date.now() - 1000, e1.j.id]);
  ok('after it closes the teacher releases the results', (await call('POST', `/api/online-exams/${e1.j.id}/release`, T.ck, {})).s === 200);
  const res2 = await call('GET', `/api/online-exams/${e1.j.id}/my-result`, P1.ck); ok('after release the student sees the score 2 (auto-marked)', res2.s === 200 && res2.j.state === 'Released' && res2.j.total === 2 && res2.j.totalMarks === 3, res2.j && { st: res2.j.state, t: res2.j.total });
  // late finish: timer already over
  const e2 = await ex({ title: 'Late quiz', startMs: now - 3600e3, endMs: now + 86400e3 }); await call('POST', `/api/online-exams/${e2.j.id}/review`, A.ck, { action: 'approve' });
  const s2 = await call('POST', `/api/online-exams/${e2.j.id}/start`, P2.ck); ok('second student starts the late quiz', s2.s === 200, s2.j);
  await db.query('UPDATE online_attempts SET deadline_ms = ? WHERE id = ?', [Date.now() - 120000, s2.j.attemptId]);
  const q2 = s2.j.questions.find(q => q.text.startsWith('One plus')); const o2 = q2.options.find(o => o.t === '2').i;
  const late = await call('POST', `/api/online-exams/${e2.j.id}/finish`, P2.ck, { answers: { [q2.id]: o2 } });
  ok('answers sent after the timer ran out are marked late', late.s === 200 && late.j.late === true, late.j);
  const [att] = await db.query('SELECT total, auto_score FROM online_attempts WHERE id = ?', [s2.j.attemptId]); ok('and they earn no marks', Number(att[0].total) === 0 && Number(att[0].auto_score) === 0, att[0]);
  ok('save after the timer is refused/ignored', (await call('POST', `/api/online-exams/${e2.j.id}/save`, P2.ck, { answers: { [q2.id]: o2 } })).j?.done === true);
  // closed exam / not yet open
  const e3 = await ex({ title: 'Future', startMs: now + 3600e3, endMs: now + 7200e3 }); await call('POST', `/api/online-exams/${e3.j.id}/review`, A.ck, { action: 'approve' });
  ok('an exam that has not opened cannot be started', (await call('POST', `/api/online-exams/${e3.j.id}/start`, P1.ck)).s === 409);
  const e4 = await ex({ title: 'Short window', startMs: now - 3600e3, endMs: now + 120000, durationMin: 60 }); await call('POST', `/api/online-exams/${e4.j.id}/review`, A.ck, { action: 'approve' });
  const s4 = await call('POST', `/api/online-exams/${e4.j.id}/start`, P1.ck); ok('the deadline never goes beyond the closing time', s4.s === 200 && s4.j.deadlineMs <= now + 120000 + 1000, s4.j && s4.j.deadlineMs - now);
} catch (e) { fail++; console.error('  FAIL test run crashed: ' + e.message); }
finally { stop(); await db.end().catch(() => {}); }
console.log('\ncore-flows: ' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
if (fail && process.env.SHOW_SERVER_LOG) console.log(log.slice(-3000));
process.exit(fail ? 1 : 0);
