// Messages, Notice Board and the Website are three separate things:
//  - Messages (Compose) reach people only and never touch the public website; after Send you stay on Messages.
//  - Notice Board lists only what was sent in the app.
//  - Public website notices are written, edited and taken down in the Website section.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, done } from './helpers.mjs';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
const m20 = rd('public/modules/20-communications-module-intro.js'), m20d = rd('public/modules/20d-notice-targeting-ui.js'), m20f = rd('public/modules/20f-website-content.js'), m20b = rd('public/modules/20b-communications-ui.js');

const saved = [];
const ctx = vm.createContext({
  console, Date, Math, Number, String, Array, Object, JSON, Set, Promise, OBJECT_BACKED_KEYS: {},
  storageGet: async (k, d) => d, storageSet: async (k, v) => { saved.push(k); }, showToast() {}, showConfirmDialog: async () => true,
  renderNoticeBoard() {}, document: { getElementById: () => null }, currentUser: { name: 'Admin', role: 'Admin' }, canSub: () => true,
});
vm.runInContext(m20, ctx); vm.runInContext(m20d, ctx);
const run = c => vm.runInContext(c, ctx);

test('Notice Board lists only notices sent in the app', () => {
  assert.equal(run("nbxOnBoard({channels:['In-App']})"), true);
  assert.equal(run("nbxOnBoard({channels:['Website'], toWebsite:true})"), false, 'website-only notice is not on the board');
  assert.equal(run("nbxOnBoard({channels:['In-App'], boardRemoved:true})"), false);
});
test('a message never goes on the website unless it is a website notice', () => {
  assert.equal(run("nbxIsWebsite({channels:['In-App'], toWebsite:false, audienceScope:'allstudents'})"), false);
  assert.equal(run("nbxIsWebsite({channels:['Website'], toWebsite:true, audienceScope:'web'})"), true);
});
test('taking an older both-places notice off the board keeps the website copy', async () => {
  run("commsMessages = [{id:'a', channels:['Website','In-App'], toWebsite:true}, {id:'b', channels:['In-App','Push'], toWebsite:false}]");
  await run("deleteNotice('a')"); await run("deleteNotice('b')");
  assert.equal(run("nbxIsWebsite(commsMessages[0])"), true, 'still on the website');
  assert.equal(run("nbxOnBoard(commsMessages[0])"), false, 'gone from the board');
  assert.equal(run("nbxOnBoard(commsMessages[1])"), false);
});
test('Send stays on Messages: no jump to the Notice Board, and it shows a Sent confirmation', () => {
  const send = m20.slice(m20.indexOf('async function sendCommsMessage'), m20.indexOf('function renderCommsWhatsAppQueue'));
  assert.ok(!/switchView\('noticeboard'\)/.test(send), 'no redirect after send');
  assert.ok(/commsSent = \{/.test(send) && /toWebsite:false/.test(send));
  assert.ok(/Sent to \$\{r\.count\}/.test(m20));
});
test('Compose has three clear steps and the channels are app, phone alert, WhatsApp (no website)', () => {
  const comp = m20.slice(m20.indexOf('function renderCommsCompose'), m20.indexOf('function onCommsTypeChange'));
  for (const t of ['Who should get it?', 'What do you want to say?', 'How should it reach them?']) assert.ok(comp.includes(t), t);
  assert.ok(!/website/i.test(comp.replace(/never go on the public website/, '')), 'compose does not offer the website');
  assert.ok(/'push'/.test(comp));
});
test('Notice Board has no writing form and no website option', () => {
  assert.ok(!/postQuickNotice/.test(m20d) && !/nbxWeb/.test(m20d) && !/editNoticeWeb/.test(m20d) && !/nbxChip/.test(m20d));
  assert.ok(/New message/.test(m20d));
});
test('Website, Notices is where public notices are written, edited and taken down', () => {
  assert.ok(/Publish on the website/.test(m20f) && /window\.wnPost/.test(m20f) && /window\.wnDown/.test(m20f));
  const post = m20f.slice(m20f.indexOf('window.wnPost'), m20f.indexOf('window.wnSave '));
  assert.ok(/audienceScope: 'web'/.test(post) && /channels: \['Website'\]/.test(post) && /toWebsite: true/.test(post));
  assert.ok(/canPublishToWebsite/.test(m20f));
});
test('Message Log lists messages only, not website notices', () => {
  assert.ok(/audienceScope !== 'web'/.test(m20b));
});
done('messages-website-split');
