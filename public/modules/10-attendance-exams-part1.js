const ROOMS_KEY = "exam-rooms";
  const EXAM_HALL_TICKETS_KEY = "exam-hall-tickets";
  const EXAM_ROOM_CONFIG_KEY = "exam-room-config";
  API_BACKED_KEYS[ROOMS_KEY] = '/api/rooms';
  API_BACKED_KEYS[EXAM_HALL_TICKETS_KEY] = '/api/exam-hall-tickets';
  API_BACKED_KEYS[EXAM_ROOM_CONFIG_KEY] = '/api/exam-room-config';
  let rooms = [];
  let examHallTickets = [];
  let examRoomConfigs = []; // one record per exam: { id: examId, selectedClasses, orientation, pageSize }
  async function loadRooms(){
    rooms = await storageGet(ROOMS_KEY, []);
  }
  async function loadExamHallTickets(){
    examHallTickets = await storageGet(EXAM_HALL_TICKETS_KEY, []);
  }
  async function loadExamRoomConfigs(){
    examRoomConfigs = await storageGet(EXAM_ROOM_CONFIG_KEY, []);
  }

  function classSecKey(className, section){
    return className + '||' + section;
  }
  function getExamSubjects(exam, className, section){
    if(!exam) return [];
    exam.classSubjects = exam.classSubjects || {};
    return exam.classSubjects[classSecKey(className, section)] || exam.subjects || [];
  }
  function examTypeByName(name){
    return examTypes.find(t => t.name === name);
  }
  // Empty scopeClasses means "every class" (the default for ordinary exam
  // types) — only an explicit, non-empty list narrows it, which is how
  // something like Prefinals gets locked to 10th Class only.
  function classAllowedForExamType(typeName, className){
    const type = examTypeByName(typeName);
    if(!type || !type.scopeClasses || type.scopeClasses.length === 0) return true;
    return type.scopeClasses.includes(className);
  }
  function classLevelsForExamType(typeName){
    const type = examTypeByName(typeName);
    if(!type || !type.scopeClasses || type.scopeClasses.length === 0) return CLASS_LEVELS;
    return CLASS_LEVELS.filter(c => type.scopeClasses.includes(c));
  }
  // --- Narrowing the Staff picker in the exam Subject modal to the teachers who
  // actually deal with a given class, using the master Subjects catalog
  // (Manage Subjects) as the source of truth, so admins aren't scrolling the
  // whole staff list to find the right teacher for every single subject.
  function classDealingStaffIds(className){
    const ids = new Set();
    subjectsList.filter(s => s.className === className).forEach(s => (s.staffIds||[]).forEach(id => ids.add(id)));
    return ids;
  }
  // If `name` matches a master-subject name for this class, its own assigned
  // staff is the most precise match; otherwise null (not "unmatched but empty").
  function masterSubjectStaffIds(className, name){
    const match = subjectsList.find(s => s.className === className && s.name.trim().toLowerCase() === String(name||'').trim().toLowerCase());
    return match ? (match.staffIds || []) : null;
  }
  // Picks the narrowest useful staff pool for this class/subject: that exact
  // subject's own teachers if the name matches a master-subject record, else
  // anyone who teaches this class at all, else (no master-subject data yet)
  // everyone — label is null in that last case, meaning "nothing to narrow by".
  function examSubjStaffCandidates(className, name){
    const bySubject = masterSubjectStaffIds(className, name);
    if(bySubject && bySubject.length) return { ids: bySubject, label: `teachers assigned to "${name}" in ${className}` };
    const byClass = classDealingStaffIds(className);
    if(byClass.size) return { ids: Array.from(byClass), label: `teachers who teach ${className}` };
    return { ids: staffList.map(s => s.id), label: null };
  }
  // A class's own start/end for THIS exam, derived from whatever subject
  // dates have actually been set for it (across its sections) — not a
  // separate stored field, so it can never drift out of sync with the real
  // per-subject schedule. This is what lets two classes sit on the same
  // "Formative Assessment 1" exam but start on different calendar days.
  function classExamDateRange(exam, className){
    const dates = [];
    SECTIONS.forEach(sec => getExamSubjects(exam, className, sec).forEach(s => { if(s.date) dates.push(s.date); }));
    if(dates.length === 0) return null;
    dates.sort();
    return { start: dates[0], end: dates[dates.length-1] };
  }

  // A report template can carry its own explicit signature image (uploaded once,
  // used for every student it prints) — but when it doesn't, fall back to the
  // real Class Teacher's own uploaded signature (via classTeacherClass/Section on
  // their Staff Profile) and the school's Principal/Correspondent signature, so
  // reports don't need to be signed by hand at all.
  function classTeacherSignatureFor(className, section){
    const teacher = staffList.find(st => st.classTeacherClass===className && st.classTeacherSection===section && isActive(st));
    return teacher ? (teacher.signature||'') : '';
  }
  function resolveReportSignature1(t, s){
    return (t && t.sigImage1) ? t.sigImage1 : classTeacherSignatureFor(s.className, s.section);
  }
  function resolveReportSignature2(t){
    return (t && t.sigImage2) ? t.sigImage2 : (schoolInfo.principalSignature || '');
  }

  let examTab = 'exams';
  let examMarksView = 'grid';
  let examCurrentClass = '', examCurrentSection = '', examCurrentExamId = '';
  let examSubjView = 'list';
  let resultsFilters = { examId:'', className:'', section:'' };

  const EXAMS_TAB_PERM_KEYS = { exams:'exams_definitions', marks:'exams_marks', entrystatus:'exams_entrystatus', results:'exams_results', holidays:'exams_holidays' };
  function initExamsView(){
    document.getElementById('exAyBadge').textContent = 'AY ' + currentAcademicYearValue;
    const accessibleTabs = Object.keys(EXAMS_TAB_PERM_KEYS).filter(t => getExamsTabAccess(currentUser.role, EXAMS_TAB_PERM_KEYS[t]));
    Object.keys(EXAMS_TAB_PERM_KEYS).forEach(t => { const btn = document.getElementById('extab-'+t); if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none'; });
    if(!accessibleTabs.includes(examTab)) examTab = accessibleTabs[0] || 'exams';
    switchExamTab(examTab);
  }

  function switchExamTab(tab){
    examTab = tab;
    ['exams','marks','entrystatus','results','holidays'].forEach(t => {
      const el = document.getElementById('extab-'+t);
      if(el) el.classList.toggle('active', t===tab);
    });
    if(tab === 'marks') examMarksView = 'grid';
    if(tab === 'exams') examSubjView = 'list';
    renderExamBody();
  }

  async function renderExamBody(){
    // Marks entry, entry-status and results tabs all read examResults.
    await ensureDataLoaded('examResults', loadExamResultsData);
    const body = document.getElementById('examBody');
    if(!body) return;
    if(!getExamsTabAccess(currentUser.role, EXAMS_TAB_PERM_KEYS[examTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(examTab === 'exams'){
      if(examSubjView === 'list') return renderExamsListTab(body);
      if(examSubjView === 'grid') return renderSubjConfigGrid(body);
      if(examSubjView === 'editor') return renderSubjConfigEditor(body);
    }
    if(examTab === 'marks'){
      if(examMarksView === 'grid') return renderMarksClassGrid(body);
      if(examMarksView === 'sheet') return renderMarksSheet(body);
    }
    if(examTab === 'entrystatus') return renderMarksEntryStatusTab(body);
    if(examTab === 'results') return renderResultsSummaryTab(body);
    if(examTab === 'holidays') return renderExamHolidaysTab(body);
  }

  /* --- Marks Entry Status: which classes/sections/students have marks entered --- */
  let meStatusExamId = '';
  function renderMarksEntryStatusTab(body){
    if(examDefs.length === 0){ body.innerHTML = `<div class="empty-state"><b>No exams yet</b></div>`; return; }
    if(!meStatusExamId || !examDefs.find(e => e.id === meStatusExamId)) meStatusExamId = examDefs[0].id;
    const exam = examDefs.find(e => e.id === meStatusExamId);
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${meStatusExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    const scope = myTeacherScope();
    const rows = [];
    classLevelsForExamType(exam && exam.examType).forEach(cls => {
      SECTIONS.forEach(sec => {
        if(scope && !scope.subjectSections.some(ss => ss.className===cls && ss.section===sec)) return;
        let subjects = getExamSubjects(exam, cls, sec);
        if(scope){
          const mySubjectNames = new Set(scope.subjectSections.filter(ss => ss.className===cls && ss.section===sec).map(ss => ss.subject));
          subjects = subjects.filter(s => mySubjectNames.has(s.name));
        }
        if(subjects.length === 0) return;
        const list = students.filter(s => s.className===cls && s.section===sec && isActive(s));
        if(list.length === 0) return;
        const entered = list.filter(s => subjects.every(subj => examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name))).length;
        rows.push({ cls, sec, total: list.length, entered, subjects: subjects.length, students: list });
      });
    });
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:20px;">
        <label>Exam</label>
        <select id="meStatusExamSelect" onchange="meStatusExamId=this.value; renderExamBody();">${examOptions}</select>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Class</th><th>Section</th><th>Subjects</th><th>Students</th><th>Marks Entered</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${rows.map((r,i) => `
          <tr>
            <td>${r.cls}</td><td><span class="pill">Section ${r.sec}</span></td><td>${r.subjects}</td><td>${r.total}</td>
            <td>${r.entered} / ${r.total}</td>
            <td>${r.entered===r.total ? '<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Complete</span>' : r.entered===0 ? '<span class="balance-tag due">Not started</span>' : '<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">In progress</span>'}</td>
            <td><button class="btn-edit-text" onclick="toggleEntryStatusDetail(${i})">View Students</button>&nbsp;·&nbsp;<button class="btn-edit-text" onclick="jumpToMarksEntry('${r.cls}','${r.sec}')">Enter Marks</button></td>
          </tr>
          <tr id="meDetail-${i}" style="display:none;"><td colspan="7">
            <div class="table-wrap" style="margin:6px 0 12px;">
              <table><thead><tr><th>Student</th><th>Status</th></tr></thead><tbody>
              ${r.students.map(s => {
                const subjects = getExamSubjects(exam, r.cls, r.sec);
                const done = subjects.every(subj => examResults.find(x => x.examId===exam.id && x.studentId===s.id && x.subject===subj.name));
                return `<tr><td>${s.lastName} ${s.firstName}</td><td>${done ? '<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Entered</span>' : '<span class="balance-tag due">Pending</span>'}</td></tr>`;
              }).join('')}
              </tbody></table>
            </div>
          </td></tr>
        `).join('')}
        </tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No subjects configured for this exam yet</b>Set up subjects for a class under the "Exams" tab first.</div>` : ``}
      </div>
    `;
  }
  function toggleEntryStatusDetail(i){
    const row = document.getElementById('meDetail-'+i);
    if(row) row.style.display = row.style.display==='none' ? 'table-row' : 'none';
  }
  function jumpToMarksEntry(cls, sec){
    examCurrentExamId = meStatusExamId;
    examCurrentClass = cls; examCurrentSection = sec;
    switchExamTab('marks');
    examMarksView = 'sheet';
    renderExamBody();
  }

  /* --- Result module (Admit Cards, Progress Reports, Consolidated, Grading Scale, Templates) --- */
  let resultTab = 'admitcards';
  const RESULT_TAB_PERM_KEYS = { admitcards:'result_admitcards', roomallotment:'result_roomallotment', progress:'result_progress', consolidated:'result_consolidated', yearend:'result_yearend', examtemplates:'result_examtemplates', grading:'result_grading', templates:'result_templates' };
  const RESULT_TABS = ['admitcards','roomallotment','progress','consolidated','yearend','examtemplates','grading','templates'];
  function initResultView(){
    document.getElementById('resAyBadge').textContent = 'AY ' + currentAcademicYearValue;
    const accessibleTabs = RESULT_TABS.filter(t => getResultTabAccess(currentUser.role, RESULT_TAB_PERM_KEYS[t]));
    RESULT_TABS.forEach(t => {
      const btn = document.getElementById('restab-'+t);
      if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none';
    });
    if(!accessibleTabs.includes(resultTab)) resultTab = accessibleTabs[0] || 'admitcards';
    switchResultTab(resultTab);
  }
  function switchResultTab(tab){
    resultTab = tab;
    RESULT_TABS.forEach(t => {
      const btn = document.getElementById('restab-'+t);
      if(btn) btn.classList.toggle('active', t===tab);
    });
    if(tab === 'admitcards') admitCardsView = 'grid';
    renderResultBody();
  }
  async function renderResultBody(){
    // Report Card / Consolidated tabs read examResults (marks) and
    // attendanceRecords (the attendance summary on a report card); Year-End
    // additionally reads yearEndRecords (frozen Finalized & Issued snapshots).
    await Promise.all([
      ensureDataLoaded('examResults', loadExamResultsData),
      ensureDataLoaded('attendanceRecords', loadAttendanceRecordsData),
      ensureDataLoaded('yearEndRecords', loadYearEndRecordsData),
    ]);
    const body = document.getElementById('resultBody');
    if(!body) return;
    if(!getResultTabAccess(currentUser.role, RESULT_TAB_PERM_KEYS[resultTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(resultTab === 'admitcards'){
      if(admitCardsView === 'grid') return renderAdmitCardsGrid(body);
      if(admitCardsView === 'roster') return renderAdmitCardsRoster(body);
    }
    if(resultTab === 'roomallotment') return renderRoomAllotmentTab(body);
    if(resultTab === 'progress') return renderReportCardsTab(body);
    if(resultTab === 'consolidated') return renderConsolidatedTab(body);
    if(resultTab === 'yearend') return renderYearEndTab(body);
    if(resultTab === 'examtemplates') return renderExamTemplatesTab(body);
    if(resultTab === 'grading') return renderGradingScaleTab(body);
    if(resultTab === 'templates') return renderReportTemplatesTab(body);
  }

  /* --- Exam Holidays --- */
  const EXAM_HOLIDAYS_KEY = "exam-holidays";
  OBJECT_BACKED_KEYS[EXAM_HOLIDAYS_KEY] = '/api/kv/' + EXAM_HOLIDAYS_KEY;
  const HOLIDAY_TYPES = {
    'Public Holiday': { bg:'rgba(24,143,134,0.15)', fg:'#0f6a63' },
    'National Holiday': { bg:'rgba(209,16,115,0.13)', fg:'var(--magenta)' },
    'Festival': { bg:'rgba(107,79,160,0.15)', fg:'#6b4fa0' },
    'Religious': { bg:'rgba(203,154,46,0.18)', fg:'#8a6a1f' },
    'Custom': { bg:'rgba(0,0,0,0.06)', fg:'var(--ink-soft)' },
  };
  let examHolidays = [];
  async function loadExamHolidays(){
    examHolidays = await storageGet(EXAM_HOLIDAYS_KEY, []);
  }
  function holidayBadge(type){
    const c = HOLIDAY_TYPES[type] || HOLIDAY_TYPES['Custom'];
    return `<span class="pill" style="background:${c.bg}; color:${c.fg};">${type}</span>`;
  }
  function renderExamHolidaysTab(body){
    const sorted = examHolidays.slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const counts = {};
    Object.keys(HOLIDAY_TYPES).forEach(t => counts[t] = 0);
    examHolidays.forEach(h => { const t = h.type||'Custom'; counts[t] = (counts[t]||0)+1; });
    const canCreateHol = canSub('exams_holidays','exams','create');
    const canDeleteHol = canSub('exams_holidays','exams','delete');
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:600px;">
        Mark holidays that fall during exam season — helpful when scheduling subject dates so you don't accidentally book a paper on a day off.
      </p>
      ${canCreateHol ? `<div class="form-grid" style="max-width:640px; margin-bottom:12px;">
        <div class="f-field"><label>Date</label><input type="date" id="newHolidayDate"></div>
        <div class="f-field"><label>Name</label><input type="text" id="newHolidayName" placeholder="e.g. Independence Day"></div>
        <div class="f-field"><label>Type</label>
          <select id="newHolidayType">${Object.keys(HOLIDAY_TYPES).map(t => `<option>${t}</option>`).join('')}</select>
        </div>
        <div class="f-field full"><label>Note</label><input type="text" id="newHolidayNote" placeholder="Optional"></div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-bottom:20px;" onclick="addExamHoliday()">+ Add Holiday</button>` : ''}
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:14px; font-size:0.85rem;">
        <b>Total: ${examHolidays.length} holiday${examHolidays.length===1?'':'s'}</b>
        ${Object.keys(HOLIDAY_TYPES).map(t => `${holidayBadge(t)} <span style="color:var(--ink-soft); margin-right:8px;">${counts[t]}</span>`).join('')}
      </div>
      <div class="table-wrap" style="max-width:760px;">
        <table><thead><tr><th>Holiday</th><th>Date</th><th>Type</th><th>Note</th><th></th></tr></thead>
        <tbody>
        ${sorted.length ? sorted.map(h => `<tr><td class="name-cell">${h.name}</td><td>${h.date}</td><td>${holidayBadge(h.type||'Custom')}</td><td>${h.note||'—'}</td><td>${canDeleteHol ? `<button class="btn-danger-text" onclick="removeExamHoliday('${h.date}','${h.name.replace(/'/g,"\\'")}')">Remove</button>` : ''}</td></tr>`).join('') : `<tr><td colspan="5"><div class="empty-state"><b>No holidays added yet</b></div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  async function addExamHoliday(){
    const date = document.getElementById('newHolidayDate').value;
    const name = document.getElementById('newHolidayName').value.trim();
    const type = document.getElementById('newHolidayType').value;
    const note = document.getElementById('newHolidayNote').value.trim();
    if(!date || !name){ showToast('Enter both a date and a name.'); return; }
    examHolidays.push({ date, name, type, note });
    await storageSet(EXAM_HOLIDAYS_KEY, examHolidays);
    renderExamHolidaysTab(document.getElementById('examBody'));
    showToast('Holiday added.', 'burst');
  }
  async function removeExamHoliday(date, name){
    examHolidays = examHolidays.filter(h => !(h.date===date && h.name===name));
    await storageSet(EXAM_HOLIDAYS_KEY, examHolidays);
    renderExamHolidaysTab(document.getElementById('examBody'));
  }


  /* --- Tab: Exams list + Exam Types + Subject configuration --- */
  function renderExamsListTab(body){
    const canCreate = canSub('exams_definitions','exams','create');
    const canEdit = canSub('exams_definitions','exams','edit');
    const canDelete = canSub('exams_definitions','exams','delete');
    const groupBadge = (g) => {
      const map = { formative:['Formative','rgba(46,111,158,0.14)','#2E6F9E'], summative:['Summative','rgba(24,143,134,0.15)','#0f6a63'], internal:['Internal only','rgba(203,154,46,0.18)','#8a6a1f'], other:['Other','rgba(0,0,0,0.06)','var(--ink-soft)'] };
      const [label,bg,fg] = map[g] || map.other;
      return `<span class="pill" style="background:${bg}; color:${fg};">${label}</span>`;
    };
    body.innerHTML = `
      <div class="profile-card" style="margin-bottom:20px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:4px;">
          <h4 style="margin:0;">Exam Types &amp; Year-End Weightage</h4>
          ${canCreate ? `<div style="display:flex; gap:8px;">
            ${examTypes.length===0 ? `<button class="btn btn-ghost btn-sm" onclick="quickSetupExamTypes()">⚡ Quick setup (FA×4 / SA1 / SA2 / Prefinals)</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="openExamTypeModal()">+ Add Exam Type</button>
          </div>` : ''}
        </div>
        <p style="font-size:0.82rem; color:var(--ink-soft); margin:4px 0 14px; max-width:680px;">Each type says what kind of assessment it is, and — like Prefinals — which classes it's even offered to. Individual exams (FA1, FA2, SA1…) are created below and tagged with one of these types. How much each type counts toward the Year-End result is configured separately, under <a onclick="switchView('result'); setTimeout(()=>switchResultTab('yearend'),0);" style="color:var(--magenta); cursor:pointer; font-weight:600;">Manage Result → Year-End → Consolidation Schemes</a>.</p>
        <div class="table-wrap">
          <table><thead><tr><th>Type</th><th>Kind</th><th>Offered To</th><th></th></tr></thead>
          <tbody>
          ${examTypes.length ? examTypes.map(t => `
            <tr>
              <td class="name-cell">${t.name}</td>
              <td>${groupBadge(t.group)}</td>
              <td>${t.scopeClasses && t.scopeClasses.length ? t.scopeClasses.map(c => `<span class="pill">${c}</span>`).join(' ') : 'All classes'}</td>
              <td>${canEdit ? `<button class="btn-edit-text" onclick="openExamTypeModal('${t.id}')">Edit</button>` : ''}${(canEdit && canDelete) ? ' · ' : ''}${canDelete ? `<button class="btn-danger-text" onclick="removeExamType('${t.id}')">Delete</button>` : ''}</td>
            </tr>
          `).join('') : `<tr><td colspan="4"><div class="empty-state"><b>No exam types yet</b>Use "Quick setup" for the standard Formative/Summative/Prefinals pattern, or add your own.</div></td></tr>`}
          </tbody></table>
        </div>
      </div>

      ${canCreate ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;"><button class="btn btn-primary" onclick="openExamModal()">+ Add Exam</button>${(canEdit && examDefs.length > 1) ? `<button class="btn btn-ghost" onclick="openExamCopyWizard()">⧉ Copy subjects from another exam</button>` : ''}</div>` : ''}
      ${examDefs.length ? examDefs.map(ex => {
        const type = examTypeByName(ex.examType);
        return `
        <div class="list-manage-row">
          <div><div class="lm-name">${ex.name}</div><div class="lm-meta">${ex.examType||'—'}${type && type.scopeClasses && type.scopeClasses.length ? ' · ' + type.scopeClasses.join(', ') + ' only' : ''} · ${ex.startDate ? (ex.startDate + (ex.endDate && ex.endDate!==ex.startDate ? ' – ' + ex.endDate : '')) : 'No dates set'}</div></div>
          <div style="display:flex; gap:10px;">
            ${canEdit ? `<button class="btn-edit-text" onclick="openSubjConfigGrid('${ex.id}')">Configure Subjects</button>` : ''}
            ${(canEdit && examDefs.length > 1) ? `<button class="btn-edit-text" onclick="openExamCopyWizard('${ex.id}')">Copy subjects</button>` : ''}
            ${canEdit ? `<button class="btn-edit-text" onclick="openExamModal('${ex.id}')">Edit</button>` : ''}
            ${canDelete ? `<button class="btn-danger-text" onclick="deleteExam('${ex.id}')">Delete</button>` : ''}
          </div>
        </div>
      `;}).join('') : `<div class="empty-state"><b>No exams yet</b>Click "+ Add Exam" to create your first one.</div>`}
    `;
  }
  async function quickSetupExamTypes(){
    if(examTypes.length > 0 && !await showConfirmDialog('This adds the standard Formative/Summative/Prefinals types alongside whatever you already have. Continue?')) return;
    const tenth = CLASS_LEVELS[CLASS_LEVELS.length-1]; // last class level = the board-exam class, "10th Class" by default
    const mk = (name, group, scopeClasses) => ({ id:'etype_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), name, group, scopeClasses });
    examTypes.push(
      mk('Formative Assessment', 'formative', []),
      mk('Summative Assessment 1', 'summative', []),
      mk('Summative Assessment 2 (Annual)', 'summative', []),
      mk('Prefinals', 'internal', [tenth]),
    );
    await storageSet(EXAM_TYPES_KEY, examTypes);
    renderExamsListTab(document.getElementById('examBody'));
    showToast('Standard exam types added — create FA1–FA4, SA1 and SA2 as exams under them, then set their weights under Year-End → Consolidation Schemes.', 'burst');
  }
  function openExamTypeModal(id){
    document.getElementById('examTypeForm').reset();
    document.getElementById('editExamTypeId').value = id || '';
    document.getElementById('examTypeModalTitle').textContent = id ? 'Edit Exam Type' : 'Add Exam Type';
    const t = id ? examTypes.find(x => x.id===id) : null;
    document.getElementById('etName').value = t ? t.name : '';
    document.getElementById('etGroup').value = t ? t.group : 'formative';
    document.getElementById('etScopeBox').innerHTML = CLASS_LEVELS.map(c => `
      <label class="admission-toggle"><input type="checkbox" class="et-scope-check" value="${c}" ${t && t.scopeClasses && t.scopeClasses.includes(c) ? 'checked' : ''}> ${c}</label>
    `).join('');
    document.getElementById('examTypeModalOverlay').classList.add('open');
  }
  function closeExamTypeModal(){
    document.getElementById('examTypeModalOverlay').classList.remove('open');
  }
  async function saveExamTypeModal(e){
    e.preventDefault();
    const id = document.getElementById('editExamTypeId').value;
    const name = document.getElementById('etName').value.trim();
    if(!name){ showToast('Enter a name for the exam type.'); return false; }
    const dup = examTypes.find(t => t.name.toLowerCase()===name.toLowerCase() && t.id!==id);
    if(dup){ showToast('An exam type with this name already exists.'); return false; }
    const scopeClasses = Array.from(document.querySelectorAll('.et-scope-check:checked')).map(c => c.value);
    const data = {
      name,
      group: document.getElementById('etGroup').value,
      scopeClasses,
    };
    if(id){
      const t = examTypes.find(x => x.id===id);
      const oldName = t.name;
      Object.assign(t, data);
      // Exams reference their type by name (not id), so a rename has to
      // cascade — otherwise every exam quietly falls back to an "unknown type".
      if(oldName !== name) examDefs.forEach(ex => { if(ex.examType === oldName) ex.examType = name; });
    } else {
      examTypes.push({ id:'etype_'+Date.now()+'_'+Math.random().toString(36).slice(2,7), ...data });
    }
    await storageSet(EXAM_TYPES_KEY, examTypes);
    if(id) await storageSet(EXAM_DEFS_KEY, examDefs);
    closeExamTypeModal();
    renderExamsListTab(document.getElementById('examBody'));
    showToast('Exam type saved.', 'burst');
    return false;
  }
  async function removeExamType(id){
    const t = examTypes.find(x => x.id===id);
    if(!t) return;
    const inUse = examDefs.some(ex => ex.examType === t.name);
    const inScheme = consolSchemes.some(sc => sc.buckets.some(b => b.memberTypeIds.includes(id)));
    if((inUse || inScheme) && !await showConfirmDialog(`"${t.name}" is ${inUse?'used by one or more exams':''}${inUse && inScheme ? ' and ':''}${inScheme?'referenced by one or more Consolidation Schemes':''} — deleting it won't remove those exams or marks, but any scheme bucket referencing it will stop contributing this type. Delete anyway?`)) return;
    examTypes = examTypes.filter(x => x.id !== id);
    await storageSet(EXAM_TYPES_KEY, examTypes);
    renderExamsListTab(document.getElementById('examBody'));
  }

  function openSubjConfigGrid(examId){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examCurrentExamId = examId;
    examSubjView = 'grid';
    renderExamBody();
  }
  function backToExamsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examSubjView = 'list';
    renderExamBody();
  }
  function renderSubjConfigGrid(body){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam){ examSubjView = 'list'; return renderExamBody(); }
    const allowedClasses = classLevelsForExamType(exam.examType);
    const rows = allowedClasses.map((cls, idx) => {
      const count = getClassSubjectSummary(exam, cls).length;
      const range = classExamDateRange(exam, cls);
      return `<div class="class-compact-tile" data-idx="${idx%4}" onclick="openSubjConfigEditor('${cls}')">
        <div class="class-compact-header"><div>
          <div class="class-compact-name">${cls}</div>
          <div class="class-compact-count">${count} <span class="class-compact-count-label">subject${count===1?'':'s'}</span></div>
          ${range ? `<div style="font-size:0.72rem; color:var(--ink-soft); margin-top:2px;">${range.start}${range.end!==range.start ? ' – '+range.end : ''}</div>` : ''}
        </div></div>
      </div>`;
    }).join('');
    const type = examTypeByName(exam.examType);
    const canCreate = canSub('exams_definitions','exams','create');
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToExamsList()">All Exams</a> &nbsp;/&nbsp; ${exam.name} — choose a class to manage its subjects</div>
      ${type && type.scopeClasses && type.scopeClasses.length ? `<p style="font-size:0.82rem; color:var(--ink-soft); margin:-8px 0 16px;">"${exam.examType}" is only offered to ${type.scopeClasses.join(', ')} — other classes are hidden here.</p>` : ''}
      ${canCreate ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;"><button class="btn btn-ghost btn-sm" onclick="openBulkSubjectModal()">+ Add Subject to Multiple Classes</button><button class="btn btn-ghost btn-sm" onclick="openExamCopyWizard('${exam.id}')">⧉ Copy subjects from another exam</button><button class="btn btn-primary btn-sm" onclick="openMarksWizard()">⚙ Marks Structure Wizard</button></div>` : ''}
      <div class="class-compact-grid">${rows}</div>
    `;
  }
  function openSubjConfigEditor(cls){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examCurrentClass = cls;
    examSubjView = 'editor';
    renderExamBody();
  }
  function backToSubjConfigGrid(){
    examSubjView = 'grid';
    renderExamBody();
  }
  function getClassSubjectSummary(exam, cls){
    const map = {};
    SECTIONS.forEach(sec => {
      getExamSubjects(exam, cls, sec).forEach(s => {
        if(!map[s.name]) map[s.name] = { ...s, sections: [] };
        map[s.name].sections.push(sec);
      });
    });
    return Object.values(map);
  }
  function renderSubjConfigEditor(body){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam){ examSubjView = 'list'; return renderExamBody(); }
    const summary = getClassSubjectSummary(exam, examCurrentClass);
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToExamsList()">All Exams</a> &nbsp;/&nbsp; <a onclick="backToSubjConfigGrid()">${exam.name}</a> &nbsp;/&nbsp; ${examCurrentClass}</div>
      ${canSub('exams_definitions','exams','edit') ? `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;"><button class="btn btn-primary" onclick="openSubjectModal()">+ Add Subject</button><button class="btn btn-ghost" onclick="openMarksWizard('${examCurrentClass}')">⚙ Marks Structure Wizard</button></div>` : ''}
      <div class="table-wrap">
        <table><thead><tr><th>Subject</th><th>Code</th><th>Sections</th><th>Staff</th><th>Total Marks</th><th>Date</th><th>Countable</th><th>Elective</th><th></th></tr></thead>
        <tbody>
        ${summary.length ? summary.map(s => `
          <tr>
            <td class="name-cell">${s.name}</td>
            <td>${s.code||'—'}</td>
            <td>${s.sections.map(sec => `<span class="pill">${sec}</span>`).join(' ')}</td>
            <td>${(s.staffIds||[]).map(id => { const st = staffList.find(x => x.id===id); return st ? st.firstName+' '+st.lastName : ''; }).filter(Boolean).join(', ') || '—'}</td>
            <td>${marksStructureLabel(s)}</td>
            <td>${s.date||'—'}</td>
            <td>${s.countable!==false ? '✓' : '—'}</td>
            <td>${s.elective ? '✓' : '—'}</td>
            <td>${canSub('exams_definitions','exams','edit') ? `<button class="btn-edit-text" onclick="openSubjectModal('${s.name.replace(/'/g,"\\'")}')">Edit</button>` : ''}${(canSub('exams_definitions','exams','edit') && canSub('exams_definitions','exams','delete')) ? '&nbsp;·&nbsp;' : ''}${canSub('exams_definitions','exams','delete') ? `<button class="btn-danger-text" onclick="deleteSubjectFromClass('${s.name.replace(/'/g,"\\'")}')">Remove</button>` : ''}</td>
          </tr>
        `).join('') : `<tr><td colspan="9"><div class="empty-state"><b>No subjects yet</b>Click "+ Add Subject" to add one.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }

  function openSubjectModal(originalName){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    document.getElementById('subjectForm').reset();
    document.getElementById('editSubjectOriginalName').value = originalName || '';
    document.getElementById('subjectModalTitle').textContent = originalName ? 'Edit Subject' : 'Add Subject';
    document.getElementById('subjectSaveBtn').textContent = originalName ? 'Update Subject' : 'Add Subject';
    document.getElementById('subjCourse').value = examCurrentClass;
    document.getElementById('masterSubjectsDatalist').innerHTML = subjectsList
      .filter(s => s.className === examCurrentClass)
      .map(s => `<option value="${s.name}">`).join('');

    let existing = null;
    let existingSections = [];
    if(originalName){
      SECTIONS.forEach(sec => {
        const found = getExamSubjects(exam, examCurrentClass, sec).find(s => s.name === originalName);
        if(found){ existing = found; existingSections.push(sec); }
      });
    }
    document.getElementById('subjName').value = existing ? existing.name : '';
    document.getElementById('subjMaxMarks').value = existing ? existing.maxMarks : 100;
    if(typeof subjSplitLoad === 'function') subjSplitLoad('subj', existing);
    document.getElementById('subjDate').value = existing ? (existing.date||'') : (exam.startDate||'');
    // Exam timings (printed on admit cards). Added here so no page markup has to change.
    if(!document.getElementById('subjStartTime')){
      const dateField = document.getElementById('subjDate').closest('.f-field');
      const box = document.createElement('div'); box.className = 'form-grid';
      box.innerHTML = '<div class="f-field"><label>Exam starts at</label><input type="time" id="subjStartTime"></div><div class="f-field"><label>Exam ends at</label><input type="time" id="subjEndTime"></div>';
      dateField.parentElement.insertAdjacentElement('afterend', box);
    }
    // Left empty for a new subject, so the exam-wide / class-group time (set on the Admit Cards screen) applies unless a time is typed here.
    document.getElementById('subjStartTime').value = existing ? (existing.startTime||'') : '';
    document.getElementById('subjEndTime').value = existing ? (existing.endTime||'') : '';
    document.getElementById('subjCountable').checked = existing ? (existing.countable !== false) : true;
    document.getElementById('subjElective').checked = existing ? !!existing.elective : false;

    document.getElementById('subjSectionsBox').innerHTML = SECTIONS.map(sec => `
      <label class="admission-toggle"><input type="checkbox" class="subj-sec-check" value="${sec}" ${existingSections.includes(sec)?'checked':''}> Section ${sec}</label>
    `).join('');

    // Staff picker starts narrowed to this class's own teachers (or this exact
    // subject's teachers, once the name matches a master-subject record) —
    // see examSubjStaffCandidates(). An already-assigned teacher is always
    // kept visible even if a later name edit narrows the pool past them.
    examSubjStaffShowAll = false;
    window._subjModalInitialStaffIds = existing && existing.staffIds ? existing.staffIds : [];
    renderExamSubjStaffBox();

    document.getElementById('subjectModalOverlay').classList.add('open');
  }
  let examSubjStaffShowAll = false;
  function renderExamSubjStaffBox(){
    const box = document.getElementById('subjStaffBox');
    if(!box) return;
    const cls = examCurrentClass;
    const name = document.getElementById('subjName').value;
    const checkedNow = Array.from(document.querySelectorAll('.subj-staff-check:checked')).map(c => c.value);
    const keepVisible = new Set(checkedNow.length ? checkedNow : (window._subjModalInitialStaffIds || []));

    const narrowed = examSubjStaffCandidates(cls, name);
    const useNarrowed = !examSubjStaffShowAll && !!narrowed.label;
    const ids = useNarrowed ? narrowed.ids.slice() : staffList.map(s => s.id);
    keepVisible.forEach(id => { if(!ids.includes(id)) ids.push(id); }); // never hide an already-picked teacher
    const list = ids.map(id => staffList.find(s => s.id === id)).filter(Boolean);

    const toggleLink = narrowed.label
      ? (useNarrowed
          ? `<a onclick="examSubjStaffShowAll=true; renderExamSubjStaffBox();" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show all staff instead</a>`
          : `<a onclick="examSubjStaffShowAll=false; renderExamSubjStaffBox();" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show only ${narrowed.label}</a>`)
      : '';
    box.innerHTML = `
      ${narrowed.label ? `<p style="font-size:0.74rem; color:var(--ink-soft); margin:0 0 6px;">${useNarrowed ? `Showing ${narrowed.label}.` : 'Showing all staff.'} ${toggleLink}</p>` : ''}
      ${staffList.length ? (list.length ? list.map(st => `
        <label class="disc-check-item"><input type="checkbox" class="subj-staff-check" value="${st.id}" ${keepVisible.has(st.id)?'checked':''}> ${st.firstName} ${st.lastName} <span style="color:var(--ink-soft); font-size:0.76rem;">(${st.designation||'Staff'})</span></label>
      `).join('') : `<div style="font-size:0.82rem; color:var(--ink-soft);">No teachers found for this class yet — add subject-teacher assignments under Manage Subjects, or <a onclick="examSubjStaffShowAll=true; renderExamSubjStaffBox();" style="cursor:pointer; color:var(--magenta); font-weight:600;">show all staff</a>.</div>`)
        : `<div style="font-size:0.82rem; color:var(--ink-soft);">No staff added yet — add some under Manage Staff.</div>`}
    `;
  }
  function closeSubjectModal(){
    document.getElementById('subjectModalOverlay').classList.remove('open');
  }
  async function saveSubjectModal(e){
    e.preventDefault();
    const exam = examDefs.find(x => x.id === examCurrentExamId);
    const originalName = document.getElementById('editSubjectOriginalName').value;
    const name = document.getElementById('subjName').value.trim();
    const sections = Array.from(document.querySelectorAll('.subj-sec-check:checked')).map(c => c.value);
    if(sections.length === 0){ showToast('Select at least one section.'); return false; }
    const split = (typeof subjSplitRead === 'function') ? subjSplitRead('subj') : { internalMax: 0 };
    if(split.error){ showToast(split.error); return false; }
    const dateVal = document.getElementById('subjDate').value;
    { const st = (document.getElementById('subjStartTime')||{}).value, en = (document.getElementById('subjEndTime')||{}).value;
      if(st && en && en <= st){ showToast('The exam end time must be after the start time.'); return false; } }
    if(!dateVal){ showToast('Set an exam date for this subject — it\'s required before hall tickets can be generated.'); return false; }
    const clashingHoliday = holidayFor(dateVal);
    if(clashingHoliday && !await showConfirmDialog(`${dateVal} is marked as a holiday (${clashingHoliday.name}). Schedule the exam on this date anyway?`)) return false;
    const staffIds = Array.from(document.querySelectorAll('.subj-staff-check:checked')).map(c => c.value);
    const masterMatch = subjectsList.find(s => s.className === examCurrentClass && s.name.trim().toLowerCase() === name.toLowerCase());
    const subjectData = {
      name, code: masterMatch ? (masterMatch.code||'') : '', maxMarks: Number(document.getElementById('subjMaxMarks').value) || 100,
      internalMax: split.internalMax,
      date: dateVal,
      startTime: (document.getElementById('subjStartTime')||{}).value || '', endTime: (document.getElementById('subjEndTime')||{}).value || '',
      staffIds, countable: document.getElementById('subjCountable').checked,
      elective: document.getElementById('subjElective').checked,
    };
    exam.classSubjects = exam.classSubjects || {};
    SECTIONS.forEach(sec => {
      const key = classSecKey(examCurrentClass, sec);
      let list = exam.classSubjects[key] ? exam.classSubjects[key].slice() : (exam.subjects ? exam.subjects.slice() : []);
      list = list.filter(s => s.name !== originalName && s.name !== name);
      if(sections.includes(sec)) list.push(subjectData);
      exam.classSubjects[key] = list;
    });
    await storageSet(EXAM_DEFS_KEY, examDefs);
    closeSubjectModal();
    showToast((originalName ? 'Subject updated' : 'Subject added') + ' for ' + examCurrentClass + '.');
    renderExamBody();
    return false;
  }
  async function deleteSubjectFromClass(name){
    if(!await showConfirmDialog(`Remove "${name}" from all sections of this class for this exam?`)) return;
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    exam.classSubjects = exam.classSubjects || {};
    SECTIONS.forEach(sec => {
      const key = classSecKey(examCurrentClass, sec);
      if(exam.classSubjects[key]) exam.classSubjects[key] = exam.classSubjects[key].filter(s => s.name !== name);
    });
    await storageSet(EXAM_DEFS_KEY, examDefs);
    renderExamBody();
    showToast('Subject removed.', 'burst');
  }

  /* --- Bulk Add Subject: the same subject, added to several classes (and a
     chosen set of sections within each) in one pass, instead of repeating
     "Configure Subjects" once per class. Every class still gets its own
     section list and its own teacher picker — narrowed to that class's
     teachers via examSubjStaffCandidates(), same as the single-class flow —
     because different classes are almost always taught by different staff
     even for the "same" subject name. */
  let bulkSubjSelectedClasses = [];   // ordered list of classNames currently ticked
  let bulkSubjClassSections = {};     // className -> Set(section)
  let bulkSubjClassStaff = {};        // className -> Set(staffId)
  let bulkSubjClassShowAllStaff = {}; // className -> bool ("show all staff" override for that class's panel)

  function openBulkSubjectModal(){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam) return;
    document.getElementById('bulkSubjectForm').reset();
    document.getElementById('bsDate').value = exam.startDate || '';
    if(typeof subjSplitLoad === 'function') subjSplitLoad('bs', null);
    document.getElementById('bulkMasterSubjectsDatalist').innerHTML = Array.from(new Set(subjectsList.map(s => s.name)))
      .map(n => `<option value="${n}">`).join('');

    bulkSubjSelectedClasses = [];
    bulkSubjClassSections = {};
    bulkSubjClassStaff = {};
    bulkSubjClassShowAllStaff = {};

    const allowedClasses = classLevelsForExamType(exam.examType);
    document.getElementById('bsClassesBox').innerHTML = allowedClasses.map(cls => `
      <label class="admission-toggle"><input type="checkbox" class="bs-class-check" value="${cls}" onchange="toggleBulkSubjClass('${cls}', this.checked)"> ${cls}</label>
    `).join('');
    renderBulkSubjectPanels();
    document.getElementById('bulkSubjectModalOverlay').classList.add('open');
  }
  function closeBulkSubjectModal(){
    document.getElementById('bulkSubjectModalOverlay').classList.remove('open');
  }
  function toggleBulkSubjClass(cls, checked){
    if(checked){
      if(!bulkSubjSelectedClasses.includes(cls)) bulkSubjSelectedClasses.push(cls);
      if(!bulkSubjClassSections[cls]) bulkSubjClassSections[cls] = new Set(sectionsForClass(cls));
      if(!bulkSubjClassStaff[cls]) bulkSubjClassStaff[cls] = new Set();
    }else{
      bulkSubjSelectedClasses = bulkSubjSelectedClasses.filter(c => c !== cls);
    }
    renderBulkSubjectPanels();
  }
  function toggleBulkSubjSection(cls, sec, checked){
    const set = bulkSubjClassSections[cls] || (bulkSubjClassSections[cls] = new Set());
    if(checked) set.add(sec); else set.delete(sec);
  }
  function toggleBulkSubjStaff(cls, staffId, checked){
    const set = bulkSubjClassStaff[cls] || (bulkSubjClassStaff[cls] = new Set());
    if(checked) set.add(staffId); else set.delete(staffId);
  }
  function toggleBulkSubjShowAllStaff(cls){
    bulkSubjClassShowAllStaff[cls] = !bulkSubjClassShowAllStaff[cls];
    renderBulkSubjectPanels();
  }
  // Applies class[0]'s current teacher selection to every other ticked class
  // that shares at least one of those teachers on staff — a shortcut for the
  // common case of one teacher covering the same subject across classes.
  function copyBulkSubjStaffToAll(fromCls){
    const source = Array.from(bulkSubjClassStaff[fromCls] || []);
    if(source.length === 0){ showToast('Pick a teacher for this class first, then copy it to the others.'); return; }
    // Copies the exact selection across regardless of each class's own
    // narrowed candidate list — clicking "copy" is itself the admin's
    // confirmation that this teacher does cover that class too, same as how
    // an already-picked teacher stays visible even outside the narrowed set.
    bulkSubjSelectedClasses.forEach(cls => {
      if(cls === fromCls) return;
      bulkSubjClassStaff[cls] = new Set(source);
    });
    renderBulkSubjectPanels();
    showToast('Teacher selection copied to all selected classes.', 'burst');
  }
  function renderBulkSubjectPanels(){
    const box = document.getElementById('bsClassPanels');
    if(!box) return;
    const name = document.getElementById('bsName').value;
    box.innerHTML = bulkSubjSelectedClasses.map(cls => {
      const sections = sectionsForClass(cls);
      const selectedSections = bulkSubjClassSections[cls] || new Set(sections);
      const selectedStaff = bulkSubjClassStaff[cls] || new Set();
      const narrowed = examSubjStaffCandidates(cls, name);
      const useNarrowed = !bulkSubjClassShowAllStaff[cls] && !!narrowed.label;
      const ids = useNarrowed ? narrowed.ids.slice() : staffList.map(s => s.id);
      selectedStaff.forEach(id => { if(!ids.includes(id)) ids.push(id); });
      const staffOptions = ids.map(id => staffList.find(s => s.id === id)).filter(Boolean);
      const toggleLink = narrowed.label
        ? (useNarrowed
            ? `<a onclick="toggleBulkSubjShowAllStaff('${cls}')" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show all staff instead</a>`
            : `<a onclick="toggleBulkSubjShowAllStaff('${cls}')" style="cursor:pointer; color:var(--magenta); font-weight:600;">Show only ${narrowed.label}</a>`)
        : '';
      return `
      <div class="profile-card" style="margin-bottom:12px; padding:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <b>${cls}</b>
          ${bulkSubjSelectedClasses.length > 1 ? `<button type="button" class="btn-edit-text" onclick="copyBulkSubjStaffToAll('${cls}')">Copy this class's teacher(s) to all</button>` : ''}
        </div>
        <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Sections</div>
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px;">
          ${sections.map(sec => `<label class="admission-toggle"><input type="checkbox" ${selectedSections.has(sec)?'checked':''} onchange="toggleBulkSubjSection('${cls}','${sec}', this.checked)"> Section ${sec}</label>`).join('')}
        </div>
        <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">Teacher(s)</div>
        ${narrowed.label ? `<p style="font-size:0.72rem; color:var(--ink-soft); margin:0 0 6px;">${useNarrowed ? `Showing ${narrowed.label}.` : 'Showing all staff.'} ${toggleLink}</p>` : ''}
        <div class="disc-checklist" style="max-height:110px;">
          ${staffList.length ? (staffOptions.length ? staffOptions.map(st => `
            <label class="disc-check-item"><input type="checkbox" ${selectedStaff.has(st.id)?'checked':''} onchange="toggleBulkSubjStaff('${cls}','${st.id}', this.checked)"> ${st.firstName} ${st.lastName} <span style="color:var(--ink-soft); font-size:0.76rem;">(${st.designation||'Staff'})</span></label>
          `).join('') : `<div style="font-size:0.8rem; color:var(--ink-soft);">No teachers found for ${cls} yet.</div>`) : `<div style="font-size:0.8rem; color:var(--ink-soft);">No staff added yet.</div>`}
        </div>
      </div>`;
    }).join('') || `<div class="empty-state" style="margin-top:0;"><b>Tick a class above to configure it</b></div>`;
  }