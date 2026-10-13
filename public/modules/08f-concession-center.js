/* Concession Center — Manage Fee → Discounts.
   Rebuilds the Discounts screen (overview, filters, per-head breakdown, audit-friendly
   cancel, export) and the "Add discount" form on top of the existing data model
   (studentDiscounts → /api/discounts), so nothing is migrated and every existing
   discount keeps working.

   Rules this screen enforces:
     • One live (Approved or Pending) discount per student per fee head. A head that
       already has one is shown as locked with the amount allowed, and cannot be
       entered again. The server enforces the same rule, so two admins can't clash.
     • Cancelled discounts are kept (not deleted): who cancelled and when stays on file.
     • Saves retry on a dropped connection instead of silently failing. */

(function(){
  if(document.getElementById('ccStyle')) return;
  const st = document.createElement('style'); st.id = 'ccStyle';
  st.textContent = `
  .cc-hero{display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-bottom:18px;}
  .cc-stat{position:relative; overflow:hidden; border-radius:18px; padding:16px 18px; color:#fff; box-shadow:var(--shadow);}
  .cc-stat span{display:block; font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; opacity:.85;}
  .cc-stat b{display:block; font-family:'Baloo 2',cursive; font-size:1.7rem; line-height:1.15; margin-top:4px;}
  .cc-stat small{display:block; opacity:.85; font-size:.76rem; margin-top:2px;}
  .cc-stat::after{content:''; position:absolute; right:-26px; top:-26px; width:92px; height:92px; border-radius:50%; background:rgba(255,255,255,.14);}
  .cc-s1{background:linear-gradient(135deg,#211A4E,#4B3AA8);} .cc-s2{background:linear-gradient(135deg,#188F86,#27B8A8);}
  .cc-s3{background:linear-gradient(135deg,#CB9A2E,#E8B94F);} .cc-s4{background:linear-gradient(135deg,#D11073,#F0489B);}
  .cc-panel{background:var(--white); border:1px solid var(--border); border-radius:18px; box-shadow:var(--shadow); padding:16px 18px; margin-bottom:18px;}
  .cc-panel h4{margin:0 0 10px; font-family:'Baloo 2',cursive; color:var(--navy); font-size:1rem;}
  .cc-split{display:grid; grid-template-columns:1.2fr 1fr; gap:14px; margin-bottom:18px;}
  .cc-split .cc-panel{margin:0;}
  .cc-bar-row{display:grid; grid-template-columns:110px 1fr auto; gap:10px; align-items:center; margin:8px 0; font-size:.84rem;}
  .cc-bar{height:10px; border-radius:99px; background:rgba(33,26,78,.08); overflow:hidden;}
  .cc-bar i{display:block; height:100%; border-radius:99px; background:linear-gradient(90deg,var(--magenta),var(--gold)); transition:width .5s ease;}
  .cc-chips{display:flex; flex-wrap:wrap; gap:8px;}
  .cc-chip{display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:99px; font-size:.78rem; font-weight:600; background:rgba(33,26,78,.07); color:var(--ink);}
  .cc-chip em{font-style:normal; font-weight:500; opacity:.75;}
  .cc-tool{display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:14px;}
  .cc-tool .input.iv-search{flex:1 1 240px; min-width:200px;} .cc-tool select.input{flex:0 0 auto; width:auto; min-width:150px;} .cc-tool .sf-btn{flex:0 0 auto; white-space:nowrap;}
  .cc-seg{display:inline-flex; background:rgba(33,26,78,.07); border-radius:12px; padding:3px; gap:2px;}
  .cc-seg button{border:0; background:transparent; padding:7px 13px; border-radius:9px; font-size:.8rem; font-weight:600; color:var(--ink-soft); cursor:pointer;}
  .cc-seg button.active{background:var(--white); color:var(--navy); box-shadow:0 2px 8px rgba(22,16,51,.14);}
  .cc-list{display:flex; flex-direction:column; gap:10px;}
  .cc-row{display:grid; grid-template-columns:minmax(190px,1.3fr) minmax(120px,.8fr) minmax(220px,1.6fr) auto auto; gap:14px; align-items:center;
    background:var(--white); border:1px solid var(--border); border-left:4px solid var(--gold); border-radius:16px; padding:12px 16px; box-shadow:0 8px 24px -18px rgba(22,16,51,.35); transition:transform .15s ease, box-shadow .15s ease;}
  .cc-row:hover{transform:translateY(-1px); box-shadow:var(--shadow);}
  .cc-row.st-Approved{border-left-color:var(--teal);} .cc-row.st-Pending{border-left-color:var(--gold);}
  .cc-row.st-Rejected, .cc-row.st-Cancelled{border-left-color:var(--magenta); opacity:.72;}
  .cc-who{display:flex; align-items:center; gap:11px; min-width:0;}
  .cc-who b{display:block; color:var(--navy); font-size:.92rem;} .cc-who small{display:block; color:var(--ink-soft); font-size:.74rem;}
  .cc-type{display:inline-block; padding:3px 10px; border-radius:99px; font-size:.72rem; font-weight:700;}
  .cc-t-General{background:rgba(84,76,107,.14); color:#3d3556;} .cc-t-Special{background:rgba(124,58,237,.14); color:#6d28d9;}
  .cc-t-RTE{background:rgba(24,143,134,.16); color:#0f6a63;} .cc-t-Sibling{background:rgba(47,128,237,.14); color:#1c5cbd;}
  .cc-t-Personal{background:rgba(203,154,46,.18); color:#8a6a1f;}
  .cc-note{display:block; color:var(--ink-soft); font-size:.72rem; margin-top:3px;}
  .cc-heads{display:flex; flex-wrap:wrap; gap:6px;}
  .cc-head{padding:4px 10px; border-radius:10px; background:rgba(33,26,78,.06); font-size:.78rem; line-height:1.25;}
  .cc-head b{color:var(--navy);} .cc-head em{display:block; font-style:normal; font-size:.68rem; color:var(--ink-soft);}
  .cc-total{font-family:'Baloo 2',cursive; font-size:1.1rem; color:var(--navy); text-align:right; white-space:nowrap;}
  .cc-status{text-align:right;} .cc-status small{display:block; color:var(--ink-soft); font-size:.68rem; margin-top:3px; max-width:170px; margin-left:auto;}
  .cc-acts{display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap; grid-column:1/-1; padding-top:2px;}
  .cc-empty{text-align:center; padding:36px 10px; color:var(--ink-soft);} .cc-empty b{display:block; color:var(--navy); font-size:1rem; margin-bottom:4px;}
  /* create form */
  .cc-steps{display:flex; flex-direction:column; gap:16px;}
  .cc-step{background:var(--white); border:1px solid var(--border); border-radius:18px; box-shadow:var(--shadow); padding:18px 20px;}
  .cc-step-h{display:flex; align-items:center; gap:12px; margin-bottom:14px;}
  .cc-step-n{width:30px; height:30px; border-radius:50%; display:grid; place-items:center; color:#fff; font-weight:700; background:linear-gradient(135deg,var(--magenta),var(--gold));}
  .cc-step-h h4{margin:0; font-family:'Baloo 2',cursive; color:var(--navy);} .cc-step-h p{margin:0; font-size:.76rem; color:var(--ink-soft);}
  .cc-rule{display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:12px; background:var(--info-bg); color:var(--info-ink); font-size:.8rem; margin-bottom:14px;}
  .cc-sum{position:sticky; bottom:10px; z-index:5; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px;
    margin-top:16px; padding:14px 18px; border-radius:16px; color:#fff; background:linear-gradient(135deg,#211A4E,#4B3AA8); box-shadow:0 18px 40px -18px rgba(22,16,51,.6);}
  .cc-sum b{font-family:'Baloo 2',cursive; font-size:1.3rem;} .cc-sum small{display:block; opacity:.85; font-size:.76rem;}
  .disc-student-panel{border-radius:16px !important;}
  .disc-fee-table td{vertical-align:middle;}
  @media (max-width:900px){
    .cc-hero{grid-template-columns:repeat(2,minmax(0,1fr));} .cc-split{grid-template-columns:1fr;}
    .cc-row{grid-template-columns:1fr 1fr;} .cc-heads{grid-column:1/-1;} .cc-total, .cc-status{text-align:left;} .cc-status small{margin-left:0;}
  }
  [data-theme="dark"] .cc-stat b, [data-theme="dark"] .cc-stat span{color:#fff;}
  `;
  document.head.appendChild(st);
})();

let ccHeadFilter = '', ccTypeFilter = '';
const CC_TYPE_KEY = { 'General Discount':'General', 'Special Discount':'Special', 'RTE Discount':'RTE', 'Sibling Discount':'Sibling', 'Personal Discount':'Personal' };
const CC_STATUS = {
  Approved:  { cls:'paid',    icon:'✓', text:'Approved' },
  Pending:   { cls:'due',     icon:'◐', text:'Pending approval' },
  Rejected:  { cls:'overdue', icon:'✕', text:'Rejected' },
  Cancelled: { cls:'overdue', icon:'⊘', text:'Cancelled' },
};
let _ccFinMemo = new Map();

function ccHeads(){ return Object.keys(CATS).filter(c => c !== 'stock'); }
function ccFin(s){
  if(!s) return null;
  if(!_ccFinMemo.has(s.id)){ let pc = null; try{ pc = computeStudentFinance(s).perCat; }catch(e){} _ccFinMemo.set(s.id, pc); }
  return _ccFinMemo.get(s.id);
}
function ccAmt(d){ return typeof fpDiscountAmount === 'function' ? fpDiscountAmount(d) : (Number(d.value) || 0); }
function ccRowTotal(r){ return r.records.reduce((sum, d) => sum + ccAmt(d), 0); }
function ccBadge(status){
  const m = CC_STATUS[status] || CC_STATUS.Pending;
  return `<span class="sf-badge sf-badge--${m.cls}"><span aria-hidden="true">${m.icon}</span>${m.text}</span>`;
}
function ccToday(){ return typeof localISODate === 'function' ? localISODate() : new Date().toISOString().slice(0,10); }

function ccFiltered(){
  const all = groupedDiscountRows();
  const q = (discSearchQuery || '').trim().toLowerCase();
  const list = all.filter(r => {
    if(discListFilter === 'pending' && r.status !== 'Pending') return false;
    if(discListFilter === 'approved' && r.status !== 'Approved') return false;
    if(discListFilter === 'closed' && r.status !== 'Rejected' && r.status !== 'Cancelled') return false;
    if(ccTypeFilter && r.type !== ccTypeFilter) return false;
    if(ccHeadFilter && !r.records.some(d => d.appliesTo === ccHeadFilter)) return false;
    if(q){
      const s = students.find(x => x.id === r.studentId);
      const hay = s ? ((s.firstName || '') + ' ' + (s.lastName || '') + ' ' + (s.admissionNo || '') + ' ' + (s.fatherName || '')).toLowerCase() : '';
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  return { all, list };
}

function ccRowHtml(r){
  const s = students.find(x => x.id === r.studentId);
  const pc = ccFin(s);
  const first = r.records[0] || {};
  const heads = ccHeads().map(c => {
    const rec = r.records.find(x => x.appliesTo === c);
    if(!rec) return '';
    const amt = ccAmt(rec), exp = pc && pc[c] ? pc[c].expected : 0;
    const pct = exp > 0 ? Math.round(amt / exp * 1000) / 10 : null;
    return `<span class="cc-head"><b>${ftEsc(CATS[c])}</b> ${fmtMoney(amt)}<em>${pct !== null ? pct + '% of ' + fmtMoney(exp) : ''}</em></span>`;
  }).join('');
  const canDelete = canSub('managefee_discounts', 'managefee', 'delete');
  const adminPending = currentUser.role === 'Admin' && r.status === 'Pending';
  const live = r.status === 'Approved' || r.status === 'Pending';
  const trail = r.status === 'Cancelled'
    ? 'Cancelled by ' + ftEsc(first.cancelledBy || '—') + (first.cancelledDate ? ' on ' + ftEsc(first.cancelledDate) : '')
    : 'By ' + ftEsc(r.requestedBy || '—') + (first.requestedDate ? ' · ' + ftEsc(first.requestedDate) : '') + (r.approvedBy ? ' · approved by ' + ftEsc(r.approvedBy) : '');
  const tk = CC_TYPE_KEY[r.type] || 'General';
  return `<div class="cc-row st-${ftEsc(r.status)}">
    <div class="cc-who">${s ? sfAvatar(s) : '<span class="sf-avatar" aria-hidden="true">?</span>'}
      <span><b>${s ? ftEsc(s.firstName + ' ' + s.lastName) : 'Unknown student'}</b>
      <small>${s ? ftEsc(s.className) + ' · Sec ' + ftEsc(s.section) + ' · ' + ftEsc(s.admissionNo || '') : ''}</small></span></div>
    <div><span class="cc-type cc-t-${tk}">${ftEsc(r.type || 'Discount')}</span>${r.note ? `<span class="cc-note">${ftEsc(r.note)}</span>` : ''}</div>
    <div class="cc-heads">${heads || '—'}</div>
    <div class="cc-total">${fmtMoney(ccRowTotal(r))}</div>
    <div class="cc-status">${ccBadge(r.status)}<small>${trail}</small></div>
    ${(adminPending || (canDelete && live)) ? `<div class="cc-acts">
      ${adminPending ? sfBtn('link', 'check', 'Approve', `approveDiscountGroup('${r.batchId}','${r.studentId}')`) + sfBtn('danger', '', 'Reject', `rejectDiscountGroup('${r.batchId}','${r.studentId}')`) : ''}
      ${canDelete && live ? sfBtn('danger', '', 'Cancel discount', `deleteDiscountGroup('${r.batchId}','${r.studentId}')`) : ''}
    </div>` : ''}
  </div>`;
}

function ccPaintRows(){
  const host = document.getElementById('ccList'); if(!host) return;
  _ccFinMemo = new Map();
  const { all, list } = ccFiltered();
  host.innerHTML = list.length ? list.map(ccRowHtml).join('')
    : `<div class="cc-empty"><b>No discounts found</b>${all.length ? 'Try clearing the search or filters.' : 'Created discounts will appear here.'}</div>`;
  const c = document.getElementById('ftDiscCount'); if(c) c.textContent = list.length + ' of ' + all.length + ' shown';
  document.querySelectorAll('#ftDiscSeg button').forEach(b => b.classList.toggle('active', b.dataset.f === discListFilter));
}
paintFtDisc = ccPaintRows;
function onDiscHeadFilter(v){ ccHeadFilter = v; ccPaintRows(); }
function onDiscTypeFilter(v){ ccTypeFilter = v; ccPaintRows(); }

function ccExport(){
  if(typeof exportRowsToExcel !== 'function'){ showToast('Export is not available.'); return; }
  const rows = [];
  ccFiltered().list.forEach(r => {
    const s = students.find(x => x.id === r.studentId) || {};
    r.records.forEach(d => rows.push({
      'Student': ((s.firstName || '') + ' ' + (s.lastName || '')).trim(), 'Admission No': s.admissionNo || '', 'Class': s.className || '', 'Section': s.section || '',
      'Type': d.type || '', 'Fee Head': CATS[d.appliesTo] || d.appliesTo, 'Amount': ccAmt(d), 'Status': d.status || '',
      'Requested By': d.requestedBy || '', 'Requested On': d.requestedDate || '', 'Approved By': d.approvedBy || '', 'Approved On': d.approvedDate || '',
      'Cancelled By': d.cancelledBy || '', 'Cancelled On': d.cancelledDate || '', 'Remark': d.note || '',
    }));
  });
  exportRowsToExcel('discounts.xlsx', 'Discounts', rows);
}

renderDiscListView = function(body){
  _ccFinMemo = new Map();
  const rows = groupedDiscountRows();
  const approved = rows.filter(r => r.status === 'Approved');
  const pending = rows.filter(r => r.status === 'Pending');
  const granted = approved.reduce((sum, r) => sum + ccRowTotal(r), 0);
  const benefiting = new Set(approved.map(r => r.studentId)).size;
  let billed = 0;
  try{ students.filter(s => isActive(s)).forEach(s => { const pc = ccFin(s); if(pc) ccHeads().forEach(c => { billed += (pc[c] && pc[c].expected) || 0; }); }); }catch(e){}
  const pctBilled = billed > 0 ? (Math.round(granted / billed * 1000) / 10) + '% of total billed' : 'Approved concessions';
  const perHead = ccHeads().map(c => {
    const recs = approved.flatMap(r => r.records.filter(d => d.appliesTo === c));
    return { c, amt: recs.reduce((sum, d) => sum + ccAmt(d), 0), n: new Set(recs.map(d => d.studentId)).size };
  });
  const maxHead = Math.max(1, ...perHead.map(h => h.amt));
  const perType = {};
  approved.forEach(r => { const k = r.type || 'Discount'; perType[k] = perType[k] || { n: 0, amt: 0 }; perType[k].n++; perType[k].amt += ccRowTotal(r); });
  const canCreate = canSub('managefee_discounts', 'managefee', 'create');
  const canDeleteType = canSub('managefee_discounts', 'managefee', 'delete');
  body.innerHTML = `
    <div class="cc-hero">
      <div class="cc-stat cc-s1"><span>Concession granted</span><b>${fmtMoney(granted)}</b><small>${pctBilled}</small></div>
      <div class="cc-stat cc-s2"><span>Students benefiting</span><b>${benefiting}</b><small>${benefiting ? 'Avg ' + fmtMoney(Math.round(granted / benefiting)) + ' each' : 'No approved discounts yet'}</small></div>
      <div class="cc-stat cc-s3"><span>Awaiting approval</span><b>${pending.length}</b><small>${pending.length ? 'Needs an Admin decision' : 'All caught up'}</small></div>
      <div class="cc-stat cc-s4"><span>Discount records</span><b>${rows.length}</b><small>${rows.length - approved.length - pending.length} cancelled / rejected</small></div>
    </div>
    <div class="cc-split">
      <div class="cc-panel"><h4>By fee head</h4>
        ${perHead.map(h => `<div class="cc-bar-row"><span>${ftEsc(CATS[h.c])}</span><div class="cc-bar"><i style="width:${Math.round(h.amt / maxHead * 100)}%"></i></div><b>${fmtMoney(h.amt)} <small style="font-weight:500;color:var(--ink-soft);">· ${h.n} student${h.n === 1 ? '' : 's'}</small></b></div>`).join('')}
      </div>
      <div class="cc-panel"><h4>By discount type</h4>
        <div class="cc-chips">${Object.keys(perType).map(k => `<span class="cc-chip cc-type cc-t-${CC_TYPE_KEY[k] || 'General'}">${ftEsc(k)} <em>${perType[k].n} · ${fmtMoney(perType[k].amt)}</em></span>`).join('') || '<span style="color:var(--ink-soft);font-size:.82rem;">Nothing granted yet.</span>'}</div>
        <p style="margin:12px 0 0;font-size:.76rem;color:var(--ink-soft);">Each student can hold one discount per fee head. A head that already has one is locked on the Add form.</p>
      </div>
    </div>
    <div class="cc-tool">
      <input class="input iv-search" id="discListSearch" type="search" placeholder="Search name, admission no or parent…" value="${ftEsc(discSearchQuery)}" oninput="onDiscListSearch(this.value)" autocomplete="off" style="flex:1 1 220px;">
      <div class="cc-seg" id="ftDiscSeg">
        <button type="button" data-f="all" onclick="setDiscListFilter('all')">All</button>
        <button type="button" data-f="pending" onclick="setDiscListFilter('pending')">Pending${pending.length ? ' (' + pending.length + ')' : ''}</button>
        <button type="button" data-f="approved" onclick="setDiscListFilter('approved')">Approved</button>
        <button type="button" data-f="closed" onclick="setDiscListFilter('closed')">Cancelled</button>
      </div>
      <select class="input" onchange="onDiscHeadFilter(this.value)" aria-label="Filter by fee head"><option value="">All fee heads</option>${ccHeads().map(c => `<option value="${c}" ${ccHeadFilter === c ? 'selected' : ''}>${ftEsc(CATS[c])}</option>`).join('')}</select>
      <select class="input" onchange="onDiscTypeFilter(this.value)" aria-label="Filter by type"><option value="">All types</option>${DISCOUNT_TYPE_OPTIONS.map(t => `<option ${ccTypeFilter === t ? 'selected' : ''}>${ftEsc(t)}</option>`).join('')}</select>
      <span class="iv-count" id="ftDiscCount"></span>
      ${sfBtn('soft', '', 'Export Excel', 'ccExport()')}
      ${canCreate ? sfBtn('primary', 'plus', 'Create student discount', 'openDiscCreateForm()') : ''}
    </div>
    <div class="cc-list" id="ccList"></div>

    <section class="sf-card ft-card" style="margin-top:22px;">
      ${ftCardHead('Discount catalog', 'A quick-reference list staff can glance at when recording a one-off payment discount by hand. Not tied to approval.')}
      ${canCreate ? `<div class="ft-add">
        <input class="input" id="newDiscName" placeholder="e.g. Merit Scholarship" maxlength="60">
        <input class="input" id="newDiscAmount" type="number" min="0" placeholder="Amount (₹)">
        ${sfBtn('soft', 'plus', 'Add', 'addDiscountType()')}
      </div>` : ''}
      <div class="ft-chips">
        ${discountTypes.map((d, i) => `<span class="ft-chip"><b>${ftEsc(d.name)}</b><em>${fmtMoney(d.amount)}</em>${canDeleteType ? `<button type="button" class="ft-chip-x" title="Remove ${ftEsc(d.name)}" aria-label="Remove ${ftEsc(d.name)}" onclick="removeDiscountType(${i})">×</button>` : ''}</span>`).join('')
          || `<div class="ft-empty"><b>No entries yet</b></div>`}
      </div>
    </section>`;
  ccPaintRows();
};

/* Cancel (soft-delete): the record stays, with who cancelled and when. */
deleteDiscountGroup = async function(batchId, studentId){
  const rows = studentDiscounts.filter(d => (d.batchId || d.id) === batchId && d.studentId === studentId);
  if(!rows.length) return;
  const s = students.find(x => x.id === studentId);
  const wasApproved = rows[0].status === 'Approved';
  const ok = await showConfirmDialog(
    'Cancel this discount' + (s ? ' for ' + s.firstName + ' ' + s.lastName : '') + '?' +
    (wasApproved ? ' The fee goes back to the full amount. ' : ' ') + 'The record stays in the list as Cancelled, and the fee head becomes free for a new discount.',
    { title: 'Cancel discount', okText: 'Cancel discount', cancelText: 'Keep it' });
  if(!ok) return;
  const before = rows.map(d => ({ d, status: d.status, cancelledBy: d.cancelledBy, cancelledDate: d.cancelledDate }));
  rows.forEach(d => { d.status = 'Cancelled'; d.cancelledBy = currentUser.name; d.cancelledDate = ccToday(); });
  const saved = await saveKeySafely(STUDENT_DISCOUNTS_KEY, studentDiscounts, 'The cancellation');
  if(!saved){ before.forEach(b => { b.d.status = b.status; b.d.cancelledBy = b.cancelledBy; b.d.cancelledDate = b.cancelledDate; }); showToast('Cancellation was NOT saved — the discount is unchanged.'); renderDiscountsTab(document.getElementById('feeBody')); return; }
  try{ renderDashboard(); }catch(e){}
  renderDiscountsTab(document.getElementById('feeBody'));
  showToast('Discount cancelled.', 'burst');
};

/* ---------- Add-discount form ---------- */
function ccUpdateSummary(){
  const box = document.getElementById('ccSummary'); if(!box) return;
  const inputs = Array.from(document.querySelectorAll('.disc-amt-input'));
  const used = inputs.filter(i => (Number(i.value) || 0) > 0);
  const total = used.reduce((sum, i) => sum + (Number(i.value) || 0), 0);
  const studentsN = new Set(used.map(i => i.dataset.student)).size;
  const locked = document.querySelectorAll('.disc-row-locked').length;
  const selected = typeof discSelectedStudents !== 'undefined' ? discSelectedStudents.length : 0;
  box.querySelector('[data-k="main"]').innerHTML = total > 0
    ? '<b>' + fmtMoney(total) + '</b><small>' + used.length + ' fee head' + (used.length === 1 ? '' : 's') + ' · ' + studentsN + ' student' + (studentsN === 1 ? '' : 's') + '</small>'
    : '<b>Nothing to apply yet</b><small>' + (selected ? (locked ? locked + ' fee head' + (locked === 1 ? ' already has' : 's already have') + ' a discount (locked). Enter an amount on an open head.' : 'Enter an amount against a fee head below.') : 'Select a student to begin.') + '</small>';
  const btn = document.getElementById('ccCreateBtn'); if(btn) btn.disabled = total <= 0;
}
{
  const _a = onDiscAmtInput; onDiscAmtInput = function(el){ _a(el); ccUpdateSummary(); };
  const _p = onDiscPctInput; onDiscPctInput = function(el){ _p(el); ccUpdateSummary(); };
  const _r = renderDiscStudentFeePanels; renderDiscStudentFeePanels = function(){ _r(); ccUpdateSummary(); };
}

renderDiscCreateForm = function(body){
  const admin = currentUser.role === 'Admin';
  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:14px; margin-bottom:18px;">
      <button class="btn btn-ghost btn-sm" onclick="backToDiscList()">← Back</button>
      <h3 style="margin:0; font-family:'Baloo 2',cursive; color:var(--navy);">Add student discount</h3>
    </div>
    <div class="cc-steps">
      <section class="cc-step">
        <div class="cc-step-h"><span class="cc-step-n">1</span><div><h4>Choose students</h4><p>Search by name, or pick a class and section.</p></div></div>
        <div class="form-grid">
          <div class="f-field full">
            <label>Search student</label>
            <div class="search-wrap" style="max-width:none;">
              <input class="input" id="discCreateSearch" placeholder="Search all students by name..." style="width:100%;" autocomplete="off" oninput="onDiscCreateSearchInput()" onblur="setTimeout(hideDiscCreateSuggestions,150)" onfocus="onDiscCreateSearchInput()">
              <div class="search-suggestions" id="discCreateSuggestions"></div>
            </div>
          </div>
          <div class="f-field"><label>Class</label>
            <select id="discCreateClassSel" onchange="onDiscCreateClassChange(this.value)"><option value="">Select Class</option>
              ${CLASS_LEVELS.map(c => `<option value="${c}" ${discCreateClass === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
          <div class="f-field"><label>Section</label>
            <select id="discCreateSectionSel" onchange="onDiscCreateSectionChange(this.value)"><option value="">Select Section</option>
              ${SECTIONS.map(s => `<option value="${s}" ${discCreateSection === s ? 'selected' : ''}>Section ${s}</option>`).join('')}</select></div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Selected student(s) <span class="required-star">*</span></label>
        <div id="discSelectedStudentsBox"></div>
      </section>

      <section class="cc-step">
        <div class="cc-step-h"><span class="cc-step-n">2</span><div><h4>Type &amp; reason</h4><p>Why this discount is being given.</p></div></div>
        <div class="form-grid">
          <div class="f-field"><label>Discount type <span class="required-star">*</span></label>
            <select id="discCreateType" onchange="onDiscTypeChange()">${DISCOUNT_TYPE_OPTIONS.map(t => `<option>${t}</option>`).join('')}</select></div>
          <div class="f-field full"><label>Remark <span id="discRemarkStar" style="color:var(--magenta); display:none;">*</span></label>
            <input type="text" id="discCreateNote" placeholder="Enter any remarks...">
            <div id="discRemarkHint" style="display:none; color:var(--gold); font-size:0.76rem; margin-top:4px;">* Remark is mandatory for General Discount</div></div>
        </div>
      </section>

      <section class="cc-step">
        <div class="cc-step-h"><span class="cc-step-n">3</span><div><h4>Set the discount per fee head</h4><p>Type an amount or a percentage — the other fills in.</p></div></div>
        <div class="cc-rule"><span aria-hidden="true">ℹ️</span><span>A student can have <b>one discount per fee head</b>. Heads that already have a discount show the amount allowed and are locked. To change one, cancel it from the Discounts list first.</span></div>
        <div id="discStudentFeePanels"></div>
      </section>
    </div>

    ${admin ? `<p style="font-size:0.78rem; color:var(--ink-soft); margin:14px 0 0;">You're recording this as Admin, so it's approved immediately — no separate sign-off needed.</p>` : `
    <section class="cc-step" style="margin-top:16px;">
      <div class="form-grid"><div class="f-field full"><label>Select approver <span class="required-star">*</span></label>
        <select id="discCreateApprover" required><option value="" disabled selected>Select an approver</option>
          ${users.filter(u => (u.role === 'Admin' || u.role === 'Principal') && u.id !== currentUser.id).map(u => `<option value="${u.id}">${u.name} (${u.role})</option>`).join('')}</select></div></div>
      <p style="font-size:0.78rem; color:var(--ink-soft); margin:10px 0 0;">This request needs the selected approver's sign-off before it reduces the fee.</p>
    </section>`}

    <div class="cc-sum" id="ccSummary">
      <div data-k="main"></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-ghost" style="background:rgba(255,255,255,.14); color:#fff; border-color:transparent;" onclick="backToDiscList()">Cancel</button>
        <button class="btn btn-primary" id="ccCreateBtn" onclick="submitDiscCreate()">${admin ? 'Create &amp; approve' : 'Send for approval'}</button>
      </div>
    </div>`;
  renderDiscSelectedStudentsBox();
  renderDiscStudentFeePanels();
};
