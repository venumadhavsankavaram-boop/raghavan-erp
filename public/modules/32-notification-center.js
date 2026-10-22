/* ===== Notification Center + staff reminders =====
   Why this exists: reminders sent from Staff → Teacher Activity were saved on the server
   but no screen ever read them back, and phone push was only offered to students, parents
   and Admin/Principal — so teachers received nothing. This module gives EVERY login:
     - a bell (Account menu → Notifications) with an unread badge, a list, mark-read and
       click-through, polled every minute and when the tab regains focus;
     - for staff, a "My to-do" tab that works out their own pending marks sheets, class
       attendance and parent concerns directly — it does not depend on anyone sending a reminder;
     - an "Enable phone alerts" button (browsers require a click to ask permission).
   For Admin / Principal it adds, inside Teacher Activity: an honest delivery check (who has
   a login / push on / has opened alerts), reminders that cover marks + class attendance +
   parent concerns, and optional automatic daily reminders (sent at most once a day per
   teacher). Automatic reminders run when an Admin or Principal has the ERP open after the
   chosen time. */
(function(){
  const AUTO_KEY = 'teacher-alert-settings';
  const NC = { items:[], unread:0, todo:null, todoBusy:false, tab:'alerts', open:false, lastMaxId:0, firstLoad:true, pushState:'', reach:null, reachAt:0, todoAt:0 };
  const e = s => (typeof escapeHtml === 'function' ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  const isStaffRole = () => currentUser && !['Student','Parent'].includes(currentUser.role);
  const isMgr = () => currentUser && ['Admin','Principal'].includes(currentUser.role);
  function ago(d){
    const t = new Date(d); if(isNaN(t)) return '';
    const m = Math.round((Date.now() - t.getTime()) / 60000);
    if(m < 1) return 'just now'; if(m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if(h < 24) return h + ' h ago';
    const dd = Math.round(h / 24); if(dd < 7) return dd + ' d ago';
    return t.toLocaleDateString('en-IN', { day:'2-digit', month:'short' });
  }
  const ICON = { reminder:'⏰', fee_due:'💳', circular:'📢', homework:'📚', attendance:'🗓️', exam_schedule:'📝', approval:'✅', leave_decision:'🌴', results:'🎓' };

  /* ---------- styles + DOM ---------- */
  function ncCss(){
    if(document.getElementById('ncCss')) return;
    const st = document.createElement('style'); st.id = 'ncCss';
    st.textContent = `
      #sbChip{position:relative;}
      .nc-chip-badge{position:absolute; top:4px; left:38px; min-width:18px; height:18px; padding:0 5px; border-radius:9px; background:#e0245e; color:#fff; font-size:0.68rem; font-weight:700; display:none; align-items:center; justify-content:center; box-shadow:0 0 0 2px #1a1446;}
      .nc-chip-badge.show{display:flex;}
      #ncMenuBtn .approvals-bell-badge{display:none;} #ncMenuBtn.has .approvals-bell-badge{display:inline-flex;}
      .nc-panel{max-width:620px;} .nc-tabs{display:flex; gap:6px; border-bottom:1px solid #e3e6ee; margin:8px 0 10px;}
      .nc-tab{background:none; border:0; padding:8px 14px; font-weight:600; color:#667; cursor:pointer; border-bottom:3px solid transparent; font:inherit; font-weight:600;}
      .nc-tab.active{color:var(--navy,#14325c); border-bottom-color:var(--navy,#14325c);}
      .nc-tab .nc-n{display:inline-block; min-width:18px; padding:0 6px; margin-left:6px; border-radius:9px; background:#e0245e; color:#fff; font-size:0.7rem;}
      .nc-list{max-height:430px; overflow-y:auto;}
      .nc-item{display:flex; gap:10px; padding:11px 8px; border-bottom:1px solid #eef0f6; cursor:pointer; border-radius:6px;}
      .nc-item:hover{background:#f6f8fc;} .nc-item.unread{background:#f3f7ff;}
      .nc-item .nc-ic{font-size:1.25rem; width:28px; text-align:center;}
      .nc-item .nc-t{font-weight:600; color:var(--navy,#14325c); font-size:0.9rem;} .nc-item.unread .nc-t::after{content:''; display:inline-block; width:8px; height:8px; border-radius:50%; background:#e0245e; margin-left:8px;}
      .nc-item .nc-b{font-size:0.82rem; color:#445; margin-top:2px; line-height:1.4;} .nc-item .nc-w{font-size:0.72rem; color:#889; margin-top:3px;}
      .nc-foot{display:flex; gap:10px; align-items:center; justify-content:space-between; margin-top:12px; flex-wrap:wrap; font-size:0.78rem; color:#667;}
      .nc-todo{padding:11px 10px; border:1px solid #e3e8f3; border-radius:8px; margin-bottom:8px; display:flex; gap:10px; align-items:flex-start; justify-content:space-between;}
      .nc-todo.bad{border-left:4px solid #d93025;} .nc-todo.warn{border-left:4px solid #f0a000;} .nc-todo.ok{border-left:4px solid #1d9b4d;}
      .nc-todo b{color:var(--navy,#14325c);} .nc-sm{font-size:0.78rem; color:#667;}
      .nc-strip{display:flex; flex-wrap:wrap; gap:10px; align-items:center; background:#f6f8fc; border:1px solid #e3e8f3; border-radius:10px; padding:10px 14px; margin-bottom:12px; font-size:0.84rem;}
      .nc-strip .nc-sp{flex:1;} .nc-tbl{width:100%; border-collapse:collapse; font-size:0.82rem;} .nc-tbl th{background:#f3f5fa; text-align:left; padding:8px;} .nc-tbl td{padding:8px; border-top:1px solid #eef0f6;}
      .nc-pill{display:inline-block; font-size:0.7rem; padding:2px 8px; border-radius:10px; font-weight:600;} .nc-pill.ok{background:#e8f5ec; color:#1d6b35;} .nc-pill.warn{background:#fff4e0; color:#8a5a00;} .nc-pill.bad{background:#fdecea; color:#a02020;}
    `;
    document.head.appendChild(st);
  }
  function ncEnsureDom(){
    ncCss();
    const menu = document.getElementById('sbUserMenu');
    if(menu && !document.getElementById('ncMenuBtn')){
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'approvals-bell-btn'; b.id = 'ncMenuBtn';
      b.innerHTML = '<span class="approvals-bell-icon">📥</span><span class="sb-btn-label">Notifications</span><span class="approvals-bell-badge" id="ncMenuBadge">0</span>';
      b.onclick = () => { if(typeof closeSbUserMenu === 'function') closeSbUserMenu(); openNotificationCenter(); };
      menu.insertBefore(b, menu.firstChild);
    }
    const chip = document.getElementById('sbChip');
    if(chip && !document.getElementById('ncChipBadge')){
      const s = document.createElement('span'); s.className = 'nc-chip-badge'; s.id = 'ncChipBadge'; chip.appendChild(s);
    }
    if(!document.getElementById('ncOverlay')){
      const o = document.createElement('div'); o.className = 'modal-overlay'; o.id = 'ncOverlay';
      o.innerHTML = `<div class="modal nc-panel"><div class="modal-inner">
        <button class="modal-close" onclick="closeNotificationCenter()">&times;</button>
        <h2>Notifications</h2>
        <div class="nc-tabs" id="ncTabs"></div>
        <div id="ncBody"></div>
        <div class="nc-foot" id="ncFoot"></div>
      </div></div>`;
      document.body.appendChild(o);
      o.addEventListener('mousedown', ev => { if(ev.target === o) closeNotificationCenter(); });
    }
  }
  function ncBadge(){
    const todoN = (isStaffRole() && NC.todo) ? NC.todo.count : 0;
    const n = NC.unread + todoN;
    const chip = document.getElementById('ncChipBadge');
    if(chip){ chip.textContent = n > 99 ? '99+' : String(n); chip.classList.toggle('show', n > 0); chip.title = NC.unread + ' unread alert(s)' + (todoN ? ', ' + todoN + ' pending task(s)' : ''); }
    const mb = document.getElementById('ncMenuBtn'); if(mb) mb.classList.toggle('has', n > 0);
    const mbb = document.getElementById('ncMenuBadge'); if(mbb) mbb.textContent = n > 99 ? '99+' : String(n);
  }

  /* ---------- server feed ---------- */
  async function ncFetch(){
    if(!currentUser) return;
    try{
      const r = await fetch('/api/notifications');
      if(!r.ok) return;
      const rows = await r.json();
      NC.items = rows;
      NC.unread = rows.filter(x => !x.read).length;
      const maxId = rows.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
      const fresh = rows.filter(x => !x.read && (Number(x.id) || 0) > NC.lastMaxId);
      if(NC.firstLoad){
        if(NC.unread > 0 && typeof showToast === 'function') showToast('🔔 You have ' + NC.unread + ' unread alert' + (NC.unread === 1 ? '' : 's') + ' — open Notifications from your account menu.');
      }else if(fresh.length && !NC.open && typeof showToast === 'function'){
        showToast('🔔 ' + (fresh.length === 1 ? fresh[0].title : fresh.length + ' new alerts'));
      }
      NC.lastMaxId = Math.max(NC.lastMaxId, maxId); NC.firstLoad = false;
      ncBadge();
      if(NC.open && NC.tab === 'alerts') ncRender();
    }catch(_){}
  }
  window.openNotificationCenter = async function(tab){
    ncEnsureDom();
    NC.open = true; NC.tab = tab || (NC.unread || !isStaffRole() ? 'alerts' : (NC.todo && NC.todo.count ? 'todo' : 'alerts'));
    document.getElementById('ncOverlay').classList.add('open');
    ncRender();
    ncFetch();
    if(isStaffRole()) ncLoadTodo(true).then(() => { if(NC.open) ncRender(); });
    ncPushStatus().then(() => { if(NC.open) ncRenderFoot(); });
  };
  window.closeNotificationCenter = function(){ NC.open = false; const o = document.getElementById('ncOverlay'); if(o) o.classList.remove('open'); };
  window.ncSetTab = function(t){ NC.tab = t; ncRender(); };
  function ncRender(){
    const tabs = document.getElementById('ncTabs'); if(!tabs) return;
    const todoN = NC.todo ? NC.todo.count : 0;
    tabs.innerHTML = `<button class="nc-tab ${NC.tab==='alerts'?'active':''}" onclick="ncSetTab('alerts')">Alerts${NC.unread ? `<span class="nc-n">${NC.unread}</span>` : ''}</button>` +
      (isStaffRole() ? `<button class="nc-tab ${NC.tab==='todo'?'active':''}" onclick="ncSetTab('todo')">My to-do${todoN ? `<span class="nc-n">${todoN}</span>` : ''}</button>` : '');
    const body = document.getElementById('ncBody');
    body.innerHTML = NC.tab === 'todo' ? ncTodoHtml() : ncAlertsHtml();
    ncRenderFoot();
  }
  function ncAlertsHtml(){
    if(!NC.items.length) return '<div class="empty-state"><b>No alerts yet</b>Reminders, notices and approvals sent to you will appear here.</div>';
    return `<div class="nc-list">${NC.items.map(n => `
      <div class="nc-item ${n.read ? '' : 'unread'}" onclick="ncOpenItem(${Number(n.id)})">
        <div class="nc-ic">${ICON[n.type] || '🔔'}</div>
        <div><div class="nc-t">${e(n.title)}</div><div class="nc-b">${e(n.body)}</div><div class="nc-w">${ago(n.createdAt)}</div></div>
      </div>`).join('')}</div>`;
  }
  function ncRenderFoot(){
    const f = document.getElementById('ncFoot'); if(!f) return;
    const markAll = NC.tab === 'alerts' && NC.unread ? '<button class="btn btn-ghost btn-sm" onclick="ncMarkAll()">Mark all read</button>' : '<span></span>';
    let push = '';
    if(NC.pushState === 'on') push = '<span>📱 Phone alerts are on for this device</span>';
    else if(NC.pushState === 'off') push = '<button class="btn btn-primary btn-sm" onclick="ncEnablePush()">Enable phone alerts</button>';
    else if(NC.pushState === 'blocked') push = '<span>📱 Alerts are blocked in this browser — allow notifications for this site in the browser settings.</span>';
    else if(NC.pushState === 'unsupported') push = '<span>📱 This browser can\'t show phone alerts — alerts still appear here.</span>';
    else if(NC.pushState === 'unconfigured') push = '<span>📱 Phone push isn\'t set up on the server yet — alerts still appear here.</span>';
    f.innerHTML = markAll + push;
  }
  window.ncMarkAll = async function(){
    try{ await fetch('/api/notifications/mark-all-read', { method:'PUT', headers: actorHeaders() }); }catch(_){}
    NC.items.forEach(x => x.read = true); NC.unread = 0; ncBadge(); ncRender();
  };
  window.ncOpenItem = async function(id){
    const n = NC.items.find(x => Number(x.id) === id); if(!n) return;
    if(!n.read){ n.read = true; NC.unread = Math.max(0, NC.unread - 1); ncBadge(); ncRender(); try{ fetch('/api/notifications/' + id + '/read', { method:'PUT', headers: actorHeaders() }); }catch(_){} }
    let view = '';
    try{ const q = String(n.url || '').split('?')[1] || ''; view = new URLSearchParams(q).get('view') || ''; }catch(_){}
    if(view && typeof switchView === 'function'){ closeNotificationCenter(); try{ switchView(view); }catch(_){} }
  };

  /* ---------- phone push (needs a click to ask permission) ---------- */
  async function ncPushStatus(){
    try{
      if(!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined'){ NC.pushState = 'unsupported'; return; }
      const k = await fetch('/api/push/vapid-key');
      if(!k.ok){ NC.pushState = 'unconfigured'; return; }
      if(Notification.permission === 'denied'){ NC.pushState = 'blocked'; return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      NC.pushState = (sub && Notification.permission === 'granted') ? 'on' : 'off';
    }catch(_){ NC.pushState = ''; }
  }
  window.ncEnablePush = async function(){
    try{
      const k = await fetch('/api/push/vapid-key'); if(!k.ok){ NC.pushState = 'unconfigured'; ncRenderFoot(); return; }
      const { publicKey } = await k.json();
      const perm = await Notification.requestPermission();
      if(perm !== 'granted'){ NC.pushState = perm === 'denied' ? 'blocked' : 'off'; ncRenderFoot(); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await fetch('/api/push/subscribe', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(sub.toJSON()) });
      NC.pushState = 'on'; ncRenderFoot();
      if(typeof showToast === 'function') showToast('Phone alerts are on for this device.', 'burst');
    }catch(err){ if(typeof showToast === 'function') showToast('Could not turn on phone alerts (' + (err && err.message || 'error') + ').'); }
  };

  /* ---------- My to-do (staff) ---------- */
  function ncOwnStaff(){
    if(!currentUser || typeof staffList === 'undefined') return null;
    return staffList.find(s => s.linkedUserId === currentUser.id) || null;
  }
  async function ncLoadTodo(force){
    if(!isStaffRole() || NC.todoBusy) return;
    if(!force && Date.now() - NC.todoAt < 5 * 60000) return;
    NC.todoBusy = true;
    try{
      const st = ncOwnStaff();
      if(!st || typeof tacBuildModel !== 'function'){ NC.todo = { linked:false, count:0, items:[] }; return; }
      // A teacher's session doesn't pre-load every dataset the model reads — fetch what it needs.
      const need = [['students', typeof loadStudents === 'function' ? loadStudents : null], ['subjects', typeof loadSubjects === 'function' ? loadSubjects : null],
        ['exams', typeof loadExams === 'function' ? loadExams : null], ['attendance', typeof loadAttendance === 'function' ? loadAttendance : null],
        ['homework', typeof loadSyllabusHomework === 'function' ? loadSyllabusHomework : null]];
      await Promise.all(need.filter(x => x[1]).map(([k, fn]) => ensureDataLoaded('nc_' + k, fn).catch(() => null)));
      try{ await tacLoadData(); }catch(_){}
      const m = tacBuildModel();
      const tm = m.teachers.find(t => t.id === st.id);
      const items = []; if(tm){
        tm.pending.slice().sort((a, b) => b.overdue - a.overdue).forEach(t => items.push({ kind:'marks', tone: t.overdue > 0 ? 'bad' : 'warn', t }));
        if(tm.homeroom && ['none','partial'].includes(tm.homeroom.state)) items.push({ kind:'att', tone: tm.homeroom.state === 'none' ? 'bad' : 'warn', h: tm.homeroom });
        if(tm.pendSubs) items.push({ kind:'subs', tone:'warn', n: tm.pendSubs });
        if(tm.openCons) items.push({ kind:'cons', tone:'warn', n: tm.openCons });
      }
      NC.todo = { linked:true, count: items.length, items }; NC.todoAt = Date.now();
    }catch(err){ console.error('my to-do failed', err); NC.todo = { linked:true, count:0, items:[], error:true }; }
    finally{ NC.todoBusy = false; ncBadge(); }
  }
  function ncTodoHtml(){
    const td = NC.todo;
    if(!td) return '<div class="empty-state"><b>Checking your pending work…</b></div>';
    if(!td.linked) return '<div class="empty-state"><b>No staff profile linked</b>Ask the Admin to link your login to your staff record so your tasks can show here.</div>';
    if(td.error) return '<div class="empty-state"><b>Couldn\'t check right now</b>Please try again in a moment.</div>';
    if(!td.items.length) return '<div class="empty-state"><b>🎉 You\'re all caught up</b>No pending marks, attendance or replies.</div>';
    return td.items.map(it => {
      if(it.kind === 'marks'){
        const t = it.t;
        return `<div class="nc-todo ${it.tone}"><div><b>Enter marks — ${e(t.cls)} ${e(t.sec)} · ${e(t.subject)}</b><div class="nc-sm">${e(t.examName)} · ${t.entered}/${t.expected} entered${t.overdue > 0 ? ' · <span style="color:#b00020">' + t.overdue + ' day' + (t.overdue === 1 ? '' : 's') + ' overdue</span>' : t.dueToday ? ' · due today' : ''}</div></div><button class="btn btn-primary btn-sm" onclick="closeNotificationCenter(); tacOpenSheet('${String(t.examId).replace(/'/g, "\\'")}','${String(t.cls).replace(/'/g, "\\'")}','${String(t.sec).replace(/'/g, "\\'")}')">Open</button></div>`;
      }
      if(it.kind === 'att') return `<div class="nc-todo ${it.tone}"><div><b>Mark attendance — ${e(it.h.cls)} ${e(it.h.sec)}</b><div class="nc-sm">${e(tacHrSummary(it.h))}</div></div><button class="btn btn-primary btn-sm" onclick="closeNotificationCenter(); switchView('attendance')">Open</button></div>`;
      if(it.kind === 'subs') return `<div class="nc-todo warn"><div><b>${it.n} student submission${it.n === 1 ? '' : 's'} to review</b></div><button class="btn btn-primary btn-sm" onclick="closeNotificationCenter(); switchView('inbox')">Open</button></div>`;
      return `<div class="nc-todo warn"><div><b>${it.n} parent concern${it.n === 1 ? '' : 's'} awaiting your reply</b></div><button class="btn btn-primary btn-sm" onclick="closeNotificationCenter(); switchView('inbox')">Open</button></div>`;
    }).join('');
  }

  /* ---------- reminders: digest text (marks + attendance + concerns) ---------- */
  function ncDigest(tm){
    const parts = [];
    if(tm.pending && tm.pending.length){
      const items = tm.pending.slice().sort((a, b) => b.overdue - a.overdue).map(t => `${t.cls} ${t.sec} – ${t.subject} (${t.examName}, ${t.entered}/${t.expected})`);
      parts.push(`Marks entry pending for ${items.length} sheet${items.length === 1 ? '' : 's'}: ` + items.join('; '));
    }
    if(tm.homeroom && ['none','partial'].includes(tm.homeroom.state)) parts.push(`Attendance not completed for ${tm.homeroom.cls} ${tm.homeroom.sec} (${tacHrSummary(tm.homeroom)})`);
    if(tm.pendSubs) parts.push(`${tm.pendSubs} student submission${tm.pendSubs === 1 ? '' : 's'} awaiting review`);
    if(tm.openCons) parts.push(`${tm.openCons} parent concern${tm.openCons === 1 ? '' : 's'} awaiting reply`);
    if(!parts.length) return null;
    let body = parts.join('. ');
    if(body.length > 380) body = body.slice(0, 377) + '…';
    const onlyMarks = parts.length === 1 && tm.pending && tm.pending.length;
    return { title: onlyMarks ? 'Marks entry pending' : 'Pending work reminder', body: body + '. Please complete it today.', count: parts.length };
  }
  window.tacReminderText = function(tm){ const d = ncDigest(tm); return d ? d.body : 'Please check your pending work in the ERP.'; };
  async function ncReach(force){
    if(!force && NC.reach && Date.now() - NC.reachAt < 60000) return NC.reach;
    try{
      const r = await fetch('/api/notifications/reach'); if(!r.ok) return NC.reach;
      const j = await r.json(); NC.reach = { pushConfigured: j.pushConfigured, byStaff: Object.fromEntries(j.staff.map(x => [x.staffId, x])) }; NC.reachAt = Date.now();
    }catch(_){}
    return NC.reach;
  }
  function reachOf(reach, staffId){ return reach && reach.byStaff[staffId] || null; }
  async function ncSend(staffId, d, dedupeKey){
    const r = await fetch('/api/notifications/broadcast', {
      method:'POST', headers: Object.assign({ 'Content-Type':'application/json' }, actorHeaders()),
      body: JSON.stringify({ title: d.title, body: d.body, type:'reminder', url:'/?view=exams', staffIds:[staffId], push:true, dedupeKey: dedupeKey || undefined }),
    });
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  // Override the older single / bulk reminder actions with delivery-aware ones.
  window.tacRemind = async function(staffId){
    const tm = tacModel && tacModel.teachers.find(t => t.id === staffId); if(!tm) return;
    const d = ncDigest(tm); if(!d){ showToast(tm.name + ' has nothing pending.'); return; }
    const reach = await ncReach(true), rc = reachOf(reach, staffId);
    if(!tm.staff.linkedUserId || (rc && !rc.hasLogin)){ showToast(tm.name + ' has no app login linked, so an app alert cannot reach them — use the WhatsApp button instead.'); return; }
    const note = rc && !rc.pushDevices ? '\n\nNote: they have not turned on phone alerts yet, so they will see this in the app\'s Notifications when they next open it.' : '';
    const ok = await showConfirmDialog(`Send a reminder to ${tm.name}?\n\n${d.body}${note}`, { title:'Send reminder', okText:'Send reminder' });
    if(!ok) return;
    try{
      const res = await ncSend(staffId, d);
      showToast(res && res.notified ? `Reminder sent to ${tm.name}.` : `${tm.name} could not be notified.`);
      NC.reachAt = 0;
    }catch(_){ showToast('Could not send the reminder. Check your connection and try again.'); }
  };
  window.tacRemindAll = async function(){
    if(!tacModel) return;
    const list = tacVisibleTeachers().filter(t => ncDigest(t));
    if(!list.length){ showToast('No teachers with pending work in this view.'); return; }
    const reach = await ncReach(true);
    const can = list.filter(t => t.staff.linkedUserId && (!reach || (reachOf(reach, t.id) || {}).hasLogin !== false));
    const noPush = can.filter(t => reach && !(reachOf(reach, t.id) || {}).pushDevices).length;
    const ok = await showConfirmDialog(`Send a reminder to ${can.length} teacher(s) with pending work?` + (list.length > can.length ? `\n\n${list.length - can.length} have no app login linked and will be skipped (use WhatsApp for them).` : '') + (noPush ? `\n\n${noPush} have not turned on phone alerts — they'll see it in Notifications when they open the app.` : ''), { title:'Remind all', okText:'Send' });
    if(!ok) return;
    let sent = 0, failed = 0;
    for(const t of can){ try{ const res = await ncSend(t.id, ncDigest(t)); if(res && res.notified) sent++; else failed++; }catch(_){ failed++; } }
    NC.reachAt = 0;
    showToast(`Reminders sent to ${sent} teacher(s)` + (failed ? `, ${failed} could not be delivered.` : '.') + (list.length > can.length ? ` ${list.length - can.length} skipped (no login).` : ''));
  };

  /* ---------- Teacher Activity: delivery strip, delivery table, auto reminders ---------- */
  async function ncAutoSettings(){
    let s = {};
    try{ s = (await storageGet(AUTO_KEY, {})) || {}; }catch(_){}
    return Object.assign({ auto:false, time:'09:30', lastRun:null }, s);
  }
  async function ncDecorateTac(){
    const root = document.getElementById('stfActivityBody'); if(!root || !isMgr()) return;
    const [reach, set] = await Promise.all([ncReach(false), ncAutoSettings()]);
    if(document.getElementById('ncStrip')) document.getElementById('ncStrip').remove();
    const teachers = (tacModel && tacModel.teachers) || [];
    const noLogin = reach ? teachers.filter(t => !(reachOf(reach, t.id) || {}).hasLogin).length : null;
    const noPush = reach ? teachers.filter(t => (reachOf(reach, t.id) || {}).hasLogin && !(reachOf(reach, t.id) || {}).pushDevices).length : null;
    const strip = document.createElement('div'); strip.className = 'nc-strip'; strip.id = 'ncStrip';
    strip.innerHTML = `<span>🔔 <b>Alert delivery:</b> ${reach ? `${teachers.length - noLogin} of ${teachers.length} teachers can receive app alerts` + (noLogin ? ` · <span class="nc-pill bad">${noLogin} no login linked</span>` : '') + (noPush ? ` · <span class="nc-pill warn">${noPush} phone alerts off</span>` : '') : 'checking…'}</span>
      <button class="btn btn-ghost btn-sm" onclick="ncOpenReach()">Who can receive?</button><span class="nc-sp"></span>
      <span>⚙ Auto reminders: <b>${set.auto ? 'On · ' + e(set.time) : 'Off'}</b>${set.lastRun ? ` <span class="nc-sm">(last: ${e(set.lastRun.date)}, ${set.lastRun.sent} sent)</span>` : ''}</span>
      <button class="btn btn-ghost btn-sm" onclick="ncOpenAutoSettings()">Set up</button>`;
    root.insertBefore(strip, root.firstChild);
  }
  const _tacRender = window.tacRender || (typeof tacRender === 'function' ? tacRender : null);
  if(_tacRender){ window.tacRender = function(){ const r = _tacRender.apply(this, arguments); try{ ncDecorateTac(); }catch(_){} return r; }; }
  function ncModal(title, html){
    let o = document.getElementById('ncModal2');
    if(!o){ o = document.createElement('div'); o.className = 'modal-overlay'; o.id = 'ncModal2'; document.body.appendChild(o); o.addEventListener('mousedown', ev => { if(ev.target === o) o.classList.remove('open'); }); }
    o.innerHTML = `<div class="modal nc-panel"><div class="modal-inner"><button class="modal-close" onclick="document.getElementById('ncModal2').classList.remove('open')">&times;</button><h2>${e(title)}</h2>${html}</div></div>`;
    o.classList.add('open');
  }
  window.ncOpenReach = async function(){
    const reach = await ncReach(true); const teachers = (tacModel && tacModel.teachers) || [];
    if(!reach){ showToast('Could not load delivery status.'); return; }
    const rows = teachers.map(t => { const r = reachOf(reach, t.id) || {};
      return `<tr><td><b>${e(t.name)}</b></td><td>${r.hasLogin ? '<span class="nc-pill ok">Linked</span>' : '<span class="nc-pill bad">No login</span>'}</td><td>${!r.hasLogin ? '—' : r.pushDevices ? '<span class="nc-pill ok">On (' + r.pushDevices + ')</span>' : '<span class="nc-pill warn">Off</span>'}</td><td>${r.unread || 0}</td><td>${r.lastRead ? ago(r.lastRead) : '<span class="nc-sm">never</span>'}</td></tr>`; }).join('');
    ncModal('Who can receive alerts', `<p class="nc-sm" style="margin:0 0 10px;">A teacher with a linked login always gets in-app alerts (Account menu → Notifications). Phone alerts also need them to tap “Enable phone alerts” there once${reach.pushConfigured ? '' : ' — <b>and push is not yet configured on the server</b>'}. Teachers with no login linked can only be reached by WhatsApp: link their login in Staff → edit.</p><div style="max-height:380px; overflow:auto;"><table class="nc-tbl"><thead><tr><th>Teacher</th><th>App login</th><th>Phone alerts</th><th>Unread</th><th>Last opened</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  };
  window.ncOpenAutoSettings = async function(){
    const s = await ncAutoSettings();
    ncModal('Automatic reminders', `
      <p class="nc-sm" style="margin:0 0 12px;">Once a day, every teacher with something pending gets one reminder covering: marks not entered, class attendance not marked, and parent concerns / student submissions waiting. Nothing is sent on holidays, and a teacher never gets more than one automatic reminder per day.</p>
      <label style="display:flex; gap:8px; align-items:center; margin-bottom:10px;"><input type="checkbox" id="ncAutoOn" ${s.auto ? 'checked' : ''}> <b>Send automatic daily reminders</b></label>
      <label style="display:block; margin-bottom:10px;">Send after <input type="time" id="ncAutoTime" value="${e(s.time)}" class="input" style="width:130px;"></label>
      <p class="nc-sm" style="margin:0 0 14px;">Runs when an Admin or Principal has the ERP open after this time (an open browser tab is enough).</p>
      <div style="display:flex; gap:10px;"><button class="btn btn-primary" onclick="ncSaveAuto()">Save</button><button class="btn btn-ghost" onclick="document.getElementById('ncModal2').classList.remove('open'); tacRemindAll()">Send reminders now</button></div>`);
  };
  window.ncSaveAuto = async function(){
    const s = await ncAutoSettings();
    s.auto = !!document.getElementById('ncAutoOn').checked; s.time = document.getElementById('ncAutoTime').value || '09:30';
    try{ await storageSet(AUTO_KEY, s); showToast('Automatic reminders ' + (s.auto ? 'turned on.' : 'turned off.'), 'burst'); }catch(_){ showToast('Could not save.'); }
    document.getElementById('ncModal2').classList.remove('open'); ncDecorateTac();
  };
  let autoBusy = false;
  async function ncAutoRun(){
    if(autoBusy || !isMgr()) return;
    const s = await ncAutoSettings(); if(!s.auto) return;
    const now = new Date(), [hh, mm] = String(s.time || '09:30').split(':').map(Number);
    if(now.getHours() * 60 + now.getMinutes() < hh * 60 + (mm || 0)) return;
    const today = (typeof localDateStr === 'function') ? localDateStr(now) : now.toISOString().slice(0, 10);
    if(s.lastRun && s.lastRun.date === today) return;
    autoBusy = true;
    try{
      await tacLoadData();
      const m = tacBuildModel();
      if(m.isHoliday) return;
      let sent = 0;
      for(const t of m.teachers){
        if(!t.staff.linkedUserId) continue;
        const d = ncDigest(t); if(!d) continue;
        try{ const res = await ncSend(t.id, d, 'auto-' + today); if(res && res.notified) sent++; }catch(_){}
      }
      s.lastRun = { date: today, sent }; await storageSet(AUTO_KEY, s);
    }catch(err){ console.error('auto reminders failed', err); }
    finally{ autoBusy = false; }
  }

  window.ncAutoRun = ncAutoRun;

  /* ---------- lifecycle ---------- */
  let tickN = 0;
  async function ncTick(){
    if(!currentUser || document.hidden) return;
    ncEnsureDom();
    await ncFetch();
    if(isStaffRole()){ await ncLoadTodo(false); }
    if(isMgr() && tickN % 5 === 0) ncAutoRun();
    tickN++;
  }
  document.addEventListener('visibilitychange', () => { if(!document.hidden) ncTick(); });
  setTimeout(ncTick, 4000);
  setInterval(ncTick, 60000);
})();
