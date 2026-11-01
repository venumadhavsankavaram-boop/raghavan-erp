/* ============================================================================
   Student / Parent portal — easy "Home" page, plain tab names, English / Telugu,
   and Admin control over which tabs parents see.
   * Home: today's attendance, fees pending, latest marks, homework, today's classes,
     next exam, latest notice — big cards, short sentences, one button each.
   * Admin Tools -> "Parent portal": switch tabs on/off and pick the default language.
   Nothing here changes data; it only reads what the portal already loads.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isParent = () => { try { return !!currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent'); } catch(e){ return false; } };
  const isAdmin = () => { try { return !!currentUser && ['Admin','Principal'].includes(currentUser.role); } catch(e){ return false; } };
  const KEY = 'portal-settings';
  try{ OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; }catch(e){}

  /* ---------- tabs ---------- */
  const TABS = [
    ['home',       '🏠', 'Home',                 'హోమ్'],
    ['fees',       '💳', 'Fees',                 'ఫీజులు'],
    ['marks',      '📝', 'Marks',                'మార్కులు'],
    ['syllabushw', '📔', 'Homework & Syllabus',  'హోంవర్క్'],
    ['classinfo',  '🗓️', 'Class & Timetable',    'టైమ్‌టేబుల్'],
    ['material',   '📚', 'Study Material',       'స్టడీ మెటీరియల్'],
    ['contact',    '💬', 'Messages',             'సందేశాలు'],
    ['notices',    '📌', 'Notices',              'ప్రకటనలు'],
    ['notifications', '🔔', 'Updates',           'అప్‌డేట్స్'],
    ['profile',    '👤', 'Profile',              'ప్రొఫైల్'],
  ];
  const DEFAULTS = { tabs: {}, language: 'en' };
  let settings = { ...DEFAULTS }, loaded = false, landed = false;

  const T = {
    hello: ['Hello', 'నమస్కారం'], yourChild: ['Your child', 'మీ బిడ్డ'],
    att: ['Attendance', 'హాజరు'], present: ['Present today', 'ఈరోజు హాజరయ్యారు'], absent: ['Absent today', 'ఈరోజు గైర్హాజరు'],
    notMarked: ['Not marked yet today', 'ఈరోజు హాజరు ఇంకా నమోదు కాలేదు'], sunday: ['No school today', 'ఈరోజు పాఠశాల లేదు'], last30: ['last 30 days', 'గత 30 రోజులు'],
    fees: ['Fees', 'ఫీజులు'], feePending: ['fee pending', 'ఫీజు చెల్లించాలి'], feeOk: ['All fees are paid 🎉', 'అన్ని ఫీజులు చెల్లించారు 🎉'], viewPay: ['View & pay', 'చూడండి'],
    marks: ['Marks', 'మార్కులు'], latest: ['Latest result', 'తాజా ఫలితాలు'], noMarks: ['No results yet', 'ఇంకా ఫలితాలు రాలేదు'], soon: ['marks will be published soon', 'మార్కులు త్వరలో వస్తాయి'], seeMarks: ['See marks', 'మార్కులు చూడండి'],
    hw: ['Homework', 'హోంవర్క్'], hwDue: ['due this week', 'ఈ వారం గడువు'], hwOver: ['overdue', 'గడువు దాటినవి'], hwNone: ['No homework pending 🎉', 'హోంవర్క్ లేదు 🎉'], seeHw: ['See homework', 'హోంవర్క్ చూడండి'],
    today: ["Today's classes", 'ఈరోజు తరగతులు'], noClass: ['No classes today', 'ఈరోజు తరగతులు లేవు'], seeTt: ['Full timetable', 'పూర్తి టైమ్‌టేబుల్'],
    exam: ['Next exam', 'తదుపరి పరీక్ష'], noExam: ['No exam scheduled', 'పరీక్షలు ఏవీ లేవు'],
    notice: ['Latest notice', 'తాజా ప్రకటన'], noNotice: ['No notices', 'ప్రకటనలు లేవు'], seeNotice: ['All notices', 'అన్ని ప్రకటనలు'],
    talk: ['Talk to a teacher', 'టీచర్‌తో మాట్లాడండి'], material: ['Study material', 'స్టడీ మెటీరియల్'], seeMaterial: ['Open', 'తెరవండి'],
    classTeacher: ['Class teacher', 'క్లాస్ టీచర్'], section: ['Section', 'సెక్షన్'],
    lang: ['తెలుగు', 'English'], history: ['View history', 'వివరాలు'], plan: ['Exam plan & syllabus', 'పరీక్ష ప్లాన్ & సిలబస్'], marksWord: ['marks', 'మార్కులు'], syllabusWord: ['Syllabus', 'సిలబస్'],
  };
  const lang = () => { let l = ''; try{ l = localStorage.getItem('portalLang') || ''; }catch(e){} return (l === 'te' || l === 'en') ? l : (settings.language === 'te' ? 'te' : 'en'); };
  const tr = k => (T[k] || [k, k])[lang() === 'te' ? 1 : 0];
  window.portalLang = lang; window.portalT = (en, te) => lang() === 'te' ? te : en;
  const tabLabel = row => lang() === 'te' ? row[3] : row[2];

  async function loadSettings(){
    if(loaded) return settings;
    try{
      const v = await storageGet(KEY, {});
      settings = { tabs: (v && typeof v.tabs === 'object' && v.tabs) || {}, language: v && v.language === 'te' ? 'te' : 'en' };
    }catch(e){ settings = { ...DEFAULTS }; }
    loaded = true; return settings;
  }
  const tabOn = id => id === 'home' || settings.tabs[id] !== false;

  /* ---------- styles ---------- */
  function css(){
    if($('shCss')) return;
    const s = document.createElement('style'); s.id = 'shCss';
    s.textContent = `
      .sh-wrap{max-width:1000px;}
      .sh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
      .sh-top h2{margin:0;font-size:1.7rem;color:var(--navy,#14325c);} .sh-top p{margin:4px 0 0;color:var(--ink-soft,#667);font-size:1rem;}
      .sh-lang{border:1px solid var(--border,#e3e8f3);background:#fff;border-radius:999px;padding:8px 16px;font-weight:700;cursor:pointer;font-size:.95rem;color:var(--navy,#14325c);}
      .sh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;}
      .sh-card{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:8px;border-left:6px solid #cfd8ea;}
      .sh-card.ok{border-left-color:#1d9b4d;} .sh-card.warn{border-left-color:#f0a000;} .sh-card.bad{border-left-color:#d93025;} .sh-card.info{border-left-color:#2F80ED;}
      .sh-h{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--navy,#14325c);font-size:1.05rem;} .sh-h i{font-style:normal;font-size:1.5rem;}
      .sh-big{font-size:1.45rem;font-weight:800;color:var(--navy,#14325c);line-height:1.25;} .sh-sub{font-size:1rem;color:var(--ink-soft,#556);line-height:1.4;}
      .sh-list{margin:0;padding:0;list-style:none;font-size:1rem;} .sh-list li{padding:5px 0;border-top:1px solid #eef1f7;display:flex;justify-content:space-between;gap:8px;} .sh-list li:first-child{border-top:0;}
      .sh-btn{margin-top:auto;align-self:flex-start;padding:11px 18px;border-radius:12px;border:0;background:var(--navy,#14325c);color:#fff;font-weight:700;font-size:1rem;cursor:pointer;}
      .sh-btn.ghost{background:#eef3fb;color:var(--navy,#14325c);}
      .sh-quick{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;}
      #view-myprofile .mf-tab{font-size:1rem;padding:11px 16px;}
    `;
    document.head.appendChild(s);
  }

  /* ---------- tab bar ---------- */
  function setActive(tab){
    TABS.forEach(r => { const b = $('mptab-' + r[0]); if(b) b.classList.toggle('active', r[0] === tab); });
  }
  function ensureTabs(){
    if(!isParent()) return;
    const bar = document.querySelector('#view-myprofile .mf-tabs'); if(!bar) return;
    css();
    TABS.forEach(r => {
      let b = $('mptab-' + r[0]);
      if(!b){
        b = document.createElement('button'); b.type = 'button'; b.className = 'mf-tab'; b.id = 'mptab-' + r[0];
        b.setAttribute('onclick', "switchMyProfileTab('" + r[0] + "')");
        const sp = document.createElement('span'); sp.className = 'shl'; b.appendChild(sp);
      }
      let sp = b.querySelector('.shl');
      if(!sp){
        // keep any badge the original button carries; replace only its text node
        Array.from(b.childNodes).forEach(n => { if(n.nodeType === 3) n.remove(); });
        sp = document.createElement('span'); sp.className = 'shl'; b.insertBefore(sp, b.firstChild);
      }
      sp.textContent = r[1] + ' ' + tabLabel(r);
      bar.appendChild(b); // re-append in the plain, fixed order
      b.style.display = tabOn(r[0]) ? '' : 'none';
    });
    let lb = $('shLangBtn');
    if(!lb){ lb = document.createElement('button'); lb.type = 'button'; lb.className = 'mf-tab'; lb.id = 'shLangBtn'; lb.setAttribute('onclick', 'portalToggleLang()'); lb.setAttribute('aria-label', 'Change language'); }
    lb.textContent = '🌐 ' + tr('lang'); bar.appendChild(lb);
    setActive(typeof myProfileTab !== 'undefined' ? myProfileTab : 'home');
  }

  /* ---------- Home ---------- */
  const dmy = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : (iso || '');
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const card = (tone, icon, title, big, sub, btn, tab) => `<section class="sh-card ${tone}"><div class="sh-h"><i>${icon}</i>${esc(title)}</div>${big ? `<div class="sh-big">${big}</div>` : ''}${sub ? `<div class="sh-sub">${sub}</div>` : ''}${btn ? `<button type="button" class="sh-btn" onclick="switchMyProfileTab('${tab}')">${esc(btn)}</button>` : ''}</section>`;

  async function renderHome(body, s){
    css(); body.innerHTML = '<div class="empty-state">…</div>';
    try{ await Promise.all([ensureDataLoaded('payments', loadPaymentsData), ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData), ensureDataLoaded('examResults', loadExamResultsData)]); }catch(e){}
    let soonNames = [], examPlans = [];
    try{
      const r = await fetch('/api/my-exam-status', { credentials: 'include' });
      if(r.ok){ const j = await r.json(); soonNames = (j || []).map(x => (examDefs.find(e => e.id === x.examId) || {}).name).filter(Boolean); }
    }catch(e){}
    try{ const r = await fetch('/api/exam-plans', { credentials: 'include' }); if(r.ok) examPlans = await r.json(); }catch(e){}
    if(typeof myProfileTab !== 'undefined' && myProfileTab !== 'home') return;
    const today = localDateStr(new Date());
    const cards = [];

    // attendance
    const todayRecs = attendanceRecords.filter(r => r.studentId === s.id && r.date === today);
    const cut = new Date(); cut.setDate(cut.getDate() - 30); const cutStr = localDateStr(cut);
    const recs = attendanceRecords.filter(r => r.studentId === s.id && r.date >= cutStr);
    const pres = recs.filter(r => r.status === 'Present' || r.status === 'Late').length;
    const pct = recs.length ? Math.round(pres / recs.length * 100) : null;
    let aBig, aTone;
    if(!todayRecs.length){ aBig = new Date().getDay() === 0 ? tr('sunday') : tr('notMarked'); aTone = 'info'; }
    else if(todayRecs.some(r => r.status === 'Absent')){ aBig = '🚫 ' + tr('absent'); aTone = 'bad'; }
    else { aBig = '✅ ' + tr('present'); aTone = 'ok'; }
    cards.push(card(aTone, '🧑‍🎓', tr('att'), esc(aBig), pct == null ? '' : esc(pct + '% · ' + tr('last30')), tr('history'), 'notifications'));

    // fees
    let owed = 0;
    try{ const { pendingRows } = computePendingFeeRows(s); owed = pendingRows.reduce((t, r) => t + r.outstanding + r.lateFee, 0); }catch(e){}
    cards.push(owed > 0
      ? card('bad', '💳', tr('fees'), esc(fmtMoney(owed)), esc(tr('feePending')), tr('viewPay'), 'fees')
      : card('ok', '💳', tr('fees'), esc(tr('feeOk')), '', tr('viewPay'), 'fees'));

    // marks
    const mine = examResults.filter(r => r.studentId === s.id);
    const ids = [...new Set(mine.map(r => r.examId))];
    const exams = ids.map(id => examDefs.find(e => e.id === id)).filter(Boolean).sort((a, b) => (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || ''));
    const soonLine = soonNames.length ? esc(soonNames.join(', ') + ' — ' + tr('soon')) : '';
    cards.push(exams.length
      ? card('info', '📝', tr('marks'), esc(exams[0].name), esc(tr('latest')) + (soonLine ? '<br>' + soonLine : ''), tr('seeMarks'), 'marks')
      : card('info', '📝', tr('marks'), esc(tr('noMarks')), soonLine, tr('seeMarks'), 'marks'));

    // homework
    const wk = new Date(); wk.setDate(wk.getDate() + 7); const wkStr = localDateStr(wk);
    const hw = (typeof homeworkItems !== 'undefined' ? homeworkItems : []).filter(h => h.className === s.className && (!h.section || h.section === s.section));
    const due = hw.filter(h => h.dueDate && h.dueDate >= today && h.dueDate <= wkStr).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const over = hw.filter(h => h.dueDate && h.dueDate < today);
    const hwBig = (due.length || over.length) ? esc(due.length + ' ' + tr('hwDue') + (over.length ? ' · ' + over.length + ' ' + tr('hwOver') : '')) : esc(tr('hwNone'));
    cards.push(card(over.length ? 'warn' : 'ok', '📔', tr('hw'), hwBig,
      due.slice(0, 2).map(h => esc((h.subject || '') + ' — ' + (h.title || '') + ' (' + dmy(h.dueDate) + ')')).join('<br>'), tr('seeHw'), 'syllabushw'));

    // today's classes
    const dayName = DAYS[new Date().getDay()];
    const order = new Map((timetablePeriods || []).map((p, i) => [p.id, i]));
    const todays = (timetableEntries || []).filter(e => e.className === s.className && e.section === s.section && e.day === dayName)
      .map(e => ({ e, p: (timetablePeriods || []).find(p => p.id === e.period) })).filter(x => x.p && !x.p.isBreak)
      .sort((a, b) => order.get(a.p.id) - order.get(b.p.id));
    cards.push(`<section class="sh-card info"><div class="sh-h"><i>🗓️</i>${esc(tr('today'))}</div>${todays.length
      ? `<ul class="sh-list">${todays.map(x => `<li><b>${esc(x.e.subject)}</b><span>${esc(x.p.start || '')}</span></li>`).join('')}</ul>`
      : `<div class="sh-big">${esc(tr('noClass'))}</div>`}<button type="button" class="sh-btn ghost" onclick="switchMyProfileTab('classinfo')">${esc(tr('seeTt'))}</button></section>`);

    // next exam
    let next = null;
    (examDefs || []).forEach(ex => {
      let subs = []; try{ subs = getExamSubjects(ex, s.className, s.section).filter(x => x.date && x.date >= today); }catch(e){}
      if(!subs.length) return;
      const first = subs.map(x => x.date).sort()[0];
      if(!next || first < next.first) next = { ex, first, subs: subs.sort((a, b) => a.date.localeCompare(b.date)) };
    });
    cards.push(next
      ? card('warn', '📅', tr('exam'), esc(next.ex.name), esc(next.subs.slice(0, 3).map(x => (x.name || x.subject || '') + ' ' + dmy(x.date)).join(' · ')), '', '')
      : card('info', '📅', tr('exam'), esc(tr('noExam')), '', '', ''));

    // approved exam plans (syllabus, marks, instructions) from the teachers
    const upcoming = (examPlans || []).filter(p => p.examDate && p.examDate >= today).sort((a, b) => a.examDate.localeCompare(b.examDate)).slice(0, 4);
    if(upcoming.length) cards.push(`<section class="sh-card warn"><div class="sh-h"><i>📝</i>${esc(tr('plan'))}</div>${upcoming.map(p => `<details style="margin:4px 0;"><summary style="cursor:pointer;font-weight:700;font-size:1.02rem;">${esc(p.subject)} · ${esc(dmy(p.examDate))}${p.startTime ? ' ' + esc(p.startTime) : ''} · ${esc(p.maxMarks)} ${esc(tr('marksWord'))}</summary><div class="sh-sub" style="margin-top:6px;white-space:pre-wrap;"><b>${esc(tr('syllabusWord'))}:</b> ${esc(p.syllabus)}${p.instructions ? '<br>' + esc(p.instructions) : ''}</div></details>`).join('')}</section>`);

    // latest notice
    let notes = [];
    try{ notes = commsMessages.filter(m => nbxVisibleToStudent(m, s)).slice().sort((a, b) => String(b.id).localeCompare(String(a.id))); }catch(e){}
    cards.push(notes.length
      ? card('info', '📌', tr('notice'), esc(notes[0].title || ''), esc(String(notes[0].body || '').slice(0, 110)), tr('seeNotice'), 'notices')
      : card('info', '📌', tr('notice'), esc(tr('noNotice')), '', '', ''));

    const ct = staffList.find(st => st.classTeacherClass === s.className && st.classTeacherSection === s.section && staffIsActive(st));
    const quick = [];
    if(tabOn('contact')) quick.push(`<button type="button" class="sh-btn" onclick="switchMyProfileTab('contact')">💬 ${esc(tr('talk'))}</button>`);
    if(tabOn('material')) quick.push(`<button type="button" class="sh-btn ghost" onclick="switchMyProfileTab('material')">📚 ${esc(tr('material'))}</button>`);

    body.innerHTML = `<div class="sh-wrap">
      <div class="sh-top"><div><h2>${esc(tr('hello'))}, ${esc(s.firstName)}</h2>
        <p>${esc(s.className)} · ${esc(tr('section'))} ${esc(s.section)}${ct ? ' · ' + esc(tr('classTeacher')) + ': ' + esc(typeof pmStaffName === 'function' ? pmStaffName(ct) : ((ct.firstName || '') + ' ' + (ct.lastName || ''))) : ''}</p></div></div>
      <div class="sh-grid">${cards.join('')}</div>
      ${quick.length ? `<div class="sh-quick">${quick.join('')}</div>` : ''}</div>`;
  }
  window.portalToggleLang = function(){
    const n = lang() === 'te' ? 'en' : 'te';
    try{ localStorage.setItem('portalLang', n); }catch(e){}
    ensureTabs();
    try{ renderMyProfileBody(); }catch(e){}
  };

  /* ---------- hook into the portal ---------- */
  if(typeof switchMyProfileTab === 'function'){
    const o = switchMyProfileTab;
    window.switchMyProfileTab = function(tab){
      if(!isParent()) return o.apply(this, arguments);
      if(!tabOn(tab)) tab = 'home';
      if(tab === 'home' || tab === 'material'){ myProfileTab = tab; setActive(tab); return renderMyProfileBody(); }
      const r = o.apply(this, arguments); setActive(tab); return r;
    };
  }
  if(typeof renderMyProfileBody === 'function'){
    const o = renderMyProfileBody;
    window.renderMyProfileBody = async function(){
      if(!isParent()) return o.apply(this, arguments);
      await loadSettings(); ensureTabs();
      if(!tabOn(myProfileTab)) myProfileTab = 'home';
      const body = $('myProfileBody'), s = myProfileStudent();
      let r;
      if(myProfileTab === 'home' && s && body){
        document.getElementById('myProfileTitle').textContent = currentUser.role === 'Parent' ? "Child's Portal" : "My Portal";
        await renderHome(body, s);
      }else if(myProfileTab === 'material' && s && body && typeof window.renderMyMaterialTab === 'function'){
        await window.renderMyMaterialTab(body, s);
      }else{
        r = await o.apply(this, arguments);
      }
      const hero = $('pmHero'); if(hero) hero.style.display = (myProfileTab === 'home' || myProfileTab === 'material') ? 'none' : '';
      setActive(myProfileTab);
      return r;
    };
  }
  if(typeof switchView === 'function'){
    const o = switchView;
    window.switchView = function(view){
      const r = o.apply(this, arguments);
      if(view === 'myprofile' && isParent() && !landed){ landed = true; try{ window.switchMyProfileTab('home'); }catch(e){} }
      if(view === 'admintools2' && isAdmin()) setTimeout(adminCard, 400);
      return r;
    };
  }

  /* ---------- Admin: Parent portal card (in Admin Tools) ---------- */
  async function adminCard(){
    const host = $('adminTools2Body'); if(!host) return;
    let card = $('portalSettingsCard');
    if(!card){
      card = document.createElement('div'); card.id = 'portalSettingsCard'; card.className = 'profile-card';
      card.style.cssText = 'margin:0 0 18px;padding:16px 18px;';
      host.insertBefore(card, host.firstChild);
    }
    loaded = false; await loadSettings();
    const st = JSON.parse(JSON.stringify(settings));
    const draw = () => {
      card.innerHTML = `<h3 style="margin:0 0 4px;">Parent portal — tabs &amp; language</h3>
        <p style="margin:0 0 12px;color:#667;font-size:.88rem;">Choose what parents and students see. Home is always on. Hidden tabs disappear from their screen.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;margin-bottom:12px;">
        ${TABS.filter(r => r[0] !== 'home').map(r => `<label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" data-tab="${r[0]}" ${st.tabs[r[0]] !== false ? 'checked' : ''}> ${r[1]} ${esc(r[2])}</label>`).join('')}</div>
        <label style="margin-right:14px;">Default language <select id="psLang"><option value="en" ${st.language === 'en' ? 'selected' : ''}>English</option><option value="te" ${st.language === 'te' ? 'selected' : ''}>తెలుగు (Telugu)</option></select></label>
        <button type="button" class="btn btn-primary btn-sm" id="psSave">Save</button> <span id="psMsg" style="margin-left:8px;color:#1d9b4d;"></span>`;
      $('psSave').onclick = async () => {
        const tabs = {}; card.querySelectorAll('input[data-tab]').forEach(i => { if(!i.checked) tabs[i.dataset.tab] = false; });
        try{ await storageSet(KEY, { tabs, language: $('psLang').value }); st.tabs = tabs; st.language = $('psLang').value; $('psMsg').textContent = 'Saved ✓'; }
        catch(e){ if(typeof showToast === 'function') showToast('Could not save: ' + (e && e.message || 'try again')); }
      };
    };
    draw();
  }
})();
