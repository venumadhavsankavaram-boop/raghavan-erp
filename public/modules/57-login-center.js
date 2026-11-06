/* =========================================================================
   Student/Parent Logins — rebuilt as a proper "login centre" (Admin only).
   One tidy page with four tabs:
     🔎 Find & log in as   – every student in one list (class / section / login-status filters + search by name,
                             admission no., username or phone). Each row: Log in as · Reset password · Fix login,
                             or Create login when the family has none yet.
     ➕ Create logins       – make parent logins for a whole class and print the slips.
     👨‍👩‍👧 Siblings           – put two or more children under one parent login.
     📊 Adoption & alerts   – who has signed in, installed the app, turned notifications on.
   It reuses the existing create / slips / sibling / adoption tools and the same View-as, Reset and Fix actions,
   so nothing about how logins work changes — only how the page is organised.
   ========================================================================= */
(function(){
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const nm = s => ((s.lastName || '') + ' ' + (s.firstName || '')).trim();
  const num = v => { const m = String(v).match(/\d+/); return m ? parseInt(m[0], 10) : 999; };
  const PAGE = 30;
  const F = { q: '', cls: '', sec: '', st: 'all', page: 1, tab: 'find' };
  try{ const t = sessionStorage.getItem('lcTab'); if(t) F.tab = t; }catch(e){}
  let info = null, infoAt = 0, loading = false;

  const active = () => (typeof students !== 'undefined' ? students : []).filter(s => typeof isActive === 'function' ? isActive(s) : true);
  const logins = () => (typeof users !== 'undefined' ? users : []).filter(u => u.role === 'Student' || u.role === 'Parent');

  function css(){
    if(document.getElementById('lcCss')) return;
    const s = document.createElement('style'); s.id = 'lcCss';
    s.textContent = `
      #lc .lc-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;}
      #lc .lc-stat{background:#fff;border:1px solid #e3e8f3;border-radius:16px;padding:14px 16px;box-shadow:0 2px 10px rgba(30,40,80,.05);}
      #lc .lc-stat b{display:block;font-size:1.7rem;color:#14325c;line-height:1.1;} #lc .lc-stat span{font-size:.78rem;color:#667;font-weight:600;}
      #lc .lc-stat.ok b{color:#1d9b4d;} #lc .lc-stat.warn b{color:#c47a00;}
      #lc .lc-tabs{display:flex;gap:6px;overflow-x:auto;padding:4px;background:#eef1f8;border-radius:16px;margin-bottom:16px;-webkit-overflow-scrolling:touch;}
      #lc .lc-tab{flex:1 0 auto;border:0;background:transparent;border-radius:12px;padding:11px 16px;font:inherit;font-weight:700;font-size:.9rem;color:#52607a;cursor:pointer;white-space:nowrap;}
      #lc .lc-tab.on{background:#fff;color:#2f3cc6;box-shadow:0 2px 8px rgba(30,40,80,.12);}
      #lc .lc-bar{background:#fff;border:1px solid #dde3ee;border-radius:16px;padding:14px;margin-bottom:14px;box-shadow:0 2px 10px rgba(30,40,80,.05);}
      #lc .lc-search{position:relative;margin-bottom:12px;}
      #lc .lc-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;color:#7a86a3;pointer-events:none;}
      #lc .lc-search input{width:100%;box-sizing:border-box;height:48px;border:1.5px solid #cfd7e6;border-radius:999px;padding:0 44px 0 42px;font-size:15px;background:#f7f9fd;outline:none;}
      #lc .lc-search input:focus{border-color:#4f46e5;background:#fff;box-shadow:0 0 0 4px rgba(79,70,229,.12);}
      #lc .lc-x{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:0;background:#e8ecf5;color:#33405c;cursor:pointer;font-size:16px;display:none;}
      #lc .lc-fl{font-size:.7rem;font-weight:800;color:#5b6784;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 6px;}
      #lc .lc-chips{display:flex;gap:6px;flex-wrap:wrap;}
      #lc .lc-chip{border:1.5px solid #d6dcea;background:#fff;border-radius:999px;padding:6px 13px;font:inherit;font-size:.82rem;font-weight:600;color:#33405c;cursor:pointer;}
      #lc .lc-chip.on{background:#2f3cc6;border-color:#2f3cc6;color:#fff;}
      #lc .lc-list{background:#fff;border:1px solid #e3e8f3;border-radius:16px;overflow:hidden;}
      #lc .lc-row{display:grid;grid-template-columns:minmax(180px,1.6fr) 110px minmax(140px,1.2fr) 150px 330px;gap:12px;align-items:center;padding:12px 16px;border-top:1px solid #eef1f7;}
      #lc .lc-row.head{background:#f6f8fd;font-size:.72rem;font-weight:800;color:#5b6784;text-transform:uppercase;letter-spacing:.04em;border-top:0;}
      #lc .lc-name{font-weight:700;color:#14325c;} #lc .lc-sub{font-size:.76rem;color:#667;}
      #lc .lc-badge{display:inline-block;border-radius:999px;padding:3px 10px;font-size:.72rem;font-weight:700;}
      #lc .lc-badge.on{background:#e3f6ea;color:#14753a;} #lc .lc-badge.new{background:#fff3d6;color:#8a5a00;} #lc .lc-badge.none{background:#fde6e4;color:#a1281f;}
      #lc .lc-act{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;}
      #lc .lc-btn{border:1.5px solid #cfd7e6;background:#fff;border-radius:10px;padding:7px 11px;font:inherit;font-size:.8rem;font-weight:700;color:#33405c;cursor:pointer;}
      #lc .lc-btn.pri{background:#2f3cc6;border-color:#2f3cc6;color:#fff;} #lc .lc-btn.go{background:#c2185b;border-color:#c2185b;color:#fff;}
      #lc .lc-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid #eef1f7;font-size:.82rem;color:#4a5878;}
      #lc .lc-pg{display:flex;gap:6px;}
      #lc .lc-panel{background:transparent;}
      @media (max-width:820px){
        #lc .lc-row.head{display:none;}
        #lc .lc-row{grid-template-columns:1fr auto;gap:6px 10px;padding:14px;}
        #lc .lc-row .c-class,#lc .lc-row .c-login{grid-column:1/2;font-size:.82rem;color:#4a5878;}
        #lc .lc-row .c-stat{grid-column:2/3;grid-row:1/2;justify-self:end;}
        #lc .lc-row .lc-act{grid-column:1/3;justify-content:flex-start;}
        #lc .lc-btn{padding:9px 12px;}
        #lc .lc-stats{grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;}
        #lc .lc-stat{padding:10px 8px;border-radius:14px;text-align:center;} #lc .lc-stat b{font-size:1.25rem;} #lc .lc-stat span{font-size:.62rem;line-height:1.2;display:block;}
        #lc .lc-chips{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;} #lc .lc-chip{flex:0 0 auto;}
        #lc .lc-bar{padding:12px;} #lc .lc-fl{margin:6px 0 4px;} #lc .lc-search input{height:44px;font-size:14px;}
        #lc .lc-tab{padding:10px 12px;font-size:.82rem;}
      }
    `;
    document.head.appendChild(s);
  }

  async function loadInfo(force){
    if(loading) return; if(!force && info && Date.now() - infoAt < 20000) return;
    loading = true;
    try{
      const r = await fetch('/api/student-logins/adoption', { credentials: 'same-origin' });
      if(r.ok){ const j = await r.json(); info = new Map((j.students || []).map(x => [x.studentId, x])); infoAt = Date.now(); }
    }catch(e){}
    loading = false;
  }
  const userByName = uname => logins().find(u => String(u.username || '').toLowerCase() === String(uname || '').toLowerCase());
  const classes = () => Array.from(new Set(active().map(s => s.className).filter(Boolean))).sort((a, b) => num(a) - num(b) || String(a).localeCompare(String(b)));
  const sections = () => Array.from(new Set(active().filter(s => !F.cls || s.className === F.cls).map(s => s.section).filter(Boolean))).sort();
  const phones = s => [s.fatherPhone, s.motherPhone, s.guardianPhone, s.phone].filter(Boolean).join(' ');

  function rowsData(){
    const q = F.q.trim().toLowerCase().replace(/\s+/g, ' ');
    return active().map(s => {
      const i = info ? info.get(s.id) : null;
      const u = i && i.username ? userByName(i.username) : logins().find(x => x.linkedStudentId === s.id);
      const has = !!(i ? i.hasLogin : u);
      const username = (i && i.username) || (u && u.username) || '';
      return { s, i, u, has, username, signed: !!(i && i.signedIn) };
    }).filter(r => {
      if(F.cls && r.s.className !== F.cls) return false;
      if(F.sec && r.s.section !== F.sec) return false;
      if(F.st === 'has' && !r.has) return false;
      if(F.st === 'none' && r.has) return false;
      if(F.st === 'never' && !(r.has && !r.signed)) return false;
      if(q){
        const hay = (nm(r.s) + ' ' + (r.s.firstName || '') + ' ' + (r.s.firstName || '') + ' ' + (r.s.lastName || '') + ' ' + (r.s.admissionNo || '') + ' ' + r.username + ' ' + phones(r.s) + ' ' + (r.s.fatherName || '') + ' ' + (r.s.motherName || '')).toLowerCase();
        if(!q.split(' ').every(t => hay.includes(t))) return false;
      }
      return true;
    }).sort((a, b) => num(a.s.className) - num(b.s.className) || String(a.s.className).localeCompare(String(b.s.className)) || String(a.s.section || '').localeCompare(String(b.s.section || '')) || nm(a.s).localeCompare(nm(b.s)));
  }
  const when = iso => { if(!iso) return ''; const d = new Date(iso); if(isNaN(d)) return ''; return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

  function statusBadge(r){
    if(!r.has) return '<span class="lc-badge none">No login</span>';
    if(r.i && !r.signed) return '<span class="lc-badge new">Not signed in yet</span>';
    return '<span class="lc-badge on">Active' + (r.i && r.i.lastSeen ? ' · ' + esc(when(r.i.lastSeen)) : '') + '</span>';
  }
  function rowHtml(r){
    const s = r.s, cs = esc(s.className || '') + (s.section ? ' – ' + esc(s.section) : '');
    const extra = r.i ? ((r.i.installed ? ' 📲' : '') + (r.i.notifications ? ' 🔔' : '')) : '';
    const acts = r.has && r.u
      ? `<button class="lc-btn go" onclick="lcViewAs('${esc(r.u.id)}')">👁 Log in as</button><button class="lc-btn" onclick="adminResetPassword('${esc(r.u.id)}')">Reset password</button><button class="lc-btn" onclick="editUser('${esc(r.u.id)}')">Fix login</button>`
      : r.has ? `<span class="lc-sub">Login on a sibling's account</span>`
      : `<button class="lc-btn pri" onclick="lcCreate('${esc(s.id)}')">+ Create login</button>`;
    return `<div class="lc-row"><div><div class="lc-name">${esc(nm(s))}</div><div class="lc-sub">Adm ${esc(s.admissionNo || '—')}${s.fatherName ? ' · ' + esc(s.fatherName) : ''}</div></div>
      <div class="c-class">${cs}</div><div class="c-login">${r.username ? '<b>' + esc(r.username) + '</b>' + extra : '<span class="lc-sub">—</span>'}</div><div class="c-stat">${statusBadge(r)}</div><div class="lc-act">${acts}</div></div>`;
  }

  function paintList(){
    const box = document.getElementById('lcList'); if(!box) return;
    const all = rowsData(), pages = Math.max(1, Math.ceil(all.length / PAGE));
    if(F.page > pages) F.page = pages; if(F.page < 1) F.page = 1;
    const slice = all.slice((F.page - 1) * PAGE, F.page * PAGE);
    box.innerHTML = `<div class="lc-row head"><div>Student</div><div>Class</div><div>Username</div><div>Status</div><div></div></div>` +
      (slice.length ? slice.map(rowHtml).join('') : `<div class="empty-state" style="padding:30px;"><b>No students match</b>Try a different name or clear the filters.</div>`) +
      `<div class="lc-foot"><span>${all.length ? `Showing ${(F.page - 1) * PAGE + 1}–${Math.min(all.length, F.page * PAGE)} of ${all.length}` : '0 students'}</span>
        <span class="lc-pg"><button class="lc-btn" ${F.page <= 1 ? 'disabled' : ''} onclick="lcPage(-1)">← Previous</button><button class="lc-btn" ${F.page >= pages ? 'disabled' : ''} onclick="lcPage(1)">Next →</button></span></div>`;
    const x = document.getElementById('lcX'); if(x) x.style.display = F.q ? 'block' : 'none';
    const st = document.getElementById('lcStats'); if(st) st.innerHTML = statsHtml();
  }
  function statsHtml(){
    const a = active(); const has = a.filter(s => { const i = info && info.get(s.id); return i ? i.hasLogin : logins().some(u => u.linkedStudentId === s.id); }).length;
    const signed = info ? a.filter(s => { const i = info.get(s.id); return i && i.signedIn; }).length : null;
    return `<div class="lc-stat"><b>${a.length}</b><span>Active students</span></div><div class="lc-stat ok"><b>${has}</b><span>With a login</span></div>
      <div class="lc-stat warn"><b>${a.length - has}</b><span>Without a login</span></div>${signed == null ? '' : `<div class="lc-stat ok"><b>${signed}</b><span>Have signed in</span></div>`}`;
  }
  function chipRow(list, cur, fn, allLabel){
    return `<div class="lc-chips"><button class="lc-chip ${cur === '' ? 'on' : ''}" onclick="${fn}('')">${allLabel}</button>` + list.map(v => `<button class="lc-chip ${cur === v ? 'on' : ''}" onclick="${fn}('${esc(v).replace(/'/g, "\\'")}')">${esc(v)}</button>`).join('') + '</div>';
  }
  function findHtml(){
    return `<div class="lc-bar"><div class="lc-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input id="lcQ" type="text" autocomplete="off" placeholder="Search name, adm no., username or phone" value="${esc(F.q)}" oninput="lcSearch(this.value)">
        <button class="lc-x" id="lcX" onclick="lcSearch('');document.getElementById('lcQ').value='';document.getElementById('lcQ').focus()">×</button></div>
      <div class="lc-fl">Class</div><div id="lcCls">${chipRow(classes(), F.cls, 'lcSetCls', 'All')}</div>
      <div class="lc-fl">Section</div><div id="lcSec">${chipRow(sections(), F.sec, 'lcSetSec', 'All')}</div>
      <div class="lc-fl">Login</div><div class="lc-chips">${[['all', 'All'], ['has', 'Has a login'], ['none', 'No login yet'], ['never', 'Never signed in']].map(a => `<button class="lc-chip ${F.st === a[0] ? 'on' : ''}" onclick="lcSetSt('${a[0]}')">${a[1]}</button>`).join('')}</div></div>
      <div class="urx-resetreqs"></div><div class="lc-list" id="lcList"></div>`;
  }

  /* ---------- reuse the existing create / siblings / adoption tools ---------- */
  function card(){ return document.getElementById('blkCard'); }
  function applyMode(){
    const c = card(), panel = document.getElementById('lcToolHost'); if(!c || !panel) return;
    if(c.parentNode !== panel) panel.appendChild(c);
    const kids = Array.from(c.children), out = c.querySelector('#blkOut');
    const btnRows = c.querySelectorAll('.blk-btns');
    const create = F.tab === 'create';
    kids.forEach(k => { if(k === out) return; k.style.display = ''; });
    if(create){
      if(btnRows[1]) btnRows[1].style.display = 'none';
    }else{
      kids.forEach(k => { if(k !== out) k.style.display = 'none'; });
      if(btnRows[1]){ btnRows[1].style.display = 'flex'; ['blkSib', 'blkAdopt', 'blkNotif'].forEach(id => { const b = c.querySelector('#' + id); if(b) b.style.display = (F.tab === 'sib' ? id === 'blkSib' : id !== 'blkSib') ? '' : 'none'; }); }
      if(F.tab === 'sib' && btnRows[1]) btnRows[1].style.display = 'none';
    }
    const h = c.querySelector('h3'); if(h && create) h.style.display = '';
  }
  function autoOpen(){
    const c = card(); if(!c) return;
    const id = F.tab === 'sib' ? 'blkSib' : F.tab === 'adopt' ? 'blkAdopt' : '';
    const out = c.querySelector('#blkOut'); if(out) out.innerHTML = '';
    if(id){ const b = c.querySelector('#' + id); if(b) setTimeout(() => b.click(), 30); }
  }

  const TABS = [['find', '🔎 Find & log in as'], ['create', '➕ Create logins'], ['sib', '👨‍👩‍👧 Siblings'], ['adopt', '📊 Adoption & alerts']];
  function draw(body){
    css();
    body.innerHTML = `<div id="lc"><div class="lc-stats" id="lcStats">${statsHtml()}</div>
      <div class="lc-tabs">${TABS.map(t => `<button class="lc-tab ${F.tab === t[0] ? 'on' : ''}" onclick="lcTab('${t[0]}')">${t[1]}</button>`).join('')}</div>
      <div class="lc-panel" id="lcFind" style="display:${F.tab === 'find' ? 'block' : 'none'}">${findHtml()}</div>
      <div class="lc-panel" id="lcToolHost" style="display:${F.tab === 'find' ? 'none' : 'block'}"></div></div>`;
    paintList();
    if(F.tab !== 'find'){ applyMode(); }
    if(typeof urxLoadResetRequests === 'function') urxLoadResetRequests();
    loadInfo(true).then(paintList);
    // the create/siblings/adoption card is mounted by another module a moment later: keep it inside its tab
    let n = 0; const iv = setInterval(() => { n++; const c = card(), h = document.getElementById('lcToolHost'); if(c && h && c.parentNode !== h){ applyMode(); if(F.tab !== 'find' && F.tab !== 'create') autoOpen(); } if(n > 12 || !h) clearInterval(iv); }, 300);
  }
  window.lcRefreshStats = async function(){ try{ await loadInfo(true); const el = document.getElementById('lcStats'); if(el) el.innerHTML = statsHtml(); }catch(e){} };
  window.lcTab = function(t){
    F.tab = t; try{ sessionStorage.setItem('lcTab', t); }catch(e){}
    document.querySelectorAll('#lc .lc-tab').forEach((b, i) => b.classList.toggle('on', TABS[i][0] === t));
    const find = document.getElementById('lcFind'), host = document.getElementById('lcToolHost');
    if(find) find.style.display = t === 'find' ? 'block' : 'none'; if(host) host.style.display = t === 'find' ? 'none' : 'block';
    if(t === 'find'){ loadInfo(true).then(paintList); paintList(); }
    else { applyMode(); autoOpen(); }
  };
  window.lcSearch = v => { F.q = v; F.page = 1; paintList(); };
  window.lcSetCls = v => { F.cls = v; if(F.sec && !sections().includes(F.sec)) F.sec = ''; F.page = 1; const a = document.getElementById('lcCls'), b = document.getElementById('lcSec'); if(a) a.innerHTML = chipRow(classes(), F.cls, 'lcSetCls', 'All'); if(b) b.innerHTML = chipRow(sections(), F.sec, 'lcSetSec', 'All'); paintList(); };
  window.lcSetSec = v => { F.sec = v; F.page = 1; const b = document.getElementById('lcSec'); if(b) b.innerHTML = chipRow(sections(), F.sec, 'lcSetSec', 'All'); paintList(); };
  window.lcSetSt = v => { F.st = v; F.page = 1; const f = document.getElementById('lcFind'); if(f){ const keep = document.getElementById('lcQ'); const val = keep ? keep.value : ''; f.innerHTML = findHtml(); const q = document.getElementById('lcQ'); if(q) q.value = val; } paintList(); if(typeof urxLoadResetRequests === 'function') urxLoadResetRequests(); };
  window.lcPage = d => { F.page += d; paintList(); const l = document.getElementById('lcList'); if(l) l.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  window.lcViewAs = id => { try{ adminViewAs(id); }catch(e){ console.error(e); } };
  window.lcCreate = sid => { const s = active().find(x => x.id === sid); if(s) openUserModal(nm(s), 'Student', s.id, 'studentparent'); };

  // take over the page (the old stacked layout stays in the code but is no longer drawn)
  window.renderStudentParentLoginsView = function(body){
    if(!body) return;
    const topP = document.querySelector('#view-studentparentlogins .topbar p');
    if(topP) topP.textContent = 'Find any student, log in as them to help, reset a password, create logins and track who is using the app.';
    draw(body);
  };
  // after a login is created / fixed / reset elsewhere on the page, refresh the list
  ['saveUser', 'adminResetPassword'].forEach(fn => {
    const o = window[fn]; if(typeof o !== 'function') return;
    window[fn] = async function(){ const r = await o.apply(this, arguments); try{ if(document.getElementById('lcList')){ await loadInfo(true); paintList(); } }catch(e){} return r; };
  });
  // the bulk-create card redraws itself when the page is shown: keep it inside its tab
  new MutationObserver(() => { if(F.tab !== 'find' && document.getElementById('lcToolHost')) applyMode(); }).observe(document.body, { childList: true, subtree: false });
})();
