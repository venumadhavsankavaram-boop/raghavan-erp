/* "Change Class / Section" (Promotion & Transfer). Replaces the old Change Section tab with one screen for both:
   - section only  -> just the section changes; fees are untouched.
   - class (mid-year) -> the student's money is dealt with explicitly, never silently:
       "Keep payments"   what he has paid this year is counted against the new class, so he pays only the difference;
       "Start fresh"     unpaid old-class fees are carried as "Previous Class Dues" and the new class fee is charged in full.
   Every change is written to a log (who, when, why, what money moved) and can be undone until fees are collected in the new class.
   Non-admin staff still submit for Admin approval through the existing Approvals tab. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v) : String(v == null ? '' : v));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => (typeof fmtMoney === 'function' ? fmtMoney(r2(n)) : '₹' + r2(n));
  const today = () => new Date().toISOString().slice(0, 10);
  const who = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || '';
  const isAdmin = () => typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Admin';
  const canEdit = () => { try{ return !!canSub('promo_section', 'promotransfer', 'edit'); }catch(e){ return isAdmin(); } };
  const curYear = () => (typeof currentAcademicYearValue !== 'undefined' && currentAcademicYearValue) || autoAcademicYear();
  const LOG_KEY = 'class-change-log';
  OBJECT_BACKED_KEYS[LOG_KEY] = '/api/kv/' + LOG_KEY;
  let log = [], logLoaded = false;
  async function loadLog(force){ if(logLoaded && !force) return; try{ const v = await storageGet(LOG_KEY, []); log = Array.isArray(v) ? v : []; logLoaded = true; }catch(e){ log = log || []; } }

  const st = { cls: '', q: '', pick: {}, mode: 'keep', date: '', reason: '' };

  /* ---------- money maths (all simulated, nothing saved) ---------- */
  const mineEligible = (s, oldCls) => payments.filter(p => p.studentId === s.id && !p.voided && p.classAtPayment === oldCls && fyhAyOfDate(p.date) === curYear());
  function withTags(s, fn){          // temporarily change class/tags, compute, always restore
    const keep = payments.filter(p => p.studentId === s.id).map(p => [p, p.classAtPayment]); const oldCls = s.className;
    try{ return fn(); } finally { s.className = oldCls; keep.forEach(([p, c]) => { p.classAtPayment = c; }); }
  }
  function simulate(s, newCls, mode){
    const oldCls = s.className;
    const now = computeStudentFinance(s); const oldClassOnly = fyhClassTotals(s);
    const res = { oldDue: r2(now.totals.receivable), oldClassDue: r2(oldClassOnly.receivable), paid: r2(oldClassOnly.collected), credit: 0 };
    return withTags(s, () => {
      payments.forEach(p => { if(p.studentId === s.id && !p.classAtPayment) p.classAtPayment = oldCls; });
      if(mode === 'keep') mineEligible(s, oldCls).forEach(p => { p.classAtPayment = newCls; });
      s.className = newCls;
      const f = computeStudentFinance(s);
      res.newFee = r2(Object.values(f.perCat).reduce((a, c) => a + (c.netPayable || 0), 0));
      res.credit = mode === 'keep' ? r2(Object.values(f.perCat).reduce((a, c) => a + Math.max((c.collected || 0) - (c.netPayable || 0), 0), 0)) : 0;
      res.newDue = r2(f.totals.receivable + (mode === 'fresh' ? res.oldClassDue : 0));
      return res;
    });
  }

  /* ---------- screen ---------- */
  const activeList = () => students.filter(s => isActive(s));
  function rowsFor(){
    const q = st.q.trim().toLowerCase();
    let list = activeList();
    if(st.cls) list = list.filter(s => s.className === st.cls);
    if(q) list = list.filter(s => ((s.lastName || '') + ' ' + (s.firstName || '') + ' ' + (s.admissionNo || s.admissionNumber || '')).toLowerCase().indexOf(q) >= 0);
    if(!st.cls && !q) return [];
    return (typeof compareByRoll === 'function' ? list.sort(compareByRoll) : list).slice(0, 80);
  }
  const pickOf = s => st.pick[s.id] || (st.pick[s.id] = { cls: s.className, sec: s.section });
  const changesNow = () => Object.keys(st.pick).map(id => { const s = students.find(x => x.id === id); const p = st.pick[id]; return s && p && (p.cls !== s.className || p.sec !== s.section) ? { s, p } : null; }).filter(Boolean);

  async function render(){
    await ensureDataLoaded('payments', loadPaymentsData);
    try{ await ensureDataLoaded('feeExtras', loadFeeExtras); }catch(e){}
    await fyhEnsure(); await loadLog();
    const body = $('promoTransferBody'); if(!body) return;
    if(!canEdit()){ body.innerHTML = '<div class="empty-state"><b>You don\'t have access to this section.</b></div>'; return; }
    if(!st.date) st.date = today();
    const rows = rowsFor();
    body.innerHTML = '<div id="ccWrap" style="max-width:1000px">' +
      '<p style="font-size:.85rem;color:var(--ink-soft);margin-bottom:12px;max-width:720px">Move students to another section (fees are not affected) or to another class in the middle of the year (you choose how the fees are treated). To record a student leaving the school use <b>Transfer Students (Leaving School)</b>; for year end use <b>Year-end Promotion</b>.</p>' +
      '<div class="form-grid" style="max-width:680px;margin-bottom:12px"><div class="f-field"><label>Class</label><select id="ccCls" onchange="ccSet(\'cls\',this.value)"><option value="">Pick a class…</option>' + CLASS_LEVELS.map(c => '<option value="' + esc(c) + '"' + (c === st.cls ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>' +
      '<div class="f-field"><label>…or search a student</label><input id="ccQ" type="search" placeholder="Name or admission no" value="' + esc(st.q) + '" oninput="ccSet(\'q\',this.value)"></div></div>' +
      (rows.length ? '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Now</th><th>Owes now</th><th>New class</th><th>New section</th></tr></thead><tbody>' + rows.map(s => {
        const p = pickOf(s); const f = computeStudentFinance(s); const ch = p.cls !== s.className || p.sec !== s.section;
        return '<tr' + (ch ? ' style="background:rgba(209,16,115,.06)"' : '') + '><td class="name-cell">' + esc((s.lastName || '') + ' ' + (s.firstName || '')) + '</td><td>' + esc(s.className) + ' · ' + esc(s.section) + '</td><td>' + (f.totals.receivable > 0 ? '<b style="color:var(--magenta)">' + money(f.totals.receivable) + '</b>' : '—') + '</td>' +
          '<td><select onchange="ccPick(\'' + esc(s.id) + '\',\'cls\',this.value)">' + CLASS_LEVELS.map(c => '<option value="' + esc(c) + '"' + (c === p.cls ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></td>' +
          '<td><select onchange="ccPick(\'' + esc(s.id) + '\',\'sec\',this.value)">' + SECTIONS.map(x => '<option' + (x === p.sec ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select></td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty-state"><b>' + (st.cls || st.q ? 'No active students found' : 'Pick a class or search a student to begin') + '</b></div>') +
      '<div id="ccPanel"></div><div id="ccHist"></div></div>';
    panel(); hist();
  }

  function panel(){
    const host = $('ccPanel'); if(!host) return;
    const ch = changesNow();
    if(!ch.length){ host.innerHTML = ''; return; }
    const cc = ch.filter(x => x.p.cls !== x.s.className);
    let h = '<div class="card" style="margin-top:14px;padding:16px;border:1.5px solid var(--border,#e3e0f0);border-radius:14px;background:#fff"><h3 style="margin:0 0 8px;color:var(--navy)">Review ' + ch.length + ' change(s)</h3>';
    if(cc.length){
      h += '<div style="margin:6px 0 10px"><b>How should the fees be treated for the class change?</b>' +
        '<label style="display:block;margin:6px 0"><input type="radio" name="ccMode" value="keep"' + (st.mode === 'keep' ? ' checked' : '') + ' onchange="ccSet(\'mode\',\'keep\')"> <b>Keep payments</b> — what he has paid this year counts toward the new class; he pays only the difference. <span style="color:var(--ink-soft)">(usual choice for a wrong placement or a move up/down)</span></label>' +
        '<label style="display:block;margin:6px 0"><input type="radio" name="ccMode" value="fresh"' + (st.mode === 'fresh' ? ' checked' : '') + ' onchange="ccSet(\'mode\',\'fresh\')"> <b>Start fresh</b> — unpaid old-class fees are carried as "Previous Class Dues" and the new class fee is charged in full.</label></div>' +
        '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Move</th><th>Paid so far</th><th>Owes now</th><th>New class fee</th><th>Will owe after</th></tr></thead><tbody>' + cc.map(({ s, p }) => {
          let sm = null; try{ sm = simulate(s, p.cls, st.mode); }catch(e){}
          return '<tr><td class="name-cell">' + esc((s.lastName || '') + ' ' + (s.firstName || '')) + '</td><td>' + esc(s.className) + ' → <b>' + esc(p.cls) + '</b></td>' + (sm ? '<td>' + money(sm.paid) + '</td><td>' + money(sm.oldDue) + '</td><td>' + money(sm.newFee) + '</td><td><b>' + money(sm.newDue) + '</b>' + (sm.credit > 0 ? '<div style="color:#8a5a00;font-size:.75rem">⚠ paid ' + money(sm.credit) + ' more than the new fee — refund or adjust it separately</div>' : '') + '</td>' : '<td colspan="4">—</td>') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="form-grid" style="max-width:720px;margin-top:10px"><div class="f-field"><label>Effective date</label><input type="date" id="ccDate" value="' + esc(st.date) + '" onchange="ccSet(\'date\',this.value,true)"></div>' +
        '<div class="f-field full"><label>Reason (required for a class change)</label><input id="ccReason" type="text" placeholder="e.g. Placed in the wrong class at admission" value="' + esc(st.reason) + '" oninput="ccSet(\'reason\',this.value,true)"></div></div>';
    }else{
      h += '<p style="color:var(--ink-soft);margin:4px 0 8px">Section changes only — fees and every other record stay as they are.</p>';
    }
    h += '<button class="btn btn-primary" style="margin-top:12px" onclick="ccApply()">' + (isAdmin() ? 'Apply changes' : 'Submit for Admin Approval') + '</button></div>';
    host.innerHTML = h;
  }

  function hist(){
    const host = $('ccHist'); if(!host) return;
    const rows = log.filter(x => !x.undone).slice(-25).reverse();
    if(!rows.length){ host.innerHTML = ''; return; }
    host.innerHTML = '<div style="margin-top:22px"><h3 style="color:var(--navy)">Recent class / section changes</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Student</th><th>Change</th><th>Fees</th><th>By</th><th></th></tr></thead><tbody>' + rows.map(x =>
      '<tr><td>' + esc(x.date) + '</td><td>' + esc(x.studentName) + '</td><td>' + (x.fromClass !== x.toClass ? esc(x.fromClass) + ' → <b>' + esc(x.toClass) + '</b>' : '') + (x.fromSection !== x.toSection ? ' ' + esc(x.fromSection) + ' → ' + esc(x.toSection) : '') + '</td><td>' +
      (x.fromClass === x.toClass ? '—' : x.mode === 'keep' ? 'Payments kept (' + x.moved + ' receipt(s))' : 'Fresh start' + (x.carried > 0 ? ', ' + money(x.carried) + ' carried' : '')) + '</td><td>' + esc(x.byUser) + '</td><td>' +
      (isAdmin() ? '<button type="button" class="btn btn-ghost btn-sm" onclick="ccUndo(\'' + esc(x.id) + '\')">Undo</button>' : '') + '</td></tr>').join('') + '</tbody></table></div></div>';
  }

  window.ccSet = function(k, v, soft){ st[k] = v; if(soft && (k === 'date' || k === 'reason')) return; if(k === 'cls') st.pick = {}; if(k === 'q'){ st.q = v; clearTimeout(window.__ccT); window.__ccT = setTimeout(async () => { await render(); const q = $('ccQ'); if(q){ q.focus(); try{ q.setSelectionRange(v.length, v.length); }catch(e){} } }, 250); return; } if(k === 'mode'){ panel(); return; } render(); };
  window.ccPick = function(id, k, v){ const s = students.find(x => x.id === id); if(!s) return; const p = pickOf(s); p[k] = v; render(); };

  /* ---------- applying ---------- */
  async function applyOne(c, opts){
    const s = students.find(x => x.id === c.studentId); if(!s) return null;
    const toClass = c.className || s.className, toSec = c.section || c.target || s.section;
    const e = { id: 'ccl_' + Date.now() + '_' + s.id + '_' + Math.random().toString(36).slice(2, 5), studentId: s.id, studentName: ((s.lastName || '') + ' ' + (s.firstName || '')).trim(), date: opts.date || today(), at: new Date().toISOString(), fromClass: s.className, fromSection: s.section, toClass, toSection: toSec, mode: toClass !== s.className ? opts.mode : '', moved: 0, retagged: [], carried: 0, extraId: '', reason: opts.reason || '', byUser: opts.byUser || who(), undone: false };
    if(toClass !== s.className){
      const oldCls = s.className;
      payments.forEach(p => { if(p.studentId === s.id && !p.classAtPayment){ p.classAtPayment = oldCls; opts.payChanged = true; } });
      if(opts.mode === 'keep'){
        mineEligible(s, oldCls).forEach(p => { p.classAtPayment = toClass; e.retagged.push(p.id); }); e.moved = e.retagged.length; if(e.moved) opts.payChanged = true;
      }else{
        const due = r2(fyhClassTotals(s).receivable);
        if(due > 0.004){
          const x = { id: 'sef_' + Date.now() + '_' + s.id + '_c' + Math.random().toString(36).slice(2, 5), studentId: s.id, name: 'Previous Class Dues — ' + oldCls + ' (mid-year)', amount: due, paid: false, date: today(), kind: 'carry' };
          studentExtraFees.push(x); e.carried = due; e.extraId = x.id; opts.extraChanged = true;
        }
      }
    }
    s.className = toClass; s.section = toSec;
    return e;
  }
  window.executeClassSectionChanges = async function(changes, opts){
    opts = Object.assign({ mode: 'keep', date: today(), reason: '', payChanged: false, extraChanged: false }, opts || {});
    await ensureDataLoaded('payments', loadPaymentsData); try{ await ensureDataLoaded('feeExtras', loadFeeExtras); }catch(e){} await loadLog(true);
    const made = []; for(const c of changes){ const e = await applyOne(c, opts); if(e) made.push(e); }
    log = log.concat(made);
    await persist();
    if(opts.payChanged) await storageSet(PAYMENTS_KEY, payments);
    if(opts.extraChanged){
      await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      try{ await reloadDataset('feeExtras', loadFeeExtras);   // a reload can drop a fresh line; put back any that is missing
        const miss = made.filter(e => e.extraId && !studentExtraFees.some(x => x.id === e.extraId));
        if(miss.length){ miss.forEach(e => { studentExtraFees.push({ id: e.extraId, studentId: e.studentId, name: 'Previous Class Dues — ' + e.fromClass + ' (mid-year)', amount: e.carried, paid: false, date: today(), kind: 'carry' }); }); await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees); }
      }catch(e){}
    }
    await storageSet(LOG_KEY, log);
    try{ renderDashboard(); }catch(e){}
    return made;
  };
  const busy = { v: false };
  window.ccApply = async function(){
    if(busy.v) return;
    const ch = changesNow(); if(!ch.length){ showToast('Choose a new class or section for at least one student.'); return; }
    const cc = ch.filter(x => x.p.cls !== x.s.className);
    const reason = (st.reason || '').trim();
    if(cc.length && !reason){ showToast('Enter a reason for the class change.'); const r = $('ccReason'); if(r) r.focus(); return; }
    const changes = ch.map(x => ({ studentId: x.s.id, target: x.p.sec, section: x.p.sec, className: x.p.cls !== x.s.className ? x.p.cls : undefined }));
    const opts = { mode: st.mode, date: st.date || today(), reason };
    if(!isAdmin()){
      if(!await showConfirmDialog('Submit this change for ' + ch.length + ' student(s) to Admin for approval?')) return;
      pendingApprovals.push({ id: 'appr_' + Date.now(), type: 'section', requestedBy: currentUser.name, requestedByRole: currentUser.role, requestedByUserId: currentUser.id, requestDate: today(), explanation: reason || 'Section change', payload: { changes, opts }, status: 'Pending' });
      await storageSet(PENDING_APPROVALS_KEY, pendingApprovals); st.pick = {}; st.reason = ''; await render(); showToast('Submitted for Admin approval.', 'burst'); return;
    }
    const msg = cc.length ? 'Apply ' + ch.length + ' change(s)? ' + cc.length + ' class change(s) with fee treatment "' + (st.mode === 'keep' ? 'Keep payments' : 'Start fresh') + '". This is recorded and can be undone until fees are collected in the new class.' : 'Move ' + ch.length + ' student(s) to their new section? Fees and other records are not affected.';
    if(!await showConfirmDialog(msg)) return;
    busy.v = true;
    try{ const made = await executeClassSectionChanges(changes, opts); st.pick = {}; st.reason = ''; await render(); showToast(made.length + ' change(s) applied.', 'burst'); }
    finally { busy.v = false; }
  };

  window.ccUndo = async function(id){
    await ensureDataLoaded('payments', loadPaymentsData); try{ await ensureDataLoaded('feeExtras', loadFeeExtras); }catch(e){} await loadLog(true);
    const e = log.find(x => x.id === id); if(!e || e.undone) return;
    const s = students.find(x => x.id === e.studentId); if(!s){ showToast('Student not found.'); return; }
    if(s.className !== e.toClass || s.section !== e.toSection){ showToast('This student has moved again since this change, so it cannot be undone here.'); return; }
    const classChanged = e.fromClass !== e.toClass;
    if(classChanged){
      const newer = payments.some(p => p.studentId === s.id && !p.voided && p.classAtPayment === e.toClass && e.retagged.indexOf(p.id) < 0 && String(p.date || '') >= String(e.date || ''));
      if(newer){ showToast('Fees were already collected in ' + e.toClass + ' after this change, so it cannot be undone safely.'); return; }
      const x = e.extraId ? studentExtraFees.find(z => z.id === e.extraId) : null;
      if(x && (x.paid || Number(x.paidAmount) > 0)){ showToast('Part of the carried dues is already paid, so this cannot be undone safely.'); return; }
    }
    if(!await showConfirmDialog('Undo this change for ' + e.studentName + '? They go back to ' + e.fromClass + ' · ' + e.fromSection + (classChanged ? ' and the fee treatment is reversed.' : '.'))) return;
    if(classChanged){
      payments.forEach(p => { if(e.retagged.indexOf(p.id) >= 0) p.classAtPayment = e.fromClass; });
      const i = e.extraId ? studentExtraFees.findIndex(z => z.id === e.extraId) : -1; if(i >= 0) studentExtraFees.splice(i, 1);
    }
    s.className = e.fromClass; s.section = e.fromSection; e.undone = true;
    await persist();
    if(classChanged){ await storageSet(PAYMENTS_KEY, payments); await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees); }
    await storageSet(LOG_KEY, log);
    showToast('Undone. ' + e.studentName + ' is back in ' + e.fromClass + '.', 'burst');
    await render();
  };

  /* ---------- hooks ---------- */
  const prevBody = renderPromoTransferBody;
  renderPromoTransferBody = async function(){
    if(promoTransferTab !== 'section') return prevBody.apply(this, arguments);
    st.pick = {}; await render();
  };
  const prevExec = executeChangeSection;
  executeChangeSection = async function(changes){        // approved requests
    if(!changes.some(c => c.className)) return prevExec.apply(this, arguments);
    const a = (typeof pendingApprovals !== 'undefined') ? pendingApprovals.find(x => x.type === 'section' && x.payload && x.payload.changes === changes) : null;
    const o = (a && a.payload.opts) || {};
    await executeClassSectionChanges(changes, { mode: o.mode || 'keep', date: o.date, reason: (a && a.explanation) || o.reason, byUser: a ? (a.requestedBy + ' (approved by ' + who() + ')') : who() });
    try{ renderPromoTransferBody(); }catch(e){}
  };
  const prevSummary = approvalDetailSummary;
  approvalDetailSummary = function(a){
    if(a && a.type === 'section' && a.payload && a.payload.changes && a.payload.changes.some(c => c.className)){
      const mode = (a.payload.opts && a.payload.opts.mode) === 'fresh' ? 'Start fresh' : 'Keep payments';
      return a.payload.changes.map(c => { const s = students.find(x => x.id === c.studentId); return s ? esc((s.lastName || '') + ' ' + (s.firstName || '')) + ': ' + esc(s.className) + ' ' + esc(s.section) + ' → ' + esc(c.className || s.className) + ' ' + esc(c.section || s.section) : ''; }).filter(Boolean).join('<br>') + '<div style="color:#8a5a00;margin-top:3px">Fees: ' + mode + '</div>';
    }
    return prevSummary.apply(this, arguments);
  };
  const tab = $('pttab-section'); if(tab) tab.textContent = 'Change Class / Section';
  document.addEventListener('DOMContentLoaded', () => { const t = $('pttab-section'); if(t) t.textContent = 'Change Class / Section'; });
})();
