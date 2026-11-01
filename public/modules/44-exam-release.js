/* ============================================================================
   Releasing marks to students and parents.
   Marks a teacher enters stay hidden from Student and Parent logins until the Admin or Principal
   releases that exam for a class (Manage Exams -> Release). Exams that already existed when this was
   switched on stay visible. The server does the hiding; this file is the Release screen and the small
   "Revised" note on a student's Marks tab. Nothing else changes for teachers or office staff.
   ========================================================================== */
(function(){
  const KEY = 'exam-releases';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMgr = () => { try { return !!currentUser && ['Admin','Principal'].includes(currentUser.role); } catch(e){ return false; } };
  let rel = null, relExam = '', initDone = false, busy = false;
  try{ OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; }catch(e){}

  const fmt = iso => { if(!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };
  async function load(){
    let v = await storageGet(KEY, {});
    if(!v || typeof v !== 'object' || Array.isArray(v)) v = {};
    rel = { legacy: Array.isArray(v.legacy) ? v.legacy : null, released: v.released || {}, revised: v.revised || {} };
    return rel;
  }
  async function save(){ await storageSet(KEY, rel); }

  // First time an Admin/Principal signs in after this feature arrives: every exam that exists now stays visible to students.
  async function initIfNeeded(){
    if(initDone || !isMgr()) return; initDone = true;
    try{
      await load();
      if(rel.legacy === null){
        await Promise.all([ensureDataLoaded('exams', loadExams), ensureDataLoaded('examResults', loadExamResultsData)]);
        const withMarks = new Set(examResults.map(r => r.examId));
        rel.legacy = examDefs.filter(e => withMarks.has(e.id)).map(e => e.id);
        await save();
      }
    }catch(e){ initDone = false; console.error('exam release setup', e); }
  }

  const releasedFor = (examId, cls) => !!(rel && ((rel.legacy || []).includes(examId) || (rel.released || {})[examId + '|' + cls]));

  function completeness(exam, cls){
    let expected = 0, entered = 0; const missing = [];
    sectionsForClass(cls).forEach(sec => {
      const subs = getExamSubjects(exam, cls, sec);
      const list = students.filter(s => s.className === cls && s.section === sec && isActive(s));
      subs.forEach(subj => {
        let miss = 0;
        list.forEach(st => { expected++; if(examResults.find(r => r.examId === exam.id && r.studentId === st.id && r.subject === subj.name)) entered++; else miss++; });
        if(miss) missing.push(cls + ' ' + sec + ' · ' + subj.name + ': ' + miss + ' student' + (miss === 1 ? '' : 's'));
      });
    });
    return { expected, entered, missing };
  }

  async function renderRelease(body){
    body.innerHTML = '<div class="empty-state"><b>Loading…</b></div>';
    try{
      await Promise.all([ensureDataLoaded('exams', loadExams), ensureDataLoaded('examResults', loadExamResultsData), load()]);
    }catch(e){ body.innerHTML = '<div class="empty-state"><b>Could not load.</b>Please refresh and try again.</div>'; return; }
    if(!examDefs.length){ body.innerHTML = '<div class="empty-state"><b>No exams yet</b></div>'; return; }
    if(!relExam || !examDefs.find(e => e.id === relExam)) relExam = examDefs[0].id;
    const exam = examDefs.find(e => e.id === relExam);
    const rows = classLevelsForExamType(exam.examType).map(cls => {
      const c = completeness(exam, cls);
      if(!c.expected) return '';
      const done = releasedFor(exam.id, cls), legacy = (rel.legacy || []).includes(exam.id);
      const info = (rel.released || {})[exam.id + '|' + cls], rv = (rel.revised || {})[exam.id + '|' + cls];
      const pct = Math.round(100 * c.entered / c.expected);
      const status = done
        ? `<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Released</span>${legacy || (info && !info.at) ? '<div class="sf-sub" style="font-size:0.75rem;">Was already visible</div>' : info ? `<div style="font-size:0.75rem;">${fmt(info.at)} · ${esc(info.by || '')}</div>` : ''}${rv ? `<div style="font-size:0.75rem; color:#8a5a00;">Revised ${fmt(rv)}</div>` : ''}`
        : '<span class="balance-tag due">Hidden from students</span>';
      const btn = done
        ? `<button class="btn btn-ghost btn-sm" onclick="examRelHide('${esc(exam.id)}','${esc(cls)}')">Hide again</button>`
        : `<button class="btn btn-primary btn-sm" onclick="examRelRelease('${esc(exam.id)}','${esc(cls)}')">Release to students</button>`;
      return `<tr><td><b>${esc(cls)}</b></td><td>${c.entered} of ${c.expected} <span style="color:var(--ink-soft);">(${pct}%)</span>${c.missing.length ? `<details style="margin-top:4px;"><summary style="cursor:pointer; font-size:0.78rem; color:#8a5a00;">Missing marks</summary><div style="font-size:0.78rem;">${c.missing.slice(0, 12).map(esc).join('<br>')}${c.missing.length > 12 ? '<br>and ' + (c.missing.length - 12) + ' more' : ''}</div></details>` : ''}</td><td>${status}</td><td>${btn}</td></tr>`;
    }).join('');
    body.innerHTML = `
      <p style="color:var(--ink-soft); max-width:720px;">Marks teachers enter stay hidden from students and parents until you release them here, class by class. You can hide an exam again if a mistake is found. After release, changes go through the normal correction request and show as "Revised" on the student's card.</p>
      <div class="f-field" style="max-width:320px; margin:14px 0;"><label>Exam</label>
        <select onchange="relExam=this.value; examRelRedraw();">${examDefs.map(e => `<option value="${esc(e.id)}" ${e.id === relExam ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
      <div class="table-wrap"><table><thead><tr><th>Class</th><th>Marks entered</th><th>Students can see</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">No classes with subjects set up for this exam yet.</td></tr>'}</tbody></table></div>`;
  }
  window.examRelRedraw = function(){ const b = document.getElementById('examBody'); if(b) renderRelease(b); };
  Object.defineProperty(window, 'relExam', { get(){ return relExam; }, set(v){ relExam = v; }, configurable: true });

  window.examRelRelease = async function(examId, cls){
    if(busy) return; busy = true;
    try{
      const exam = examDefs.find(e => e.id === examId); const c = completeness(exam, cls);
      let ok = true;
      if(c.missing.length){
        const msg = c.entered + ' of ' + c.expected + ' marks are entered for ' + cls + '. Some are missing (for example: ' + c.missing.slice(0, 3).join('; ') + '). Release anyway?';
        ok = (typeof showConfirmDialog === 'function') ? await showConfirmDialog(msg, { title: 'Release marks?', okText: 'Release anyway' }) : window.confirm(msg);
      }
      if(!ok) return;
      await load(); rel.released[examId + '|' + cls] = { at: new Date().toISOString(), by: currentUser.name }; delete rel.revised[examId + '|' + cls];
      await save(); showToast('Marks released to ' + cls + ' students and parents.');
    }catch(e){ showToast('Could not release: ' + (e && e.message || 'try again')); }
    finally{ busy = false; examRelRedraw(); }
  };
  window.examRelHide = async function(examId, cls){
    if(busy) return; busy = true;
    try{
      await load();
      if((rel.legacy || []).includes(examId)){
        // this exam was visible before the Release step existed: keep every other class visible, hide only this one
        const exam = examDefs.find(e => e.id === examId);
        classLevelsForExamType(exam && exam.examType).forEach(c => { if(c !== cls && !rel.released[examId + '|' + c]) rel.released[examId + '|' + c] = { at: '', by: 'Already visible' }; });
        rel.legacy = rel.legacy.filter(x => x !== examId);
      }
      delete rel.released[examId + '|' + cls]; delete rel.revised[examId + '|' + cls];
      await save(); showToast('Marks hidden from ' + cls + ' students again.');
    }catch(e){ showToast('Could not hide: ' + (e && e.message || 'try again')); }
    finally{ busy = false; examRelRedraw(); }
  };

  /* ---- the tab, for Admin and Principal only ---- */
  function ensureTab(){
    if(!isMgr()){ const old = document.getElementById('extab-release'); if(old) old.remove(); return; }
    if(document.getElementById('extab-release')) return;
    const anchor = document.getElementById('extab-entrystatus'); if(!anchor) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mf-tab'; b.id = 'extab-release'; b.textContent = 'Release';
    b.setAttribute('onclick', "switchExamTab('release')"); anchor.insertAdjacentElement('afterend', b);
  }
  if(typeof initExamsView === 'function'){
    const o = initExamsView;
    window.initExamsView = function(){ const r = o.apply(this, arguments); try{ ensureTab(); initIfNeeded(); }catch(e){} return r; };
  }
  if(typeof switchExamTab === 'function'){
    const o = switchExamTab;
    window.switchExamTab = function(tab){
      const r = o.apply(this, arguments);
      const b = document.getElementById('extab-release'); if(b) b.classList.toggle('active', tab === 'release');
      return r;
    };
  }
  if(typeof renderExamBody === 'function'){
    const o = renderExamBody;
    window.renderExamBody = function(){
      if(typeof examTab !== 'undefined' && examTab === 'release' && isMgr()){ const b = document.getElementById('examBody'); if(b) return renderRelease(b); }
      return o.apply(this, arguments);
    };
  }
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){ const r = o.apply(this, arguments); try{ ensureTab(); initIfNeeded(); }catch(e){} return r; };
  }

  /* ---- student / parent Marks tab: show "Revised" when a released mark was corrected ---- */
  if(typeof renderMyMarksTab === 'function'){
    const o = renderMyMarksTab;
    window.renderMyMarksTab = function(body, s){
      const r = o.apply(this, arguments);
      (async () => {
        try{
          const v = await storageGet(KEY, {}); const rv = (v && v.revised) || {};
          examDefs.forEach(ex => {
            const at = rv[ex.id + '|' + s.className]; if(!at) return;
            Array.from(body.querySelectorAll('h4')).filter(h => h.textContent.trim() === String(ex.name).trim()).forEach(h => {
              if(h.parentNode.querySelector('.md-rev')) return;
              const t = document.createElement('p'); t.className = 'md-rev'; t.style.cssText = 'font-size:0.78rem; color:#8a5a00; margin:4px 0 0; font-weight:600;';
              t.textContent = 'Revised on ' + fmt(at); h.parentNode.appendChild(t);
            });
          });
        }catch(e){}
      })();
      return r;
    };
  }

  /* ---- "Marks coming soon": once teachers have started entering marks for an exam that is not released yet, the student and parent
          see a short notice (Notifications and Marks tabs) instead of nothing. The server only says WHICH exams are in progress, never any marks. ---- */
  let pendingExams = null, pendingAt = 0, pendingBusy = false;
  const isParentLogin = () => { try { return !!currentUser && ['Student','Parent'].includes(currentUser.role); } catch(e){ return false; } };
  async function refreshPending(){
    if(pendingBusy) return false; pendingBusy = true;
    try{
      const r = await fetch('/api/my-exam-status', { credentials: 'include' });
      const list = r.ok ? await r.json() : [];
      const next = Array.isArray(list) ? list.map(x => x.examId).sort() : [];
      const changed = JSON.stringify(next) !== JSON.stringify(pendingExams);
      pendingExams = next; pendingAt = Date.now(); return changed;
    }catch(e){ pendingExams = pendingExams || []; return false; }
    finally{ pendingBusy = false; }
  }
  const examName = id => { const e = (typeof examDefs !== 'undefined' ? examDefs : []).find(x => x.id === id); return e ? e.name : ''; };
  if(typeof computeMyNotifications === 'function'){
    const o = computeMyNotifications;
    window.computeMyNotifications = function(s){
      const items = o.apply(this, arguments);
      if(isParentLogin() && Array.isArray(pendingExams)){
        const today = new Date().toISOString().slice(0, 10);
        pendingExams.forEach(id => { const n = examName(id); if(n) items.push({ icon:'⏳', tag:'Results', date: today, title: 'Marks coming soon: ' + n, detail: 'Teachers are entering the marks. They will appear in the Marks tab once the school publishes them.' }); });
        items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      }
      return items;
    };
  }
  if(typeof renderMyNotificationsTab === 'function'){
    const o = renderMyNotificationsTab;
    window.renderMyNotificationsTab = function(body, s){
      const r = o.apply(this, arguments);
      if(isParentLogin() && (pendingExams === null || Date.now() - pendingAt > 60000)) refreshPending().then(ch => { if(ch && body.isConnected) o.call(this, body, s); });
      return r;
    };
  }
  if(typeof renderMyMarksTab === 'function'){
    const o = renderMyMarksTab;
    const addCards = body => {
      if(!Array.isArray(pendingExams) || !pendingExams.length) return;
      body.querySelectorAll('.md-soon').forEach(x => x.remove());
      const empty = body.querySelector('.empty-state'); if(empty) empty.remove();
      const html = pendingExams.map(id => ({ id, n: examName(id) })).filter(x => x.n).map(x => `<div class="profile-card md-soon" style="margin-bottom:14px;"><h4 style="margin:0 0 4px;">${esc(x.n)}</h4><p style="font-size:0.85rem; color:var(--ink-soft); margin:0;">⏳ Teachers are entering the marks. They will be published here soon.</p></div>`).join('');
      body.insertAdjacentHTML('afterbegin', html);
    };
    window.renderMyMarksTab = function(body, s){
      const r = o.apply(this, arguments);
      if(isParentLogin()){
        addCards(body);
        if(pendingExams === null || Date.now() - pendingAt > 60000) refreshPending().then(ch => { if(ch && body.isConnected){ o.call(this, body, s); addCards(body); } });
      }
      return r;
    };
  }
})();
