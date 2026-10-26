// Website module: one sidebar item with tabs; the old website items are gone from Communication.
// Run with a server on PORT (demo mode ok):  BASE=http://127.0.0.1:4044 node tests/e2e/website-module.e2e.mjs
import assert from 'node:assert/strict';
let chromium; try { ({ chromium } = await import('playwright')); } catch (e) { ({ chromium } = await import('/home/claude/.npm-global/lib/node_modules/playwright/index.mjs')); }
const BASE = process.env.BASE || 'http://127.0.0.1:4044';
let n = 0; const ok = m => console.log('ok', ++n, m);
const b = await chromium.launch();
async function openAs(username, w = 1300){
  const ctx = await b.newContext({ viewport:{ width:w, height:900 } }); const page = await ctx.newPage();
  page.setDefaultTimeout(20000); page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
  await page.goto(BASE + '/');
  const st = await page.evaluate(async ([u]) => (await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username:u, password:'Demo@123' }) })).status, [username]);
  assert.equal(st, 200, 'login ' + username);
  await page.reload(); await page.waitForTimeout(3500);
  return page;
}
const call = (page, expr) => page.evaluate(`setTimeout(() => { ${expr} }, 0)`);
const pf = (page, url, init) => page.evaluate(async ([u, i]) => { const r = await fetch(u, i); return { status: r.status, body: await r.text() }; }, [url, init]);
const putKv = (page, body) => pf(page, '/api/kv/website-extras', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
const getKv = async page => JSON.parse((await pf(page, '/api/kv/website-extras', {})).body);

const page = await openAs('demo.admin');
const seed = { alumni: [{ id:'a1', name:'Asha', batch:'2010', now:'Doctor', show:true }], achievements: [{ id:'c1', title:'District Kabaddi', year:'2026', show:true }], downloads: [{ id:'d1', title:'Calendar', url:'https://example.com/c.pdf', show:true }],
  admission: { open:true, heading:'Admissions open', lastDate:'31 March', hours:'9-4' }, results: { label:'SSC 2026', pass:'100%' }, visible: { alumni:false }, recognition: { board:'State Board' } };
assert.equal((await putKv(page, seed)).status, 200);

// 1. Sidebar
const side = await page.evaluate(() => {
  const labels = id => [...document.querySelectorAll('#' + id + ' .sb-link')].filter(e => e.style.display !== 'none').map(e => e.textContent.trim());
  return { comm: labels('sbGroup-communication'), web: labels('sbGroup-website'), webHeader: document.getElementById('sbToggle-website').textContent.trim(), webHidden: document.getElementById('sbToggle-website').style.display === 'none' };
});
assert.ok(!side.comm.some(x => /website/i.test(x)), 'communication still has: ' + side.comm); assert.deepEqual(side.web, ['Manage Website']); assert.ok(!side.webHidden);
ok('Communication has no website items; Website has its own sidebar section (' + side.comm.join(', ') + ' | ' + side.web + ')');

// 2. Open the module: tabs
await page.evaluate(() => { [...document.querySelectorAll('.sb-link')].find(x => x.textContent.trim() === 'Manage Website').click(); });
await page.waitForTimeout(2500);
const tabs = await page.$$eval('#webTabs .mf-tab', els => els.map(e => e.textContent.replace(/\d+$/, '').trim()));
assert.deepEqual(tabs.map(t => t.replace(/^\S+\s/, '')), ['Overview', 'Home & Banner', 'Pages', 'Alumni & Awards', 'Policies', 'Gallery', 'Notices', 'Enquiries']); ok('eight tabs for Admin: ' + tabs.join(' | '));

// 3. Overview
const ov = await page.textContent('#webPaneOverview');
assert.ok(/Website parts showing/.test(ov) && /Needs attention/.test(ov) && /What visitors see/.test(ov)); assert.ok(/SSC 2026 · 100%/.test(ov)); assert.ok(/Admissions open/.test(ov));
assert.ok(/Alumni[\s\S]*Hidden/.test(ov)); ok('Overview shows live/hidden status from the saved content (results tile, banner, hidden alumni)');
assert.ok(await page.locator('#webPaneOverview >> text=Connected').count() > 0); ok('Overview checks the website feed');

// 3b. polish: tabs fit on one row at laptop width; missing website address is flagged
const rows = await page.$$eval('#webTabs .mf-tab', els => new Set(els.map(e => e.offsetTop)).size);
assert.equal(rows, 1, 'tabs wrap onto ' + rows + ' rows'); ok('all eight tabs fit on one row at laptop width');
await page.evaluate(() => { window.__w = schoolInfo.website; schoolInfo.website = ''; }); await call(page, "webGo('home')"); await page.waitForTimeout(500); await call(page, "webGo('overview')"); await page.waitForTimeout(1200);
assert.ok(/website address is not set/.test(await page.textContent('#webPaneOverview'))); await page.evaluate(() => { schoolInfo.website = window.__w; }); ok('Overview flags a missing website address');

// 4. Edit on two tabs, one save
await call(page, "webGo('home')"); await page.waitForTimeout(1200);
await page.fill('input[oninput*="wcSetKey(\'results\',\'pass\'"]', '98%');
assert.ok(await page.isVisible('#webUnsavedTop')); ok('typing marks the page as having unsaved changes');
await call(page, "webGo('pages')"); await page.waitForTimeout(800);
assert.ok(await page.isVisible('#wcDirty')); ok('unsaved changes are kept when moving between tabs');
await call(page, "wcAdd('downloads')"); await page.waitForTimeout(300);
await page.locator('input[id^="wc_downloads_1_title"]').fill('Fee schedule'); await page.locator('input[id^="wc_downloads_1_url"]').fill('https://example.com/fee.pdf');
await call(page, "wcSave()"); await page.waitForTimeout(1500);
let kv = await getKv(page);
assert.equal(kv.results.pass, '98%'); assert.equal(kv.downloads.length, 2); assert.equal(kv.downloads[1].title, 'Fee schedule'); ok('one Save stores the edits from both tabs');
assert.ok(!(await page.isVisible('#wcDirty')) && !(await page.isVisible('#webUnsavedTop'))); ok('unsaved marker clears after saving');
// old data intact + public feed sees it
assert.equal(kv.alumni[0].name, 'Asha'); assert.equal(kv.visible.alumni, false); assert.equal(kv.admission.heading, 'Admissions open'); assert.equal(kv.recognition.board, 'State Board'); ok('everything that was already saved is still there after a save from the new screen');
const pub = await (await fetch(BASE + '/api/website-extras')).json();
assert.equal(pub.results.pass, '98%'); assert.equal(pub.downloads.length, 2); ok('the public website feed shows the new values');

// 5. Other tabs render with their original screens
await call(page, "webGo('gallery')"); await page.waitForTimeout(1200);
assert.ok(await page.isVisible('#websiteGalleryBody') && /Add a photo to the gallery/.test(await page.textContent('#websiteGalleryBody'))); ok('Gallery tab shows the photo screen');
await call(page, "webGo('enquiries')"); await page.waitForTimeout(1500);
assert.ok(await page.isVisible('#websiteInquiriesBody') && /Contacted/.test(await page.textContent('#websiteInquiriesBody'))); ok('Enquiries tab shows the enquiries screen');
await call(page, "webGo('notices')"); await page.waitForTimeout(800);
assert.ok(/Notices on the website/.test(await page.textContent('#webPaneNotices')) && /Notice Board/.test(await page.textContent('#webPaneNotices'))); ok('Notices tab lists website notices and links to the Notice Board');
await call(page, "webGo('people')"); await page.waitForTimeout(800);
assert.ok(/Asha|Alumni/.test(await page.textContent('#webPaneContent'))); assert.ok(await page.locator('input[id^="wc_alumni_0_name"]').inputValue() === 'Asha'); ok('Alumni & Achievements tab shows saved people');

// 6. Legacy links land inside the module
await call(page, "switchView('websitegallery')"); await page.waitForTimeout(1200);
assert.ok(await page.isVisible('#view-website') && await page.isVisible('#websiteGalleryBody')); ok('the old Website Gallery link now opens the Gallery tab');
await call(page, "switchView('websiteinquiries')"); await page.waitForTimeout(1200);
assert.ok(await page.isVisible('#websiteInquiriesBody')); ok('the old Website Inquiries link now opens the Enquiries tab');

// 7. Roles screen groups the two permissions under Website
const cats = await page.evaluate(() => PERMISSION_MODULES.filter(m => m.category === 'Website').map(m => m.key));
assert.deepEqual(cats, ['websiteinquiries', 'websitegallery']); ok('Roles & Permissions lists them under a Website group (same permission keys as before)');

// 8. Failed load must never allow an empty save
const page2 = await openAs('demo.admin');
let puts = 0;
await page2.route('**/api/kv/website-extras', route => { if(route.request().method() === 'PUT'){ puts++; return route.continue(); } return route.fulfill({ status:500, contentType:'application/json', body:'{"error":"x"}' }); });
await page2.evaluate(() => { [...document.querySelectorAll('.sb-link')].find(x => x.textContent.trim() === 'Manage Website').click(); });
await page2.waitForTimeout(2500);
assert.ok(/Could not load the website content/.test(await page2.textContent('#webPaneOverview'))); ok('if the saved content cannot be loaded, the screen says so');
await call(page2, "webGo('home')"); await page2.waitForTimeout(1500);
assert.ok(/Could not load/.test(await page2.textContent('#webPaneContent'))); assert.equal(await page2.locator('.wc-bar').count(), 0); ok('and shows no Save button');
await call(page2, "wcSave()"); await page2.waitForTimeout(800); assert.equal(puts, 0); ok('a forced save is refused (nothing sent to the server)');
assert.deepEqual(page2.errs, []);

// 9. Roles: only-enquiries user, and a user with no website access
const page3 = await openAs('demo.admin');
await page3.evaluate(() => { window.getRoleViews = () => ['websiteinquiries']; });
await call(page3, "switchView('website')"); await page3.waitForTimeout(1500);
const t3 = await page3.$$eval('#webTabs .mf-tab', els => els.map(e => e.textContent.replace(/\d+$/, '').trim()));
assert.equal(t3.length, 1); assert.ok(/Enquiries/.test(t3[0])); assert.ok(await page3.isVisible('#websiteInquiriesBody')); ok('a role with only Website Inquiries sees just the Enquiries tab');
const off = await openAs('demo.office');
const vis = await off.evaluate(() => { const e = document.getElementById('navWebsite'); return e ? getComputedStyle(e).display : 'missing'; });
assert.equal(vis, 'none'); await call(off, "switchView('website')"); await off.waitForTimeout(500);
assert.ok(!(await off.isVisible('#view-website'))); ok('a role without website permissions has no Website menu and cannot open it');

// 10. Mobile width
const pm = await openAs('demo.admin', 390);
await pm.evaluate(() => { toggleMobileSidebar && toggleMobileSidebar(true); });
await call(pm, "switchView('website')"); await pm.waitForTimeout(2500);
const sw = await pm.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2); assert.ok(sw, 'horizontal scroll on mobile'); ok('no sideways scrolling on a phone-sized screen');
for(const p of [page, page3, off, pm]) assert.deepEqual(p.errs, []);
ok('no page errors'); await b.close(); console.log('ALL ' + n + ' CHECKS PASSED');
