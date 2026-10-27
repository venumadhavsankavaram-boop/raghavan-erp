// Browser check of the forced two-step set-up screen + the Admin switch (demo server).
// Run: BASE=http://127.0.0.1:4042 node tests/e2e/require-2fa-ui.e2e.mjs
import assert from 'node:assert/strict';
import { totpAt } from '../../twofa.js';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const B = process.env.BASE || 'http://127.0.0.1:4042', P = 'Demo@123', J = { 'Content-Type': 'application/json' };
let n = 0; const ok = m => console.log('  ok   ' + (++n) + '. ' + m);
const api = async (path, body, ck) => { const r = await fetch(B + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...J, 'x-forwarded-for': '9.9.9.9', ...(ck ? { cookie: ck } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }); return { s: r.status, d: await r.json().catch(() => ({})), ck: (r.headers.getSetCookie?.() || []).map(x => x.split(';')[0]).join('; ') }; };
// admin turns own two-step on and the rule ON (via API), then we play the Principal in a browser
const ad = await api('/api/login', { username: 'demo.admin', password: P, audience: 'staff' }); const ck = ad.ck;
const s = await api('/api/account/2fa/start', { method: 'app', password: P }, ck); await api('/api/account/2fa/confirm', { code: totpAt(s.d.secret) }, ck);
assert.equal((await api('/api/account/2fa/policy', { required: true }, ck)).s, 200);
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1200, height: 900 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
try {
  await pg.goto(B + '/'); await pg.fill('#loginUsername', 'demo.principal'); await pg.fill('#loginPassword', P); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#forcedTwofaOverlay', { timeout: 15000 }); ok('Principal sees the set-up screen right after signing in');
  assert.equal(await pg.locator('#ftwContinue').isDisabled(), true); ok('Continue is locked until set up is finished');
  await pg.waitForSelector('#twofaCard input[type=checkbox]');
  await pg.evaluate(() => toggleTwofa(true)); await pg.fill('#twofaPw', P); await pg.evaluate(() => startTwofa('app'));
  await pg.waitForFunction(() => /[A-Z2-7]{16,}/.test(document.getElementById('twofaCard').innerText));
  const secret = (await pg.locator('#twofaCard').innerText()).replace(/\s+/g, '').match(/[A-Z2-7]{32}/)?.[0] || (await pg.evaluate(() => (document.getElementById('twofaCard').innerText.match(/[A-Z2-7 ]{20,}/) || [''])[0].replace(/\s/g, '')));
  await pg.fill('#twofaConfirmCode', totpAt(secret)); await pg.evaluate(() => confirmTwofa());
  await pg.waitForFunction(() => !document.getElementById('ftwContinue').disabled, null, { timeout: 8000 }); ok('after confirming, recovery codes show and Continue unlocks');
  await pg.click('#ftwContinue'); await pg.waitForSelector('#forcedTwofaOverlay', { state: 'detached' }).catch(() => {}); await pg.waitForTimeout(3500);
  assert.equal(await pg.locator('#forcedTwofaOverlay').count(), 0); ok('the app opens normally afterwards (no loop back to the set-up screen)');
  assert.deepEqual(errs, []); ok('no page errors');
} finally {
  await b.close();
  await api('/api/account/2fa/policy', { required: false }, ck);
  const ov = await api('/api/account/2fa/overview', undefined, ck); for (const u of ov.d.users) if (u.method) await api('/api/account/2fa/reset', { userId: u.id }, ck);
}
console.log('ALL ' + n + ' CHECKS PASSED');
