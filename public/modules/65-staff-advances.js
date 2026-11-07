/* Staff salary advances - given now, recovered automatically from the coming months' pay.

   HOW IT WORKS
   - An advance is kept on the staff member's own record (staff.advances): amount, date, reason, how it was paid, the
     monthly instalment and the first month to recover from (default: next month).
   - Each month's payroll (computeStaffPayroll in module 17) asks advancePayrollPart() what to take. It takes the instalment
     (or what is left if less) for every active advance whose start month has come, oldest first.
   - What was already recovered is counted only from APPROVED payroll months before the month being worked on, so a draft,
     a re-opened month or a recalculation can never double-count. Approving a month locks the recovered amount on that record.
   - Recovery never takes net pay below zero: if salary is short that month, the balance simply carries to the next month.
   - The "Advance Rec." box on the Payroll row can be changed for one month (skip, take less, take more); that month only.
   - A staff member who leaves with a balance shows in the register, where it can be settled/closed.  */

function advMonthNext(monthStr){
  const [y, m] = String(monthStr || '').split('-').map(Number);
  const d = new Date(y || new Date().getFullYear(), (m || (new Date().getMonth() + 1)), 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function advRecoveredIn(advId, staffId, beforeMonth){
  // Only Approved months count. beforeMonth = exclusive upper bound; omit for "all months".
  let n = 0;
  (typeof staffPayrollRecords !== 'undefined' ? staffPayrollRecords : []).forEach(r => {
    if(r.staffId !== staffId || r.status !== 'Approved') return;
    if(beforeMonth && !(String(r.month) < String(beforeMonth))) return;
    (r.advanceBreakdown || []).forEach(b => { if(b.id === advId) n += Number(b.amount) || 0; });
  });
  return Math.round(n * 100) / 100;
}
function advOutstanding(adv, staffId, beforeMonth){
  return Math.max(0, Math.round(((Number(adv.amount) || 0) - advRecoveredIn(adv.id, staffId, beforeMonth)) * 100) / 100);
}
function advActiveList(st){
  return ((st && st.advances) || []).filter(a => a && a.status === 'Active').sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
/* manualAmount: undefined = automatic. cap = most that can be taken this month without making net pay negative. */
function advancePayrollPart(staffId, monthStr, manualAmount, cap){
  const st = (typeof staffList !== 'undefined' ? staffList : []).find(x => x.id === staffId);
  const out = { amount: 0, breakdown: [], manual: false, outstanding: 0 };
  if(!st) return out;
  const rows = advActiveList(st).map(a => {
    const bal = advOutstanding(a, staffId, monthStr);
    const started = !a.startMonth || String(monthStr) >= String(a.startMonth);
    const sched = !started ? 0 : (Number(a.instalment) > 0 ? Math.min(Number(a.instalment), bal) : bal);
    return { id: a.id, bal, sched };
  }).filter(r => r.bal > 0.004);
  out.outstanding = Math.round(rows.reduce((s, r) => s + r.bal, 0) * 100) / 100;
  if(!rows.length) return out;
  const room = Math.max(0, Number(cap) || 0);
  let want, key;
  if(manualAmount !== undefined && manualAmount !== null && manualAmount !== ''){
    want = Math.min(Math.max(0, Number(manualAmount) || 0), out.outstanding, room); out.manual = true; key = 'bal';
  }else{
    want = Math.min(rows.reduce((s, r) => s + r.sched, 0), room); key = 'sched';
  }
  want = Math.round(want * 100) / 100;
  let left = want;
  rows.forEach(r => {
    if(left <= 0.004) return;
    const take = Math.round(Math.min(left, r[key]) * 100) / 100;
    if(take > 0){ out.breakdown.push({ id: r.id, amount: take }); left = Math.round((left - take) * 100) / 100; }
  });
  out.amount = Math.round(out.breakdown.reduce((s, b) => s + b.amount, 0) * 100) / 100;
  return out;
}

(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = n => { try{ return fmtMoney(n); }catch(e){ return '₹' + Number(n || 0).toLocaleString('en-IN'); } };
  const monthLabel = m => { try{ return new Date(m + '-01').toLocaleString('en-IN', { month:'short', year:'numeric' }); }catch(e){ return m; } };
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const canEdit = () => { try{ return getStaffSubpageAccess(currentUser.role, 'staff_payroll', 'edit'); }catch(e){ return false; } };

  function css(){
    if($('advCss')) return;
    const s = document.createElement('style'); s.id = 'advCss';
    s.textContent = `
    .adv-card{margin:0 0 18px;border:1.5px solid var(--border,#e3e0f0);border-radius:16px;background:#fff;padding:16px}
    .adv-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .adv-top h4{margin:0}.adv-sub{font-size:.78rem;color:var(--ink-soft,#5b5a73);margin:4px 0 0}
    .adv-tbl{width:100%;border-collapse:collapse;margin-top:12px;font-size:.84rem}
    .adv-tbl th{text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft,#5b5a73);padding:6px 8px;border-bottom:1.5px solid var(--border,#e3e0f0)}
    .adv-tbl td{padding:8px;border-bottom:1px solid #eef1f7;vertical-align:top}
    .adv-pill{display:inline-block;border-radius:999px;padding:2px 10px;font-size:.68rem;font-weight:700}
    .adv-pill.a{background:rgba(184,98,27,.13);color:#b8621b}.adv-pill.c{background:rgba(31,122,77,.13);color:#1f7a4d}.adv-pill.x{background:#eee;color:#666}
    .adv-warn{color:#b3261e;font-size:.76rem}
    .adv-form label{display:block;font-weight:600;font-size:.82rem;margin:10px 0 4px}
    .adv-form input,.adv-form select{width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid var(--border,#e3e0f0);border-radius:12px;font:inherit;background:#fff}
    .adv-form input:focus,.adv-form select:focus{outline:none;border-color:var(--magenta,#c2185b)}
    #advFormBody h3,#advFormBody > .adv-sub{padding-right:34px}
    .adv-card .table-wrap{border:0;box-shadow:none;margin-top:6px;overflow-x:auto}
    .adv-prev{margin-top:12px;background:#f3f0fb;border-radius:12px;padding:10px 12px;font-size:.84rem}
    .adv-err{color:#b3261e;font-size:.84rem;min-height:1.1em;margin-top:8px}
    `;
    document.head.appendChild(s);
  }

  function rowsOf(st){ return (st.advances || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))); }

  function ledgerHtml(){
    const all = [];
    (staffList || []).forEach(st => (st.advances || []).forEach(a => all.push({ st, a })));
    all.sort((x, y) => String(y.a.date).localeCompare(String(x.a.date)));
    const live = all.filter(x => x.a.status === 'Active');
    const owed = Math.round(live.reduce((s, x) => s + advOutstanding(x.a, x.st.id), 0) * 100) / 100;
    const ed = canEdit();
    const body = all.map(({ st, a }) => {
      const rec = advRecoveredIn(a.id, st.id); const bal = advOutstanding(a, st.id);
      const cleared = a.status === 'Active' && bal <= 0.004;
      const state = a.status === 'Closed' ? '<span class="adv-pill x">Closed</span>' : (cleared ? '<span class="adv-pill c">Cleared</span>' : '<span class="adv-pill a">Recovering</span>');
      const inactive = a.status === 'Active' && !cleared && typeof staffIsActive === 'function' && !staffIsActive(st);
      return `<tr>
        <td><b>${esc(st.firstName)} ${esc(st.lastName)}</b>${inactive ? '<div class="adv-warn">Left school - settle the balance</div>' : ''}</td>
        <td>${esc(a.date)}${a.reason ? '<div class="adv-sub">' + esc(a.reason) + '</div>' : ''}</td>
        <td>${money(a.amount)}</td>
        <td>${a.instalment > 0 ? money(a.instalment) + '/month' : 'All at once'}${a.startMonth ? '<div class="adv-sub">from ' + monthLabel(a.startMonth) + '</div>' : ''}</td>
        <td>${money(rec)}</td><td><b>${money(bal)}</b></td><td>${state}</td>
        <td>${ed && a.status === 'Active' && !cleared ? `<button class="btn-edit-text" onclick="advOpenForm('${st.id}','${a.id}')">Change plan</button> <button class="btn-edit-text" style="color:var(--magenta);" onclick="advClose('${st.id}','${a.id}')">${rec > 0 || bal < a.amount ? 'Close / settle' : 'Cancel'}</button>` : ''}</td>
      </tr>`;
    }).join('');
    return `<div class="adv-card" id="advCard">
      <div class="adv-top"><div><h4>Salary advances</h4><p class="adv-sub">${live.length ? `${live.length} running · <b>${money(owed)}</b> still to recover from staff. Each month's instalment is taken in Payroll automatically.` : 'No advance is running. Give one here and it is recovered from the coming months automatically.'}</p></div>
      ${ed ? `<button class="btn btn-primary btn-sm" onclick="advOpenForm()">+ Give advance</button>` : ''}</div>
      ${all.length ? `<div class="table-wrap"><table class="adv-tbl" style="min-width:720px;"><thead><tr><th>Staff</th><th>Given</th><th>Amount</th><th>Recovery</th><th>Recovered</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody></table></div>` : ''}
    </div>`;
  }

  function inject(body){
    if(!body) return; css();
    const old = body.querySelector('#advCard'); if(old) old.remove();
    const anchor = body.querySelector('.pay-summary-box'); if(!anchor) return;
    anchor.insertAdjacentHTML('afterend', ledgerHtml());
  }
  function redraw(){ try{ if(typeof renderStaffBody === 'function') renderStaffBody(); }catch(e){} }

  /* ---------- Give / change an advance ---------- */
  let editing = null;
  function overlay(){
    let ov = $('advOverlay');
    if(!ov){
      ov = document.createElement('div'); ov.id = 'advOverlay'; ov.className = 'modal-overlay';
      ov.innerHTML = '<div class="modal" style="max-width:520px;"><div class="modal-inner"><button class="modal-close" onclick="advCloseForm()">&times;</button><div id="advFormBody"></div></div></div>';
      document.body.appendChild(ov);
    }
    return ov;
  }
  function monthOptions(sel){
    const out = []; const now = new Date();
    for(let i = -1; i < 14; i++){
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      out.push(`<option value="${v}" ${v === sel ? 'selected' : ''}>${d.toLocaleString('en-IN', { month:'long', year:'numeric' })}</option>`);
    }
    return out.join('');
  }
  window.advOpenForm = function(staffId, advId){
    if(!canEdit()){ showToast("You don't have permission to change payroll."); return; }
    css(); const ov = overlay();
    let a = null, st = null;
    if(staffId && advId){ st = staffList.find(x => x.id === staffId); a = st && (st.advances || []).find(x => x.id === advId); }
    editing = a ? { staffId, advId } : null;
    const startDef = a ? a.startMonth : advMonthNext((new Date()).getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
    const lockedAmt = a && advRecoveredIn(a.id, staffId) > 0;
    const staffOpts = staffList.filter(s => typeof staffIsActive !== 'function' || staffIsActive(s)).sort((p, q) => (p.firstName + p.lastName).localeCompare(q.firstName + q.lastName))
      .map(s => `<option value="${s.id}" ${st && st.id === s.id ? 'selected' : ''}>${esc(s.firstName)} ${esc(s.lastName)}${s.department ? ' - ' + esc(s.department) : ''}</option>`).join('');
    $('advFormBody').innerHTML = `<h3 style="margin:0 0 4px;">${a ? 'Change recovery plan' : 'Give a salary advance'}</h3>
      <p class="adv-sub">${a ? 'Amount and date stay as given; you can change how fast it is recovered.' : 'The money is recovered from the coming months\' salary, a little each month.'}</p>
      <div class="adv-form">
        <label>Staff member</label><select id="advStaff" ${a ? 'disabled' : ''} onchange="advPreview()"><option value="">Select staff</option>${staffOpts}</select>
        <label>Advance amount (₹)</label><input type="number" id="advAmt" min="1" step="1" value="${a ? a.amount : ''}" ${lockedAmt ? 'disabled' : ''} oninput="advPreview()">
        <label>Date given</label><input type="date" id="advDate" value="${a ? esc(a.date) : today()}" ${a ? 'disabled' : ''}>
        <label>Reason (optional)</label><input type="text" id="advReason" value="${a ? esc(a.reason || '') : ''}" placeholder="e.g. medical, festival, rent">
        <label>Paid by</label><select id="advMode" ${a ? 'disabled' : ''}>${['Cash', 'Bank transfer', 'UPI'].map(m => `<option ${a && a.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <label>Recover over how many months?</label><select id="advMonths" onchange="advPreview()">${[1,2,3,4,5,6,8,10,12].map(n => `<option value="${n}" ${a && a.instalment > 0 && Math.round(a.amount / a.instalment) === n ? 'selected' : (!a && n === 3 ? 'selected' : '')}>${n} month${n > 1 ? 's' : ''}</option>`).join('')}</select>
        <label>Start recovering from</label><select id="advStart" onchange="advPreview()">${monthOptions(startDef)}</select>
        <div class="adv-prev" id="advPrev"></div>
        <div class="adv-err" id="advErr"></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="advCloseForm()">Cancel</button><button type="button" class="btn btn-primary" onclick="advSave()">${a ? 'Save plan' : 'Give advance'}</button></div>
      </div>`;
    ov.classList.add('open'); advPreview();
  };
  window.advCloseForm = function(){ const ov = $('advOverlay'); if(ov) ov.classList.remove('open'); };
  window.advPreview = function(){
    const amt = Number($('advAmt') && $('advAmt').value) || 0; const n = Number($('advMonths') && $('advMonths').value) || 1; const start = $('advStart') && $('advStart').value;
    const p = $('advPrev'); if(!p) return;
    if(!amt){ p.textContent = 'Enter the amount to see the plan.'; return; }
    const inst = Math.ceil(amt / n);
    const last = (() => { let m = start; for(let i = 1; i < n; i++) m = advMonthNext(m); return m; })();
    const sid = $('advStaff') && $('advStaff').value; const st = sid && staffList.find(x => x.id === sid);
    let extra = '';
    if(st){
      const sal = Number(st.salary) || 0;
      if(sal && amt > sal) extra += `<div class="adv-warn">This is more than one month's salary (${money(sal)}).</div>`;
      if(sal && inst > sal * 0.5) extra += `<div class="adv-warn">The monthly recovery is more than half the salary - consider more months.</div>`;
      const other = advActiveList(st).filter(x => !(editing && x.id === editing.advId)).reduce((s, x) => s + advOutstanding(x, st.id), 0);
      if(other > 0) extra += `<div class="adv-warn">This staff member already owes ${money(other)} from an earlier advance; both are recovered together.</div>`;
    }
    p.innerHTML = `<b>${money(inst)}</b> a month from <b>${monthLabel(start)}</b>${n > 1 ? `, finishing about <b>${monthLabel(last)}</b>` : ''}.` + extra;
  };
  window.advSave = async function(){
    const err = $('advErr'); err.textContent = '';
    const amt = Number($('advAmt').value) || 0; const n = Number($('advMonths').value) || 1; const start = $('advStart').value;
    if(editing){
      const st = staffList.find(x => x.id === editing.staffId); const a = st && (st.advances || []).find(x => x.id === editing.advId); if(!a) return;
      if(!lockedOk(a, st, amt)) return;
      if(!advRecoveredIn(a.id, st.id)) a.amount = amt || a.amount;
      a.instalment = Math.ceil((a.amount) / n); a.startMonth = start; a.reason = $('advReason').value.trim();
      await persist(); window.advCloseForm(); showToast('Recovery plan saved.', 'burst'); redraw(); return;
    }
    const sid = $('advStaff').value; const st = staffList.find(x => x.id === sid);
    if(!st){ err.textContent = 'Choose the staff member.'; return; }
    if(!(amt > 0)){ err.textContent = 'Enter the advance amount.'; return; }
    if(!$('advDate').value){ err.textContent = 'Choose the date given.'; return; }
    const sal = Number(st.salary) || 0;
    if(sal && amt > sal && !await showConfirmDialog(`This advance (${money(amt)}) is more than ${esc(st.firstName)}'s monthly salary (${money(sal)}). Give it anyway?`)) return;
    (st.advances = st.advances || []).push({
      id: 'adv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: $('advDate').value, amount: amt,
      reason: $('advReason').value.trim(), mode: $('advMode').value, instalment: Math.ceil(amt / n), startMonth: start,
      status: 'Active', givenBy: (currentUser && currentUser.name) || '', createdAt: new Date().toISOString()
    });
    await persist(); window.advCloseForm(); showToast('Advance recorded - it will be recovered from payroll.', 'burst'); redraw();
  };
  function lockedOk(a, st, amt){
    const rec = advRecoveredIn(a.id, st.id);
    if(rec > 0 && amt && amt !== a.amount){ $('advErr').textContent = 'Part of this advance is already recovered, so the amount cannot change.'; return false; }
    return true;
  }
  window.advClose = async function(staffId, advId){
    if(!canEdit()){ showToast("You don't have permission to change payroll."); return; }
    const st = staffList.find(x => x.id === staffId); const a = st && (st.advances || []).find(x => x.id === advId); if(!a) return;
    const rec = advRecoveredIn(a.id, st.id); const bal = advOutstanding(a, st.id);
    if(rec <= 0){
      if(!await showConfirmDialog(`Cancel this ${money(a.amount)} advance for ${st.firstName}? Nothing has been recovered yet, so it will be removed.`)) return;
      st.advances = st.advances.filter(x => x.id !== a.id);
    }else{
      if(!await showConfirmDialog(`Close this advance? ${money(rec)} is recovered and ${money(bal)} is still owed. Recovery stops now - use this when the balance is settled in cash or written off.`)) return;
      a.status = 'Closed'; a.closedOn = today(); a.closedBalance = bal; a.closedBy = (currentUser && currentUser.name) || '';
    }
    await persist(); showToast('Done.'); redraw();
  };
  async function persist(){ try{ await storageSet(STAFF_KEY, staffList); }catch(e){ showToast('Could not save - try again.'); } }

  /* ---------- hooks ---------- */
  const origTab = window.renderStaffPayrollTab;
  if(typeof origTab === 'function'){
    window.renderStaffPayrollTab = function(body){ const r = origTab.apply(this, arguments); try{ inject(body); }catch(e){} return r; };
  }
  const origRows = window.staffPayrollReportRows;
  if(typeof origRows === 'function'){
    window.staffPayrollReportRows = function(){
      const rows = origRows.apply(this, arguments);
      try{ const act = staffList.filter(staffIsActive); rows.forEach((r, i) => { const p = act[i] && staffPayrollRowData(act[i].id, staffPayrollMonth).preview; r['Advance Recovery'] = p ? (Number(p.advanceDeduction) || 0) : 0; }); }catch(e){}
      return rows;
    };
  }
})();
