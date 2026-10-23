// Runs every tests/*.test.mjs and fails if any of them fail.   Run:  npm test
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;
for (const f of files) {
  console.log('\n=== ' + f + ' ===');
  const r = spawnSync('node', [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log('\n' + (failed ? '✖ ' + failed + ' of ' + files.length + ' test files FAILED' : '✔ all ' + files.length + ' test files passed'));
process.exit(failed ? 1 : 0);
