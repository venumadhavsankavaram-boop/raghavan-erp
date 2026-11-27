// Leave day counting for requests that start in the afternoon / end with the morning only.
import assert from 'node:assert/strict';
import { load, test, done } from './helpers.mjs';
const c = load('26-student-parent-portal-tabs-part2.js', ['apxLeaveDates', 'apxLeaveParts', 'apxLeaveDays', 'apxDaysText', 'staffLeaveSpanLabel']);
const R = o => ({ fromDate: '2026-12-07', toDate: '2026-12-08', session: null, firstPart: null, lastPart: null, ...o });
test('afternoon of day 1 + whole day 2 = 1½ days', () => { assert.equal(c.apxLeaveDays(R({ firstPart: 'Afternoon' })), 1.5); assert.equal(c.apxDaysText(1.5), '1½'); });
test('whole-day range unchanged', () => { assert.equal(c.apxLeaveDays(R({ toDate: '2026-12-10' })), 4); });
test('both ends partial over 3 dates = 2 days', () => { assert.equal(c.apxLeaveDays(R({ toDate: '2026-12-09', firstPart: 'Afternoon', lastPart: 'Morning' })), 2); });
test('two dates both partial = 1 day', () => { assert.equal(c.apxLeaveDays(R({ firstPart: 'Afternoon', lastPart: 'Morning' })), 1); });
test('single half day = ½', () => { assert.equal(c.apxLeaveDays(R({ toDate: '2026-12-07', session: 'Morning' })), 0.5); assert.equal(c.apxDaysText(0.5), '½'); });
test('part values on a single date are ignored', () => { assert.equal(c.apxLeaveDays(R({ toDate: '2026-12-07', firstPart: 'Afternoon' })), 1); });
test('label tells the story', () => { const l = c.staffLeaveSpanLabel(R({ firstPart: 'Afternoon' })); assert.match(l, /from afternoon/); assert.match(l, /1½ days/); assert.equal(c.staffLeaveSpanLabel(R({})), '2026-12-07 to 2026-12-08'); });
done('leave-halfday-ui');
