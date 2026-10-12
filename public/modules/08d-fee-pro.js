/* ===== FEE PRO — payment details, cheque tracking, Day Book & reports, late-fee collection,
   concession rules, advance deposits / opening balances =====

   Everything here sits ON TOP of the existing fee records (payments + studentExtraFees +
   studentDiscounts); nothing is migrated and old receipts keep working untouched.

   Payment details  Every receipt now keeps who collected it, the UPI/bank reference, the cheque
                    number/bank/date and the Bank/Cash account the money was deposited to.
   Cheques          received -> deposited -> cleared | bounced. A bounce voids the receipt (income
                    is reversed in Accounting automatically) and can raise a cheque-return charge.
   Day Book         Collections by mode / cashier / head, refunds paid out, cash-in-hand check and
                    day-end closing (a closed day can only be changed by an Admin).
   Late fees        Raised as real, collectable fee lines (Extra Fees), once per overdue installment;
                    Admin can waive with a reason (kept in an audit list).
   Concessions      Rule-driven (sibling order, RTE) — previewed first, then granted through the same
                    Discount records the manual flow uses.
   Advance / dues   Advance deposits are held as the student's account credit; opening balances for
                    schools moving over from another system become a normal "Previous Dues" line.

   Permissions: Roles & Permissions -> Manage Fee -> "Reports & Day Book"
     View = open the reports · Create = close a day · Edit = update cheque status · Print = export. */

const FP_SETTINGS_KEY = 'fee-pro-settings';
const FP_CLOSINGS_KEY = 'fee-day-closings';
const FP_WAIVERS_KEY = 'fee-late-waivers';
const FP_RULES_KEY = 'concession-rules';
[FP_SETTINGS_KEY, FP_CLOSINGS_KEY, FP_WAIVERS_KEY, FP_RULES_KEY].forEach(k => { OBJECT_BACKED_KEYS[k] = '/api/kv/' + k; });

const FP_DEFAULT_SETTINGS = { bounceCharge: 0, requireRef: true, receiptNote: 'Fee once paid is not transferable. Any refund is made only as per the school refund policy. Computer-generated receipt.' };
let fpSettings = Object.assign({}, FP_DEFAULT_SETTINGS);
let fpClosings = [];   // [{ date, expectedCash, countedCash, variance, note, closedBy, closedAt, reopened }]
let fpWaivers = [];    // [{ id, key, studentId, studentName, name, amount, reason, by, at }]
let fpRules = [];      // concession rules
let fpLoaded = false;

async function fpLoad(){
  const [s, c, w, r] = await Promise.all([
    storageGet(FP_SETTINGS_KEY, {}), storageGet(FP_CLOSINGS_KEY, []),
    storageGet(FP_WAIVERS_KEY, []), storageGet(FP_RULES_KEY, []),
  ]);
  fpSettings = Object.assign({}, FP_DEFAULT_SETTINGS, (s && typeof s === 'object' && !Array.isArray(s)) ? s : {});
  fpClosings = Array.isArray(c) ? c : [];
  fpWaivers = Array.isArray(w) ? w : [];
  fpRules = Array.isArray(r) ? r : [];
  fpLoaded = true;
}
async function fpEnsure(){ if(!fpLoaded) await fpLoad(); }
function fpCan(action){
  if(!currentUser) return false;
  if(currentUser.role === 'Admin') return true;
  return canSub('managefee_reports', 'managefee', action);
}
function feeDayClosed(date){ return !!date && fpClosings.some(c => c.date === date && !c.reopened); }

/* ---------- small helpers ---------- */
function fpEsc(v){ return escapeHtml(v == null ? '' : String(v)); }
function fpModeKey(p){ return p.mode === 'Online' || p.mode === 'UPI' ? 'Online / UPI' : (p.mode || 'Other'); }
function fpGroupReceipts(list){
  const map = new Map();
  list.forEach(p => {
    const k = (p.receiptNo || p.id) + '|' + p.studentId;
    if(!map.has(k)) map.set(k, { receiptNo: p.receiptNo || '—', studentId: p.studentId, studentName: p.studentName, date: p.date, mode: p.mode, collectedBy: p.collectedBy || '', recs: [] });
    map.get(k).recs.push(p);
  });
  return Array.from(map.values());
}
function fpStudentClass(sid){ const s = students.find(x => x.id === sid); return s ? (s.className + ' - ' + s.section) : ''; }
function fpRefDetail(p){
  if(p.mode === 'Cheque') return `Cheque ${p.chequeNo || '—'}${p.chequeBank ? ' · ' + p.chequeBank : ''}${p.chequeDate ? ' · dt ' + p.chequeDate : ''}`;
  if(p.ref) return 'Ref ' + p.ref;
  return '';
}

/* =====================================================================================
   1. PAYMENT DETAILS on the Collect screen
   ===================================================================================== */
function ffRenderModeFields(){
  const box = document.getElementById('ffDetails');
  if(!box) return;
  const mode = document.getElementById('ffMode').value;
  const accts = (typeof acctBankAccounts !== 'undefined' ? acctBankAccounts : []).filter(b => b.active !== false);
  const prev = {};
  box.querySelectorAll('input,select').forEach(el => { prev[el.id] = el.value; });
  const need = fpSettings.requireRef ? ' <span class="required-star">*</span>' : '';
  let html = '';
  if(mode === 'Cheque'){
    html += `<div class="f-field"><label>Cheque number <span class="required-star">*</span></label><input type="text" id="ffChequeNo" inputmode="numeric" placeholder="6-digit cheque no."></div>
      <div class="f-field"><label>Drawn on bank <span class="required-star">*</span></label><input type="text" id="ffChequeBank" placeholder="e.g. State Bank of India"></div>
      <div class="f-field"><label>Cheque date <span class="required-star">*</span></label><input type="date" id="ffChequeDate"></div>`;
  }else if(mode === 'Online' || mode === 'UPI'){
    html += `<div class="f-field"><label>${mode === 'UPI' ? 'UPI transaction / UTR no.' : 'Bank transaction / UTR no.'}${need}</label><input type="text" id="ffRef" placeholder="Reference number from the payment"></div>`;
  }
  if(accts.length){
    html += `<div class="f-field"><label>Deposited to</label><select id="ffBank"><option value="">Automatic (by payment mode)</option>${accts.map(b => `<option value="${fpEsc(b.id)}">${fpEsc(b.name)}</option>`).join('')}</select></div>`;
  }
  box.innerHTML = html;
  if(mode === 'Cheque' && !document.getElementById('ffChequeDate').value) document.getElementById('ffChequeDate').value = localISODate();
  Object.keys(prev).forEach(id => { const el = document.getElementById(id); if(el && prev[id] !== '') el.value = prev[id]; });
}

// Validates the mode-specific fields and returns what should be stored on every payment record.
function ffReadDetails(mode, date){
  const out = { ok: false, data: {} };
  const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
  const data = {};
  if(mode === 'Cheque'){
    const no = v('ffChequeNo'), bank = v('ffChequeBank'), dt = v('ffChequeDate');
    if(!no){ showToast('Enter the cheque number.'); return out; }
    if(!bank){ showToast('Enter the bank the cheque is drawn on.'); return out; }
    if(!dt){ showToast('Enter the date written on the cheque.'); return out; }
    const dup = payments.find(p => !p.voided && p.mode === 'Cheque' && p.chequeNo === no && (p.chequeBank || '').toLowerCase() === bank.toLowerCase());
    if(dup){ showToast(`Cheque ${no} (${bank}) was already recorded on receipt ${dup.receiptNo}.`); return out; }
    Object.assign(data, { chequeNo: no, chequeBank: bank, chequeDate: dt, chequeStatus: 'received' });
  }else if(mode === 'Online' || mode === 'UPI'){
    const ref = v('ffRef');
    if(!ref && fpSettings.requireRef){ showToast('Enter the transaction / UTR reference number.'); return out; }
    if(ref){
      const dup = payments.find(p => !p.voided && p.ref && p.ref.toLowerCase() === ref.toLowerCase());
      if(dup){ showToast(`Reference ${ref} was already recorded on receipt ${dup.receiptNo}.`); return out; }
      data.ref = ref;
    }
  }
  const bank = v('ffBank');
  if(bank) data.bankAccountId = bank;
  out.ok = true; out.data = data;
  return out;
}

/* =====================================================================================
   2. CHEQUE LIFECYCLE
   ===================================================================================== */
const FP_CHEQUE_STATES = { received: 'Received', deposited: 'Deposited', cleared: 'Cleared', bounced: 'Bounced' };
function fpChequeGroups(){
  return fpGroupReceipts(payments.filter(p => p.mode === 'Cheque' && p.chequeNo)).map(g => {
    const first = g.recs[0];
    return Object.assign(g, {
      chequeNo: first.chequeNo, chequeBank: first.chequeBank, chequeDate: first.chequeDate,
      status: first.chequeStatus || 'received', amount: g.recs.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      statusDate: first.chequeStatusDate || '', note: first.chequeNote || '',
    });
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
function fpChequeBadge(st){
  const tone = st === 'cleared' ? 'success' : st === 'bounced' ? 'danger' : st === 'deposited' ? 'info' : 'warning';
  return pillTone(tone, FP_CHEQUE_STATES[st] || st);
}
async function fpChequeSet(receiptNo, studentId, status){
  if(!fpCan('edit')){ showToast("You don't have permission to update cheque status."); return; }
  await rfEnsureAll(); await fpEnsure();
  const recs = payments.filter(p => p.receiptNo === receiptNo && p.studentId === studentId && p.mode === 'Cheque');
  if(!recs.length) return;
  const cur = recs[0].chequeStatus || 'received';
  if(cur === status) return;
  if(cur === 'bounced'){ showToast('A bounced cheque is final. Collect the fee again with a new payment.'); return; }
  if(status === 'bounced'){
    if(recs.some(r => r.voided)){ showToast('This receipt was already voided.'); return; }
    if(recs.some(r => payRefunded(r) > 0 || payPendingRefund(r) > 0)){ showToast('This receipt already has a refund against it, so it cannot be marked bounced.'); return; }
    if(feeDayClosed(recs[0].date) && currentUser.role !== 'Admin'){ showToast('The day of this receipt is closed. Ask an Admin to record the bounce.'); return; }
    const reason = await showPromptDialog(`Mark cheque ${recs[0].chequeNo} (${fmtMoney(recs.reduce((s, r) => s + (Number(r.amount) || 0), 0))}) as BOUNCED?\n\nThe receipt will be voided and the fee becomes due again. Reason from the bank (optional):`, { title: 'Cheque bounced', defaultValue: 'Funds insufficient' });
    if(reason === null) return;
    const now = new Date().toISOString();
    recs.forEach(p => {
      p.chequeStatus = 'bounced'; p.chequeStatusDate = localISODate(); p.chequeNote = reason.trim();
      p.voided = true; p.voidType = 'bounce'; p.voidReason = 'Cheque bounced' + (reason.trim() ? ' — ' + reason.trim() : '');
      p.voidedBy = currentUser.name; p.voidedAt = now;
      if(p.category === 'extra' && p.extraFeeId){
        const fee = studentExtraFees.find(f => f.id === p.extraFeeId);
        if(fee){ fee.paidAmount = Math.max(0, (Number(fee.paidAmount) || 0) - (Number(p.amount) || 0)); fee.paid = fee.paidAmount >= fee.amount && fee.amount > 0; }
      }
    });
    const charge = Number(fpSettings.bounceCharge) || 0;
    if(charge > 0){
      studentExtraFees.push({ id: 'sef_bounce_' + Date.now() + '_' + studentId, studentId, name: `Cheque return charges (cheque ${recs[0].chequeNo})`, amount: charge, paid: false, date: localISODate(), kind: 'bounce' });
    }
    await storageSet(PAYMENTS_KEY, payments);
    await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
    showToast(`Cheque marked bounced — receipt voided${charge > 0 ? ' and a ' + fmtMoney(charge) + ' return charge added to dues' : ''}.`, 'burst');
  }else{
    recs.forEach(p => { p.chequeStatus = status; p.chequeStatusDate = localISODate(); });
    await storageSet(PAYMENTS_KEY, payments);
    showToast(`Cheque marked ${FP_CHEQUE_STATES[status].toLowerCase()}.`, 'burst');
  }
  try{ renderDashboard(); }catch(e){}
  renderReportsTab(document.getElementById('feeBody'));
}

/* =====================================================================================
   3. REPORTS & DAY BOOK
   ===================================================================================== */
let rpTab = 'daybook';
let rpFrom = '', rpTo = '', rpModeF = 'all', rpCashierF = 'all', rpGroup = 'head', rpChequeF = 'open';
let rpOrder = 'asc'; // Day Book receipt order: 'asc' = oldest receipt first (as before), 'desc' = newest receipt first
// Receipt numbers compared as numbers-in-text (000099 < 000100), flipped for newest-first.
function fpReceiptOrder(a, b){
  const c = String(a.receiptNo || '').localeCompare(String(b.receiptNo || ''), undefined, { numeric: true });
  return rpOrder === 'desc' ? -c : c;
}

function fpBooked(p){ return pBookedInLedger(p) && p.mode !== 'Account Credit'; }
function fpRefundsOut(from, to){
  return feeRefunds.filter(r => r.status === 'processed' && r.method !== 'credit' && (r.processedAt || '').slice(0, 10) >= from && (r.processedAt || '').slice(0, 10) <= to);
}

async function renderReportsTab(body){
  await rfEnsureAll(); await fpEnsure();
  if(!fpCan('view')){ body.innerHTML = `<div class="empty-state"><b>You don't have access to Reports.</b></div>`; return; }
  if(!rpFrom){ rpFrom = rpTo = localISODate(); }
  const tabs = [['daybook', 'Day Book'], ['register', 'Collection Register'], ['cheques', 'Cheques'], ['concessions', 'Concessions']];
  const head = `<div class="mf-subtabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">${tabs.map(t => `<button type="button" class="sf-btn ${rpTab === t[0] ? 'sf-btn--primary' : 'sf-btn--soft'}" onclick="rpTab='${t[0]}';renderReportsTab(document.getElementById('feeBody'))">${t[1]}</button>`).join('')}</div>`;
  const inner = document.createElement('div');
  body.innerHTML = head + '<div id="rpInner"></div>';
  const host = document.getElementById('rpInner');
  if(rpTab === 'daybook') fpPaintDayBook(host);
  else if(rpTab === 'register') fpPaintRegister(host);
  else if(rpTab === 'cheques') fpPaintCheques(host);
  else fpPaintConcessionReport(host);
}

function fpRangeBar(extra){
  return `<div class="iv-toolbar" style="flex-wrap:wrap;">
    <label class="ft-field" style="display:flex;gap:6px;align-items:center;"><span>From</span><input type="date" class="input" id="rpFrom" value="${rpFrom}" max="${localISODate()}" onchange="rpFrom=this.value;if(rpTo<rpFrom)rpTo=rpFrom;renderReportsTab(document.getElementById('feeBody'))"></label>
    <label class="ft-field" style="display:flex;gap:6px;align-items:center;"><span>To</span><input type="date" class="input" id="rpTo" value="${rpTo}" max="${localISODate()}" onchange="rpTo=this.value;if(rpTo<rpFrom)rpFrom=rpTo;renderReportsTab(document.getElementById('feeBody'))"></label>
    <button type="button" class="sf-btn sf-btn--soft" onclick="rpFrom=rpTo=localISODate();renderReportsTab(document.getElementById('feeBody'))">Today</button>
    <button type="button" class="sf-btn sf-btn--soft" onclick="fpSetMonth()">This month</button>
    ${extra || ''}</div>`;
}
function fpSetMonth(){ const t = localISODate(); rpFrom = t.slice(0, 8) + '01'; rpTo = t; renderReportsTab(document.getElementById('feeBody')); }

/* ---------- Day Book ---------- */
function fpDayBookData(){
  let list = payments.filter(p => p.date >= rpFrom && p.date <= rpTo);
  if(rpModeF !== 'all') list = list.filter(p => fpModeKey(p) === rpModeF || p.mode === rpModeF);
  if(rpCashierF !== 'all') list = list.filter(p => (p.collectedBy || '—') === rpCashierF);
  return list;
}
function fpPaintDayBook(host){
  const all = payments.filter(p => p.date >= rpFrom && p.date <= rpTo);
  const cashiers = Array.from(new Set(all.map(p => p.collectedBy || '—'))).sort();
  const list = fpDayBookData();
  const booked = list.filter(fpBooked);
  const sum = a => a.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const byMode = {}; booked.forEach(p => { const k = fpModeKey(p); byMode[k] = (byMode[k] || 0) + (Number(p.amount) || 0); });
  const adjusted = sum(list.filter(p => !p.voided && p.mode === 'Account Credit'));
  const outs = fpRefundsOut(rpFrom, rpTo);
  const refundsPaid = outs.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const cashRefunds = outs.filter(r => r.method === 'Cash').reduce((s, r) => s + (Number(r.total) || 0), 0);
  const total = sum(booked);
  const groups = fpGroupReceipts(list).sort(fpReceiptOrder);
  const single = rpFrom === rpTo;
  const cashIn = byMode['Cash'] || 0;
  const expectedCash = cashIn - cashRefunds;
  const closing = single ? fpClosings.find(c => c.date === rpFrom && !c.reopened) : null;
  const modeOpts = ['all', 'Cash', 'Online / UPI', 'Cheque'];
  const rows = groups.map(g => {
    const voided = g.recs.every(r => r.voided);
    const amt = g.recs.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const heads = g.recs.map(r => fpEsc(feeLabelFor(r))).join(', ');
    const det = fpRefDetail(g.recs[0]);
    return `<tr${voided ? ' style="opacity:.55;"' : ''}>
      <td><b>${fpEsc(g.receiptNo)}</b><br><small>${fpEsc(g.date)}</small></td>
      <td>${fpEsc(g.studentName || '')}<br><small>${fpEsc(fpStudentClass(g.studentId))}</small></td>
      <td>${heads}</td>
      <td>${fpEsc(g.mode || '—')}${det ? `<br><small>${fpEsc(det)}</small>` : ''}</td>
      <td>${fpEsc(g.collectedBy || '—')}</td>
      <td style="text-align:right;">${voided ? `<s>${fmtMoney(amt)}</s><br><small>${g.recs[0].voidType === 'bounce' ? 'BOUNCED' : g.recs[0].voidType === 'refund' ? 'REFUNDED' : 'VOIDED'}</small>` : `<b>${fmtMoney(amt)}</b>`}</td></tr>`;
  }).join('');
  const closeCard = single ? `<div class="sf-card" style="padding:16px;margin:16px 0;">
      <h4 style="margin:0 0 8px;">Day-end closing — ${fpEsc(rpFrom)}</h4>
      ${closing
        ? `<p style="margin:0 0 6px;">${pillTone('success', 'Closed')} by <b>${fpEsc(closing.closedBy)}</b> · expected cash ${fmtMoney(closing.expectedCash)} · counted ${fmtMoney(closing.countedCash)} · <b style="color:${closing.variance === 0 ? '#166534' : '#b91c1c'};">${closing.variance === 0 ? 'balanced' : (closing.variance > 0 ? 'excess ' : 'short ') + fmtMoney(Math.abs(closing.variance))}</b>${closing.note ? '<br><small>' + fpEsc(closing.note) + '</small>' : ''}</p>
           ${currentUser.role === 'Admin' ? sfBtn('soft', '', 'Reopen day (Admin)', `fpReopenDay('${rpFrom}')`) : '<small>Only an Admin can reopen a closed day.</small>'}`
        : `<p style="margin:0 0 10px;font-size:.88rem;">Expected cash in hand = cash collected ${fmtMoney(cashIn)} − cash refunds paid ${fmtMoney(cashRefunds)} = <b>${fmtMoney(expectedCash)}</b>.</p>
           ${fpCan('create') ? `<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
              <label class="ft-field"><span>Cash counted (₹)</span><input type="number" min="0" class="input" id="rpCounted" value="${Math.max(0, expectedCash)}"></label>
              <label class="ft-field" style="flex:1;min-width:200px;"><span>Note (required if short / excess)</span><input type="text" class="input" id="rpCloseNote" placeholder="Optional"></label>
              ${sfBtn('primary', 'check', 'Close the day', `fpCloseDay('${rpFrom}', ${expectedCash})`)}</div>` : '<small>You can view the Day Book but not close the day.</small>'}`}
    </div>` : '';
  host.innerHTML = fpRangeBar(`
      <select class="input" onchange="rpModeF=this.value;renderReportsTab(document.getElementById('feeBody'))">${modeOpts.map(m => `<option value="${m}" ${rpModeF === m ? 'selected' : ''}>${m === 'all' ? 'All modes' : m}</option>`).join('')}</select>
      <select class="input" onchange="rpCashierF=this.value;renderReportsTab(document.getElementById('feeBody'))"><option value="all">All cashiers</option>${cashiers.map(c => `<option value="${fpEsc(c)}" ${rpCashierF === c ? 'selected' : ''}>${fpEsc(c)}</option>`).join('')}</select>
      <select class="input" aria-label="Receipt order" title="Order of receipts" onchange="rpOrder=this.value;renderReportsTab(document.getElementById('feeBody'))"><option value="asc" ${rpOrder === 'asc' ? 'selected' : ''}>Oldest receipt first ↑</option><option value="desc" ${rpOrder === 'desc' ? 'selected' : ''}>Newest receipt first ↓</option></select>
      <div class="iv-toolbar-actions">${fpCan('print') ? sfBtn('soft', 'down', 'Excel', 'fpExportDayBook(false)') + sfBtn('soft', 'down', 'PDF', 'fpExportDayBook(true)') : ''}</div>`) + `
    <section class="sf-kpis">
      ${sfKpi('Collected', fmtMoney(total), 'good', groups.filter(g => !g.recs.every(r => r.voided)).length + ' receipt(s)')}
      ${sfKpi('Cash', fmtMoney(byMode['Cash'] || 0), 'plain')}
      ${sfKpi('Online / UPI', fmtMoney(byMode['Online / UPI'] || 0), 'plain')}
      ${sfKpi('Cheque', fmtMoney(byMode['Cheque'] || 0), 'plain')}
      ${sfKpi('Refunds paid out', fmtMoney(refundsPaid), refundsPaid ? 'danger' : 'plain', 'Net ' + fmtMoney(total - refundsPaid))}
      ${adjusted ? sfKpi('Adjusted from credit', fmtMoney(adjusted), 'plain', 'not new money') : ''}
    </section>
    ${closeCard}
    <div class="sf-card"><div class="table-wrap" style="overflow-x:auto;"><table class="iv-table"><thead><tr><th>Receipt</th><th>Student</th><th>Fee heads</th><th>Mode / reference</th><th>Collected by</th><th style="text-align:right;">Amount</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6"><div class="empty-state"><b>No receipts in this period</b></div></td></tr>`}</tbody></table></div></div>
    ${outs.length ? `<div class="dash-section-title"><div><h3>Refunds paid out</h3></div></div><div class="sf-card"><div class="table-wrap"><table class="iv-table"><thead><tr><th>Refund</th><th>Student</th><th>Method</th><th>Reason</th><th style="text-align:right;">Amount</th></tr></thead><tbody>${outs.map(r => `<tr><td>${fpEsc(r.refundNo)}<br><small>${fpEsc((r.processedAt || '').slice(0, 10))}</small></td><td>${fpEsc(r.studentName)}</td><td>${fpEsc(RF_METHODS[r.method] || r.method)}</td><td>${fpEsc(r.reasonCode)}</td><td style="text-align:right;">${fmtMoney(r.total)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
}
async function fpCloseDay(date, expectedCash){
  if(!fpCan('create')){ showToast("You don't have permission to close the day."); return; }
  const counted = Number(document.getElementById('rpCounted').value);
  const note = document.getElementById('rpCloseNote').value.trim();
  if(!isFinite(counted) || counted < 0){ showToast('Enter the cash counted.'); return; }
  const variance = Math.round((counted - expectedCash) * 100) / 100;
  if(variance !== 0 && !note){ showToast('The cash does not match — add a note explaining the difference.'); return; }
  if(!(await showConfirmDialog(`Close ${date}? After closing, receipts of this day can only be changed by an Admin.`))) return;
  await fpEnsure();
  fpClosings = fpClosings.filter(c => c.date !== date);
  fpClosings.push({ date, expectedCash, countedCash: counted, variance, note, closedBy: currentUser.name, closedAt: new Date().toISOString(), reopened: false });
  await storageSet(FP_CLOSINGS_KEY, fpClosings);
  showToast('Day closed.', 'burst');
  renderReportsTab(document.getElementById('feeBody'));
}
async function fpReopenDay(date){
  if(currentUser.role !== 'Admin'){ showToast('Only an Admin can reopen a closed day.'); return; }
  if(!(await showConfirmDialog(`Reopen ${date}? Receipts of this day become editable again.`))) return;
  const c = fpClosings.find(x => x.date === date && !x.reopened);
  if(c){ c.reopened = true; c.reopenedBy = currentUser.name; c.reopenedAt = new Date().toISOString(); }
  await storageSet(FP_CLOSINGS_KEY, fpClosings);
  renderReportsTab(document.getElementById('feeBody'));
}
function fpDayBookRows(){
  return fpGroupReceipts(fpDayBookData()).sort(fpReceiptOrder).map(g => ({
    'Receipt No': g.receiptNo, 'Date': g.date, 'Student': g.studentName || '', 'Class': fpStudentClass(g.studentId),
    'Fee Heads': g.recs.map(r => feeLabelFor(r)).join(', '), 'Mode': g.mode || '', 'Reference': fpRefDetail(g.recs[0]),
    'Collected By': g.collectedBy || '', 'Amount': g.recs.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    'Status': g.recs.every(r => r.voided) ? (g.recs[0].voidType === 'bounce' ? 'Bounced' : g.recs[0].voidType === 'refund' ? 'Refunded' : 'Voided') : 'OK',
  }));
}
function fpExportDayBook(pdf){
  const rows = fpDayBookRows();
  const name = `day_book_${rpFrom}_to_${rpTo}`;
  if(pdf) exportRowsToPDF('Day Book', `${rpFrom} to ${rpTo}`, rows); else exportRowsToExcel(name + '.xlsx', 'Day Book', rows);
}

/* ---------- Collection register (pivot) ---------- */
const FP_GROUPS = { head: 'Fee head', class: 'Class', mode: 'Payment mode', cashier: 'Collected by', date: 'Date', month: 'Month' };
function fpRegisterData(){
  const list = payments.filter(p => p.date >= rpFrom && p.date <= rpTo && fpBooked(p));
  const map = {};
  list.forEach(p => {
    let k;
    if(rpGroup === 'head') k = feeLabelFor(p);
    else if(rpGroup === 'class') k = p.classAtPayment || (students.find(s => s.id === p.studentId) || {}).className || '—';
    else if(rpGroup === 'mode') k = fpModeKey(p);
    else if(rpGroup === 'cashier') k = p.collectedBy || '—';
    else if(rpGroup === 'month') k = String(p.date).slice(0, 7);
    else k = p.date;
    const r = map[k] = map[k] || { key: k, receipts: new Set(), gross: 0, refunded: 0 };
    r.receipts.add((p.receiptNo || p.id) + '|' + p.studentId);
    r.gross += Number(p.amount) || 0;
    r.refunded += payRefunded(p);
  });
  return Object.values(map).map(r => ({ key: r.key, receipts: r.receipts.size, gross: r.gross, refunded: r.refunded, net: r.gross - r.refunded }))
    .sort((a, b) => rpGroup === 'date' || rpGroup === 'month' ? String(a.key).localeCompare(String(b.key)) : b.net - a.net);
}
function fpPaintRegister(host){
  const rows = fpRegisterData();
  const tot = rows.reduce((a, r) => ({ receipts: a.receipts + r.receipts, gross: a.gross + r.gross, refunded: a.refunded + r.refunded, net: a.net + r.net }), { receipts: 0, gross: 0, refunded: 0, net: 0 });
  host.innerHTML = fpRangeBar(`
      <label class="ft-field" style="display:flex;gap:6px;align-items:center;"><span>Group by</span><select class="input" onchange="rpGroup=this.value;renderReportsTab(document.getElementById('feeBody'))">${Object.keys(FP_GROUPS).map(k => `<option value="${k}" ${rpGroup === k ? 'selected' : ''}>${FP_GROUPS[k]}</option>`).join('')}</select></label>
      <div class="iv-toolbar-actions">${fpCan('print') ? sfBtn('soft', 'down', 'Excel', 'fpExportRegister(false)') + sfBtn('soft', 'down', 'PDF', 'fpExportRegister(true)') : ''}</div>`) + `
    <section class="sf-kpis">${sfKpi('Gross collected', fmtMoney(tot.gross), 'plain', tot.receipts + ' receipt line(s) grouped')}${sfKpi('Refunded', fmtMoney(tot.refunded), tot.refunded ? 'danger' : 'plain', 'against these receipts')}${sfKpi('Net collection', fmtMoney(tot.net), 'good')}</section>
    <div class="sf-card"><div class="table-wrap"><table class="iv-table"><thead><tr><th>${FP_GROUPS[rpGroup]}</th><th style="text-align:right;">Receipts</th><th style="text-align:right;">Gross</th><th style="text-align:right;">Refunded</th><th style="text-align:right;">Net</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td><b>${fpEsc(r.key)}</b></td><td style="text-align:right;">${r.receipts}</td><td style="text-align:right;">${fmtMoney(r.gross)}</td><td style="text-align:right;">${r.refunded ? fmtMoney(r.refunded) : '—'}</td><td style="text-align:right;"><b>${fmtMoney(r.net)}</b></td></tr>`).join('') || `<tr><td colspan="5"><div class="empty-state"><b>Nothing collected in this period</b></div></td></tr>`}
    ${rows.length ? `<tr style="background:rgba(33,26,78,.06);"><td><b>Total</b></td><td style="text-align:right;"><b>${tot.receipts}</b></td><td style="text-align:right;"><b>${fmtMoney(tot.gross)}</b></td><td style="text-align:right;"><b>${fmtMoney(tot.refunded)}</b></td><td style="text-align:right;"><b>${fmtMoney(tot.net)}</b></td></tr>` : ''}</tbody></table></div></div>`;
}
function fpExportRegister(pdf){
  const rows = fpRegisterData().map(r => ({ [FP_GROUPS[rpGroup]]: r.key, 'Receipts': r.receipts, 'Gross': r.gross, 'Refunded': r.refunded, 'Net': r.net }));
  if(pdf) exportRowsToPDF('Collection Register — by ' + FP_GROUPS[rpGroup], `${rpFrom} to ${rpTo}`, rows); else exportRowsToExcel(`collection_register_${rpGroup}_${rpFrom}_to_${rpTo}.xlsx`, 'Register', rows);
}

/* ---------- Cheques ---------- */
function fpPaintCheques(host){
  const all = fpChequeGroups();
  const f = rpChequeF;
  const list = f === 'all' ? all : f === 'open' ? all.filter(c => c.status === 'received' || c.status === 'deposited') : all.filter(c => c.status === f);
  const open = all.filter(c => c.status === 'received' || c.status === 'deposited');
  const canEdit = fpCan('edit');
  host.innerHTML = `
    <section class="sf-kpis">
      ${sfKpi('Cheques in hand / deposited', open.length, open.length ? 'warn' : 'good', fmtMoney(open.reduce((s, c) => s + c.amount, 0)) + ' awaiting clearance')}
      ${sfKpi('Cleared', all.filter(c => c.status === 'cleared').length, 'good')}
      ${sfKpi('Bounced', all.filter(c => c.status === 'bounced').length, all.some(c => c.status === 'bounced') ? 'danger' : 'plain')}
    </section>
    <div class="iv-toolbar"><select class="input" onchange="rpChequeF=this.value;renderReportsTab(document.getElementById('feeBody'))">${[['open', 'Awaiting clearance'], ['all', 'All cheques'], ['cleared', 'Cleared'], ['bounced', 'Bounced']].map(o => `<option value="${o[0]}" ${f === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
      <div class="iv-toolbar-actions">${fpCan('print') ? sfBtn('soft', 'down', 'Excel', 'fpExportCheques()') : ''}</div></div>
    <div class="sf-card"><div class="table-wrap" style="overflow-x:auto;"><table class="iv-table"><thead><tr><th>Cheque</th><th>Student / receipt</th><th>Cheque date</th><th style="text-align:right;">Amount</th><th>Status</th><th></th></tr></thead><tbody>
    ${list.map(c => {
      const a = [];
      if(canEdit && c.status === 'received') a.push(sfBtn('soft', '', 'Deposited', `fpChequeSet('${fpEsc(c.receiptNo)}','${c.studentId}','deposited')`));
      if(canEdit && (c.status === 'received' || c.status === 'deposited')) a.push(sfBtn('primary', 'check', 'Cleared', `fpChequeSet('${fpEsc(c.receiptNo)}','${c.studentId}','cleared')`), sfBtn('danger', '', 'Bounced', `fpChequeSet('${fpEsc(c.receiptNo)}','${c.studentId}','bounced')`));
      return `<tr><td><b>${fpEsc(c.chequeNo)}</b><br><small>${fpEsc(c.chequeBank || '')}</small></td>
        <td>${fpEsc(c.studentName || '')}<br><small>${fpEsc(c.receiptNo)} · received ${fpEsc(c.date)}</small></td>
        <td>${fpEsc(c.chequeDate || '—')}${c.chequeDate && c.chequeDate > localISODate() ? '<br><small>post-dated</small>' : ''}</td>
        <td style="text-align:right;"><b>${fmtMoney(c.amount)}</b></td>
        <td>${fpChequeBadge(c.status)}${c.statusDate ? `<br><small>${fpEsc(c.statusDate)}</small>` : ''}${c.note && c.status === 'bounced' ? `<br><small>${fpEsc(c.note)}</small>` : ''}</td>
        <td class="sf-actions">${a.join(' ')}</td></tr>`;
    }).join('') || `<tr><td colspan="6"><div class="empty-state"><b>No cheques here</b>Cheques you collect from the Collect screen appear in this register.</div></td></tr>`}
    </tbody></table></div></div>`;
}
function fpExportCheques(){
  exportRowsToExcel('cheque_register.xlsx', 'Cheques', fpChequeGroups().map(c => ({ 'Cheque No': c.chequeNo, 'Bank': c.chequeBank, 'Cheque Date': c.chequeDate, 'Receipt': c.receiptNo, 'Student': c.studentName, 'Received On': c.date, 'Amount': c.amount, 'Status': FP_CHEQUE_STATES[c.status] || c.status, 'Status Date': c.statusDate || '' })));
}

/* ---------- Concession report ---------- */
function fpDiscountAmount(d){
  if(d.mode !== 'percentage') return Number(d.value) || 0;
  const s = students.find(x => x.id === d.studentId); if(!s) return 0;
  const exp = d.appliesTo === 'hostel' ? (s.isBoarder === 'Yes' ? studentHostelFee(s) : 0) : d.appliesTo === 'bus' ? (s.needsTransport === 'Yes' ? studentBusFare(s) : 0) : (Number(classStruct(s.className)[d.appliesTo]) || 0);
  return Math.round(exp * (Number(d.value) || 0) / 100);
}
function fpPaintConcessionReport(host){
  const approved = studentDiscounts.filter(d => d.status === 'Approved');
  const pend = studentDiscounts.filter(d => d.status === 'Pending');
  const by = {};
  approved.forEach(d => {
    const s = students.find(x => x.id === d.studentId);
    const k = d.type || 'Discount';
    const r = by[k] = by[k] || { type: k, students: new Set(), amount: 0, classes: {} };
    r.students.add(d.studentId); const amt = fpDiscountAmount(d); r.amount += amt;
    const c = s ? s.className : '—'; r.classes[c] = (r.classes[c] || 0) + amt;
  });
  const rows = Object.values(by).sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  host.innerHTML = `<section class="sf-kpis">${sfKpi('Concessions granted', fmtMoney(total), 'plain', approved.length + ' discount record(s)')}${sfKpi('Awaiting approval', pend.length, pend.length ? 'warn' : 'good')}${sfKpi('Students benefiting', new Set(approved.map(d => d.studentId)).size, 'plain')}</section>
    <div class="iv-toolbar"><div class="iv-toolbar-actions">${fpCan('print') ? sfBtn('soft', 'down', 'Excel', 'fpExportConcessions()') : ''}</div></div>
    <div class="sf-card"><div class="table-wrap"><table class="iv-table"><thead><tr><th>Concession type</th><th style="text-align:right;">Students</th><th style="text-align:right;">Amount</th><th>Top classes</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${fpEsc(r.type)}</b></td><td style="text-align:right;">${r.students.size}</td><td style="text-align:right;"><b>${fmtMoney(r.amount)}</b></td><td><small>${Object.keys(r.classes).sort((a, b) => r.classes[b] - r.classes[a]).slice(0, 3).map(c => fpEsc(c) + ' ' + fmtMoney(r.classes[c])).join(' · ')}</small></td></tr>`).join('') || `<tr><td colspan="4"><div class="empty-state"><b>No concessions granted yet</b></div></td></tr>`}</tbody></table></div></div>`;
}
function fpExportConcessions(){
  exportRowsToExcel('concessions.xlsx', 'Concessions', studentDiscounts.filter(d => d.status === 'Approved').map(d => { const s = students.find(x => x.id === d.studentId) || {}; return { 'Student': (s.firstName || '') + ' ' + (s.lastName || ''), 'Admission No': s.admissionNo || '', 'Class': (s.className || '') + ' - ' + (s.section || ''), 'Type': d.type, 'Fee Head': (CATS[d.appliesTo] || d.appliesTo), 'Amount': fpDiscountAmount(d), 'Approved By': d.approvedBy || '', 'Remark': d.note || '' }; }));
}
