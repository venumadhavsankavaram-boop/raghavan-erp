/* ============================================================================
   Holidays — ONE list for the whole ERP.
   Attendance → Holidays and Exams → Holidays are two windows onto the same data
   (the `holidays` table / `holidays` array loaded by 09-fees-subtabs.js). Anything added,
   edited or removed on either screen shows on the other, and holidayFor() — which
   attendance marking, exam scheduling, the teacher dashboard and the parent portal all use —
   sees it immediately. Sundays (or any weekday switched off in Attendance → Settings) stay
   automatic weekly offs and are never stored.
   Loaded after 10e so these definitions replace the old two separate screens.
   ========================================================================== */

const HM_TYPES = {
  'Public Holiday':   { c: '#188F86', icon: '🏛️' },
  'National Holiday': { c: '#D11073', icon: '🇮🇳' },
  'Festival':         { c: '#CB9A2E', icon: '🪔' },
  'School Holiday':   { c: '#4B3FA8', icon: '🏫' },
  'Vacation':         { c: '#2A7FBA', icon: '🏖️' },
  'Exam Break':       { c: '#C2502B', icon: '📝' },
  'Custom':           { c: '#6B6585', icon: '📌' }
};
const HM_SUGGEST = ['Republic Day', 'Independence Day', 'Gandhi Jayanti', 'Ugadi', 'Sankranti', 'Dasara Break', 'Diwali', 'Christmas', 'Summer Vacation', 'Exam Break', 'School Annual Day'];
const HM_CTX = {
  att:  { body: 'attendanceBody', can: a => (typeof canDo === 'function') && (a === 'create' ? (canDo('attendance', 'create') || canDo('attendance', 'edit')) : a === 'edit' ? (canDo('attendance', 'edit') || canDo('attendance', 'create')) : canDo('attendance', a)) },
  exam: { body: 'examBody',       can: a => (typeof canSub === 'function') && canSub('exams_holidays', 'exams', a === 'edit' ? 'create' : a) }
};
const hmState = { att: { when: 'upcoming', type: 'all', q: '', view: 'list', month: '' }, exam: { when: 'upcoming', type: 'all', q: '', view: 'list', month: '' } };
let hmEditing = null;

function hmEsc(v){ return (typeof escapeHtml === 'function') ? escapeHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hmJs(v){ return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function hmToday(){ return localDateStr(new Date()); }
function hmDays(a, b){ return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
function hmType(t){ return HM_TYPES[t] ? t : 'Custom'; }
function hmFmt(d, withYear){
  const x = new Date(d + 'T00:00:00');
  return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
}

// Consecutive days with the same name/type/note read as one entry ("Dasara Break · 3 – 12 Oct").
function hmGroups(){
  const sorted = holidays.filter(h => h && h.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  sorted.forEach(h => {
    const t = hmType(h.type), note = h.note || '', prev = out[out.length - 1];
    if(prev && prev.name === h.name && prev.type === t && prev.note === note && hmDays(prev.to, h.date) === 1){ prev.to = h.date; prev.days++; }
    else out.push({ name: h.name || 'Holiday', type: t, note, from: h.date, to: h.date, days: 1 });
  });
  return out;
}

function hmRenderBoth(){
  ['att', 'exam'].forEach(c => {
    const el = document.getElementById(HM_CTX[c].body);
    if(!el) return;
    if(c === 'att' && typeof attTab !== 'undefined' && attTab !== 'holidays') return;
    if(c === 'exam' && typeof examTab !== 'undefined' && examTab !== 'holidays') return;
    hmPaint(c, el);
  });
}
function renderHolidaysTab(body){ hmPaint('att', body); }
function renderExamHolidaysTab(body){ hmPaint('exam', body); }
async function loadExamHolidays(){ /* merged into the shared holiday list (loadAttendance) */ }

function hmPaint(ctx, body){
  if(!body) return;
  const st = hmState[ctx], can = HM_CTX[ctx].can;
  const today = hmToday();
  const groups = hmGroups();
  const upcoming = groups.filter(g => g.to >= today), past = groups.filter(g => g.to < today);
  const nextG = upcoming[0];
  const daysUpcoming = upcoming.reduce((n, g) => n + (g.from < today ? hmDays(today, g.to) + 1 : g.days), 0);
  const monthKey = today.slice(0, 7);
  const thisMonth = holidays.filter(h => h.date && h.date.slice(0, 7) === monthKey).length;
  const nextTxt = nextG ? (nextG.from <= today ? 'Today' : (hmDays(today, nextG.from) === 1 ? 'Tomorrow' : 'In ' + hmDays(today, nextG.from) + ' days')) : '—';
  if(st.when === 'upcoming' && !upcoming.length && past.length) st.when = 'all';

  let list = st.when === 'upcoming' ? upcoming : st.when === 'past' ? past.slice().reverse() : groups;
  const typeCount = {}; list.forEach(g => { typeCount[g.type] = (typeCount[g.type] || 0) + 1; });
  if(st.type !== 'all') list = list.filter(g => g.type === st.type);
  const q = st.q.trim().toLowerCase();
  if(q) list = list.filter(g => (g.name + ' ' + g.note + ' ' + g.type).toLowerCase().includes(q));

  const months = [];
  list.forEach(g => {
    const k = g.from.slice(0, 7), last = months[months.length - 1];
    if(last && last.k === k) last.items.push(g); else months.push({ k, items: [g] });
  });
  const monthLabel = k => new Date(k + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const p = 'hm_' + ctx + '_';

  const typeChips = Object.keys(HM_TYPES).map(t => `
    <label class="hm-tchip" style="--c:${HM_TYPES[t].c}"><input type="radio" name="${p}type" value="${t}" ${t === 'Public Holiday' ? 'checked' : ''}><span>${HM_TYPES[t].icon} ${t}</span></label>`).join('');

  const addCard = can('create') ? `
    <section class="hm-card hm-add">
      <div class="hm-card-h"><b>Add a holiday</b><span>One day or a whole break — it appears in Attendance <i>and</i> Exams.</span></div>
      <div class="hm-form">
        <label class="hm-f"><span>From</span><input type="date" id="${p}from" onchange="hmSyncTo('${ctx}')"></label>
        <label class="hm-f"><span>To <em>(optional)</em></span><input type="date" id="${p}to"></label>
        <label class="hm-f hm-f-name"><span>Holiday name</span><input type="text" id="${p}name" list="${p}dl" placeholder="e.g. Dasara Break" maxlength="80" autocomplete="off"></label>
        <datalist id="${p}dl">${HM_SUGGEST.map(s => `<option value="${hmEsc(s)}">`).join('')}</datalist>
        <div class="hm-f hm-f-full"><span>Type</span><div class="hm-tchips">${typeChips}</div></div>
        <label class="hm-f hm-f-full"><span>Note <em>(optional)</em></span><input type="text" id="${p}note" placeholder="e.g. School reopens on 14 Oct" maxlength="160"></label>
        <div class="hm-f-full hm-actions"><button type="button" class="sf-btn sf-btn--primary" onclick="hmAdd('${ctx}')">+ Add holiday</button><small>Sundays are weekly offs automatically — no need to add them.</small></div>
      </div>
    </section>` : '';

  const whenBtn = (k, label, n) => `<button type="button" class="hm-seg ${st.when === k ? 'on' : ''}" onclick="hmSet('${ctx}','when','${k}')">${label}<i>${n}</i></button>`;
  const typeBtn = t => `<button type="button" class="hm-pill ${st.type === t ? 'on' : ''}" style="--c:${t === 'all' ? 'var(--navy)' : HM_TYPES[t].c}" onclick="hmSet('${ctx}','type','${t}')">${t === 'all' ? 'All types' : HM_TYPES[t].icon + ' ' + t}${t !== 'all' && typeCount[t] ? ' <i>' + typeCount[t] + '</i>' : ''}</button>`;

  const rows = months.map(m => `
    <div class="hm-month"><h4>${monthLabel(m.k)}</h4>
      ${m.items.map(g => {
        const meta = HM_TYPES[g.type], d0 = new Date(g.from + 'T00:00:00');
        const active = g.from <= today && g.to >= today, isPast = g.to < today;
        const away = active ? 'On now' : isPast ? 'Past' : (hmDays(today, g.from) === 1 ? 'Tomorrow' : 'In ' + hmDays(today, g.from) + ' days');
        const range = g.days > 1 ? hmFmt(g.from) + ' – ' + hmFmt(g.to) + ' · ' + g.days + ' days' : d0.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
        return `<div class="hm-row ${isPast ? 'past' : ''} ${active ? 'now' : ''}" style="--c:${meta.c}">
          <div class="hm-date"><b>${d0.getDate()}</b><small>${d0.toLocaleDateString('en-IN', { month: 'short' })}</small></div>
          <div class="hm-main"><div class="hm-name">${hmEsc(g.name)}</div><div class="hm-sub">${range}</div>${g.note ? `<div class="hm-note">${hmEsc(g.note)}</div>` : ''}</div>
          <div class="hm-side"><span class="hm-badge">${meta.icon} ${g.type}</span><span class="hm-away ${active ? 'on' : ''}">${away}</span></div>
          <div class="hm-ops">${can('edit') ? `<button type="button" class="hm-ic" title="Edit" onclick="hmEdit('${ctx}','${g.from}','${g.to}')">✏️</button>` : ''}${can('delete') ? `<button type="button" class="hm-ic del" title="Remove" onclick="hmRemove('${ctx}','${g.from}','${g.to}','${hmJs(g.name)}')">🗑</button>` : ''}</div>
        </div>`;
      }).join('')}
    </div>`).join('');

  const wd = (typeof attSettings === 'object' && attSettings && attSettings.workingDays) || [1, 2, 3, 4, 5, 6];
  const offDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !wd.includes(d)).map(d => WEEKDAY_NAMES[d]).join(', ') || 'none';

  body.innerHTML = `${hmCss()}
  <div class="hm-wrap">
    <div class="hm-kpis">
      <div class="hm-kpi"><small>Upcoming holiday days</small><b>${daysUpcoming}</b><span>${upcoming.length} entr${upcoming.length === 1 ? 'y' : 'ies'}</span></div>
      <div class="hm-kpi hi"><small>Next holiday</small><b class="sm">${nextG ? hmEsc(nextG.name) : 'None planned'}</b><span>${nextG ? nextTxt + ' · ' + hmFmt(nextG.from) : 'Add one below'}</span></div>
      <div class="hm-kpi"><small>This month</small><b>${thisMonth}</b><span>day${thisMonth === 1 ? '' : 's'} off</span></div>
      <div class="hm-kpi"><small>Weekly off</small><b class="sm">${hmEsc(offDays)}</b><span>${typeof switchAttTab === 'function' ? `<a href="javascript:void 0" onclick="hmOpenSettings()">Change in Attendance → Settings</a>` : 'Set in Attendance → Settings'}</span></div>
    </div>
    ${addCard}
    <section class="hm-card">
      <div class="hm-bar">
        <div class="hm-segs">${whenBtn('upcoming', 'Upcoming', upcoming.length)}${whenBtn('past', 'Past', past.length)}${whenBtn('all', 'All', groups.length)}</div>
        <div class="hm-tools">
          <div class="hm-segs"><button type="button" class="hm-seg ${st.view === 'list' ? 'on' : ''}" onclick="hmSet('${ctx}','view','list')">☰ List</button><button type="button" class="hm-seg ${st.view === 'cal' ? 'on' : ''}" onclick="hmSet('${ctx}','view','cal')">▦ Calendar</button></div>
          <input type="search" class="hm-search" placeholder="Search holidays…" value="${hmEsc(st.q)}" oninput="hmSearch('${ctx}',this.value)">
          <button type="button" class="hm-ic wide" title="Download as spreadsheet (CSV)" onclick="hmExport()">⬇ Export</button>
          ${can('create') && groups.length ? `<button type="button" class="hm-ic wide" title="Copy this year's holidays to next year" onclick="hmCopyForward('${ctx}')">⧉ Copy to next year</button>` : ''}
        </div>
      </div>
      <div class="hm-pills">${typeBtn('all')}${Object.keys(HM_TYPES).filter(t => typeCount[t] || st.type === t).map(typeBtn).join('')}</div>
      ${st.view === 'cal' ? hmCalendar(ctx, st, today, can) : rows || `<div class="hm-empty"><span>📅</span><b>${groups.length ? 'No holidays match this view' : 'No holidays added yet'}</b><small>${groups.length ? 'Try a different filter.' : 'Add the school\'s holidays above — Attendance, Exams and the parent portal will all pick them up.'}</small></div>`}
    </section>
  </div>`;
  if(hmEditing && hmEditing.ctx === ctx) hmModal();
}

function hmCalendar(ctx, st, today, can){
  if(!st.month) st.month = today.slice(0, 7);
  const [y, m] = st.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate(), lead = first.getDay();
  const q = st.q.trim().toLowerCase();
  const byDate = {};
  holidays.forEach(h => { if(h && h.date && h.date.slice(0, 7) === st.month){
    const t = hmType(h.type);
    if(st.type !== 'all' && t !== st.type) return;
    if(q && !((h.name || '') + ' ' + (h.note || '') + ' ' + t).toLowerCase().includes(q)) return;
    byDate[h.date] = h; } });
  const cells = [];
  for(let i = 0; i < lead; i++) cells.push('<div class="hm-cell blank"></div>');
  for(let d = 1; d <= daysIn; d++){
    const ds = st.month + '-' + String(d).padStart(2, '0'), h = byDate[ds], auto = !h && isAutoHolidayWeekday(ds);
    const t = h ? hmType(h.type) : '', c = h ? HM_TYPES[t].c : '';
    const g = h ? hmGroups().find(x => ds >= x.from && ds <= x.to && x.name === h.name) : null;
    cells.push(`<div class="hm-cell ${h ? 'hol' : ''} ${auto ? 'off' : ''} ${ds === today ? 'today' : ''}" ${h ? `style="--c:${c}"` : ''} ${h && can('edit') && g ? `onclick="hmEdit('${ctx}','${g.from}','${g.to}')" title="Edit ${hmEsc(h.name)}"` : (!h && !auto && can('create') ? `onclick="hmPick('${ctx}','${ds}')" title="Add a holiday on ${ds}"` : (h ? `title="${hmEsc(h.name)}"` : ''))}>
      <b>${d}</b>${h ? `<span class="hm-chip">${HM_TYPES[t].icon} ${hmEsc(h.name)}</span>` : auto ? '<span class="hm-weekoff">Weekly off</span>' : ''}</div>`);
  }
  const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return `<div class="hm-cal">
    <div class="hm-cal-h"><button type="button" class="hm-ic" onclick="hmMonth('${ctx}',-1)" aria-label="Previous month">‹</button><b>${label}</b><button type="button" class="hm-ic" onclick="hmMonth('${ctx}',1)" aria-label="Next month">›</button><button type="button" class="hm-ic wide" onclick="hmMonth('${ctx}',0)">Today</button></div>
    <div class="hm-cal-g">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(w => `<div class="hm-wd">${w}</div>`).join('')}${cells.join('')}</div>
    <p class="hm-cal-n">Shaded days are the weekly off. ${can('create') ? 'Click an empty day to add a holiday on it, or a holiday to edit it.' : ''}</p></div>`;
}
function hmMonth(ctx, delta){
  const st = hmState[ctx], today = hmToday();
  if(!delta){ st.month = today.slice(0, 7); }
  else { const [y, m] = (st.month || today.slice(0, 7)).split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); st.month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  hmPaint(ctx, document.getElementById(HM_CTX[ctx].body));
}
function hmPick(ctx, ds){
  const f = document.getElementById('hm_' + ctx + '_from'), t = document.getElementById('hm_' + ctx + '_to'), n = document.getElementById('hm_' + ctx + '_name');
  if(!f) return;
  f.value = ds; t.value = ds; f.scrollIntoView({ behavior: 'smooth', block: 'center' }); if(n) n.focus();
}
function hmExport(){
  const rows = [['Holiday', 'From', 'To', 'Days', 'Type', 'Note']].concat(hmGroups().map(g => [g.name, g.from, g.to, g.days, g.type, g.note]));
  const csv = rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'school-holidays.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function hmCopyForward(ctx){
  const year = Number(hmToday().slice(0, 4)), src = holidays.filter(h => h && h.date && h.date.startsWith(String(year)));
  if(!src.length){ showToast('No holidays in ' + year + ' to copy.'); return; }
  const add = [];
  src.forEach(h => {
    const nd = (year + 1) + h.date.slice(4);
    if(isNaN(new Date(nd + 'T00:00:00')) || holidays.some(x => x.date === nd) || add.some(x => x.date === nd)) return;
    add.push({ id: nd, date: nd, name: h.name, type: h.type || 'Custom', note: h.note || '' });
  });
  if(!add.length){ showToast('Next year already has these dates.'); return; }
  if(!await showConfirmDialog('Copy ' + add.length + ' holiday day(s) from ' + year + ' to ' + (year + 1) + '? Fixed-date holidays will be right; festivals that move each year (Diwali, Dasara, Ugadi) need their dates adjusted afterwards.')) return;
  holidays = holidays.concat(add);
  await hmSave();
  showToast(add.length + ' holiday day(s) copied to ' + (year + 1) + '.', 'burst');
}

function hmSet(ctx, k, v){ hmState[ctx][k] = v; hmPaint(ctx, document.getElementById(HM_CTX[ctx].body)); }
function hmSearch(ctx, v){
  hmState[ctx].q = v;
  const el = document.getElementById(HM_CTX[ctx].body); hmPaint(ctx, el);
  const inp = el.querySelector('.hm-search'); if(inp){ inp.focus(); inp.setSelectionRange(v.length, v.length); }
}
function hmSyncTo(ctx){
  const f = document.getElementById('hm_' + ctx + '_from'), t = document.getElementById('hm_' + ctx + '_to');
  if(f && t && f.value && (!t.value || t.value < f.value)) t.value = f.value;
}
function hmOpenSettings(){
  if(typeof switchView === 'function'){ try{ switchView('attendance'); }catch(e){} }
  if(typeof switchAttTab === 'function') switchAttTab('settings');
}

function hmDatesBetween(from, to){
  const out = [];
  for(let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) out.push(localDateStr(d));
  return out;
}
async function hmSave(){
  await storageSet(HOLIDAYS_KEY, holidays);
  hmRenderBoth();
}

async function hmAdd(ctx){
  const p = 'hm_' + ctx + '_';
  const from = document.getElementById(p + 'from').value;
  const to = document.getElementById(p + 'to').value || from;
  const name = document.getElementById(p + 'name').value.trim();
  const typeEl = document.querySelector('input[name="' + p + 'type"]:checked');
  const type = typeEl ? typeEl.value : 'Custom';
  const note = document.getElementById(p + 'note').value.trim();
  if(!from){ showToast('Pick the holiday date (From).'); return; }
  if(!name){ showToast('Type a name for the holiday, e.g. Dasara Break.'); return; }
  if(to < from){ showToast("The 'To' date can't be before the 'From' date."); return; }
  const dates = hmDatesBetween(from, to);
  if(dates.length > 120){ showToast('That range is ' + dates.length + ' days — please check the From and To dates.'); return; }
  const clash = holidays.filter(h => dates.includes(h.date));
  if(clash.length && !await showConfirmDialog(clash.length + ' of these date' + (clash.length === 1 ? ' is' : 's are') + ' already marked as a holiday (' + clash.slice(0, 2).map(h => h.name).join(', ') + (clash.length > 2 ? '…' : '') + '). Replace ' + (clash.length === 1 ? 'it' : 'them') + '?')) return;
  holidays = holidays.filter(h => !dates.includes(h.date));
  dates.forEach(date => holidays.push({ id: date, date, name, type, note }));
  await hmSave();
  showToast(dates.length > 1 ? 'Holiday added for ' + dates.length + ' days.' : 'Holiday added.', 'burst');
}

async function hmRemove(ctx, from, to, name){
  if(!await showConfirmDialog('Remove "' + name + '" (' + (from === to ? hmFmt(from, true) : hmFmt(from) + ' – ' + hmFmt(to, true)) + ')?')) return;
  holidays = holidays.filter(h => h.date < from || h.date > to);
  await hmSave();
  showToast('Holiday removed.');
}
// Older screens called these names; keep them working against the shared list.
async function removeHolidayRange(from, to){ holidays = holidays.filter(h => h.date < from || h.date > to); await hmSave(); }
async function addHoliday(){ const c = (typeof examTab !== 'undefined' && document.getElementById('examBody') && document.getElementById('examBody').offsetParent) ? 'exam' : 'att'; return hmAdd(c); }
async function addExamHoliday(){ return hmAdd('exam'); }

function hmEdit(ctx, from, to){
  const g = hmGroups().find(x => x.from === from && x.to === to);
  if(!g) return;
  hmEditing = { ctx, from, to, name: g.name, type: g.type, note: g.note };
  hmModal();
}
function hmModal(){
  const e = hmEditing; if(!e) return;
  let m = document.getElementById('hmModal'); if(m) m.remove();
  m = document.createElement('div'); m.id = 'hmModal'; m.className = 'hm-modal';
  m.innerHTML = `<div class="hm-dlg" role="dialog" aria-label="Edit holiday">
    <div class="hm-dlg-h"><b>Edit holiday</b><button type="button" class="hm-ic" onclick="hmClose()" aria-label="Close">✕</button></div>
    <div class="hm-form">
      <label class="hm-f"><span>From</span><input type="date" id="hmE_from" value="${e.from}"></label>
      <label class="hm-f"><span>To</span><input type="date" id="hmE_to" value="${e.to}"></label>
      <label class="hm-f hm-f-full"><span>Holiday name</span><input type="text" id="hmE_name" value="${hmEsc(e.name)}" maxlength="80"></label>
      <div class="hm-f hm-f-full"><span>Type</span><div class="hm-tchips">${Object.keys(HM_TYPES).map(t => `<label class="hm-tchip" style="--c:${HM_TYPES[t].c}"><input type="radio" name="hmE_type" value="${t}" ${t === e.type ? 'checked' : ''}><span>${HM_TYPES[t].icon} ${t}</span></label>`).join('')}</div></div>
      <label class="hm-f hm-f-full"><span>Note</span><input type="text" id="hmE_note" value="${hmEsc(e.note)}" maxlength="160"></label>
      <div class="hm-f-full hm-actions"><button type="button" class="sf-btn sf-btn--primary" onclick="hmSaveEdit()">Save changes</button><button type="button" class="sf-btn sf-btn--soft" onclick="hmClose()">Cancel</button></div>
    </div></div>`;
  m.addEventListener('click', ev => { if(ev.target === m) hmClose(); });
  document.body.appendChild(m);
}
function hmClose(){ hmEditing = null; const m = document.getElementById('hmModal'); if(m) m.remove(); }
async function hmSaveEdit(){
  const e = hmEditing; if(!e) return;
  const from = document.getElementById('hmE_from').value, to = document.getElementById('hmE_to').value || from;
  const name = document.getElementById('hmE_name').value.trim();
  const typeEl = document.querySelector('input[name="hmE_type"]:checked');
  const note = document.getElementById('hmE_note').value.trim();
  if(!from || !name){ showToast('Both the date and the name are needed.'); return; }
  if(to < from){ showToast("The 'To' date can't be before the 'From' date."); return; }
  const dates = hmDatesBetween(from, to);
  if(dates.length > 120){ showToast('That range is ' + dates.length + ' days — please check the dates.'); return; }
  holidays = holidays.filter(h => (h.date < e.from || h.date > e.to) && !dates.includes(h.date));
  dates.forEach(date => holidays.push({ id: date, date, name, type: typeEl ? typeEl.value : 'Custom', note }));
  hmEditing = null; const m = document.getElementById('hmModal'); if(m) m.remove();
  await hmSave();
  showToast('Holiday updated.', 'burst');
}

function hmCss(){
  if(document.getElementById('hmStyle')) return '';
  const s = document.createElement('style'); s.id = 'hmStyle';
  s.textContent = `
  .hm-wrap{display:flex;flex-direction:column;gap:18px;max-width:1040px}
  .hm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .hm-kpi{background:var(--white);border:1px solid var(--border);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:0}
  .hm-kpi small{font-size:.7rem;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-soft)}
  .hm-kpi b{font-family:'Baloo 2',Georgia,serif;font-size:1.7rem;line-height:1.1;color:var(--navy)}
  .hm-kpi b.sm{font-size:1.05rem;line-height:1.25;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
  .hm-kpi span{font-size:.76rem;color:var(--ink-soft)} .hm-kpi a{color:var(--magenta);font-weight:600;text-decoration:none;cursor:pointer}
  .hm-kpi.hi{background:linear-gradient(135deg,var(--navy),var(--navy-deep));border-color:transparent}
  .hm-kpi.hi small,.hm-kpi.hi span{color:rgba(255,255,255,.72)} .hm-kpi.hi b{color:#fff}
  .hm-card{background:var(--white);border:1px solid var(--border);border-radius:18px;box-shadow:var(--shadow);padding:18px 20px}
  .hm-card-h{display:flex;flex-direction:column;gap:2px;margin-bottom:12px} .hm-card-h b{font-size:1rem;color:var(--navy)} .hm-card-h span{font-size:.8rem;color:var(--ink-soft)}
  .hm-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
  .hm-f{display:flex;flex-direction:column;gap:5px;min-width:0} .hm-f>span{font-size:.72rem;font-weight:600;color:var(--ink-soft)} .hm-f>span em{font-weight:400;font-style:normal;opacity:.8}
  .hm-f-name{grid-column:span 2} .hm-f-full{grid-column:1/-1}
  .hm-f input[type=date],.hm-f input[type=text],.hm-search{font:inherit;font-size:.9rem;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--cream);color:var(--ink);min-width:0;width:100%;box-sizing:border-box}
  .hm-f input:focus,.hm-search:focus{outline:2px solid var(--magenta);outline-offset:1px;background:var(--white)}
  .hm-tchips,.hm-pills,.hm-segs{display:flex;flex-wrap:wrap;gap:8px}
  .hm-tchip input{position:absolute;opacity:0;pointer-events:none}
  .hm-tchip span{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;border:1.5px solid var(--border);font-size:.8rem;font-weight:600;color:var(--ink-soft);cursor:pointer;background:var(--white);transition:.15s}
  .hm-tchip:hover span{border-color:var(--c)} .hm-tchip input:checked+span{background:var(--c);border-color:var(--c);color:#fff} .hm-tchip input:focus-visible+span{outline:2px solid var(--magenta);outline-offset:2px}
  .hm-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap} .hm-actions small{color:var(--ink-soft);font-size:.76rem}
  .hm-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
  .hm-segs{background:var(--cream);border:1px solid var(--border);border-radius:12px;padding:3px;gap:2px}
  .hm-seg{border:0;background:transparent;font:inherit;font-size:.82rem;font-weight:600;color:var(--ink-soft);padding:7px 14px;border-radius:9px;cursor:pointer}
  .hm-seg i,.hm-pill i{font-style:normal;font-size:.7rem;opacity:.75;margin-left:5px} .hm-seg.on{background:var(--white);color:var(--navy);box-shadow:0 1px 4px rgba(22,16,51,.12)}
  .hm-search{max-width:220px}
  .hm-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap} .hm-ic.wide{width:auto;padding:0 12px;font:inherit;font-size:.78rem;font-weight:600;color:var(--navy);border:1px solid var(--border);background:var(--white)}
  .hm-cal-h{display:flex;align-items:center;gap:8px;margin:6px 0 10px} .hm-cal-h b{flex:1;text-align:center;font-family:'Baloo 2',Georgia,serif;font-size:1.2rem;color:var(--navy)}
  .hm-cal-g{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px} .hm-wd{text-align:center;font-size:.7rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-soft);padding:4px 0}
  .hm-cell{min-height:84px;border:1px solid var(--border);border-radius:12px;padding:6px 7px;display:flex;flex-direction:column;gap:4px;background:var(--white);min-width:0;overflow:hidden}
  .hm-cell.blank{border:0;background:transparent} .hm-cell b{font-size:.82rem;color:var(--ink)} .hm-cell.off{background:var(--cream)} .hm-cell.off b{color:var(--ink-soft)}
  .hm-cell.hol{background:color-mix(in srgb,var(--c) 12%,var(--white));border-color:color-mix(in srgb,var(--c) 40%,transparent);cursor:pointer} .hm-cell.hol b{color:var(--c)}
  .hm-cell:not(.hol):not(.off):not(.blank){cursor:pointer} .hm-cell:not(.hol):not(.off):not(.blank):hover{border-color:var(--magenta)}
  .hm-cell.today{box-shadow:inset 0 0 0 2px var(--magenta)}
  .hm-chip{font-size:.68rem;font-weight:700;line-height:1.25;color:var(--c);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
  .hm-weekoff{font-size:.64rem;color:var(--ink-soft);opacity:.8} .hm-cal-n{font-size:.76rem;color:var(--ink-soft);margin:10px 2px 0}
  @media(max-width:620px){.hm-cell{min-height:58px;padding:4px}.hm-chip{font-size:.6rem;-webkit-line-clamp:1}.hm-weekoff{display:none}}
  .hm-pills{margin-bottom:6px} .hm-pill{border:1.5px solid var(--border);background:var(--white);font:inherit;font-size:.76rem;font-weight:600;color:var(--ink-soft);padding:5px 11px;border-radius:999px;cursor:pointer}
  .hm-pill.on{background:var(--c);border-color:var(--c);color:#fff}
  .hm-month h4{margin:18px 0 8px;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-soft)}
  .hm-row{display:grid;grid-template-columns:56px minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:12px 14px;border:1px solid var(--border);border-left:4px solid var(--c);border-radius:14px;margin-bottom:8px;background:var(--white)}
  .hm-row.now{background:color-mix(in srgb,var(--c) 9%,var(--white))} .hm-row.past{opacity:.62}
  .hm-date{display:flex;flex-direction:column;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 13%,var(--white));border-radius:12px;padding:6px 0}
  .hm-date b{font-family:'Baloo 2',Georgia,serif;font-size:1.35rem;line-height:1;color:var(--c)} .hm-date small{font-size:.66rem;font-weight:700;text-transform:uppercase;color:var(--c)}
  .hm-name{font-weight:700;color:var(--navy);font-size:.96rem} .hm-sub{font-size:.78rem;color:var(--ink-soft);margin-top:1px} .hm-note{font-size:.76rem;color:var(--ink-soft);margin-top:4px;font-style:italic}
  .hm-side{display:flex;flex-direction:column;align-items:flex-end;gap:5px}
  .hm-badge{font-size:.72rem;font-weight:700;color:var(--c);background:color-mix(in srgb,var(--c) 12%,var(--white));padding:4px 10px;border-radius:999px;white-space:nowrap}
  .hm-away{font-size:.72rem;color:var(--ink-soft)} .hm-away.on{color:var(--teal);font-weight:700}
  .hm-ops{display:flex;gap:4px} .hm-ic{border:0;background:var(--cream);width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:.9rem} .hm-ic:hover{background:var(--border)} .hm-ic.del:hover{background:rgba(209,16,115,.14)}
  .hm-empty{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;padding:36px 12px;color:var(--ink-soft)} .hm-empty span{font-size:2rem} .hm-empty b{color:var(--navy)}
  .hm-modal{position:fixed;inset:0;background:rgba(22,16,51,.5);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px}
  .hm-dlg{background:var(--white);border-radius:20px;padding:20px;width:100%;max-width:560px;max-height:90vh;overflow:auto;box-shadow:var(--shadow-hover)}
  .hm-dlg-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px} .hm-dlg-h b{font-size:1.05rem;color:var(--navy)} .hm-dlg .hm-form{grid-template-columns:1fr 1fr}
  @media(max-width:820px){.hm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.hm-form{grid-template-columns:1fr 1fr}.hm-f-name{grid-column:1/-1}.hm-row{grid-template-columns:48px minmax(0,1fr) auto}.hm-side{grid-column:2;grid-row:2;flex-direction:row;align-items:center;justify-content:flex-start;gap:10px}.hm-ops{grid-column:3;grid-row:1}}
  @media(max-width:480px){.hm-form{grid-template-columns:1fr}.hm-search{max-width:none;width:100%}}
  @media(prefers-reduced-motion:reduce){.hm-tchip span{transition:none}}`;
  document.head.appendChild(s);
  return '';
}
