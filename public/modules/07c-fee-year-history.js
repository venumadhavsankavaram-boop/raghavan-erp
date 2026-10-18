/* ============================================================================
   Fee history by academic year
   ----------------------------------------------------------------------------
   Problem this solves: when a student is promoted, the live fee ledger moves to
   the new class and the earlier year's figures (billed / discount / paid /
   balance) were no longer visible anywhere — only a flat list of receipts.

   What this adds
   1. A year-end record (table fee_year_history, API /api/fee-year-history) is
      written automatically every time a student is promoted or graduated,
      from every place promotion can run (Promotion & Transfer, the whole-class
      shortcut, and Admin approval of a teacher's request).
   2. Dues carried forward at promotion are labelled with where they came from
      ("Previous Year Dues — Class 5 (2025-26)") so they are never anonymous.
   3. A "Fee history by year" section on the office fee page and in the
      parent/student portal: one card per year with billed / discount / paid /
      balance, what was carried forward, and the receipts of that year
      (printable), plus a printable all-years statement.
   Students promoted before this feature have no year-end record; their old
   receipts are still grouped by class and year and marked "Earlier record".
   ========================================================================== */
const FEE_YEAR_HISTORY_KEY = 'fee-year-history';
API_BACKED_KEYS[FEE_YEAR_HISTORY_KEY] = '/api/fee-year-history';
let feeYearHistory = [];
let _fyhLoaded = false;

async function fyhEnsure(force){
  if(_fyhLoaded && !force) return;
  try{ feeYearHistory = await storageGet(FEE_YEAR_HISTORY_KEY, []); _fyhLoaded = true; }
  catch(e){ feeYearHistory = feeYearHistory || []; }
}

/* ---------- helpers ---------- */
// Same rule as autoAcademicYear(): the year starts in June.
function fyhAyOfDate(d){
  const m = /^(\d{4})-(\d{2})/.exec(String(d || ''));
  if(!m) return '';
  const y = Number(m[1]), mo = Number(m[2]);
  const start = mo >= 6 ? y : y - 1;
  return start + '-' + String(start + 1).slice(2);
}
function fyhNum(n){ return Math.round(Number(n) || 0); }
/* Class-fee totals only (fee, bus, stock, hostel). computeStudentFinance().totals
   also folds in extra fees (previous dues, late fees, assigned extras); those are
   not tied to a class, stay on the student when they move up, and must NOT be
   copied again into a carried-forward amount. */
function fyhClassTotals(s){
  const f = computeStudentFinance(s);
  const t = { expected: 0, discount: 0, collected: 0, receivable: 0 };
  Object.keys(f.perCat || {}).forEach(c => {
    const x = f.perCat[c] || {};
    t.expected += Number(x.expected) || 0; t.discount += Number(x.discount) || 0;
    t.collected += Number(x.collected) || 0; t.receivable += Number(x.receivable) || 0;
  });
  t.extraUnpaid = Math.max(0, (Number(f.totals.receivable) || 0) - t.receivable);
  return t;
}
function fyhName(s){ return ((s.firstName || '') + ' ' + (s.lastName || '')).trim(); }

/* Builds the list of year groups for one student, newest first. */
function fyhBuild(s){
  const snaps = feeYearHistory.filter(h => h.studentId === s.id)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.academicYear).localeCompare(String(b.academicYear)));
  const mine = payments.filter(p => p.studentId === s.id);
  const used = new Set();
  const groups = [];

  snaps.forEach(h => {
    const list = mine.filter(p => !used.has(p.id) && p.classAtPayment === h.className &&
      (fyhAyOfDate(p.date) === h.academicYear || !snaps.some(o => o !== h && o.className === h.className && o.academicYear === fyhAyOfDate(p.date))));
    list.forEach(p => used.add(p.id));
    groups.push({ kind: 'closed', year: h.academicYear, className: h.className, section: h.section, snap: h, payments: list });
  });

  // Receipts of classes the student has left, from before year-end records existed.
  const legacy = {};
  mine.forEach(p => {
    if(used.has(p.id)) return;
    if(p.classAtPayment && p.classAtPayment !== s.className){
      (legacy[p.classAtPayment] = legacy[p.classAtPayment] || []).push(p); used.add(p.id);
    }
  });
  Object.keys(legacy).forEach(cls => {
    const list = legacy[cls];
    const years = Array.from(new Set(list.map(p => fyhAyOfDate(p.date)).filter(Boolean))).sort();
    groups.push({ kind: 'legacy', year: years.length ? years[years.length - 1] : '', yearsLabel: years.join(', '), className: cls, payments: list });
  });

  const cur = mine.filter(p => !used.has(p.id));
  let live = null;
  try{ live = fyhClassTotals(s); }catch(e){}
  groups.push({ kind: 'current', year: (typeof currentAcademicYearValue !== 'undefined' && currentAcademicYearValue) || '', className: s.className, section: s.section, live, payments: cur });

  const rank = g => g.kind === 'current' ? 2 : 1;
  groups.sort((a, b) => rank(b) - rank(a) || String(b.year).localeCompare(String(a.year)) ||
    String((b.snap && b.snap.date) || '').localeCompare(String((a.snap && a.snap.date) || '')));
  return groups;
}

function fyhGroupFigures(g){
  if(g.kind === 'closed'){
    const h = g.snap;
    return { billed: fyhNum(h.billed), discount: fyhNum(h.discount), paid: fyhNum(h.paid), balance: fyhNum(h.balance) };
  }
  if(g.kind === 'current' && g.live){
    return { billed: fyhNum(g.live.expected), discount: fyhNum(g.live.discount), paid: fyhNum(g.live.collected), balance: fyhNum(g.live.receivable) };
  }
  const paid = g.payments.filter(p => !p.voided).reduce((t, p) => t + (Number(p.amount) || 0), 0);
  return { billed: null, discount: null, paid: fyhNum(paid), balance: null };
}

/* ---------- rendering ---------- */
function fyhCardHTML(g, mode){
  const f = fyhGroupFigures(g);
  const money = v => v === null ? '<span class="fyh-na">—</span>' : fmtMoney(v);
  const year = g.kind === 'legacy' ? (g.yearsLabel || 'Earlier year') : (g.year || 'Current year');
  let badge = '', note = '';
  if(g.kind === 'current'){
    badge = '<span class="fyh-badge fyh-now">Current year</span>';
    const ex = g.live ? fyhNum(g.live.extraUnpaid) : 0;
    if(ex > 0) note += `<div class="fyh-note fyh-carry">Also outstanding: <b>${fmtMoney(ex)}</b> in previous dues and extra fees (${mode === 'portal' ? 'see Pending Fees above' : 'listed above under “Extra Fees Assigned”'}).</div>`;
  }else if(g.kind === 'closed'){
    const h = g.snap;
    badge = h.outcome === 'Graduated'
      ? '<span class="fyh-badge fyh-done">Graduated</span>'
      : `<span class="fyh-badge fyh-done">Promoted to ${escapeHtml(h.movedTo || 'next class')}</span>`;
    const carried = fyhNum(h.carried), bal = fyhNum(h.balance);
    if(carried > 0){
      note += `<div class="fyh-note fyh-carry"><b>${fmtMoney(carried)}</b> carried forward${h.carriedAs ? ' as “' + escapeHtml(h.carriedAs) + '”' : ''} into the next class.</div>`;
    }
    if(bal - carried > 0){
      note += `<div class="fyh-note fyh-warn"><b>${fmtMoney(bal - carried)}</b> was left unpaid and <b>not</b> carried forward.</div>`;
    }
    if(bal === 0){
      note += '<div class="fyh-note fyh-ok">Fully settled at year end.</div>';
    }
  }else{
    badge = '<span class="fyh-badge fyh-old">Earlier record</span>';
    note = '<div class="fyh-note fyh-muted">This student was promoted before year-end records were kept, so only the receipts are available for this class.</div>';
  }
  const canPrint = (typeof canSub === 'function') ? canSub('managefee_collection', 'managefee', 'print') : true;
  const sorted = g.payments.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const rows = sorted.length ? sorted.map(p => `<tr${p.voided ? ' style="opacity:.55"' : ''}>
      <td>${escapeHtml(p.date || '—')}</td><td>${escapeHtml(feeLabelFor(p))}</td><td>${escapeHtml(p.mode || '—')}</td>
      <td>${p.voided ? '<s>' + fmtMoney(p.amount) + '</s>' : fmtMoney(p.amount)}</td>
      <td>${p.voided ? '<span class="fyh-badge fyh-old">' + (p.voidType === 'refund' ? 'Refunded' : 'Voided') + '</span>' : (canPrint && p.id ? `<button type="button" class="fyh-link" onclick="printReceipt('${String(p.id).replace(/'/g, "\\'")}')">Print receipt</button>` : '')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="fyh-na">No receipts in this period.</td></tr>';
  return `<article class="fyh-card${g.kind === 'current' ? ' fyh-card-now' : ''}">
    <header class="fyh-head">
      <div><span class="fyh-year">${escapeHtml(year)}</span><span class="fyh-class">${escapeHtml(g.className || '')}${g.section ? ' · ' + escapeHtml(g.section) : ''}</span></div>${badge}
    </header>
    <div class="fyh-figs">
      <div><span>Fee billed</span><b>${money(f.billed)}</b></div>
      <div><span>Discount</span><b>${f.discount ? fmtMoney(f.discount) : (f.discount === null ? '<span class="fyh-na">—</span>' : '—')}</b></div>
      <div><span>Paid</span><b class="fyh-good">${money(f.paid)}</b></div>
      <div><span>Balance</span><b class="${f.balance > 0 ? 'fyh-bad' : 'fyh-good'}">${money(f.balance)}</b></div>
    </div>
    ${note}
    <details class="fyh-rec"><summary>${sorted.length} receipt${sorted.length === 1 ? '' : 's'}</summary>
      <div class="table-wrap" style="overflow-x:auto"><table><thead><tr><th>Date</th><th>Fee</th><th>Mode</th><th>Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </details>
  </article>`;
}

function fyhSectionHTML(s, mode){
  const groups = fyhBuild(s);
  const past = groups.filter(g => g.kind !== 'current');
  const intro = past.length
    ? 'Every academic year for this student, newest first. Open a year to see its receipts.'
    : 'Earlier years will appear here after the student is promoted. Until then this shows the current year.';
  return `${fyhCss()}
  <section class="fyh">
    <div class="dash-section-title"><div><h3>Fee history by year</h3></div>
      <button type="button" class="fyh-btn" onclick="fyhPrintStatement('${String(s.id).replace(/'/g, "\\'")}')">Print all-years statement</button></div>
    <p class="fyh-intro">${intro}</p>
    <div class="fyh-list">${groups.map(g => fyhCardHTML(g, mode)).join('')}</div>
  </section>`;
}

function fyhCss(){
  if(document.getElementById('fyhCss')) return '';
  return `<style id="fyhCss">
  .fyh{margin:28px 0 8px}
  .fyh-intro{margin:-6px 0 14px;color:var(--ink-soft);font-size:.86rem}
  .fyh-list{display:flex;flex-direction:column;gap:12px;position:relative}
  .fyh-card{background:var(--white,#fff);border:1px solid rgba(20,20,40,.1);border-radius:16px;padding:14px 16px;box-shadow:0 1px 2px rgba(20,20,40,.04)}
  .fyh-card-now{border-color:var(--gold,#c8a24a);box-shadow:0 0 0 3px rgba(200,162,74,.12)}
  .fyh-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
  .fyh-year{font-weight:800;font-size:1.05rem;margin-right:10px}
  .fyh-class{color:var(--ink-soft);font-size:.9rem}
  .fyh-badge{font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(20,20,40,.07);color:var(--ink-soft)}
  .fyh-now{background:rgba(200,162,74,.18);color:#7a5a10}
  .fyh-done{background:rgba(30,140,110,.14);color:#12664f}
  .fyh-figs{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  .fyh-figs div{background:rgba(20,20,40,.035);border-radius:12px;padding:9px 12px}
  .fyh-figs span{display:block;font-size:.72rem;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.04em}
  .fyh-figs b{font-size:1.05rem}
  .fyh-good{color:#12664f}.fyh-bad{color:#b3261e}.fyh-na{color:var(--ink-soft);font-weight:400}
  .fyh-note{margin-top:10px;font-size:.84rem;border-radius:10px;padding:8px 12px}
  .fyh-carry{background:rgba(200,162,74,.14)}.fyh-warn{background:rgba(179,38,30,.1);color:#8c1d18}
  .fyh-ok{background:rgba(30,140,110,.1);color:#12664f}.fyh-muted{background:rgba(20,20,40,.05);color:var(--ink-soft)}
  .fyh-rec{margin-top:10px}.fyh-rec summary{cursor:pointer;font-weight:600;font-size:.86rem;color:var(--ink-soft)}
  .fyh-rec table{margin-top:8px}
  .fyh-link,.fyh-btn{background:none;border:0;color:var(--navy,#1d3b6e);font-weight:700;cursor:pointer;font-size:.84rem;padding:0}
  .fyh-btn{border:1px solid rgba(20,20,40,.18);border-radius:10px;padding:7px 12px;background:var(--white,#fff)}
  @media(max-width:640px){.fyh-figs{grid-template-columns:repeat(2,1fr)}}
  </style>`;
}

/* ---------- mounting (office fee page + parent/student portal) ---------- */
async function fyhMount(body, getStudent, mode){
  const host = document.createElement('div');
  host.className = 'fyh-host';
  host.innerHTML = '<div class="empty-state">Loading fee history…</div>';
  body.appendChild(host);
  try{
    await ensureDataLoaded('payments', loadPaymentsData);
    await fyhEnsure(true);
    const s = getStudent();
    if(!s || !host.isConnected) return;
    host.innerHTML = fyhSectionHTML(s, mode);
  }catch(e){
    if(host.isConnected) host.innerHTML = '';
  }
}
const _fyhOrigLedger = renderStudentLedger;
renderStudentLedger = function(body){
  const r = _fyhOrigLedger.apply(this, arguments);
  if(body && feeView !== 'grid') fyhMount(body, () => students.find(x => x.id === feeCurrentStudentId), 'office');
  return r;
};
const _fyhOrigMyFees = renderMyFeesTab;
renderMyFeesTab = function(body, s){
  const r = _fyhOrigMyFees.apply(this, arguments);
  if(body && s) fyhMount(body, () => s, 'portal');
  return r;
};

/* ---------- write a year-end record at promotion ---------- */
const _fyhOrigPromote = executePromotions;
executePromotions = async function(payloadStudents){
  const recs = [];
  try{
    await ensureDataLoaded('payments', loadPaymentsData);
    await fyhEnsure();
    const year = (typeof currentAcademicYearValue !== 'undefined' && currentAcademicYearValue) || autoAcademicYear();
    const today = (typeof localISODate === 'function') ? localISODate() : new Date().toISOString().slice(0, 10);
    (payloadStudents || []).forEach(p => {
      const s = students.find(x => x.id === p.studentId);
      if(!s) return;
      let t; try{ t = fyhClassTotals(s); }catch(e){ return; }
      // Carry only the class-fee balance; extra fees / earlier carried dues already stay on the student.
      p.carryForwardDue = Math.round(t.receivable);
      const carried = (p.carryForwardType && p.carryForwardDue > 0) ? p.carryForwardDue : 0;
      if(!carried) p.carryForwardType = '';
      recs.push({
        id: 'fyh_' + Date.now() + '_' + String(p.studentId).replace(/[^\w-]/g, ''),
        studentId: s.id, studentName: fyhName(s), academicYear: year, className: s.className, section: s.section || '',
        billed: t.expected, discount: t.discount, paid: t.collected, balance: t.receivable,
        carried, carriedAs: carried ? (CARRYFORWARD_LABELS[p.carryForwardType] || '') : '',
        outcome: p.target === '__graduate__' ? 'Graduated' : 'Promoted', movedTo: p.target === '__graduate__' ? '' : p.target,
        date: today, byUser: (currentUser && currentUser.name) || '',
        _type: p.carryForwardType || ''
      });
    });
  }catch(e){ console.warn('fee year record (before) failed', e); }

  const result = await _fyhOrigPromote.apply(this, arguments);

  try{
    if(recs.length){
      // Name each carried-forward due after the class/year it came from.
      let renamed = false;
      recs.forEach(r => {
        if(!(r.carried > 0)) return;
        const label = CARRYFORWARD_LABELS[r._type];
        for(let i = studentExtraFees.length - 1; i >= 0; i--){
          const e = studentExtraFees[i];
          if(e.studentId === r.studentId && e.name === label && Math.round(Number(e.amount)) === r.carried && !e.kind){
            e.name = label + ' — ' + r.className + ' (' + r.academicYear + ')';
            e.kind = 'carry';
            renamed = true;
            break;
          }
        }
      });
      if(renamed) await storageSet(STUDENT_EXTRA_FEES_KEY, studentExtraFees);
      recs.forEach(r => { delete r._type; feeYearHistory.push(r); });
      await storageSet(FEE_YEAR_HISTORY_KEY, feeYearHistory);
    }
  }catch(e){ console.warn('fee year record (after) failed', e); }
  return result;
};

/* ---------- printable all-years statement ---------- */
async function fyhPrintStatement(studentId){
  await ensureDataLoaded('payments', loadPaymentsData);
  await fyhEnsure(true);
  const s = students.find(x => x.id === studentId) || ((typeof myProfileStudent === 'function') ? myProfileStudent() : null);
  if(!s){ showToast('Student not found.'); return; }
  const groups = fyhBuild(s);
  const school = (typeof schoolInfo !== 'undefined' && schoolInfo && schoolInfo.name) || 'School';
  const m = v => v === null ? '—' : fmtMoney(v);
  const block = g => {
    const f = fyhGroupFigures(g);
    const label = g.kind === 'legacy' ? (g.yearsLabel || 'Earlier year') : (g.year || 'Current year');
    const status = g.kind === 'current' ? 'Current year' : g.kind === 'closed' ? (g.snap.outcome === 'Graduated' ? 'Graduated' : 'Promoted to ' + (g.snap.movedTo || '')) : 'Earlier record';
    const recs = g.payments.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return `<h3>${escapeHtml(label)} — ${escapeHtml(g.className || '')} <small>(${escapeHtml(status)})</small></h3>
      <table><tr><th>Fee billed</th><th>Discount</th><th>Paid</th><th>Balance</th></tr><tr><td>${m(f.billed)}</td><td>${m(f.discount)}</td><td>${m(f.paid)}</td><td>${m(f.balance)}</td></tr></table>
      ${g.kind === 'closed' && Number(g.snap.carried) > 0 ? `<p class="n">${fmtMoney(g.snap.carried)} carried forward into the next class.</p>` : ''}
      <table><tr><th>Date</th><th>Receipt</th><th>Fee</th><th>Mode</th><th>Amount</th></tr>
      ${recs.length ? recs.map(p => `<tr><td>${escapeHtml(p.date || '')}</td><td>${escapeHtml(p.receiptNo || '')}</td><td>${escapeHtml(feeLabelFor(p))}</td><td>${escapeHtml(p.mode || '')}</td><td>${p.voided ? 'Voided' : fmtMoney(p.amount)}</td></tr>`).join('') : '<tr><td colspan="5">No receipts</td></tr>'}</table>`;
  };
  const w = window.open('', '_blank');
  if(!w){ showToast('Allow pop-ups to print the statement.'); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fee statement — ${escapeHtml(fyhName(s))}</title>
    <style>body{font:13px/1.45 Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0}h2{font-size:14px;margin:2px 0 18px;color:#555;font-weight:400}
    h3{font-size:14px;margin:22px 0 6px;border-bottom:2px solid #222;padding-bottom:3px}h3 small{font-weight:400;color:#666}
    table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border:1px solid #bbb;padding:5px 8px;text-align:left}th{background:#f1f1f1}
    .n{margin:4px 0;color:#7a5a10}</style></head><body>
    <h1>${escapeHtml(school)}</h1><h2>Fee statement — ${escapeHtml(fyhName(s))} · ${escapeHtml(s.className || '')} · Admission no. ${escapeHtml(String(s.admissionNo || s.id))} · printed ${escapeHtml(new Date().toISOString().slice(0, 10))}</h2>
    ${groups.map(block).join('')}
    <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}
