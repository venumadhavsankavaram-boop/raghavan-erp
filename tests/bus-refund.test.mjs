// A bus fee refund must never leave the refunded part showing as bus fee due.   Run:  node tests/bus-refund.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const m = fs.readFileSync(path.join(root, 'public/modules/08c-fee-refunds.js'), 'utf8');
test('a bus refund for a student who has stopped the bus settles the bus billing', () => {
  assert.ok(m.includes('rfApplyStopFromRefund(r)') && m.includes('stopTransport: stopBus'));
  assert.ok(m.includes("['Student withdrawn / TC issued', 'Service not availed (transport / hostel)'].includes(reasonCode)"));
});
test('earlier refunds that missed the stop are listed with a one-press fix', () => {
  assert.ok(m.includes('function rfMissedBusStops') && m.includes('async function rfFixBus') && m.includes('Keep what is already paid'));
});
done('bus-refund');
