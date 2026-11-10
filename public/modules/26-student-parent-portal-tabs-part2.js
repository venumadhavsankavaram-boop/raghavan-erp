
  async function decideDeletionRequest(id, decision, stage){
    let note = null;
    let confirmText = null;
    if(decision === 'Reject'){
      if(!await showConfirmDialog('Are you sure you want to reject this deletion request?')) return;
      note = (await showPromptDialog('Optional: note for the person who requested this (why it was rejected).', { title:'Reject request', okText:'Reject', placeholder:'Optional note' })) || '';
    }else if(stage === 'Pending'){
      // Step 2 of 3 — nothing is deleted yet, so a plain confirm is enough.
      if(!await showConfirmDialog('Confirm step 2 of 3 for this deletion request? Nothing is deleted yet — one more, final confirmation step will still be needed.')) return;
    }else{
      // Step 3 of 3 — the actually-irreversible step. Since this can now be
      // done by the same admin who did steps 1 and 2, the real safeguard
      // here is typing the record's own Admission No back, the same
      // pattern as Delete Permanently in Recently Deleted.
      const row = (_deletionRequestsCache || []).find(r => r.id === id);
      const m = row && row.recordLabel ? row.recordLabel.match(/Adm#\s*([^)]+)\)/) : null;
      const expected = m ? m[1].trim() : '';
      const typed = await showPromptDialog(`This is the FINAL step — the record will be deleted immediately (recoverable only from Recently Deleted, for a limited time).\n\nType the Admission No (${expected || '—'}) to confirm.`, { title:'Final confirmation', okText:'Delete permanently', placeholder:'Admission number' });
      if(typed === null) return;
      if(typed.trim().toLowerCase() !== String(expected).trim().toLowerCase()){
        showToast(`That didn't match — nothing was deleted.`);
        return;
      }
      confirmText = typed.trim();
    }
    try{
      const res = await throwIfNotOk(await fetch('/api/deletion-requests?id=' + encodeURIComponent(id), {
        method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify({ decision, note, confirmText })
      }));
      const data = await res.json().catch(() => ({}));
      if(decision === 'Approve' && data.status === 'Pending Final Approval'){
        showToast('Step 2 of 3 confirmed — one final, typed confirmation step remains.', 'burst');
      }else if(decision === 'Approve' && data.status === 'Approved'){
        showToast('Final step confirmed — record removed (recoverable from Recently Deleted).');
        await loadStudents(); renderDashboard(); renderAdmissionsBody();
      }else{
        showToast('Deletion request rejected.');
      }
      await renderDeletionRequestsModal();
    }catch(e){
      showToast('Could not record your decision (' + e.message + ').');
    }
  }

  // ---------- Approvals Center ----------
  // Every "someone else has to sign off on this" workflow in the app
  // (promotion/transfer/section requests, inventory changes, fee discounts,
  // payroll drafts, deletion requests) used to live on its own page, so the
  // only way an approver found out about a new one was a co-worker walking
  // over to say so. This aggregates every queue a signed-in user is actually
  // allowed to decide on into one bell + badge (see the button in
  // .sb-user-footer) with a live poll, so a new request surfaces on its own:
  //   - the badge count and the bell's ring animation update every poll;
  //   - a genuinely NEW pending item (one this browser hasn't seen before —
  //     see approvalsSeenIds) also gets a toast, a system Notification
  //     (works even if this tab is in the background), and a short chime;
  //   - Admin/Principal additionally get a real Web Push for deletion
  //     requests and discount requests (server.js's notifyUsersByRole) —
  //     that one reaches them even with the browser fully closed. The other
  //     queues (promo/transfer/section, inventory, payroll) are plain
  //     KV-array records with no per-write server hook today, so those rely
  //     on this in-app poll — good enough while the ERP tab is open
  //     somewhere, not a substitute for the two push-backed ones above.
  // Nothing here invents new authorization: every item's Approve/Reject
  // button calls the exact same function the item's own page already used
  // (approveInventoryRequest, approveDiscountGroup, approvePayroll,
  // decideDeletionRequest, ...) — this is a second place to reach them from,
  // not a second way to decide them.
  function userCanSeeApprovalsBell(){
    if(!currentUser) return false;
    if(['Admin','Principal'].includes(currentUser.role)) return true;
    return ['staff','inventory','promotransfer'].some(m => getRolePermission(currentUser.role, m, 'approve'));
  }

  /* ---------- Approval detail cards ----------
     Every approval shows WHAT is being asked (facts) and anything the approver should think twice about (flags),
     built only from data already loaded in the app, so the decision never has to be made blind. */
  function apxDay(iso){
    if(!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(!m) return escapeHtml(String(iso));
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if(isNaN(d)) return escapeHtml(String(iso));
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()] + ', ' + (+m[3]) + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2] - 1] + ' ' + m[1];
  }
  function apxStudentName(s, fallback){ return s ? ((s.firstName||'') + ' ' + (s.lastName||'')).trim() : (fallback || 'Unknown student'); }
  function apxStudentClass(s){ return s ? [s.className, s.section ? 'Section ' + s.section : ''].filter(Boolean).join(' · ') : '—'; }
  function apxMoney(n){ try { return fmtMoney(Number(n)||0); } catch(e){ return '₹' + (Number(n)||0); } }
  function apxLeaveDates(from, to){
    const out = []; if(!from) return out;
    let cur = new Date(from + 'T00:00:00Z'); const end = new Date((to || from) + 'T00:00:00Z'); let g = 0;
    while(cur <= end && g++ < 366){ out.push(cur.toISOString().slice(0,10)); cur = new Date(cur.getTime() + 86400000); }
    return out;
  }
  function apxLeaveDays(r){ return r.session ? 0.5 : apxLeaveDates(r.fromDate, r.toDate || r.fromDate).length; }
  function apxStaffById(id){ return (typeof staffList !== 'undefined' ? staffList : []).find(x => x.id === id); }
  function apxLeaveDetail(r){
    const facts = [], flags = [];
    const st = apxStaffById(r.staffId);
    const days = apxLeaveDays(r);
    const dates = r.session ? [r.fromDate] : apxLeaveDates(r.fromDate, r.toDate || r.fromDate);
    const sundays = dates.filter(d => new Date(d + 'T00:00:00Z').getUTCDay() === 0).length;
    facts.push(['Staff', escapeHtml(r.staffName || (st ? st.firstName + ' ' + st.lastName : r.staffId))]);
    if(st) facts.push(['Role', escapeHtml([st.designation, st.department].filter(Boolean).join(' · ') || '—')]);
    facts.push(['Leave', r.session ? 'Half day — ' + escapeHtml(r.session) + ' on ' + apxDay(r.fromDate)
      : (r.fromDate === (r.toDate || r.fromDate) ? '1 day — ' + apxDay(r.fromDate) : days + ' days — ' + apxDay(r.fromDate) + ' to ' + apxDay(r.toDate))]);
    facts.push(['Reason', escapeHtml(r.reason || 'No reason given')]);
    facts.push(['Applied on', apxDay(r.requestedAt)]);
    // Leave already taken in the same month (approved requests), against the monthly paid-leave allowance.
    const all = (typeof _staffLeaveCache !== 'undefined' ? _staffLeaveCache : []);
    const mine = all.filter(x => x.staffId === r.staffId && x.id !== r.id);
    const ym = String(r.fromDate || '').slice(0,7), yr = String(r.fromDate || '').slice(0,4);
    const spanIn = (x, pref) => {
      if(x.session) return String(x.fromDate).startsWith(pref) ? 0.5 : 0;
      return apxLeaveDates(x.fromDate, x.toDate || x.fromDate).filter(d => d.startsWith(pref)).length;
    };
    const takenMonth = mine.filter(x => x.status === 'Approved').reduce((n, x) => n + spanIn(x, ym), 0);
    const takenYear = mine.filter(x => x.status === 'Approved').reduce((n, x) => n + spanIn(x, yr), 0);
    const thisInMonth = r.session ? 0.5 : dates.filter(d => d.startsWith(ym)).length;
    const quotaRaw = (st && typeof payrollQuotaFor === 'function') ? payrollQuotaFor(st, ym) : (st && st.paidLeavesPerMonth !== undefined && st.paidLeavesPerMonth !== '' ? Number(st.paidLeavesPerMonth) : 1);
    const quota = Number.isFinite(quotaRaw) ? quotaRaw : 1;
    facts.push(['This month', `${takenMonth} day(s) already approved + ${thisInMonth} requested · paid allowance ${quota} day(s)/month`]);
    facts.push(['This year', `${takenYear} day(s) approved so far this year`]);
    const lop = (typeof payrollLopDays === 'function') ? payrollLopDays(takenMonth + thisInMonth, quota) : Math.max(0, takenMonth + thisInMonth - quota);
    if(lop > 0) flags.push(['warn', `${lop} day(s) of this month would be beyond the ${quota}-day paid allowance, so salary is reduced for those days (loss of pay).`]);
    else flags.push(['ok', `Within the paid allowance (${takenMonth + thisInMonth} of ${quota} day(s) this month).`]);
    const todayIso = (typeof localISODate === 'function') ? localISODate() : new Date().toISOString().slice(0,10);
    if(dates.length && dates[dates.length - 1] < todayIso) flags.push(['warn', 'These dates are already over. Approving will mark leave on days that have passed and replaces any attendance already marked for them.']);
    else if(dates.length && dates[0] <= todayIso) flags.push(['warn', 'Leave starts today or has already started.']);
    if(sundays) flags.push(['info', `${sundays} Sunday(s) fall inside the dates; approval marks every calendar day as Leave.`]);
    // Clashes: other staff already on (or asking for) leave on the same dates.
    const overlap = all.filter(x => x.id !== r.id && x.staffId !== r.staffId && (x.status === 'Approved' || x.status === 'Pending')
      && apxLeaveDates(x.fromDate, x.toDate || x.fromDate).some(d => dates.includes(d)));
    if(overlap.length){
      const names = Array.from(new Set(overlap.map(x => escapeHtml(x.staffName || x.staffId) + (x.status === 'Pending' ? ' (pending)' : '')))).join(', ');
      const sameDept = st ? overlap.filter(x => { const o = apxStaffById(x.staffId); return o && o.department && o.department === st.department; }) : [];
      flags.push([sameDept.length ? 'warn' : 'info', `Also on leave on these dates: ${names}${sameDept.length ? ' — including the same department.' : '.'}`]);
    }
    // Class-teacher / subject duties that need cover.
    const ct = st && (st.classTeacherClass || (st.extra && st.extra.classTeacherClass));
    if(ct) flags.push(['info', `Class Teacher of ${escapeHtml(ct)}${(st.classTeacherSection || (st.extra && st.extra.classTeacherSection)) ? ' ' + escapeHtml(st.classTeacherSection || st.extra.classTeacherSection) : ''} — that class needs cover.`]);
    return { facts, flags };
  }
  function apxDiscountDetail(r){
    const facts = [], flags = [];
    const s = students.find(x => x.id === r.studentId);
    facts.push(['Student', escapeHtml(apxStudentName(s, r.studentId)) + (s ? ' · ' + escapeHtml(apxStudentClass(s)) : '')]);
    facts.push(['Concession', escapeHtml(r.type || 'Discount')]);
    let total = 0;
    const lines = r.records.map(d => {
      const amt = (typeof fpDiscountAmount === 'function') ? fpDiscountAmount(d) : (Number(d.value) || 0);
      total += amt;
      const label = (typeof CATS !== 'undefined' && CATS[d.appliesTo]) || d.appliesTo || 'Fee';
      const how = d.mode === 'percentage' || d.mode === 'percent' ? ` (${Number(d.value)}%)` : '';
      return escapeHtml(label) + ': <b>' + apxMoney(amt) + '</b>' + how;
    });
    facts.push(['Discount asked', lines.join(' · ') + (r.records.length > 1 ? ' · Total <b>' + apxMoney(total) + '</b>' : '')]);
    if(r.note) facts.push(['Reason / note', escapeHtml(r.note)]);
    const reqDate = (r.records[0] && r.records[0].requestedDate) || '';
    facts.push(['Requested by', escapeHtml(r.requestedBy || '—') + (r.records[0] && r.records[0].requestedRole ? ' (' + escapeHtml(r.records[0].requestedRole) + ')' : '') + (reqDate ? ' on ' + apxDay(reqDate) : '')]);
    if(s && typeof computeStudentFinance === 'function'){
      try {
        const fin = computeStudentFinance(s), pc = fin.perCat || {};
        r.records.forEach(d => {
          const c = pc[d.appliesTo]; if(!c) return;
          const label = (typeof CATS !== 'undefined' && CATS[d.appliesTo]) || d.appliesTo;
          facts.push([label + ' position', `Fee ${apxMoney(c.expected)} · already discounted ${apxMoney(c.discount)} · paid ${apxMoney(c.collected)} · balance ${apxMoney(c.receivable)}`]);
          const amt = (typeof fpDiscountAmount === 'function') ? fpDiscountAmount(d) : (Number(d.value) || 0);
          if(c.expected > 0 && amt > c.expected - c.discount) flags.push(['bad', `${escapeHtml(label)} discount of ${apxMoney(amt)} is more than the fee still discountable (${apxMoney(Math.max(0, c.expected - c.discount))}).`]);
          else if(c.expected > 0 && amt >= c.expected * 0.5) flags.push(['warn', `Large concession: ${Math.round(amt * 100 / c.expected)}% of the ${escapeHtml(label)}.`]);
          if(c.expected > 0 && c.receivable <= 0) flags.push(['info', `The ${escapeHtml(label)} is already fully paid; an approved discount will become a credit/refund situation.`]);
        });
        const t = fin.totals;
        if(t) facts.push(['All fees', `Expected ${apxMoney(t.expected)} · paid ${apxMoney(t.collected)} · balance ${apxMoney(t.receivable !== undefined ? t.receivable : (t.expected - t.collected))}`]);
      } catch(e){}
    }
    // Other discounts this student already has.
    const others = studentDiscounts.filter(d => d.studentId === r.studentId && d.status === 'Approved');
    if(others.length) flags.push(['info', 'Already has approved concession(s): ' + others.map(d => escapeHtml((d.type || 'Discount') + ' ' + (d.mode === 'percentage' || d.mode === 'percent' ? Number(d.value) + '%' : apxMoney(d.value)))).join(', ') + '.']);
    if(!r.note) flags.push(['warn', 'No reason was written for this discount.']);
    return { facts, flags };
  }
  function apxPayrollDetail(r){
    const facts = [], flags = [];
    const st = apxStaffById(r.staffId);
    facts.push(['Staff', escapeHtml(st ? st.firstName + ' ' + st.lastName : r.staffId) + (st && st.designation ? ' · ' + escapeHtml(st.designation) : '')]);
    facts.push(['Month', escapeHtml(r.month || '—')]);
    facts.push(['Earnings', `Basic ${apxMoney(r.basic)}${Number(r.bonus) ? ' + bonus ' + apxMoney(r.bonus) : ''} = Gross <b>${apxMoney(r.grossSalary)}</b>`]);
    const ded = [];
    if(Number(r.lopDeduction)) ded.push(`Loss of pay ${apxMoney(r.lopDeduction)} (${Number(r.lopDays)||0} day(s))`);
    if(Number(r.epfEmployee)) ded.push('PF ' + apxMoney(r.epfEmployee));
    if(Number(r.esiEmployee)) ded.push('ESI ' + apxMoney(r.esiEmployee));
    if(Number(r.otherDeductions)) ded.push('Other ' + apxMoney(r.otherDeductions));
    if(Number(r.advanceDeduction)) ded.push('Advance recovery ' + apxMoney(r.advanceDeduction));
    facts.push(['Deductions', ded.length ? ded.join(' · ') + ` = <b>${apxMoney(r.totalDeductions)}</b>` : 'None']);
    facts.push(['Net payable', `<b>${apxMoney(r.netSalary)}</b>`]);
    facts.push(['Leave this month', `${Number(r.leaveDays) || 0} leave day(s) · ${Number(r.lopDays) || 0} loss-of-pay day(s)`]);
    const prev = (typeof staffPayrollRecords !== 'undefined' ? staffPayrollRecords : []).filter(x => x.staffId === r.staffId && x.month && x.month < r.month && x.status !== 'Draft')
      .sort((a, b) => b.month.localeCompare(a.month))[0];
    if(prev){
      facts.push(['Last month', `${escapeHtml(prev.month)}: net ${apxMoney(prev.netSalary)}`]);
      const diff = (Number(r.netSalary) || 0) - (Number(prev.netSalary) || 0);
      if(prev.netSalary > 0 && Math.abs(diff) / prev.netSalary >= 0.1) flags.push(['warn', `Net pay is ${diff > 0 ? 'higher' : 'lower'} than last month by ${apxMoney(Math.abs(diff))} (${Math.round(Math.abs(diff) * 100 / prev.netSalary)}%). Check before approving.`]);
    } else flags.push(['info', 'No earlier approved payroll to compare with.']);
    if(Number(r.netSalary) <= 0) flags.push(['bad', 'Net salary is zero or negative.']);
    flags.push(['info', 'Approving locks this net salary; later edits to salary or attendance will not change it.']);
    return { facts, flags };
  }
  function apxStudentRow(s, id){
    return s ? `${escapeHtml(apxStudentName(s))} (${escapeHtml(apxStudentClass(s))})` : escapeHtml(id || 'Unknown student');
  }
  function apxRequestDetail(a){
    const facts = [], flags = [];
    const who = escapeHtml(a.requestedBy || '—') + (a.requestedByRole ? ' (' + escapeHtml(a.requestedByRole) + ')' : '');
    const dueOf = id => { const s = students.find(x => x.id === id); if(!s || typeof computeStudentFinance !== 'function') return null; try { return computeStudentFinance(s).totals; } catch(e){ return null; } };
    if(a.type === 'promote'){
      const list = a.payload || [];
      facts.push(['Request', `Promote ${list.length} student(s)`]);
      const lines = list.map(p => {
        const s = students.find(x => x.id === p.studentId);
        const to = p.target === '__graduate__' ? 'Graduate / leaves school' : escapeHtml(p.target || '');
        const cf = p.carryForwardType && Number(p.carryForwardDue) ? ` — <b>${apxMoney(p.carryForwardDue)}</b> dues carried forward` : '';
        return `${apxStudentRow(s, p.studentId)} → <b>${to}</b>${cf}`;
      });
      facts.push(['Students', '<div style="display:grid; gap:2px;">' + lines.map(l => '<span>' + l + '</span>').join('') + '</div>']);
      const cfTotal = list.reduce((n, p) => n + (p.carryForwardType ? (Number(p.carryForwardDue) || 0) : 0), 0);
      if(cfTotal) flags.push(['info', `${apxMoney(cfTotal)} of unpaid fees will move to the new year with these students.`]);
      const unpaid = list.filter(p => { const t = dueOf(p.studentId); return t && (t.receivable > 0) && !p.carryForwardType; });
      if(unpaid.length) flags.push(['warn', `${unpaid.length} student(s) still have unpaid fees and no carry-forward chosen: ${unpaid.slice(0,5).map(p => escapeHtml(apxStudentName(students.find(x => x.id === p.studentId), p.studentId))).join(', ')}${unpaid.length > 5 ? '…' : ''}.`]);
      const grads = list.filter(p => p.target === '__graduate__').length;
      if(grads) flags.push(['info', `${grads} student(s) will be marked as graduated.`]);
    } else if(a.type === 'transfer'){
      const ids = (a.payload && a.payload.studentIds) || [];
      facts.push(['Request', `Transfer certificate for ${ids.length} student(s)`]);
      facts.push(['Students', '<div style="display:grid; gap:2px;">' + ids.map(id => '<span>' + apxStudentRow(students.find(x => x.id === id), id) + '</span>').join('') + '</div>']);
      if(a.payload && a.payload.date) facts.push(['Transfer date', apxDay(a.payload.date)]);
      if(a.payload && a.payload.reason) facts.push(['Reason', escapeHtml(a.payload.reason)]);
      const owing = ids.map(id => ({ id, t: dueOf(id) })).filter(x => x.t && x.t.receivable > 0);
      if(owing.length) flags.push(['warn', 'Unpaid fees: ' + owing.map(x => escapeHtml(apxStudentName(students.find(s => s.id === x.id), x.id)) + ' ' + apxMoney(x.t.receivable)).join(', ') + '.']);
      else if(ids.length) flags.push(['ok', 'No unpaid fees for these students.']);
    } else if(a.type === 'section'){
      const ch = (a.payload && a.payload.changes) || [];
      facts.push(['Request', `Change section for ${ch.length} student(s)`]);
      facts.push(['Students', '<div style="display:grid; gap:2px;">' + ch.map(c => { const s = students.find(x => x.id === c.studentId); return '<span>' + apxStudentRow(s, c.studentId) + ' → <b>Section ' + escapeHtml(c.target || '') + '</b></span>'; }).join('') + '</div>']);
    } else if(a.type === 'inventory_item'){
      const p = a.payload || {};
      const old = p.editingId ? (typeof inventoryItems !== 'undefined' ? inventoryItems : []).find(x => x.id === p.editingId) : null;
      facts.push(['Request', old ? 'Change to existing item' : 'Add a new item']);
      facts.push(['Item', escapeHtml(p.name || '—') + (p.category ? ' · ' + escapeHtml(p.category) : '')]);
      const cmp = (label, a1, b1, money) => {
        const f = v => v === undefined || v === null || v === '' ? '—' : (money ? apxMoney(v) : escapeHtml(String(v)));
        if(old && String(old[label[0]] ?? '') !== String(b1 ?? '')) return [label[1], f(a1) + ' → <b>' + f(b1) + '</b>'];
        return [label[1], f(b1)];
      };
      [[['quantity','Quantity'], old && old.quantity, p.quantity, false], [['costPrice','Cost price'], old && old.costPrice, p.costPrice, true],
       [['sellingPrice','Selling price'], old && old.sellingPrice, p.sellingPrice, true], [['threshold','Low-stock alert'], old && old.threshold, p.threshold, false],
       [['applicableClass','Class'], old && old.applicableClass, p.applicableClass, false]].forEach(x => { if(x[2] !== undefined && x[2] !== '') facts.push(cmp(x[0], x[1], x[2], x[3])); });
      if(Number(p.sellingPrice) && Number(p.costPrice) && Number(p.sellingPrice) < Number(p.costPrice)) flags.push(['warn', 'Selling price is below cost price.']);
      if(old && Number(old.quantity) !== Number(p.quantity)) flags.push(['warn', `Stock quantity changes from ${Number(old.quantity)} to ${Number(p.quantity)} — check the reason.`]);
    } else {
      facts.push(['Request', escapeHtml(a.type || 'Request')]);
    }
    facts.push(['Reason given', escapeHtml(a.explanation || 'No reason given')]);
    facts.push(['Requested by', who + (a.requestDate ? ' on ' + apxDay(a.requestDate) : '')]);
    if(!a.explanation) flags.push(['warn', 'No reason was written for this request.']);
    return { facts, flags };
  }
  const APX_RESOURCE_LABELS = { students:'Student', staff:'Staff member', payments:'Fee receipt', 'exam-results':'Exam mark', attendance:'Attendance entry', 'acct-income':'Receipt voucher', 'acct-expenses':'Payment voucher', 'inventory-sales':'Inventory bill', books:'Library book' };
  function apxDeletionDetail(r){
    const facts = [], flags = [];
    facts.push(['What', escapeHtml(APX_RESOURCE_LABELS[r.resource] || r.resource || 'Record') + ': <b>' + escapeHtml(r.recordLabel || r.recordId) + '</b>']);
    facts.push(['Reason', escapeHtml(r.reason || 'No reason given')]);
    facts.push(['Requested by', escapeHtml(r.requestedByName || '—') + (r.requestedAt ? ' on ' + apxDay(r.requestedAt) : '')]);
    if(r.firstApprovedByName) facts.push(['Step 1 approved by', escapeHtml(r.firstApprovedByName) + (r.firstApprovedAt ? ' on ' + apxDay(r.firstApprovedAt) : '')]);
    facts.push(['Stage', r.status === 'Pending' ? 'Step 2 of 3 (first approval)' : 'Final approval — the record is removed when approved']);
    if(r.resource === 'students'){
      const s = students.find(x => x.id === r.recordId);
      if(s){
        facts.push(['Student', escapeHtml(apxStudentName(s)) + ' · ' + escapeHtml(apxStudentClass(s))]);
        try { const t = computeStudentFinance(s).totals; if(t){ facts.push(['Fee position', `Paid ${apxMoney(t.collected)} · balance ${apxMoney(t.receivable !== undefined ? t.receivable : (t.expected - t.collected))}`]); if((t.collected || 0) > 0) flags.push(['warn', 'This student has fee payments on record.']); } } catch(e){}
      }
    }
    if(!r.reason) flags.push(['warn', 'No reason was written for this deletion.']);
    flags.push(['bad', 'Deletion cannot be undone from the app. Reject it if you are not sure.']);
    return { facts, flags };
  }
  // Compact "what is being asked + what to double-check" panel, shared by the Approvals Center-style lists.
  function apxPanelHtml(d){
    if(!d || !d.facts) return '';
    const TONE = { ok:['#e6f6ec','#1d7a43','✔'], info:['#eaf1fb','#2c5b95','ℹ'], warn:['#fff3d6','#8a5a00','⚠'], bad:['#fde8e8','#a32020','⛔'] };
    return `<div style="display:grid; grid-template-columns:minmax(90px,max-content) 1fr; gap:4px 12px; margin-top:8px; font-size:0.8rem;">`
      + d.facts.map(f => `<span style="color:var(--ink-soft);">${f[0]}</span><span style="min-width:0; overflow-wrap:anywhere;">${f[1]}</span>`).join('') + `</div>`
      + (d.flags && d.flags.length ? `<div style="display:grid; gap:4px; margin-top:8px;">${d.flags.map(f => { const t = TONE[f[0]] || TONE.info; return `<div style="font-size:0.76rem; padding:5px 9px; border-radius:8px; background:${t[0]}; color:${t[1]};">${t[2]} ${f[1]}</div>`; }).join('')}</div>` : '');
  }
  async function computeApprovalQueueItems(){
    const items = [];
    const canPromoTransfer = getRolePermission(currentUser.role, 'promotransfer', 'approve');
    const canInventory = getRolePermission(currentUser.role, 'inventory', 'approve');
    const REQUEST_TYPE_LABELS = { promote:['🎓','Promotion request'], transfer:['🚌','Transfer request'], section:['🔀','Section change request'], inventory_item:['📦','Inventory change request'] };
    pendingApprovals.filter(a => a.status === 'Pending').forEach(a => {
      const allowed = a.type === 'inventory_item' ? canInventory : canPromoTransfer;
      if(!allowed) return;
      const [icon, title] = REQUEST_TYPE_LABELS[a.type] || ['📄','Request'];
      items.push({
        id: 'pending_'+a.id, icon, title, sourceLabel:'Requests',
        detail: `${escapeHtml(a.explanation||'')} — by ${escapeHtml(a.requestedBy)} (${escapeHtml(a.requestedByRole)}) on ${a.requestDate||''}`,
        ...(()=>{ try { return apxRequestDetail(a); } catch(e){ return {}; } })(),
        date: a.requestDate || '',
        approveFn: a.type==='inventory_item' ? 'approveInventoryRequest' : 'approveRequest',
        rejectFn: a.type==='inventory_item' ? 'rejectInventoryRequest' : 'rejectRequest',
        args: [a.id],
      });
    });
    if(currentUser.role === 'Admin'){
      groupedDiscountRows().filter(r => r.status==='Pending').forEach(r => {
        const s = students.find(x => x.id === r.studentId);
        const name = s ? `${s.lastName} ${s.firstName}` : r.studentId;
        const requestedDate = (r.records[0] && r.records[0].requestedDate) || '';
        items.push({
          id: 'discount_'+r.batchId+'_'+r.studentId, icon:'💸', title:'Fee discount request', sourceLabel:'Discounts',
          detail: `${escapeHtml(name)} — ${escapeHtml(r.note||r.type||'')} — by ${escapeHtml(r.requestedBy)}`,
          ...(()=>{ try { return apxDiscountDetail(r); } catch(e){ return {}; } })(),
          date: requestedDate,
          approveFn:'approveDiscountGroup', rejectFn:'rejectDiscountGroup', args:[r.batchId, r.studentId],
        });
      });
    }
    if(getRolePermission(currentUser.role, 'staff', 'approve')){
      staffPayrollRecords.filter(r => r.status === 'Draft').forEach(r => {
        const st = staffList.find(x => x.id === r.staffId);
        const name = st ? `${st.firstName} ${st.lastName}` : r.staffId;
        items.push({
          id: 'payroll_'+r.id, icon:'💰', title:'Payroll draft awaiting approval', sourceLabel:'Payroll',
          detail: `${escapeHtml(name)} — ${r.month||''} — Net ${fmtMoney(r.netSalary)}`,
          ...(()=>{ try { return apxPayrollDetail(r); } catch(e){ return {}; } })(),
          date: r.generatedDate || '',
          approveFn:'approvePayroll', rejectFn:null, args:[r.staffId, r.month],
        });
      });
    }
    if(['Admin','Principal'].includes(currentUser.role)){
      try{
        const res = await fetch('/api/deletion-requests');
        if(res.ok){
          const rows = await res.json();
          _deletionRequestsCache = rows; // keep decideDeletionRequest's own Step-3 lookup correct regardless of which UI triggered it
          rows.filter(r => r.status==='Pending' || r.status==='Pending Final Approval').forEach(r => {
            items.push({
              id: 'deletion_'+r.id, icon:'🗑️',
              title: r.status==='Pending' ? 'Deletion request (step 2 of 3)' : 'Deletion request (final step)',
              sourceLabel:'Deletions',
              detail: `${escapeHtml(r.recordLabel||r.recordId)} — ${escapeHtml(r.reason||'')} — by ${escapeHtml(r.requestedByName)}`,
              ...(()=>{ try { return apxDeletionDetail(r); } catch(e){ return {}; } })(),
              date: r.requestedAt ? String(r.requestedAt).slice(0,10) : '',
              approveFn:'decideDeletionRequest', rejectFn:'decideDeletionRequest',
              approveArgs:[r.id,'Approve',r.status], rejectArgs:[r.id,'Reject',r.status],
            });
          });
        }
      }catch(e){ /* network hiccup — skip this source for this refresh, the next poll will pick it up */ }
    }
    if(['Admin','Principal'].includes(currentUser.role)){
      try{
        const res = await fetch('/api/staff-leave-requests');
        if(res.ok){
          const rows = await res.json();
          _staffLeaveCache = rows; // keep the Staff Leave modal's own "All Requests" tab in sync regardless of which UI triggered this refresh
          rows.filter(r => r.status==='Pending').forEach(r => {
            items.push({
              id: 'staffleave_'+r.id, icon:'🌴', title:'Staff leave request', sourceLabel:'Leave',
              detail: `${escapeHtml(r.staffName||r.staffId)} — ${escapeHtml(staffLeaveSpanLabel(r))} — ${escapeHtml(r.reason||'')}`,
              ...(()=>{ try { return apxLeaveDetail(r); } catch(e){ return {}; } })(),
              date: r.requestedAt ? String(r.requestedAt).slice(0,10) : '',
              approveFn:'decideStaffLeaveRequest', rejectFn:'decideStaffLeaveRequest',
              approveArgs:[r.id,'Approve'], rejectArgs:[r.id,'Reject'],
            });
          });
        }
      }catch(e){ /* network hiccup — skip this source for this refresh, the next poll will pick it up */ }
    }
    items.sort((a,b) => (b.date||'').localeCompare(a.date||''));
    return items;
  }
  function openApprovalsCenter(){
    document.getElementById('approvalsCenterModalOverlay').classList.add('open');
    renderApprovalsCenterModal();
  }
  function closeApprovalsCenter(){
    document.getElementById('approvalsCenterModalOverlay').classList.remove('open');
  }
  async function renderApprovalsCenterModal(){
    const body = document.getElementById('approvalsCenterBody');
    if(!body) return;
    body.innerHTML = `<div class="empty-state"><b>Loading…</b></div>`;
    const items = await computeApprovalQueueItems();
    if(!items.length){
      body.innerHTML = `<div class="empty-state"><b>All caught up</b>Nothing is waiting on your approval right now.</div>`;
      return;
    }
    const TONE = { ok:['#e6f6ec','#1d7a43','✔'], info:['#eaf1fb','#2c5b95','ℹ'], warn:['#fff3d6','#8a5a00','⚠'], bad:['#fde8e8','#a32020','⛔'] };
    body.innerHTML = items.map(it => `
      <div class="approvals-item-card" style="flex-direction:column; align-items:stretch;">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <span style="font-size:1.15rem; line-height:1.3;">${it.icon}</span>
          <div style="flex:1; min-width:0;">
            <div><span class="approvals-source-pill">${it.sourceLabel}</span><b>${it.title}</b></div>
            ${it.facts && it.facts.length ? `<div style="display:grid; grid-template-columns:minmax(90px,max-content) 1fr; gap:4px 12px; margin-top:8px; font-size:0.8rem;">
              ${it.facts.map(f => `<span style="color:var(--ink-soft);">${f[0]}</span><span style="min-width:0; overflow-wrap:anywhere;">${f[1]}</span>`).join('')}</div>`
              : `<div class="approvals-item-meta">${it.detail}</div>`}
            ${it.flags && it.flags.length ? `<div style="display:grid; gap:4px; margin-top:8px;">${it.flags.map(f => { const t = TONE[f[0]] || TONE.info; return `<div style="font-size:0.76rem; padding:5px 9px; border-radius:8px; background:${t[0]}; color:${t[1]};">${t[2]} ${f[1]}</div>`; }).join('')}</div>` : ''}
          </div>
        </div>
        <div class="approvals-item-actions" style="margin-top:10px; justify-content:flex-end;">
          ${it.approveFn ? `<button class="btn btn-primary btn-sm" onclick='approvalsCenterAct(${JSON.stringify(it.approveFn)}, ${JSON.stringify(it.approveArgs||it.args)})'>Approve</button>` : ''}
          ${it.rejectFn ? `<button class="btn-danger-text" onclick='approvalsCenterAct(${JSON.stringify(it.rejectFn)}, ${JSON.stringify(it.rejectArgs||it.args)})'>Reject</button>` : ''}
        </div>
      </div>
    `).join('');
  }
  // Every item's buttons route through here so the modal (and the bell
  // badge) always refresh afterward, regardless of which underlying
  // function handled the actual decision — those functions already do their
  // own confirm dialog, save, and toast, exactly as they do from their own
  // page; this only adds the refresh.
  async function approvalsCenterAct(fnName, args){
    const fn = window[fnName];
    if(typeof fn !== 'function') return;
    await fn(...args);
    await renderApprovalsCenterModal();
    await refreshApprovalsBell({ notify:false });
  }

  // ---------- Staff Leave (apply for leave + Admin/Principal approve) ----------
  // A staff member applies here; Admin/Principal approve or reject either
  // from this modal's "All Requests" tab or straight from the Approvals
  // Center bell (computeApprovalQueueItems above adds a 'Leave' source that
  // calls the exact same decideStaffLeaveRequest below — one decision path,
  // two doors to it, same as every other approval source in this app).
  // Approving writes directly into staff_attendance_records server-side
  // (see markFullDayLeave/markHalfDayLeave in server.js) — nothing here
  // marks attendance itself.
  let _staffLeaveCache = [];
  let staffLeaveTab = 'apply';
  function openStaffLeaveModal(){
    document.getElementById('staffLeaveModalOverlay').classList.add('open');
    document.getElementById('staffLeaveTabAll').style.display = ['Admin','Principal'].includes(currentUser.role) ? 'inline-flex' : 'none';
    switchStaffLeaveTab('apply');
  }
  function closeStaffLeaveModal(){
    document.getElementById('staffLeaveModalOverlay').classList.remove('open');
  }
  function switchStaffLeaveTab(tab){
    staffLeaveTab = tab;
    ['apply','mine','all'].forEach(t => {
      const btn = document.getElementById('staffLeaveTab' + t.charAt(0).toUpperCase() + t.slice(1));
      if(btn) btn.classList.toggle('active', t === tab);
    });
    renderStaffLeaveModalBody();
  }
  function staffLeaveStatusPill(status){
    const color = status==='Approved' ? '#1d8a4a' : (status==='Rejected' ? '#a80d5d' : '#a5760a');
    return `<span style="font-weight:700; color:${color};">${escapeHtml(status)}</span>`;
  }
  // Shared by the "My Requests"/"All Requests" list rendering below and the
  // Approvals Center item's detail line, so a request always reads the same
  // way wherever it's shown.
  function staffLeaveSpanLabel(r){
    if(r.session) return `${r.fromDate} · ${r.session} (half day)`;
    return r.fromDate === r.toDate ? r.fromDate : `${r.fromDate} to ${r.toDate}`;
  }
  function toggleStaffLeaveKind(){
    const isHalf = document.querySelector('input[name="slKind"]:checked').value === 'half';
    document.getElementById('slSessionWrap').style.display = isHalf ? 'block' : 'none';
    document.getElementById('slToDateWrap').style.display = isHalf ? 'none' : 'block';
    if(isHalf){
      const from = document.getElementById('slFromDate').value;
      if(from) document.getElementById('slToDate').value = from;
    }
  }
  async function renderStaffLeaveModalBody(){
    const body = document.getElementById('staffLeaveModalBody');
    if(!body) return;
    if(staffLeaveTab === 'apply'){
      const today = new Date().toISOString().slice(0,10);
      body.innerHTML = `
        <div style="display:flex; gap:16px; align-items:center; margin-bottom:14px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;"><input type="radio" name="slKind" value="full" checked onchange="toggleStaffLeaveKind()"> Full day(s)</label>
          <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;"><input type="radio" name="slKind" value="half" onchange="toggleStaffLeaveKind()"> Half day</label>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
          <div>
            <label style="font-size:0.78rem; color:var(--ink-soft); display:block; margin-bottom:4px;">From</label>
            <input type="date" class="input" id="slFromDate" value="${today}" style="max-width:180px;">
          </div>
          <div id="slToDateWrap">
            <label style="font-size:0.78rem; color:var(--ink-soft); display:block; margin-bottom:4px;">To</label>
            <input type="date" class="input" id="slToDate" value="${today}" style="max-width:180px;">
          </div>
          <div id="slSessionWrap" style="display:none;">
            <label style="font-size:0.78rem; color:var(--ink-soft); display:block; margin-bottom:4px;">Session</label>
            <select class="input" id="slSession" style="max-width:160px;">
              <option value="Morning">🌅 Morning</option>
              <option value="Afternoon">🌇 Afternoon</option>
            </select>
          </div>
        </div>
        <label style="font-size:0.78rem; color:var(--ink-soft); display:block; margin-bottom:4px;">Reason</label>
        <textarea class="input" id="slReason" rows="3" placeholder="Reason for leave" style="width:100%; margin-bottom:14px;"></textarea>
        <button type="button" class="btn btn-primary" onclick="submitStaffLeaveRequest()">Submit Request</button>
      `;
      return;
    }
    body.innerHTML = `<div class="empty-state"><b>Loading…</b></div>`;
    try{
      const res = await fetch('/api/staff-leave-requests');
      _staffLeaveCache = await (await throwIfNotOk(res)).json();
    }catch(e){
      body.innerHTML = `<div class="empty-state"><b>Couldn't load requests.</b></div>`;
      return;
    }
    const rows = _staffLeaveCache.slice().sort((a,b) => (b.requestedAt||'').localeCompare(a.requestedAt||''));
    if(staffLeaveTab === 'mine'){
      if(!rows.length){ body.innerHTML = `<div class="empty-state"><b>No leave requests yet</b>Use the Apply tab to submit one.</div>`; return; }
      body.innerHTML = rows.map(r => `
        <div class="approvals-item-card">
          <div>
            <div><b>${escapeHtml(staffLeaveSpanLabel(r))}</b> — ${staffLeaveStatusPill(r.status)}</div>
            <div class="approvals-item-meta">${escapeHtml(r.reason||'')}</div>
            ${r.decisionNote ? `<div class="approvals-item-meta">Note: ${escapeHtml(r.decisionNote)}</div>` : ''}
          </div>
        </div>
      `).join('');
      return;
    }
    // 'all' — Admin/Principal only (see openStaffLeaveModal's tab gate above)
    if(!rows.length){ body.innerHTML = `<div class="empty-state"><b>No leave requests</b></div>`; return; }
    body.innerHTML = rows.map(r => {
      let panel = '';
      if(r.status === 'Pending'){ try { panel = apxPanelHtml(apxLeaveDetail(r)); } catch(e){} }
      return `
      <div class="approvals-item-card"${panel ? ' style="flex-direction:column; align-items:stretch;"' : ''}>
        <div>
          <div><b>${escapeHtml(r.staffName||r.staffId)}</b> — ${escapeHtml(staffLeaveSpanLabel(r))} — ${staffLeaveStatusPill(r.status)}</div>
          ${panel || `<div class="approvals-item-meta">${escapeHtml(r.reason||'')} — by ${escapeHtml(r.requestedByName||'')}</div>`}
        </div>
        ${r.status==='Pending' ? `
        <div class="approvals-item-actions"${panel ? ' style="margin-top:10px; justify-content:flex-end;"' : ''}>
          <button class="btn btn-primary btn-sm" onclick="decideStaffLeaveRequest('${r.id}','Approve')">Approve</button>
          <button class="btn-danger-text" onclick="decideStaffLeaveRequest('${r.id}','Reject')">Reject</button>
        </div>` : ''}
      </div>
    `;}).join('');
  }
  async function submitStaffLeaveRequest(){
    const isHalf = document.querySelector('input[name="slKind"]:checked').value === 'half';
    const fromDate = document.getElementById('slFromDate').value;
    const toDate = document.getElementById('slToDate').value;
    const session = document.getElementById('slSession').value;
    const reason = document.getElementById('slReason').value.trim();
    if(!fromDate){ showToast('Pick a from date.'); return; }
    if(!isHalf && toDate && toDate < fromDate){ showToast('To date cannot be before from date.'); return; }
    if(!reason){ showToast('Enter a reason.'); return; }
    try{
      await throwIfNotOk(await fetch('/api/staff-leave-requests', {
        method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
        body: JSON.stringify({ fromDate, toDate: isHalf ? fromDate : toDate, isHalfDay:isHalf, session: isHalf ? session : null, reason })
      }));
      showToast('Leave request submitted.', 'burst');
      switchStaffLeaveTab('mine');
    }catch(e){
      showToast(e.message || 'Could not submit the request.');
    }
  }
  async function decideStaffLeaveRequest(id, decision){
    const confirmMsg = decision === 'Approve'
      ? 'Approve this leave request? This will mark the staff member\'s attendance as Leave for the requested date(s), overwriting any existing mark.'
      : 'Reject this leave request?';
    if(!await showConfirmDialog(confirmMsg)) return;
    try{
      await throwIfNotOk(await fetch('/api/staff-leave-requests?id=' + encodeURIComponent(id), {
        method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()},
        body: JSON.stringify({ decision })
      }));
      showToast(`Leave request ${decision==='Approve' ? 'approved' : 'rejected'}.`, 'burst');
      if(document.getElementById('staffLeaveModalOverlay').classList.contains('open')) await renderStaffLeaveModalBody();
    }catch(e){
      showToast(e.message || 'Could not save the decision.');
    }
  }

  // ---- Bell badge, live poll, and new-item alert ----
  const APPROVALS_SEEN_KEY = 'rgv_seen_approval_ids';
  let approvalsPollTimer = null;
  function loadSeenApprovalIds(){
    try{ return new Set(JSON.parse(localStorage.getItem(APPROVALS_SEEN_KEY) || '[]')); }catch(e){ return new Set(); }
  }
  function saveSeenApprovalIds(idSet){
    try{
      // Cap it — this is just "have I alerted for this one already", not a
      // permanent audit log, so an unbounded list serves no purpose.
      const arr = Array.from(idSet).slice(-500);
      localStorage.setItem(APPROVALS_SEEN_KEY, JSON.stringify(arr));
    }catch(e){}
  }
  // Two-tone chime via WebAudio — no audio file to fetch/host, so it never
  // adds a network dependency or a missing-asset failure mode.
  function playApprovalChime(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 660].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        osc.connect(gain); gain.connect(ctx.destination);
        const start = ctx.currentTime + i * 0.14;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
        osc.start(start); osc.stop(start + 0.24);
      });
    }catch(e){ /* WebAudio unavailable — the toast + Notification are enough */ }
  }
  // opts.notify: false while re-rendering right after the user's own
  // approve/reject click (nothing "new" just happened, so no chime/popup
  // for the action they themselves just took).
  async function refreshApprovalsBell(opts){
    opts = opts || {};
    const btn = document.getElementById('approvalsBellBtn');
    const badge = document.getElementById('approvalsBellBadge');
    if(!btn || !badge) return;
    if(!userCanSeeApprovalsBell()){ btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    const items = await computeApprovalQueueItems();
    const label = items.length > 9 ? '9+' : String(items.length);
    if(items.length > 0){ badge.textContent = label; badge.style.display = 'flex'; btn.classList.add('has-pending'); }
    else { badge.style.display = 'none'; btn.classList.remove('has-pending'); }

    if(opts.notify === false){
      // Still keep the seen-set current so a later real poll doesn't treat
      // items visible in this refresh as "new".
      saveSeenApprovalIds(new Set(items.map(it => it.id)));
      return;
    }
    const seen = loadSeenApprovalIds();
    const isFirstRun = !approvalsBaselineDone;
    const freshItems = items.filter(it => !seen.has(it.id));
    if(!isFirstRun && freshItems.length){
      const first = freshItems[0];
      const msg = freshItems.length === 1
        ? `New approval needed: ${first.title.replace(' request','')} — ${first.detail.replace(/<[^>]*>/g,'')}`
        : `${freshItems.length} new items need your approval.`;
      showToast(msg, 'burst');
      playApprovalChime();
      if('Notification' in window && Notification.permission === 'granted'){
        try{ new Notification('Approval needed', { body: msg, icon:'/icon-192.png', tag:'approvals-center' }); }catch(e){}
      }
    }
    approvalsBaselineDone = true;
    saveSeenApprovalIds(new Set(items.map(it => it.id)));
  }
  let approvalsBaselineDone = false;
  function startApprovalsWatcher(){
    if(!userCanSeeApprovalsBell()) return;
    approvalsBaselineDone = false;
    if('Notification' in window && Notification.permission === 'default'){
      Notification.requestPermission().catch(()=>{});
    }
    refreshApprovalsBell();
    if(approvalsPollTimer) clearInterval(approvalsPollTimer);
    approvalsPollTimer = setInterval(refreshApprovalsBell, 30000);
  }
  function stopApprovalsWatcher(){
    if(approvalsPollTimer){ clearInterval(approvalsPollTimer); approvalsPollTimer = null; }
    const btn = document.getElementById('approvalsBellBtn');
    if(btn) btn.style.display = 'none';
  }

  function openDuplicatesModal(){
    renderDuplicatesModal();
    document.getElementById('duplicatesModalOverlay').classList.add('open');
    document.getElementById('moreActionsMenu').classList.remove('open');
  }
  function closeDuplicatesModal(){
    document.getElementById('duplicatesModalOverlay').classList.remove('open');
  }
  function renderDuplicatesModal(){
    const groups = {};
    students.forEach(s => {
      const key = ((s.firstName||'').trim() + ' ' + (s.lastName||'').trim()).trim().toLowerCase();
      if(!key) return;
      groups[key] = groups[key] || [];
      groups[key].push(s);
    });
    const dupGroups = Object.values(groups).filter(g => g.length > 1);
    const body = document.getElementById('duplicatesModalBody');
    const bulkBtn = document.getElementById('deleteAllDuplicatesBtn');
    // The one-step bulk action bypasses the usual 3-step deletion approval
    // (see deleteAllDuplicates() and handleDeleteDuplicateStudents on the
    // server), so it's restricted to Admin/Principal — same gate the
    // server itself enforces — and only ever shown when there's actually
    // something to clean up.
    if(bulkBtn) bulkBtn.style.display = (isManagementUser() && dupGroups.length > 0) ? 'inline-flex' : 'none';
    if(dupGroups.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No duplicates found</b>Every student has a unique first + last name.</div>`;
      return;
    }
    body.innerHTML = dupGroups.map(group => `
      <div style="margin-bottom:18px;">
        <div style="font-weight:700; color:var(--navy); margin-bottom:8px;">${group[0].lastName} ${group[0].firstName} <span style="font-weight:400; color:var(--ink-soft); font-size:0.78rem;">(${group.length} records)</span></div>
        ${group.map(s => `
          <div class="list-manage-row">
            <div style="font-size:0.82rem;">
              <div class="lm-name">${s.admissionNo} · ${s.className} — ${s.section}</div>
              <div class="lm-meta">Father: ${s.fatherName||'—'} · Phone: ${s.fatherPhone||s.motherPhone||'—'} · Status: ${s.status||'Active'}</div>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn-edit-text" onclick="closeDuplicatesModal(); editStudent('${s.id}');">View / Edit</button>
              <button class="btn-danger-text" onclick="deleteDuplicateEntry('${s.id}')">Request Deletion</button>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');
  }
  async function deleteDuplicateEntry(id){
    const s = students.find(x => x.id === id);
    if(!s) return;
    if(!await showConfirmDialog(`Start a 3-step deletion request for this duplicate record (${s.lastName} ${s.firstName}, ${s.admissionNo})? This is step 1 of 3 — nothing is deleted yet.`)) return;
    try{
      await throwIfNotOk(await fetch('/api/deletion-requests', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()}, body:JSON.stringify({ resource:'students', recordId:id, reason:'Duplicate record (flagged from Find Duplicate Students)' }) }));
      renderDuplicatesModal();
      showToast('Step 1 of 3 recorded — open Pending Deletion Requests to continue.', 'burst');
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast('Could not send the deletion request (' + e.message + ').');
    }
  }
  // One-step cleanup for everything the modal above is already showing:
  // deletes every duplicate in a single request, keeping only the
  // original (earliest-added) record per name group. This is the only
  // path that skips the normal 3-step deletion approval — and only for
  // records already flagged here as duplicates; every other student
  // deletion still goes through "Request Deletion" above. Restricted to
  // Admin/Principal (see isManagementUser() gating the button itself, and
  // handleDeleteDuplicateStudents enforcing the same rule server-side).
  async function deleteAllDuplicates(){
    const groups = {};
    students.forEach(s => {
      const key = ((s.firstName||'').trim() + ' ' + (s.lastName||'').trim()).trim().toLowerCase();
      if(!key) return;
      groups[key] = groups[key] || [];
      groups[key].push(s);
    });
    const dupGroups = Object.values(groups).filter(g => g.length > 1);
    const extraCount = dupGroups.reduce((n,g) => n + g.length - 1, 0);
    if(!extraCount){ showToast('No duplicates to delete.'); return; }
    const preview = dupGroups.slice(0,8).map(g => `${g[0].lastName} ${g[0].firstName} (${g.length} records)`).join('\n');
    const more = dupGroups.length > 8 ? `\n…and ${dupGroups.length - 8} more name(s).` : '';
    const msg = `Delete ${extraCount} duplicate record(s) across ${dupGroups.length} name(s) in one step, keeping only the original (earliest-added) entry for each name?\n\nThis skips the usual 3-step deletion approval — it applies only to these flagged duplicates. Removed records go to Recently Deleted and can be restored.\n\n${preview}${more}`;
    if(!await showConfirmDialog(msg, { title:'Delete all duplicate students?', okText:'Delete Duplicates' })) return;
    try{
      const res = await throwIfNotOk(await fetch('/api/students?action=delete-duplicates', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()} }));
      const result = await res.json();
      await loadStudents();
      renderDuplicatesModal();
      showToast(`Deleted ${result.deletedCount} duplicate record(s) — kept the original in each case.`);
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast('Could not delete duplicates (' + e.message + ').');
    }
  }

  /* ===== SHARED CERTIFICATE LETTERHEAD (Transfer / Character / Migration) =====
     Study Certificate keeps its own dedicated modal/print function below
     (unchanged, already in production) — these three newer certificate
     types share one modal (#certModalOverlay) and these two template
     helpers, so the school logo, header and signature block look and stay
     consistent across every certificate the school issues. */
  