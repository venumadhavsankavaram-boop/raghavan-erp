// Dashboard chart helpers.   Run:  node tests/dashboard-charts.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
import { load } from './helpers.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'public', 'modules', '05-dashboard.js'), 'utf8');
const access = fs.readFileSync(path.join(root, 'public', 'modules', '05b-dashboard-access.js'), 'utf8');
const money = n => '₹' + n;
const ctx = load('05-dashboard.js', ['chartMoneyShort', 'smoothLinePath', 'niceAxisMax', 'donutChartSVG', 'trendChartSVG', 'attendanceTrendSVG', 'ringGradSVG'], { fmtMoney: money, Math });

test('short rupee labels use Cr / L / K', () => {
  assert.equal(ctx.chartMoneyShort(0), '₹0');
  assert.equal(ctx.chartMoneyShort(840), '₹840');
  assert.equal(ctx.chartMoneyShort(8400), '₹8.4K');
  assert.equal(ctx.chartMoneyShort(890000), '₹8.9 L');
  assert.equal(ctx.chartMoneyShort(21370000), '₹2.14 Cr');
});
test('smooth line never dips below the lowest point', () => {
  const pts = [0, 100, 0, 0, 80].map((v, i) => ({ x: i * 10, y: 100 - v }));
  const d = ctx.smoothLinePath(pts);
  const ys = (d.match(/-?\d+\.\d+,(-?\d+\.\d+)/g) || []).map(s => Number(s.split(',')[1]));
  assert.ok(ys.every(y => y <= 100.05 && y >= -0.05), d);
});
test('donut: keeps each category colour and order, centre shows the total', () => {
  const html = ctx.donutChartSVG([{ label: 'Fee', value: 900, color: 'A' }, { label: 'Bus', value: 0, color: 'B' }, { label: 'Stock', value: 100, color: 'C' }]);
  assert.ok(html.includes('stroke="A"') && html.includes('stroke="C"') && !html.includes('stroke="B"'));
  assert.ok(html.includes('data-di="2"'), 'index follows the category list, not the visible list');
  assert.ok(html.includes('<b>₹1K</b>'), 'centre total');
});
test('donut with nothing collected shows an empty ring', () => {
  const html = ctx.donutChartSVG([{ label: 'Fee', value: 0, color: 'A' }]);
  assert.ok(html.includes('₹0') && !html.includes('donut-arc'));
});
test('fee trend: empty months stay on the axis, no NaN', () => {
  const pts = ['A', 'B', 'C', 'D'].map((l, i) => ({ label: l, total: [0, 5000, 0, 12000][i] }));
  const html = ctx.trendChartSVG(pts, 'teal');
  assert.ok(!html.includes('NaN') && html.includes('₹12K'));
});
test('attendance trend: gaps break the line, axis is zoomed but within 0-100', () => {
  const pts = [{ label: 'A', students: 92, staff: 96 }, { label: 'B', students: null, staff: null }, { label: 'C', students: 95, staff: 90 }];
  const html = ctx.attendanceTrendSVG(pts, 'teal', 'gold');
  assert.ok(!html.includes('NaN') && html.includes('100%') && html.includes('80%') && !html.includes('>110%'));
});
test('ring: clamps to 0-100', () => {
  assert.ok(ctx.ringGradSVG(250, 'x').includes('aria-label="100% collected"'));
  assert.ok(!ctx.ringGradSVG(0, 'x').includes('ring-arc'));
});
test('role-based dashboard sections still find their blocks', () => {
  for (const c of ['overview-panel', 'cat-donut-panel', 'cat-grid', 'demo-grid', 'trend-panel', 'pay-table-wrap']) {
    assert.ok(access.includes(c) && src.includes(c), c);
  }
  assert.ok(/h4>Attendance — Last 6 Months/.test(src), 'attendance trend title keeps the word Attendance');
});
done();
