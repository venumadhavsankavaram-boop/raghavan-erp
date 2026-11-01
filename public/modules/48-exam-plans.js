/* ============================================================================
   Exam Plans — a teacher plans an exam for their own subject and submits it; the Admin/Principal approves
   it or sends it back with a note. Approved plans (syllabus, date, marks, instructions) reach the class, and
   the date is written into the exam schedule when the plan is tied to one of the school's exams.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const isTeacher = () => role() === 'Teacher';
  const isMgr = () => ['Admin','Principal'].includes(role());
  const isStaff = () => isTeacher() || isMgr();
  const dmy = iso => /^\d{4}-\d{2}-\d{2}/.test(iso || '') ? String(iso).slice(8, 10) + '/' + String(iso).slice(5, 7) + '/' + String(iso).slice(0, 4) : '';
  const toast = m => { try{ showToast(m); }catch(e){ console.log(m); } };
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok) throw new Error((j && j.error) || 'Something went wrong');
    return j;
  }
  const PILL = {
    Submitted: ['#fdf0d0', '#8a5a00', 'Waiting for approval'],
    Approved:  ['#dff5e6', '#17703a', 'Approved'],
    Returned:  ['#fde4e1', '#b3261e', 'Sent back — please edit'],
  };
  const pill = st => { const p = PILL[st] || ['#eee', '#444', st]; return `<span style="background:${p[0]};color:${p[1]};font-weight:700;font-size:.74rem;padding:3px 10px;border-radius:999px;">${esc(p[2])}</span>`; };

  function css(){
    if($('epCss')) return;
    const s = document.createElement('style'); s.id = 'epCss';
    s.textContent = `
      .ep-card{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:16px;padding:16px 18px;margin-bottom:14px;}
      .ep-card h3{margin:0 0 10px;font-size:1.05rem;color:var(--navy,#14325c);display:flex;justify-content:space-between;gap:8px;align-items:center;}
      .ep-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;} .ep-form .full{grid-column:1/-1;}
      .ep-form label{font-size:.8rem;color:#667;display:block;margin-bottom:3px;} .ep-form input,.ep-form select,.ep-form textarea{width:100%;padding:9px;border:1px solid var(--border,#d6dcea);border-radius:10px;font:inherit;}
      .ep-row{padding:13px 0;border-top:1px solid #eef1f7;} .ep-row:first-of-type{border-top:0;}
      .ep-top{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;} .ep-top b{color:var(--navy,#14325c);font-size:1rem;}
      .ep-sm{font-size:.84rem;color:#667;margin-top:3px;white-space:pre-wrap;} .ep-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
      .ep-note{background:#fff5f4;border-left:4px solid #d93025;padding:8px 10px;border-radius:8px;margin-top:8px;font-size:.88rem;}
    `;
    document.head.appendChild(s);
  }

  function ensureShell(){
    if(!isStaff()) return;
    css();
    const dash = $('view-dashboard');
    if(dash && !$('view-examplans')){
      const v = document.createElement('div'); v.id = 'view-examplans'; v.style.display = 'none';
      dash.parentNode.insertBefore(v, dash);
    }
    const anchor = $('navMaterial') || $('navSyllabus');
    if(anchor && !$('navExamPlans')){
      const b = document.createElement('button'); b.className = 'sb-link'; b.id = 'navExamPlans'; b.setAttribute('onclick', "switchView('examplans')");
      b.innerHTML = '<span class="sb-icon-wrap"><svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg></span> Exam Plans';
      anchor.insertAdjacentElement('afterend', b);
    }
  }

  let plans = [], editing = null, noteFor = null;
  function targets(){
    const sc = myTeacherScope(); return (sc && sc.subjectSections) || [];
  }
  const examOptions = cls => (typeof examDefs !== 'undefined' ? examDefs : []).filter(e => { try{ return classAllowedForExamType(e.examType, cls); }catch(x){ return true; } });

  function planCard(p, mgr){
    const meta = `${esc(p.className)} ${esc(p.section)} · ${esc(p.subject)}${p.examName ? ' · ' + esc(p.examName) : ''}`;
    const when = `${esc(dmy(p.examDate))}${p.startTime ? ' · ' + esc(p.startTime) : ''}${p.durationMin ? ' · ' + p.durationMin + ' min' : ''} · ${p.maxMarks} marks`;
    let acts = '';
    if(mgr){
      if(p.status === 'Submitted'){
        acts = noteFor === p.id
          ? `<div style="width:100%"><textarea id="epNote" rows="2" style="width:100%;padding:8px;border:1px solid #d6dcea;border-radius:10px;" placeholder="What should the teacher change?"></textarea></div>
             <button class="btn btn-primary btn-sm" onclick="epReturn('${esc(p.id)}')">Send back</button><button class="btn btn-ghost btn-sm" onclick="epNote(null)">Cancel</button>`
          : `<button class="btn btn-primary btn-sm" onclick="epApprove('${esc(p.id)}')">Approve</button><button class="btn btn-ghost btn-sm" onclick="epNote('${esc(p.id)}')">Send back with a note</button>`;
      }
      acts += `<button class="btn btn-ghost btn-sm" onclick="epDelete('${esc(p.id)}')">Remove</button>`;
    }else{
      if(p.status !== 'Approved') acts = `<button class="btn btn-primary btn-sm" onclick="epEdit('${esc(p.id)}')">${p.status === 'Returned' ? 'Edit &amp; resubmit' : 'Edit'}</button><button class="btn btn-ghost btn-sm" onclick="epDelete('${esc(p.id)}')">Withdraw</button>`;
    }
    return `<div class="ep-row"><div class="ep-top"><div><b>${meta}</b><div class="ep-sm">${when}${mgr ? ' · by ' + esc(p.staffName) : ''}</div></div>${pill(p.status)}</div>
      <div class="ep-sm"><b>Syllabus:</b> ${esc(p.syllabus)}</div>${p.instructions ? `<div class="ep-sm"><b>Instructions:</b> ${esc(p.instructions)}</div>` : ''}
      ${p.status === 'Returned' && p.reviewNote ? `<div class="ep-note"><b>${esc(p.reviewedBy || 'Principal')}:</b> ${esc(p.reviewNote)}</div>` : ''}
      ${acts ? `<div class="ep-acts">${acts}</div>` : ''}</div>`;
  }

  function formHtml(){
    const tg = targets();
    if(!tg.length) return `<div class="ep-sm">${(myTeacherScope() || {}).unlinked ? 'Your login is not linked to a staff profile yet — please ask the Admin.' : 'No classes or subjects are assigned to you yet — please ask the Admin.'}</div>`;
    const classes = [...new Set(tg.map(t => t.className))];
    const e = editing || {};
    return `<div class="ep-form">
      <div><label>Class</label><select id="epClass">${classes.map(c => `<option ${c === e.className ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div><label>Section</label><select id="epSection"></select></div>
      <div><label>Subject</label><select id="epSubject"></select></div>
      <div><label>Exam</label><select id="epExam"></select></div>
      <div id="epOtherBox" style="display:none"><label>Name of the test</label><input id="epOther" maxlength="200" placeholder="e.g. Unit test 2" value="${esc(e.examId ? '' : (e.examName || ''))}"></div>
      <div class="full"><label>Syllabus / chapters covered</label><textarea id="epSyl" rows="3" maxlength="3000" placeholder="e.g. Chapters 1 to 3, exercises 1.1–3.4">${esc(e.syllabus || '')}</textarea></div>
      <div><label>Maximum marks</label><input type="number" id="epMarks" min="1" max="1000" value="${esc(e.maxMarks || 25)}"></div>
      <div><label>Exam date</label><input type="date" id="epDate" min="${localDateStr(new Date())}" value="${esc(e.examDate || '')}"></div>
      <div><label>Start time</label><input type="time" id="epTime" value="${esc(e.startTime || '')}"></div>
      <div><label>Duration (minutes)</label><input type="number" id="epDur" min="5" max="600" value="${esc(e.durationMin || 60)}"></div>
      <div class="full"><label>Instructions for students (optional)</label><textarea id="epInstr" rows="2" maxlength="2000" placeholder="e.g. Bring geometry box. No calculators.">${esc(e.instructions || '')}</textarea></div>
      <div class="full"><button class="btn btn-primary" id="epSubmit" onclick="epSubmit()">${editing ? 'Resubmit for approval' : 'Submit for approval'}</button>${editing ? ' <button class="btn btn-ghost" onclick="epEdit(null)">Cancel</button>' : ''} <span class="ep-sm" id="epMsg"></span></div>
    </div>`;
  }
  function wireForm(){
    if(!$('epClass')) return;
    const tg = targets(), e = editing || {};
    const fillSec = () => {
      const c = $('epClass').value; const secs = [...new Set(tg.filter(t => t.className === c).map(t => t.section))];
      $('epSection').innerHTML = secs.map(x => `<option ${x === e.section ? 'selected' : ''}>${esc(x)}</option>`).join(''); fillSub(); fillExam();
    };
    const fillSub = () => {
      const c = $('epClass').value, sec = $('epSection').value; const subs = [...new Set(tg.filter(t => t.className === c && t.section === sec).map(t => t.subject))];
      $('epSubject').innerHTML = subs.map(x => `<option ${x === e.subject ? 'selected' : ''}>${esc(x)}</option>`).join('');
    };
    const fillExam = () => {
      const c = $('epClass').value; const ex = examOptions(c);
      $('epExam').innerHTML = ex.map(x => `<option value="${esc(x.id)}" ${x.id === e.examId ? 'selected' : ''}>${esc(x.name)}</option>`).join('') + `<option value="" ${e.id && !e.examId ? 'selected' : ''}>Other / class test…</option>`;
      showOther();
    };
    const showOther = () => { $('epOtherBox').style.display = $('epExam').value === '' ? '' : 'none'; };
    $('epClass').onchange = fillSec; $('epSection').onchange = fillSub; $('epExam').onchange = showOther;
    fillSec();
  }

  async function render(){
    const el = $('view-examplans'); if(!el) return;
    try{ plans = await api('GET', '/api/exam-plans'); }catch(e){ plans = []; }
    const mgr = isMgr();
    const waiting = plans.filter(p => p.status === 'Submitted');
    el.innerHTML = `<div class="topbar"><div><h1>Exam Plans</h1><p>${mgr ? 'Teachers submit their exam plans here. Approve them or send them back with a note.' : 'Plan an exam for your subject and submit it. The Principal approves it before students see it.'}</p></div></div>
      ${mgr ? `<div class="ep-card"><h3>Waiting for your approval ${waiting.length ? `<span style="background:#fdf0d0;color:#8a5a00;border-radius:999px;padding:2px 10px;font-size:.8rem;">${waiting.length}</span>` : ''}</h3>${waiting.length ? waiting.map(p => planCard(p, true)).join('') : '<div class="ep-sm">Nothing is waiting. 🎉</div>'}</div>
        <div class="ep-card"><h3>All plans</h3>${plans.filter(p => p.status !== 'Submitted').length ? plans.filter(p => p.status !== 'Submitted').map(p => planCard(p, true)).join('') : '<div class="ep-sm">No other plans yet.</div>'}</div>`
      : `<div class="ep-card"><h3>${editing ? 'Edit plan' : 'Plan a new exam'}</h3>${formHtml()}</div>
         <div class="ep-card"><h3>My exam plans</h3>${plans.length ? plans.map(p => planCard(p, false)).join('') : '<div class="ep-sm">You have not planned any exam yet.</div>'}</div>`}`;
    if(!mgr) wireForm();
  }

  window.epEdit = function(id){ editing = id ? plans.find(p => p.id === id) || null : null; render().then(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };
  window.epNote = function(id){ noteFor = id; render(); };
  window.epSubmit = async function(){
    const exId = $('epExam').value; const ex = (typeof examDefs !== 'undefined' ? examDefs : []).find(x => x.id === exId);
    const examName = exId ? (ex ? ex.name : '') : ($('epOther').value || '').trim();
    if(!exId && !examName){ toast('Please type the name of the test.'); return; }
    const body = { examId: exId, examName, className: $('epClass').value, section: $('epSection').value, subject: $('epSubject').value, syllabus: $('epSyl').value,
      maxMarks: $('epMarks').value, examDate: $('epDate').value, startTime: $('epTime').value, durationMin: $('epDur').value, instructions: $('epInstr').value };
    const btn = $('epSubmit'); btn.disabled = true;
    try{
      if(editing) await api('PUT', '/api/exam-plans/' + encodeURIComponent(editing.id), body); else await api('POST', '/api/exam-plans', body);
      toast('Submitted for approval.'); editing = null; render();
    }catch(e){ toast(e.message); btn.disabled = false; }
  };
  window.epDelete = async function(id){
    const ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog('Remove this exam plan?', { title: 'Remove plan', okText: 'Remove', cancelText: 'Cancel' }) : true;
    if(!ok) return;
    try{ await api('DELETE', '/api/exam-plans/' + encodeURIComponent(id)); render(); }catch(e){ toast(e.message); }
  };
  window.epReturn = async function(id){
    const note = ($('epNote') || {}).value || '';
    try{ await api('POST', '/api/exam-plans/' + encodeURIComponent(id) + '/review', { action: 'return', note }); noteFor = null; toast('Sent back to the teacher.'); render(); }catch(e){ toast(e.message); }
  };
  // Writes the approved date (and the subject, if the exam does not have it yet) into the exam schedule.
  async function applyToSchedule(p){
    if(!p.examId) return '';
    try{
      await ensureDataLoaded('exams', loadExams);
      const exam = examDefs.find(e => e.id === p.examId); if(!exam) return '';
      exam.classSubjects = exam.classSubjects || {};
      const key = classSecKey(p.className, p.section);
      const list = exam.classSubjects[key] ? exam.classSubjects[key].slice() : (exam.subjects ? exam.subjects.slice() : []);
      const found = list.find(s => String(s.name).trim().toLowerCase() === String(p.subject).trim().toLowerCase());
      let note = '';
      if(found){ found.date = p.examDate; if(Number(found.maxMarks) !== Number(p.maxMarks)) note = ' Max marks in the exam (' + found.maxMarks + ') were left unchanged — the plan says ' + p.maxMarks + '.'; }
      else list.push({ name: p.subject, code: '', maxMarks: Number(p.maxMarks), internalMax: 0, date: p.examDate, staffIds: p.staffId ? [p.staffId] : [], countable: true, elective: false });
      exam.classSubjects[key] = list;
      await storageSet(EXAM_DEFS_KEY, examDefs);
      return ' Added to the ' + exam.name + ' schedule.' + note;
    }catch(e){ console.error('apply plan to schedule', e); return ' (Could not update the exam schedule — please add the date in Manage Exams.)'; }
  }
  window.epApprove = async function(id){
    const p = plans.find(x => x.id === id); if(!p) return;
    try{
      await api('POST', '/api/exam-plans/' + encodeURIComponent(id) + '/review', { action: 'approve' });
      const extra = await applyToSchedule(p);
      toast('Approved. The class has been notified.' + extra); render();
    }catch(e){ toast(e.message); }
  };

  const prev = window.switchView;
  window.switchView = function(view){
    if(!isStaff()){ const sv = $('view-examplans'); if(sv) sv.style.display = 'none'; const sn = $('navExamPlans'); if(sn) sn.remove(); return prev.apply(this, arguments); }
    ensureShell();
    if(view !== 'examplans'){
      const r = prev.apply(this, arguments);
      const v = $('view-examplans'); if(v) v.style.display = 'none';
      const n = $('navExamPlans'); if(n) n.classList.remove('active');
      return r;
    }
    const root = $('view-dashboard') ? $('view-dashboard').parentNode : null;
    if(root) Array.from(root.children).forEach(c => { if(c.id && c.id.indexOf('view-') === 0 && c.id !== 'view-examplans') c.style.display = 'none'; });
    document.querySelectorAll('.sb-link.active').forEach(b => b.classList.remove('active'));
    const n = $('navExamPlans'); if(n) n.classList.add('active');
    $('view-examplans').style.display = 'block';
    try{ closeMobileSidebar(); }catch(e){}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    editing = null; noteFor = null; render();
  };
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){
      const r = o.apply(this, arguments);
      if(!isStaff()){ const sv = $('view-examplans'); if(sv) sv.style.display = 'none'; const sn = $('navExamPlans'); if(sn) sn.remove(); return r; }
      try{ ensureShell(); if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility(); }catch(e){}
      return r;
    };
  }
})();
