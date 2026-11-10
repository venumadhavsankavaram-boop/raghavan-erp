/* ============================================================================
   81 - Payroll, the professional way
   - Pay period: a school can run its salary from any day to the day before (e.g. 26th to 25th) instead of the 1st to the last day.
     Attendance and the per-day rate for loss of pay follow that period. A salary date can be set (same month or the next).
   - Pay mode: Bank transfer / Cheque / Cash, a default for the school, a choice for each staff member, and a final choice at payment.
   - Payment record: mark each salary as paid (date, cheque number or bank reference, who paid it). Paid salaries cannot be reopened.
   - Who is on the payroll: leave out the Principal, trustees or anyone else (by designation or one by one). Their past approved
     months still show, so old records never disappear.
   - Bank upload sheet (CSV), cheque register and cash signing sheet.
   Approved payrolls keep their numbers exactly as they were approved; changing the period only affects months not yet approved.
   ========================================================================== */
(function(){
  'use strict';
  const KEY = 'payroll-settings';
  const MODES = ['Bank Transfer', 'Cheque', 'Cash'];
  const DEF = { periodStartDay: 1, payDay: 0, payInNextMonth: false, lopBasis: 'period', lopFixed: 30, defaultMode: 'Bank Transfer', excludeDesignations: [] };
  try{ OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; }catch(e){}

  const $ = id => document.getElementById(id);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => { try{ return fmtMoney(n); }catch(e){ return '₹' + Number(n || 0).toLocaleString('en-IN'); } };
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
  const dim = (y, m) => new Date(y, m, 0).getDate();
  const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const fmtD = s => { if(!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return d + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] + ' ' + y; };
  const nameOf = st => ((st.firstName || '') + ' ' + (st.lastName || '')).trim();
  const can = what => { try{ return getStaffSubpageAccess(currentUser.role, 'staff_payroll', what); }catch(e){ return false; } };
  const toast = (m, k) => { try{ showToast(m, k); }catch(e){} };
  const rerender = () => { try{ renderStaffBody(); }catch(e){} };

  let S = Object.assign({}, DEF, { excludeDesignations: [] });
  let pickedMonth = false;
  let settingsOpen = false;
  let payDate = '';

  function norm(o){
    o = o && typeof o === 'object' ? o : {};
    const n = x => { x = Math.floor(Number(x)); return isFinite(x) ? x : 0; };
    const psd = n(o.periodStartDay); const pd = n(o.payDay);
    return {
      periodStartDay: psd >= 1 && psd <= 28 ? psd : 1,
      payDay: pd >= 1 && pd <= 31 ? pd : 0,
      payInNextMonth: !!o.payInNextMonth,
      lopBasis: o.lopBasis === 'fixed' ? 'fixed' : 'period',
      lopFixed: (n(o.lopFixed) >= 20 && n(o.lopFixed) <= 31) ? n(o.lopFixed) : 30,
      defaultMode: MODES.includes(o.defaultMode) ? o.defaultMode : 'Bank Transfer',
      excludeDesignations: Array.isArray(o.excludeDesignations) ? o.excludeDesignations.map(x => String(x).trim()).filter(Boolean).slice(0, 60) : [],
      updatedBy: o.updatedBy || '', updatedAt: o.updatedAt || '',
    };
  }
  async function loadSettings(){
    try{ S = norm(await storageGet(KEY, {})); }catch(e){}
    if(!pickedMonth){ try{ staffPayrollMonth = defaultMonth(); }catch(e){} }
  }

  /* ---------- period maths ---------- */
  function periodOf(monthStr, st){
    const [y, m] = String(monthStr || '').split('-').map(Number);
    if(!y || !m) return { from: '', to: '', days: 30, custom: false };
    const d = (st || S).periodStartDay;
    let from, to;
    if(d <= 1){ from = iso(y, m, 1); to = iso(y, m, dim(y, m)); }
    else { const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1; from = iso(py, pm, d); to = iso(y, m, d - 1); }
    const u = x => { const a = x.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); };
    const days = Math.round((u(to) - u(from)) / 86400000) + 1;
    return { from, to, days, custom: d > 1 };
  }
  function recPeriod(rec, monthStr){
    if(rec && rec.periodFrom && rec.periodTo) return { from: rec.periodFrom, to: rec.periodTo, days: rec.periodDays || 0, custom: true };
    const [y, m] = String(monthStr).split('-').map(Number);
    return { from: iso(y, m, 1), to: iso(y, m, dim(y, m)), days: dim(y, m), custom: false };
  }
  function salaryDate(monthStr){
    if(!S.payDay) return '';
    let [y, m] = String(monthStr).split('-').map(Number); if(!y) return '';
    if(S.payInNextMonth){ m += 1; if(m > 12){ m = 1; y += 1; } }
    return iso(y, m, Math.min(S.payDay, dim(y, m)));
  }
  function defaultMonth(){
    const n = new Date(); let y = n.getFullYear(), m = n.getMonth() + 1;
    if(S.periodStartDay > 1 && n.getDate() >= S.periodStartDay){ m += 1; if(m > 12){ m = 1; y += 1; } }
    return y + '-' + pad(m);
  }
  window.payrollPeriod = periodOf;
  const monthName = (mStr, long) => new Date(mStr + '-01').toLocaleString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' });
  const periodText = p => fmtD(p.from) + ' – ' + fmtD(p.to);

  /* ---------- plug into the existing calculation ---------- */
  window.daysInPayrollMonth = function(monthStr){
    if(S.lopBasis === 'fixed') return S.lopFixed;
    const p = periodOf(monthStr); return p.days || 30;
  };
  window.staffAttendanceCountInMonth = function(staffId, monthStr, statuses){
    const p = periodOf(monthStr);
    return staffAttDaysByStatus(staffId, p.from, p.to, statuses);
  };
  const origCompute = window.computeStaffPayroll;
  window.computeStaffPayroll = function(staffId, monthStr){
    const r = origCompute.apply(this, arguments);
    if(r){
      const p = periodOf(monthStr); r.periodFrom = p.from; r.periodTo = p.to; r.periodDays = p.days;
      // Salary is worked out in whole rupees: no paise anywhere.
      const R = x => { x = Math.round(Number(x) || 0); return x === 0 ? 0 : x; };
      const advBefore = Number(r.advanceDeduction) || 0;
      ['basic', 'lopDeduction', 'epfEmployee', 'epfEmployer', 'esiEmployee', 'esiEmployer', 'otherDeductions', 'bonus', 'advanceDeduction'].forEach(k => { if(k in r) r[k] = R(r[k]); });
      if(Array.isArray(r.advanceBreakdown) && r.advanceBreakdown.length){
        const diff = r.advanceDeduction - advBefore, last = r.advanceBreakdown[r.advanceBreakdown.length - 1];
        if(diff && last) last.amount = Math.max(0, Math.round((Number(last.amount) + diff) * 100) / 100);
      }
      r.grossSalary = r.basic + r.bonus;
      r.totalDeductions = R(r.lopDeduction + r.epfEmployee + r.esiEmployee + r.otherDeductions + r.advanceDeduction);
      r.netSalary = r.grossSalary - r.totalDeductions;
    }
    return r;
  };
  const origMonthChange = window.onStaffPayrollMonthChange;
  window.onStaffPayrollMonthChange = function(){ pickedMonth = true; return origMonthChange.apply(this, arguments); };
  window.payrollMonthOptions = function(){
    const opts = [], now = new Date();
    for(let i = -1; i < 12; i++){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      if(i === -1 && S.periodStartDay <= 1) continue;
      const p = periodOf(v);
      opts.push(`<option value="${v}" ${v === staffPayrollMonth ? 'selected' : ''}>${esc(monthName(v, true))}${p.custom ? ' · ' + esc(fmtD(p.from).replace(/ \d{4}$/, '')) + ' to ' + esc(fmtD(p.to).replace(/ \d{4}$/, '')) : ''}</option>`);
    }
    return opts.join('');
  };
  const origLoadPayroll = window.loadStaffPayroll;
  window.loadStaffPayroll = async function(){ const r = await origLoadPayroll.apply(this, arguments); await loadSettings(); return r; };

  /* ---------- who is on the payroll ---------- */
  const isExcl = st => !!st.payrollExcluded || (S.excludeDesignations || []).includes(String(st.designation || '').trim());
  const hasLocked = (st, m) => { const r = findPayrollRecord(st.id, m); return !!(r && r.status === 'Approved'); };
  window.payrollStaffList = function(monthStr){
    const m = monthStr || staffPayrollMonth;
    return staffList.filter(staffIsActive).filter(st => !isExcl(st) || hasLocked(st, m));
  };
  const excludedList = m => staffList.filter(staffIsActive).filter(st => isExcl(st) && !hasLocked(st, m));
  window.payrollSetExcluded = async function(id, flag){
    if(!can('edit')){ toast("You don't have permission to change who is on the payroll."); return; }
    const st = staffList.find(x => x.id === id); if(!st) return;
    if(flag && hasLocked(st, staffPayrollMonth)){ toast('This month is already approved for ' + nameOf(st) + '. Reopen it first if you really want to remove them.'); return; }
    if(flag && !(await showConfirmDialog(`Take ${nameOf(st)} off the payroll? They will no longer appear in Payroll, the Salary Register or Disbursement. Any unfinished draft for them is removed. Their old approved months stay, and you can bring them back any time.`))) return;
    st.payrollExcluded = !!flag;
    try{ await storageSet(STAFF_KEY, staffList); }catch(e){ st.payrollExcluded = !flag; toast('Could not save. Please try again.'); return; }
    if(flag){
      // An unfinished draft for someone who is now off the payroll would otherwise sit in the approvals list.
      const keep = staffPayrollRecords.filter(r => !(r.staffId === id && r.status === 'Draft'));
      if(keep.length !== staffPayrollRecords.length){ staffPayrollRecords.length = 0; keep.forEach(r => staffPayrollRecords.push(r)); try{ await saveRecords(); }catch(e){} }
    }
    toast(flag ? nameOf(st) + ' is now off the payroll.' : nameOf(st) + ' is back on the payroll.');
    rerender();
  };

  /* ---------- pay mode helpers ---------- */
  const modeOf = (st, rec) => (rec && MODES.includes(rec.payMode) && rec.payMode) || (MODES.includes(st.payMode) && st.payMode) || S.defaultMode;
  const isPaid = rec => !!(rec && rec.payStatus === 'Paid');
  async function saveRecords(){ await storageSet(STAFF_PAYROLL_KEY, staffPayrollRecords); }

  const origReopen = window.reopenPayroll;
  window.reopenPayroll = async function(staffId, monthStr){
    const rec = findPayrollRecord(staffId, monthStr);
    if(isPaid(rec)){ toast('This salary is marked as paid. Undo the payment under Salary Disbursement first, then reopen.'); return; }
    return origReopen.apply(this, arguments);
  };

  /* ---------- Salary disbursement ---------- */
  window.salaryDisbursementData = function(monthStr){
    const list = payrollStaffList(monthStr).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const rows = [], notApproved = [];
    list.forEach(st => {
      const rec = findPayrollRecord(st.id, monthStr);
      if(!rec || rec.status !== 'Approved'){ notApproved.push(st); return; }
      const mode = modeOf(st, rec);
      rows.push({
        staffId: st.id, rec, mode, name: nameOf(st), designation: st.designation || '', department: st.department || '',
        bankName: st.bankName || '', accountName: st.bankAccountName || nameOf(st), accountNumber: st.bankAccountNumber || '', ifsc: st.bankIfsc || '',
        netSalary: Number(rec.netSalary) || 0, paid: isPaid(rec), paidDate: rec.paidDate || '', ref: rec.payRef || '',
        missingBank: mode === 'Bank Transfer' && !(st.bankAccountNumber && st.bankIfsc),
      });
    });
    const sum = a => Math.round(a.reduce((s, r) => s + r.netSalary, 0) * 100) / 100;
    const total = sum(rows), paid = sum(rows.filter(r => r.paid));
    const byMode = {}; MODES.forEach(m => { const x = rows.filter(r => r.mode === m); byMode[m] = { n: x.length, amt: sum(x), pending: x.filter(r => !r.paid).length }; });
    return { rows, notApproved, total, paid, pending: Math.round((total - paid) * 100) / 100, byMode, missingBank: rows.filter(r => r.missingBank) };
  };
  const stBy = id => staffList.find(x => x.id === id) || {};

  function detailCell(r, canPay){
    const locked = r.paid || !canPay;
    if(r.mode === 'Bank Transfer'){
      return r.missingBank
        ? `<span class="pd-warn">No bank account or IFSC. <a href="#" onclick="openStaffProfile('${r.staffId}');return false;">Add</a></span>`
        : `<div style="font-size:.78rem"><b>${esc(r.bankName || 'Bank')}</b><br><span class="pd-mono">${esc(r.accountNumber)}</span> · <span class="pd-mono">${esc(r.ifsc)}</span><br><span style="color:var(--ink-soft)">${esc(r.accountName)}</span></div>
           <input class="pd-in" ${locked ? 'disabled' : ''} id="pdRef_${r.staffId}" placeholder="UTR / reference (optional)" value="${esc(r.ref)}" onchange="payrollSetRef('${r.staffId}', this.value)">`;
    }
    if(r.mode === 'Cheque'){
      return `<div style="font-size:.78rem">Payee: <b>${esc(r.accountName)}</b></div><input class="pd-in" ${locked ? 'disabled' : ''} id="pdRef_${r.staffId}" placeholder="Cheque number" inputmode="numeric" value="${esc(r.ref)}" onchange="payrollSetRef('${r.staffId}', this.value)">`;
    }
    return `<span style="font-size:.78rem;color:var(--ink-soft)">Cash in hand. Staff signs on the cash sheet.</span>${r.paid ? '' : ''}<input class="pd-in" ${locked ? 'disabled' : ''} id="pdRef_${r.staffId}" placeholder="Voucher / note (optional)" value="${esc(r.ref)}" onchange="payrollSetRef('${r.staffId}', this.value)">`;
  }
  function pdCss(){
    if($('pdCss')) return;
    const s = document.createElement('style'); s.id = 'pdCss';
    s.textContent = `.pd-in{width:100%;box-sizing:border-box;margin-top:5px;padding:7px 9px;border:1.5px solid var(--border,#e3e0f0);border-radius:9px;font:inherit;font-size:.8rem}
      .pd-mono{font-family:'IBM Plex Mono',monospace}.pd-warn{color:#b3261e;font-size:.78rem;font-weight:600}
      .pd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:0 0 14px}
      .pd-tile{border:1.5px solid var(--border,#e3e0f0);border-radius:12px;padding:10px 12px;background:#fff}.pd-tile span{display:block;font-size:.7rem;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft,#5b5a73)}.pd-tile b{font-size:1.08rem}
      .pd-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}.pd-bar label{font-size:.78rem;color:var(--ink-soft,#5b5a73)}
      .pd-bar input,.pd-bar select{padding:7px 9px;border:1.5px solid var(--border,#e3e0f0);border-radius:9px;font:inherit;font-size:.82rem}
      .pd-sel{padding:6px 8px;border:1.5px solid var(--border,#e3e0f0);border-radius:9px;font:inherit;font-size:.8rem;background:#fff}
      .pd-pill{display:inline-block;white-space:nowrap;border-radius:999px;padding:2px 10px;font-size:.68rem;font-weight:700}.pd-pill.p{background:rgba(31,122,77,.13);color:#1f7a4d}.pd-pill.u{background:rgba(184,98,27,.13);color:#b8621b}
      .pp-card{margin:0 0 18px;border:1.5px solid var(--border,#e3e0f0);border-radius:16px;background:#fff;padding:14px 16px}
      .pp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-top:12px}
      .pp-grid label{display:block;font-weight:600;font-size:.8rem;margin:0 0 4px}.pp-grid input,.pp-grid select{width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid var(--border,#e3e0f0);border-radius:11px;font:inherit}
      .pp-hint{font-size:.74rem;color:var(--ink-soft,#5b5a73);margin:4px 0 0;line-height:1.4}
      .pp-chk{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:6px}.pp-chk label{font-weight:500;display:flex;gap:6px;align-items:center;margin:0}.pp-chk input{width:auto}
      .pp-ex{margin:0 0 14px;border:1.5px dashed var(--border,#e3e0f0);border-radius:12px;padding:10px 12px;font-size:.82rem;background:#faf9ff}`;
    document.head.appendChild(s);
  }
  window.renderSalaryDisbursementCard = function(){
    pdCss();
    const m = staffPayrollMonth, label = monthName(m, true);
    const d = salaryDisbursementData(m), p = periodOf(m);
    const canPay = can('approve');
    if(!payDate) payDate = todayIso();
    const sd = salaryDate(m);
    const late = sd && todayIso() > sd && d.rows.some(r => !r.paid);
    const rowsHtml = d.rows.map(r => `<tr>
      <td class="name-cell" style="cursor:pointer" onclick="openStaffProfile('${r.staffId}')">${esc(r.name)}<div style="font-size:.7rem;color:var(--ink-soft);font-weight:400">${esc(r.designation)}${r.department ? ' · ' + esc(r.department) : ''}</div></td>
      <td><select class="pd-sel" ${r.paid || !can('edit') ? 'disabled' : ''} onchange="payrollSetMode('${r.staffId}', this.value)">${MODES.map(x => `<option ${x === r.mode ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td>${detailCell(r, canPay)}</td>
      <td><b>${money(r.netSalary)}</b></td>
      <td>${r.paid ? `<span class="pd-pill p">Paid</span><div style="font-size:.7rem;color:var(--ink-soft)">${esc(fmtD(r.paidDate))}${r.rec.paidBy ? '<br>by ' + esc(r.rec.paidBy) : ''}</div>` : '<span class="pd-pill u">To pay</span>'}</td>
      <td>${canPay ? (r.paid ? `<button class="btn-edit-text" style="color:var(--magenta)" onclick="payrollUndoPaid('${r.staffId}')">Undo</button>` : `<button class="btn-edit-text" style="color:#1f7a4d;white-space:nowrap" onclick="payrollMarkPaid('${r.staffId}')">Mark paid</button>`) : ''}</td>
    </tr>`).join('');
    const modeTiles = MODES.map(x => `<div class="pd-tile"><span>${x}</span><b>${money(d.byMode[x].amt)}</b><div style="font-size:.72rem;color:var(--ink-soft)">${d.byMode[x].n} staff · ${d.byMode[x].pending} to pay</div></div>`).join('');
    return `<div class="profile-card" id="pdCard" style="margin-top:24px;border-top:4px solid var(--teal)">
      <h4 style="margin:0 0 4px">💸 Salary Disbursement — ${esc(label)}</h4>
      <p style="font-size:.8rem;color:var(--ink-soft);margin:0 0 12px">Pay period <b>${esc(periodText(p))}</b>${sd ? ` · Salary date <b>${esc(fmtD(sd))}</b>` : ' · No salary date set (see Payroll settings above)'}.
        Only <b>Approved</b> payrolls appear here. Choose how each person is paid (bank transfer, cheque or cash), then mark them paid. A paid salary is locked until you press Undo.</p>
      ${late ? `<div class="pd-warn" style="margin:0 0 10px">⚠ The salary date has passed and ${d.rows.filter(r => !r.paid).length} salaries are still to pay.</div>` : ''}
      ${d.rows.length ? `
      <div class="pd-tiles"><div class="pd-tile"><span>Approved to pay</span><b>${money(d.total)}</b><div style="font-size:.72rem;color:var(--ink-soft)">${d.rows.length} staff</div></div>
        <div class="pd-tile"><span>Paid</span><b style="color:#1f7a4d">${money(d.paid)}</b></div><div class="pd-tile"><span>Still to pay</span><b style="color:#b8621b">${money(d.pending)}</b></div>${modeTiles}</div>
      ${canPay ? `<div class="pd-bar"><label>Payment date <input type="date" id="pdDate" value="${esc(payDate)}" onchange="payrollSetDate(this.value)"></label>
        <label>Pay all pending by <select id="pdBulkMode"><option value="">Every mode</option>${MODES.map(x => `<option>${x}</option>`).join('')}</select></label>
        <button class="btn btn-ghost btn-sm" onclick="payrollMarkAllPaid()">✔ Mark them paid</button>
        <label style="margin-left:auto">Cheque numbers from <input type="text" id="pdChqStart" inputmode="numeric" style="width:110px" placeholder="e.g. 004501"></label>
        <button class="btn btn-ghost btn-sm" onclick="payrollFillCheques()">Fill cheque numbers</button></div>` : ''}
      <div class="table-wrap" style="overflow-x:auto;margin-bottom:12px"><table><thead><tr><th>Staff</th><th>Pay mode</th><th>Details</th><th>Net Salary</th><th>Status</th><th></th></tr></thead><tbody>${rowsHtml}</tbody>
        <tfoot><tr style="font-weight:700;background:var(--cream)"><td colspan="3">TOTAL</td><td>${money(d.total)}</td><td colspan="2"></td></tr></tfoot></table></div>
      ${d.missingBank.length ? `<div class="profile-card" style="margin-bottom:12px;background:rgba(203,154,46,.1);border-left:4px solid var(--gold)"><b>⚠ ${d.missingBank.length} set to bank transfer without bank details:</b> ${d.missingBank.map(r => esc(r.name)).join(', ')}. Add the account and IFSC in their profile, or change them to cheque or cash.</div>` : ''}
      ${d.notApproved.length ? `<p style="font-size:.78rem;color:var(--ink-soft)">${d.notApproved.length} staff not approved yet for ${esc(label)}, so not shown: ${d.notApproved.map(s => esc(nameOf(s))).join(', ')}.</p>` : ''}
      ${can('print') ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-ghost btn-sm" onclick="downloadSalaryDisbursementExcel()">📥 Excel</button><button class="btn btn-ghost btn-sm" onclick="downloadSalaryDisbursementPDF()">📄 PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="payrollBankCsv()">🏦 Bank upload sheet (CSV)</button>
        <button class="btn btn-ghost btn-sm" onclick="payrollChequeSheet()">🧾 Cheque register</button>
        <button class="btn btn-ghost btn-sm" onclick="payrollCashSheet()">💵 Cash sheet (signatures)</button></div>` : ''}
      ` : `<div class="empty-state"><b>Nothing to pay yet</b>Approve at least one staff member's payroll for ${esc(label)} above.${d.notApproved.length ? '' : ''}</div>
      ${d.notApproved.length ? `<p style="font-size:.78rem;color:var(--ink-soft)">${d.notApproved.length} staff waiting for approval.</p>` : ''}`}
    </div>`;
  };
  window.payrollSetDate = v => { payDate = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayIso(); };
  function pdGet(id){ const rec = findPayrollRecord(id, staffPayrollMonth); return (rec && rec.status === 'Approved') ? rec : null; }
  window.payrollSetMode = async function(id, mode){
    if(!can('edit')) return; const rec = pdGet(id); if(!rec || isPaid(rec) || !MODES.includes(mode)) return;
    rec.payMode = mode; if(mode === 'Cash') rec.payRef = rec.payRef || '';
    await saveRecords(); rerender();
  };
  window.payrollSetRef = async function(id, v){
    if(!can('approve')) return; const rec = pdGet(id); if(!rec || isPaid(rec)) return;
    rec.payRef = String(v || '').trim().slice(0, 60);
    if(rec.payRef && modeOf(stBy(id), rec) === 'Cheque'){
      const dup = staffPayrollRecords.find(x => x !== rec && x.payRef === rec.payRef && x.payMode === 'Cheque');
      if(dup) toast('That cheque number is already used for ' + nameOf(stBy(dup.staffId)) + ' (' + dup.month + ').');
    }
    await saveRecords();
  };
  async function markOne(id, silent){
    const rec = pdGet(id); if(!rec || isPaid(rec)) return false;
    const st = stBy(id); const mode = modeOf(st, rec);
    if(mode === 'Bank Transfer' && !(st.bankAccountNumber && st.bankIfsc)){ if(!silent) toast(nameOf(st) + ' has no bank account or IFSC. Add it, or change the pay mode.'); return false; }
    const ref = $('pdRef_' + id); if(ref && !isPaid(rec)) rec.payRef = String(ref.value || '').trim().slice(0, 60);
    if(mode === 'Cheque' && !rec.payRef){ if(!silent) toast('Enter the cheque number for ' + nameOf(st) + ' first.'); return false; }
    rec.payMode = mode; rec.payStatus = 'Paid'; rec.paidDate = payDate || todayIso(); rec.paidBy = (currentUser && currentUser.name) || ''; rec.paidAt = new Date().toISOString();
    return true;
  }
  window.payrollMarkPaid = async function(id){
    if(!can('approve')){ toast("You don't have permission to mark salaries as paid."); return; }
    const dEl = $('pdDate'); if(dEl) payDate = dEl.value || todayIso();
    if(!(await markOne(id))) return;
    await saveRecords(); toast('Marked as paid.', 'burst'); rerender();
  };
  window.payrollUndoPaid = async function(id){
    if(!can('approve')) return; const rec = pdGet(id); if(!rec || !isPaid(rec)) return;
    if(!(await showConfirmDialog('Undo this payment? The salary goes back to "To pay".'))) return;
    rec.payStatus = ''; rec.paidDate = ''; rec.paidBy = ''; rec.paidAt = '';
    await saveRecords(); rerender();
  };
  window.payrollMarkAllPaid = async function(){
    if(!can('approve')){ toast("You don't have permission to mark salaries as paid."); return; }
    const dEl = $('pdDate'); if(dEl) payDate = dEl.value || todayIso();
    const mode = ($('pdBulkMode') || {}).value || '';
    const d = salaryDisbursementData(staffPayrollMonth);
    const todo = d.rows.filter(r => !r.paid && (!mode || r.mode === mode));
    if(!todo.length){ toast('Nothing pending' + (mode ? ' for ' + mode : '') + '.'); return; }
    todo.forEach(r => { const el = $('pdRef_' + r.staffId); const rec = pdGet(r.staffId); if(el && rec) rec.payRef = String(el.value || '').trim().slice(0, 60); });
    const ready = todo.filter(r => !r.missingBank && !(r.mode === 'Cheque' && !(pdGet(r.staffId) || {}).payRef));
    const skipped = todo.length - ready.length;
    if(!ready.length){ toast('None can be marked yet: bank details or cheque numbers are missing.'); return; }
    const amt = ready.reduce((s, r) => s + r.netSalary, 0);
    if(!(await showConfirmDialog(`Mark ${ready.length} salaries (${money(amt)}) as paid on ${fmtD(payDate)}?${skipped ? ' ' + skipped + ' will be skipped because bank details or a cheque number is missing.' : ''} Only do this after the money has actually been sent.`))) return;
    for(const r of ready) await markOne(r.staffId, true);
    await saveRecords(); toast(ready.length + ' marked as paid.', 'burst'); rerender();
  };
  window.payrollFillCheques = async function(){
    if(!can('approve')) return;
    const raw = String(($('pdChqStart') || {}).value || '').trim();
    if(!/^\d{1,12}$/.test(raw)){ toast('Type the first cheque number, digits only.'); return; }
    let n = Number(raw); const width = raw.length;
    const d = salaryDisbursementData(staffPayrollMonth);
    const rows = d.rows.filter(r => r.mode === 'Cheque' && !r.paid && !(pdGet(r.staffId) || {}).payRef);
    if(!rows.length){ toast('No cheque payments are waiting for a number.'); return; }
    rows.forEach(r => { const rec = pdGet(r.staffId); rec.payRef = String(n++).padStart(width, '0'); });
    await saveRecords(); toast(rows.length + ' cheque numbers filled in order.'); rerender();
  };

  /* ---------- reports ---------- */
  window.salaryDisbursementReportRows = function(){
    const d = salaryDisbursementData(staffPayrollMonth);
    const order = { 'Bank Transfer': 0, Cheque: 1, Cash: 2 };
    return d.rows.slice().sort((a, b) => order[a.mode] - order[b.mode] || a.name.localeCompare(b.name)).map(r => ({
      'Staff': r.name, 'Designation': r.designation, 'Department': r.department, 'Pay Mode': r.mode,
      'Bank Name': r.mode === 'Bank Transfer' ? r.bankName : '', 'Account Holder': r.mode === 'Bank Transfer' || r.mode === 'Cheque' ? r.accountName : '',
      'Account Number': r.mode === 'Bank Transfer' ? r.accountNumber : '', 'IFSC': r.mode === 'Bank Transfer' ? r.ifsc : '',
      'Cheque No / Reference': r.ref, 'Net Salary Payable': r.netSalary, 'Status': r.paid ? 'Paid' : 'To pay', 'Paid On': r.paid ? r.paidDate : '',
    }));
  };
  window.downloadSalaryDisbursementExcel = function(){ exportRowsToExcel('salary_disbursement_' + staffPayrollMonth + '.xlsx', 'Salary Disbursement', salaryDisbursementReportRows()); };
  window.downloadSalaryDisbursementPDF = function(){ exportRowsToPDF('Salary Disbursement — ' + monthName(staffPayrollMonth, true), 'Pay period ' + periodText(periodOf(staffPayrollMonth)), salaryDisbursementReportRows()); };
  const safeCell = v => { v = String(v == null ? '' : v); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };
  function download(name, text, type){
    const b = new Blob(['﻿' + text], { type: type || 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  window.payrollBankCsv = function(){
    const d = salaryDisbursementData(staffPayrollMonth);
    const rows = d.rows.filter(r => r.mode === 'Bank Transfer' && !r.missingBank && !r.paid);
    if(!rows.length){ toast('No pending bank transfers to export.'); return; }
    const narr = 'Salary ' + monthName(staffPayrollMonth, true);
    const csv = [['Beneficiary Name', 'Account Number', 'IFSC', 'Amount', 'Narration', 'Staff Name'], ...rows.map(r => [r.accountName, r.accountNumber, r.ifsc, r.netSalary.toFixed(2), narr, r.name])]
      .map(a => a.map(c => '"' + safeCell(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    download('bank_upload_' + staffPayrollMonth + '.csv', csv);
    toast('Bank sheet downloaded. Check the format your bank asks for before uploading.');
  };
  function printSheet(title, sub, head, rowsHtml, foot){
    const w = window.open('', '_blank'); if(!w){ toast('Please allow pop-ups to print.'); return; }
    let sn = ''; try{ sn = schoolInfo.name || ''; }catch(e){}
    w.document.write(`<html><head><title>${esc(title)}</title><style>@page{size:A4;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0}
      h2{margin:0;text-align:center;font-size:16px}h3{margin:4px 0 2px;text-align:center;font-size:13px}p{text-align:center;font-size:11px;color:#444;margin:2px 0 12px}
      table{width:100%;border-collapse:collapse;font-size:11.5px}th,td{border:1px solid #333;padding:6px 7px;text-align:left}th{background:#eee}td.r{text-align:right}
      .sg{height:34px}.ft{margin-top:26px;display:flex;justify-content:space-between;font-size:11px}</style></head><body onload="window.print()">
      <h2>${esc(sn)}</h2><h3>${esc(title)}</h3><p>${esc(sub)}</p><table><thead><tr>${head}</tr></thead><tbody>${rowsHtml}</tbody>${foot || ''}</table>
      <div class="ft"><div>Prepared by</div><div>Checked by</div><div>Principal / Authorised signatory</div></div></body></html>`);
    w.document.close();
  }
  window.payrollChequeSheet = function(){
    const d = salaryDisbursementData(staffPayrollMonth); const rows = d.rows.filter(r => r.mode === 'Cheque');
    if(!rows.length){ toast('No salaries are set to be paid by cheque.'); return; }
    const total = rows.reduce((s, r) => s + r.netSalary, 0);
    printSheet('Salary Cheque Register — ' + monthName(staffPayrollMonth, true), 'Pay period ' + periodText(periodOf(staffPayrollMonth)),
      '<th>S.No</th><th>Payee</th><th>Cheque No</th><th>Amount</th><th>Date</th><th>Status</th>',
      rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.accountName)}</td><td>${esc(r.ref)}</td><td class="r">${money(r.netSalary)}</td><td>${esc(r.paid ? fmtD(r.paidDate) : '')}</td><td>${r.paid ? 'Paid' : ''}</td></tr>`).join(''),
      `<tfoot><tr><th colspan="3">TOTAL</th><th class="r">${money(total)}</th><th colspan="2"></th></tr></tfoot>`);
  };
  window.payrollCashSheet = function(){
    const d = salaryDisbursementData(staffPayrollMonth); const rows = d.rows.filter(r => r.mode === 'Cash');
    if(!rows.length){ toast('No salaries are set to be paid in cash.'); return; }
    const total = rows.reduce((s, r) => s + r.netSalary, 0);
    printSheet('Cash Salary Payment Sheet — ' + monthName(staffPayrollMonth, true), 'Pay period ' + periodText(periodOf(staffPayrollMonth)),
      '<th>S.No</th><th>Name</th><th>Designation</th><th>Amount</th><th style="width:28%">Signature of receiver</th>',
      rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.designation)}</td><td class="r">${money(r.netSalary)}</td><td class="sg"></td></tr>`).join(''),
      `<tfoot><tr><th colspan="3">TOTAL</th><th class="r">${money(total)}</th><th></th></tr></tfoot>`);
  };

  /* ---------- the payslip: pay period and how it was paid ---------- */
  window.payslipExtraMeta = function(st, monthStr, preview){
    const rec = findPayrollRecord(st.id, monthStr); const p = recPeriod(rec || preview, monthStr);
    const mode = modeOf(st, rec);
    const paid = isPaid(rec);
    return `<div><span>Pay Period:</span> ${esc(periodText(p))}</div><div><span>Paid By:</span> ${esc(mode)}${paid ? ' on ' + esc(fmtD(rec.paidDate)) : ''}${paid && rec.payRef ? ' (' + esc(rec.payRef) + ')' : ''}</div>`;
  };

  /* ---------- the Payroll page: settings, period line, excluded list ---------- */
  function designationsInUse(){
    const m = {}; staffList.filter(staffIsActive).forEach(st => { const d = String(st.designation || '').trim(); if(d) m[d] = (m[d] || 0) + 1; });
    (S.excludeDesignations || []).forEach(d => { if(!(d in m)) m[d] = 0; });
    return Object.keys(m).sort().map(d => ({ d, n: m[d] }));
  }
  function settingsCard(){
    pdCss();
    const m = staffPayrollMonth, p = periodOf(m), sd = salaryDate(m), ed = can('edit');
    const exN = excludedList(m).length;
    const sum = `Period <b>${esc(periodText(p))}</b> (${p.days} days) · Salary date <b>${sd ? esc(fmtD(sd)) : 'not set'}</b> · Loss of pay per day = basic ÷ <b>${window.daysInPayrollMonth(m)}</b> · Default pay mode <b>${esc(S.defaultMode)}</b>${exN ? ` · <b>${exN}</b> off payroll` : ''}`;
    const form = !settingsOpen ? '' : `<div class="pp-grid">
        <div><label>Pay period starts on day</label><select id="ppStart">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${S.periodStartDay === i + 1 ? 'selected' : ''}>${i + 1 === 1 ? '1 (normal month: 1st to last day)' : (i + 1) + ' (' + (i + 1) + 'th to ' + i + 'th of next month)'}</option>`).join('')}</select>
          <p class="pp-hint">Example: choose 26 and "November" covers 26 Oct to 25 Nov. Attendance and loss of pay follow these dates.</p></div>
        <div><label>Salary is paid on day</label><select id="ppPayDay"><option value="0">Not fixed</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${S.payDay === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
          <label style="margin-top:8px"><span class="pp-chk"><label><input type="checkbox" id="ppNext" ${S.payInNextMonth ? 'checked' : ''}> in the month after the period ends</label></span></label>
          <p class="pp-hint">Used for reminders on the Disbursement card. 31 means the last day of shorter months.</p></div>
        <div><label>Loss of pay per day</label><select id="ppBasis" onchange="document.getElementById('ppFixedWrap').style.display=this.value==='fixed'?'block':'none'"><option value="period" ${S.lopBasis === 'period' ? 'selected' : ''}>Basic ÷ actual days in the period</option><option value="fixed" ${S.lopBasis === 'fixed' ? 'selected' : ''}>Basic ÷ a fixed number of days</option></select>
          <div id="ppFixedWrap" style="display:${S.lopBasis === 'fixed' ? 'block' : 'none'};margin-top:6px"><input type="number" id="ppFixed" min="20" max="31" value="${S.lopFixed}"><p class="pp-hint">Many schools use 30 for every month.</p></div></div>
        <div><label>Default way of paying salary</label><select id="ppMode">${MODES.map(x => `<option ${S.defaultMode === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <p class="pp-hint">Each staff member can have their own (Edit staff, Payroll Setup), and you can change it again when paying.</p></div>
      </div>
      <label style="display:block;font-weight:600;font-size:.8rem;margin:14px 0 2px">Keep these designations off the payroll</label>
      <div class="pp-chk" id="ppEx">${designationsInUse().map(x => `<label><input type="checkbox" value="${esc(x.d)}" ${(S.excludeDesignations || []).includes(x.d) ? 'checked' : ''}> ${esc(x.d)} <span style="color:var(--ink-soft)">(${x.n})</span></label>`).join('') || '<span class="pp-hint">No designations set on staff yet.</span>'}</div>
      <p class="pp-hint">For one person only (for example one trustee), use the "Off payroll" button on their row. Already-approved months are never hidden.</p>
      <p class="pp-hint"><b>Good to know:</b> approved months keep their numbers. A changed period applies to months you have not approved yet; drafts recalculate when you press Recalculate.</p>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-primary btn-sm" onclick="payrollSaveSettings()">Save settings</button><button class="btn btn-ghost btn-sm" onclick="payrollToggleSettings()">Close</button></div>`;
    return `<div class="pp-card" id="ppCard"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><b style="color:var(--navy,#1a1a4b)">⚙ Payroll settings</b>
      ${ed ? `<button class="btn btn-ghost btn-sm" onclick="payrollToggleSettings()">${settingsOpen ? 'Hide' : 'Change'}</button>` : ''}</div>
      <p style="font-size:.84rem;margin:6px 0 0;line-height:1.55">${sum}</p>${form}</div>`;
  }
  window.payrollToggleSettings = function(){ settingsOpen = !settingsOpen; rerender(); };
  window.payrollSaveSettings = async function(){
    if(!can('edit')){ toast("You don't have permission to change payroll settings."); return; }
    const next = norm({
      periodStartDay: ($('ppStart') || {}).value, payDay: ($('ppPayDay') || {}).value, payInNextMonth: !!($('ppNext') || {}).checked,
      lopBasis: ($('ppBasis') || {}).value, lopFixed: ($('ppFixed') || {}).value, defaultMode: ($('ppMode') || {}).value,
      excludeDesignations: Array.from(document.querySelectorAll('#ppEx input:checked')).map(i => i.value),
    });
    const changedPeriod = next.periodStartDay !== S.periodStartDay || next.lopBasis !== S.lopBasis || next.lopFixed !== S.lopFixed;
    const drafts = staffPayrollRecords.filter(r => r.status === 'Draft').length;
    if(changedPeriod && drafts && !(await showConfirmDialog(`This changes the pay period or the per-day rate. ${drafts} draft payroll(s) will recalculate the next time you press Recalculate. Approved months stay exactly as they are. Continue?`))) return;
    next.updatedBy = (currentUser && currentUser.name) || ''; next.updatedAt = new Date().toISOString();
    try{ await storageSet(KEY, next); }catch(e){ toast('Could not save the settings. Please try again.'); return; }
    S = next; settingsOpen = false; if(!pickedMonth) staffPayrollMonth = defaultMonth();
    toast('Payroll settings saved.', 'burst'); rerender();
  };
  function excludedStrip(){
    const ex = excludedList(staffPayrollMonth); if(!ex.length) return '';
    return `<div class="pp-ex"><b>Not on the payroll (${ex.length}):</b> ${ex.map(st => `${esc(nameOf(st))}${st.designation ? ' <span style="color:var(--ink-soft)">(' + esc(st.designation) + ')</span>' : ''}${st.payrollExcluded && can('edit') ? ` <a href="#" onclick="payrollSetExcluded('${st.id}', false);return false;">Put back</a>` : ''}`).join(' · ')}
      ${ex.some(st => !st.payrollExcluded) ? '<div class="pp-hint">Those without a "Put back" link are left out by designation (see Payroll settings).</div>' : ''}</div>`;
  }
  const origTab = window.renderStaffPayrollTab;
  window.renderStaffPayrollTab = function(body){
    origTab(body);
    try{
      const first = body.querySelector('.profile-card');
      if(first){
        first.insertAdjacentHTML('afterend', settingsCard());
        const sel = first.querySelector('#staffPayrollMonthSelect');
        if(sel){ const p = periodOf(staffPayrollMonth); const note = document.createElement('p'); note.style.cssText = 'font-size:.78rem;margin:8px 0 0'; note.innerHTML = '<b>Period:</b> ' + esc(periodText(p)) + (p.to > todayIso() ? ' <span style="color:#b8621b">(still running)</span>' : ''); sel.insertAdjacentElement('afterend', note); }
      }
      const tw = body.querySelector('.table-wrap'); const strip = excludedStrip(); if(tw && strip) tw.insertAdjacentHTML('beforebegin', strip);
      if(can('edit')){
        body.querySelectorAll('tbody tr').forEach(tr => {
          const nm = tr.querySelector('td.name-cell'); const oc = nm && nm.getAttribute('onclick'); const mm = oc && oc.match(/openStaffProfile\('([^']+)'\)/);
          const cell = tr.querySelector('td:last-child > div'); if(!mm || !cell) return;
          const st = stBy(mm[1]); if(hasLocked(st, staffPayrollMonth)) return;
          const b = document.createElement('button'); b.className = 'btn-edit-text'; b.style.color = '#6b6a85'; b.textContent = 'Off payroll'; b.title = 'Take this person off the payroll (for example the Principal)';
          b.onclick = () => payrollSetExcluded(mm[1], true); cell.appendChild(b);
        });
      }
    }catch(e){ try{ console.error('payroll-pro', e); }catch(_){} }
  };
})();
