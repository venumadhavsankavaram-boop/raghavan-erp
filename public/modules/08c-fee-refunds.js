/* ===== FEE REFUNDS — request → approval → credit-note ledger =====
   A refund is its own record that points back at the receipt it reverses; the
   original payment is never voided or edited. So a partial refund of ₹2,000 on
   a ₹10,000 payment leaves ₹8,000 collected on the student's ledger.

   Flow
     1. Refunds tab → "New Refund": find the student (class / section / name),
        pick the fee heads + amounts, a reason code, and how the money goes
        back (credit to the student's account, or cash / online / cheque).
     2. Admin's refunds are approved on the spot. Anyone else with the
        "Approve" permission (Principal by default) can approve up to the
        policy limit (Configuration → Refund Policy); above that only Admin can.
        The limit itself is shown to Admin only — other roles just see whether a
        request will be processed or wait for approval.
        Requesters without approve rights wait in the queue.
     3. On approval: credit refunds raise the student's account credit (no cash
        moves); cash/online/cheque refunds also post a "Fee Refund" expense
        voucher so Accounting shows the money going out.
     4. Account credit is later applied to dues (payment mode "Account Credit",
        which Accounting never books a second time).
   Permissions live in Roles & Permissions → Manage Fee → "Fee Refunds":
     View = see the Refunds tab · Create = request refunds · Approve = approve /
     reject · Delete = cancel pending requests · Print = print refund vouchers.
   (Admin always has everything.)  */
const FEE_REFUNDS_KEY = 'fee-refunds';
const REFUND_POLICY_KEY = 'refund-policy';
const RF_DEFAULT_POLICY = { principalLimit: 10000, defaultMethod: 'credit', nonRefundable: 'admission, registration' };
const RF_REASONS = ['Student withdrawn / TC issued', 'Duplicate payment', 'Excess amount collected', 'Fee concession granted later', 'Wrong class / fee head', 'Service not availed (transport / hostel)', 'Other'];
const RF_METHODS = { credit: "Credit to student's account", Cash: 'Cash', Online: 'Online / bank transfer', Cheque: 'Cheque' };
// Saved to the server (shared by every user/device), not just this browser — same registry the other fee settings use.
OBJECT_BACKED_KEYS[FEE_REFUNDS_KEY] = '/api/kv/' + FEE_REFUNDS_KEY;
OBJECT_BACKED_KEYS[REFUND_POLICY_KEY] = '/api/kv/' + REFUND_POLICY_KEY;
let feeRefunds = [];
let refundPolicy = Object.assign({}, RF_DEFAULT_POLICY);
let rfBusy = false;
let rfView = 'list';          // 'list' | 'create' (the New Refund page inside the Refunds tab)
let rfCreateSid = '';
let rfSearchTimer = null;
function rfScope(){ return document.getElementById('rfCreatePage') || document.getElementById('rfModalContent'); }
let _rfCache = null;

async function loadRefundData(){
  const list = await storageGet(FEE_REFUNDS_KEY, []);
  feeRefunds = Array.isArray(list) ? list : [];
  const pol = await storageGet(REFUND_POLICY_KEY, null);
  refundPolicy = Object.assign({}, RF_DEFAULT_POLICY, (pol && typeof pol === 'object') ? pol : {});
  _rfCache = null;
}

/* ---------- amounts per payment ---------- */
function rfMaps(){
  if(_rfCache && _rfCache.src === feeRefunds && _rfCache.n === feeRefunds.length && _rfCache.sig === feeRefunds.map(r => r.status).join()){
    return _rfCache;
  }
  const done = {}, pend = {};
  feeRefunds.forEach(r => (r.lines || []).forEach(l => {
    const m = r.status === 'processed' ? done : r.status === 'pending' ? pend : null;
    if(m) m[l.paymentId] = (m[l.paymentId] || 0) + (Number(l.amount) || 0);
  }));
  _rfCache = { src: feeRefunds, n: feeRefunds.length, sig: feeRefunds.map(r => r.status).join(), done, pend };
  return _rfCache;
}
function payRefunded(p){ return rfMaps().done[p.id] || 0; }
function payPendingRefund(p){ return rfMaps().pend[p.id] || 0; }
// What this payment still counts as collected after approved refunds.
function payNet(p){ return Math.max(0, (Number(p.amount) || 0) - payRefunded(p)); }
// What can still be refunded or requested on this payment.
function payRefundable(p){
  if(!p || p.voided) return 0;
  return Math.max(0, (Number(p.amount) || 0) - payRefunded(p) - payPendingRefund(p));
}
function rfStatusBadge(p){
  const done = payRefunded(p), pend = payPendingRefund(p), amt = Number(p.amount) || 0;
  if(done >= amt && amt > 0) return '<span class="balance-tag due">REFUNDED</span>';
  if(done > 0) return `<span class="balance-tag due" title="Refunded ${fmtMoney(done)} of ${fmtMoney(amt)}">PARTIALLY REFUNDED ${fmtMoney(done)}</span>`;
  if(pend > 0) return `<span class="pill" title="A refund request of ${fmtMoney(pend)} is awaiting approval">Refund pending</span>`;
  return '<span class="pill">Recorded</span>';
}

/* ---------- account credit ---------- */
function studentCreditBalance(studentId){
  const earned = feeRefunds.filter(r => r.status === 'processed' && r.method === 'credit' && r.studentId === studentId)
    .reduce((s, r) => s + (Number(r.total) || 0), 0);
  const used = payments.filter(p => p.studentId === studentId && p.mode === 'Account Credit' && !p.voided)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.max(0, earned - used);
}
function rfCreditBannerHtml(studentId){
  const bal = studentCreditBalance(studentId);
  if(bal <= 0) return '';
  const canApply = canSub('managefee_collection', 'managefee', 'create');
  return `<div class="sf-kpi sf-kpi--good" style="margin:0 0 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:space-between;">
    <div><span>Account credit available</span><b>${fmtMoney(bal)}</b><small>From refunds credited to this student — can be applied to any due fee.</small></div>
    ${canApply ? sfBtn('primary', 'check', 'Apply credit to dues', `openApplyCredit('${studentId}')`) : ''}</div>`;
}

/* ---------- permissions ---------- */
// Same shape as every other Roles & Permissions entry (managefee_refunds), with safe defaults
// for roles that were saved before this permission existed.
function refundPermFor(role, action){
  if(!role) return false;
  if(role === 'Admin') return true;
  const ov = (typeof findRoleOverride === 'function') ? findRoleOverride(role) : null;
  if(ov && ov.permissions && ov.permissions.managefee_refunds !== undefined) return !!ov.permissions.managefee_refunds[action];
  if(action === 'approve' || action === 'delete') return role === 'Principal';
  if(action === 'create') return getSubModuleAccess(role, 'managefee_collection', 'managefee', 'delete');
  if(action === 'print') return getSubModuleAccess(role, 'managefee_collection', 'managefee', 'print');
  return getSubModuleAccess(role, 'managefee_collection', 'managefee', 'view'); // view / edit
}
function refundPerm(action){ return !!currentUser && refundPermFor(currentUser.role, action); }
function rfApproverLimit(role){
  if(role === 'Admin') return Infinity;
  const n = Number(refundPolicy.principalLimit);
  return isFinite(n) && n >= 0 ? n : 0;
}
function rfCanApproveAmount(total){
  return refundPerm('approve') && Number(total) <= rfApproverLimit(currentUser.role);
}

/* ---------- helpers ---------- */
function rfNonRefundableWords(){
  return String(refundPolicy.nonRefundable || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}
function rfIsNonRefundable(p){
  const label = String(feeLabelFor(p) || '').toLowerCase();
  return rfNonRefundableWords().some(w => label.includes(w));
}
function rfStudentName(sid, fallback){
  const s = students.find(x => x.id === sid);
  return s ? (s.name || ((s.firstName || '') + ' ' + (s.lastName || '')).trim()) : (fallback || '');
}
function rfNextNo(){
  const max = feeRefunds.reduce((m, r) => Math.max(m, parseInt(String(r.refundNo || '').replace(/\D/g, ''), 10) || 0), 0);
  return 'RF-' + String(max + 1).padStart(4, '0');
}
function rfAudit(r, action, note){
  r.audit = r.audit || [];
  r.audit.push({ at: new Date().toISOString(), by: currentUser.name, role: currentUser.role, action, note: note || '' });
}
// Always re-reads from the server: refund requests come from other people on other devices, and
// every refund action rewrites whole lists, so a stale page must never be the one that saves.
async function rfEnsureAll(){
  await Promise.all([
    reloadDataset('payments', loadPaymentsData),
    reloadDataset('acctLedger', loadAccountingLedgerData),
  ]);
}
function rfOverlay(){
  let ov = document.getElementById('rfModalOverlay');
  if(!ov){
    ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = 'rfModalOverlay';
    ov.innerHTML = '<div class="modal" style="max-width:640px;"><div class="modal-inner"><button class="modal-close" onclick="rfCloseModal()">&times;</button><div id="rfModalContent"></div></div></div>';
    document.body.appendChild(ov);
  }
  return ov;
}
function rfOpenModal(html){
  const ov = rfOverlay();
  document.getElementById('rfModalContent').innerHTML = html;
  ov.classList.add('open');
}
function rfCloseModal(){
  const ov = document.getElementById('rfModalOverlay');
  if(ov){ ov.classList.remove('open'); const c = document.getElementById('rfModalContent'); if(c) c.innerHTML = ''; }
  rfBusy = false;
}

/* ---------- 1. request a refund ---------- */
let rfReqGroup = [];
async function openRefundRequest(paymentId){
  if(!refundPerm('create')){ showToast("You don't have permission to request refunds."); return; }
  await rfEnsureAll();
  const p = payments.find(x => x.id === paymentId);
  if(!p || p.voided){ showToast("This payment can't be refunded."); return; }
  rfReqGroup = (p.receiptNo ? payments.filter(x => x.receiptNo === p.receiptNo && x.studentId === p.studentId) : [p]).filter(x => !x.voided);
  if(!rfReqGroup.some(x => x.id === p.id)) rfReqGroup.push(p);
  const rows = rfLineRowsHtml(rfReqGroup, p.id);
  rfOpenModal(`
    <h2>Refund — Receipt ${escapeHtml(p.receiptNo || '—')}</h2>
    <p class="modal-sub">${escapeHtml(rfStudentName(p.studentId, p.studentName))} · the original receipt stays intact; this creates a linked refund (credit note).</p>
    <div class="table-wrap rf-m" style="margin-bottom:12px;">${RF_TABLE_CSS}<table><thead><tr><th></th><th>Fee head</th><th>Paid</th><th>Refund amount (₹)</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${rfFieldsHtml()}
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" onclick="rfCloseModal()">Cancel</button>
      <button type="button" class="btn btn-primary" id="rfSubmitBtn" onclick="submitRefundRequest()">💸 Submit refund</button>
    </div>`);
  rfUpdateRequestTotal();
}

function rfLineRowsHtml(group, preselectId, showReceipt){
  const isAdmin = currentUser.role === 'Admin';
  return group.map(x => {
    const max = payRefundable(x);
    const nonRef = rfIsNonRefundable(x);
    const blocked = max <= 0 || (nonRef && !isAdmin);
    const note = max <= 0 ? 'Nothing left to refund' : (nonRef ? (isAdmin ? 'Non-refundable head — Admin override' : 'Non-refundable head — Admin only') : '');
    return `<tr data-pid="${x.id}">
      <td><input type="checkbox" class="rf-chk" ${x.id === preselectId && !blocked ? 'checked' : ''} ${blocked ? 'disabled' : ''} onchange="rfUpdateRequestTotal()"></td>
      <td><b>${escapeHtml(feeLabelFor(x))}</b>${x.instalment ? `<br><small>${escapeHtml(x.instalment)}</small>` : ''}${showReceipt ? `<br><small>Receipt ${escapeHtml(x.receiptNo || '—')} · ${escapeHtml(x.date || '')}</small>` : ''}${note ? `<br><small style="color:#b45309;">${note}</small>` : ''}</td>
      <td>${fmtMoney(x.amount)}${payRefunded(x) ? `<br><small>refunded ${fmtMoney(payRefunded(x))}</small>` : ''}${payPendingRefund(x) ? `<br><small>pending ${fmtMoney(payPendingRefund(x))}</small>` : ''}</td>
      <td><input type="number" class="input rf-amt" min="0" max="${max}" value="${blocked ? 0 : max}" ${blocked ? 'disabled' : ''} style="width:110px;" oninput="rfUpdateRequestTotal()"><br><small>max ${fmtMoney(max)}</small></td>
    </tr>`;
  }).join('');
}
function rfFieldsHtml(){
  const accounts = (acctBankAccounts || []).filter(b => b.active !== false);
  const defMethod = refundPolicy.defaultMethod === 'credit' || !RF_METHODS[refundPolicy.defaultMethod] ? 'credit' : refundPolicy.defaultMethod;
  return `<div class="f-field" style="margin-bottom:12px;"><label>Reason</label><select class="input" id="rfReason" style="width:100%;">${RF_REASONS.map(r => `<option>${r}</option>`).join('')}</select></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Notes <small>(required for "Other")</small></label><textarea class="input" id="rfNote" rows="2" style="width:100%;"></textarea></div>
    <div class="f-field" style="margin-bottom:12px;"><label>Return the money as</label><select class="input" id="rfMethod" style="width:100%;" onchange="rfUpdateRequestTotal()">${Object.keys(RF_METHODS).map(k => `<option value="${k}" ${k === defMethod ? 'selected' : ''}>${RF_METHODS[k]}</option>`).join('')}</select></div>
    <div class="f-field" id="rfBankWrap" style="margin-bottom:12px;display:none;"><label>Pay out from (Bank / Cash account)</label><select class="input" id="rfBank" style="width:100%;">${accounts.map(b => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join('')}</select></div>
    <div id="rfRouteInfo" class="note" style="margin:8px 0 14px;padding:10px 12px;border-radius:10px;background:rgba(122,46,143,.08);font-size:.88rem;"></div>`;
}
const RF_TABLE_CSS = '<style>@media(max-width:600px){.rf-m table{font-size:12.5px}.rf-m th,.rf-m td{padding:8px 6px!important}.rf-m td input[type=number],.rf-m td input[type=text]{width:84px!important;min-width:0}.rf-m th{font-size:10px!important;letter-spacing:0!important}}</style>';

/* ---------- 1b. New Refund page (student-first, like Add Student Discount) ---------- */
function openRefundCreate(){
  if(!refundPerm('create')){ showToast("You don't have permission to request refunds."); return; }
  rfView = 'create'; rfCreateSid = '';
  renderRefundsTab(document.getElementById('feeBody'));
}
function backToRefundList(){
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  rfView = 'list'; rfCreateSid = '';
  renderRefundsTab(document.getElementById('feeBody'));
}
function renderRefundCreate(body){
  const m = document.getElementById('rfModalContent'); if(m) m.innerHTML = '';
  body.innerHTML = `<div id="rfCreatePage">
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
      <button class="btn btn-ghost btn-sm" onclick="backToRefundList()">← Back</button>
      <h3 style="margin:0;font-family:'Baloo 2',cursive;color:var(--navy);">New Fee Refund</h3>
    </div>
    <div class="form-grid">
      <div class="f-field full" style="grid-column:1/-1;">
        <label>Search Student <span class="required-star">*</span></label>
        <input class="input" id="rfSearch" placeholder="Type a name or admission no..." style="width:100%;" autocomplete="off" oninput="rfOnSearchInput()">
      </div>
      <div class="f-field"><label>Class</label>
        <select id="rfClassSel" onchange="rfRenderStudentList()"><option value="">All classes</option>${CLASS_LEVELS.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
      <div class="f-field"><label>Section</label>
        <select id="rfSectionSel" onchange="rfRenderStudentList()"><option value="">All sections</option>${SECTIONS.map(x => `<option value="${x}">Section ${x}</option>`).join('')}</select></div>
    </div>
    <div id="rfStudentList" style="margin-top:12px;"></div>
    <div id="rfStudentBox" style="margin-top:18px;"></div>
  </div>`;
  rfRenderStudentList();
  if(rfCreateSid) rfPickStudent(rfCreateSid);
}
function rfOnSearchInput(){
  clearTimeout(rfSearchTimer);
  rfSearchTimer = setTimeout(rfRenderStudentList, 150);
}
function rfRenderStudentList(){
  const box = document.getElementById('rfStudentList'); if(!box) return;
  const q = (document.getElementById('rfSearch').value || '').trim().toLowerCase();
  const cls = document.getElementById('rfClassSel').value;
  const sec = document.getElementById('rfSectionSel').value;
  if(!q && !cls && !sec){ box.innerHTML = `<p style="font-size:.85rem;color:var(--ink-soft);margin:0;">Pick a class (and section), or type a name, to list students.</p>`; return; }
  let list = students.filter(s => (typeof isActive !== 'function' || isActive(s)) && (!cls || s.className === cls) && (!sec || String(s.section) === String(sec)) &&
    (!q || (((s.firstName || '') + ' ' + (s.lastName || '') + ' ' + (s.name || '')).toLowerCase().includes(q) || (s.admissionNo || '').toLowerCase().includes(q))));
  list.sort((a, b) => rfStudentName(a.id).localeCompare(rfStudentName(b.id)));
  const total = list.length; list = list.slice(0, 60);
  if(!total){ box.innerHTML = `<div class="empty-state"><b>No students match</b>Try a different name, class or section.</div>`; return; }
  box.innerHTML = `<div class="table-wrap" style="max-height:300px;overflow:auto;"><table><thead><tr><th>Student</th><th>Adm. no</th><th>Class</th><th></th></tr></thead><tbody>
    ${list.map(s => `<tr${s.id === rfCreateSid ? ' style="background:rgba(122,46,143,.08);"' : ''}><td><b>${escapeHtml(rfStudentName(s.id))}</b></td><td>${escapeHtml(s.admissionNo || '')}</td><td>${escapeHtml(s.className || '')} — ${escapeHtml(s.section || '')}</td><td>${sfBtn('soft', 'check', s.id === rfCreateSid ? 'Selected' : 'Select', `rfPickStudent('${s.id}')`)}</td></tr>`).join('')}
    </tbody></table></div>${total > 60 ? `<small>Showing 60 of ${total} — narrow the search to see the rest.</small>` : ''}`;
}
async function rfPickStudent(sid){
  rfCreateSid = sid;
  await rfEnsureAll();
  rfRenderStudentList();
  const s = students.find(x => x.id === sid);
  const box = document.getElementById('rfStudentBox'); if(!box || !s) return;
  const group = payments.filter(x => x.studentId === sid && !x.voided && (Number(x.amount) || 0) > 0)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const refundable = group.filter(x => payRefundable(x) > 0);
  const head = `<section class="sf-card" style="padding:14px 16px;margin-bottom:14px;"><b>${escapeHtml(rfStudentName(sid))}</b>
    <div style="font-size:.85rem;color:var(--ink-soft);">${escapeHtml(s.admissionNo || '')} · ${escapeHtml(s.className || '')} — Section ${escapeHtml(s.section || '')}</div></section>
    ${rfCreditBannerHtml(sid)}`;
  if(!refundable.length){
    box.innerHTML = head + `<div class="empty-state"><b>Nothing to refund</b>This student has no paid fee left that can be refunded.</div>`;
    return;
  }
  box.innerHTML = head + `<label style="font-size:.8rem;font-weight:600;color:var(--navy);margin:6px 0 8px;display:block;">Fees paid — select what to refund <span class="required-star">*</span></label>
    <div class="table-wrap rf-m" style="margin-bottom:12px;">${RF_TABLE_CSS}<table><thead><tr><th></th><th>Fee head / receipt</th><th>Paid</th><th>Refund amount (₹)</th></tr></thead><tbody>${rfLineRowsHtml(refundable, '', true)}</tbody></table></div>
    ${rfFieldsHtml()}
    <div class="modal-actions" style="display:flex;gap:10px;justify-content:flex-end;">
      <button type="button" class="btn btn-ghost" onclick="backToRefundList()">Cancel</button>
      <button type="button" class="btn btn-primary" id="rfSubmitBtn" onclick="submitRefundRequest()">💸 Submit refund</button>
    </div>`;
  rfUpdateRequestTotal();
}
function rfReadLines(){
  const lines = [];
  (rfScope() || document).querySelectorAll('tr[data-pid]').forEach(tr => {
    const chk = tr.querySelector('.rf-chk');
    if(!chk || !chk.checked || chk.disabled) return;
    const amount = Math.round((Number(tr.querySelector('.rf-amt').value) || 0) * 100) / 100;
    if(amount > 0) lines.push({ paymentId: tr.dataset.pid, amount });
  });
  return lines;
}
function rfUpdateRequestTotal(){
  const lines = rfReadLines();
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const method = document.getElementById('rfMethod').value;
  document.getElementById('rfBankWrap').style.display = method === 'credit' ? 'none' : '';
  let route;
  if(!total) route = 'Select at least one fee head and an amount.';
  else if(rfCanApproveAmount(total)) route = `Total ${fmtMoney(total)} — you can approve this, so it will be processed immediately.`;
  else if(refundPerm('approve')) route = `Total ${fmtMoney(total)} is above your approval limit — it will wait for Admin approval.`;
  else route = `Total ${fmtMoney(total)} — this goes to the approval queue for approval.`;
  document.getElementById('rfRouteInfo').textContent = route;
}
async function submitRefundRequest(){
  if(rfBusy) return;
  rfBusy = true;
  try{
    await rfEnsureAll(); // fresh payments + refunds so amounts and pending requests are current
    const lines = rfReadLines();
    if(!lines.length){ showToast('Select at least one fee head and enter an amount.'); return; }
    const reasonCode = document.getElementById('rfReason').value;
    const note = document.getElementById('rfNote').value.trim();
    if(reasonCode === 'Other' && !note){ showToast('Please add a note explaining the reason.'); return; }
    const method = document.getElementById('rfMethod').value;
    const bankAccountId = method === 'credit' ? '' : document.getElementById('rfBank').value;
    if(method !== 'credit' && !bankAccountId){ showToast('Choose the account the refund is paid from.'); return; }
    const full = [];
    let nonRefOverride = false;
    for(const l of lines){
      const p = payments.find(x => x.id === l.paymentId);
      if(!p || p.voided){ showToast('A selected payment is no longer available — reopen the refund.'); return; }
      if(l.amount > payRefundable(p) + 0.001){ showToast(`${feeLabelFor(p)}: only ${fmtMoney(payRefundable(p))} can still be refunded.`); return; }
      if(p.mode === 'Account Credit' && method !== 'credit'){ showToast(`${feeLabelFor(p)} was paid from account credit — it can only be refunded back to account credit.`); return; }
      if(rfIsNonRefundable(p)){
        if(currentUser.role !== 'Admin'){ showToast(`${feeLabelFor(p)} is non-refundable — only Admin can override.`); return; }
        nonRefOverride = true;
      }
      full.push({ paymentId: p.id, amount: l.amount, head: feeLabelFor(p), category: p.category, extraFeeId: p.extraFeeId || '', receiptNo: p.receiptNo || '', paidOn: p.date || '' });
    }
    if(nonRefOverride && !(await showConfirmDialog('One of the selected heads is marked non-refundable. Continue as an Admin override?'))) return;
    const first = payments.find(x => x.id === full[0].paymentId);
    const total = full.reduce((s, l) => s + l.amount, 0);
    const r = {
      id: 'rf_' + Date.now(), refundNo: rfNextNo(), status: 'pending',
      studentId: first.studentId, studentName: rfStudentName(first.studentId, first.studentName),
      className: (students.find(x => x.id === first.studentId) || {}).className || first.classAtPayment || '',
      receiptNo: Array.from(new Set(full.map(l => l.receiptNo).filter(Boolean))).join(', '), lines: full, total, reasonCode, note, method, bankAccountId,
      requestedBy: currentUser.name, requestedByRole: currentUser.role, requestedAt: new Date().toISOString(),
      nonRefundableOverride: nonRefOverride, audit: [],
    };
    rfAudit(r, 'requested', `${fmtMoney(total)} · ${reasonCode}${note ? ' — ' + note : ''}`);
    feeRefunds.push(r); _rfCache = null;
    await storageSet(FEE_REFUNDS_KEY, feeRefunds);
    rfCloseModal(); rfView = 'list'; rfCreateSid = '';
    if(rfCanApproveAmount(total)){
      await rfProcess(r.id);
    }else{
      showToast(`Refund request ${r.refundNo} sent for approval.`, 'burst');
      refreshAfterRefund();
    }
  }finally{ rfBusy = false; }
}
function refreshAfterRefund(){
  try{ renderDashboard(); }catch(e){}
  try{ if(document.getElementById('view-managefee') && document.getElementById('view-managefee').style.display !== 'none') renderFeeBody(); }catch(e){}
}

/* ---------- 2. approve / reject / cancel ---------- */
// Carries out an approved refund. Re-reads everything first and re-checks each line,
// so two approvers (or a double click) can never refund the same money twice.
async function rfProcess(refundId){
  await rfEnsureAll();
  const r = feeRefunds.find(x => x.id === refundId);
  if(!r){ showToast('That refund request no longer exists.'); return false; }
  if(r.status !== 'pending'){ showToast(`This request is already ${r.status}.`); refreshAfterRefund(); return false; }
  if(!rfCanApproveAmount(r.total)){ showToast(refundPerm('approve') ? 'Above your approval limit — Admin must approve this one.' : "You don't have permission to approve refunds."); return false; }
  const pays = [];
  for(const l of r.lines){
    const p = payments.find(x => x.id === l.paymentId);
    const doneByOthers = p ? payRefunded(p) : 0;
    if(!p || p.voided || (Number(p.amount) || 0) - doneByOthers < l.amount - 0.001){
      showToast(`Cannot process ${r.refundNo}: ${l.head} was changed or already refunded. Reject this request and raise a new one.`);
      return false;
    }
    pays.push(p);
  }
  const voucherNos = [];
  if(r.method !== 'credit'){
    try{
      for(let i = 0; i < r.lines.length; i++) voucherNos.push(await issueDocNumber('payment_voucher', i + 1));
    }catch(e){
      showToast('Could not get a voucher number from the server (' + e.message + ') — nothing was changed. Try again once you are back online.');
      return false;
    }
  }
  // Mark processed first (the record of truth), then touch extra fees and Accounting.
  r.status = 'processed'; r.approvedBy = currentUser.name; r.approvedByRole = currentUser.role; r.approvedAt = new Date().toISOString();
  r.processedAt = r.approvedAt; r.voucherNos = voucherNos;
  rfAudit(r, r.requestedBy === currentUser.name ? 'approved (self)' : 'approved', r.method === 'credit' ? 'credited to student account' : 'paid out via ' + RF_METHODS[r.method]);
  _rfCache = null;
  if(!(await saveKeySafely(FEE_REFUNDS_KEY, feeRefunds, 'Refund ' + r.refundNo))){ warnPartialAndReload('Refund ' + r.refundNo + ' was NOT saved. Reloading the latest data — please try again.'); return false; }
  // Extra fees keep their own paid counter — roll it back by the refunded amount.
  let extraTouched = false;
  r.lines.forEach(l => {
    if(l.category === 'extra' && l.extraFeeId){
      const fee = studentExtraFees.find(f => f.id === l.extraFeeId);
      if(fee){
        fee.paidAmount = Math.max(0, (Number(fee.paidAmount) || 0) - l.amount);
        fee.paid = fee.paidAmount >= fee.amount && fee.amount > 0;
        extraTouched = true;
      }
    }
  });
  try{
    if(extraTouched) await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    if(r.method !== 'credit'){
      if(!acctExpenseCategories.includes('Fee Refund')){
        acctExpenseCategories.push('Fee Refund');
        await storageSet(ACCT_EXPENSE_CATS_KEY, acctExpenseCategories);
      }
      r.lines.forEach((l, i) => {
        const p = pays[i];
        acctExpenses.push({
          id: 'exp_' + Date.now() + '_' + i, voucherNo: voucherNos[i], date: new Date().toISOString().slice(0, 10),
          category: 'Fee Refund', costCenter: feePaymentCostCenter(p), amount: l.amount, party: r.studentName,
          mode: r.method, referenceNo: r.refundNo, bankAccountId: r.bankAccountId,
          description: `Fee refund ${r.refundNo} — ${l.head} (receipt ${l.receiptNo || '—'}). ${r.reasonCode}${r.note ? ' — ' + r.note : ''}`,
          addedBy: currentUser.name, voided: false,
        });
      });
      if(!(await saveKeySafely(ACCT_EXPENSES_KEY, acctExpenses, 'Refund voucher ' + voucherNos.join(', ')))) throw new Error('refund voucher not saved');
    }
  }catch(e){
    showToast(`Refund ${r.refundNo} was recorded, but a follow-up save failed (${e.message}). Please check Accounting and the student's fee screen.`);
  }
  refreshAfterRefund();
  showToast(r.method === 'credit' ? `Refund ${r.refundNo}: ${fmtMoney(r.total)} credited to ${r.studentName}'s account.` : `Refund ${r.refundNo} of ${fmtMoney(r.total)} paid out (voucher ${voucherNos.join(', ')}).`, 'burst');
  return true;
}
async function rfApprove(refundId){
  if(rfBusy) return;
  rfBusy = true;
  try{ await rfProcess(refundId); }finally{ rfBusy = false; }
}
async function rfReject(refundId){
  if(!refundPerm('approve')){ showToast("You don't have permission to reject refunds."); return; }
  const reason = await showPromptDialog('Reason for rejecting this refund request', { title: 'Reject refund', okText: 'Reject', placeholder: 'e.g. fee is non-refundable' });
  if(reason === null || reason === undefined) return;
  if(!reason){ showToast('Please enter a reason.'); return; }
  await rfEnsureAll();
  const r = feeRefunds.find(x => x.id === refundId);
  if(!r || r.status !== 'pending'){ showToast('This request is no longer pending.'); refreshAfterRefund(); return; }
  r.status = 'rejected'; r.rejectedBy = currentUser.name; r.rejectedAt = new Date().toISOString(); r.rejectReason = reason;
  rfAudit(r, 'rejected', reason); _rfCache = null;
  await storageSet(FEE_REFUNDS_KEY, feeRefunds);
  refreshAfterRefund();
  showToast(`Request ${r.refundNo} rejected.`);
}
async function rfCancel(refundId){
  await rfEnsureAll();
  const r = feeRefunds.find(x => x.id === refundId);
  if(!r || r.status !== 'pending'){ showToast('This request is no longer pending.'); refreshAfterRefund(); return; }
  const mine = r.requestedBy === currentUser.name;
  if(!mine && !refundPerm('delete')){ showToast("You can only cancel your own requests."); return; }
  if(!(await showConfirmDialog(`Cancel refund request ${r.refundNo}?`))) return;
  r.status = 'cancelled'; rfAudit(r, 'cancelled'); _rfCache = null;
  await storageSet(FEE_REFUNDS_KEY, feeRefunds);
  refreshAfterRefund();
  showToast(`Request ${r.refundNo} cancelled.`);
}

/* ---------- 3. apply account credit to dues ---------- */
async function openApplyCredit(studentId){
  if(!canSub('managefee_collection', 'managefee', 'create')){ showToast("You don't have permission to collect fees."); return; }
  await rfEnsureAll();
  const s = students.find(x => x.id === studentId);
  if(!s) return;
  const bal = studentCreditBalance(studentId);
  if(bal <= 0){ showToast('This student has no account credit.'); return; }
  const fin = computeStudentFinance(s);
  const heads = [];
  Object.keys(fin.perCat).forEach(c => {
    const due = Math.round(fin.perCat[c].receivable);
    if(due > 0) heads.push({ type: 'cat', key: c, label: CATS[c] || c, due });
  });
  (fin.extras || []).forEach(e => {
    const due = Math.round((Number(e.amount) || 0) - (Number(e.paidAmount) || 0));
    if(due > 0) heads.push({ type: 'extra', key: e.id, label: e.name, due });
  });
  if(!heads.length){ showToast('This student has no pending dues to apply credit to.'); return; }
  rfOpenModal(`
    <h2>Apply account credit</h2>
    <p class="modal-sub">${escapeHtml(rfStudentName(studentId))} · credit available <b>${fmtMoney(bal)}</b></p>
    <div class="table-wrap rf-m" style="margin-bottom:12px;"><style>@media(max-width:600px){.rf-m table{font-size:12.5px}.rf-m th,.rf-m td{padding:8px 6px!important}.rf-m td input[type=number],.rf-m td input[type=text]{width:84px!important;min-width:0}.rf-m th{font-size:10px!important;letter-spacing:0!important}}</style><table><thead><tr><th>Fee head</th><th>Due</th><th>Apply (₹)</th></tr></thead><tbody>
      ${heads.map((h, i) => `<tr data-i="${i}"><td><b>${escapeHtml(h.label)}</b></td><td>${fmtMoney(h.due)}</td><td><input type="number" class="input rf-cr" min="0" max="${h.due}" value="0" style="width:110px;" oninput="rfUpdateCreditTotal(${bal})"></td></tr>`).join('')}
    </tbody></table></div>
    <div id="rfCreditTotal" class="note" style="margin:8px 0 14px;">Total to apply: ₹0 of ${fmtMoney(bal)}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" onclick="rfCloseModal()">Cancel</button>
      <button type="button" class="btn btn-primary" onclick="submitApplyCredit('${studentId}')">Apply credit</button>
    </div>`);
  window._rfCreditHeads = heads;
}
function rfUpdateCreditTotal(bal){
  const t = Array.from(document.querySelectorAll('.rf-cr')).reduce((s, i) => s + (Number(i.value) || 0), 0);
  const el = document.getElementById('rfCreditTotal');
  el.textContent = `Total to apply: ${fmtMoney(t)} of ${fmtMoney(bal)}`;
  el.style.color = t > bal ? '#b91c1c' : '';
}
async function submitApplyCredit(studentId){
  if(rfBusy) return;
  rfBusy = true;
  try{
    await rfEnsureAll();
    const s = students.find(x => x.id === studentId);
    const bal = studentCreditBalance(studentId);
    const heads = [];
    document.querySelectorAll('#rfModalContent tr[data-i]').forEach(tr => {
      const h = window._rfCreditHeads[Number(tr.dataset.i)];
      const amt = Math.round(Number(tr.querySelector('.rf-cr').value) || 0);
      if(h && amt > 0) heads.push({ type: h.type, key: h.key, label: h.label, amount: Math.min(amt, h.due) });
    });
    if(!heads.length){ showToast('Enter an amount for at least one fee head.'); return; }
    const total = heads.reduce((a, h) => a + h.amount, 0);
    if(total > bal){ showToast(`Only ${fmtMoney(bal)} of credit is available.`); return; }
    const res = recordFamilyPayment(studentId, heads, 'Account Credit', new Date().toISOString().slice(0, 10), 'Applied from account credit');
    if(!res){ showToast('Nothing was applied.'); return; }
    if(!(await saveReceiptsSafely(Array.isArray(res) ? res : (res && res.records) || [], 'The credit receipt'))){ rfCloseModal(); return; }
    if(!(await saveKeySafely(STUDENT_EXTRA_FEES_KEY, studentExtraFees, 'The extra-fee balances'))) warnPartialAndReload('Credit applied but the extra-fee balances were not saved — please check the Extra Fees.');
    rfCloseModal();
    refreshAfterRefund();
    showToast(`${fmtMoney(total)} of account credit applied for ${rfStudentName(studentId)}.`, 'burst');
  }finally{ rfBusy = false; }
}

/* ---------- 4. refund voucher (credit note) ---------- */
function printRefundVoucher(refundId){
  const r = feeRefunds.find(x => x.id === refundId);
  if(!r || r.status !== 'processed'){ showToast('Only processed refunds have a voucher.'); return; }
  if(!refundPerm('print')){ showToast("You don't have permission to print refund vouchers."); return; }
  const w = window.open('', '_blank');
  if(!w){ showToast('Allow pop-ups for this site to print the voucher.'); return; }
  const school = (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.name) || 'School';
  const rows = r.lines.map(l => `<tr><td>${escapeHtml(l.head)}</td><td>${escapeHtml(l.receiptNo || '—')}</td><td>${escapeHtml(l.paidOn || '—')}</td><td style="text-align:right;">${fmtMoney(l.amount)}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Refund ${escapeHtml(r.refundNo)}</title>
    <style>body{font-family:Arial,sans-serif;max-width:720px;margin:24px auto;color:#111;} h1{margin:0;font-size:22px;} h2{margin:2px 0 14px;font-size:15px;letter-spacing:.12em;color:#555;}
    table{width:100%;border-collapse:collapse;margin:14px 0;} th,td{border:1px solid #bbb;padding:7px 9px;font-size:13px;text-align:left;} th{background:#f2f2f2;}
    .meta{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;} .sig{display:flex;justify-content:space-between;margin-top:56px;font-size:12px;} .sig div{border-top:1px solid #333;padding-top:4px;width:30%;text-align:center;}</style></head><body>
    <h1>${escapeHtml(school)}</h1><h2>REFUND VOUCHER / CREDIT NOTE</h2>
    <div class="meta"><span><b>Refund no:</b> ${escapeHtml(r.refundNo)}</span><span><b>Date:</b> ${escapeHtml((r.processedAt || '').slice(0, 10))}</span></div>
    <div class="meta"><span><b>Student:</b> ${escapeHtml(r.studentName)}${r.className ? ' (' + escapeHtml(r.className) + ')' : ''}</span><span><b>Against receipt:</b> ${escapeHtml(r.receiptNo || '—')}</span></div>
    <table><thead><tr><th>Fee head</th><th>Receipt</th><th>Paid on</th><th style="text-align:right;">Refunded</th></tr></thead><tbody>${rows}
    <tr><td colspan="3" style="text-align:right;"><b>Total refunded</b></td><td style="text-align:right;"><b>${fmtMoney(r.total)}</b></td></tr></tbody></table>
    <div class="meta"><span><b>Returned as:</b> ${escapeHtml(RF_METHODS[r.method] || r.method)}${r.voucherNos && r.voucherNos.length ? ' · voucher ' + escapeHtml(r.voucherNos.join(', ')) : ''}</span></div>
    <div class="meta"><span><b>Reason:</b> ${escapeHtml(r.reasonCode)}${r.note ? ' — ' + escapeHtml(r.note) : ''}</span></div>
    <div class="meta"><span><b>Requested by:</b> ${escapeHtml(r.requestedBy)}</span><span><b>Approved by:</b> ${escapeHtml(r.approvedBy || '')}</span></div>
    <div class="sig"><div>Accountant</div><div>Approved by</div><div>Parent / Guardian</div></div>
    <script>window.onload=function(){setTimeout(function(){window.print();},300);}<\/script></body></html>`);
  w.document.close();
}

/* ---------- 5. Refunds tab ---------- */
let rfFilter = { status: 'all', q: '' };
async function renderRefundsTab(body){
  await rfEnsureAll();
  if(!refundPerm('view')){ body.innerHTML = `<div class="empty-state"><b>You don't have access to Refunds.</b></div>`; return; }
  if(rfView === 'create' && refundPerm('create')) return renderRefundCreate(body);
  rfView = 'list';
  const pend = feeRefunds.filter(r => r.status === 'pending');
  const done = feeRefunds.filter(r => r.status === 'processed');
  const month = new Date().toISOString().slice(0, 7);
  const doneMonth = done.filter(r => (r.processedAt || '').slice(0, 7) === month);
  const creditSids = Array.from(new Set(done.filter(r => r.method === 'credit').map(r => r.studentId)));
  const credits = creditSids.map(sid => ({ sid, bal: studentCreditBalance(sid) })).filter(x => x.bal > 0);
  const creditTotal = credits.reduce((s, x) => s + x.bal, 0);
  const sum = a => a.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const isAdmin = currentUser.role === 'Admin';
  const q = rfFilter.q.toLowerCase();
  const hist = feeRefunds.slice().reverse().filter(r => (rfFilter.status === 'all' || r.status === rfFilter.status) &&
    (!q || [r.refundNo, r.studentName, r.receiptNo, r.reasonCode].join(' ').toLowerCase().includes(q)));
  const actionCell = r => {
    const a = [];
    if(r.status === 'pending'){
      if(rfCanApproveAmount(r.total)) a.push(sfBtn('primary', 'check', 'Approve', `rfApprove('${r.id}')`));
      else if(refundPerm('approve')) a.push(`<small style="color:#b45309;">Above your limit — Admin only</small>`);
      if(refundPerm('approve')) a.push(sfBtn('danger', '', 'Reject', `rfReject('${r.id}')`));
      if(r.requestedBy === currentUser.name || refundPerm('delete')) a.push(sfBtn('soft', '', 'Cancel', `rfCancel('${r.id}')`));
    }
    if(r.status === 'processed' && refundPerm('print')) a.push(sfBtn('link', 'receipt', 'Voucher', `printRefundVoucher('${r.id}')`));
    return a.join(' ');
  };
  const statusPill = r => ({ pending: '<span class="pill">Pending</span>', processed: '<span class="pill" style="background:#dcfce7;color:#166534;">Processed</span>', rejected: '<span class="balance-tag due">Rejected</span>', cancelled: '<span class="pill" style="opacity:.7;">Cancelled</span>' }[r.status] || r.status);
  const trail = r => `<details><summary style="cursor:pointer;font-size:.8rem;">Trail (${(r.audit || []).length})</summary><div style="font-size:.78rem;line-height:1.5;margin-top:4px;">${(r.audit || []).map(e => `${new Date(e.at).toLocaleString()} — <b>${escapeHtml(e.action)}</b> by ${escapeHtml(e.by)} (${escapeHtml(e.role)})${e.note ? ' · ' + escapeHtml(e.note) : ''}`).join('<br>')}</div></details>`;
  const reasonMap = {};
  done.forEach(r => { reasonMap[r.reasonCode] = reasonMap[r.reasonCode] || { n: 0, amt: 0 }; reasonMap[r.reasonCode].n++; reasonMap[r.reasonCode].amt += Number(r.total) || 0; });
  const row = r => `<tr>
    <td><b>${escapeHtml(r.refundNo)}</b><br><small>${escapeHtml((r.requestedAt || '').slice(0, 10))}</small></td>
    <td>${escapeHtml(r.studentName)}<br><small>${escapeHtml(r.className || '')} · receipt ${escapeHtml(r.receiptNo || '—')}</small></td>
    <td>${r.lines.map(l => `${escapeHtml(l.head)} ${fmtMoney(l.amount)}`).join('<br>')}</td>
    <td><b>${fmtMoney(r.total)}</b><br><small>${escapeHtml(RF_METHODS[r.method] || r.method)}</small></td>
    <td>${escapeHtml(r.reasonCode)}${r.note ? `<br><small>${escapeHtml(r.note)}</small>` : ''}${r.rejectReason ? `<br><small style="color:#b91c1c;">Rejected: ${escapeHtml(r.rejectReason)}</small>` : ''}</td>
    <td>${statusPill(r)}<br><small>by ${escapeHtml(r.requestedBy)}${r.approvedBy ? ' · ok ' + escapeHtml(r.approvedBy) : ''}</small></td>
    <td>${actionCell(r)}<br>${trail(r)}</td></tr>`;
  body.innerHTML = `
    ${refundPerm('create') ? `<div style="display:flex;justify-content:flex-end;margin-bottom:14px;">${sfBtn('primary', 'plus', 'New Refund', 'openRefundCreate()')}</div>` : ''}
    <section class="sf-kpis">
      ${sfKpi('Pending approval', pend.length, pend.length ? 'danger' : 'plain', fmtMoney(sum(pend)))}
      ${sfKpi('Refunded this month', fmtMoney(sum(doneMonth)), 'plain', doneMonth.length + ' refund(s)')}
      ${sfKpi('Account credit outstanding', fmtMoney(creditTotal), 'good', credits.length + ' student(s)')}
      ${currentUser.role === 'Admin' ? sfKpi('Principal approval limit', fmtMoney(rfApproverLimit('Principal')), 'plain', 'Admin: no limit') : ''}
    </section>
    ${pend.length ? `<div class="dash-section-title"><div><h3>Awaiting approval</h3></div></div>
      <div class="table-wrap" style="overflow-x:auto;margin-bottom:24px;"><table><thead><tr><th>Refund</th><th>Student</th><th>Heads</th><th>Amount</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>${pend.map(row).join('')}</tbody></table></div>` : ''}
    <div class="dash-section-title"><div><h3>All refunds</h3></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <select class="input" onchange="rfFilter.status=this.value;renderRefundsTab(document.getElementById('feeBody'))">${['all','pending','processed','rejected','cancelled'].map(s => `<option value="${s}" ${rfFilter.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
        <input class="input" placeholder="Search student / receipt / refund no" value="${escapeHtml(rfFilter.q)}" onchange="rfFilter.q=this.value;renderRefundsTab(document.getElementById('feeBody'))" style="min-width:230px;">
      </div></div>
    <div class="table-wrap" style="overflow-x:auto;margin-bottom:24px;"><table><thead><tr><th>Refund</th><th>Student</th><th>Heads</th><th>Amount</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
      ${hist.length ? hist.map(row).join('') : `<tr><td colspan="7"><div class="empty-state"><b>No refunds yet</b>Click “+ New Refund” above to start one.</div></td></tr>`}
    </tbody></table></div>
    ${credits.length ? `<div class="dash-section-title"><div><h3>Students with account credit</h3></div></div>
      <div class="table-wrap" style="margin-bottom:24px;"><table><thead><tr><th>Student</th><th>Credit</th><th></th></tr></thead><tbody>
      ${credits.map(c => `<tr><td>${escapeHtml(rfStudentName(c.sid))}</td><td>${fmtMoney(c.bal)}</td><td>${canSub('managefee_collection', 'managefee', 'create') ? sfBtn('soft', 'check', 'Apply to dues', `openApplyCredit('${c.sid}')`) : ''}</td></tr>`).join('')}
      </tbody></table></div>` : ''}
    ${Object.keys(reasonMap).length ? `<div class="dash-section-title"><div><h3>Refunds by reason</h3></div></div>
      <div class="table-wrap" style="margin-bottom:24px;"><table><thead><tr><th>Reason</th><th>Count</th><th>Amount</th></tr></thead><tbody>
      ${Object.keys(reasonMap).sort((a, b) => reasonMap[b].amt - reasonMap[a].amt).map(k => `<tr><td>${escapeHtml(k)}</td><td>${reasonMap[k].n}</td><td>${fmtMoney(reasonMap[k].amt)}</td></tr>`).join('')}
      </tbody></table></div>` : ''}`;
}
async function saveRefundPolicy(){
  if(currentUser.role !== 'Admin'){ showToast('Only Admin can change the refund policy.'); return; }
  const limit = Math.max(0, Math.round(Number(document.getElementById('rfPolLimit').value) || 0));
  refundPolicy = {
    principalLimit: limit,
    defaultMethod: document.getElementById('rfPolMethod').value,
    nonRefundable: document.getElementById('rfPolNon').value.trim(),
  };
  await storageSet(REFUND_POLICY_KEY, refundPolicy);
  showToast('Refund policy saved.', 'burst');
  initRefundPolicyPage();
}

/* ---------- Refund Policy (Configuration → Refund Policy) ---------- */
async function initRefundPolicyPage(){
  const body = document.getElementById('refundPolicyBody'); if(!body) return;
  await rfEnsureAll();
  const isAdmin = currentUser.role === 'Admin';
  body.innerHTML = `${isAdmin ? '' : '<p class="note" style="margin-bottom:12px;">View only — only Admin can change the refund policy.</p>'}    
    <div class="sf-card" style="padding:20px;margin-bottom:24px;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
        ${isAdmin ? `<label class="sf-field"><span>Principal can approve up to (₹)</span><input type="number" min="0" id="rfPolLimit" value="${rfApproverLimit('Principal')}"></label>` : ''}
        <label class="sf-field"><span>Default return method</span><select id="rfPolMethod" ${isAdmin ? '' : 'disabled'}>${Object.keys(RF_METHODS).map(k => `<option value="${k}" ${refundPolicy.defaultMethod === k ? 'selected' : ''}>${RF_METHODS[k]}</option>`).join('')}</select></label>
        <label class="sf-field"><span>Non-refundable heads (words, comma-separated)</span><input id="rfPolNon" value="${escapeHtml(refundPolicy.nonRefundable || '')}" ${isAdmin ? '' : 'disabled'}></label>
      </div>
      <p style="font-size:.82rem;margin:10px 0 0;opacity:.8;">Admin approves any amount, and an Admin's own refunds need no second approval. Refunds are started from <em>Manage Fee → Refunds → New Refund</em>. Who may request / approve / cancel / print is set per role in <em>Roles &amp; Permissions → Manage Fee → Fee Refunds</em>.</p>
      ${isAdmin ? `<div style="margin-top:12px;">${sfBtn('primary', 'check', 'Save policy', 'saveRefundPolicy()')}</div>` : ''}
    </div>`;
}
