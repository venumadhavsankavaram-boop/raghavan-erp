// Restore (or just check) an ERP full-backup file made by  Admin Tools -> Download Backup.
//
//   Check a backup file only (touches no database):
//       node tools/restore-backup.mjs  my-school-erp-backup-2026-10-23.json  --check
//
//   Restore into an EMPTY database (first start the ERP once against that database so it creates
//   its tables, then stop it). Database details come from the same DB_* settings the ERP uses:
//       DB_HOST=... DB_PORT=3306 DB_USER=... DB_PASSWORD=... DB_NAME=... \
//       node tools/restore-backup.mjs  my-school-erp-backup-2026-10-23.json
//
//   Restore over a database that already has data (ERASES those tables first):
//       ... node tools/restore-backup.mjs  file.json  --replace  --confirm-db=<the DB_NAME>
//
// Safe by default: it refuses to touch a database that already holds records, it restores inside one
// transaction (all or nothing), and it re-counts every table afterwards.
import fs from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const flag = n => args.includes('--' + n);
const opt = n => { const a = args.find(x => x.startsWith('--' + n + '=')); return a ? a.slice(n.length + 3) : ''; };
const die = m => { console.error('\n✖ ' + m + '\n'); process.exit(1); };

if (!file) die('Give the backup file name.  Example:  node tools/restore-backup.mjs my-backup.json --check');
if (!fs.existsSync(file)) die('File not found: ' + file);

let backup;
try { backup = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die('This is not a valid backup file (' + e.message + ').'); }

/* ---------- 1. Check the file itself ---------- */
const problems = [];
if (backup.format !== 'erp-full-backup-v2') problems.push('Unknown format "' + backup.format + '".');
if (backup.complete !== true) problems.push('The backup is marked incomplete.');
if (!backup.tables || typeof backup.tables !== 'object') problems.push('No tables in the file.');
const names = Object.keys(backup.tables || {}).filter(n => /^[A-Za-z0-9_]+$/.test(n) && n !== 'sessions');
let totalRows = 0;
for (const n of names) {
  const rows = backup.tables[n];
  if (!Array.isArray(rows)) { problems.push('Table ' + n + ' is not a list of rows.'); continue; }
  if (backup.counts && backup.counts[n] !== undefined && backup.counts[n] !== rows.length) problems.push('Table ' + n + ': header says ' + backup.counts[n] + ' rows but the file holds ' + rows.length + '.');
  totalRows += rows.length;
}
console.log('\nBackup file: ' + file);
console.log('  made on    : ' + (backup.generatedAt || 'unknown'));
console.log('  tables     : ' + names.length);
console.log('  records    : ' + totalRows.toLocaleString('en-IN'));
if (backup.serverTzOffsetMin && backup.serverTzOffsetMin !== 0) console.log('  ⚠ made on a server whose clock was not UTC (offset ' + backup.serverTzOffsetMin + ' min). Dates are restored as written in the file.');
if (problems.length) { problems.forEach(p => console.log('  ✖ ' + p)); die('The backup file has problems — do not rely on it.'); }
console.log('  ✔ file is complete and its record counts add up');
if (flag('check')) { console.log('\nCheck finished. Nothing was changed.\n'); process.exit(0); }

/* ---------- 2. Connect ---------- */
const mysql = (await import('mysql2/promise')).default; // loaded only when a real restore is requested
for (const k of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) if (!process.env[k]) die('Missing setting ' + k + ' (the same DB_* settings the ERP uses).');
const ssl = /^true$/i.test(process.env.DB_SSL || '') ? { rejectUnauthorized: !/^false$/i.test(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true') } : undefined;
const db = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl, timezone: 'Z', connectTimeout: 15000,
});
const q = async (sql, params) => (await db.query(sql, params))[0];

const colRows = await q(`SELECT TABLE_NAME t, COLUMN_NAME c, DATA_TYPE d, DATETIME_PRECISION p FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`);
const cols = {};
for (const r of colRows) (cols[r.t] = cols[r.t] || {})[r.c] = { type: String(r.d).toLowerCase(), prec: Number(r.p) || 0, json: String(r.d).toLowerCase() === 'json' };
try { // MariaDB keeps JSON columns as LONGTEXT + a json_valid() check
  const chk = await q(`SELECT TABLE_NAME t, CHECK_CLAUSE k FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE()`);
  for (const r of chk) { const m = /json_valid\(\s*`?(\w+)`?\s*\)/i.exec(String(r.k)); if (m && cols[r.t] && cols[r.t][m[1]]) cols[r.t][m[1]].json = true; }
} catch (_) { /* older servers: no CHECK_CONSTRAINTS view */ }

const targetTables = new Set(Object.keys(cols));
const missingTables = names.filter(n => !targetTables.has(n));
if (missingTables.length) console.log('\n⚠ These tables are in the backup but not in the database (skipped): ' + missingTables.join(', ') + '\n  (Start the ERP once against this database so it creates its tables, then run the restore again.)');
const todo = names.filter(n => targetTables.has(n));

/* ---------- 3. Safety: refuse to mix with existing data ---------- */
const existing = {};
for (const n of todo) existing[n] = Number((await q('SELECT COUNT(*) AS c FROM `' + n + '`'))[0].c) || 0;
let nonEmpty = todo.filter(n => existing[n] > 0);
// A freshly created ERP database holds exactly one starter Admin login and nothing else — that still counts as empty.
const starterOnly = nonEmpty.length === 1 && nonEmpty[0] === 'users' && existing.users === 1;
if (starterOnly) { console.log('\nFresh database detected (only the starter Admin login exists) — it will be replaced by the backup\'s users.'); }
else if (nonEmpty.length) {
  if (!flag('replace')) die('This database already holds records (' + nonEmpty.map(n => n + ': ' + existing[n]).join(', ') + ').\nRestore into an empty database, or add  --replace --confirm-db=' + process.env.DB_NAME + '  to ERASE and replace those tables.');
  if (opt('confirm-db') !== process.env.DB_NAME) die('To erase and replace, also add  --confirm-db=' + process.env.DB_NAME);
  console.log('\n⚠ --replace: the tables above will be emptied and replaced by the backup.');
}

/* ---------- 4. Convert one value to what MySQL expects ---------- */
const ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.(\d+))?Z$/;
function conv(v, c) {
  if (v === null || v === undefined) return null;
  if (v && typeof v === 'object' && v.type === 'Buffer' && Array.isArray(v.data)) return Buffer.from(v.data);
  if (c.json) return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && (c.type === 'date' || c.type === 'datetime' || c.type === 'timestamp')) {
    const m = ISO.exec(v);
    if (m) {
      if (c.type === 'date') return m[1];
      const frac = c.prec > 0 && m[4] ? '.' + m[4].slice(0, c.prec).padEnd(c.prec, '0') : '';
      return m[1] + ' ' + m[2] + frac;
    }
  }
  return v;
}

/* ---------- 5. Restore (one transaction) ---------- */
const BATCH = 200;
const restored = {};
try {
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  await db.query('SET UNIQUE_CHECKS = 0');
  await db.query('START TRANSACTION');
  if (flag('replace') || starterOnly) for (const n of nonEmpty) await db.query('DELETE FROM `' + n + '`');
  for (const n of todo) {
    const rows = backup.tables[n];
    if (!rows.length) { restored[n] = 0; continue; }
    const tcols = cols[n];
    const useCols = Object.keys(rows[0]).filter(k => tcols[k]);
    const dropped = Object.keys(rows[0]).filter(k => !tcols[k]);
    if (dropped.length) console.log('  ⚠ ' + n + ': columns not in this database were ignored: ' + dropped.join(', '));
    // Batches are limited by size as well as count, so big rows (photos, documents) never exceed the server's packet limit.
    const MAX_BYTES = 1024 * 1024;
    const flush = async chunk => { if (chunk.length) await db.query('INSERT INTO `' + n + '` (' + useCols.map(k => '`' + k + '`').join(',') + ') VALUES ?', [chunk]); };
    let chunk = [], bytes = 0;
    for (const r of rows) {
      const vals = useCols.map(k => conv(r[k], tcols[k]));
      const size = vals.reduce((t, v) => t + (v === null ? 4 : typeof v === 'string' ? v.length + 3 : Buffer.isBuffer(v) ? v.length * 2 : 24), 0);
      if (chunk.length && (chunk.length >= BATCH || bytes + size > MAX_BYTES)) { await flush(chunk); chunk = []; bytes = 0; }
      chunk.push(vals); bytes += size;
    }
    await flush(chunk);
    restored[n] = rows.length;
    process.stdout.write('  restored ' + n.padEnd(34) + String(rows.length).padStart(8) + ' rows\n');
  }
  await db.query('COMMIT');
} catch (e) {
  try { await db.query('ROLLBACK'); } catch (_) {}
  await db.end();
  die('Restore FAILED and was rolled back — nothing was changed.\nReason: ' + e.message);
}
await db.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});

/* ---------- 6. Verify ---------- */
let bad = 0;
for (const n of todo) {
  const c = Number((await q('SELECT COUNT(*) AS c FROM `' + n + '`'))[0].c) || 0;
  if (c !== backup.tables[n].length) { bad++; console.log('  ✖ ' + n + ': expected ' + backup.tables[n].length + ' rows, database has ' + c); }
}
await db.end();
if (bad) die('Restore finished but ' + bad + ' table(s) do not match. Do not use this database.');
console.log('\n✔ Restore complete: ' + todo.length + ' tables, ' + todo.reduce((s, n) => s + backup.tables[n].length, 0).toLocaleString('en-IN') + ' records — every table\'s row count matches the backup.');
console.log('  Next: start the ERP against this database, log in, and spot-check students, fees and attendance.\n');
