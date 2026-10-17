/* ============================================================================
   Accounting → Voucher Register (Admin only)

   One screen that answers "is every voucher / receipt number accounted for?"
     • lists every Payment Voucher, Receipt Voucher and Fee Receipt of a period,
       newest number first (or oldest first),
     • shows numbers that were issued but never saved as red "Missing" rows,
       with who the number was issued to and when (from now on),
     • lets the Admin record the reason for each gap (the audit note),
     • exports the register to Excel / PDF.

   The server (/api/voucher-gaps) is the authority on which numbers are missing;
   the rows for saved documents come from the data this page already loaded.

   Also here: acctSaveVoucherSafely() — used by the Income / Expense voucher
   Save buttons so a dropped connection can no longer leave a voucher that looks
   saved on screen but never reached the server.
   ========================================================================== */

/* ---------- safe save (retry instead of silently losing a voucher) ---------- */
// `key` is the storage key, `arr` the live array that already contains `rec`.
// Returns true when the server has the voucher; false when the Admin chose to
// stop (the unsaved voucher is then removed from the screen, and its number is
// listed under Missing in the Voucher Register).
async function acctSaveVoucherSafely(key, arr, rec){
  let ok = await storageSet(key, arr);
  while(ok === false){
    const retry = await showConfirmDialog(
      'Voucher ' + rec.voucherNo + ' could NOT be saved to the server — most likely the internet connection dropped. ' +
      'It is not stored yet. Check the connection, then press "Retry save". (If you stop, nothing is saved — the number is kept aside and will be given to your next voucher, so no number is lost.)',
      { title: 'Voucher not saved', okText: 'Retry save', cancelText: 'Stop — do not save' });
    if(!retry){
      const ix = arr.indexOf(rec);
      if(ix >= 0) arr.splice(ix, 1);
      showToast('Voucher ' + rec.voucherNo + ' was NOT saved. Please enter it again.');
      return false;
    }
    ok = await storageSet(key, arr);
  }
  return true;
}

// Same idea for anything else that must not be lost silently (fee receipts,
// refund postings, extra-fee balances): keep asking until the server has it.
// Returns true when saved, false when the person chose to stop.
async function saveKeySafely(key, arr, what){
  let ok = await storageSet(key, arr);
  while(ok === false){
    const retry = await showConfirmDialog(
      (what || 'This entry') + ' could NOT be saved to the server — most likely the internet connection dropped. ' +
      'Check the connection, then press "Retry save".',
      { title: 'Not saved yet', okText: 'Retry save', cancelText: 'Stop — do not save' });
    if(!retry) return false;
    ok = await storageSet(key, arr);
  }
  return true;
}
// Fee receipts: if the person stops, the unsaved receipts are removed and the
// page reloads from the server so nothing half-recorded stays on screen. The
// receipt numbers used stay listed as Missing in the Voucher Register.
async function saveReceiptsSafely(recs, what){
  const ok = await saveKeySafely(PAYMENTS_KEY, payments, what);
  if(ok) return true;
  (recs || []).forEach(r => { const ix = payments.indexOf(r); if(ix >= 0) payments.splice(ix, 1); });
  showToast('Receipt was NOT saved. Reloading the latest data — please enter it again.');
  setTimeout(() => { try{ location.reload(); }catch(e){} }, 1800);
  return false;
}
// Used when the person stops part-way through a multi-step posting.
function warnPartialAndReload(msg){
  showToast(msg);
  setTimeout(() => { try{ location.reload(); }catch(e){} }, 2500);
}

/* ---------- register ---------- */
const vrState = { series:'payment_voucher', period:'', order:'desc', view:'all', search:'' };
const VR_SERIES = [
  ['payment_voucher', 'Payment Vouchers'],
  ['income_voucher',  'Receipt Vouchers'],
  ['fee_receipt',     'Fee Receipts'],
];
let vrServer = null;   // last /api/voucher-gaps response

function vrSeq(no, prefix){
  const m = /(\d+)$/.exec(String(no || ''));
  return m ? parseInt(m[1], 10) : 0;
}
function vrWhen(v){
  if(!v) return '';
  const raw = String(v);
  const dt = new Date(raw.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? '' : 'Z'));
  return isNaN(dt) ? '' : dt.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function vrPeriodLabel(series, p){
  if(!p) return '—';
  return series === 'fee_receipt' ? p : 'FY 20' + p.slice(0, 2) + '–' + p.slice(3);
}

// Saved documents of the chosen period, from the data already in the browser.
function vrSavedRows(series, period){
  const out = new Map();   // seq -> row
  if(series === 'fee_receipt'){
    const groups = new Map();
    (typeof payments !== 'undefined' ? payments : []).forEach(p => {
      const no = String(p.receiptNo || '');
      if(!no || !no.startsWith(period) || !/^\d+$/.test(no.slice(period.length))) return;
      if(!groups.has(no)) groups.set(no, []);
      groups.get(no).push(p);
    });
    groups.forEach((recs, no) => {
      const seq = vrSeq(no);
      const first = recs[0];
      const voided = recs.every(r => r.voided);
      out.set(seq, {
        seq, number: no, date: first.date || '', who: first.studentName || '',
        detail: recs.map(r => (typeof feeLabelFor === 'function' ? feeLabelFor(r) : (r.category || ''))).join(', '),
        mode: first.mode || '', amount: recs.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        by: first.collectedBy || '', voided,
        voidNote: voided ? (first.voidType === 'bounce' ? 'Bounced' : first.voidType === 'refund' ? 'Refunded' : 'Voided') : '',
      });
    });
  }else{
    const list = series === 'income_voucher' ? acctIncome : acctExpenses;
    const prefix = series === 'income_voucher' ? 'RV' : 'PV';
    const start = prefix + '/' + period + '/';
    list.forEach(v => {
      const no = String(v.voucherNo || '');
      if(!no.startsWith(start)) return;
      const seq = vrSeq(no);
      out.set(seq, {
        seq, number: no, date: v.date || '', who: v.party || '', detail: v.category || '', mode: v.mode || '',
        amount: Number(v.amount) || 0, by: v.addedBy || '', voided: !!v.voided, voidNote: v.voided ? 'Voided' : '',
      });
    });
  }
  return out;
}

function vrBuildRows(){
  const d = vrServer;
  const saved = vrSavedRows(vrState.series, d.period);
  const missingBySeq = new Map(d.missing.map(m => [m.seq, m]));
  const rows = [];
  const top = Math.max(d.issuedUpTo, ...Array.from(saved.keys()), 0);
  for(let n = (d.from || 1); n <= top; n++){
    if(saved.has(n)) rows.push({ type:'saved', ...saved.get(n) });
    else if(missingBySeq.has(n)) rows.push({ type:'missing', seq:n, number:missingBySeq.get(n).docNumber, gap:missingBySeq.get(n) });
    // else: stored on the server after this page loaded — shows up after Refresh.
  }
  rows.sort((a, b) => vrState.order === 'desc' ? b.seq - a.seq : a.seq - b.seq);
  return rows;
}

function vrFiltered(){
  const q = vrState.search.trim().toLowerCase();
  return vrBuildRows().filter(r => {
    if(vrState.view === 'missing' && r.type !== 'missing') return false;
    if(vrState.view === 'saved' && r.type !== 'saved') return false;
    if(!q) return true;
    const hay = r.type === 'missing'
      ? [r.number, r.gap.issuedTo, r.gap.note && r.gap.note.reason].join(' ')
      : [r.number, r.who, r.detail, r.mode, r.by, r.date].join(' ');
    return hay.toLowerCase().includes(q);
  });
}

async function renderAcctVoucherRegisterTab(body){
  if(!currentUser || currentUser.role !== 'Admin'){
    body.innerHTML = '<div class="empty-state"><b>Only the Admin can open the Voucher Register.</b></div>';
    return;
  }
  body.innerHTML = '<div class="acx-note">Loading the register…</div>';
  try{
    const q = '?series=' + vrState.series + (vrState.period ? '&period=' + encodeURIComponent(vrState.period) : '');
    const res = await fetch('/api/voucher-gaps' + q, { headers: { ...actorHeaders() } });
    await throwIfNotOk(res);
    vrServer = await res.json();
    vrState.period = vrServer.period;
  }catch(e){
    body.innerHTML = '<div class="empty-state"><b>Could not load the register.</b><span>' + escapeHtml(e.message || 'Check the connection and try again.') + '</span></div>';
    return;
  }
  vrPaint(body);
}

function vrPaint(body){
  body = body || document.getElementById('accountingBody');
  if(!body || !vrServer) return;
  const d = vrServer;
  const seriesBtns = VR_SERIES.map(([k, l]) => `<button type="button" class="sf-btn ${vrState.series === k ? 'sf-btn--primary' : 'sf-btn--soft'}" onclick="vrSetSeries('${k}')">${l}</button>`).join('');
  const periodOpts = d.periods.map(p => `<option value="${escapeHtml(p)}" ${p === d.period ? 'selected' : ''}>${escapeHtml(vrPeriodLabel(vrState.series, p))}</option>`).join('');
  body.innerHTML = `
    <div class="acx-panel-head" style="margin-bottom:10px"><h4 style="margin:0">Voucher Register</h4>
      <p style="margin:4px 0 0">Every number the system has issued, newest first. A number is issued the moment Save is pressed; if the voucher was never stored (connection dropped, page closed) it appears here as <b>Missing</b> so it can be accounted for. Numbers are never re-used and no voucher is changed from this screen.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${seriesBtns}</div>
    <section class="sf-kpis">
      ${sfKpi('Numbers issued', d.issuedUpTo - (d.from || 1) + 1, 'plain', vrPeriodLabel(vrState.series, d.period))}
      ${sfKpi('Saved', d.savedCount, 'good', 'have a ' + (d.kind === 'receipt' ? 'receipt' : 'voucher'))}
      ${sfKpi('Missing', d.missingCount, d.missingCount ? 'danger' : 'plain', d.missingCount ? 'issued, never saved' : 'none')}
      ${sfKpi('Not yet explained', d.unexplainedCount, d.unexplainedCount ? 'danger' : 'plain', d.unexplainedCount ? 'add a reason below' : 'all noted')}
    </section>
    <div class="iv-toolbar">
      <select class="input" aria-label="Period" style="min-width:150px" onchange="vrSetPeriod(this.value)">${periodOpts || '<option>—</option>'}</select>
      <input class="input iv-search" style="min-width:240px" type="search" placeholder="Search number, name, category…" value="${escapeHtml(vrState.search)}" oninput="vrSetSearch(this.value)">
      <div class="sf-segments" role="group" aria-label="Show">
        ${[['all','All'],['missing','Missing only'],['saved','Saved only']].map(([v, l]) => `<button type="button" class="${vrState.view === v ? 'active' : ''}" onclick="vrSetView('${v}')">${l}</button>`).join('')}
      </div>
      <select class="input" aria-label="Order" style="min-width:200px" onchange="vrSetOrder(this.value)">
        <option value="desc" ${vrState.order === 'desc' ? 'selected' : ''}>Newest number first ↓</option>
        <option value="asc" ${vrState.order === 'asc' ? 'selected' : ''}>Oldest number first ↑</option>
      </select>
      <div class="iv-toolbar-actions">${sfBtn('soft', 'down', 'Excel', 'vrExport(false)')}${sfBtn('soft', 'down', 'PDF', 'vrExport(true)')}</div>
    </div>
    <section class="sf-card">
      <div class="acx-tablehead"><b>${escapeHtml(d.label)} — ${escapeHtml(vrPeriodLabel(vrState.series, d.period))}</b><span id="vrCount"></span></div>
      <div class="table-wrap"><table class="iv-table">
        <thead><tr><th>Number</th><th>Date</th><th>${vrState.series === 'fee_receipt' ? 'Student' : (vrState.series === 'income_voucher' ? 'Received from' : 'Paid to')}</th><th>${vrState.series === 'fee_receipt' ? 'Fee heads' : 'Category'}</th><th>Mode</th><th class="acx-r">Amount</th><th>Entered by / status</th></tr></thead>
        <tbody id="vrRows"></tbody>
      </table></div>
    </section>
    <p class="acx-note">Saved rows come from the data loaded in this browser — use <b>Refresh</b> (top of Accounting) to pull in entries made a moment ago by other users. “Issued to” and the time are recorded for numbers issued from the day this register was introduced.</p>`;
  vrPaintRows();
}

function vrPaintRows(){
  const tb = document.getElementById('vrRows');
  if(!tb) return;
  const rows = vrFiltered();
  const total = vrBuildRows().length;
  const c = document.getElementById('vrCount'); if(c) c.textContent = rows.length + ' of ' + total;
  if(!rows.length){
    tb.innerHTML = `<tr><td colspan="7">${acxEmpty(vrState.view === 'missing' ? 'No missing numbers' : 'Nothing to show', vrState.view === 'missing' ? 'Every number issued in this period has a document behind it.' : 'Try clearing the search or the filter.')}</td></tr>`;
    return;
  }
  tb.innerHTML = rows.map(r => {
    if(r.type === 'saved'){
      return `<tr${r.voided ? ' class="acx-void"' : ''}>
        <td><b>${escapeHtml(r.number)}</b></td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.who || '—')}</td><td>${escapeHtml(r.detail || '—')}</td>
        <td>${escapeHtml(r.mode || '—')}</td><td class="acx-r">${r.voided ? `<s>${fmtMoney(r.amount)}</s>` : `<b>${fmtMoney(r.amount)}</b>`}</td>
        <td>${escapeHtml(r.by || '—')}${r.voided ? ` <span class="sf-badge sf-badge--pending">${escapeHtml(r.voidNote)}</span>` : ''}</td></tr>`;
    }
    const g = r.gap;
    const who = g.issuedTo === null
      ? 'Issued before tracking began — user not recorded'
      : 'Issued to <b>' + escapeHtml(g.issuedTo || '—') + '</b>' + (g.issuedRole ? ' (' + escapeHtml(g.issuedRole) + ')' : '') + (g.issuedAt ? ' · ' + escapeHtml(vrWhen(g.issuedAt)) : '');
    const note = g.note
      ? `<span class="sf-badge sf-badge--paid">Explained</span> ${escapeHtml(g.note.reason)} <small>— ${escapeHtml(g.note.notedBy)}</small> <button type="button" class="sf-btn sf-btn--soft" onclick="vrEditNote(${r.seq})">Edit</button>`
      : `<span class="sf-badge sf-badge--overdue">Unexplained</span> <button type="button" class="sf-btn sf-btn--soft" onclick="vrEditNote(${r.seq})">Add reason</button>`;
    return `<tr id="vrRow-${r.seq}" style="background:rgba(220,38,38,.07)">
      <td><b style="color:#b91c1c">${escapeHtml(r.number)}</b><br><span class="sf-badge sf-badge--overdue">MISSING</span></td>
      <td colspan="3"><small>${who}</small></td><td colspan="3" id="vrNote-${r.seq}">${note}</td></tr>`;
  }).join('');
}

function vrSetSeries(s){ vrState.series = s; vrState.period = ''; renderAcctVoucherRegisterTab(document.getElementById('accountingBody')); }
function vrSetPeriod(p){ vrState.period = p; renderAcctVoucherRegisterTab(document.getElementById('accountingBody')); }
function vrSetOrder(o){ vrState.order = o; vrPaintRows(); }
function vrSetView(v){ vrState.view = v; vrPaint(); }
function vrSetSearch(q){ vrState.search = q; vrPaintRows(); }

function vrEditNote(seq){
  const cell = document.getElementById('vrNote-' + seq);
  if(!cell) return;
  const m = vrServer.missing.find(x => x.seq === seq);
  const cur = m && m.note ? m.note.reason : '';
  cell.innerHTML = `<input class="input" id="vrReason-${seq}" maxlength="500" value="${escapeHtml(cur)}" placeholder="e.g. Internet dropped while saving; re-entered as PV/…" style="min-width:240px">
    <button type="button" class="sf-btn sf-btn--primary" onclick="vrSaveNote(${seq})">Save</button>
    <button type="button" class="sf-btn sf-btn--soft" onclick="vrPaintRows()">Cancel</button>`;
  const i = document.getElementById('vrReason-' + seq);
  if(i){ i.focus(); i.addEventListener('keydown', e => { if(e.key === 'Enter') vrSaveNote(seq); }); }
}
async function vrSaveNote(seq){
  const i = document.getElementById('vrReason-' + seq);
  const reason = i ? i.value.trim() : '';
  if(!reason){ showToast('Type a reason first.'); return; }
  try{
    const res = await fetch('/api/voucher-gaps/note', { method:'POST', headers:{ 'Content-Type':'application/json', ...actorHeaders() },
      body: JSON.stringify({ series: vrState.series, period: vrServer.period, seq, reason }) });
    await throwIfNotOk(res);
    showToast('Reason saved.');
    renderAcctVoucherRegisterTab(document.getElementById('accountingBody'));
  }catch(e){ showToast('Could not save: ' + (e.message || 'error')); }
}

function vrExport(pdf){
  if(!vrServer) return;
  const rows = vrFiltered().map(r => r.type === 'saved' ? {
    'Number': r.number, 'Status': r.voided ? r.voidNote : 'Saved', 'Date': r.date, 'Party / Student': r.who, 'Category / Fee heads': r.detail,
    'Mode': r.mode, 'Amount': r.amount, 'Entered by': r.by, 'Issued to': '', 'Issued at': '', 'Reason for gap': '',
  } : {
    'Number': r.number, 'Status': 'MISSING', 'Date': '', 'Party / Student': '', 'Category / Fee heads': '',
    'Mode': '', 'Amount': '', 'Entered by': '', 'Issued to': r.gap.issuedTo === null ? 'not recorded' : (r.gap.issuedTo || ''),
    'Issued at': vrWhen(r.gap.issuedAt), 'Reason for gap': r.gap.note ? r.gap.note.reason + ' (' + r.gap.note.notedBy + ')' : 'UNEXPLAINED',
  });
  const label = vrServer.label + ' — ' + vrPeriodLabel(vrState.series, vrServer.period);
  const file = 'voucher_register_' + vrState.series + '_' + String(vrServer.period).replace(/[^A-Za-z0-9-]/g, '');
  if(pdf) exportRowsToPDF('Voucher Register — ' + label, vrServer.missingCount + ' missing of ' + vrServer.issuedUpTo + ' issued', rows);
  else exportRowsToExcel(file + '.xlsx', 'Register', rows);
}
