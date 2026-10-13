/* =========================================================================
   Fee Pro (part 2) — late fees that collect, waivers, concession rules,
   opening balances. Loads after 08d-fee-pro.js so these declarations win.
   ========================================================================= */

/* ---------- Late fees ---------- */
// Rule (stored in lateFeeSettings): amount, graceDays, dueDate (legacy) plus
//   mode 'flat' (one fee per head) | 'perday' (amount × days late, capped at `cap`)
//   autoAssess (assess automatically once a day when Student Fees opens)
function fpLateAmount(installments, now){
  const r = lateFeeSettings || {};
  const amt = Number(r.amount) || 0;
  if(!amt) return 0;
  const grace = Number(r.graceDays) || 0;
  const late = installments.filter(i => i.outstanding > 0 && isPastCutoff(i.due, grace, now));
  if(!late.length) return 0;
  if(r.mode !== 'perday') return amt;
  let days = 0;
  late.forEach(i => {
    const d = Math.floor((now - new Date(i.due)) / 86400000) - grace;
    if(d > days) days = d;
  });
  let v = amt * Math.max(days, 1);
  const cap = Number(r.cap) || 0;
  if(cap > 0) v = Math.min(v, cap);
  return v;
}
function fpLateExtraFor(studentId, cat){
  return studentExtraFees.find(e => e.kind === 'late' && e.lateKey === studentId + '|' + cat);
}
function fpLateWaived(key){ return fpWaivers.some(w => w.lateKey === key); }

// Builds the list of changes an assessment would make (no writes).
function fpLatePlan(){
  const now = new Date(); const today = localISODate();
  const plan = [];
  students.filter(s => isActive(s)).forEach(s => {
    const { perCat } = computeStudentFinance(s);
    Object.keys(CATS).forEach(c => {
      if(!(perCat[c].expected > 0) || !(perCat[c].receivable > 0)) return;
      const sch = studentCategorySchedule(c, perCat[c], today);
      const amt = fpLateAmount(sch.installments, now);
      if(!(amt > 0)) return;
      const key = s.id + '|' + c;
      if(fpLateWaived(key)) return;
      const ex = fpLateExtraFor(s.id, c);
      if(!ex) plan.push({ student:s, cat:c, key, amount:amt, action:'new' });
      else if(!(Number(ex.paidAmount) > 0) && Math.round(Number(ex.amount)) !== Math.round(amt))
        plan.push({ student:s, cat:c, key, amount:amt, action:'update', ex });
    });
  });
  return plan;
}
async function fpLateAssess(silent){
  await fpEnsure();
  const plan = fpLatePlan();
  if(!plan.length){ if(!silent) showToast('No late fees to assess right now.'); return 0; }
  const today = localISODate();
  plan.forEach(p => {
    if(p.action === 'new'){
      studentExtraFees.push({ id:'sef_late_' + Date.now() + '_' + p.student.id + '_' + p.cat, studentId:p.student.id,
        name:'Late fee – ' + CATS[p.cat], amount:p.amount, paid:false, date:today, kind:'late', lateKey:p.key,
        assessedBy: currentUser ? currentUser.name : '' });
    } else { p.ex.amount = p.amount; p.ex.date = today; }
  });
  await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
  if(!silent){ showToast(`Late fee assessed for ${plan.length} head(s).`, 'burst'); renderFeeBody(); }
  return plan.length;
}
function fpLatePreviewRun(){
  const el = document.getElementById('lfPlan'); if(!el) return;
  const plan = fpLatePlan();
  if(!plan.length){ el.innerHTML = '<p class="ft-preview">Nothing to assess — no unpaid instalment is past its grace period, or all are already assessed.</p>'; return; }
  const total = plan.reduce((s,p) => s + p.amount, 0);
  el.innerHTML = `<p class="ft-preview"><b>${plan.length}</b> late fee(s) totalling <b>${fmtMoney(total)}</b> would be ${'added/updated'}.</p>
    <div class="table-wrap" style="max-height:240px;overflow:auto;"><table><thead><tr><th>Student</th><th>Class</th><th>Head</th><th>Late fee</th><th></th></tr></thead><tbody>
    ${plan.slice(0,200).map(p => `<tr><td>${escapeHtml(p.student.firstName+' '+p.student.lastName)}</td><td>${escapeHtml(p.student.className)}-${escapeHtml(p.student.section)}</td><td>${CATS[p.cat]}</td><td>${fmtMoney(p.amount)}</td><td>${p.action==='new'?'New':'Update'}</td></tr>`).join('')}
    </tbody></table></div>
    ${canSub('managefee_late','managefee','create') ? sfBtn('primary','check','Assess these late fees','fpLateAssess()') : ''}`;
}
async function saveLateFeeSettings(){
  if(!canSub('managefee_late','managefee','edit')){ showToast("You don't have permission to change the late fee rule."); return; }
  lateFeeSettings = {
    dueDate: document.getElementById('lfDueDate').value,
    graceDays: Math.max(0, Number(document.getElementById('lfGrace').value) || 0),
    amount: Math.max(0, Number(document.getElementById('lfAmount').value) || 0),
    mode: document.getElementById('lfMode').value,
    cap: Math.max(0, Number(document.getElementById('lfCap').value) || 0),
    autoAssess: document.getElementById('lfAuto').checked,
  };
  await storageSet(LATE_FEE_SETTINGS_KEY, lateFeeSettings);
  showToast('Late fee rule saved.', 'burst');
  fpLatePreviewRun();
}
async function lateWaive(extraId){
  await fpEnsure();
  const ex = studentExtraFees.find(e => e.id === extraId);
  if(!ex || ex.kind !== 'late') return;
  if(!(currentUser.role === 'Admin' || canSub('managefee_late','managefee','delete'))){ showToast("You don't have permission to waive late fees."); return; }
  if(Number(ex.paidAmount) > 0){ showToast('Part of this late fee is already paid — refund it instead of waiving.'); return; }
  const reason = await showPromptDialog(`Waive late fee of ${fmtMoney(ex.amount)}?\n\nA reason is required and is kept in the waiver log:`, { title:'Waive late fee', okText:'Waive', placeholder:'Reason' });
  if(reason === null) return;
  if(!reason.trim()){ showToast('A reason is required to waive a late fee.'); return; }
  fpWaivers.push({ id:'lw_'+Date.now(), lateKey:ex.lateKey, extraId, studentId:ex.studentId, name:ex.name, amount:ex.amount,
    reason:reason.trim(), by:currentUser.name, date:localISODate() });
  studentExtraFees = studentExtraFees.filter(e => e.id !== extraId);
  await storageSet(FP_WAIVERS_KEY, fpWaivers);
  await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
  showToast('Late fee waived.', 'burst');
  renderFeeBody();
}
async function renderLateFeesTab(body){
  await fpEnsure();
  const canEdit = canSub('managefee_late', 'managefee', 'edit');
  const r = lateFeeSettings;
  const lateExtras = studentExtraFees.filter(e => e.kind === 'late');
  const out = lateExtras.reduce((s,e) => s + Math.max((Number(e.amount)||0) - (Number(e.paidAmount)||0), 0), 0);
  const dis = canEdit ? '' : 'disabled';
  body.innerHTML = `
    <div class="ft-grid">
      <section class="sf-card ft-card">
        ${ftCardHead('Late fee rule', 'Late fees are charged as a real fee on the student, so they appear in the ledger, can be collected and print on the receipt.')}
        <div class="ft-form">
          <label class="ft-field"><span>Calculation</span><select class="input" id="lfMode" ${dis} onchange="ftLatePreview()"><option value="flat" ${r.mode!=='perday'?'selected':''}>Flat amount per fee head</option><option value="perday" ${r.mode==='perday'?'selected':''}>Amount per day late (with cap)</option></select></label>
          <label class="ft-field"><span>Late fee amount (₹${r.mode==='perday'?' per day':''})</span><input type="number" min="0" class="input" id="lfAmount" ${dis} value="${Number(r.amount)||0}" oninput="ftLatePreview()"></label>
          <label class="ft-field"><span>Maximum per head (₹, 0 = no cap)</span><input type="number" min="0" class="input" id="lfCap" ${dis} value="${Number(r.cap)||0}"></label>
          <label class="ft-field"><span>Grace period (days after each instalment due date)</span><input type="number" min="0" class="input" id="lfGrace" ${dis} value="${Number(r.graceDays)||0}" oninput="ftLatePreview()"></label>
          <label class="ft-field"><span>Fallback due date (only when no instalment schedule)</span><input type="date" class="input" id="lfDueDate" ${dis} value="${ftEsc(r.dueDate||'')}" oninput="ftLatePreview()"></label>
          <label class="ft-field" style="flex-direction:row;gap:8px;align-items:center;"><input type="checkbox" id="lfAuto" ${dis} ${r.autoAssess?'checked':''}> <span>Assess automatically once a day</span></label>
        </div>
        <p class="ft-preview" id="lfPreview" aria-live="polite"></p>
        ${canEdit ? sfBtn('primary', 'check', 'Save late fee rule', 'saveLateFeeSettings()') : ''}
      </section>
      <section class="sf-card ft-card">
        ${ftCardHead('Assess late fees', 'Preview what would be charged, then assess. Safe to repeat: existing late fees are never duplicated and waived ones are skipped.')}
        <div id="lfPlan"></div>
        ${sfBtn('secondary','search','Preview late fees','fpLatePreviewRun()')}
        <p class="ft-preview">Assessed so far: <b>${lateExtras.length}</b> · Outstanding <b>${fmtMoney(out)}</b> · Waived <b>${fpWaivers.length}</b></p>
        ${fpWaivers.length ? `<details><summary>Waiver log</summary><div class="table-wrap" style="max-height:200px;overflow:auto;"><table><thead><tr><th>Date</th><th>Student</th><th>Amount</th><th>By</th><th>Reason</th></tr></thead><tbody>${fpWaivers.slice().reverse().slice(0,100).map(w => { const st = students.find(x=>x.id===w.studentId); return `<tr><td>${w.date}</td><td>${st?escapeHtml(st.firstName+' '+st.lastName):'—'}</td><td>${fmtMoney(w.amount)}</td><td>${escapeHtml(w.by)}</td><td>${escapeHtml(w.reason)}</td></tr>`; }).join('')}</tbody></table></div></details>` : ''}
      </section>
      <section class="sf-card ft-card">
        ${ftCardHead('Receipt numbering', 'Switching over from another system? Set where receipt numbers should continue (if your last printed receipt was 001666, enter 1667).')}
        <div class="ft-form">
          <label class="ft-field"><span>Next receipt starts at</span><input type="number" min="1" class="input" id="rsStart" ${dis} value="${Number(receiptSettings.startNumber)||1}"></label>
        </div>
        ${canEdit ? sfBtn('primary', 'check', 'Save receipt numbering', 'saveReceiptSettings()') : ''}
      </section>
    </div>`;
  ftLatePreview();
}
// Rule sentence reflects the new mode.
function ftLatePreview(){
  const el = document.getElementById('lfPreview'); if(!el) return;
  const g = id => (document.getElementById(id)||{}).value;
  const amt = Number(g('lfAmount')) || 0, grace = Number(g('lfGrace')) || 0, mode = g('lfMode');
  if(!(amt > 0)){ el.textContent = 'Set an amount to see how the rule reads.'; return; }
  el.textContent = mode === 'perday'
    ? `Each unpaid instalment more than ${grace} day(s) overdue adds ${fmtMoney(amt)} per day late, up to the cap.`
    : `Fees still unpaid more than ${grace} day(s) after an instalment's due date carry a one-time late fee of ${fmtMoney(amt)} per fee head.`;
}
// Displayed "late fee" on a head is zero once it has been assessed into a real charge (avoids double counting).
const _fpPrevPending = computePendingFeeRows;
computePendingFeeRows = function(s){
  const res = _fpPrevPending(s);
  res.allRows.forEach(r => { if(r.type === 'category' && r.lateFee > 0 && fpLateExtraFor(s.id, r.key)) r.lateFee = 0; });
  return res;
};
// Daily auto-assessment (best effort) when the Manage Fee page renders.
let _fpAutoDay = '';
async function fpAutoLate(){
  try{
    if(!lateFeeSettings || !lateFeeSettings.autoAssess || _fpAutoDay === localISODate()) return;
    if(!currentUser || !(currentUser.role === 'Admin' || canSub('managefee_late','managefee','create'))) return;
    _fpAutoDay = localISODate();
    await fpEnsure();
    await fpLateAssess(true);
  }catch(e){}
}

/* ---------- Opening balance (previous dues) ---------- */
async function openPreviousDuesModal(studentId){
  if(!canSub('managefee_extra','managefee','create')){ showToast("You don't have permission to add dues."); return; }
  const s = students.find(x => x.id === studentId); if(!s) return;
  const v = await showPromptDialog(`Previous dues carried forward for ${s.firstName} ${s.lastName}.\n\nEnter the amount (₹) owed from before this system:`, { title:'Add previous dues', defaultValue:'' });
  if(v === null) return;
  const amt = Math.round(Number(v));
  if(!(amt > 0)){ showToast('Enter a valid amount greater than zero.'); return; }
  studentExtraFees.push({ id:'sef_ob_'+Date.now(), studentId, name:'Previous Dues (opening balance)', amount:amt, paid:false, date:localISODate(), kind:'opening', addedBy:currentUser.name });
  await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
  showToast('Previous dues added.', 'burst'); renderFeeBody();
}

/* ---------- Concession rules ---------- */
// rule: {id,name,trigger:'sibling'|'rte', fromChild (sibling: 2 = 2nd child onward), cat:'fee'|'bus'|..., mode:'percentage'|'amount', value, active}
let _cpPreview = null;
async function cpSaveRules(){ await storageSet(FP_RULES_KEY, fpRules); }
function cpMatches(rule){
  const out = [];
  const act = students.filter(s => isActive(s));
  // skip anyone who already holds a live discount on this fee head (one discount per head)
  const done = new Set(studentDiscounts.filter(d => d.status !== 'Rejected' && d.status !== 'Cancelled' && (d.ruleId === rule.id || d.appliesTo === rule.cat)).map(d => d.studentId));
  if(rule.trigger === 'rte'){
    act.filter(s => s.isRTE && !done.has(s.id)).forEach(s => out.push(s));
  } else {
    const seen = new Set();
    act.forEach(s => {
      const fam = getFamilyIds(s).map(id => students.find(x => x.id === id)).filter(x => x && isActive(x));
      const key = fam.map(x => x.id).sort().join(',');
      if(fam.length < 2 || seen.has(key)) return;
      seen.add(key);
      fam.sort((a,b) => String(a.admissionNo||a.id).localeCompare(String(b.admissionNo||b.id), undefined, {numeric:true}));
      fam.forEach((m, i) => { if(i + 1 >= (Number(rule.fromChild) || 2) && !done.has(m.id)) out.push(m); });
    });
  }
  return out;
}
function cpAmountFor(rule, s){
  if(rule.mode === 'percentage') return Math.round(computeStudentFinance(s).perCat[rule.cat].expected * (Number(rule.value)||0) / 100);
  return Math.round(Number(rule.value) || 0);
}
function cpRuleHtml(r){
  const canE = canSub('managefee_discounts','managefee','edit');
  return `<tr><td><b>${escapeHtml(r.name)}</b></td><td>${r.trigger==='rte'?'RTE students':'Sibling – child '+(r.fromChild||2)+' onward'}</td><td>${CATS[r.cat]||r.cat}</td><td>${r.mode==='percentage'?r.value+'%':fmtMoney(r.value)}</td><td>${r.active?'Active':'Paused'}</td>
  <td class="sf-actions">${canE ? sfBtn('secondary','search','Preview &amp; run',`cpPreview('${r.id}')`)+sfBtn('link','',r.active?'Pause':'Resume',`cpToggle('${r.id}')`)+sfBtn('link','','Delete',`cpDelete('${r.id}')`) : ''}</td></tr>`;
}
async function renderConcessionRules(host){
  await fpEnsure();
  const canE = canSub('managefee_discounts','managefee','edit');
  host.insertAdjacentHTML('beforeend', `<section class="sf-card" id="cpRulesCard" style="margin-top:18px;padding:16px;">
    <h4 style="margin:0 0 4px;">Concession rules</h4>
    <p style="margin:0 0 10px;color:var(--ink-soft);font-size:.85rem;">Define a rule once (sibling, RTE) and apply it to every eligible student in one step. Nothing is applied until you preview and confirm.</p>
    ${fpRules.length ? `<div class="table-wrap"><table><thead><tr><th>Rule</th><th>Applies to</th><th>Fee head</th><th>Concession</th><th>Status</th><th></th></tr></thead><tbody>${fpRules.map(cpRuleHtml).join('')}</tbody></table></div>` : '<p style="color:var(--ink-soft);">No rules yet.</p>'}
    ${canE ? `<div class="ft-form" style="margin-top:12px;">
      <label class="ft-field"><span>Name</span><input class="input" id="cpName" placeholder="e.g. Sibling concession"></label>
      <label class="ft-field"><span>Applies to</span><select class="input" id="cpTrig" onchange="document.getElementById('cpFromWrap').style.display=this.value==='sibling'?'':'none'"><option value="sibling">Siblings</option><option value="rte">RTE students</option></select></label>
      <label class="ft-field" id="cpFromWrap"><span>From which child (2 = second onward)</span><input type="number" min="2" class="input" id="cpFrom" value="2"></label>
      <label class="ft-field"><span>Fee head</span><select class="input" id="cpCat">${Object.keys(CATS).map(c=>`<option value="${c}">${CATS[c]}</option>`).join('')}</select></label>
      <label class="ft-field"><span>Type</span><select class="input" id="cpMode"><option value="percentage">Percentage</option><option value="amount">Fixed amount</option></select></label>
      <label class="ft-field"><span>Value</span><input type="number" min="0" class="input" id="cpVal"></label>
    </div>${sfBtn('primary','check','Add rule','cpAddRule()')}` : ''}
    <div id="cpPrev" style="margin-top:12px;"></div></section>`);
}
async function cpAddRule(){
  const g = id => document.getElementById(id).value;
  const name = g('cpName').trim(), val = Number(g('cpVal'));
  if(!name){ showToast('Give the rule a name.'); return; }
  if(!(val > 0) || (g('cpMode') === 'percentage' && val > 100)){ showToast('Enter a valid value (percentage up to 100).'); return; }
  fpRules.push({ id:'cr_'+Date.now(), name, trigger:g('cpTrig'), fromChild:Number(g('cpFrom'))||2, cat:g('cpCat'), mode:g('cpMode'), value:val, active:true });
  await cpSaveRules(); showToast('Rule added.', 'burst'); renderFeeBody();
}
async function cpToggle(id){ const r = fpRules.find(x => x.id === id); if(r){ r.active = !r.active; await cpSaveRules(); renderFeeBody(); } }
async function cpDelete(id){ if(!await showConfirmDialog('Delete this rule? Concessions already applied stay as they are.')) return; fpRules = fpRules.filter(x => x.id !== id); await cpSaveRules(); renderFeeBody(); }
function cpPreview(id){
  const r = fpRules.find(x => x.id === id); if(!r) return;
  if(!r.active){ showToast('This rule is paused.'); return; }
  const list = cpMatches(r).map(s => ({ s, amt: cpAmountFor(r, s) })).filter(x => x.amt > 0);
  _cpPreview = { rule:r, list };
  const el = document.getElementById('cpPrev');
  if(!list.length){ el.innerHTML = '<p class="ft-preview">No new students are eligible for this rule.</p>'; return; }
  const total = list.reduce((s,x) => s + x.amt, 0);
  const asAdmin = currentUser.role === 'Admin';
  el.innerHTML = `<p class="ft-preview"><b>${escapeHtml(r.name)}</b>: ${list.length} student(s), total concession <b>${fmtMoney(total)}</b>. ${asAdmin?'They will be approved immediately.':'They will be sent for approval.'}</p>
    <div class="table-wrap" style="max-height:240px;overflow:auto;"><table><thead><tr><th>Student</th><th>Class</th><th>Concession</th></tr></thead><tbody>${list.slice(0,200).map(x => `<tr><td>${escapeHtml(x.s.firstName+' '+x.s.lastName)}</td><td>${escapeHtml(x.s.className)}-${escapeHtml(x.s.section)}</td><td>${fmtMoney(x.amt)}</td></tr>`).join('')}</tbody></table></div>
    ${sfBtn('primary','check','Apply to these students','cpRun()')}`;
}
async function cpRun(){
  if(!_cpPreview) return;
  if(!canSub('managefee_discounts','managefee','create')){ showToast("You don't have permission to create discounts."); return; }
  const { rule, list } = _cpPreview; _cpPreview = null;
  const admin = currentUser.role === 'Admin', today = localISODate(), batchId = 'batch_' + Date.now();
  list.forEach(x => {
    studentDiscounts.push({ id:'sdisc_'+Date.now()+'_'+x.s.id+'_'+rule.cat, batchId, studentId:x.s.id,
      type: rule.trigger === 'rte' ? 'RTE Discount' : 'Sibling Discount', appliesTo:rule.cat, mode:'amount', value:x.amt,
      note:'Rule: ' + rule.name, ruleId:rule.id, status: admin ? 'Approved' : 'Pending',
      requestedBy:currentUser.name, requestedRole:currentUser.role, requestedByUserId:currentUser.id, requestedDate:today,
      ...(admin ? { approvedBy:currentUser.name, approvedDate:today } : {}) });
  });
  await storageSet(STUDENT_DISCOUNTS_KEY, studentDiscounts);
  showToast(admin ? `Concession applied to ${list.length} student(s).` : `Sent ${list.length} concession(s) for approval.`, 'burst');
  renderFeeBody();
}
const _fpPrevDisc = renderDiscountsTab;
renderDiscountsTab = async function(body){
  _fpPrevDisc(body);
  if(typeof discView !== 'undefined' && discView === 'create') return;
  await renderConcessionRules(body);
};
const _fpPrevBody = renderFeeBody;
renderFeeBody = async function(){ fpAutoLate(); return _fpPrevBody(); };
