
  async function saveBulkSubjectModal(e){
    e.preventDefault();
    const exam = examDefs.find(x => x.id === examCurrentExamId);
    const name = document.getElementById('bsName').value.trim();
    if(!name){ showToast('Enter a subject name.'); return false; }
    if(bulkSubjSelectedClasses.length === 0){ showToast('Tick at least one class.'); return false; }
    const dateVal = document.getElementById('bsDate').value;
    if(!dateVal){ showToast('Set an exam date — it\'s required before hall tickets can be generated.'); return false; }
    const classesWithSections = bulkSubjSelectedClasses.filter(cls => (bulkSubjClassSections[cls]||new Set()).size > 0);
    if(classesWithSections.length === 0){ showToast('Tick at least one section for at least one class.'); return false; }
    const clashingHoliday = holidayFor(dateVal);
    if(clashingHoliday && !await showConfirmDialog(`${dateVal} is marked as a holiday (${clashingHoliday.name}). Schedule the exam on this date anyway?`)) return false;

    const split = (typeof subjSplitRead === 'function') ? subjSplitRead('bs') : { internalMax: 0 };
    if(split.error){ showToast(split.error); return false; }
    const maxMarks = Number(document.getElementById('bsMaxMarks').value) || 100;
    const countable = document.getElementById('bsCountable').checked;
    const elective = document.getElementById('bsElective').checked;
    exam.classSubjects = exam.classSubjects || {};
    let sectionCount = 0;
    classesWithSections.forEach(cls => {
      const masterMatch = subjectsList.find(s => s.className === cls && s.name.trim().toLowerCase() === name.toLowerCase());
      const staffIds = Array.from(bulkSubjClassStaff[cls] || []);
      const subjectData = { name, code: masterMatch ? (masterMatch.code||'') : '', maxMarks, internalMax: split.internalMax, date: dateVal, staffIds, countable, elective };
      const sections = bulkSubjClassSections[cls];
      sectionsForClass(cls).forEach(sec => {
        const key = classSecKey(cls, sec);
        let list = exam.classSubjects[key] ? exam.classSubjects[key].slice() : (exam.subjects ? exam.subjects.slice() : []);
        list = list.filter(s => s.name !== name);
        if(sections.has(sec)){ list.push(subjectData); sectionCount++; }
        exam.classSubjects[key] = list;
      });
    });
    await storageSet(EXAM_DEFS_KEY, examDefs);
    closeBulkSubjectModal();
    showToast(`"${name}" added to ${classesWithSections.length} class${classesWithSections.length===1?'':'es'} (${sectionCount} section${sectionCount===1?'':'s'}).`, 'burst');
    renderExamBody();
    return false;
  }

  function openExamModal(id){
    document.getElementById('examForm').reset();
    document.getElementById('editExamId').value = id || '';
    document.getElementById('examModalTitle').textContent = id ? 'Edit Exam' : 'Add Exam';
    const typeSel = document.getElementById('exType');
    typeSel.innerHTML = '<option value="" disabled selected>Select exam type</option>' + examTypes.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    if(id){
      const ex = examDefs.find(e => e.id === id);
      document.getElementById('exName').value = ex.name;
      typeSel.value = ex.examType || '';
      document.getElementById('exStartDate').value = ex.startDate || '';
      document.getElementById('exEndDate').value = ex.endDate || '';
    }
    document.getElementById('examModalOverlay').classList.add('open');
  }
  function closeExamModal(){
    document.getElementById('examModalOverlay').classList.remove('open');
  }
  async function saveExam(e){
    e.preventDefault();
    const id = document.getElementById('editExamId').value;
    const data = {
      name: document.getElementById('exName').value.trim(),
      examType: document.getElementById('exType').value,
      startDate: document.getElementById('exStartDate').value,
      endDate: document.getElementById('exEndDate').value,
    };
    if(id){
      const idx = examDefs.findIndex(e => e.id === id);
      examDefs[idx] = { ...examDefs[idx], ...data };
      showToast('Exam updated.');
    }else{
      data.id = 'exam_' + Date.now();
      data.classSubjects = {};
      examDefs.push(data);
      showToast('Exam created. Now configure subjects per class & section.');
    }
    await storageSet(EXAM_DEFS_KEY, examDefs);
    closeExamModal();
    renderExamBody();
    return false;
  }
  async function deleteExam(id){
    if(!await showConfirmDialog('Delete this exam? Any marks entered for it will also be removed.')) return;
    await ensureDataLoaded('examResults', loadExamResultsData);
    examDefs = examDefs.filter(e => e.id !== id);
    examResults = examResults.filter(r => r.examId !== id);
    await storageSet(EXAM_DEFS_KEY, examDefs);
    await storageSet(EXAM_RESULTS_KEY, examResults);
    renderExamBody();
    showToast('Exam deleted.', 'burst');
  }

  /* --- Tab: Enter Marks --- */
  let expandedMarksClass = '';
  function toggleMarksClassExpand(cls){
    expandedMarksClass = (expandedMarksClass === cls) ? '' : cls;
    renderMarksClassGrid(document.getElementById('examBody'));
  }
  function renderMarksClassGrid(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam under the "Exams" tab first.</div>`;
      return;
    }
    if(!examCurrentExamId || !examDefs.find(e => e.id === examCurrentExamId)) examCurrentExamId = examDefs[0].id;
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${examCurrentExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    const currentExam = examDefs.find(e => e.id === examCurrentExamId);
    const scope = myTeacherScope();
    if(scope && scope.unlinked){
      body.innerHTML = `<div class="empty-state"><b>Your login isn't linked to a staff record</b>Ask an Admin to re-link your login under Staff Directory (🔑 Grant login access), or re-save it from Configuration → Users &amp; Roles — otherwise Subject Teacher assignments can never reach your account.</div>`;
      return;
    }
    if(scope && !scope.subjectSections.length){
      body.innerHTML = `<div class="empty-state"><b>You're not assigned as a Subject Teacher for any class yet</b>Marks can only be entered by that subject's assigned teacher — ask an admin to assign you one under Subjects.</div>`;
      return;
    }
    const isSectionAllowed = (cls, sec) => !scope || scope.subjectSections.some(ss => ss.className===cls && ss.section===sec);
    const gridHtml = buildModernClassGrid(
      classLevelsForExamType(currentExam && currentExam.examType),
      (cls, sec) => isSectionAllowed(cls, sec) ? students.filter(s => s.className===cls && s.section===sec && isActive(s)).length : 0,
      cls => `toggleMarksClassExpand('${cls}')`,
      (cls, sec) => `openMarksSection('${cls}','${sec}')`,
      cls => expandedMarksClass === cls
    );
    body.innerHTML = `
      ${marksLateCardHtml()}
      <div class="f-field" style="max-width:320px; margin-bottom:20px;">
        <label>Exam</label>
        <select id="marksExamSelect" onchange="onMarksExamSelectChange(this.value)">${examOptions}</select>
      </div>
      ${gridHtml}
    `;
    marksLateLoad();
  }

  /* --- Admin switch: allow marks for PREVIOUS (already released) exams, for students who joined mid-year.
     Teachers can then fill BLANK marks only; marks already entered stay locked. Enforced on the server. --- */
  let marksLateOn = null;
  try { OBJECT_BACKED_KEYS['marks-late-entry'] = '/api/kv/marks-late-entry'; } catch(e){}
  function marksLateIsBoss(){ try { return !!(currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal')); } catch(e){ return false; } }
  function marksLateCardHtml(){
    if(!marksLateIsBoss()) return '';
    const on = marksLateOn === true;
    return `<div id="marksLateCard" style="max-width:720px; margin-bottom:16px; padding:12px 14px; border-radius:12px; border:1px solid ${on ? '#e0b94a' : '#dde3ee'}; background:${on ? '#fff6dc' : '#f6f8fc'}; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
      <div style="flex:1; min-width:240px; font-size:0.85rem;"><b>Marks for previous exams (students who joined mid-year)</b><br>
        <span style="color:var(--ink-soft);">${on ? 'ON: teachers can fill blank marks of exams already released. Marks already entered stay locked.' : 'OFF: once an exam is released, teachers cannot add marks for it. Admin can always enter them.'}</span></div>
      <button class="btn ${on ? 'btn-ghost' : 'btn-primary'} btn-sm" onclick="toggleMarksLateEntry()">${on ? 'Turn OFF' : 'Allow previous exams'}</button></div>`;
  }
  async function marksLateLoad(){
    if(!marksLateIsBoss() || marksLateOn !== null) return;
    try { const v = await storageGet('marks-late-entry', {}); marksLateOn = !!(v && v.on === true); } catch(e){ marksLateOn = false; }
    const c = document.getElementById('marksLateCard'); if(c) c.outerHTML = marksLateCardHtml();
  }
  async function toggleMarksLateEntry(){
    if(!marksLateIsBoss()) return;
    const next = !(marksLateOn === true);
    const ok = await storageSet('marks-late-entry', { on: next, by: (currentUser && currentUser.name) || '', at: new Date().toISOString() });
    if(ok === false){ showToast('Could not save. Check the connection and try again.'); return; }
    marksLateOn = next;
    const c = document.getElementById('marksLateCard'); if(c) c.outerHTML = marksLateCardHtml();
    showToast(next ? 'Teachers can now add marks for previous exams.' : 'Previous-exam marks entry switched off.');
  }
  window.toggleMarksLateEntry = toggleMarksLateEntry;

  // Switching the exam must re-render the class grid immediately, because
  // which classes/sections show up depends on the NEW exam's type
  // (classLevelsForExamType) — just updating examCurrentExamId and leaving
  // the old grid on screen is why teachers saw "no classes" after picking
  // an exam, until they left the tab and came back (which forces a fresh
  // render that picks up the already-updated variable).
  function onMarksExamSelectChange(examId){
    examCurrentExamId = examId;
    renderMarksClassGrid(document.getElementById('examBody'));
  }
  function openMarksSection(cls, sec){
    const scope = myTeacherScope();
    if(scope && !scope.subjectSections.some(ss => ss.className===cls && ss.section===sec)){
      showToast("You can only enter marks for a class/subject you are assigned to teach.");
      return;
    }
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examCurrentClass = cls; examCurrentSection = sec;
    examMarksView = 'sheet';
    renderExamBody();
  }
  async function backToMarksGrid(){
    await flushMarksAutoSaveIfPending();
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examMarksView = 'grid';
    renderExamBody();
  }

  /* --- Marks entry follows the exam timetable: a subject's marks column is shown to its
     Subject Teacher from the paper's scheduled date (papers dated later are listed as
     "upcoming" and stay closed). Admins / other roles see every subject. Subjects with no
     date set are always open. Columns are ordered by paper date. --- */
  function marksTodayIso(){
    const d = new Date(), p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function marksSortByDate(list){
    return list.slice().sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') || String(a.name).localeCompare(String(b.name)));
  }
  function marksPrettyDate(iso){
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
  }
  // → { open:[…], upcoming:[…] } for the current user. Only teachers are date-gated.
  function marksSubjectsByDate(subjects){
    const sorted = marksSortByDate(subjects);
    if(!myTeacherScope()) return { open: sorted, upcoming: [] };
    const today = marksTodayIso();
    return { open: sorted.filter(s => !s.date || s.date <= today), upcoming: sorted.filter(s => s.date && s.date > today) };
  }

  function renderMarksSheet(body){
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    if(!exam){ examMarksView = 'grid'; return renderExamBody(); }
    let subjects = getExamSubjects(exam, examCurrentClass, examCurrentSection);
    // A Teacher only ever sees/enters marks for the subject(s) they're the
    // assigned Subject Teacher for in this class/section — never a
    // colleague's subject, even within a class they otherwise have some
    // access to. See myTeacherScope() and the matching server-side check.
    const scope = myTeacherScope();
    if(scope){
      const mySubjectNames = new Set(scope.subjectSections.filter(ss => ss.className===examCurrentClass && ss.section===examCurrentSection).map(ss => ss.subject));
      subjects = subjects.filter(s => mySubjectNames.has(s.name));
    }
    const dated = marksSubjectsByDate(subjects);
    const upcomingSubjects = dated.upcoming;
    subjects = dated.open;
    const todayIso = marksTodayIso();
    if(subjects.length === 0 && upcomingSubjects.length){
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToMarksGrid()">All Classes</a> &nbsp;/&nbsp; ${examCurrentClass} — Section ${examCurrentSection} &nbsp;/&nbsp; ${exam.name}</div>
        <div class="empty-state"><b>Marks entry opens on the paper's date</b>${upcomingSubjects.map(s => `${escapeHtml(s.name)} — ${marksPrettyDate(s.date)}`).join('<br>')}</div>`;
      return;
    }
    if(subjects.length === 0){
      const noneAssigned = scope && getExamSubjects(exam, examCurrentClass, examCurrentSection).length > 0;
      body.innerHTML = `
        <div class="breadcrumb"><a onclick="backToMarksGrid()">All Classes</a> &nbsp;/&nbsp; ${examCurrentClass} — Section ${examCurrentSection} &nbsp;/&nbsp; ${exam.name}</div>
        ${noneAssigned
          ? `<div class="empty-state"><b>None of these subjects are assigned to you</b>You're not the Subject Teacher for any subject in ${examCurrentClass} — Section ${examCurrentSection}.</div>`
          : `<div class="empty-state"><b>No subjects configured yet</b>Go to the "Exams" tab → "Configure Subjects" for ${examCurrentClass} — Section ${examCurrentSection} before entering marks.</div>`}
      `;
      return;
    }
    const list = students.filter(s => s.className===examCurrentClass && s.section===examCurrentSection && isActive(s))
      .sort(compareByRoll);
    const getResult = (studentId, subject) => examResults.find(r => r.examId===exam.id && r.studentId===studentId && r.subject===subject);
    const canEnterMarks = canSub('exams_marks','exams','edit');
    body.innerHTML = `
      <div class="breadcrumb" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span><a onclick="backToMarksGrid()">All Classes</a> &nbsp;/&nbsp; ${examCurrentClass} — Section ${examCurrentSection} &nbsp;/&nbsp; ${exam.name}</span>
        ${canEnterMarks ? `<span id="marksAutoSaveStatus" style="font-size:0.78rem; color:var(--ink-soft);"></span>` : ''}
        ${canEnterMarks && !corrIsApprover() ? `<button class="btn btn-ghost btn-sm" onclick="openMarksCorrectionPicker()" title="A mark was entered wrongly and is now locked">Request mark correction</button>` : ''}
      </div>
      ${upcomingSubjects.length ? `<div style="font-size:0.8rem; padding:9px 12px; border-radius:10px; background:rgba(46,111,158,0.1); margin:6px 0 10px;">🗓 <b>Upcoming papers</b> — marks entry opens on the paper's date: ${upcomingSubjects.map(s => `${escapeHtml(s.name)} <span style="color:var(--ink-soft);">(${marksPrettyDate(s.date)})</span>`).join(' · ')}</div>` : ''}
      ${canEnterMarks ? `<p style="font-size:0.76rem; color:var(--ink-soft); margin:2px 0 10px;">Marks are saved automatically as you type — "Save Marks" is just there to double-check everything looks right.</p>
      <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;">📤 Upload via Excel<input type="file" accept=".xlsx,.xls" id="marksExcelInput" style="display:none;" onchange="importMarksExcel(event)"></label>
      </div>` : ''}
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr>
          <th>Roll No</th>
          <th>Student</th>
          ${subjects.map(s => `<th>${s.name}${s.date === todayIso ? ' <span class="pill" style="background:rgba(24,143,134,0.16); color:#0f6a63;">Today</span>' : ''} <span style="font-weight:400; color:var(--ink-soft);">(/${s.maxMarks}${s.date ? ' · '+s.date : ''})</span>${subjInternalMax(s) ? `<div style="font-weight:500; font-size:0.68rem; color:var(--ink-soft);">Written ${subjWrittenMax(s)} + Internal ${subjInternalMax(s)}</div>` : ''}</th>`).join('')}
        </tr></thead>
        <tbody>
        ${list.map(s => `
          <tr>
            <td class="id-cell">${s.rollNo||'—'}</td>
            <td class="name-cell">${s.lastName} ${s.firstName}</td>
            ${subjects.map(subj => {
              const r = getResult(s.id, subj.name);
              const isAbsent = r ? !!r.absent : false;
              const sub = subj.name.replace(/"/g,'&quot;');
              const dis = (isAbsent||!canEnterMarks) ? 'disabled' : '';
              const absLbl = `<label style="font-size:0.68rem; color:var(--ink-soft); display:flex; align-items:center; gap:2px; cursor:pointer;" title="Mark absent for this subject">
                    <input type="checkbox" class="marks-absent-check" data-student="${s.id}" data-subject="${sub}" ${isAbsent?'checked':''} ${!canEnterMarks?'disabled':''} onchange="onMarksAbsentToggle(this)"> Abs
                  </label>`;
              const im = subjInternalMax(subj);
              if(im){
                const wm = subjWrittenMax(subj);
                const sp = marksSplitOf(r, subj);
                const tot = (r && !isAbsent && r.marks != null) ? r.marks : '';
                return `<td>
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                  <div style="display:flex; flex-direction:column; gap:2px;">
                    <input type="number" class="marks-input" data-part="written" min="0" max="${wm}" step="any" placeholder="/${wm}" title="Written marks (out of ${wm})" data-student="${s.id}" data-subject="${sub}" value="${sp.written}" ${dis} style="width:62px;" oninput="marksInputChanged(this)">
                    <input type="number" class="marks-input" data-part="internal" min="0" max="${im}" step="any" placeholder="/${im}" title="Internal marks (out of ${im})" data-student="${s.id}" data-subject="${sub}" value="${sp.internal}" ${dis} style="width:62px;" oninput="marksInputChanged(this)">
                  </div>
                  <div style="display:flex; flex-direction:column; gap:3px; align-items:flex-start;">
                    <span class="mk-total" style="font-size:0.74rem; font-weight:700; color:var(--navy);">${tot === '' ? '—' : tot + ' / ' + subj.maxMarks}</span>
                    ${absLbl}
                  </div>
                </div>
              </td>`;
              }
              const markVal = r && !isAbsent ? r.marks : '';
              return `<td>
                <div style="display:flex; align-items:center; gap:5px;">
                  <input type="number" class="marks-input" min="0" max="${subj.maxMarks}" data-student="${s.id}" data-subject="${sub}" value="${markVal}" ${dis} style="width:64px;" oninput="scheduleMarksAutoSave()">
                  ${absLbl}
                </div>
              </td>`;
            }).join('')}
          </tr>
        `).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No students here</b></div>` : ``}
      </div>
      ${canEnterMarks ? `<div style="margin-top:16px;"><button class="btn btn-primary" onclick="saveMarksSheet()">Save Marks</button></div>` : ''}
    `;
    // Show any saved mark that is above the (possibly just-changed) maximum straight away.
    setTimeout(() => { try{ marksApplySheet(exam, true); }catch(e){} }, 0);
  }
  function onMarksAbsentToggle(el){
    const row = el.closest('td');
    row.querySelectorAll('.marks-input').forEach(input => {
      if(el.checked){ input.value = ''; input.disabled = true; }
      else { input.disabled = false; }
    });
    const first = row.querySelector('.marks-input');
    if(first) marksUpdateTotal(first);
    scheduleMarksAutoSave();
  }

  /* --- Marks structure: a subject may be split into Written + Internal. The
     subject's maxMarks is always the TOTAL (e.g. 50 = 35 written + 15 internal),
     and each result's `marks` is always the total scored, so reports, ranks,
     grading and every other module keep working unchanged. `written` and
     `internal` are stored alongside as the breakdown. --- */
  function subjInternalMax(subj){
    const i = Number(subj && subj.internalMax) || 0, t = Number(subj && subj.maxMarks) || 0;
    return (i > 0 && i < t) ? i : 0;
  }
  function subjWrittenMax(subj){ return (Number(subj && subj.maxMarks) || 0) - subjInternalMax(subj); }
  // What to show in the Written / Internal boxes for an existing result. Marks that
  // were entered before the split existed have no breakdown, so they show as Written.
  function marksSplitOf(r, subj){
    if(!r || r.absent) return { written:'', internal:'' };
    if(subjInternalMax(subj) && (r.written != null || r.internal != null))
      return { written: r.written == null ? '' : r.written, internal: r.internal == null ? '' : r.internal };
    return { written: r.marks == null ? '' : r.marks, internal:'' };
  }
  function marksStructureLabel(s){
    const im = subjInternalMax(s);
    return im ? `${s.maxMarks} <span class="pill" title="Written ${subjWrittenMax(s)} + Internal ${im}">W${subjWrittenMax(s)} + I${im}</span>` : `${s.maxMarks}`;
  }
  function marksUpdateTotal(inp){
    const td = inp.closest('td');
    if(!td) return;
    const out = td.querySelector('.mk-total');
    if(!out) return;
    const parts = Array.from(td.querySelectorAll('.marks-input'));
    const vals = parts.filter(i => i.value !== '' && !isNaN(Number(i.value))).map(i => Number(i.value));
    const max = parts.reduce((sum, i) => sum + (Number(i.max) || 0), 0);
    out.textContent = vals.length ? (Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100) + ' / ' + max : '—';
  }
  function marksInputChanged(inp){ marksUpdateTotal(inp); scheduleMarksAutoSave(); }
  // Reads every cell on the sheet into examResults. Invalid cells are highlighted and
  // skipped (never block the rest). With dry=true nothing is changed — it only reports.
  function marksApplySheet(exam, dry){
    const cells = new Map();
    document.querySelectorAll('.marks-input').forEach(inp => {
      if(!inp.dataset.student || !inp.dataset.subject) return;
      const k = inp.dataset.student + '\u0001' + inp.dataset.subject;
      if(!cells.has(k)) cells.set(k, []);
      cells.get(k).push(inp);
    });
    let firstInvalid = null;
    cells.forEach(arr => {
      const studentId = arr[0].dataset.student, subject = arr[0].dataset.subject;
      let bad = false;
      const vals = {};
      arr.forEach(inp => {
        const part = inp.dataset.part || 'total';
        const max = inp.max === '' ? null : Number(inp.max);
        const raw = inp.value;
        const val = raw === '' ? null : Number(raw);
        const invalid = !inp.disabled && raw !== '' && (isNaN(val) || val < 0 || (max !== null && val > max));
        inp.style.borderColor = invalid ? 'var(--magenta)' : '';
        if(invalid){ bad = true; if(!firstInvalid) firstInvalid = inp; }
        vals[part] = (inp.disabled || invalid) ? null : val;
      });
      if(bad || dry) return;
      const absentBox = document.querySelector(`.marks-absent-check[data-student="${studentId}"][data-subject="${CSS.escape(subject)}"]`);
      const isAbsent = absentBox ? absentBox.checked : false;
      const split = arr.some(i => i.dataset.part === 'internal');
      const entered = Object.values(vals).filter(v => v !== null);
      const total = entered.length ? Math.round(entered.reduce((a, b) => a + b, 0) * 100) / 100 : null;
      let r = examResults.find(x => x.examId===exam.id && x.studentId===studentId && x.subject===subject);
      if(total === null && !isAbsent){
        if(r) examResults = examResults.filter(x => x !== r);
        return;
      }
      if(!r){
        r = { id:'res_'+studentId+'_'+exam.id+'_'+subject.replace(/\s/g,''), examId:exam.id, studentId, subject };
        examResults.push(r);
      }
      r.marks = isAbsent ? null : total;
      r.absent = isAbsent;
      if(split){ r.written = isAbsent ? null : (vals.written == null ? null : vals.written); r.internal = isAbsent ? null : (vals.internal == null ? null : vals.internal); }
      else { delete r.written; delete r.internal; }
    });
    return { hasInvalid: !!firstInvalid, firstInvalid };
  }

  /* --- Auto-save for Marks Entry: teachers can enter marks for dozens of
     students, and relying on a single "Save Marks" button at the end risked
     losing everything if they navigated away or closed the tab first. Every
     keystroke/absent-toggle schedules a debounced save; an invalid cell is
     highlighted and simply skipped (never blocks the rest from saving), and
     any pending save is flushed immediately before leaving the sheet. --- */
  let marksAutoSaveTimer = null;
  window.addEventListener('online', function(){ if(marksAutoSaveTimer){ clearTimeout(marksAutoSaveTimer); marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 300); } });
  function marksBeforeUnloadGuard(e){ e.preventDefault(); e.returnValue = ''; return ''; }
  function scheduleMarksAutoSave(){
    const status = document.getElementById('marksAutoSaveStatus');
    if(status) status.textContent = '⏳ Saving…';
    if(marksAutoSaveTimer) clearTimeout(marksAutoSaveTimer);
    else window.addEventListener('beforeunload', marksBeforeUnloadGuard);
    marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 900);
  }
  async function flushMarksAutoSaveIfPending(){
    if(marksAutoSaveTimer){
      clearTimeout(marksAutoSaveTimer);
      marksAutoSaveTimer = null;
      await autoSaveMarksSheet();
    }
  }
  async function autoSaveMarksSheet(){
    marksAutoSaveTimer = null;
    try{
      const exam = examDefs.find(e => e.id === examCurrentExamId);
      const status = document.getElementById('marksAutoSaveStatus');
      if(!exam) return;
      if(!document.querySelector('.marks-input')) return;
      await ensureDataLoaded('examResults', loadExamResultsData);
      const { hasInvalid } = marksApplySheet(exam, false);
      const ok = await storageSet(EXAM_RESULTS_KEY, examResults);
      if(ok === false){
        // Server did not accept the save (network down, server restarting, session
        // ended). Keep the warning on screen, keep the leave-page guard, and retry
        // by itself so nothing typed is silently lost.
        if(status) status.textContent = '⚠️ NOT saved to the server yet — check your connection. Keep this page open; retrying…';
        window.addEventListener('beforeunload', marksBeforeUnloadGuard);
        if(!marksAutoSaveTimer) marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 5000);
        return;
      }
      if(status) status.textContent = hasInvalid ? '⚠️ Saved — fix the highlighted mark(s)' : '✅ All changes saved';
    } finally {
      if(!marksAutoSaveTimer) window.removeEventListener('beforeunload', marksBeforeUnloadGuard);
    }
  }

  async function saveMarksSheet(){
    if(marksAutoSaveTimer){ clearTimeout(marksAutoSaveTimer); marksAutoSaveTimer = null; }
    window.removeEventListener('beforeunload', marksBeforeUnloadGuard);
    await ensureDataLoaded('examResults', loadExamResultsData);
    const exam = examDefs.find(e => e.id === examCurrentExamId);
    const check = marksApplySheet(exam, true);
    if(check.hasInvalid){
      const inp = check.firstInvalid;
      const part = inp.dataset.part ? ' ' + inp.dataset.part : '';
      showToast(`Marks for "${inp.dataset.subject}"${part} must be between 0 and ${inp.max} — please fix the highlighted entry.`);
      inp.focus();
      return;
    }
    marksApplySheet(exam, false);
    const ok = await storageSet(EXAM_RESULTS_KEY, examResults);
    const status = document.getElementById('marksAutoSaveStatus');
    if(ok === false){
      if(status) status.textContent = '⚠️ NOT saved to the server yet — check your connection. Keep this page open; retrying…';
      window.addEventListener('beforeunload', marksBeforeUnloadGuard);
      if(!marksAutoSaveTimer) marksAutoSaveTimer = setTimeout(autoSaveMarksSheet, 5000);
      showToast('Marks NOT saved to the server yet — keep this page open, it will retry automatically.');
      return;
    }
    if(status) status.textContent = '✅ All changes saved';
    showToast('Marks saved.', 'burst');
  }

  async function importMarksExcel(e){
    await ensureDataLoaded('examResults', loadExamResultsData);
    if(!(await ensureXLSX())) { e.target.value=''; return; }
    const file = e.target.files[0];
    if(!file) return;
    const exam = examDefs.find(ex => ex.id === examCurrentExamId);
    let subjects = getExamSubjects(exam, examCurrentClass, examCurrentSection);
    { const sc = myTeacherScope(); if(sc){ const mine = new Set(sc.subjectSections.filter(ss => ss.className===examCurrentClass && ss.section===examCurrentSection).map(ss => ss.subject)); subjects = subjects.filter(x => mine.has(x.name)); } }
    subjects = marksSubjectsByDate(subjects).open;
    const reader = new FileReader();
    reader.onload = async function(evt){
      try{
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type:'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval:'' });
        let updated = 0, notFound = 0, badCells = 0;
        rows.forEach(rec => {
          const norm = {}; Object.keys(rec).forEach(k => norm[k.trim().toLowerCase()] = rec[k]);
          const admNo = (norm['admission no'] || norm['admissionno'] || '').toString().trim();
          const student = students.find(s => (s.admissionNo||'').toLowerCase() === admNo.toLowerCase());
          if(!student){ notFound++; return; }
          subjects.forEach(subj => {
            const key = subj.name.trim().toLowerCase();
            const im = subjInternalMax(subj);
            const num = raw => { const t = (raw == null ? '' : raw).toString().trim(); return t === '' ? null : Number(t); };
            const isAb = raw => ['AB','ABSENT'].includes((raw == null ? '' : raw).toString().trim().toUpperCase());
            let r = examResults.find(r => r.examId===exam.id && r.studentId===student.id && r.subject===subj.name);
            const put = (marks, absent, written, internal) => {
              if(!r){ r = { id:'res_'+student.id+'_'+exam.id+'_'+subj.name.replace(/\s/g,''), examId:exam.id, studentId:student.id, subject:subj.name }; examResults.push(r); }
              r.marks = marks; r.absent = absent;
              if(im){ r.written = written; r.internal = internal; } else { delete r.written; delete r.internal; }
              updated++;
            };
            // Split subject: "<Subject> Written" + "<Subject> Internal" columns (brackets optional).
            const wKey = [key+' written', key+' (written)'].find(k => k in norm);
            const iKey = [key+' internal', key+' (internal)'].find(k => k in norm);
            if(im && (wKey || iKey)){
              const rawW = wKey ? norm[wKey] : '', rawI = iKey ? norm[iKey] : '';
              if(isAb(rawW) || isAb(rawI)){ put(null, true, null, null); return; }
              const w = num(rawW), i = num(rawI);
              if(w === null && i === null) return;
              if((w !== null && (isNaN(w) || w < 0 || w > subjWrittenMax(subj))) || (i !== null && (isNaN(i) || i < 0 || i > im))){ badCells++; return; }
              put(Math.round(((w||0) + (i||0)) * 100) / 100, false, w, i);
              return;
            }
            if(!(key in norm)) return;
            const raw = norm[key].toString().trim();
            const isAbsent = isAb(raw);
            const marks = isAbsent ? null : (raw==='' ? null : Number(raw));
            if(marks === null && !isAbsent) return;
            if(marks !== null && (isNaN(marks) || marks < 0 || marks > (Number(subj.maxMarks)||Infinity))){ badCells++; return; }
            // A plain column on a split subject is the TOTAL; it has no written/internal breakdown.
            put(marks, isAbsent, null, null);
            if(im){ delete r.written; delete r.internal; }
          });
        });
        await storageSet(EXAM_RESULTS_KEY, examResults);
        renderMarksSheet(document.getElementById('examBody'));
        showToast(`${updated} mark(s) updated from Excel.${notFound ? ' '+notFound+' row(s) had no matching Admission No.' : ''}${badCells ? ' '+badCells+' value(s) were skipped because they are above the maximum or not a number.' : ''}`, 'ringdraw');
      }catch(err){
        showToast('Could not read that file: ' + (err && err.message ? err.message : err));
      }
      e.target.value = '';
    };
    reader.onerror = function(){ showToast('Could not read the selected file.'); e.target.value=''; };
    reader.readAsArrayBuffer(file);
  }

  /* --- Tab: Report Cards (individual + bulk downloads) --- */

  let rcSearchDebounce = null, rcCurrentStudentId = '';
  function coScholasticEditorHtml(s, exam, t){
    if(!t || t.layout !== 'modern') return '';
    const rec = examCoScholastic[coScholasticKeyFor(exam.id, s.id)] || { areas:{}, discipline:'' };
    const areas = t.coScholasticAreas && t.coScholasticAreas.length ? t.coScholasticAreas : DEFAULT_COSCHOLASTIC_AREAS;
    const grades = ['','A','B','C','D','E'];
    const gradeSelect = (id, current) => `<select id="${id}">${grades.map(g => `<option value="${g}" ${current===g?'selected':''}>${g||'— Not graded —'}</option>`).join('')}</select>`;
    return `
      <div class="profile-card" style="margin-top:16px; max-width:520px;">
        <h4 style="margin-bottom:10px;">Co-Scholastic Areas — ${t.name}</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin-bottom:12px;">This template uses the CBSE-style layout, which prints a co-scholastic grade section. Set grades once per student per exam — they carry over to every future print until changed.</p>
        <div class="form-grid">
        ${areas.map(a => `<div class="f-field"><label>${a}</label>${gradeSelect('csg_'+a.replace(/[^a-zA-Z0-9]/g,''), (rec.areas&&rec.areas[a])||'')}</div>`).join('')}
        ${t.showDiscipline!==false ? `<div class="f-field"><label>Discipline</label>${gradeSelect('csg_discipline', rec.discipline||'')}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:10px;" onclick="saveCoScholasticGrades('${exam.id}','${s.id}')">Save Grades</button>
      </div>
    `;
  }


  function buildInfoFieldLines(s, exam, t){
    const fields = t.infoFields || DEFAULT_INFO_FIELDS;
    const labels = { admissionNo:'Admission No', rollNo:'Roll Number', className:'Class', section:'Section', fatherName:'Father Name', motherName:'Mother Name', dob:'Date of Birth', gender:'Gender', bloodGroup:'Blood Group', address:'Address', phone:'Phone', email:'Email' };
    let lines = `<div>Student Name: <b>${s.lastName} ${s.firstName}</b></div>`;
    if(fields.className && fields.section){
      lines += `<div>Class &amp; Section: <b>${s.className} — ${s.section}</b></div>`;
    }else{
      if(fields.className) lines += `<div>Class: <b>${s.className||'—'}</b></div>`;
      if(fields.section) lines += `<div>Section: <b>${s.section||'—'}</b></div>`;
    }
    Object.keys(labels).forEach(key => {
      if(key==='className' || key==='section') return;
      if(fields[key]) lines += `<div>${labels[key]}: <b>${studentInfoFieldValue(s, key)}</b></div>`;
    });
    if(fields.examPeriod !== false){
      lines += `<div>Exam Period: <b>${exam.startDate ? exam.startDate + (exam.endDate && exam.endDate!==exam.startDate ? ' – '+exam.endDate : '') : 'To be announced'}</b></div>`;
    }
    if(fields.attendance !== false){
      const attEndDate = exam.endDate || exam.startDate;
      if(attEndDate){
        const attStats = computeAttendanceStats(s.id, undefined, attEndDate);
        lines += attStats.total > 0
          ? `<div>Attendance (till ${attEndDate}): <b>${attStats.present+attStats.late} / ${attStats.total} days (${attStats.pct}%)</b></div>`
          : `<div>Attendance (till ${attEndDate}): <b>No attendance recorded yet</b></div>`;
      }else{
        lines += `<div>Attendance: <b>Set an exam date to show attendance</b></div>`;
      }
    }
    return lines;
  }
  function classTopperMarksFor(exam, className, section, subjectName){
    const cohort = students.filter(x => x.className===className && x.section===section && isActive(x));
    let top = null;
    cohort.forEach(x => {
      const r = examResults.find(r => r.examId===exam.id && r.studentId===x.id && r.subject===subjectName);
      if(r && r.marks !== null && !r.absent){
        if(top === null || r.marks > top) top = r.marks;
      }
    });
    return top;
  }
  // Class-and-section rank for one exam: every active student in the same
  // class AND section is scored the same way the report card scores its own
  // student (countable subjects only, same total-obtained/total-max math —
  // see the fix for the report card percentage bug), then ranked highest
  // percentage first. Ties share a rank and the next distinct score skips
  // ahead to reflect how many students are ahead of it (1, 2, 2, 4 — the
  // usual "competition ranking" convention on Indian school report cards),
  // rather than every tied student getting a different number. A student
  // with no countable subjects for this exam (nothing to score) is left out
  // of the ranking entirely rather than counted as a last-place 0%.
  function classSectionRankFor(exam, className, section, studentId){
    const cohort = students.filter(x => x.className===className && x.section===section && isActive(x));
    const scored = [];
    cohort.forEach(x => {
      const subjRows = getExamSubjects(exam, x.className, x.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===x.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      if(totalMax > 0) scored.push({ id: x.id, pct: (totalObtained/totalMax)*100 });
    });
    if(scored.length === 0) return null;
    scored.sort((a,b) => b.pct - a.pct);
    let rank = 1;
    scored.forEach((row,i) => {
      if(i > 0 && row.pct < scored[i-1].pct) rank = i+1;
      row.rank = rank;
    });
    const mine = scored.find(x => x.id === studentId);
    return mine ? { rank: mine.rank, outOf: scored.length } : null;
  }
  function ordinalSuffix(n){
    const rem100 = n % 100;
    if(rem100 >= 11 && rem100 <= 13) return n + 'th';
    switch(n % 10){
      case 1: return n + 'st';
      case 2: return n + 'nd';
      case 3: return n + 'rd';
      default: return n + 'th';
    }
  }
  function coScholasticSectionHtml(s, exam, t){
    if(!t || t.layout !== 'modern') return '';
    const rec = examCoScholastic[coScholasticKeyFor(exam.id, s.id)] || { areas:{}, discipline:'' };
    const areas = t.coScholasticAreas && t.coScholasticAreas.length ? t.coScholasticAreas : DEFAULT_COSCHOLASTIC_AREAS;
    const areaLines = areas.map(a => `<div><span>${a}</span><b>${(rec.areas && rec.areas[a]) || '—'}</b></div>`).join('');
    const disciplineLine = t.showDiscipline!==false ? `<div><span>Discipline</span><b>${rec.discipline || '—'}</b></div>` : '';
    return `
      <div class="rc-cosch-title">CO-SCHOLASTIC AREAS (Grade A–E)</div>
      <div class="rc-cosch-grid">${areaLines}${disciplineLine}</div>
    `;
  }

  /* --- Tab: Results Summary --- */
  function renderResultsSummaryTab(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b></div>`;
      return;
    }
    if(!resultsFilters.examId || !examDefs.find(e => e.id === resultsFilters.examId)) resultsFilters.examId = examDefs[0].id;
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    let list = students.filter(isActive);
    if(resultsFilters.className) list = list.filter(s => s.className === resultsFilters.className);
    if(resultsFilters.section) list = list.filter(s => s.section === resultsFilters.section);

    const rows = list.map(s => {
      const subjRows = getExamSubjects(exam, s.className, s.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      const hasAny = subjRows.some(r => r.marks !== null);
      const pct = totalMax > 0 ? Math.round((totalObtained/totalMax)*1000)/10 : 0;
      return { s, totalObtained, totalMax, pct, hasAny, grade: gradeForPct(pct) };
    }).filter(r => r.hasAny).sort((a,b) => b.pct - a.pct);

    const avgPct = rows.length ? Math.round((rows.reduce((sum,r) => sum+r.pct, 0)/rows.length)*10)/10 : 0;
    const highest = rows.length ? rows[0].pct : 0;
    const passCount = rows.filter(r => !isFailGrade(r.grade)).length;

    body.innerHTML = `
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <select id="rsExam" onchange="onResultsFilterChange()">${examDefs.map(ex => `<option value="${ex.id}" ${resultsFilters.examId===ex.id?'selected':''}>${ex.name}</option>`).join('')}</select>
          <select id="rsClass" onchange="onResultsFilterChange()"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option ${resultsFilters.className===c?'selected':''}>${c}</option>`).join('')}</select>
          <select id="rsSection" onchange="onResultsFilterChange()"><option value="">All Sections</option>${SECTIONS.map(s => `<option value="${s}" ${resultsFilters.section===s?'selected':''}>Section ${s}</option>`).join('')}</select>
        </div>
        <div>
          <button class="btn btn-ghost btn-sm" onclick="downloadResultsSummaryExcel()">📥 Excel</button> <button class="btn btn-ghost btn-sm" onclick="downloadResultsSummaryPDF()">📄 PDF</button>
        </div>
      </div>
      <div class="fee-summary-row">
        <div class="fee-sum-card"><b>${rows.length}</b><span>Students with marks</span></div>
        <div class="fee-sum-card"><b>${avgPct}%</b><span>Class Average</span></div>
        <div class="fee-sum-card"><b>${highest}%</b><span>Highest</span></div>
        <div class="fee-sum-card"><b>${passCount}/${rows.length}</b><span>Passed</span></div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Rank</th><th>Student</th><th>Class</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead>
        <tbody>
        ${rows.map((r,i) => `<tr>
          <td>${i+1}</td>
          <td class="name-cell">${r.s.firstName} ${r.s.lastName}</td>
          <td><span class="pill">${r.s.className} - ${r.s.section}</span></td>
          <td>${r.totalObtained} / ${r.totalMax}</td>
          <td class="att-pct ${isFailGrade(r.grade)?'bad':'good'}">${r.pct}%</td>
          <td><span class="grade-pill ${isFailGrade(r.grade)?'fail':''}">${r.grade}</span></td>
        </tr>`).join('')}
        </tbody></table>
        ${rows.length===0 ? `<div class="empty-state"><b>No marks entered yet for this selection</b></div>` : ``}
      </div>
    `;
  }
  function resultsSummaryReportRows(){
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    let list = students.filter(isActive);
    if(resultsFilters.className) list = list.filter(s => s.className === resultsFilters.className);
    if(resultsFilters.section) list = list.filter(s => s.section === resultsFilters.section);
    const rows = list.map(s => {
      const subjRows = getExamSubjects(exam, s.className, s.section).filter(subj => subj.countable !== false).map(subj => {
        const r = examResults.find(r => r.examId===exam.id && r.studentId===s.id && r.subject===subj.name);
        return { marks: r ? r.marks : null, max: subj.maxMarks };
      });
      const totalMax = subjRows.reduce((sum,r) => sum+r.max, 0);
      const totalObtained = subjRows.reduce((sum,r) => sum+(Number(r.marks)||0), 0);
      const hasAny = subjRows.some(r => r.marks !== null);
      const pct = totalMax > 0 ? Math.round((totalObtained/totalMax)*1000)/10 : 0;
      return { s, totalObtained, totalMax, pct, hasAny, grade: gradeForPct(pct) };
    }).filter(r => r.hasAny).sort((a,b) => b.pct - a.pct);
    return rows.map((r,i) => ({
      'Rank': i+1, 'Student': r.s.firstName+' '+r.s.lastName, 'Class': r.s.className+' - '+r.s.section,
      'Marks Obtained': r.totalObtained, 'Total Marks': r.totalMax, '%': r.pct, 'Grade': r.grade,
    }));
  }
  function downloadResultsSummaryExcel(){
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    exportRowsToExcel('results_summary_'+(exam?exam.name.replace(/\s/g,'_'):'report')+'.xlsx', 'Results Summary', resultsSummaryReportRows());
  }
  function downloadResultsSummaryPDF(){
    const exam = examDefs.find(e => e.id === resultsFilters.examId);
    exportRowsToPDF('Results Summary', exam ? exam.name : '', resultsSummaryReportRows());
  }
  function onResultsFilterChange(){
    resultsFilters = {
      examId: document.getElementById('rsExam').value,
      className: document.getElementById('rsClass').value,
      section: document.getElementById('rsSection').value,
    };
    renderResultsSummaryTab(document.getElementById('examBody'));
  }

  /* --- Tab: Grading Scale --- */
  /* --- Report Templates (multiple, editable) --- */
  const REPORT_TEMPLATES_KEY = "report-templates";
  OBJECT_BACKED_KEYS[REPORT_TEMPLATES_KEY] = '/api/kv/' + REPORT_TEMPLATES_KEY;