// School-wide attendance mode: one session / two sessions / automatic by dates.
import assert from 'node:assert/strict';
import { load, test, done } from './helpers.mjs';
const mk = settings => load('09-fees-subtabs.js', ['attSingleRange', 'attSessionMode', 'attIsSingleSession', 'attSessionsFor'], { attSettings: settings, ATT_SESSIONS: ['Morning', 'Afternoon'] });
test('no setting = automatic: default 15 Mar to 31 May', () => { const c = mk({ threshold: 75, workingDays: [1] }); assert.equal(c.attSessionMode(), 'auto'); assert.equal(c.attIsSingleSession('2027-04-10'), true); assert.equal(c.attIsSingleSession('2026-11-27'), false); });
test('one session = single on every date', () => { const c = mk({ sessionMode: 'single' }); for (const d of ['2026-11-27', '2027-01-05', '2027-04-10']) assert.equal(c.attIsSingleSession(d), true); assert.deepEqual([...c.attSessionsFor('2026-11-27')], ['Morning']); });
test('two sessions = never single, even inside the date range', () => { const c = mk({ sessionMode: 'double' }); assert.equal(c.attIsSingleSession('2027-04-10'), false); assert.deepEqual([...c.attSessionsFor('2027-04-10')], ['Morning', 'Afternoon']); });
test('automatic still honours a custom range and "never"', () => { assert.equal(mk({ sessionMode: 'auto', singleFrom: '06-01', singleTo: '06-30' }).attIsSingleSession('2027-06-10'), true); assert.equal(mk({ sessionMode: 'auto', singleFrom: '', singleTo: '' }).attIsSingleSession('2027-04-10'), false); });
test('unknown mode falls back to automatic', () => { assert.equal(mk({ sessionMode: 'weird' }).attSessionMode(), 'auto'); });
done('attendance-mode');
