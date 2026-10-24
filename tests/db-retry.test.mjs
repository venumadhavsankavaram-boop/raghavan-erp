// A connection the database server closed for being idle is retried once.   Run:  node tests/db-retry.test.mjs
import assert from 'node:assert/strict';
let failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
import { pool, sql, nextDocSeq } from '../db.js';

const idleErr = () => Object.assign(new Error('The client was disconnected by the server because of inactivity. See wait_timeout and interact_timeout for configuring this behavior.'), { code: 'ER_CLIENT_INTERACTION_TIMEOUT' });
const realQuery = pool.query.bind(pool), realGet = pool.getConnection.bind(pool);
const restore = () => { pool.query = realQuery; pool.getConnection = realGet; };

test('a query that hits a connection closed for inactivity is run again and succeeds', async () => {
  let calls = 0;
  pool.query = async () => { calls++; if (calls === 1) throw idleErr(); return [[{ ok: 1 }]]; };
  try { assert.deepEqual(await sql`SELECT 1`, [{ ok: 1 }]); assert.equal(calls, 2); } finally { restore(); }
});
test('only one retry: a second failure is reported', async () => {
  let calls = 0;
  pool.query = async () => { calls++; throw idleErr(); };
  try { await assert.rejects(() => sql`SELECT 1`, /inactivity/); assert.equal(calls, 2); } finally { restore(); }
});
test('other errors are never retried (a write must not run twice)', async () => {
  let calls = 0;
  pool.query = async () => { calls++; throw Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }); };
  try { await assert.rejects(() => sql`INSERT INTO t VALUES (1)`, /Duplicate/); assert.equal(calls, 1); } finally { restore(); }
});
test('receipt-number counter also retries on an idle connection', async () => {
  let gets = 0;
  pool.getConnection = async () => {
    gets++;
    return { release() {}, async query(q) { if (gets === 1) throw idleErr(); return /LAST_INSERT_ID\(\) AS seq/.test(q) ? [[{ seq: 7 }]] : [[]]; } };
  };
  try { assert.equal(await nextDocSeq('receipt', '2026'), 7); assert.equal(gets, 2); } finally { restore(); }
});
for (const [name, fn] of tests) {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); }
}
console.log('\ndb retry: ' + (tests.length - failed) + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
process.exit(failed ? 1 : 0);
