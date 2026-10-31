/* ============================================================================
   Teacher "My Day" — the first page a Teacher sees after signing in.
   One screen with: today's periods (from the timetable), what still needs doing
   (marks, class attendance, student submissions, parent concerns), homework that
   falls due soon, and — for a class teacher — today's attendance for their own class.
   Everything is read-only here; the buttons open the normal screens, which already
   enforce what a teacher may do. Other roles are not affected.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isTeacher = () => { try { return !!currentUser && currentUser.role === 'Teacher'; } catch(e){ return false; } };
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  let landed = false, busy = false;

  function css(){
    if($('myDayCss')) return;
    const s = document.createElement('style'); s.id = 'myDayCss';
    s.textContent = `
      #view-myday{max-width:980px;}
      .md-head{display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:10px; margin-bottom:18px;}
      .md-head h2{margin:0; font-size:1.5rem; color:var(--navy,#14325c);} .md-head .md-sub{color:var(--ink-soft,#667); font-size:0.9rem;}
      .md-pill{display:inline-block; padding:3px 10px; border-radius:999px; background:#eef3fb; color:var(--navy,#14325c); font-size:0.78rem; font-weight:600;}
      .md-card{background:#fff; border:1px solid var(--border,#e3e8f3); border-radius:16px; padding:16px 18px; margin-bottom:16px;}
      .md-card h3{margin:0 0 12px; font-size:1.02rem; color:var(--navy,#14325c); display:flex; align-items:center; justify-content:space-between; gap:8px;}
      .md-row{display:flex; align-items:center; gap:12px; padding:11px 0; border-top:1px solid #eef1f7; flex-wrap:wrap;}
      .md-row:first-of-type{border-top:0;}
      .md-time{min-width:96px; font-size:0.82rem; color:var(--ink-soft,#667);} .md-main{flex:1; min-width:150px;} .md-main b{color:var(--navy,#14325c);} .md-sm{font-size:0.8rem; color:var(--ink-soft,#667);}
      .md-actions{display:flex; gap:6px; flex-wrap:wrap;}
      .md-row.now{background:#f3f8ff; margin:0 -10px; padding-left:10px; padding-right:10px; border-radius:10px; border-top-color:transparent;}
      .md-row.done{opacity:0.55;}
      .md-tag{font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:999px;} .md-tag.now{background:#1d9b4d; color:#fff;} .md-tag.next{background:#fdf0d0; color:#8a5a00;}
      .md-todo{border-left:4px solid #f0a000; padding:9px 12px; border-radius:8px; background:#fffaf0; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;}
      .md-todo.bad{border-left-color:#d93025; background:#fff5f4;} .md-todo.ok{border-left-color:#1d9b4d; background:#f3fbf6;}
      .md-stats{display:grid; grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); gap:10px; margin-bottom:10px;}
      .md-stat{background:#f6f8fc; border-radius:12px; padding:10px 12px; text-align:center;} .md-stat b{display:block; font-size:1.35rem; color:var(--navy,#14325c);} .md-stat span{font-size:0.76rem; color:var(--ink-soft,#667);}
      .md-quick{display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:10px;}
      .md-quick button{padding:14px 10px; border:1px solid var(--border,#e3e8f3); background:#fff; border-radius:14px; font-weight:600; color:var(--navy,#14325c); cursor:pointer; font-size:0.9rem;}
      .md-quick button:hover{background:#f3f7ff;}
      .md-empty{color:var(--ink-soft,#667); padding:6px 0; font-size:0.9rem;}
    `;
    document.head.appendChild(s);
  }

  function ensureShell(){
    if(!isTeacher()) return;
    css();
    const dash = $('view-dashboard');
    if(dash && !$('view-myday')){
      const v = document.createElement('div'); v.id = 'view-myday'; v.style.display = 'none';
      dash.parentNode.insertBefore(v, dash);
    }
    const nav = $('navDashboard');
    if(nav && !$('navMyDay')){
      const b = document.createElement('button');
      b.className = 'sb-link'; b.id = 'navMyDay'; b.setAttribute('onclick', "switchView('myday')");
      b.innerHTML = '<span class="sb-icon-wrap"><svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg></span> My Day';
      nav.parentNode.insertBefore(b, nav);
    }
    const b = $('navMyDay'); if(b) b.style.display = 'flex';
  }

  const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const name = st => st ? ((st.firstName || '') + ' ' + (st.lastName || '')).trim() : '';

  async function loadAll(){
    const need = [['md_students', typeof loadStudents === 'function' && loadStudents], ['md_subjects', typeof loadSubjects === 'function' && loadSubjects],
      ['md_tt', typeof loadTimetable === 'function' && loadTimetable], ['md_att', typeof loadAttendanceRecordsData === 'function' && loadAttendanceRecordsData],
      ['md_hw', typeof loadSyllabusHomework === 'function' && loadSyllabusHomework]];
    await Promise.all(need.filter(x => x[1]).map(([k, fn]) => ensureDataLoaded(k, fn).catch(() => null)));
  }

  function periodsToday(scope){
    const day = DAYS[new Date().getDay()];
    const order = new Map(timetablePeriods.map((p, i) => [p.id, i]));
    return timetableEntries.filter(e => e.staffId === scope.staffId && e.day === day)
      .map(e => ({ e, p: timetablePeriods.find(p => p.id === e.period) }))
      .filter(x => x.p && !x.p.isBreak)
      .sort((a, b) => order.get(a.p.id) - order.get(b.p.id));
  }

  function absentToday(scope){
    const c = scope.classTeacherOf; if(!c) return null;
    const today = localDateStr(new Date());
    const ids = new Set(students.filter(s => isActive(s) && s.className === c.className && s.section === c.section).map(s => s.id));
    const recs = attendanceRecords.filter(r => r.date === today && ids.has(r.studentId));
    const marked = new Set(recs.map(r => r.studentId));
    const absent = recs.filter(r => /^a/i.test(r.status || ''));
    const absIds = Array.from(new Set(absent.map(r => r.studentId)));
    return { total: ids.size, marked: marked.size, absent: absIds.map(id => students.find(s => s.id === id)).filter(Boolean), c, holiday: (typeof holidayFor === 'function') ? holidayFor(today) : null };
  }

  async function todo(scope){
    const items = [];
    try{
      if(typeof tacLoadData === 'function') await tacLoadData();
      if(typeof tacBuildModel === 'function'){
        const tm = tacBuildModel().teachers.find(t => t.id === scope.staffId);
        if(tm){
          tm.pending.slice().sort((a, b) => b.overdue - a.overdue).forEach(t => items.push({ kind:'marks', tone: t.overdue > 0 ? 'bad' : 'warn', t }));
          if(tm.homeroom && ['none','partial'].includes(tm.homeroom.state)) items.push({ kind:'att', tone: tm.homeroom.state === 'none' ? 'bad' : 'warn', h: tm.homeroom });
          if(tm.pendSubs) items.push({ kind:'subs', n: tm.pendSubs });
          if(tm.openCons) items.push({ kind:'cons', n: tm.openCons });
        }
      }
    }catch(err){ console.error('my day to-do', err); }
    return items;
  }

  function hwSoon(scope){
    const today = localDateStr(new Date());
    const soon = localDateStr(new Date(Date.now() + 2 * 86400000));
    return (homeworkItems || []).filter(h => h.staffId === scope.staffId && h.dueDate && h.dueDate >= today && h.dueDate <= soon)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  window.myDayGo = function(v){ switchView(v); };
  window.myDayHomework = function(cls, sec, subj){
    switchView('syllabus');
    setTimeout(() => {
      try{
        syClass = cls; sySection = sec || ''; sySubject = ''; renderSyllabusBody();
        if(typeof switchSyllabusTab === 'function') switchSyllabusTab('homework');
        setTimeout(() => {
          openHomeworkModal();
          const s = $('hwSection'); if(s && sec) s.value = sec;
          const u = $('hwSubject'); if(u && subj) u.value = subj;
        }, 150);
      }catch(e){ console.error(e); }
    }, 150);
  };

  async function render(){
    if(!isTeacher() || busy) return;
    const el = $('view-myday'); if(!el) return;
    busy = true;
    el.innerHTML = '<div class="empty-state"><b>Getting your day ready…</b></div>';
    try{
      await loadAll();
      const scope = myTeacherScope();
      const now = new Date();
      const hr = now.getHours();
      const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      const st = scope && scope.staffId ? staffList.find(s => s.id === scope.staffId) : null;
      const head = `<div class="md-head"><div><h2>${greet}${st ? ', ' + esc(st.firstName || '') : ''}</h2><div class="md-sub">${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}</div></div>
        <div>${scope && scope.classTeacherOf ? `<span class="md-pill">Class teacher · ${esc(scope.classTeacherOf.className)} ${esc(scope.classTeacherOf.section)}</span>` : ''}</div></div>`;
      if(!scope || scope.unlinked){
        el.innerHTML = head + '<div class="md-card"><b>Your login is not linked to a staff profile yet.</b><div class="md-sm" style="margin-top:6px;">Please ask the Admin to link it (Staff → your profile → Contact). Your day will show here once that is done.</div></div>';
        return;
      }
      // periods
      const nowMin = hr * 60 + now.getMinutes();
      const per = periodsToday(scope);
      let nextFound = false;
      const perHtml = per.length ? per.map(({ e, p }) => {
        const s = toMin(p.start), f = toMin(p.end);
        const isNow = s != null && f != null && nowMin >= s && nowMin < f;
        const isDone = f != null && nowMin >= f;
        let tag = '';
        if(isNow) tag = '<span class="md-tag now">NOW</span>';
        else if(!isDone && !nextFound){ nextFound = true; tag = '<span class="md-tag next">NEXT</span>'; }
        return `<div class="md-row ${isNow ? 'now' : ''} ${isDone ? 'done' : ''}">
          <div class="md-time"><b>${esc(p.label)}</b><br>${esc(p.start || '')} – ${esc(p.end || '')}</div>
          <div class="md-main"><b>${esc(e.subject)}</b> ${tag}<div class="md-sm">${esc(e.className)} · Section ${esc(e.section)}</div></div>
          <div class="md-actions"><button class="btn btn-ghost btn-sm" onclick="myDayHomework('${q(e.className)}','${q(e.section)}','${q(e.subject)}')">Add homework</button></div>
        </div>`;
      }).join('') : `<div class="md-empty">${DAYS[now.getDay()] === 'Sunday' ? 'No classes today.' : 'No periods are allotted to you today.'}</div>`;

      const items = await todo(scope);
      const hw = hwSoon(scope);
      const todoHtml = items.map(it => {
        if(it.kind === 'marks'){ const t = it.t; return `<div class="md-todo ${it.tone}"><div><b>Enter marks — ${esc(t.cls)} ${esc(t.sec)} · ${esc(t.subject)}</b><div class="md-sm">${esc(t.examName)} · ${t.entered}/${t.expected} entered${t.overdue > 0 ? ' · ' + t.overdue + ' day' + (t.overdue === 1 ? '' : 's') + ' overdue' : t.dueToday ? ' · due today' : ''}</div></div><button class="btn btn-primary btn-sm" onclick="tacOpenSheet('${q(t.examId)}','${q(t.cls)}','${q(t.sec)}')">Open</button></div>`; }
        if(it.kind === 'att') return `<div class="md-todo ${it.tone}"><div><b>Mark attendance — ${esc(it.h.cls)} ${esc(it.h.sec)}</b><div class="md-sm">${esc(tacHrSummary(it.h))}</div></div><button class="btn btn-primary btn-sm" onclick="myDayGo('attendance')">Open</button></div>`;
        if(it.kind === 'subs') return `<div class="md-todo"><div><b>${it.n} student submission${it.n === 1 ? '' : 's'} to review</b></div><button class="btn btn-primary btn-sm" onclick="myDayGo('inbox')">Open</button></div>`;
        return `<div class="md-todo"><div><b>${it.n} parent concern${it.n === 1 ? '' : 's'} awaiting your reply</b></div><button class="btn btn-primary btn-sm" onclick="myDayGo('inbox')">Open</button></div>`;
      }).join('') + hw.map(h => `<div class="md-todo ok"><div><b>Homework due ${h.dueDate === localDateStr(new Date()) ? 'today' : esc(h.dueDate)} — ${esc(h.className)} ${esc(h.section || '')} · ${esc(h.subject)}</b><div class="md-sm">${esc(h.title)}</div></div></div>`).join('');

      // class teacher card
      let classHtml = '';
      const ab = absentToday(scope);
      if(ab){
        const notMarked = ab.total - ab.marked;
        classHtml = `<div class="md-card"><h3>My class — ${esc(ab.c.className)} · Section ${esc(ab.c.section)} <button class="btn btn-ghost btn-sm" onclick="myDayGo('attendance')">Attendance</button></h3>
          ${ab.holiday ? `<div class="md-empty">Holiday today (${esc(ab.holiday.name)}).</div>` : `
          <div class="md-stats"><div class="md-stat"><b>${ab.total}</b><span>Students</span></div><div class="md-stat"><b>${ab.marked ? ab.marked - ab.absent.length : '—'}</b><span>Present</span></div><div class="md-stat"><b>${ab.marked ? ab.absent.length : '—'}</b><span>Absent</span></div><div class="md-stat"><b>${notMarked}</b><span>Not marked</span></div></div>
          ${ab.marked ? (ab.absent.length ? `<div class="md-sm"><b>Absent today:</b> ${ab.absent.slice(0, 12).map(s => esc(name(s))).join(', ')}${ab.absent.length > 12 ? ' and ' + (ab.absent.length - 12) + ' more' : ''}</div>` : '<div class="md-sm">Nobody is absent so far.</div>') : '<div class="md-sm">Attendance has not been marked yet today.</div>'}`}
        </div>`;
      }

      el.innerHTML = head +
        `<div class="md-card"><h3>Today's periods <span class="md-sm">${per.length} period${per.length === 1 ? '' : 's'}</span></h3>${perHtml}</div>` +
        `<div class="md-card"><h3>Needs your attention ${items.length + hw.length ? `<span class="md-pill">${items.length + hw.length}</span>` : ''}</h3>${todoHtml || '<div class="md-todo ok"><b>You are all caught up. 🎉</b></div>'}</div>` +
        classHtml +
        `<div class="md-card"><h3>Quick actions</h3><div class="md-quick">
          ${scope.classTeacherOf ? '<button onclick="myDayGo(\'attendance\')">📋 Attendance</button>' : ''}
          <button onclick="myDayGo('syllabus')">📚 Homework &amp; Syllabus</button>
          <button onclick="myDayGo('result')">📝 Marks &amp; Results</button>
          <button onclick="myDayGo('timetable')">🗓 My Timetable</button>
          <button onclick="myDayGo('inbox')">✉️ Inbox</button></div></div>`;
    }catch(err){
      console.error('my day', err);
      el.innerHTML = '<div class="md-card"><b>Could not load your day.</b><div class="md-sm">Please refresh the page and try again.</div></div>';
    }finally{ busy = false; }
  }
  window.renderMyDay = render;

  /* ---- hook into view switching ---- */
  const origSwitch = window.switchView;
  window.switchView = function(view){
    if(!isTeacher()) return origSwitch.apply(this, arguments);
    ensureShell();
    if(!landed){ landed = true; if(view !== 'myday' && $('view-myday') && myTeacherScope()) view = 'myday'; }
    if(view !== 'myday'){
      const r = origSwitch.apply(this, arguments);
      const v = $('view-myday'); if(v) v.style.display = 'none';
      const n = $('navMyDay'); if(n) n.classList.remove('active');
      return r;
    }
    // show My Day: hide every other page, clear the sidebar highlight
    const root = $('view-dashboard') ? $('view-dashboard').parentNode : null;
    if(root) Array.from(root.children).forEach(c => { if(c.id && c.id.indexOf('view-') === 0 && c.id !== 'view-myday') c.style.display = 'none'; });
    document.querySelectorAll('.sb-link.active').forEach(b => b.classList.remove('active'));
    const n = $('navMyDay'); if(n) n.classList.add('active');
    $('view-myday').style.display = 'block';
    try{ closeMobileSidebar(); }catch(e){}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    render();
  };

  // keep the sidebar link present after permissions are re-applied
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){
      const r = o.apply(this, arguments);
      try{ ensureShell(); if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility(); }catch(e){}
      return r;
    };
  }
})();
