// Policy pages: the office writes them in the ERP; the public site gets only the ones ticked "Show on website".
// Run with a server on PORT (demo mode ok):  BASE=http://127.0.0.1:4044 DB_*=... node tests/e2e/policy-pages.e2e.mjs
import assert from 'node:assert/strict';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const BASE = process.env.BASE || 'http://127.0.0.1:4044';
let n = 0; const ok = m => console.log('ok', ++n, m);
const login = async (u) => { const r = await fetch(BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/json','x-forwarded-for':'7.7.7.' + (Math.floor(Math.random()*200)+1)}, body: JSON.stringify({ username:u, password:'Demo@123' }) }); assert.equal(r.status, 200, 'login ' + u); return (r.headers.get('set-cookie') || '').split(';')[0]; };
const admin = await login('demo.admin');
const pub = async () => (await (await fetch(BASE + '/api/website-extras')).json());
const put = async (cookie, body) => fetch(BASE + '/api/kv/website-extras', { method:'PUT', headers:{'Content-Type':'application/json', cookie}, body: JSON.stringify(body) });

await put(admin, {});
assert.deepEqual((await pub()).policies, {}); ok('public site gets no policies by default');
let r = await put(admin, { policies: {
  privacy: { show:true, title:'Privacy Policy', body:'## A\nhello <b>x</b>', updated:'2026-10-26' },
  terms: { show:false, title:'Terms', body:'secret draft' },
  refund: { show:true, title:'Refund', body:'   ' },
  hacker: { show:true, title:'x', body:'y' },
  admission: { show:true, title:'T'.repeat(500), body:'B'.repeat(30000), updated:'not-a-date' } } });
assert.equal(r.status, 200); ok('admin can save policies');
let p = (await pub()).policies;
assert.deepEqual(Object.keys(p).sort(), ['admission', 'privacy']); ok('only ticked, non-empty, known policies are public (drafts and unknown keys stay private)');
assert.equal(p.privacy.body, '## A\nhello <b>x</b>'); assert.equal(p.privacy.updated, '2026-10-26'); ok('text and date pass through unchanged (the website draws it as plain text)');
assert.equal(p.admission.title.length, 120); assert.equal(p.admission.body.length, 20000); assert.equal(p.admission.updated, ''); ok('title, body length and date are capped / checked');
const office = await login('demo.office');
r = await put(office, { policies: { privacy: { show:true, body:'x' } } });
assert.ok(r.status === 403 || r.status === 401, 'office status ' + r.status); ok('a user without Website Gallery access cannot change policies (' + r.status + ')');
r = await fetch(BASE + '/api/kv/website-extras', { method:'PUT', headers:{'Content-Type':'application/json'}, body: '{}' });
assert.ok(r.status === 401 || r.status === 403); ok('anonymous cannot change policies');

// the editor screen
const b = await chromium.launch(); const page = await b.newPage({ viewport:{ width:1300, height:900 } });
page.setDefaultTimeout(15000); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto(BASE + '/'); await page.evaluate(async () => (await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:'demo.admin', password:'Demo@123' }) })).status);
await page.reload(); await page.waitForTimeout(3500);
// (signing in through the page replaces the earlier API session, so the page's own session is used from here on)
const pageFetch = (url, init) => page.evaluate(async ([u, i]) => { const r = await fetch(u, i); return { status: r.status, body: await r.text() }; }, [url, init]);
assert.equal((await pageFetch('/api/kv/website-extras', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ policies: {} }) })).status, 200);
await page.evaluate(() => { const e = [...document.querySelectorAll('button,a')].find(x => x.textContent.trim() === 'Manage Website'); e && e.click(); });
await page.waitForTimeout(2000);
await page.evaluate(() => { setTimeout(() => webGo('policies'), 0); }); await page.waitForTimeout(1500);
assert.equal(await page.locator('textarea[id^="wcPol_"]').count(), 4); ok('editor shows 4 policy boxes');
await page.evaluate(() => { setTimeout(() => wcPolStarter('refund'), 0); }); await page.waitForTimeout(300);
let v = await page.inputValue('#wcPol_refund'); assert.ok(v.includes('[[FILL IN')); assert.ok(await page.textContent('#wcPolNote_refund').then(t => /FILL IN/.test(t))); ok('starter text loads and warns about [[FILL IN]]');
await page.evaluate(() => { setTimeout(() => wcPolStarter('privacy'), 0); }); await page.waitForTimeout(300);
await page.evaluate(() => { document.querySelector('input[onchange*="wcPolSet(\'privacy\',\'show\'"]').click(); document.querySelector('input[onchange*="wcPolSet(\'refund\',\'show\'"]').click(); });
await page.evaluate(() => { setTimeout(() => wcSave(), 0); }); await page.waitForTimeout(1200);
assert.deepEqual(Object.keys((await pub()).policies), []); assert.ok(/Finish the Fee/.test(await page.textContent('#wcMsg'))); ok('saving is blocked while a shown page still has [[FILL IN]] (nothing published)');
await page.evaluate(() => { document.querySelector('input[onchange*="wcPolSet(\'refund\',\'show\'"]').click(); });
await page.evaluate(() => { setTimeout(() => wcSave(), 0); }); await page.waitForTimeout(1500);
p = (await pub()).policies; assert.deepEqual(Object.keys(p), ['privacy']); assert.ok(p.privacy.body.includes('{{school}}') && /^\d{4}-\d{2}-\d{2}$/.test(p.privacy.updated)); ok('after unticking the unfinished page, Privacy saves and goes public with the date');
const kv = JSON.parse((await pageFetch('/api/kv/website-extras', {})).body);
assert.ok(kv.policies.refund.body.includes('[[FILL IN') && kv.policies.refund.show === false); ok('unfinished Refund draft is kept privately for later');
assert.deepEqual(errs, []); ok('no page errors');
await b.close(); console.log('ALL ' + n + ' CHECKS PASSED');
