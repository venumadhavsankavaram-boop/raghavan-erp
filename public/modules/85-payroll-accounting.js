/* Salary posting: turns the month's salaries into consolidated Payment Vouchers in Accounting.
   Everything is optional and OFF until the school switches it on (Payroll page > "Salary accounting" > Settings).
   Design (the way larger payroll/accounts systems do it):
   - One voucher per ACCOUNT (cost center) and payment mode, not one per teacher. Drivers can go to Vehicle (Transport),
     teachers to Tuition Fee, and so on, by designation, department or a named person.
   - Posted only when the school asks: with a button, or automatically once the whole month is done.
   - Never posted twice. If the pay changes after posting, or a voucher is voided in Accounting, the month shows it and can be posted again.
   - The voucher amount is the net salary actually payable; the narration lists every person. EPF/ESI can optionally go in a separate voucher.
   The posting record lives in its own kv key, so vouchers themselves stay exactly like any other Payment Voucher. */
(function () {
  'use strict';
  const KEY = 'payroll-accounting';
  try { OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; } catch (e) {}
  const DEF = { enabled: false, trigger: 'manual', basis: 'paid', grouping: 'account', defaultMode: 'Bank Transfer', defaultCostCenter: 'Tuition Fee', category: 'Salaries', dateRule: 'paid', statutory: false, rules: [] };
  const MODES = ['Bank Transfer', 'Cheque', 'Cash', 'UPI', 'Online', 'Card'];
  const STAT_CAT = 'Statutory dues (EPF/ESI)';
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => { try { return fmtMoney(Number(n) || 0); } catch (e) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); } };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fd = s => { if (!s) return '—'; const m = String(s).slice(0, 10).split('-').map(Number); return m[2] + ' ' + MON[m[1] - 1] + ' ' + m[0]; };
  const mLabel = m => { const [y, mo] = String(m).split('-').map(Number); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][mo - 1] + ' ' + y; };
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const nameOf = st => ((st.firstName || '') + ' ' + (st.lastName || '')).trim() || st.id;
  const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };

  /* ---------- settings + posting record ---------- */
  let D = { settings: Object.assign({}, DEF), posts: {} };
  function norm(o) {
    o = (o && typeof o === 'object') ? o : {}; const s0 = (o.settings && typeof o.settings === 'object') ? o.settings : {};
    const pick = (v, list, d) => list.includes(v) ? v : d;
    const s = {
      enabled: s0.enabled === true, trigger: pick(s0.trigger, ['manual', 'auto'], 'manual'), basis: pick(s0.basis, ['paid', 'approved'], 'paid'),
      grouping: pick(s0.grouping, ['account', 'month', 'person'], 'account'),
      defaultMode: pick(s0.defaultMode, MODES, 'Bank Transfer'), defaultCostCenter: String(s0.defaultCostCenter || DEF.defaultCostCenter).slice(0, 80),
      category: String(s0.category || DEF.category).slice(0, 80), dateRule: pick(s0.dateRule, ['paid', 'month-end', 'today'], 'paid'), statutory: s0.statutory === true,
      rules: (Array.isArray(s0.rules) ? s0.rules : []).filter(r => r && ['designation', 'department', 'staff'].includes(r.by) && r.value && r.costCenter).slice(0, 300)
        .map(r => ({ by: r.by, value: String(r.value).slice(0, 120), costCenter: String(r.costCenter).slice(0, 80), category: r.category ? String(r.category).slice(0, 80) : '' })),
    };
    const posts = {};
    Object.keys(o.posts || {}).slice(-60).forEach(m => { if (Array.isArray(o.posts[m])) posts[m] = o.posts[m].slice(0, 200); });
    return { settings: s, posts };
  }
  let loaded = false;
  async function load(force) {
    if (loaded && !force) return;
    try { D = norm(await storageGet(KEY, {})); } catch (e) { D = norm({}); }
    loaded = true;
  }
  async function save() { try { return (await storageSet(KEY, D)) !== false; } catch (e) { return false; } }
  async function ensureAcct() {
    try { if (typeof ensureDataLoaded === 'function' && typeof loadAcctTransactionsData === 'function') await ensureDataLoaded('acctTransactions', loadAcctTransactionsData); } catch (e) {}
    try { if ((!acctCostCenters || !acctCostCenters.length || !acctExpenseCategories || !acctExpenseCategories.length) && typeof loadAccounting === 'function') await loadAccounting(); } catch (e) {}
  }
  const S = () => D.settings;
  const canPost = () => { try { return !!getStaffSubpageAccess(currentUser.role, 'staff_payroll', 'approve'); } catch (e) { return false; } };
  const isMgr = () => { try { return currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal'); } catch (e) { return false; } };
  const centers = () => { const l = (typeof acctCostCenters !== 'undefined' && acctCostCenters.length) ? acctCostCenters.slice() : ['Tuition Fee', 'Vehicle Fee (Transport)', 'Inventory', 'Hostel Fee', 'General / Other']; if (!l.includes(S().defaultCostCenter)) l.unshift(S().defaultCostCenter); return l; };
  const cats = () => { const l = (typeof acctExpenseCategories !== 'undefined' && acctExpenseCategories.length) ? acctExpenseCategories.slice() : ['Salaries']; if (!l.includes(S().category)) l.unshift(S().category); return l; };

  /* ---------- which account does each person's salary go to? ---------- */
  function ruleFor(st) {
    const R = S().rules;
    const byStaff = R.find(r => r.by === 'staff' && r.value === st.id);
    const byDes = R.find(r => r.by === 'designation' && r.value.toLowerCase() === String(st.designation || '').trim().toLowerCase());
    const byDep = R.find(r => r.by === 'department' && r.value.toLowerCase() === String(st.department || '').trim().toLowerCase());
    const r = byStaff || byDes || byDep;
    return { costCenter: r ? r.costCenter : S().defaultCostCenter, category: (r && r.category) || S().category, via: byStaff ? 'person' : byDes ? 'designation' : byDep ? 'department' : 'default' };
  }

  /* ---------- the record of what has been posted ---------- */
  function voucherOf(p) { return (typeof acctExpenses !== 'undefined' ? acctExpenses : []).find(e => e.id === p.voucherId); }
  function liveEntries(month) {
    // An entry is live while its voucher exists and has not been voided in Accounting.
    return (D.posts[month] || []).filter(p => { if (p.voided) return false; const v = voucherOf(p); return !!v && !v.voided; });
  }
  function postedFor(month, staffId) { for (const p of liveEntries(month)) { if (p.kind === 'stat') continue; const hit = (p.staff || []).find(x => x.id === staffId); if (hit) return { entry: p, net: hit.net }; } return null; }
  const statPosted = month => liveEntries(month).find(p => p.kind === 'stat') || null;

  /* ---------- what can be posted now ---------- */
  function scan(month) {
    const out = { ready: [], waiting: [], notPaid: [], zero: 0, done: [], changed: [], statAmt: 0, statStaff: 0 };
    const list = (typeof payrollStaffList === 'function') ? payrollStaffList(month) : staffList.filter(staffIsActive);
    list.forEach(st => {
      const rec = findPayrollRecord(st.id, month);
      if (!rec || rec.status !== 'Approved') { out.waiting.push(st); return; }
      const net = Math.round(Number(rec.netSalary) || 0);
      const got = postedFor(month, st.id);
      if (got) { out.done.push(st); if (got.net !== net) out.changed.push({ st, was: got.net, now: net }); return; }
      if (S().basis === 'paid' && rec.payStatus !== 'Paid') { out.notPaid.push(st); return; }
      if (net <= 0) { out.zero++; return; }
      const rl = ruleFor(st);
      out.ready.push({ st, rec, net, mode: (S().basis === 'paid' ? (rec.payMode || S().defaultMode) : S().defaultMode), paidDate: rec.paidDate || '', ref: rec.payRef || '', costCenter: rl.costCenter, category: rl.category, via: rl.via });
      out.statAmt += (Number(rec.epfEmployee) || 0) + (Number(rec.epfEmployer) || 0) + (Number(rec.esiEmployee) || 0) + (Number(rec.esiEmployer) || 0);
    });
    // Statutory dues count every approved person for the month that has no live statutory voucher yet.
    if (S().statutory && !statPosted(month)) {
      let amt = 0, n = 0;
      list.forEach(st => { const rec = findPayrollRecord(st.id, month); if (rec && rec.status === 'Approved') { const a = (Number(rec.epfEmployee) || 0) + (Number(rec.epfEmployer) || 0) + (Number(rec.esiEmployee) || 0) + (Number(rec.esiEmployer) || 0); if (a > 0) { amt += a; n++; } } });
      out.statAmt = Math.round(amt); out.statStaff = n;
    } else out.statAmt = 0;
    out.total = list.length;
    return out;
  }
  function plan(month, sc) {
    const s = S(), groups = {};
    // One voucher per account and per way of paying (cash, cheque and bank are different ledgers, so they never share a voucher).
    sc.ready.forEach(r => {
      const part = s.grouping === 'person' ? r.st.id : s.grouping === 'month' ? 'all' : r.costCenter + '|' + r.category;
      const k = part + '|' + r.mode;
      (groups[k] = groups[k] || { costCenter: s.grouping === 'month' ? s.defaultCostCenter : r.costCenter, category: s.grouping === 'month' ? s.category : r.category, mode: r.mode, rows: [] }).rows.push(r);
    });
    const list = Object.keys(groups).map(k => groups[k]);
    const per = (typeof payrollPeriod === 'function') ? payrollPeriod(month) : { to: month + '-28' };
    list.forEach(g => {
      g.amount = g.rows.reduce((n, r) => n + r.net, 0);
      const pd = g.rows.map(r => r.paidDate).filter(Boolean).sort();
      g.date = s.dateRule === 'today' ? todayIso() : s.dateRule === 'month-end' ? per.to : (pd.length ? pd[pd.length - 1] : todayIso());
      const refs = Array.from(new Set(g.rows.map(r => r.ref).filter(Boolean)));
      g.ref = refs.length ? refs.join(', ').slice(0, 180) : '';
      g.party = s.grouping === 'person' ? nameOf(g.rows[0].st) : 'Staff salaries — ' + mLabel(month) + (s.grouping === 'month' ? '' : ' (' + g.costCenter + ')');
      g.desc = 'Salary for ' + mLabel(month) + ' — ' + g.rows.length + ' staff, net ₹' + Math.round(g.amount).toLocaleString('en-IN') + '. Account: ' + g.costCenter + '. ' + g.rows.map(r => nameOf(r.st) + ' ₹' + r.net.toLocaleString('en-IN')).join('; ');
    });
    list.sort((a, b) => (a.costCenter + a.mode).localeCompare(b.costCenter + b.mode));
    return list;
  }

  /* ---------- posting ---------- */
  async function newVoucherNo(slot) { return await issueDocNumber('payment_voucher', slot); }
  async function addVoucher(rec, slot) {
    acctExpenses.push(rec);
    const ok = await storageSet(ACCT_EXPENSES_KEY, acctExpenses);
    if (ok === false) { const i = acctExpenses.indexOf(rec); if (i >= 0) acctExpenses.splice(i, 1); return false; }
    try { docDraftDone('payment_voucher', slot); } catch (e) {}
    return true;
  }
  async function ensureCategory(name) {
    try { if (!acctExpenseCategories.includes(name)) { acctExpenseCategories.push(name); await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories); } } catch (e) {}
  }
  let busy = false;
  async function post(month, opts) {
    opts = opts || {};
    if (busy) return { n: 0 }; busy = true;
    try {
      await load(true); await ensureAcct();
      if (!S().enabled) return { n: 0 };
      const sc = scan(month), groups = plan(month, sc);
      const jobs = groups.length + ((S().statutory && sc.statAmt > 0) ? 1 : 0);
      if (!jobs) { if (!opts.silent) toast('Nothing new to post for ' + mLabel(month) + '.'); return { n: 0 }; }
      const made = []; let failed = '';
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        await ensureCategory(g.category);
        let no; try { no = await newVoucherNo('pr' + month + i); } catch (e) { failed = 'Could not get a voucher number (' + e.message + ').'; break; }
        const rec = { id: 'exp_' + Date.now() + '_' + i, voucherNo: no, date: g.date, category: g.category, costCenter: g.costCenter, amount: Math.round(g.amount * 100) / 100, party: g.party, mode: g.mode, referenceNo: g.ref, description: g.desc, addedBy: (currentUser && currentUser.name) || '', voided: false };
        if (!(await addVoucher(rec, 'pr' + month + i))) { failed = 'Voucher ' + no + ' could not be saved (the date may be locked, or the connection dropped).'; break; }
        const entry = { id: 'pp_' + Date.now() + '_' + i, kind: 'salary', month, voucherId: rec.id, voucherNo: no, costCenter: g.costCenter, category: g.category, mode: g.mode, amount: rec.amount, date: g.date, staff: g.rows.map(r => ({ id: r.st.id, net: r.net })), at: new Date().toISOString(), by: rec.addedBy, voided: false };
        (D.posts[month] = D.posts[month] || []).push(entry); await save(); made.push(entry);
      }
      if (!failed && S().statutory && sc.statAmt > 0) {
        await ensureCategory(STAT_CAT);
        let no; try { no = await newVoucherNo('pr' + month + 'stat'); } catch (e) { failed = 'Could not get a voucher number (' + e.message + ').'; }
        if (!failed) {
          const per = (typeof payrollPeriod === 'function') ? payrollPeriod(month) : { to: month + '-28' };
          const rec = { id: 'exp_' + Date.now() + '_s', voucherNo: no, date: S().dateRule === 'today' ? todayIso() : per.to, category: STAT_CAT, costCenter: S().defaultCostCenter, amount: sc.statAmt, party: 'EPF / ESI — ' + mLabel(month), mode: S().defaultMode, referenceNo: '', description: 'EPF and ESI for ' + mLabel(month) + ' (employee and employer share), ' + sc.statStaff + ' staff. To be paid to the EPF / ESI offices.', addedBy: (currentUser && currentUser.name) || '', voided: false };
          if (!(await addVoucher(rec, 'pr' + month + 'stat'))) failed = 'The EPF/ESI voucher could not be saved.';
          else { (D.posts[month] = D.posts[month] || []).push({ id: 'pp_' + Date.now() + '_s', kind: 'stat', month, voucherId: rec.id, voucherNo: no, costCenter: rec.costCenter, category: STAT_CAT, mode: rec.mode, amount: rec.amount, date: rec.date, staff: [], at: new Date().toISOString(), by: rec.addedBy, voided: false }); await save(); made.push({ kind: 'stat', amount: rec.amount }); }
        }
      }
      try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (e) {}
      if (made.length && !opts.silent) toast(made.length + ' salary voucher' + (made.length === 1 ? '' : 's') + ' posted to Accounting.', 'burst');
      else if (made.length) toast('Salary vouchers for ' + mLabel(month) + ' were posted to Accounting automatically.', 'burst');
      if (failed) toast('Stopped: ' + failed + ' What was posted is safe; press Post again to continue.');
      return { n: made.length, failed };
    } finally { busy = false; repaint(); }
  }
  async function voidEntry(month, id) {
    await load(true); await ensureAcct();
    const e = (D.posts[month] || []).find(x => x.id === id); if (!e) return;
    const v = voucherOf(e);
    let reason = 'Salary posting cancelled';
    try { const r = await showPromptDialog('Cancel voucher ' + e.voucherNo + '?\n\nThe voucher stays in Accounting, struck through, with this reason. Then the salaries can be posted again.', { title: 'Cancel salary voucher', okText: 'Cancel voucher', defaultValue: 'Salary changed, posting again' }); if (r === null) return; if (!String(r).trim()) { toast('A reason is required.'); return; } reason = String(r).trim(); } catch (x) {}
    if (v && !v.voided) { v.voided = true; v.voidReason = reason; v.voidedBy = (currentUser && currentUser.name) || ''; v.voidedAt = new Date().toISOString(); await storageSet(ACCT_EXPENSES_KEY, acctExpenses); }
    e.voided = true; e.voidReason = reason; await save();
    try { if (typeof renderDashboard === 'function') renderDashboard(); } catch (x) {}
    toast('Voucher ' + e.voucherNo + ' cancelled.'); repaint();
  }

  /* ---------- auto posting: only when the whole month is complete ---------- */
  async function maybeAuto(month) {
    try {
      await load(false); if (!S().enabled || S().trigger !== 'auto') return;
      await ensureAcct(); const sc = scan(month);
      const complete = sc.waiting.length === 0 && sc.notPaid.length === 0 && sc.ready.length > 0;
      if (complete) await post(month, { silent: true });
    } catch (e) { try { console.error('payroll-accounting', e); } catch (x) {} }
  }
  ['approvePayroll', 'payrollMarkPaid', 'payrollMarkAllPaid'].forEach(n => {
    const o = window[n]; if (typeof o !== 'function') return;
    window[n] = async function () { const r = await o.apply(this, arguments); try { const m = (typeof staffPayrollMonth !== 'undefined') ? staffPayrollMonth : ''; if (m) setTimeout(() => maybeAuto(m), 400); } catch (e) {} return r; };
  });

  /* ---------- the card on the Payroll page ---------- */
  const CSS = `
    .pa-card{background:#fff;border:1px solid #e3e0f0;border-radius:14px;padding:12px 14px;margin:12px 0}
    .pa-card h4{margin:0 0 4px;font-size:1rem} .pa-sub{font-size:.8rem;color:#6b6a85}
    .pa-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
    .pa-pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.74rem;font-weight:700}
    .pa-on{background:#e3f6ea;color:#1b7f4b}.pa-off{background:#eee;color:#666}.pa-warn{background:#fff1d6;color:#9a5b00}
    .pa-b{border:0;border-radius:10px;padding:8px 13px;font-weight:700;cursor:pointer;background:#2f4fd8;color:#fff;font-size:.84rem}.pa-b.g{background:#eef2fb;color:#243fb5}.pa-b.r{background:#fde8e8;color:#b3261e}.pa-b[disabled]{opacity:.5;cursor:default}
    .pa-t{width:100%;border-collapse:collapse;font-size:.84rem;margin-top:8px}.pa-t th{text-align:left;background:#f2f0fb;padding:6px 8px;font-size:.72rem;text-transform:uppercase}.pa-t td{padding:6px 8px;border-bottom:1px solid #eeeaf8;vertical-align:top}
    #paOv{position:fixed;inset:0;z-index:99980;background:rgba(20,16,50,.6);display:flex;align-items:center;justify-content:center;padding:12px}
    #paOv .pa-box{background:#fff;border-radius:16px;max-width:820px;width:100%;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
    #paOv .pa-top{display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #e3e0f0}#paOv .pa-top h3{margin:0;flex:1;font-size:1.05rem}
    #paOv .pa-body{padding:12px 16px;overflow:auto}#paOv .pa-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:10px 16px;border-top:1px solid #e3e0f0}
    #paOv label{display:block;font-size:.78rem;color:#6b6a85;margin:8px 0 3px}#paOv select,#paOv input[type=text]{width:100%;box-sizing:border-box;padding:8px 9px;border:1px solid #cfd6e6;border-radius:8px;font-size:.88rem;background:#fff}
    #paOv .pa-g2{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}@media(max-width:640px){#paOv .pa-g2{grid-template-columns:1fr}}
    #paOv h5{margin:16px 0 4px;font-size:.92rem}#paOv .chk{display:flex;gap:8px;align-items:flex-start;font-size:.88rem;margin:6px 0}#paOv .chk input{margin-top:3px}`;
  function css() { if ($('paCss')) return; const s = document.createElement('style'); s.id = 'paCss'; s.textContent = CSS; document.head.appendChild(s); }
  function cardHtml(month) {
    const s = S(), sc = scan(month), live = liveEntries(month);
    const state = !s.enabled ? '<span class="pa-pill pa-off">Off</span>' : '<span class="pa-pill pa-on">On · ' + (s.trigger === 'auto' ? 'automatic when the month is complete' : 'you press Post') + '</span>';
    let body = '';
    if (!s.enabled) body = '<div class="pa-sub">Salaries are not posted to Accounting. Turn this on to create consolidated Payment Vouchers (for example teachers to Tuition Fee and drivers to Vehicle) with one click.</div>';
    else {
      const readyAmt = sc.ready.reduce((n, r) => n + r.net, 0);
      const liveAmt = live.reduce((n, p) => n + (p.kind === 'stat' ? 0 : p.amount), 0);
      body = `<div class="pa-row" style="font-size:.86rem"><span><b>${live.filter(p => p.kind !== 'stat').length}</b> voucher(s) posted · ${esc(money(liveAmt))}</span><span>·</span><span><b>${sc.ready.length}</b> ready to post · ${esc(money(readyAmt))}</span>${sc.waiting.length ? `<span>·</span><span>${sc.waiting.length} waiting for approval</span>` : ''}${sc.notPaid.length ? `<span>·</span><span>${sc.notPaid.length} approved, not yet marked paid</span>` : ''}</div>`;
      if (sc.changed.length) body += `<div class="pa-sub" style="margin-top:6px"><span class="pa-pill pa-warn">Changed after posting</span> ${sc.changed.map(c => esc(nameOf(c.st)) + ' (' + esc(money(c.was)) + ' → ' + esc(money(c.now)) + ')').join(', ')}. Cancel that voucher and post again to correct it.</div>`;
      if (live.length) body += `<table class="pa-t"><thead><tr><th>Voucher</th><th>Account</th><th>Paid by</th><th>Staff</th><th>Amount</th><th></th></tr></thead><tbody>${live.map(p => `<tr><td><b>${esc(p.voucherNo)}</b><div class="pa-sub">${esc(fd(p.date))}</div></td><td>${esc(p.costCenter)}<div class="pa-sub">${esc(p.category)}</div></td><td>${esc(p.mode)}</td><td>${p.kind === 'stat' ? 'EPF / ESI' : (p.staff || []).length}</td><td>${esc(money(p.amount))}</td><td>${canPost() ? `<button class="pa-b r" style="padding:4px 9px" onclick="payrollAcctVoid('${esc(month)}','${esc(p.id)}')">Cancel</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
    }
    return `<div class="pa-card" id="paCard"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h4 style="flex:1">🧾 Salary accounting — ${esc(mLabel(month))} ${state}</h4></div>${body}<div class="pa-row">${s.enabled && canPost() ? `<button class="pa-b" onclick="payrollAcctPreview('${esc(month)}')" ${(sc.ready.length || (s.statutory && sc.statAmt > 0)) ? '' : 'disabled'}>Preview &amp; post vouchers</button>` : ''}${isMgr() ? '<button class="pa-b g" onclick="payrollAcctSettings()">⚙ Settings</button>' : ''}</div></div>`;
  }
  function repaint() { const c = $('paCard'); const m = (typeof staffPayrollMonth !== 'undefined') ? staffPayrollMonth : ''; if (c && m) c.outerHTML = cardHtml(m); }

  /* ---------- preview ---------- */
  function openOv(title, bodyHtml, actHtml) {
    css(); const old = $('paOv'); if (old) old.remove();
    const ov = document.createElement('div'); ov.id = 'paOv';
    ov.innerHTML = `<div class="pa-box" role="dialog" aria-modal="true"><div class="pa-top"><h3>${esc(title)}</h3><button class="pa-b g" id="paX">✕ Close</button></div><div class="pa-body">${bodyHtml}</div><div class="pa-act">${actHtml}</div></div>`;
    document.body.appendChild(ov); ov.addEventListener('click', e => { if (e.target === ov || e.target.id === 'paX') ov.remove(); });
    return ov;
  }
  window.payrollAcctPreview = async function (month) {
    if (!canPost()) { toast("You don't have permission to post salaries."); return; }
    await load(true); await ensureAcct();
    if (!S().enabled) { toast('Salary accounting is switched off. Turn it on in Settings first.'); return; }
    const sc = scan(month), groups = plan(month, sc);
    if (!groups.length && !(S().statutory && sc.statAmt > 0)) { toast('Nothing new to post for ' + mLabel(month) + '.'); return; }
    const total = groups.reduce((n, g) => n + g.amount, 0);
    const rows = groups.map(g => `<tr><td><b>${esc(g.costCenter)}</b><div class="pa-sub">${esc(g.category)}</div></td><td>${esc(g.mode)}</td><td>${esc(fd(g.date))}</td><td>${g.rows.length}<div class="pa-sub">${esc(g.rows.slice(0, 4).map(r => nameOf(r.st)).join(', '))}${g.rows.length > 4 ? ' …' : ''}</div></td><td style="text-align:right">${esc(money(g.amount))}</td></tr>`).join('');
    const stat = (S().statutory && sc.statAmt > 0) ? `<tr><td><b>${esc(S().defaultCostCenter)}</b><div class="pa-sub">${esc(STAT_CAT)}</div></td><td>${esc(S().defaultMode)}</td><td>${esc(fd((typeof payrollPeriod === 'function' ? payrollPeriod(month).to : month + '-28')))}</td><td>EPF / ESI<div class="pa-sub">${sc.statStaff} staff</div></td><td style="text-align:right">${esc(money(sc.statAmt))}</td></tr>` : '';
    const via = Array.from(new Set(sc.ready.filter(r => r.via === 'default').map(r => r.st.designation || 'No designation')));
    const note = via.length && S().rules.length ? `<div class="pa-sub" style="margin-top:8px"><span class="pa-pill pa-off">Note</span> Going to the usual account (${esc(S().defaultCostCenter)}): ${esc(via.join(', '))}.</div>` : '';
    const o = openOv('Post salary vouchers — ' + mLabel(month), `<div class="pa-sub">These Payment Vouchers will be created in Accounting. Nothing is posted until you press the button.</div><table class="pa-t"><thead><tr><th>Account</th><th>Paid by</th><th>Date</th><th>Staff</th><th style="text-align:right">Amount</th></tr></thead><tbody>${rows}${stat}</tbody></table><div style="text-align:right;margin-top:8px;font-weight:700">Salaries total: ${esc(money(total))}</div>${note}`, `<button class="pa-b g" id="paX2">Not now</button><button class="pa-b" id="paGo">Post ${groups.length + (stat ? 1 : 0)} voucher${groups.length + (stat ? 1 : 0) === 1 ? '' : 's'}</button>`);
    o.querySelector('#paX2').onclick = () => o.remove();
    o.querySelector('#paGo').onclick = async () => { o.querySelector('#paGo').disabled = true; o.remove(); await post(month, {}); };
  };
  window.payrollAcctVoid = voidEntry;

  /* ---------- settings ---------- */
  window.payrollAcctSettings = async function () {
    if (!isMgr()) { toast('Only the Admin or Principal can change this.'); return; }
    await load(true); await ensureAcct();
    const s = S(), C = centers(), CT = cats();
    const sel = (id, opts, cur, withDefault) => `<select id="${id}">${withDefault ? '<option value="">— default —</option>' : ''}${opts.map(o => `<option value="${esc(o[0])}" ${o[0] === cur ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    const cOpts = C.map(c => [c, c]);
    const desigs = {}, deps = {};
    (typeof staffList !== 'undefined' ? staffList : []).filter(st => { try { return staffIsActive(st); } catch (e) { return true; } }).forEach(st => { const d = String(st.designation || '').trim(), p = String(st.department || '').trim(); if (d) desigs[d] = (desigs[d] || 0) + 1; if (p) deps[p] = (deps[p] || 0) + 1; });
    const ruleSel = (by, val) => { const r = s.rules.find(x => x.by === by && x.value.toLowerCase() === val.toLowerCase()); return `<select data-rb="${by}" data-rv="${esc(val)}"><option value="">Default (${esc(s.defaultCostCenter)})</option>${C.map(c => `<option value="${esc(c)}" ${r && r.costCenter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`; };
    const dRows = Object.keys(desigs).sort().map(d => `<tr><td>${esc(d)} <span class="pa-sub">(${desigs[d]})</span></td><td>${ruleSel('designation', d)}</td></tr>`).join('') || '<tr><td colspan="2" class="pa-sub">No designations on the staff records yet.</td></tr>';
    const pRows = Object.keys(deps).sort().map(d => `<tr><td>${esc(d)} <span class="pa-sub">(${deps[d]})</span></td><td>${ruleSel('department', d)}</td></tr>`).join('');
    const sRules = s.rules.filter(r => r.by === 'staff');
    const sRows = sRules.map(r => { const st = (staffList || []).find(x => x.id === r.value); return `<tr><td>${esc(st ? nameOf(st) : r.value)}</td><td>${ruleSel('staff', r.value)}</td></tr>`; }).join('');
    const staffOpts = (staffList || []).filter(st => { try { return staffIsActive(st); } catch (e) { return true; } }).sort((a, b) => nameOf(a).localeCompare(nameOf(b))).map(st => `<option value="${esc(st.id)}">${esc(nameOf(st))}${st.designation ? ' — ' + esc(st.designation) : ''}</option>`).join('');
    const body = `
      <label class="chk"><input type="checkbox" id="paEn" ${s.enabled ? 'checked' : ''}><span><b>Post salaries to Accounting</b><br><span class="pa-sub">Off: payroll works exactly as before and nothing goes to Accounting. Leave it off if your accountant enters salaries by hand.</span></span></label>
      <h5>When to post</h5><div class="pa-g2">
        <div><label>How</label>${sel('paTr', [['manual', 'I press "Post" myself (recommended)'], ['auto', 'Automatically when every person this month is done']], s.trigger)}</div>
        <div><label>A salary counts when it is</label>${sel('paBa', [['paid', 'Marked as paid'], ['approved', 'Approved']], s.basis)}</div>
        <div><label>Voucher date</label>${sel('paDt', [['paid', 'The day it was paid (latest in the voucher)'], ['month-end', 'Last day of the salary period'], ['today', 'The day I post']], s.dateRule)}</div>
        <div><label>Payment mode when salaries are only approved</label>${sel('paDm', MODES.map(m => [m, m]), s.defaultMode)}</div></div>
      <h5>How many vouchers</h5><div class="pa-g2">
        <div><label>Consolidate</label>${sel('paGr', [['account', 'One voucher per account (Tuition, Vehicle …)'], ['month', 'One voucher for the whole month'], ['person', 'One voucher per person']], s.grouping)}</div>
        <div class="pa-sub" style="align-self:end">Cash, cheque and bank payments are always kept in separate vouchers.</div></div>
      <h5>Which account does each salary go to?</h5>
      <div class="pa-g2"><div><label>Usual account (everyone else)</label>${sel('paDc', cOpts, s.defaultCostCenter)}</div><div><label>Expense category</label>${sel('paCa', CT.map(c => [c, c]), s.category)}</div></div>
      <div class="pa-sub" style="margin-top:6px">Example: set the usual account to Tuition Fee for teachers, then choose Vehicle Fee (Transport) for Driver and Conductor. A named person can also be set below, and wins over the designation.</div>
      <table class="pa-t"><thead><tr><th>Designation</th><th>Goes to</th></tr></thead><tbody>${dRows}</tbody></table>
      ${pRows ? `<table class="pa-t"><thead><tr><th>Department</th><th>Goes to</th></tr></thead><tbody>${pRows}</tbody></table>` : ''}
      <table class="pa-t"><thead><tr><th>Named person</th><th>Goes to</th></tr></thead><tbody id="paStaffRows">${sRows}</tbody></table>
      <div class="pa-row"><select id="paAddSt" style="max-width:300px"><option value="">Add a person…</option>${staffOpts}</select><button type="button" class="pa-b g" id="paAddBtn">+ Add</button></div>
      <h5>EPF and ESI</h5><label class="chk"><input type="checkbox" id="paSt" ${s.statutory ? 'checked' : ''}><span>Also post the month's EPF and ESI (employee and employer share) as one separate voucher, so it is ready to pay to the offices.<br><span class="pa-sub">The salary vouchers hold only the net pay. This keeps the government dues visible.</span></span></label>`;
    const o = openOv('Salary accounting settings', body, '<button class="pa-b g" id="paX2">Cancel</button><button class="pa-b" id="paSave">Save settings</button>');
    o.querySelector('#paX2').onclick = () => o.remove();
    o.querySelector('#paAddBtn').onclick = () => { const v = o.querySelector('#paAddSt').value; if (!v || o.querySelector('[data-rb="staff"][data-rv="' + v + '"]')) return; const st = (staffList || []).find(x => x.id === v); const tr = document.createElement('tr'); tr.innerHTML = `<td>${esc(st ? nameOf(st) : v)}</td><td>${ruleSel('staff', v)}</td>`; o.querySelector('#paStaffRows').appendChild(tr); };
    o.querySelector('#paSave').onclick = async () => {
      const g = id => o.querySelector('#' + id);
      // Keep rules for designations or departments that nobody has right now (they come back into use when someone is hired).
      const shown = new Set(); o.querySelectorAll('select[data-rb]').forEach(el => shown.add(el.dataset.rb + '|' + el.dataset.rv.toLowerCase()));
      const rules = S().rules.filter(r => !shown.has(r.by + '|' + r.value.toLowerCase()));
      o.querySelectorAll('select[data-rb]').forEach(el => { if (el.value) rules.push({ by: el.dataset.rb, value: el.dataset.rv, costCenter: el.value }); });
      const next = Object.assign({}, S(), { enabled: g('paEn').checked, trigger: g('paTr').value, basis: g('paBa').value, dateRule: g('paDt').value, defaultMode: g('paDm').value, grouping: g('paGr').value, defaultCostCenter: g('paDc').value, category: g('paCa').value, statutory: g('paSt').checked, rules });
      D = norm({ settings: next, posts: D.posts }); const ok = await save();
      if (ok) { o.remove(); toast(D.settings.enabled ? 'Salary accounting is ON.' : 'Salary accounting is OFF.', 'burst'); repaint(); } else toast('Could not save the settings. Try again.');
    };
  };

  /* ---------- show the card on the Payroll page ---------- */
  const origTab = window.renderStaffPayrollTab;
  if (typeof origTab === 'function') {
    window.renderStaffPayrollTab = function (body) {
      origTab.apply(this, arguments);
      try {
        const first = body.querySelector('.profile-card'); if (!first) return; css();
        const paint = () => { const old = $('paCard'); if (old) old.remove(); first.insertAdjacentHTML('afterend', cardHtml(staffPayrollMonth)); };
        paint();
        load(false).then(() => ensureAcct()).then(() => { if (document.body.contains(first)) paint(); });
      } catch (e) { try { console.error('payroll-accounting', e); } catch (x) {} }
    };
  }
  window.__pa = { save, post, voidEntry, maybeAuto, norm, scan: month => scan(month), plan, ruleFor, setD(v) { D = norm(v); loaded = true; }, get D() { return D; } };
})();
