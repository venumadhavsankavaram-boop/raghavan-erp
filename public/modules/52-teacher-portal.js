/* =========================================================================
   Teacher Portal — a friendlier, phone-first home for Teacher logins, plus Admin/Principal controls.
   * Teacher home (the existing "My Day" page): greeting banner, big task tiles (English / Telugu), the same periods,
     to-do and class cards underneath. A bottom bar on phones for the five most used screens.
   * Tiles for features the school has switched off show a lock and a short reason instead of disappearing silently.
   * Admin Tools > "Teacher portal": feature on/off, approval rules, edit windows, visibility limits.
     The rules themselves are enforced by the server (server.js: teacherPortalSettings) — hiding a tile is only a courtesy.
   Defaults equal today's behaviour, so nothing changes until the Admin/Principal changes a setting.
   ========================================================================= */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const isTeacher = () => role() === 'Teacher';
  const isMgr = () => role() === 'Admin' || role() === 'Principal';
  const KEY = 'teacher-portal-settings';
  try{ OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; }catch(e){}

  const DEFAULTS = {
    features: { homework: true, studyMaterial: true, examPlans: true, onlineExams: true },
    approvals: { examPlans: 'review', onlineExams: 'review' },
    windows: { attendanceBackDays: null, marksLockAfterRelease: false },
    visibility: { parentContacts: true, healthDetails: true, classTeacherSeesAllMarks: false },
    language: 'en',
  };
  const merge = v => {
    v = (v && typeof v === 'object') ? v : {};
    const d = JSON.parse(JSON.stringify(DEFAULTS));
    ['features', 'approvals', 'windows', 'visibility'].forEach(g => { if(v[g] && typeof v[g] === 'object') Object.keys(d[g]).forEach(k => { if(v[g][k] !== undefined) d[g][k] = v[g][k]; }); });
    if(v.language === 'te') d.language = 'te';
    return d;
  };
  let cfg = merge(null), cfgAt = 0;
  async function loadCfg(force){
    if(!force && Date.now() - cfgAt < 30000) return cfg;
    try{
      const r = await fetch('/api/kv/' + KEY, { credentials: 'include' });
      if(r.ok) cfg = merge(await r.json());
    }catch(e){}
    cfgAt = Date.now(); return cfg;
  }
  const lang = () => { let l = ''; try{ l = localStorage.getItem('portalLang') || ''; }catch(e){} return (l === 'te' || l === 'en') ? l : cfg.language; };
  const pick = (en, te) => lang() === 'te' ? te : en;

  /* ---------- tiles ---------- */
  // [id, icon, colour, English, Telugu, hint (en), hint (te), how to open, feature switch, needs]
  const TILES = [
    ['attendance', '📋', '#1d9b4d', 'Attendance',        'హాజరు',          'Mark your class',          'మీ తరగతి హాజరు',        { view: 'attendance' }, null, 'classTeacher'],
    ['marks',      '📝', '#2f6fed', 'Enter Marks',       'మార్కులు',        'Exams and results entry',   'మార్కుల నమోదు',         { view: 'exams' }, null, null],
    ['homework',   '📚', '#e8710a', 'Homework & Syllabus','హోంవర్క్',        'Set and track homework',    'హోంవర్క్ ఇవ్వండి',       { view: 'syllabus' }, 'homework', null],
    ['material',   '📂', '#7b3fe4', 'Study Material',    'స్టడీ మెటీరియల్', 'Share notes and videos',    'నోట్స్ షేర్ చేయండి',     { view: 'material', nav: 'navMaterial' }, 'studyMaterial', null],
    ['examplans',  '🗓️', '#c2185b', 'Exam Plans',        'పరీక్ష ప్లాన్',    'Syllabus and dates',        'సిలబస్ & తేదీలు',        { view: 'examplans', nav: 'navExamPlans' }, 'examPlans', null],
    ['onlineexam', '⏱️', '#00838f', 'Online Exams',      'ఆన్‌లైన్ పరీక్షలు', 'Quizzes and tests',        'క్విజ్‌లు & పరీక్షలు',    { view: 'onlineexams', nav: 'navOnlineExams' }, 'onlineExams', null],
    ['timetable',  '🕘', '#455a64', 'My Timetable',      'టైమ్‌టేబుల్',      'Your weekly periods',       'మీ పీరియడ్లు',          { view: 'timetable' }, null, null],
    ['results',    '🏅', '#f9a825', 'Results',           'ఫలితాలు',         'Progress reports',          'ప్రోగ్రెస్ రిపోర్టులు',   { view: 'result' }, null, null],
    ['inbox',      '✉️', '#3949ab', 'Inbox',             'ఇన్‌బాక్స్',       'Parents and students',      'తల్లిదండ్రులు & విద్యార్థులు', { view: 'inbox' }, null, null],
    ['leave',      '🌴', '#2e7d32', 'Apply Leave',       'సెలవు',           'Request time off',          'సెలవు కోసం దరఖాస్తు',    { fn: 'openStaffLeaveModal' }, null, null],
    ['account',    '👤', '#6d4c41', 'Profile & Payslips','ప్రొఫైల్',         'Your details and salary',   'మీ వివరాలు & జీతం',      { view: 'myaccount' }, null, null],
    ['notices',    '📌', '#d84315', 'Notices',           'ప్రకటనలు',        'School announcements',      'పాఠశాల ప్రకటనలు',       { view: 'noticeboard' }, null, null],
  ];
  const OFF_MSG = ['Switched off by the school', 'పాఠశాల ఈ సదుపాయాన్ని నిలిపివేసింది'];

  function scopeNow(){ try{ return (typeof myTeacherScope === 'function' && myTeacherScope()) || null; }catch(e){ return null; } }
  function canOpen(t, scope){
    const how = t[7];
    if(t[9] === 'classTeacher' && !(scope && scope.classTeacherOf)) return false;
    if(how.fn) return typeof window[how.fn] === 'function';
    let views = []; try{ views = getRoleViews(role()) || []; }catch(e){}
    if(how.nav) return !!$(how.nav) || views.includes(how.view);
    return views.includes(how.view) || (how.view === 'myaccount');
  }
  window.tpGo = function(id){
    const t = TILES.find(x => x[0] === id); if(!t) return;
    if(t[8] && cfg.features[t[8]] === false){ try{ showToast(pick(OFF_MSG[0], OFF_MSG[1])); }catch(e){} return; }
    const how = t[7];
    if(how.fn){ try{ window[how.fn](); }catch(e){ console.error(e); } return; }
    try{ switchView(how.view); }catch(e){ console.error(e); }
  };
  window.tpLang = function(){ try{ localStorage.setItem('portalLang', lang() === 'te' ? 'en' : 'te'); }catch(e){} paint(true); };

  function css(){
    if($('tpCss')) return;
    const s = document.createElement('style'); s.id = 'tpCss';
    s.textContent = `
      #view-myday.tp{max-width:1040px;}
      .tp-hero{position:relative;overflow:hidden;border-radius:22px;padding:22px 24px;margin-bottom:18px;color:#fff;
        background:linear-gradient(120deg,#14325c 0%,#2f6fed 55%,#7b3fe4 100%);box-shadow:0 10px 30px rgba(47,111,237,.25);}
      .tp-hero:after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.10);}
      .tp-hero:before{content:"";position:absolute;right:70px;bottom:-80px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.08);}
      .tp-hero h2{margin:0 0 4px;font-size:1.55rem;color:#fff;position:relative;z-index:1;}
      .tp-hero .tp-date{opacity:.9;font-size:.92rem;position:relative;z-index:1;}
      .tp-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;position:relative;z-index:1;}
      .tp-chip{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);color:#fff;border-radius:999px;padding:5px 12px;font-size:.8rem;font-weight:600;backdrop-filter:blur(4px);}
      button.tp-chip{cursor:pointer;} button.tp-chip:hover{background:rgba(255,255,255,.3);}
      .tp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}
      .tp-tile{position:relative;text-align:left;background:#fff;border:1px solid #e6ebf5;border-radius:18px;padding:14px 14px 13px;cursor:pointer;
        transition:transform .15s ease,box-shadow .15s ease;box-shadow:0 2px 8px rgba(20,50,92,.05);min-height:112px;display:flex;flex-direction:column;gap:4px;font-family:inherit;}
      .tp-tile:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(20,50,92,.12);}
      .tp-tile:active{transform:scale(.98);}
      .tp-ic{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:1.35rem;color:#fff;margin-bottom:4px;}
      .tp-tile b{font-size:.95rem;color:#14325c;line-height:1.2;} .tp-tile span.tp-h{font-size:.75rem;color:#667;line-height:1.25;}
      .tp-tile.off{background:#f5f6f9;cursor:not-allowed;box-shadow:none;} .tp-tile.off:hover{transform:none;box-shadow:none;}
      .tp-tile.off .tp-ic{background:#b8bfcc !important;} .tp-tile.off b{color:#78808f;}
      .tp-lock{position:absolute;right:11px;top:10px;font-size:.95rem;}
      .tp-sec{margin:0 0 18px;} .tp-sec>h3{margin:0 0 10px;font-size:1.02rem;color:#14325c;}
      #view-myday.tp .md-card{border-radius:18px;box-shadow:0 2px 8px rgba(20,50,92,.05);}
      #view-myday.tp .md-head{display:none;}
      #tpDock{display:none;}
      @media (max-width:760px){
        .tp-grid{grid-template-columns:repeat(2,1fr);gap:10px;} .tp-tile{min-height:104px;padding:12px;}
        .tp-hero{padding:18px 16px;border-radius:18px;} .tp-hero h2{font-size:1.3rem;}
        body.tp-on{padding-bottom:74px;}
        #tpDock{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:900;background:#fff;border-top:1px solid #e3e8f3;box-shadow:0 -6px 20px rgba(20,50,92,.10);padding:6px 6px calc(6px + env(safe-area-inset-bottom));justify-content:space-around;}
        #tpDock button{flex:1;background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.68rem;color:#52607a;padding:5px 2px;border-radius:12px;font-family:inherit;}
        #tpDock button .d{font-size:1.25rem;line-height:1;} #tpDock button.on{color:#2f6fed;font-weight:700;background:#eef3ff;}
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------- paint the teacher home ---------- */
  let painting = false;
  function nameOf(){
    try{ const sc = scopeNow(); const st = sc && sc.staffId ? staffList.find(s => s.id === sc.staffId) : null; return st ? (st.firstName || '') : ''; }catch(e){ return ''; }
  }
  function heroHtml(scope){
    const now = new Date(), hr = now.getHours();
    const g = hr < 12 ? ['Good morning', 'శుభోదయం'] : hr < 17 ? ['Good afternoon', 'శుభ మధ్యాహ్నం'] : ['Good evening', 'శుభ సాయంత్రం'];
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const nm = nameOf();
    const chips = [];
    if(scope && scope.classTeacherOf) chips.push(`<span class="tp-chip">🎓 ${pick('Class teacher', 'క్లాస్ టీచర్')} · ${esc(scope.classTeacherOf.className)} ${esc(scope.classTeacherOf.section)}</span>`);
    if(scope && scope.subjectSections && scope.subjectSections.length){
      const n = new Set(scope.subjectSections.map(x => x.className + '|' + x.section)).size;
      chips.push(`<span class="tp-chip">📚 ${n} ${pick(n === 1 ? 'class' : 'classes', 'తరగతులు')}</span>`);
    }
    chips.push(`<button type="button" class="tp-chip" onclick="tpLang()">🌐 ${lang() === 'te' ? 'English' : 'తెలుగు'}</button>`);
    return `<div class="tp-hero" id="tpHero"><h2>${esc(pick(g[0], g[1]))}${nm ? ', ' + esc(nm) : ''} 👋</h2>
      <div class="tp-date">${DAYS[now.getDay()]}, ${now.getDate()} ${MON[now.getMonth()]} ${now.getFullYear()}</div><div class="tp-chips">${chips.join('')}</div></div>`;
  }
  function tilesHtml(scope){
    const out = TILES.filter(t => canOpen(t, scope)).map(t => {
      const off = !!(t[8] && cfg.features[t[8]] === false);
      return `<button type="button" class="tp-tile${off ? ' off' : ''}" onclick="tpGo('${t[0]}')" title="${off ? esc(pick(OFF_MSG[0], OFF_MSG[1])) : ''}">
        ${off ? '<span class="tp-lock">🔒</span>' : ''}<div class="tp-ic" style="background:${t[2]};">${t[1]}</div>
        <b>${esc(pick(t[3], t[4]))}</b><span class="tp-h">${esc(off ? pick(OFF_MSG[0], OFF_MSG[1]) : pick(t[5], t[6]))}</span></button>`;
    }).join('');
    return `<div class="tp-sec" id="tpTiles"><h3>${esc(pick('What would you like to do?', 'మీరు ఏమి చేయాలనుకుంటున్నారు?'))}</h3><div class="tp-grid">${out}</div></div>`;
  }
  async function paint(force){
    if(!isTeacher() || painting) return;
    const el = $('view-myday'); if(!el) return;
    if(!el.querySelector('.md-card')) return;                      // still loading
    if(!force && $('tpHero')) return;
    painting = true;
    try{
      await loadCfg(force);
      css(); el.classList.add('tp'); document.body.classList.add('tp-on');
      const scope = scopeNow();
      Array.from(el.children).forEach(c => { if(c.id === 'tpHero' || c.id === 'tpTiles') c.remove(); });
      // the old "Quick actions" card is replaced by the tiles
      Array.from(el.querySelectorAll('.md-card')).forEach(c => { const h = c.querySelector('h3'); if(h && /^Quick actions/i.test(h.textContent.trim())) c.remove(); });
      el.insertAdjacentHTML('afterbegin', heroHtml(scope) + tilesHtml(scope));
    }finally{ painting = false; }
  }
  window.tpRepaint = () => paint(true);

  /* ---------- phone bottom bar ---------- */
  function dock(){
    if(!isTeacher()){ const d = $('tpDock'); if(d) d.remove(); document.body.classList.remove('tp-on'); return; }
    css(); document.body.classList.add('tp-on');
    if($('tpDock')) return;
    const d = document.createElement('div'); d.id = 'tpDock';
    const items = [['myday', '🏠', 'Home', 'హోమ్'], ['attendance', '📋', 'Attendance', 'హాజరు'], ['exams', '📝', 'Marks', 'మార్కులు'], ['syllabus', '📚', 'Homework', 'హోంవర్క్'], ['myaccount', '👤', 'Me', 'నేను']];
    d.innerHTML = items.map(i => `<button type="button" data-v="${i[0]}" onclick="switchView('${i[0]}')"><span class="d">${i[1]}</span><span class="l">${i[2]}</span></button>`).join('');
    document.body.appendChild(d);
  }
  function dockActive(view){
    const d = $('tpDock'); if(!d) return;
    const l = lang() === 'te';
    const names = { myday: ['Home', 'హోమ్'], attendance: ['Attendance', 'హాజరు'], exams: ['Marks', 'మార్కులు'], syllabus: ['Homework', 'హోంవర్క్'], myaccount: ['Me', 'నేను'] };
    d.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.v === view); const n = names[b.dataset.v]; if(n) b.querySelector('.l').textContent = n[l ? 1 : 0]; });
  }

  /* ---------- hide sidebar items the school switched off ---------- */
  function applyNav(){
    if(!isTeacher()) return;
    [['navMaterial', 'studyMaterial'], ['navExamPlans', 'examPlans'], ['navOnlineExams', 'onlineExams']].forEach(([id, f]) => {
      const b = $(id); if(b && cfg.features[f] === false) b.style.display = 'none';
    });
  }

  /* ---------- hooks ---------- */
  let obs = null;
  function watch(){
    const el = $('view-myday');
    if(!el || obs) return;
    obs = new MutationObserver(() => { if(!painting && el.querySelector('.md-card') && !$('tpHero')) paint(false); });
    obs.observe(el, { childList: true });
  }
  if(typeof window.switchView === 'function'){
    const o = window.switchView;
    window.switchView = function(view){
      const r = o.apply(this, arguments);
      if(isTeacher()){
        try{ dock(); watch(); dockActive(view); loadCfg(false).then(applyNav); if(view === 'myday') setTimeout(() => paint(false), 60); }catch(e){}
      }
      if(view === 'admintools2' && isMgr()) setTimeout(adminCard, 450);
      return r;
    };
  }
  setInterval(() => { if(isTeacher()){ dock(); watch(); } else if($('tpDock')) dock(); }, 2500);

  /* ---------- Admin / Principal: Teacher portal controls (in Admin Tools) ---------- */
  const BACK_OPTS = [[null, 'No limit (today’s behaviour)'], [0, 'Today only'], [1, 'Up to 1 day back'], [2, 'Up to 2 days back'], [3, 'Up to 3 days back'], [7, 'Up to 7 days back'], [15, 'Up to 15 days back'], [30, 'Up to 30 days back']];
  async function adminCard(){
    const host = $('adminTools2Body'); if(!host) return;
    let card = $('teacherPortalCard');
    if(!card){
      card = document.createElement('div'); card.id = 'teacherPortalCard'; card.className = 'profile-card';
      card.style.cssText = 'margin:0 0 18px;padding:16px 18px;';
      const parentCard = $('portalSettingsCard');
      if(parentCard && parentCard.parentNode === host) parentCard.insertAdjacentElement('afterend', card); else host.insertBefore(card, host.firstChild);
    }
    await loadCfg(true);
    const st = JSON.parse(JSON.stringify(cfg));
    const chk = (g, k, label, hint) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid #e6ebf5;border-radius:12px;background:#fafbfe;"><input type="checkbox" data-g="${g}" data-k="${k}" ${st[g][k] ? 'checked' : ''} style="margin-top:3px;"><span><b>${label}</b><br><span style="font-size:.78rem;color:#667;">${hint}</span></span></label>`;
    const sel = (g, k, label, opts, cur) => `<label style="display:block;"><b>${label}</b><br><select data-sg="${g}" data-sk="${k}" style="margin-top:4px;min-width:230px;">${opts.map(o => `<option value="${o[0] === null ? '' : o[0]}" ${String(o[0]) === String(cur) || (o[0] === null && (cur === null || cur === '')) ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>`;
    const sec = (title, sub, body) => `<div style="margin:16px 0 0;"><h4 style="margin:0 0 2px;color:#14325c;">${title}</h4><p style="margin:0 0 8px;color:#667;font-size:.84rem;">${sub}</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;">${body}</div></div>`;
    const apr = [['review', 'Principal must approve first'], ['auto', 'No review — approved when saved']];
    card.innerHTML = `<h3 style="margin:0 0 4px;">Teacher portal — controls</h3>
      <p style="margin:0 0 4px;color:#667;font-size:.88rem;">What teachers can use, what needs your approval, how long they can change records, and what they can see. Applies to <b>Teacher</b> logins only — Admin and Principal are never limited. Nothing changes until you press Save. The first values shown are today's behaviour.</p>
      ${sec('1 · Features', 'Switch a feature off and teachers see a locked tile; the server also refuses it.',
        chk('features', 'homework', '📚 Homework', 'Teachers can set homework') + chk('features', 'studyMaterial', '📂 Study material', 'Teachers can upload notes, PDFs, videos') + chk('features', 'examPlans', '🗓️ Exam plans', 'Teachers can plan their exams') + chk('features', 'onlineExams', '⏱️ Online exams', 'Teachers can set quizzes and tests'))}
      ${sec('2 · Approval rules', 'Choose whether a teacher’s work waits for the Principal or goes live at once.',
        sel('approvals', 'examPlans', 'Exam plans', apr, st.approvals.examPlans) + sel('approvals', 'onlineExams', 'Online exams', apr, st.approvals.onlineExams))}
      ${sec('3 · Edit windows', 'Stop old records being changed quietly. Admin and Principal can always correct.',
        sel('windows', 'attendanceBackDays', 'Teacher may mark / change attendance', BACK_OPTS, st.windows.attendanceBackDays) + chk('windows', 'marksLockAfterRelease', '🔒 Lock marks once released', 'After you release an exam to students, teachers cannot change its marks'))}
      ${sec('4 · What teachers can see', 'Teachers only ever see students of their own classes. These limit the details further.',
        chk('visibility', 'parentContacts', '📞 Parent phone, email, address', 'Untick to hide contact details from teachers') + chk('visibility', 'healthDetails', '🩺 Blood group, caste, religion', 'Untick to hide personal details from teachers') + chk('visibility', 'classTeacherSeesAllMarks', '📊 Class teacher sees all subjects’ marks', 'The class teacher can view (not edit) every subject’s marks for the homeroom'))}
      <div style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <label>Default language <select id="tpLangSel"><option value="en" ${st.language !== 'te' ? 'selected' : ''}>English</option><option value="te" ${st.language === 'te' ? 'selected' : ''}>తెలుగు (Telugu)</option></select></label>
        <button type="button" class="btn btn-primary btn-sm" id="tpSave">Save</button>
        <button type="button" class="btn btn-ghost btn-sm" id="tpReset">Back to today’s behaviour</button>
        <span id="tpMsg" style="color:#1d9b4d;font-weight:600;"></span></div>`;
    const read = () => {
      const v = merge(null);
      card.querySelectorAll('input[data-g]').forEach(i => { v[i.dataset.g][i.dataset.k] = i.checked; });
      card.querySelectorAll('select[data-sg]').forEach(s => { const val = s.value; v[s.dataset.sg][s.dataset.sk] = (s.dataset.sk === 'attendanceBackDays') ? (val === '' ? null : parseInt(val, 10)) : val; });
      v.language = $('tpLangSel').value; return v;
    };
    const save = async v => {
      try{
        const r = await fetch('/api/kv/' + KEY, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
        if(!r.ok){ const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Could not save'); }
        cfg = merge(v); cfgAt = Date.now(); $('tpMsg').textContent = 'Saved ✓ — teachers get it within a few seconds.';
      }catch(e){ try{ showToast('Could not save: ' + (e.message || 'try again')); }catch(x){} }
    };
    $('tpSave').onclick = () => save(read());
    $('tpReset').onclick = async () => { await save(merge(null)); adminCard(); };
    if(host._tpObs) host._tpObs.disconnect();
    const keep = () => { if(!card.isConnected){ o2.disconnect(); const p = $('portalSettingsCard'); if(p && p.parentNode === host) p.insertAdjacentElement('afterend', card); else host.insertBefore(card, host.firstChild); o2.observe(host, { childList: true }); } };
    const o2 = new MutationObserver(keep); host._tpObs = o2; o2.observe(host, { childList: true });
    setTimeout(() => { try{ o2.disconnect(); }catch(e){} }, 15000);
  }
})();
