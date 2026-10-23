// Shared by the tests: pull named top-level functions out of a classic browser script
// (the app's modules share one global scope) and run them in an isolated sandbox.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'modules');

function grabFunction(src, name) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function ' + name + ' not found');
  let i = src.indexOf('{', m.index), depth = 0, inStr = null, esc = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (!inStr && c === '/' && src[k + 1] === '/') { while (k < src.length && src[k] !== '\n') k++; continue; }
    if (!inStr && c === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2) + 1; continue; }
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === inStr) inStr = null; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(m.index, k + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}
// load('09-fees-subtabs.js', ['fnA','fnB'], { globals }) -> sandbox object holding those functions
export function load(file, names, globals = {}) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const ctx = vm.createContext({ ...globals });
  vm.runInContext(names.map(n => grabFunction(src, n)).join('\n'), ctx);
  return ctx;
}
export function loadMany(parts, globals = {}) {
  const ctx = vm.createContext({ ...globals });
  for (const [file, names] of parts) {
    const src = fs.readFileSync(path.join(root, file), 'utf8');
    vm.runInContext(names.map(n => grabFunction(src, n)).join('\n'), ctx);
  }
  return ctx;
}
export const plain = v => JSON.parse(JSON.stringify(v));
let passed = 0, failed = 0;
export function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
export function done(label) { console.log('\n' + label + ': ' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : '')); }
