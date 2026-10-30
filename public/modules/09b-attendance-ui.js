/* ============================================================================
   Manage Attendance → Mark Attendance roster.
   Presentation only: the save path (saveAttendance), holiday rules, the
   Morning/Afternoon sessions and "apply to both sessions" are unchanged and
   still live in module 09. Marking a student now updates just that row and the
   live counters instead of re-rendering the whole screen.
   ========================================================================== */

const AT_STATUSES = [
  { key: 'Present', icon: '✓', short: 'P' },
  { key: 'Absent',  icon: '✕', short: 'A' },
  { key: 'Late',    icon: '◐', short: 'L' },
  { key: 'Leave',   icon: '☂', short: 'Lv' },
];

function atRosterList(){
  return students.filter(s => s.className === attCurrentClass && s.section === attCurrentSection && isActive(s)).sort(compareByRoll);
}

function atTally(list){
  const t = { Present: 0, Absent: 0, Late: 0, Leave: 0 };
  list.forEach(s => { const k = pendingMarks[s.id]; if(t[k] !== undefined) t[k]++; });
  return t;
}

function atStatusButtons(studentId){
  return AT_STATUSES.map(st => `<button type="button" class="at-st at-st--${st.key.toLowerCase()} ${pendingMarks[studentId] === st.key ? 'active' : ''}"
      data-status="${st.key}" aria-pressed="${pendingMarks[studentId] === st.key}" ${attIsLocked(studentId)?'disabled':''} title="${attIsLocked(studentId)?'Marked and locked — only Admin or Principal can change it':st.key}" onclick="setAttStatus('${studentId}','${st.key}')">
      <span aria-hidden="true">${st.icon}</span><em>${st.key}</em></button>`).join('');
}

// Paints counters + the save-bar summary from pendingMarks.
function atPaintCounters(){
  const list = atRosterList();
  const t = atTally(list);
  AT_STATUSES.forEach(st => {
    const el = document.getElementById('atCount' + st.key);
    if(el) el.textContent = t[st.key];
  });
  const pct = list.length ? Math.round((t.Present + t.Late) / list.length * 100) : 0;
  const p = document.getElementById('atPct'); if(p) p.textContent = pct + '%';
  const bar = document.getElementById('atPctBar'); if(bar) bar.style.width = pct + '%';
  const sum = document.getElementById('atSaveSummary');
  if(sum) sum.innerHTML = `<b>${list.length}</b> students · <span class="at-dot at-dot--present"></span>${t.Present} <span class="at-dot at-dot--absent"></span>${t.Absent} <span class="at-dot at-dot--late"></span>${t.Late} <span class="at-dot at-dot--leave"></span>${t.Leave}`;
}

function renderAttRoster(body){
  const list = atRosterList();
  list.forEach(s => {
    if(pendingMarks[s.id] === undefined){
      const rec = attendanceRecords.find(r => r.studentId === s.id && r.date === attMarkDate && r.session === attMarkSession);
      // Falls back to a pre-two-session (sessionless) record so re-opening an
      // old date shows its original status, not "Present" for everyone.
      const legacy = !rec ? attendanceRecords.find(r => r.studentId === s.id && r.date === attMarkDate && !r.session) : null;
      pendingMarks[s.id] = rec ? rec.status : (legacy ? legacy.status : 'Present');
    }
  });
  const holiday = holidayFor(attMarkDate);
  const isHoliday = !!holiday;
  if(attIsSingleSession(attMarkDate)) attMarkSession = 'Morning';
  const both = canUseBothSessionsShortcut() && !attIsSingleSession(attMarkDate);
  const kpi = (key, label, cls) => `<div class="at-kpi at-kpi--${cls}"><span aria-hidden="true">${AT_STATUSES.find(x => x.key === key).icon}</span><div><b id="atCount${key}">0</b><small>${label}</small></div></div>`;
  body.innerHTML = `
    <div class="breadcrumb"><a onclick="backToAttGrid()">All Classes</a> &nbsp;/&nbsp; ${escapeHtml(attCurrentClass)} — Section ${escapeHtml(attCurrentSection)}</div>
    <section class="at-summary">
      ${kpi('Present', 'Present', 'present')}${kpi('Absent', 'Absent', 'absent')}${kpi('Late', 'Late', 'late')}${kpi('Leave', 'On leave', 'leave')}
      <div class="at-rate"><small>Attendance today</small><b id="atPct">0%</b><div class="at-rate-bar"><span id="atPctBar"></span></div></div>
    </section>
    <div class="iv-toolbar">
      <input type="date" class="input" id="attDateInput" value="${attMarkDate}" onchange="changeAttDate(this.value)" style="max-width:190px;">
      <div class="sf-segments" role="group" aria-label="Session" style="${attApplyBothSessions ? 'opacity:.45; pointer-events:none;' : ''}">
        ${attSessionsFor(attMarkDate).map(sess => `<button type="button" class="${attMarkSession === sess ? 'active' : ''}" onclick="changeAttSession('${sess}')">${sess === 'Morning' ? '🌅' : '🌇'} ${sess}</button>`).join('')}
      </div>
      <div class="iv-toolbar-actions">
        ${both ? `<label class="at-both" title="Saves the same status to both Morning and Afternoon in one go — handy for backfilling past dates.">
          <input type="checkbox" ${attApplyBothSessions ? 'checked' : ''} onchange="toggleAttBothSessions(this.checked); renderAttendanceBody();"> Apply to both sessions</label>` : ''}
        ${sfBtn('soft', '', '✓ All present', "markAllStatus('Present')")}
        ${sfBtn('soft', '', '✕ All absent', "markAllStatus('Absent')")}
      </div>
    </div>
    ${isHoliday ? `<div class="empty-state" style="margin-bottom:16px;"><b>${escapeHtml(holiday.name || 'Holiday')} — school is closed on ${attMarkDate}</b>Attendance isn't taken on a holiday. Pick a working day above, or ${holiday.auto ? 'adjust it under Attendance → Settings → Working Days' : 'remove the holiday first'} if this date shouldn't be one.</div>` : ''}
    <div class="sf-card" style="${isHoliday ? 'opacity:.5; pointer-events:none;' : ''}">
      <div class="at-list">
        ${list.map(s => `
          <div class="at-row" data-id="${s.id}">
            <span class="at-roll">${escapeHtml(s.rollNo || '—')}</span>
            ${sfAvatar(s)}
            <span class="at-name"><b>${escapeHtml(s.firstName)} ${escapeHtml(s.lastName)}</b><small>${escapeHtml(s.admissionNo || '')}${attIsLocked(s.id) ? ` · 🔒 locked · <a onclick="requestAttCorrection('${s.id}')" style="cursor:pointer;text-decoration:underline;">Request correction</a>` : (attEditMinutesLeft(s.id) ? ` · ✏️ can change for ${attEditMinutesLeft(s.id)} more min` : '')}</small></span>
            <div class="at-btns" role="group" aria-label="Status for ${escapeHtml(s.firstName)}">${atStatusButtons(s.id)}</div>
          </div>`).join('')}
        ${list.length === 0 ? `<div class="empty-state"><b>No students here</b></div>` : ''}
      </div>
    </div>
    <div class="at-savebar">
      <span id="atSaveSummary"></span>
      <button type="button" class="sf-btn sf-btn--primary sf-btn--lg" ${isHoliday ? 'disabled' : ''} onclick="saveAttendance()">Save attendance${attApplyBothSessions ? ' (Morning &amp; Afternoon)' : ' (' + attMarkSession + ')'}</button>
    </div>`;
  atPaintCounters();
  atScheduleLockRefresh();
}

// Marking one student only touches that row and the counters.
// When a teacher's edit time runs out, redraw the list so the buttons lock by themselves.
let atLockTimer = null;
function atScheduleLockRefresh(){
  clearTimeout(atLockTimer);
  try{
    let soon = Infinity;
    atRosterList().forEach(s => {
      const rec = attendanceRecords.find(r => r.studentId === s.id && r.date === attMarkDate && (!r.session || r.session === attMarkSession));
      const left = attEditLeftSec(rec, attLoadedAt);
      if(left > 0) soon = Math.min(soon, left);
    });
    if(isFinite(soon) && !(currentUser && ['Admin','Principal'].includes(currentUser.role))){
      atLockTimer = setTimeout(() => { try{ if(document.querySelector('.at-row')) renderAttendanceBody(); }catch(e){} }, Math.min(soon, 600) * 1000 + 800);
    }
  }catch(e){}
}
function setAttStatus(studentId, status){
  if(attIsLocked(studentId)) return;
  pendingMarks[studentId] = status;
  const row = document.querySelector(`.at-row[data-id="${studentId}"]`);
  if(row){
    row.querySelectorAll('.at-st').forEach(b => {
      const on = b.dataset.status === status;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    atPaintCounters();
  }else{
    renderAttendanceBody();
  }
}

function markAllStatus(status){
  atRosterList().forEach(s => { if(!attIsLocked(s.id)) pendingMarks[s.id] = status; });
  document.querySelectorAll('.at-row').forEach(row => {
    if(attIsLocked(row.dataset.id)) return;
    row.querySelectorAll('.at-st').forEach(b => {
      const on = b.dataset.status === status;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  });
  atPaintCounters();
}

/* ---------- Correction requests (locked attendance / marks) ----------
   A teacher cannot change a locked entry, so they ask for a correction with a reason; an Admin or
   Principal approves (the server applies it and logs it) or rejects it. */
function corrIsApprover(){ return !!currentUser && ['Admin','Principal'].includes(currentUser.role); }
function corrClose(){ const o = document.getElementById('corrOverlay'); if(o) o.remove(); }
// kind: 'attendance' | 'staff-attendance' | 'marks'; key = the fields that identify the entry; label = readable name
function openCorrectionRequest(kind, key, label, currentValue){
  corrClose();
  const isMarks = kind === 'marks';
  const input = isMarks
    ? `<input type="number" class="input" id="corrNew" min="0" step="any" placeholder="Correct marks" style="width:100%;">`
    : `<select class="input" id="corrNew" style="width:100%;">${['Present','Absent','Late','Leave'].map(s => `<option ${s===currentValue?'disabled':''}>${s}</option>`).join('')}</select>`;
  const o = document.createElement('div');
  o.id = 'corrOverlay';
  o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  o.innerHTML = `<div style="background:var(--surface,#fff);color:var(--ink,#1b2433);border-radius:16px;padding:22px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.35);">
    <h3 style="margin:0 0 4px;">Request a correction</h3>
    <p style="margin:0 0 12px;font-size:.84rem;color:var(--ink-soft);">${escapeHtml(label)}${currentValue !== undefined && currentValue !== '' ? ' — currently <b>' + escapeHtml(String(currentValue)) + '</b>' : ''}. An Admin or Principal will review it.</p>
    <label style="font-size:.8rem;font-weight:600;">Correct value</label>${input}
    <label style="font-size:.8rem;font-weight:600;display:block;margin-top:10px;">Reason</label>
    <textarea class="input" id="corrReason" rows="3" placeholder="e.g. Typed 45 instead of 54" style="width:100%;"></textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-ghost btn-sm" onclick="corrClose()">Cancel</button>
      <button class="btn btn-primary btn-sm" id="corrSend">Send request</button></div></div>`;
  document.body.appendChild(o);
  document.getElementById('corrSend').onclick = async () => {
    const btn = document.getElementById('corrSend'); btn.disabled = true;
    try{
      const res = await fetch('/api/correction-requests', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()},
        body: JSON.stringify({ ...key, kind, label, newValue: document.getElementById('corrNew').value, reason: document.getElementById('corrReason').value }) });
      await throwIfNotOk(res);
      corrClose(); showToast('Correction request sent for approval.');
    }catch(e){ btn.disabled = false; showToast(e.message || 'Could not send the request.'); }
  };
}
function requestAttCorrection(studentId){
  const s = students.find(x => x.id === studentId); if(!s) return;
  const rec = attendanceRecords.find(r => r.studentId === studentId && r.date === attMarkDate && (r.session === attMarkSession || !r.session));
  openCorrectionRequest('attendance', { studentId, date: attMarkDate, session: rec ? (rec.session || null) : attMarkSession },
    `${s.firstName} ${s.lastName} · ${attMarkDate} ${attMarkSession}`, rec ? rec.status : '');
}
function requestStaffAttCorrection(staffId){
  const st = staffList.find(x => x.id === staffId); if(!st) return;
  const rec = staffAttendanceRecords.find(r => r.staffId === staffId && r.date === staffAttMarkDate && (r.session === staffAttMarkSession || !r.session));
  openCorrectionRequest('staff-attendance', { staffId, date: staffAttMarkDate, session: rec ? (rec.session || null) : staffAttMarkSession },
    `${st.firstName} ${st.lastName} · ${staffAttMarkDate} ${staffAttMarkSession}`, rec ? rec.status : '');
}
// Marks: pick the student + subject from the open sheet
function openMarksCorrectionPicker(){
  const exam = examDefs.find(e => e.id === examCurrentExamId); if(!exam) return;
  const list = students.filter(s => s.className===examCurrentClass && s.section===examCurrentSection && isActive(s)).sort(compareByRoll);
  const subs = Array.from(new Set(Array.from(document.querySelectorAll('.marks-input')).map(i => i.dataset.subject))).filter(Boolean);
  corrClose();
  const o = document.createElement('div');
  o.id = 'corrOverlay';
  o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
  o.innerHTML = `<div style="background:var(--surface,#fff);color:var(--ink,#1b2433);border-radius:16px;padding:22px;max-width:420px;width:100%;">
    <h3 style="margin:0 0 10px;">Which mark is wrong?</h3>
    <label style="font-size:.8rem;font-weight:600;">Student</label>
    <select class="input" id="corrStu" style="width:100%;">${list.map(s => `<option value="${s.id}">${escapeHtml((s.rollNo ? s.rollNo + ' · ' : '') + s.firstName + ' ' + s.lastName)}</option>`).join('')}</select>
    <label style="font-size:.8rem;font-weight:600;display:block;margin-top:10px;">Subject</label>
    <select class="input" id="corrSub" style="width:100%;">${subs.map(s => `<option>${escapeHtml(s)}</option>`).join('')}</select>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-ghost btn-sm" onclick="corrClose()">Cancel</button>
      <button class="btn btn-primary btn-sm" onclick="corrMarksNext()">Next</button></div></div>`;
  document.body.appendChild(o);
}
function corrMarksNext(){
  const exam = examDefs.find(e => e.id === examCurrentExamId);
  const sid = document.getElementById('corrStu').value, sub = document.getElementById('corrSub').value;
  const s = students.find(x => x.id === sid);
  const r = examResults.find(x => x.examId === exam.id && x.studentId === sid && x.subject === sub);
  openCorrectionRequest('marks', { examId: exam.id, studentId: sid, subject: sub }, `${s.firstName} ${s.lastName} · ${sub} · ${exam.name}`, r ? (r.marks ?? '') : '');
}
async function renderCorrectionsTab(body){
  body.innerHTML = '<div class="empty-state"><b>Loading…</b></div>';
  let rows = [];
  try{ const res = await fetch('/api/correction-requests'); await throwIfNotOk(res); rows = await res.json(); }
  catch(e){ body.innerHTML = `<div class="empty-state"><b>Could not load corrections</b>${escapeHtml(e.message || '')}</div>`; return; }
  const appr = corrIsApprover(), pending = rows.filter(r => r.status === 'Pending').length;
  const kindName = { attendance:'Student attendance', 'staff-attendance':'Staff attendance', marks:'Marks' };
  const col = { Pending:'#b7791f', Approved:'#0a8f6a', Rejected:'#C0264B' };
  body.innerHTML = `<div class="sf-card" style="padding:16px;">
    <p style="margin:0 0 12px;font-size:.84rem;color:var(--ink-soft);">${appr ? `${pending} waiting for your decision.` : 'Corrections you asked for, and what was decided.'} Marked attendance and old marks are locked; ask here when something was entered wrongly.</p>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>What</th><th>Change</th><th>Reason</th>${appr ? '<th>Asked by</th>' : ''}<th>Status</th>${appr ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows.map(r => `<tr><td>${escapeHtml(String(r.createdAt || '').slice(0,10))}</td>
      <td><b>${kindName[r.kind] || r.kind}</b><div style="font-size:.76rem;color:var(--ink-soft);">${escapeHtml(r.label || '')}</div></td>
      <td>${escapeHtml(String(r.oldValue))} → <b>${escapeHtml(String(r.newValue))}</b></td>
      <td style="max-width:240px;">${escapeHtml(r.reason || '')}</td>
      ${appr ? `<td>${escapeHtml(r.requestedBy || '')}</td>` : ''}
      <td><span style="color:${col[r.status] || '#666'};font-weight:600;">${r.status}</span>${r.decidedBy ? `<div style="font-size:.74rem;color:var(--ink-soft);">by ${escapeHtml(r.decidedBy)}${r.decidedNote ? ' · ' + escapeHtml(r.decidedNote) : ''}</div>` : ''}</td>
      ${appr ? `<td>${r.status === 'Pending' ? `<button class="btn btn-primary btn-sm" onclick="decideCorrection('${r.id}','approve')">Approve</button> <button class="btn btn-ghost btn-sm" onclick="decideCorrection('${r.id}','reject')">Reject</button>` : ''}</td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : '<div class="empty-state"><b>No correction requests yet</b></div>'}</div>`;
}
async function decideCorrection(id, action){
  let note = '';
  // The app's own dialogs (not the browser's confirm/prompt, which some browsers block silently).
  if(action === 'reject'){
    const n = await showPromptDialog('Why is this correction rejected? (optional)', { title:'Reject correction', okText:'Reject', placeholder:'e.g. Please check the register again' });
    if(n === null) return;
    note = n;
  }else{
    const ok = await showConfirmDialog('The saved value will be changed and the change is logged with the reason.', { title:'Approve this correction?', okText:'Approve', cancelText:'Cancel' });
    if(!ok) return;
  }
  try{
    const res = await fetch('/api/correction-requests?id=' + encodeURIComponent(id) + '&action=' + action, { method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body: JSON.stringify({ note }) });
    await throwIfNotOk(res);
    showToast(action === 'approve' ? 'Correction approved and applied.' : 'Request rejected.');
    attendanceRecords = await storageGet(ATTENDANCE_KEY, []);
    renderCorrectionsTab(document.getElementById('attendanceBody'));
  }catch(e){ showToast(e.message || 'Could not save the decision.'); }
}
