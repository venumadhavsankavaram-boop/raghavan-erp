// Dates must show as dd/mm/yyyy everywhere.   Run:  node tests/date-format.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'modules', '00a-date-format.js'), 'utf8');
const ctx = vm.createContext({ Date, Object, Array, String, Number, isNaN, window: {}, globalThis: null });
ctx.globalThis = ctx;
vm.runInContext(src, ctx);
const F = ctx.window.__dateFmt;
const D = new Date(2026, 9, 23, 9, 5, 7); // 23 Oct 2026, 9:05:07 (local)

console.log('Text');
test('ISO date becomes dd/mm/yyyy', () => assert.equal(F.convText('Paid on 2026-10-23.'), 'Paid on 23/10/2026.'));
test('several dates in one string', () => assert.equal(F.convText('2026-04-01 to 2026-05-31'), '01/04/2026 to 31/05/2026'));
test('an impossible date is left alone', () => assert.equal(F.convText('2026-13-45'), '2026-13-45'));
test('ids that contain a date are not touched', () => assert.equal(F.convText('pay_2026-10-23_x'), 'pay_2026-10-23_x'));
test('academic year 2026-27 is not a date', () => assert.equal(F.convText('Year 2026-27'), 'Year 2026-27'));
test('ISO date-time (local) shows date and 12-hour time', () => assert.equal(F.convText('2026-10-23T09:05:07'), '23/10/2026, 9:05 am'));
test('pm times', () => assert.equal(F.convText('2026-10-23 21:30'), '23/10/2026, 9:30 pm'));

console.log('\nHTML');
test('only text between tags changes; attributes keep the ISO value', () => {
  assert.equal(F.convHtml('<td title="2026-10-23" data-d="2026-10-23">2026-10-23</td>'), '<td title="2026-10-23" data-d="2026-10-23">23/10/2026</td>');
});
test('date inputs keep their ISO value', () => assert.equal(F.convHtml('<input type="date" value="2026-10-23">'), '<input type="date" value="2026-10-23">'));
test('script and style content is untouched', () => {
  const h = '<script>var d="2026-10-23"</script><style>/*2026-10-23*/</style><textarea>2026-10-23</textarea>';
  assert.equal(F.convHtml(h), h);
});
test('option label changes, its value does not', () => assert.equal(F.convHtml('<option value="2026-10-23">2026-10-23</option>'), '<option value="2026-10-23">23/10/2026</option>'));
test('a ">" inside an attribute does not break the tag', () => assert.equal(F.convHtml('<a onclick="if(a>b)go(\'2026-10-23\')">2026-10-23</a>'), '<a onclick="if(a>b)go(\'2026-10-23\')">23/10/2026</a>'));

console.log('\nDate.toLocale*String');
test('default and en-IN give dd/mm/yyyy', () => { assert.equal(D.toLocaleDateString(), '23/10/2026'); assert.equal(D.toLocaleDateString('en-IN'), '23/10/2026'); });
test('short month with year becomes numeric', () => assert.equal(D.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }), '23/10/2026'));
test('day + month without year gives dd/mm', () => assert.equal(D.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), '23/10'));
test('weekday is kept in front', () => assert.equal(D.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), 'Friday, 23/10/2026'));
test('"October 2026" headings are kept as headings', () => assert.equal(D.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), 'October 2026'));
test('date and time', () => { assert.equal(D.toLocaleString(), '23/10/2026, 9:05:07 am'); assert.equal(D.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), '23/10/2026, 9:05 am'); });
test('an invalid date does not crash', () => assert.doesNotThrow(() => new Date('x').toLocaleDateString()));
done('date format');
