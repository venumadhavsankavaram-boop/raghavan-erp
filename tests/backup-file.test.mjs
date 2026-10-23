// The restore tool's file check must accept a good backup and reject a damaged one.   Run:  node tests/backup-file.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';

const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'restore-backup.mjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
const good = { generatedAt: '2026-10-23T00:00:00.000Z', format: 'erp-full-backup-v2', complete: true, counts: { students: 2, staff: 1 }, tables: { students: [{ id: 'a' }, { id: 'b' }], staff: [{ id: 'x' }] } };
const run = obj => { const f = path.join(dir, Math.random().toString(36).slice(2) + '.json'); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return spawnSync('node', [tool, f, '--check'], { encoding: 'utf8' }); };

test('a complete backup passes the check and reports its size', () => {
  const r = run(good); assert.equal(r.status, 0); assert.match(r.stdout, /tables\s+: 2/); assert.match(r.stdout, /records\s+: 3/);
});
test('a backup whose counts do not match its rows is rejected', () => {
  const bad = structuredClone(good); bad.tables.students.pop();
  assert.equal(run(bad).status, 1);
});
test('an incomplete backup is rejected', () => {
  assert.equal(run({ ...good, complete: false }).status, 1);
});
test('an unknown format is rejected', () => {
  assert.equal(run({ ...good, format: 'something-else' }).status, 1);
});
test('a file that is not JSON is rejected', () => {
  assert.equal(run('{ this is not json').status, 1);
});
test('the login-sessions table is never restored', () => {
  const withSessions = structuredClone(good); withSessions.tables.sessions = [{ id: 't' }]; withSessions.counts.sessions = 1;
  assert.match(run(withSessions).stdout, /tables\s+: 2/);
});
fs.rmSync(dir, { recursive: true, force: true });
done('backup file check');
