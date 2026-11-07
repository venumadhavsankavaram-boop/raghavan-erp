/* Year-end money safety: promotion, transfer, fee plan for next year.
   Everything here only WRAPS the existing screens; no existing money rule is removed.

   1. Unpaid fees never vanish. Any promotion that does not say what to do with the unpaid class fees (the whole-class
      "Promotions" screen never did) now carries them forward as "Previous Year Dues - <class> (<year>)". Writing the money off
      is possible only on Promotion & Transfer, needs a typed reason, and the reason is kept in the student's year record.
   2. A student can be promoted once per academic year. A double click, a second tab or a repeated request is skipped (before this,
      the second run carried the NEW class's fee as an "old balance" and the student owed twice). One run at a time.
   3. A student who leaves (Transfer) has the unpaid class fees frozen as dues (they used to stay invisible), and Fee Defaulters
      lists left-school students who still owe, so the money is chased.
   4. Quick pay on the fee ledger fills old dues first.
   5. "Next year's fees": fees for the coming year are prepared on the Fee Structure page without touching what current students
      owe, and are applied when the new academic year is made current (after promotion). Fee structure has no year of its own, so
      before this, changing fees before promotion changed every student's old-year balance.
   6. "Promoted by mistake?" lists this year's promotions with a safe Undo (blocked once money has moved on the new class). */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = n => { try{ return fmtMoney(n); }catch(e){ return '₹' + Number(n || 0).toLocaleString('en-IN'); } };
  const todayISO = () => { try{ return localISODate(); }catch(e){ return new Date().toISOString().slice(0, 10); } };
  const curYear = () => (typeof currentAcademicYearValue !== 'undefined' && currentAcademicYearValue) || autoAcademicYear();
  const who = () => (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || '';
  const CF_NAMES = () => Object.values(CARRYFORWARD_LABELS);

  /* The dashboard reloads the extra-fee list from the server whenever it redraws (and promotion redraws it). A reload that
     lands in the middle of a promotion can drop a just-added dues line from the screen's copy, and a later save from that copy
     can then delete it. So: wait for any reload to finish, and AFTER promoting, check every carried due really exists - re-add
     and save any that are missing, then confirm once more from the server. */
  async function settleExtras(){ try{ await ensureDataLoaded('feeExtras', loadFeeExtras); }catch(e){} }
  async function verifyCarries(expect){
    if(!expect.length) return 0;
    await settleExtras();
    const fix = () => {
      let added = 0;
      expect.forEach(x => {
        const hit = studentExtraFees.find(e => e.studentId === x.studentId && Math.abs((Number(e.amount) || 0) - x.amount) < 0.005 && (e.kind === 'carry' || CF_NAMES().indexOf(e.name) >= 0 || String(e.name).indexOf(CARRYFORWARD_LABELS.previous) === 0));
        if(hit){ if(!hit.kind){ hit.kind = 'carry'; hit.name = x.name; added += 0.001; } return; }
        studentExtraFees.push({ id: 'sef_' + Date.now() + '_' + x.studentId + '_' + Math.random().toString(36).slice(2, 6), studentId: x.studentId, name: x.name, amount: x.amount, paid: false, date: todayISO(), kind: 'carry' });
        added++;
      });
      return added;
    };
    let added = fix();
    if(added > 0) await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    // final proof from the server's own copy
    await reloadDataset('feeExtras', loadFeeExtras);
    const again = fix();
    if(again >= 1){ await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees); await reloadDataset('feeExtras', loadFeeExtras); }
    return Math.floor(added + again);
  }

  /* ---------- 0: the current academic year could not be saved ----------
     It is stored as a bare text value ("2027-28"), which the server refuses (400 "Malformed request"): "Set as current" showed
     success but the year went back to the date-based default on the next sign-in. It is now saved as { value: "2027-28" } (the
     server already reads that shape) and unwrapped when read, so a year already stored the old way still reads fine. */
  const AY_KEY = 'current-academic-year';
  const _ssAy = storageSet;
  storageSet = async function(key, value){
    if(key === AY_KEY && typeof value === 'string') value = { value: value };
    return _ssAy.call(this, key, value);
  };
  const _sgAy = storageGet;
  storageGet = async function(key, fallback){
    const v = await _sgAy.apply(this, arguments);
    if(key === AY_KEY && v && typeof v === 'object') return v.value || fallback;
    return v;
  };

  /* ---------- 1 + 2: promotion engine guard ---------- */
  let promoBusy = false;
  const _prevPromote = executePromotions;
  executePromotions = async function(payload){
    const none = { graduatedCount: 0, promotedCount: 0, carriedCount: 0, skippedCount: 0 };
    if(promoBusy){ showToast('A promotion is already being applied - please wait a moment.'); return none; }
    promoBusy = true;
    try{
      await ensureDataLoaded('payments', loadPaymentsData);
      await fyhEnsure(true);
      const year = curYear();
      const list = (payload || []).filter(Boolean);
      // once per academic year
      const done = new Set(feeYearHistory.filter(h => h.academicYear === year && (h.outcome === 'Promoted' || h.outcome === 'Graduated')).map(h => h.studentId));
      const todo = list.filter(p => !done.has(p.studentId));
      const skipped = list.length - todo.length;
      if(skipped) showToast(skipped + ' student(s) were already promoted in ' + year + ' and were skipped. If one was a mistake, use "Promoted by mistake?" on the Promotions page.');
      if(!todo.length) return Object.assign({}, none, { skippedCount: skipped });
      // unpaid money is carried unless somebody explicitly chose otherwise
      todo.forEach(p => { if(p.carryForwardType === undefined || p.carryForwardType === null) p.carryForwardType = 'previous'; });
      // an explicit "don't carry" on unpaid fees is a write-off: needs a reason
      const wo = todo.filter(p => { if(p.carryForwardType !== '') return false; const s = students.find(x => x.id === p.studentId); try{ return s && fyhClassTotals(s).receivable > 0.004; }catch(e){ return false; } });
      let reason = '';
      if(wo.length){
        const tot = wo.reduce((n, p) => n + fyhClassTotals(students.find(x => x.id === p.studentId)).receivable, 0);
        reason = await showPromptDialog(wo.length + ' student(s) have unpaid fees of ' + money(tot) + ' and "Write off" was chosen. This money will NOT be asked from the parents again.\n\nType the reason (it is kept on record), or Cancel and choose "Previous Year Dues" to carry it forward.', { title: 'Write off unpaid fees', okText: 'Write off', placeholder: 'Reason (required)' });
        if(reason === null || !String(reason).trim()){ showToast('Nothing was changed. Choose "Previous Year Dues" to carry the balance, or give a reason to write it off.'); return none; }
        reason = String(reason).trim();
      }
      await settleExtras();
      const h0 = feeYearHistory.length;
      const result = await _prevPromote.call(this, todo);
      // finishing touches: write-off reasons, labels on any carried due the base engine did not name
      let hCh = false, eCh = false;
      const newH = feeYearHistory.slice(h0);
      newH.forEach(h => {
        const p = todo.find(x => x.studentId === h.studentId);
        if(p && p.carryForwardType === '' && Number(h.balance) > 0.004){ h.carried = 0; h.carriedAs = 'Written off: ' + reason + ' (by ' + who() + ')'; hCh = true; }
      });
      if(hCh) await storageSet(FEE_YEAR_HISTORY_KEY, feeYearHistory);
      const expect = newH.filter(h => Number(h.carried) > 0).map(h => {
        const p = todo.find(x => x.studentId === h.studentId) || {};
        return { studentId: h.studentId, amount: r2(h.carried), name: (CARRYFORWARD_LABELS[p.carryForwardType] || CARRYFORWARD_LABELS.previous) + ' — ' + h.className + ' (' + h.academicYear + ')' };
      });
      const repaired = await verifyCarries(expect);
      if(repaired > 0) showToast(repaired + ' carried due(s) had to be re-saved - please check Manage Fee for those students.');
      return Object.assign({ skippedCount: skipped }, result);
    }finally{ promoBusy = false; }
  };

  /* relabel the choice so nobody writes money off by accident */
  function relabelCarry(){
    document.querySelectorAll('select.pt-carryforward-type option[value=""]').forEach(o => { if(o.textContent !== 'Write off (reason needed)') o.textContent = 'Write off (reason needed)'; });
  }
  const _prevRoster = (typeof renderPTRoster === 'function') ? renderPTRoster : null;
  if(_prevRoster){ renderPTRoster = function(){ const r = _prevRoster.apply(this, arguments); try{ relabelCarry(); }catch(e){} return r; }; }

  /* ---------- 3: transfers keep their dues ---------- */
  const _prevTransfer = executeTransfers;
  executeTransfers = async function(ids, date, reason){
    const expect = [];
    try{
      await ensureDataLoaded('payments', loadPaymentsData);
      await fyhEnsure(true);
      await settleExtras();
      const year = curYear(), recs = []; let n = 0, tot = 0;
      (ids || []).forEach(id => {
        const s = students.find(x => x.id === id); if(!s || !isActive(s)) return;
        let t; try{ t = fyhClassTotals(s); }catch(e){ return; }
        const due = r2(t.receivable);
        if(due > 0.004){
          const nm = CARRYFORWARD_LABELS.previous + ' — ' + s.className + ' (' + year + ') · left school';
          studentExtraFees.push({ id: 'sef_' + Date.now() + '_' + s.id + '_t', studentId: s.id, name: nm, amount: due, paid: false, date: todayISO(), kind: 'carry' });
          expect.push({ studentId: s.id, amount: due, name: nm });
          n++; tot += due;
        }
        recs.push({ id: 'fyh_' + Date.now() + '_' + String(s.id).replace(/[^\w-]/g, '') + '_t', studentId: s.id, studentName: fyhName(s), academicYear: year, className: s.className, section: s.section || '',
          billed: t.expected, discount: t.discount, paid: t.collected, balance: t.receivable, carried: due > 0.004 ? due : 0, carriedAs: due > 0.004 ? 'Dues at leaving' : '',
          outcome: 'Transferred', movedTo: '', date: todayISO(), byUser: who() });
      });
      if(n) await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      if(recs.length){ recs.forEach(r => feeYearHistory.push(r)); await storageSet(FEE_YEAR_HISTORY_KEY, feeYearHistory); }
      if(n) setTimeout(() => showToast(money(tot) + ' unpaid fees of ' + n + ' student(s) are kept as dues - see Fee Defaulters.'), 400);
    }catch(e){ console.warn('transfer dues failed', e); }
    const out = await _prevTransfer.apply(this, arguments);
    try{ const fixed = await verifyCarries(expect); if(fixed > 0) showToast(fixed + ' due(s) had to be re-saved - please check Fee Defaulters.'); }catch(e){ console.warn(e); }
    return out;
  };

  /* Fee Defaulters: add left-school students who still owe their frozen dues */
  const _prevDef = computeDefaulters;
  computeDefaulters = function(){
    const list = _prevDef.apply(this, arguments);
    try{
      const have = new Set(list.map(r => r.student.id));
      const today = todayISO();
      students.filter(s => !isActive(s) && !have.has(s.id)).forEach(s => {
        const rows = computePendingFeeRows(s).pendingRows.filter(r => r.type === 'extra');
        const total = rows.reduce((a, r) => a + r.outstanding, 0);
        if(!(total > 0)) return;
        const ghost = Object.assign({}, s, { lastName: (s.lastName || '') + ' (left school)' });
        list.push({ student: ghost, tuitionBal: 0, busBal: 0, stockBal: 0, hostelBal: 0, otherBal: total, total, nextDue: '', dueTillToday: total, overdue: true,
          parentPhone: s.fatherPhone || s.motherPhone || s.guardianPhone || '' });
      });
    }catch(e){ console.warn('defaulters (left school) failed', e); }
    return list;
  };

  /* ---------- 4: old dues first ---------- */
  const _prevQuick = onQuickPayInput;
  onQuickPayInput = function(){
    try{
      let amt = Number($('quickPayAmt').value) || 0;
      const inputs = Array.from(document.querySelectorAll('.ledger-pay-input'));
      const old = inp => { if(inp.dataset.type !== 'extra') return 0; const e = studentExtraFees.find(x => x.id === inp.dataset.key); return e && (e.kind === 'carry' || /previous year|carried forward|old balance|dues at leaving/i.test(e.name || '')) ? 1 : 0; };
      inputs.sort((a, b) => old(b) - old(a));
      inputs.forEach(inp => { const out = Number(inp.dataset.outstanding) || 0; const take = Math.max(0, Math.min(amt, out)); inp.value = take; amt = r2(amt - take); });
      updateLedgerTotalToPay();
    }catch(e){ return _prevQuick.apply(this, arguments); }
  };

  /* ---------- 5: next year's fees ---------- */
  const PLAN_KEY = 'fee-plan-next';
  OBJECT_BACKED_KEYS[PLAN_KEY] = '/api/kv/' + PLAN_KEY;
  let plan = null, planLoaded = false, mode = 'now';
  async function planEnsure(force){ if(planLoaded && !force) return; try{ const v = await storageGet(PLAN_KEY, null); plan = (v && v.structure) ? v : null; planLoaded = true; }catch(e){ planLoaded = true; } }
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  function nextYears(){ const c = curYear(); return (academicYears || []).filter(y => y !== c && String(y) > String(c)).sort(); }
  // run fn with the plan's figures in place of the live fee structure (synchronous, so nothing else can read them meanwhile)
  function withPlan(fn, self, args){
    if(mode !== 'next') return fn.apply(self, args);
    const sv = classFeeStructure, sh = financeSettings.hostel;
    classFeeStructure = (plan && plan.structure) ? clone(plan.structure) : clone(sv);
    financeSettings.hostel = plan && plan.hostel != null ? plan.hostel : sh;
    try{ return fn.apply(self, args); }
    finally{ classFeeStructure = sv; financeSettings.hostel = sh; }
  }
  ['fpxFsRefresh', 'fpxFsCardDirty', 'fpxFsCardHtml', 'fpxFsKpiHtml'].forEach(n => {
    const f = window[n]; if(typeof f !== 'function') return;
    window[n] = function(){ return withPlan(f, this, arguments); };
  });
  const _prevFsTab = renderFeeStructureTab;
  renderFeeStructureTab = function(body){
    const r = withPlan(_prevFsTab, this, arguments);
    try{ decorateFs(body); }catch(e){}
    return r;
  };
  function decorateFs(body){
    const root = body && body.querySelector('.fpx'); if(!root) return;
    const old = root.querySelector('#fpBar'); if(old) old.remove();
    const yrs = nextYears();
    const bar = document.createElement('div'); bar.id = 'fpBar';
    bar.style.cssText = 'margin:0 0 14px;padding:12px 14px;border:1.5px solid ' + (mode === 'next' ? '#c2185b' : '#e3e0f0') + ';border-radius:14px;background:' + (mode === 'next' ? '#fff5f9' : '#fff') + ';display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    const btn = (m, t) => '<button type="button" data-fp="' + m + '" style="border:1.5px solid ' + (mode === m ? '#1a1a4b' : '#e3e0f0') + ';background:' + (mode === m ? '#1a1a4b' : '#fff') + ';color:' + (mode === m ? '#fff' : '#1a1a4b') + ';border-radius:99px;padding:7px 14px;font:inherit;font-size:.85rem;cursor:pointer">' + t + '</button>';
    let note;
    if(mode === 'next'){
      note = 'You are editing the fees for <b>' + esc(plan && plan.year || yrs[0] || 'the next year') + '</b>. <b>Nothing changes for current students</b> - these amounts start when that year is made current (after promotion).' + (yrs.length ? '' : ' Add the next academic year first.');
      const sel = '<select id="fpYear" style="font:inherit;font-size:.85rem;padding:6px 8px;border-radius:10px;border:1.5px solid #e3e0f0">' + yrs.map(y => '<option' + (plan && plan.year === y ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select>';
      bar.innerHTML = btn('now', 'This year (' + esc(curYear()) + ')') + btn('next', 'Next year\'s fees') + sel + '<span style="flex:1 1 280px;font-size:.82rem;color:#5b5a73">' + note + '</span>' + (plan ? '<button type="button" data-fp="discard" style="border:0;background:none;color:#8c1d18;text-decoration:underline;font:inherit;font-size:.8rem;cursor:pointer">Discard plan</button>' : '');
    }else{
      note = 'These are what current students owe <b>now</b>. To prepare the next year, switch to <b>Next year\'s fees</b>; changing them here changes every current student\'s dues immediately.' + (plan ? ' <b style="color:#c2185b">A plan for ' + esc(plan.year) + ' is saved and waiting.</b>' : '');
      bar.innerHTML = btn('now', 'This year (' + esc(curYear()) + ')') + btn('next', 'Next year\'s fees') + '<span style="flex:1 1 280px;font-size:.82rem;color:#5b5a73">' + note + '</span>';
    }
    root.insertBefore(bar, root.firstChild);
    bar.querySelectorAll('[data-fp]').forEach(b => b.addEventListener('click', async () => {
      const m = b.dataset.fp;
      if(m === 'discard'){ if(!await showConfirmDialog('Discard the prepared fees for ' + esc(plan.year) + '?')) return; await storageSet(PLAN_KEY, {}); plan = null; mode = 'now'; renderFeeStructureTab(fpxFsHost); return; }
      if(m === 'next' && !nextYears().length){ showToast('Add the next academic year first (Academic Year page).'); return; }
      await planEnsure(true); mode = m; renderFeeStructureTab(fpxFsHost);
    }));
  }
  const _prevSaveFs = saveFeeStructure;
  saveFeeStructure = async function(){
    if(mode !== 'next') return _prevSaveFs.apply(this, arguments);
    const yrSel = $('fpYear'); const yr = (yrSel && yrSel.value) || nextYears()[0];
    if(!yr){ showToast('Add the next academic year first.'); return; }
    const st = (plan && plan.structure) ? clone(plan.structure) : clone(classFeeStructure);
    document.querySelectorAll('.fs-input').forEach(inp => { const c = inp.dataset.class, f = inp.dataset.field; st[c] = st[c] || {}; st[c][f] = Number(inp.value) || 0; });
    const hostelEl = $('fsHostel');
    plan = { year: yr, structure: st, hostel: hostelEl ? (Number(hostelEl.value) || 0) : financeSettings.hostel, savedBy: who(), savedAt: new Date().toISOString() };
    if(await storageSet(PLAN_KEY, plan) === false){ showToast('Could not save - try again.'); return; }
    showToast('Fees for ' + yr + ' saved. Current students are not affected.', 'burst');
  };
  // applying the plan is part of making the new year current
  async function beforeYearSwitch(target){
    await planEnsure(true);
    await fyhEnsure(true);
    const prev = curYear();
    if(!target || target === prev) return true;
    const promotedThisYear = feeYearHistory.some(h => h.academicYear === prev && (h.outcome === 'Promoted' || h.outcome === 'Graduated'));
    const stillActive = students.filter(isActive).length;
    let msg = '';
    if(stillActive && !promotedThisYear) msg += 'No student has been promoted in ' + prev + ' yet. If you switch now, last year\'s unpaid fees will NOT be carried forward. Promote first (Setup > Promotions), then make ' + target + ' current.\n\n';
    const hasPlan = plan && plan.year === target;
    if(hasPlan) msg += 'The fees you prepared for ' + target + ' will start now for every class.';
    else if(plan) msg += 'Note: the fees you prepared are for ' + plan.year + ', not ' + target + ', so fees stay as they are.';
    else msg += 'No fees were prepared for ' + target + ', so fees stay as they are today.';
    if(!msg.trim()) return true;
    if(!await showConfirmDialog(msg + (stillActive && !promotedThisYear ? '\n\nSwitch anyway?' : '\n\nContinue?'), { title: 'Make ' + target + ' the current year', okText: 'Yes, switch', cancelText: 'Not yet' })) return false;
    if(hasPlan){
      classFeeStructure = clone(plan.structure); financeSettings.hostel = plan.hostel != null ? plan.hostel : financeSettings.hostel;
      await storageSet(FEE_STRUCTURE_KEY, classFeeStructure); await storageSet(SETTINGS_KEY, financeSettings);
      await storageSet(PLAN_KEY, {}); plan = null; mode = 'now';
      try{ renderDashboard(); }catch(e){}
    }
    return true;
  }
  const _prevSetCur = setCurrentAcademicYear;
  setCurrentAcademicYear = async function(){
    const sel = $('ayCurrentSelect'); const target = sel && sel.value;
    if(!await beforeYearSwitch(target)){ if(sel) sel.value = curYear(); return; }
    return _prevSetCur.apply(this, arguments);
  };
  const _prevFeeYear = changeAcademicYearFromFee;
  changeAcademicYearFromFee = async function(){
    const sel = $('mfAySelect'); const target = sel && sel.value;
    if(!await beforeYearSwitch(target)){ if(sel) sel.value = curYear(); return; }
    return _prevFeeYear.apply(this, arguments);
  };

  /* ---------- 6: promoted by mistake ---------- */
  window.ptUndoPromo = async function(hid){
    await ensureDataLoaded('payments', loadPaymentsData); await fyhEnsure(true);
    const h = feeYearHistory.find(x => x.id === hid); if(!h) return;
    const s = students.find(x => x.id === h.studentId); if(!s){ showToast('Student not found.'); return; }
    const grad = h.outcome === 'Graduated';
    if(!grad && s.className !== h.movedTo){ showToast('This student is no longer in ' + h.movedTo + ', so it cannot be undone here.'); return; }
    if(grad && isActive(s)){ showToast('This student is active again - nothing to undo.'); return; }
    if(!grad && payments.some(p => p.studentId === s.id && !p.voided && p.classAtPayment === h.movedTo)){
      showToast('Fees were already collected in ' + h.movedTo + ', so this cannot be undone safely. Ask for help to correct it.'); return;
    }
    const cf = h.carried > 0 ? studentExtraFees.find(e => e.studentId === s.id && e.kind === 'carry' && String(e.name).indexOf('— ' + h.className + ' (' + h.academicYear + ')') >= 0 && Math.abs(Number(e.amount) - Number(h.carried)) < 0.01) : null;
    if(cf && (cf.paid || Number(cf.paidAmount) > 0)){ showToast('Part of the carried dues is already paid, so this cannot be undone safely.'); return; }
    if(!await showConfirmDialog('Undo the ' + (grad ? 'graduation' : 'promotion') + ' of ' + (s.firstName || '') + ' ' + (s.lastName || '') + '? They go back to ' + h.className + (cf ? ' and the carried dues of ' + money(cf.amount) + ' are removed (the unpaid fees show in ' + h.className + ' again).' : '.'), { title: 'Undo promotion', okText: 'Yes, undo' })) return;
    s.className = h.className; if(h.section) s.section = h.section; if(grad) s.status = 'Active';
    if(cf) studentExtraFees.splice(studentExtraFees.indexOf(cf), 1);
    feeYearHistory.splice(feeYearHistory.indexOf(h), 1);
    await persist();
    if(cf) await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    await storageSet(FEE_YEAR_HISTORY_KEY, feeYearHistory);
    showToast('Undone. ' + (s.firstName || 'Student') + ' is back in ' + h.className + '.', 'burst');
    try{ renderPromotionsTab($('promotionsBody')); }catch(e){}
  };
  const _prevMainHtml = (typeof fpxPoMainHtml === 'function') ? fpxPoMainHtml : null;
  if(_prevMainHtml){
    fpxPoMainHtml = function(){
      let h = _prevMainHtml.apply(this, arguments);
      try{
        const list = fpxPoActive(fpxPoSel);
        const owing = list.map(s => r2(fyhClassTotals(s).receivable)).filter(v => v > 0.004);
        const line = '<li><b>Unpaid fees are carried forward</b>' + (owing.length ? ': ' + money(owing.reduce((a, v) => a + v, 0)) + ' owed by ' + owing.length + ' of these students' : ' (nobody in this class owes anything)') + '. Each amount becomes “Previous Year Dues” on the student\'s new fee ledger, and the fee history moves with the student.</li>';
        h = h.replace('<li>Payments already recorded stay locked', line + '<li>Payments already recorded stay locked');
      }catch(e){}
      return h;
    };
  }
  const _prevPromoTab = renderPromotionsTab;
  renderPromotionsTab = function(body){
    const r = _prevPromoTab.apply(this, arguments);
    try{ undoCard(body); }catch(e){}
    return r;
  };
  async function undoCard(body){
    if(!body || currentUser.role !== 'Admin') return;
    await fyhEnsure(true);
    const y = curYear();
    const rows = feeYearHistory.filter(h => h.academicYear === y && (h.outcome === 'Promoted' || h.outcome === 'Graduated')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const old = $('ptUndoCard'); if(old) old.remove();
    if(!body.isConnected) return;
    const card = document.createElement('section'); card.id = 'ptUndoCard'; card.className = 'sf-card fpx-card'; card.style.marginTop = '18px';
    card.innerHTML = '<details><summary style="cursor:pointer;font-weight:700;color:#1a1a4b">Promoted by mistake? <span style="font-weight:400;color:#5b5a73">(' + rows.length + ' promotion(s) recorded in ' + esc(y) + ')</span></summary>' +
      '<p style="font-size:.82rem;color:#5b5a73;margin:8px 0">Undo puts a student back in their old class and removes the dues that were carried. It is blocked once fees have been collected in the new class.</p>' +
      (rows.length ? '<input type="search" id="ptUndoQ" class="input" placeholder="Search name" style="max-width:260px;margin-bottom:8px"><div class="table-wrap" style="max-height:320px;overflow:auto"><table class="iv-table"><thead><tr><th>Student</th><th>From</th><th>To</th><th>Carried</th><th>Date</th><th></th></tr></thead><tbody id="ptUndoRows"></tbody></table></div>' : '<p style="font-size:.85rem">Nothing yet.</p>') + '</details>';
    body.appendChild(card);
    const draw = q => { const t = $('ptUndoRows'); if(!t) return; t.innerHTML = rows.filter(h => !q || String(h.studentName).toLowerCase().indexOf(q) >= 0).slice(0, 200).map(h => '<tr><td>' + esc(h.studentName) + '</td><td>' + esc(h.className) + '</td><td>' + esc(h.outcome === 'Graduated' ? 'Graduated' : h.movedTo) + '</td><td>' + (h.carried > 0 ? money(h.carried) : (/^Written off/.test(h.carriedAs || '') ? 'Written off' : '—')) + '</td><td>' + esc(h.date) + '</td><td><button type="button" class="btn btn-ghost btn-sm" onclick="ptUndoPromo(\'' + esc(h.id) + '\')">Undo</button></td></tr>').join(''); };
    draw('');
    const q = $('ptUndoQ'); if(q) q.addEventListener('input', () => draw(q.value.trim().toLowerCase()));
  }
  // the plan screen always opens on "This year"
  const _sv = window.switchView;
  if(typeof _sv === 'function' && !_sv.__yem){
    const w = function(id){ if(id !== 'managefee' && id !== 'feestructuresetup') mode = 'now'; return _sv.apply(this, arguments); };
    w.__yem = true; Object.keys(_sv).forEach(k => { try{ w[k] = _sv[k]; }catch(e){} }); window.switchView = w;
  }
  const _sft = window.switchFeeTab;
  if(typeof _sft === 'function'){ window.switchFeeTab = function(tab){ if(tab !== 'structure') mode = 'now'; return _sft.apply(this, arguments); }; }
  planEnsure();
})();
