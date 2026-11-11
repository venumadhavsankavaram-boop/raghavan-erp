// Help Centre: guide text (English + Telugu), search, school edits, page-aware jump, and the server guard on who can change it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const m82 = rd('public/modules/82-help-content.js'), m83 = rd('public/modules/83-help-centre.js'), idx = rd('public/index.html'), srv = rd('server.js');
const TE = /[ఀ-౿]/;

function boot(user) {
  const store = {};
  const el = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {}, appendChild() {}, remove() {}, querySelectorAll: () => [] });
  const ctx = vm.createContext({
    console, Date, Math, Number, String, Array, Object, JSON, Set, Promise, setTimeout: () => 0, setInterval: () => 0, OBJECT_BACKED_KEYS: {},
    currentUser: user, localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    document: { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], head: { appendChild() {} }, body: { appendChild() {} }, createElement: el, title: 'Test School — ERP' },
    fetch: async () => ({ ok: false, json: async () => ({}) }),
  });
  ctx.window = ctx; ctx.addEventListener = () => {};
  vm.runInContext(m82, ctx); vm.runInContext(m83, ctx);
  return ctx;
}
const C = boot({ role: 'Admin', id: 'a1' }).HC_CONTENT;

test('every audience has topics with unique ids', () => {
  for (const a of ['parent', 'teacher', 'admin', 'demo']) {
    assert.ok(C[a].length >= 3, a + ' has topics');
    const ids = C[a].map(t => t.id); assert.equal(new Set(ids).size, ids.length, a + ' ids unique');
  }
  assert.ok(C.parent.length >= 10 && C.teacher.length >= 10 && C.admin.length >= 15);
});
test('every title, step and tip is written in English and Telugu', () => {
  for (const a of ['parent', 'teacher', 'admin', 'demo']) for (const t of C[a]) {
    assert.ok(t.t[0] && TE.test(t.t[1]), a + '/' + t.id + ' title');
    assert.ok(t.s.length >= 1, a + '/' + t.id + ' steps');
    t.s.forEach((x, i) => { assert.ok(x[0].trim() && x[1].trim(), a + '/' + t.id + ' step ' + i); assert.ok(TE.test(x[1]), a + '/' + t.id + ' step ' + i + ' has Telugu'); });
    if (t.tip) assert.ok(t.tip[0] && TE.test(t.tip[1]), a + '/' + t.id + ' tip');
  }
});
test('tours: every card has English and Telugu', () => {
  for (const a of ['parent', 'teacher', 'admin', 'demo']) { assert.ok(C.tour[a].length >= 3); for (const c of C.tour[a]) assert.ok(c[1][0] && TE.test(c[1][1]) && c[2][0] && TE.test(c[2][1]), a); }
});
test('the "Help for this page" jump always points at a real topic', () => {
  const hc = boot({ role: 'Admin', id: 'a1' }).__hc;
  for (const a of ['parent', 'teacher', 'admin']) { const ids = new Set(C[a].map(t => t.id)); for (const [k, v] of Object.entries(hc.CTX[a])) assert.ok(ids.has(v), a + ': ' + k + ' -> ' + v); }
});
test('search finds topics in English and in Telugu', () => {
  const hc = boot({ role: 'Parent', id: 'p1' }).__hc; hc.setState({});
  const find = (a, q) => hc.topicsFor(a).filter(t => hc.matches(t, q)).map(t => t.id);
  assert.ok(find('parent', 'pay fees').includes('fees'));
  assert.ok(find('parent', 'utr').includes('upistatus'));
  assert.ok(find('parent', 'ఫీజు').includes('fees'));
  assert.ok(find('admin', 'bank statement').includes('upi'));
  assert.ok(find('admin', 'cheque').includes('payroll'));
  assert.equal(JSON.stringify(find('parent', 'zzzzqq')), '[]');
  assert.ok(find('teacher', 'leave').includes('leave'));
});
test('school settings: hide a built-in topic, add its own, safe clean-up', () => {
  const hc = boot({ role: 'Admin', id: 'a1' }).__hc;
  hc.setState({ hidden: ['parent:onlineexam'], custom: [{ id: 'c1', aud: 'parent', ic: '🚌', en: 'School bus', te: 'స్కూల్ బస్', stepsEn: ['Call the driver'], stepsTe: ['డ్రైవర్‌కు కాల్ చేయండి'] }] });
  const ids = hc.topicsFor('parent').map(t => t.id);
  assert.ok(!ids.includes('onlineexam')); assert.ok(ids.includes('c1'));
  assert.ok(ids.indexOf('c1') < ids.indexOf('trouble'), 'own topics sit before "Something is not working"');
  const bad = hc.clean({ phone: 'x'.repeat(200), custom: [{ id: 'z', aud: 'hacker', en: '<img src=x onerror=1>', stepsEn: 'notalist' }, { id: '', aud: 'parent', en: 'no id' }], whatsNew: 'nope', hidden: 5 });
  assert.ok(bad.phone.length <= 40); assert.equal(bad.custom.length, 1); assert.equal(bad.custom[0].aud, 'parent'); assert.equal(JSON.stringify(bad.custom[0].stepsEn), '[]'); assert.equal(JSON.stringify(bad.whatsNew), '[]'); assert.equal(JSON.stringify(bad.hidden), '[]');
});
test('a custom topic with only English still shows, and the English is used for Telugu', () => {
  const hc = boot({ role: 'Admin', id: 'a1' }).__hc;
  hc.setState({ custom: [{ id: 'c2', aud: 'teacher', en: 'Lab key', te: '', stepsEn: ['Ask the office'], stepsTe: [] }] });
  const t = hc.topicsFor('teacher').find(x => x.id === 'c2'); assert.equal(t.t[1], 'Lab key'); assert.equal(t.s[0][1], 'Ask the office');
});
test('the demo guide is separate and only the demo shows it', () => {
  const hc = boot({ role: 'Admin', id: 'a1' }).__hc; assert.ok(hc.topicsFor('demo').length >= 3);
});
test('only the Admin or Principal can change help settings on the server', () => {
  assert.ok(/key === 'help-settings' && req\.method === 'PUT'[^\n]*role !== 'Admin'[^\n]*role !== 'Principal'/.test(srv));
});
test('parent UPI payment screens have Telugu, and every status has a Telugu name', () => {
  const m79 = rd('public/modules/79-upi-pay.js');
  for (const k of ['submitted', 'approved', 'rejected', 'cancelled']) assert.ok(new RegExp(k + ": '[^']*[\\u0C00-\\u0C7F]").test(m79), 'status ' + k);
  for (const w of ['UPI ద్వారా చెల్లించండి', 'తదుపరి: ఎలా చెల్లించాలి', 'నేను చెల్లించాను', 'తనిఖీ కోసం పంపండి', 'UTR సరిగ్గా 12 అంకెలు ఉండాలి.', 'ధన్యవాదాలు']) assert.ok(m79.includes(w), w);
  assert.ok(/const chip = s => \{[^\n]*isParent\(\) \? tx\(/.test(m79), 'staff always see English statuses');
});
test('Telugu letters are not forced into a font without them', () => {
  assert.ok(idx.includes('Noto+Sans+Telugu'));
  assert.ok(!idx.includes("font-family:'Poppins',sans-serif") && !idx.includes("font-family:'Baloo 2',cursive"));
});
test('copying a built-in topic gives an editable copy', () => {
  const hc = boot({ role: 'Admin', id: 'a1' }).__hc; const f = hc.copyOf('parent:fees');
  assert.equal(f.aud, 'parent'); assert.ok(f.stepsEn.length >= 5 && f.stepsEn.length === f.stepsTe.length); assert.ok(/[\u0C00-\u0C7F]/.test(f.te));
  hc.setLang('te'); assert.equal(hc.lang(), 'te');
});
test('wiring: both modules are loaded, content first', () => {
  const a = idx.indexOf('modules/82-help-content.js'), b = idx.indexOf('modules/83-help-centre.js');
  assert.ok(a > 0 && b > a);
});
done();
