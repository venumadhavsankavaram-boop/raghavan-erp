/* ===== Deleted Items (Recycle Bin) =====
   One page for everything that has been removed but can still be answered for:
     - Students  : soft-deleted (restorable for TRASH_RETENTION_DAYS, then auto-purged)
     - Receipts  : voided fee payments (never erased; receipt numbers are never reused)
     - Vouchers  : voided Income / Expense / Journal vouchers (never erased)
     - Users     : soft-deleted logins
   Modelled on how the established finance/ERP packages behave: financial records
   are cancelled/voided with a reason and kept visible for audit (Tally "cancelled
   voucher", Zoho/QuickBooks "void"), people-records go to a recycle bin with a
   retention window and a countdown. Restoring a void needs a written reason and is
   itself logged on the record (voidHistory), so the trail is never lost. */
(function(){
  const DI = { tab:'students', q:'', cache:{}, loaded:{} };
  const TABS = [
    { key:'students', label:'Students' },
    { key:'receipts', label:'Receipts' },
    { key:'vouchers', label:'Vouchers' },
    { key:'users',    label:'Users' },
  ];
  const e = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const isAdmin = () => currentUser && currentUser.role === 'Admin';
  const isAdminOrPrincipal = () => currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal');
  const money = n => (typeof fmtMoney === 'function' ? fmtMoney(n) : '₹' + (Number(n)||0).toLocaleString('en-IN'));
  const fdate = d => { if(!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}); };
  const fdt = d => { if(!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'}); };

  function diCss(){
    if(document.getElementById('diCss')) return;
    const st = document.createElement('style'); st.id = 'diCss';
    st.textContent = `
      .di-tabs{display:flex; gap:6px; border-bottom:1px solid var(--line,#e3e6ee); margin:4px 0 14px; flex-wrap:wrap;}
      .di-tab{background:none; border:0; padding:10px 16px; font-weight:600; color:var(--ink-soft,#667); cursor:pointer; border-bottom:3px solid transparent; font-size:0.9rem;}
      .di-tab.active{color:var(--navy,#14325c); border-bottom-color:var(--navy,#14325c);}
      .di-tab .di-count{display:inline-block; min-width:20px; padding:1px 7px; margin-left:6px; border-radius:10px; background:#eef1f7; font-size:0.72rem; color:#445;}
      .di-tab.active .di-count{background:var(--navy,#14325c); color:#fff;}
      .di-bar{display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap;}
      .di-bar input{flex:1; min-width:220px; padding:9px 12px; border:1px solid var(--line,#d5dae6); border-radius:8px; font:inherit;}
      .di-note{font-size:0.8rem; color:var(--ink-soft,#667); background:#f6f8fc; border:1px solid #e3e8f3; border-radius:8px; padding:9px 12px; margin-bottom:12px; line-height:1.45;}
      .di-table{width:100%; border-collapse:collapse; font-size:0.84rem; background:#fff; border:1px solid var(--line,#e3e6ee); border-radius:8px; overflow:hidden;}
      .di-table th{background:#f3f5fa; text-align:left; padding:9px 10px; font-weight:600; color:#334; white-space:nowrap;}
      .di-table td{padding:9px 10px; border-top:1px solid #eef0f6; vertical-align:top;}
      .di-table tr:hover td{background:#fafbfe;}
      .di-act{display:flex; gap:8px; flex-wrap:wrap; align-items:center;}
      .di-pill{display:inline-block; font-size:0.7rem; padding:2px 8px; border-radius:10px; background:#fdecea; color:#a02020; font-weight:600;}
      .di-pill.ok{background:#e8f5ec; color:#1d6b35;} .di-pill.warn{background:#fff4e0; color:#8a5a00;}
      .di-reason{max-width:280px; color:#444;} .di-sub{color:#778; font-size:0.76rem;}
      .di-wrap{overflow-x:auto;}
    `;
    document.head.appendChild(st);
  }

  /* ---------- data loading ---------- */
  async function fetchTrash(path){
    const res = await fetch(path + '?trash=1');
    if(!res.ok) throw new Error('Request failed (' + res.status + ')');
    return res.json();
  }
  async function diLoad(tab, force){
    if(DI.loaded[tab] && !force) return DI.cache[tab];
    let rows = [];
    if(tab === 'students'){ rows = await fetchTrash('/api/students'); }
    else if(tab === 'users'){ if(!isAdmin()) rows = []; else rows = await fetchTrash('/api/users'); }
    else if(tab === 'receipts'){
      await ensureDataLoaded('payments', loadPaymentsData);
      try{ if(!students.length && typeof loadStudents === 'function') await loadStudents(); }catch(_){}
      rows = payments.filter(p => p.voided);
    }else if(tab === 'vouchers'){
      await ensureDataLoaded('acctTransactions', loadAcctTransactionsData);
      try{ acctJournalVouchers = await storageGet(ACCT_JOURNAL_KEY, []); }catch(_){}
      rows = []
        .concat(acctIncome.filter(v => v.voided).map(v => ({ ...v, _kind:'income' })))
        .concat(acctExpenses.filter(v => v.voided).map(v => ({ ...v, _kind:'expense' })))
        .concat(acctJournalVouchers.filter(v => v.voided).map(v => ({ ...v, _kind:'journal' })));
    }
    DI.cache[tab] = rows; DI.loaded[tab] = true;
    return rows;
  }
  function visibleTabs(){ return TABS.filter(t => t.key !== 'users' || isAdmin()); }

  /* ---------- page shell ---------- */
  window.initDeletedItemsPage = async function(){
    diCss();
    if(!DI.cache.students) DI.loaded = {};
    DI.q = '';
    const host = document.getElementById('deletedItemsBody');
    if(!host) return;
    host.innerHTML = '<div class="empty-state"><b>Loading…</b></div>';
    // Counts for the tab chips
    await Promise.all(visibleTabs().map(t => diLoad(t.key, true).catch(() => { DI.cache[t.key] = []; DI.loaded[t.key] = true; })));
    renderDeletedItems();
  };
  function renderDeletedItems(){
    const host = document.getElementById('deletedItemsBody'); if(!host) return;
    const tabs = visibleTabs();
    if(!tabs.some(t => t.key === DI.tab)) DI.tab = 'students';
    host.innerHTML = `
      <div class="di-tabs">${tabs.map(t => `<button class="di-tab ${DI.tab===t.key?'active':''}" onclick="diSetTab('${t.key}')">${t.label}<span class="di-count">${(DI.cache[t.key]||[]).length}</span></button>`).join('')}</div>
      <div class="di-bar"><input id="diSearch" type="search" placeholder="Search this list…" value="${e(DI.q)}" oninput="diSearch(this.value)"></div>
      <div id="diPanel"></div>`;
    renderPanel();
  }
  window.diSetTab = function(t){ DI.tab = t; DI.q = ''; renderDeletedItems(); };
  window.diSearch = function(v){ DI.q = v || ''; renderPanel(); };
  function match(hay){ return !DI.q || hay.toLowerCase().includes(DI.q.trim().toLowerCase()); }
  function renderPanel(){
    const p = document.getElementById('diPanel'); if(!p) return;
    const fn = { students:panelStudents, users:panelUsers, receipts:panelReceipts, vouchers:panelVouchers }[DI.tab];
    p.innerHTML = fn();
  }
  const empty = msg => `<div class="empty-state"><b>Nothing here</b>${msg}</div>`;

  /* ---------- Students & Users (recycle bin) ---------- */
  function countdown(r){ return (typeof purgeCountdownText === 'function' && r.purgesAt) ? purgeCountdownText(r.purgesAt) : ''; }
  function panelStudents(){
    const rows = (DI.cache.students || []).filter(s => match(`${s.firstName||''} ${s.lastName||''} ${s.admissionNo||''} ${s.className||''} ${s.deletedByName||''}`));
    const note = `<div class="di-note">Deleted students are kept for 60 days and then removed permanently. <b>Restore</b> brings back the student with all their records; <b>Restore &amp; Edit</b> restores and opens the form so you can correct details straight away.</div>`;
    if(!rows.length) return note + empty('No deleted students.');
    return note + `<div class="di-wrap"><table class="di-table"><thead><tr><th>Student</th><th>Class</th><th>Admission No</th><th>Deleted</th><th>Auto-purge</th><th>Actions</th></tr></thead><tbody>${
      rows.map(s => `<tr>
        <td><b>${e(`${s.firstName||''} ${s.lastName||''}`.trim() || '(no name)')}</b></td>
        <td>${e(s.className||'—')} · ${e(s.section||'—')}</td>
        <td>${e(s.admissionNo||'—')}</td>
        <td>${fdt(s.deletedAt)}<div class="di-sub">by ${e(s.deletedByName||'—')}</div></td>
        <td><span class="di-pill warn">${e(countdown(s) || '—')}</span></td>
        <td><div class="di-act">${isAdminOrPrincipal() ? `
          <button class="btn btn-primary btn-sm" onclick="diRestoreRecord('students','${e(s.id)}',false)">Restore</button>
          <button class="btn btn-ghost btn-sm" onclick="diRestoreRecord('students','${e(s.id)}',true)">Restore &amp; Edit</button>
          <button class="btn-danger-text" onclick="diPurge('students','${e(s.id)}')">Delete Permanently</button>` : '<span class="di-sub">Admin / Principal only</span>'}</div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  function panelUsers(){
    const rows = (DI.cache.users || []).filter(u => match(`${u.name||''} ${u.username||''} ${u.role||''} ${u.deletedByName||''}`));
    if(!rows.length) return empty('No deleted users.');
    return `<div class="di-wrap"><table class="di-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Deleted</th><th>Auto-purge</th><th>Actions</th></tr></thead><tbody>${
      rows.map(u => `<tr>
        <td><b>${e(u.name||'(no name)')}</b></td><td>${e(u.username||'—')}</td><td>${e(u.role||'—')}</td>
        <td>${fdt(u.deletedAt)}<div class="di-sub">by ${e(u.deletedByName||'—')}</div></td>
        <td><span class="di-pill warn">${e(countdown(u) || '—')}</span></td>
        <td><div class="di-act"><button class="btn btn-primary btn-sm" onclick="diRestoreRecord('users','${e(u.id)}',false)">Restore</button>
          <button class="btn-danger-text" onclick="diPurge('users','${e(u.id)}')">Delete Permanently</button></div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  const API = { students:'/api/students', users:'/api/users' };
  window.diRestoreRecord = async function(kind, id, thenEdit){
    try{
      await throwIfNotOk(await fetch(API[kind] + '?id=' + encodeURIComponent(id) + '&restore=1', { method:'PUT', headers: actorHeaders() }));
      showToast('Restored.', 'burst');
      if(kind === 'students'){ await loadStudents(); renderDashboard(); if(typeof renderAdmissionsBody === 'function') renderAdmissionsBody(); }
      else { await loadUsers(); if(typeof refreshUserListViews === 'function') refreshUserListViews(); }
      await diLoad(kind, true); renderDeletedItems();
      if(thenEdit && kind === 'students' && typeof editStudent === 'function'){
        if(typeof switchView === 'function') switchView('admissions');
        editStudent(id);
        const ov = document.getElementById('wizardOverlay'); if(ov) ov.classList.add('open');
      }
    }catch(err){ showToast('Could not restore (' + err.message + ').'); }
  };
  window.diPurge = async function(kind, id){
    const row = (DI.cache[kind] || []).find(r => r.id === id); if(!row) return;
    const label = kind === 'students' ? 'Admission No' : 'Username';
    const expected = kind === 'students' ? (row.admissionNo || '') : (row.username || '');
    if(!isAdmin() && kind === 'users'){ showToast('Only an Admin can do this.'); return; }
    const typed = await showPromptDialog(`This permanently and irreversibly deletes this record — there is no Restore after this.\n\nType the ${label} (${expected || '—'}) to confirm.`, { title:'Permanently delete', okText:'Delete Permanently' });
    if(typed === null) return;
    if(typed.trim().toLowerCase() !== String(expected).trim().toLowerCase()){ showToast(`That didn't match — nothing was deleted.`); return; }
    try{
      await throwIfNotOk(await fetch(API[kind] + '?id=' + encodeURIComponent(id) + '&purge=1', { method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body: JSON.stringify({ confirmText: typed.trim() }) }));
      showToast('Permanently deleted.', 'burst');
      await diLoad(kind, true); renderDeletedItems();
    }catch(err){ showToast('Could not permanently delete (' + err.message + ').'); }
  };

  /* ---------- Receipts (voided payments) ---------- */
  function studentOf(p){ return (students || []).find(s => s.id === p.studentId); }
  function receiptNo(p){ return p.receiptNo || p.receiptNumber || p.receipt || p.id; }
  function panelReceipts(){
    const rows = (DI.cache.receipts || []).filter(p => {
      const s = studentOf(p);
      return match(`${receiptNo(p)} ${s ? s.firstName+' '+s.lastName : (p.studentName||'')} ${p.voidReason||''} ${p.voidedBy||''} ${p.category||''}`);
    }).sort((a,b) => String(b.voidedAt||'').localeCompare(String(a.voidedAt||'')));
    const note = `<div class="di-note">Receipts are never erased — a wrong receipt is <b>voided</b> with a reason and stays here for audit, and its receipt number is never reused. Voided receipts do not count in any total. An Admin can <b>Restore</b> a receipt that was voided by mistake (a reason is required and logged), or <b>Edit reason</b> to correct the wording. Refund-type voids cannot be restored here because a refund voucher was posted for them.</div>`;
    if(!rows.length) return note + empty('No voided receipts.');
    return note + `<div class="di-wrap"><table class="di-table"><thead><tr><th>Receipt</th><th>Student</th><th>Fee head</th><th>Amount</th><th>Paid on</th><th>Voided</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${
      rows.map(p => {
        const s = studentOf(p);
        const isRefund = p.voidType === 'refund';
        return `<tr>
          <td><b>${e(receiptNo(p))}</b></td>
          <td>${e(s ? `${s.firstName||''} ${s.lastName||''}`.trim() : (p.studentName || '—'))}<div class="di-sub">${e(s ? (s.className||'') : '')}</div></td>
          <td>${e(p.category || p.feeHead || '—')}</td>
          <td>${money(p.amount)}</td>
          <td>${fdate(p.date)}</td>
          <td>${fdt(p.voidedAt)}<div class="di-sub">by ${e(p.voidedBy||'—')}</div><span class="di-pill${isRefund?' warn':''}">${isRefund?'Refund':'Correction'}</span></td>
          <td class="di-reason">${e(p.voidReason||'—')}${histOf(p).length ? `<div class="di-sub">${histOf(p).length} change(s) logged</div>`:''}</td>
          <td><div class="di-act">${isAdmin() ? `
            ${isRefund ? '' : `<button class="btn btn-primary btn-sm" onclick="diRestoreVoid('receipt','${e(p.id)}')">Restore</button>`}
            <button class="btn btn-ghost btn-sm" onclick="diEditVoidReason('receipt','${e(p.id)}')">Edit reason</button>` : isAdminOrPrincipal() ? `<button class="btn btn-ghost btn-sm" onclick="diEditVoidReason('receipt','${e(p.id)}')">Edit reason</button>` : ''}</div></td>
        </tr>`; }).join('')}</tbody></table></div>`;
  }

  /* ---------- Vouchers ---------- */
  const VKIND = { income:'Income', expense:'Expense', journal:'Journal' };
  function vAmount(v){
    if(v._kind === 'journal') return (v.lines||[]).reduce((s,l) => s + (Number(l.debit)||0), 0);
    return Number(v.amount) || 0;
  }
  function vParty(v){ return [v.party, v.description || v.narration].filter(Boolean).join(' — ') || v.category || ''; }
  function panelVouchers(){
    const rows = (DI.cache.vouchers || []).filter(v => match(`${v.voucherNo||''} ${VKIND[v._kind]} ${vParty(v)} ${v.voidReason||''} ${v.voidedBy||''}`))
      .sort((a,b) => String(b.voidedAt||'').localeCompare(String(a.voidedAt||'')));
    const note = `<div class="di-note">Vouchers are never erased — a cancelled voucher keeps its number (so there is no gap in the series) and is shown here with who cancelled it and why. An Admin can <b>Restore</b> a voucher voided by mistake (a reason is required and logged) or <b>Edit reason</b>. To change a voucher's amount or accounts, restore it or void it and post a corrected voucher.</div>`;
    if(!rows.length) return note + empty('No voided vouchers.');
    return note + `<div class="di-wrap"><table class="di-table"><thead><tr><th>Voucher No</th><th>Type</th><th>Date</th><th>Details</th><th>Amount</th><th>Voided</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${
      rows.map(v => `<tr>
        <td><b>${e(v.voucherNo||'—')}</b></td>
        <td>${VKIND[v._kind]}</td>
        <td>${fdate(v.date)}</td>
        <td>${e(vParty(v) || '—')}</td>
        <td>${money(vAmount(v))}</td>
        <td>${fdt(v.voidedAt)}<div class="di-sub">by ${e(v.voidedBy||'—')}</div></td>
        <td class="di-reason">${e(v.voidReason||'—')}${histOf(v).length ? `<div class="di-sub">${histOf(v).length} change(s) logged</div>`:''}</td>
        <td><div class="di-act">${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="diRestoreVoid('${v._kind}','${e(v.id)}')">Restore</button>` : ''}
          ${isAdminOrPrincipal() ? `<button class="btn btn-ghost btn-sm" onclick="diEditVoidReason('${v._kind}','${e(v.id)}')">Edit reason</button>` : ''}</div></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- Un-void / edit reason ---------- */
  function locate(kind, id){
    if(kind === 'receipt') return { rec: payments.find(x => x.id === id), save: () => storageSet(PAYMENTS_KEY, payments), tab:'receipts' };
    if(kind === 'income') return { rec: acctIncome.find(x => x.id === id), save: () => storageSet(ACCT_INCOME_KEY, acctIncome), tab:'vouchers' };
    if(kind === 'expense') return { rec: acctExpenses.find(x => x.id === id), save: () => storageSet(ACCT_EXPENSES_KEY, acctExpenses), tab:'vouchers' };
    if(kind === 'journal') return { rec: acctJournalVouchers.find(x => x.id === id), save: () => storageSet(ACCT_JOURNAL_KEY, acctJournalVouchers), tab:'vouchers' };
    return {};
  }
  function histOf(rec){ try{ const h = JSON.parse(rec.voidHistoryJson || '[]'); return Array.isArray(h) ? h : []; }catch(_){ return []; } }
  function logHistory(rec, action, note){
    rec.voidHistoryJson = JSON.stringify(histOf(rec).concat([{ action, note, by: currentUser.name, at: new Date().toISOString(), reasonWas: rec.voidReason || '' }]));
  }
  window.diRestoreVoid = async function(kind, id){
    if(!isAdmin()){ showToast('Only an Admin can restore a voided record.'); return; }
    const { rec, save, tab } = locate(kind, id);
    if(!rec || !rec.voided) return;
    if(kind === 'receipt' && rec.voidType === 'refund'){ showToast('A refund-type void cannot be restored here — its refund voucher was posted to Accounting.'); return; }
    const label = kind === 'receipt' ? 'receipt ' + receiptNo(rec) : 'voucher ' + (rec.voucherNo || '');
    const reason = await showPromptDialog(`Restore ${label}?\n\nIt will count again in all totals. Enter why it is being restored (logged on the record):`, { title:'Restore voided record', okText:'Restore' });
    if(reason === null) return;
    if(!reason.trim()){ showToast('A reason is required to restore.'); return; }
    // Re-apply what voiding rolled back on extra fees
    if(kind === 'receipt' && rec.category === 'extra' && rec.extraFeeId){
      try{
        if(typeof studentExtraFees !== 'undefined'){
          const fee = studentExtraFees.find(f => f.id === rec.extraFeeId);
          if(fee){
            fee.paidAmount = (Number(fee.paidAmount)||0) + (Number(rec.amount)||0);
            fee.paid = fee.paidAmount >= fee.amount && fee.amount > 0;
            await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
          }
        }
      }catch(err){ showToast('Could not re-apply the extra fee amount (' + err.message + ').'); return; }
    }
    logHistory(rec, 'restored', reason.trim());
    rec.voided = false;
    rec.restoredBy = currentUser.name; rec.restoredAt = new Date().toISOString(); rec.restoreReason = reason.trim();
    try{ await save(); }catch(err){ rec.voided = true; showToast('Could not save (' + err.message + ').'); return; }
    showToast('Restored.', 'burst');
    try{ renderDashboard(); }catch(_){}
    await diLoad(tab, true); renderDeletedItems();
  };
  window.diEditVoidReason = async function(kind, id){
    if(!isAdminOrPrincipal()){ showToast('Only an Admin or Principal can edit this.'); return; }
    const { rec, save, tab } = locate(kind, id);
    if(!rec || !rec.voided) return;
    const nv = await showPromptDialog('Edit the reason shown for this void. The previous wording is kept in the record\'s history.', { title:'Edit void reason', okText:'Save', defaultValue: rec.voidReason || '' });
    if(nv === null) return;
    if(!nv.trim()){ showToast('A reason cannot be empty.'); return; }
    if(nv.trim() === (rec.voidReason || '')) return;
    logHistory(rec, 'reason edited', nv.trim());
    rec.voidReason = nv.trim();
    try{ await save(); }catch(err){ showToast('Could not save (' + err.message + ').'); return; }
    showToast('Reason updated.', 'burst');
    await diLoad(tab, true); renderDeletedItems();
  };
})();
