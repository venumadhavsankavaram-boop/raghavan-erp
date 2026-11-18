/* ===== Consolidated Report (rebuilt) =====
   Replaces the old "whole year raw marks" tab. Four simple views over one calculation:
     1. Class Sheet     - every student of a class/section in one table (print landscape / CSV)
     2. Student Report  - one student, every exam x every subject, weighted % and grade (print / print whole class)
     3. Final Marks     - optional moderation / override mark per subject (Admin / Principal only, with a reason)
     4. Weightage       - each exam's weight % (editable, per school or per class) and the report "stages"
   A "stage" is a progress point, e.g. "After FA2 + SA1", "After FA3 (all exams till date)", "Year End".
   A stage includes every exam up to its last exam, so a report after FA3 automatically contains everything conducted so far.
   Calculation, per subject: weighted % = sum(exam % x exam weight) / sum(weights of exams that have a mark).
   Exams not yet entered are skipped (never counted as zero); an Absent mark counts as 0.
   Original exam marks are never changed; moderation marks are stored separately. The official Year-End Marks Card
   (Consolidation Schemes) is untouched. */
(function(){
  const CFG_KEY = 'consol-report-config', FINAL_KEY = 'consol-final-marks';
  try{ OBJECT_BACKED_KEYS[CFG_KEY] = '/api/kv/' + CFG_KEY; OBJECT_BACKED_KEYS[FINAL_KEY] = '/api/kv/' + FINAL_KEY; }catch(e){}

  let crCfg = { stages: [], weights: { all: {}, byClass: {} } };
  let crFinal = {};
  let crLoaded = false;
  let crClass = '', crSection = '', crStageId = '', crSub = 'sheet', crStudentId = '', crFinalSubject = '';
  let crWeightScope = '__all__', crShowRank = false;

  const esc = v => (typeof escapeHtml === 'function') ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v);
  const r1 = n => Math.round(n * 10) / 10;
  const canEditCr = () => { try{ return currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal'); }catch(e){ return false; } };

  async function crLoad(){
    if(crLoaded) return;
    try{
      const c = await storageGet(CFG_KEY, null);
      if(c && typeof c === 'object' && !Array.isArray(c)){
        crCfg = { stages: Array.isArray(c.stages) ? c.stages : [], weights: { all: (c.weights && c.weights.all) || {}, byClass: (c.weights && c.weights.byClass) || {} } };
      }
    }catch(e){}
    try{
      const f = await storageGet(FINAL_KEY, null);
      if(f && typeof f === 'object' && !Array.isArray(f)) crFinal = f;
    }catch(e){}
    crLoaded = true;
  }

  /* ---------- exams, weights, stages ---------- */
  function crSortedExams(){
    return examDefs.slice().sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || String(a.name).localeCompare(String(b.name)));
  }
  // Standard weights (used until the school edits them): FA1-FA4 = 10 each, SA1 & SA2 = 30 each, anything else = not counted.
  function crDefaultWeight(name){
    const n = String(name || '');
    if(/^\s*FA\s*[-_ ]?\s*\d/i.test(n) || /formative/i.test(n)) return 10;
    if(/^\s*SA\s*[-_ ]?\s*\d/i.test(n) || /summative/i.test(n)) return 30;
    return 0;
  }
  function crWeight(ex, className){
    const byC = crCfg.weights.byClass && crCfg.weights.byClass[className];
    if(byC && byC[ex.id] !== undefined && byC[ex.id] !== '') return Number(byC[ex.id]) || 0;
    if(crCfg.weights.all && crCfg.weights.all[ex.id] !== undefined && crCfg.weights.all[ex.id] !== '') return Number(crCfg.weights.all[ex.id]) || 0;
    return crDefaultWeight(ex.name);
  }
  function crFindExam(re){ return crSortedExams().find(e => re.test(String(e.name || ''))); }
  function crStages(){
    if(crCfg.stages && crCfg.stages.length) return crCfg.stages;
    const fa2 = crFindExam(/^\s*FA\s*[-_ ]?\s*2/i), sa1 = crFindExam(/^\s*SA\s*[-_ ]?\s*1/i), fa3 = crFindExam(/^\s*FA\s*[-_ ]?\s*3/i);
    const list = [];
    const t1 = sa1 || fa2;
    if(t1) list.push({ id: 'st_term1', name: 'Progress Report 1 — FA1, FA2 & SA1', upto: t1.id });
    if(fa3) list.push({ id: 'st_fa3', name: 'Progress Report 2 — After FA3 (all exams till date)', upto: fa3.id });
    list.push({ id: 'st_year', name: 'Year End — all exams', upto: 'ALL' });
    return list;
  }
  function crStage(id){ const all = crStages(); return all.find(s => s.id === id) || all[all.length - 1]; }
  function crStageExams(stage, className, section){
    const sorted = crSortedExams();
    let list = sorted;
    if(stage.upto && stage.upto !== 'ALL'){
      const idx = sorted.findIndex(e => e.id === stage.upto);
      if(idx >= 0) list = sorted.slice(0, idx + 1);
    }
    return list.filter(ex => classAllowedForExamType(ex.examType, className) && getExamSubjects(ex, className, section).length > 0 && crWeight(ex, className) > 0);
  }

  /* ---------- calculation ---------- */
  function crRoster(className, section){
    return students.filter(s => s.className === className && s.section === section && isActive(s))
      .sort((a, b) => ((a.lastName || '') + ' ' + (a.firstName || '')).localeCompare((b.lastName || '') + ' ' + (b.firstName || '')));
  }
  function crCompute(s, stage){
    const exams = crStageExams(stage, s.className, s.section);
    const names = [], countable = {};
    exams.forEach(ex => getExamSubjects(ex, s.className, s.section).forEach(sub => {
      if(!names.includes(sub.name)){ names.push(sub.name); countable[sub.name] = false; }
      if(sub.countable !== false) countable[sub.name] = true;
    }));
    let pendingCount = 0;
    const subjects = names.map(name => {
      let sum = 0, wsum = 0;
      const cells = exams.map(ex => {
        const def = getExamSubjects(ex, s.className, s.section).find(x => x.name === name);
        if(!def) return null;
        const max = Number(def.maxMarks) || 0;
        const w = crWeight(ex, s.className);
        const res = examResults.find(r => r.examId === ex.id && r.studentId === s.id && r.subject === name);
        if(!res || max <= 0){ pendingCount++; return { pending: true, max, w }; }
        const absent = !!res.absent;
        const marks = absent ? 0 : (Number(res.marks) || 0);
        sum += (marks / max) * 100 * w; wsum += w;
        return { marks, max, absent, w, pct: (marks / max) * 100 };
      });
      const computed = wsum > 0 ? r1(sum / wsum) : null;
      const ov = crFinal[stage.id + '|' + s.id + '|' + name];
      const overridden = !!(ov && ov.mark !== undefined && ov.mark !== null && ov.mark !== '');
      const pct = overridden ? Number(ov.mark) : computed;
      return { name, cells, computed, pct, overridden, reason: overridden ? (ov.reason || '') : '', countable: countable[name], grade: pct !== null ? gradeForConsolPct(pct) : '—' };
    });
    const counted = subjects.filter(x => x.countable && x.pct !== null);
    const overall = counted.length ? r1(counted.reduce((a, x) => a + x.pct, 0) / counted.length) : null;
    return { s, exams, subjects, overall, grade: overall !== null ? gradeForConsolPct(overall) : '—', pendingCount, hasOverride: subjects.some(x => x.overridden) };
  }
  function crComputeClass(className, section, stage){
    const rows = crRoster(className, section).map(s => crCompute(s, stage));
    const ranked = rows.filter(r => r.overall !== null).sort((a, b) => b.overall - a.overall);
    let rank = 0, prev = null;
    ranked.forEach((r, i) => { if(r.overall !== prev){ rank = i + 1; prev = r.overall; } r.rank = rank; });
    return rows;
  }

  /* ---------- screen ---------- */
  function crPickDefaults(){
    const withStudents = CLASS_LEVELS.filter(c => students.some(s => s.className === c && isActive(s)));
    if(!crClass || !CLASS_LEVELS.includes(crClass)) crClass = withStudents[0] || CLASS_LEVELS[0];
    const secs = SECTIONS.filter(sec => students.some(s => s.className === crClass && s.section === sec && isActive(s)));
    if(!crSection || !SECTIONS.includes(crSection)) crSection = (secs[0] || SECTIONS[0]);
    const st = crStages();
    if(!crStageId || !st.some(x => x.id === crStageId)) crStageId = st[st.length - 1].id;
  }
  window.crRender = () => crRenderInto(document.getElementById('resultBody'));
  async function renderConsolidatedTab(body){
    await crLoad();
    crPickDefaults();
    
    crRenderInto(body);
  }
  function crRenderInto(body){
    if(!body) return;
    crPickDefaults();
    const stages = crStages();
    const tab = (k, label) => `<button class="${crSub === k ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}" onclick="crSwitch('${k}')">${label}</button>`;
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:12px; max-width:760px;">
        Progress reports and the year-end result, built from the exam marks already entered. Pick a <b>stage</b> (each stage includes every exam up to it),
        then use the class sheet, a student's report, optional final marks, or change the exam weightage.
      </p>
      <div class="ms-toolbar" style="flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <div class="ms-toolbar-left" style="flex-wrap:wrap; gap:10px;">
          <select onchange="crSet('class',this.value)">${CLASS_LEVELS.map(c => `<option ${c === crClass ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <select onchange="crSet('section',this.value)">${SECTIONS.map(c => `<option ${c === crSection ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <select onchange="crSet('stage',this.value)" title="Stage">${stages.map(sg => `<option value="${esc(sg.id)}" ${sg.id === crStageId ? 'selected' : ''}>${esc(sg.name)}</option>`).join('')}</select>
        </div>
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${tab('sheet', '📋 Class Sheet')}${tab('student', '🎓 Student Report')}${tab('final', '✍️ Final Marks')}${tab('weights', '⚖️ Weightage & Stages')}
      </div>
      <div id="crContent"></div>`;
    const c = document.getElementById('crContent');
    if(crSub === 'student') crViewStudent(c);
    else if(crSub === 'final') crViewFinal(c);
    else if(crSub === 'weights') crViewWeights(c);
    else crViewSheet(c);
  }
  window.crSwitch = function(k){ crSub = k; crRender(); };
  window.crSet = function(k, v, sub){
    if(k === 'class'){ crClass = v; crStudentId = ''; }
    else if(k === 'section'){ crSection = v; crStudentId = ''; }
    else if(k === 'stage') crStageId = v;
    else if(k === 'student') crStudentId = v;
    else if(k === 'rank') crShowRank = !!v;
    else if(k === 'fsub') crFinalSubject = v;
    else if(k === 'wscope') crWeightScope = v;
    if(sub) crSub = sub;
    crRender();
  };

  function crStageNote(stage, exams){
    if(!exams.length) return `<div class="empty-state"><b>No exams counted in this stage yet</b>Check that exams have subjects configured for this class and that their weight is above 0 (Weightage &amp; Stages tab).</div>`;
    return `<div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">Counts: ${exams.map(e => `<span class="pill">${esc(e.name)} · ${crWeight(e, crClass)}%</span>`).join(' ')}</div>`;
  }
  function crGradeChip(g){ return `<span class="grade-pill ${isFailGrade(g) ? 'fail' : ''}">${esc(g)}</span>`; }

  function crViewSheet(c){
    const stage = crStage(crStageId);
    const rows = crComputeClass(crClass, crSection, stage);
    const exams = crStageExams(stage, crClass, crSection);
    if(!rows.length){ c.innerHTML = `<div class="empty-state"><b>No students in ${esc(crClass)} — Section ${esc(crSection)}</b></div>`; return; }
    const subjNames = rows[0] && rows[0].subjects.length ? rows.reduce((acc, r) => { r.subjects.forEach(x => { if(!acc.includes(x.name)) acc.push(x.name); }); return acc; }, []) : [];
    c.innerHTML = crStageNote(stage, exams) + (exams.length ? `
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
        <button class="btn btn-primary btn-sm" onclick="crPrintSheet()">🖨️ Print Class Sheet</button>
        <button class="btn btn-ghost btn-sm" onclick="crPrintAllStudents()">🖨️ Print every student's report</button>
        <button class="btn btn-ghost btn-sm" onclick="crDownloadCsv()">⬇️ Download CSV</button>
      </div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr><th>Rank</th><th>Student</th><th>Adm. No</th>${subjNames.map(n => `<th>${esc(n)}</th>`).join('')}<th>Overall %</th><th>Grade</th></tr></thead><tbody>
        ${rows.map(r => `<tr>
          <td>${r.rank || '—'}</td>
          <td class="name-cell"><a style="cursor:pointer;" onclick="crSet('student','${r.s.id}','student')">${esc(r.s.lastName)} ${esc(r.s.firstName)}</a>${r.pendingCount ? ` <span class="pill" title="${r.pendingCount} mark(s) not entered yet" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">pending ${r.pendingCount}</span>` : ''}</td>
          <td>${esc(r.s.admissionNo)}</td>
          ${subjNames.map(n => { const x = r.subjects.find(y => y.name === n); return `<td>${x && x.pct !== null ? x.pct + '% ' + crGradeChip(x.grade) + (x.overridden ? ' ✎' : '') : '—'}</td>`; }).join('')}
          <td><b>${r.overall !== null ? r.overall + '%' : '—'}</b></td>
          <td>${crGradeChip(r.grade)}</td>
        </tr>`).join('')}
        </tbody></table>
      </div>
      <p style="font-size:0.76rem; color:var(--ink-soft); margin-top:8px;">✎ = a final (moderation) mark was used for that subject. "pending" = some exam marks are not entered yet; those are skipped, not counted as zero. Absent counts as 0.</p>` : '');
  }

  function crViewStudent(c){
    const stage = crStage(crStageId);
    const roster = crRoster(crClass, crSection);
    if(!roster.length){ c.innerHTML = `<div class="empty-state"><b>No students in ${esc(crClass)} — Section ${esc(crSection)}</b></div>`; return; }
    if(!crStudentId || !roster.some(s => s.id === crStudentId)) crStudentId = roster[0].id;
    const s = roster.find(x => x.id === crStudentId);
    const data = crComputeClass(crClass, crSection, stage).find(r => r.s.id === s.id);
    const idx = roster.findIndex(x => x.id === s.id);
    c.innerHTML = `
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:12px;">
        <button class="btn btn-ghost btn-sm" ${idx === 0 ? 'disabled' : ''} onclick="crSet('student','${idx > 0 ? roster[idx - 1].id : ''}')">◀ Prev</button>
        <select onchange="crSet('student',this.value)">${roster.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${esc(x.lastName)} ${esc(x.firstName)} (${esc(x.admissionNo)})</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" ${idx === roster.length - 1 ? 'disabled' : ''} onclick="crSet('student','${idx < roster.length - 1 ? roster[idx + 1].id : ''}')">Next ▶</button>
        <button class="btn btn-primary btn-sm" onclick="crPrintStudent('${s.id}')">🖨️ Print this report</button>
        <button class="btn btn-ghost btn-sm" onclick="crPrintAllStudents()">🖨️ Print whole class</button>
        <label style="font-size:0.82rem; display:flex; align-items:center; gap:6px;"><input type="checkbox" ${crShowRank ? 'checked' : ''} onchange="crSet('rank',this.checked)"> Show rank on student reports</label>
      </div>
      ${crStageNote(stage, data.exams)}
      ${data.exams.length ? crStudentTableHtml(data, false) + crSummaryHtml(data, crShowRank) : ''}`;
  }
  function crCellText(cell){
    if(!cell) return '—';
    if(cell.pending) return '<span style="color:var(--ink-soft);">pending</span>';
    if(cell.absent) return 'AB / ' + cell.max;
    return cell.marks + ' / ' + cell.max;
  }
  function crStudentTableHtml(d, forPrint){
    return `<div class="table-wrap" style="overflow-x:auto;"><table><thead><tr><th>Subject</th>
      ${d.exams.map(ex => `<th>${esc(ex.name)}<br><span style="font-weight:400; font-size:0.72rem;">weight ${crWeight(ex, d.s.className)}%</span></th>`).join('')}
      <th>Weighted %</th><th>Final %</th><th>Grade</th></tr></thead><tbody>
      ${d.subjects.map(x => `<tr>
        <td class="name-cell">${esc(x.name)}${x.countable ? '' : ' <span style="font-size:0.7rem; color:var(--ink-soft);">(grade only)</span>'}</td>
        ${x.cells.map(cl => `<td>${crCellText(cl)}</td>`).join('')}
        <td>${x.computed !== null ? x.computed + '%' : '—'}</td>
        <td><b>${x.pct !== null ? x.pct + '%' : '—'}</b>${x.overridden ? ` <span title="${esc(x.reason)}">✎</span>` : ''}</td>
        <td>${crGradeChip(x.grade)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  }
  function crSummaryHtml(d, showRank){
    const rank = (showRank && d.overall !== null) ? crComputeClass(d.s.className, d.s.section, crStage(crStageId)).find(r => r.s.id === d.s.id).rank : null;
    return `<div class="fee-summary-row" style="margin-top:14px;">
      <div class="fee-sum-card"><b>${d.overall !== null ? d.overall + '%' : '—'}</b><span>Overall Percentage</span></div>
      <div class="fee-sum-card">${crGradeChip(d.grade)}<span>Overall Grade</span></div>
      ${rank ? `<div class="fee-sum-card"><b>${rank}</b><span>Rank in class</span></div>` : ''}
    </div>`;
  }

  /* ---------- final (moderation) marks ---------- */
  function crViewFinal(c){
    const stage = crStage(crStageId);
    const rows = crComputeClass(crClass, crSection, stage);
    const exams = crStageExams(stage, crClass, crSection);
    const subjNames = rows.reduce((acc, r) => { r.subjects.forEach(x => { if(!acc.includes(x.name)) acc.push(x.name); }); return acc; }, []);
    if(!subjNames.length){ c.innerHTML = crStageNote(stage, exams); return; }
    if(!crFinalSubject || !subjNames.includes(crFinalSubject)) crFinalSubject = subjNames[0];
    const edit = canEditCr();
    c.innerHTML = `
      <p style="font-size:0.84rem; color:var(--ink-soft); max-width:720px; margin-bottom:10px;">
        Optional. Enter a <b>final mark out of 100</b> for a subject to use instead of the calculated weighted %, for example after moderation. Leave blank to use the calculated value.
        The exam marks themselves are never changed. ${edit ? '' : '<b>Only the Admin or Principal can change these.</b>'}
      </p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
        <label style="font-size:0.85rem; font-weight:600;">Subject</label>
        <select onchange="crSet('fsub',this.value)">${subjNames.map(n => `<option ${n === crFinalSubject ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
        ${edit ? `<button class="btn btn-primary btn-sm" onclick="crSaveFinal()">💾 Save final marks</button>` : ''}
      </div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Calculated %</th><th>Final mark (out of 100)</th><th>Reason</th><th>Last changed</th></tr></thead><tbody>
      ${rows.map(r => {
        const x = r.subjects.find(y => y.name === crFinalSubject);
        const ov = crFinal[stage.id + '|' + r.s.id + '|' + crFinalSubject] || {};
        return `<tr>
          <td class="name-cell">${esc(r.s.lastName)} ${esc(r.s.firstName)}</td>
          <td>${x && x.computed !== null ? x.computed + '%' : '—'}</td>
          <td><input type="number" class="input cr-final-mark" data-sid="${r.s.id}" min="0" max="100" step="0.1" style="width:90px;" value="${ov.mark !== undefined && ov.mark !== null ? esc(ov.mark) : ''}" ${edit ? '' : 'disabled'}></td>
          <td><input type="text" class="input cr-final-reason" data-sid="${r.s.id}" placeholder="e.g. moderation" style="min-width:180px;" value="${esc(ov.reason || '')}" ${edit ? '' : 'disabled'}></td>
          <td style="font-size:0.76rem; color:var(--ink-soft);">${ov.by ? esc(ov.by) + '<br>' + esc((ov.at || '').slice(0, 10)) : '—'}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }
  window.crSaveFinal = async function(){
    if(!canEditCr()){ showToast('Only the Admin or Principal can change final marks.'); return; }
    const stage = crStage(crStageId);
    const who = (currentUser && (currentUser.name || currentUser.username)) || currentUser.role;
    const now = new Date().toISOString();
    let changed = 0;
    const next = { ...crFinal };
    const inputs = document.querySelectorAll('.cr-final-mark');
    for(const inp of inputs){
      const sid = inp.dataset.sid, key = stage.id + '|' + sid + '|' + crFinalSubject;
      const val = inp.value.trim();
      const reasonEl = Array.from(document.querySelectorAll('.cr-final-reason')).find(e => e.dataset.sid === sid);
      const reason = reasonEl ? reasonEl.value.trim() : '';
      const prev = next[key];
      if(val === ''){ if(prev){ delete next[key]; changed++; } continue; }
      const n = Number(val);
      if(isNaN(n) || n < 0 || n > 100){ showToast('Final marks must be between 0 and 100.'); return; }
      if(!prev || Number(prev.mark) !== n || (prev.reason || '') !== reason){
        next[key] = { mark: n, reason, by: who, at: now }; changed++;
      }
    }
    if(!changed){ showToast('Nothing changed.'); return; }
    await storageSet(FINAL_KEY, next);
    crFinal = next;
    showToast('Final marks saved.', 'burst');
    crRender();
  };

  /* ---------- weightage & stages ---------- */
  function crViewWeights(c){
    const edit = canEditCr();
    const scope = crWeightScope;
    const cls = scope === '__all__' ? null : scope;
    const exams = crSortedExams().filter(ex => !cls || classAllowedForExamType(ex.examType, cls));
    const eff = ex => {
      if(cls){ const m = crCfg.weights.byClass[cls]; if(m && m[ex.id] !== undefined && m[ex.id] !== '') return Number(m[ex.id]) || 0; }
      if(crCfg.weights.all && crCfg.weights.all[ex.id] !== undefined && crCfg.weights.all[ex.id] !== '') return Number(crCfg.weights.all[ex.id]) || 0;
      return crDefaultWeight(ex.name);
    };
    const stages = crStages();
    c.innerHTML = `
      <div class="profile-card" style="margin-bottom:16px;">
        <h4 style="margin:0 0 6px;">Exam weightage</h4>
        <p style="font-size:0.82rem; color:var(--ink-soft); margin:0 0 10px; max-width:700px;">Set how much each exam counts (in %). The standard pattern is FA1–FA4 at 10 each and SA1, SA2 at 30 each (total 100). Exams at 0 are not counted. If an exam has not been conducted yet, the weights of the exams that have are scaled to 100, so students are never penalised for it.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
          <label style="font-size:0.85rem; font-weight:600;">Apply to</label>
          <select onchange="crSet('wscope',this.value)"><option value="__all__" ${scope === '__all__' ? 'selected' : ''}>All classes</option>${CLASS_LEVELS.map(x => `<option ${x === scope ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
          ${edit ? `<button class="btn btn-primary btn-sm" onclick="crSaveWeights()">💾 Save weightage</button><button class="btn btn-ghost btn-sm" onclick="crResetWeights()">↺ Reset to standard</button>` : '<b style="font-size:0.82rem;">Only the Admin or Principal can change this.</b>'}
        </div>
        ${exams.length ? `<div class="table-wrap" style="max-width:640px;"><table><thead><tr><th>Exam</th><th>Date</th><th>Weight %</th></tr></thead><tbody>
          ${exams.map(ex => `<tr><td class="name-cell">${esc(ex.name)}</td><td>${esc(ex.startDate || '—')}</td><td><input type="number" class="input cr-w" data-eid="${ex.id}" min="0" max="100" step="0.5" style="width:90px;" value="${eff(ex)}" oninput="crUpdateTotal()" ${edit ? '' : 'disabled'}></td></tr>`).join('')}
          <tr><td colspan="2"><b>Total of all exams listed</b></td><td><b id="crWTotal">—</b></td></tr>
        </tbody></table></div>
        <div id="crWWarn" style="font-size:0.8rem; margin-top:8px;"></div>` : `<div class="empty-state"><b>No exams yet</b>Create exams under Exams first.</div>`}
        ${scope !== '__all__' && crCfg.weights.byClass[scope] ? `<p style="font-size:0.78rem; color:var(--ink-soft);">${esc(scope)} has its own weightage.</p>` : ''}
      </div>
      <div class="profile-card">
        <h4 style="margin:0 0 6px;">Stages (progress reports)</h4>
        <p style="font-size:0.82rem; color:var(--ink-soft); margin:0 0 10px; max-width:700px;">Each stage includes every exam up to the exam you choose (by date). Example: "up to SA1" gives FA1, FA2 and SA1; "up to FA3" gives everything conducted till FA3.</p>
        <div id="crStageRows">${stages.map((sg, i) => crStageRowHtml(sg, i, edit)).join('')}</div>
        ${edit ? `<div style="display:flex; gap:10px; margin-top:10px;"><button class="btn btn-ghost btn-sm" onclick="crAddStage()">+ Add stage</button><button class="btn btn-primary btn-sm" onclick="crSaveStages()">💾 Save stages</button><button class="btn btn-ghost btn-sm" onclick="crResetStages()">↺ Reset to standard</button></div>` : ''}
      </div>`;
    crUpdateTotal();
  }
  function crStageRowHtml(sg, i, edit){
    const exams = crSortedExams();
    return `<div class="cr-stage-row" data-id="${esc(sg.id)}" style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
      <input type="text" class="input cr-st-name" style="min-width:260px;" value="${esc(sg.name)}" ${edit ? '' : 'disabled'}>
      <span style="font-size:0.82rem;">up to</span>
      <select class="cr-st-upto" ${edit ? '' : 'disabled'}><option value="ALL" ${sg.upto === 'ALL' ? 'selected' : ''}>All exams</option>${exams.map(e => `<option value="${e.id}" ${sg.upto === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
      ${edit ? `<button class="btn-danger-text" onclick="this.closest('.cr-stage-row').remove()">Remove</button>` : ''}
    </div>`;
  }
  window.crUpdateTotal = function(){
    const t = document.getElementById('crWTotal'); if(!t) return;
    let total = 0; document.querySelectorAll('.cr-w').forEach(i => { total += Number(i.value) || 0; });
    t.textContent = r1(total) + '%';
    const w = document.getElementById('crWWarn');
    if(w) w.innerHTML = Math.abs(total - 100) < 0.01 ? '<span style="color:#0f6a63;">✓ Adds up to 100%.</span>' : `<span style="color:#8a6a1f;">Total is ${r1(total)}%, not 100%. This is allowed (results are still shown out of 100), but most schools use a total of 100%.</span>`;
  };
  window.crSaveWeights = async function(){
    if(!canEditCr()){ showToast('Only the Admin or Principal can change this.'); return; }
    const map = {};
    document.querySelectorAll('.cr-w').forEach(i => {
      const v = Number(i.value);
      if(isNaN(v) || v < 0 || v > 100) return;
      map[i.dataset.eid] = v;
    });
    const next = { ...crCfg, weights: { all: { ...crCfg.weights.all }, byClass: { ...crCfg.weights.byClass } } };
    if(crWeightScope === '__all__') next.weights.all = { ...next.weights.all, ...map };
    else next.weights.byClass[crWeightScope] = map;
    await storageSet(CFG_KEY, next); crCfg = next;
    showToast('Weightage saved.', 'burst'); crRender();
  };
  window.crResetWeights = async function(){
    if(!await showConfirmDialog(crWeightScope === '__all__' ? 'Reset weightage for ALL classes to the standard (FA 10 each, SA 30 each)?' : 'Remove this class’s own weightage and use the school-wide one?')) return;
    const next = { ...crCfg, weights: { all: { ...crCfg.weights.all }, byClass: { ...crCfg.weights.byClass } } };
    if(crWeightScope === '__all__') next.weights.all = {}; else delete next.weights.byClass[crWeightScope];
    await storageSet(CFG_KEY, next); crCfg = next; crRender();
  };
  window.crAddStage = function(){
    const host = document.getElementById('crStageRows'); if(!host) return;
    const div = document.createElement('div');
    div.innerHTML = crStageRowHtml({ id: 'st_' + Date.now(), name: 'New stage', upto: 'ALL' }, 0, true);
    host.appendChild(div.firstElementChild);
  };
  window.crSaveStages = async function(){
    if(!canEditCr()){ showToast('Only the Admin or Principal can change this.'); return; }
    const rows = Array.from(document.querySelectorAll('.cr-stage-row')).map(r => ({
      id: r.dataset.id, name: r.querySelector('.cr-st-name').value.trim(), upto: r.querySelector('.cr-st-upto').value }));
    if(!rows.length || rows.some(r => !r.name)){ showToast('Give every stage a name (and keep at least one stage).'); return; }
    const next = { ...crCfg, stages: rows };
    await storageSet(CFG_KEY, next); crCfg = next;
    showToast('Stages saved.', 'burst'); crRender();
  };
  window.crResetStages = async function(){
    if(!await showConfirmDialog('Reset the stages to the standard ones?')) return;
    const next = { ...crCfg, stages: [] };
    await storageSet(CFG_KEY, next); crCfg = next; crStageId = ''; crRender();
  };

  /* ---------- printing / CSV ---------- */
  function crCss(landscape){
    return `@page{ size:A4 ${landscape ? 'landscape' : 'portrait'}; margin:12mm; }
      body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
      .pg{ page-break-after:always; } .pg:last-child{ page-break-after:auto; }
      .rc-head{ display:flex; align-items:center; gap:12px; justify-content:center; margin-bottom:4px; }
      .rc-head img{ width:44px; height:44px; border-radius:50%; }
      .rc-school{ font-weight:700; font-size:18px; text-align:center; }
      .rc-addr{ font-size:11px; text-align:center; color:#555; margin-bottom:10px; }
      .rc-title{ text-align:center; font-weight:700; font-size:13px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin-bottom:10px; }
      .rc-info{ display:grid; grid-template-columns:1fr 1fr; gap:5px; font-size:12px; margin-bottom:12px; }
      table{ width:100%; border-collapse:collapse; font-size:11px; margin-bottom:12px; }
      th,td{ border:1px solid #999; padding:4px 6px; text-align:left; } th{ background:#211A4E; color:#fff; }
      .rc-summary{ display:flex; gap:24px; font-size:13px; margin-bottom:24px; }
      .rc-sign{ display:flex; justify-content:space-between; font-size:12px; margin-top:44px; }
      .rc-sign img{ height:34px; display:block; margin-bottom:3px; }
      .rc-note{ font-size:10px; color:#555; }`;
  }
  function crHeaderHtml(title){
    let logo = ''; try{ logo = document.querySelector('.sb-brand img').src; }catch(e){}
    let brand = ''; try{ brand = brandLineHtml({ size: '11px' }) + brandFixedWmHtml(); }catch(e){}
    return `<div class="rc-head">${logo ? `<img src="${logo}">` : ''}</div><div class="rc-school">${esc(schoolInfo.name)}</div><div class="rc-addr">${esc(schoolInfo.address)}</div>${brand}<div class="rc-title">${esc(title)}</div>`;
  }
  function crSignHtml(s){
    const t = (reportTemplates && (reportTemplates.find(x => x.isDefault) || reportTemplates[0])) || { signatureLabel1: 'Class Teacher', signatureLabel2: 'Principal / Correspondent' };
    let s1 = '', s2 = ''; try{ s1 = resolveReportSignature1(t, s); s2 = resolveReportSignature2(t); }catch(e){}
    return `<div class="rc-sign"><div>${s1 ? `<img src="${s1}">` : ''}${esc(t.signatureLabel1 || 'Class Teacher')}</div><div>${s2 ? `<img src="${s2}" style="margin-left:auto;">` : ''}${esc(t.signatureLabel2 || 'Principal / Correspondent')}</div></div>`;
  }
  function crStudentPageHtml(d, stage, showRank){
    const rank = (showRank && d.overall !== null) ? crComputeClass(d.s.className, d.s.section, stage).find(r => r.s.id === d.s.id).rank : null;
    return `<div class="pg">${crHeaderHtml(stage.name.toUpperCase() + ' — ' + (typeof currentAcademicYearValue !== 'undefined' ? 'AY ' + currentAcademicYearValue : ''))}
      <div class="rc-info"><div>Student Name: <b>${esc(d.s.lastName)} ${esc(d.s.firstName)}</b></div><div>Admission No: <b>${esc(d.s.admissionNo)}</b></div>
      <div>Class &amp; Section: <b>${esc(d.s.className)} — ${esc(d.s.section)}</b></div><div>Father Name: <b>${esc(d.s.fatherName || '—')}</b></div></div>
      <table><thead><tr><th>Subject</th>${d.exams.map(ex => `<th>${esc(ex.name)}<br>(${crWeight(ex, d.s.className)}%)</th>`).join('')}<th>Weighted %</th><th>Final %</th><th>Grade</th></tr></thead><tbody>
      ${d.subjects.map(x => `<tr><td>${esc(x.name)}</td>${x.cells.map(cl => `<td>${!cl ? '—' : cl.pending ? '—' : cl.absent ? 'AB/' + cl.max : cl.marks + '/' + cl.max}</td>`).join('')}<td>${x.computed !== null ? x.computed : '—'}</td><td><b>${x.pct !== null ? x.pct : '—'}</b>${x.overridden ? '*' : ''}</td><td>${esc(x.grade)}</td></tr>`).join('')}
      </tbody></table>
      <div class="rc-summary"><div>Overall Percentage: <b>${d.overall !== null ? d.overall + '%' : '—'}</b></div><div>Overall Grade: <b>${esc(d.grade)}</b></div>${rank ? `<div>Rank: <b>${rank}</b></div>` : ''}</div>
      <div class="rc-note">Weighted % = marks of each exam combined using the exam weights shown. Absent (AB) counts as 0.${d.hasOverride ? ' * Final mark after moderation.' : ''}${d.pendingCount ? ' Some marks are not entered yet and are not counted.' : ''}</div>
      ${crSignHtml(d.s)}</div>`;
  }
  function crOpenPrint(title, inner, landscape){
    const w = window.open('', '_blank');
    if(!w){ showToast('Please allow pop-ups to print.'); return; }
    w.document.write(`<html><head><title>${esc(title)}</title><style>${crCss(landscape)}</style></head><body onload="window.print()">${inner}</body></html>`);
    w.document.close();
  }
  window.crPrintStudent = function(id){
    const stage = crStage(crStageId), s = students.find(x => x.id === id); if(!s) return;
    const d = crCompute(s, stage);
    crOpenPrint('Report - ' + s.lastName + ' ' + s.firstName, crStudentPageHtml(d, stage, crShowRank), false);
  };
  window.crPrintAllStudents = async function(){
    const stage = crStage(crStageId);
    const rows = crComputeClass(crClass, crSection, stage).filter(r => r.exams.length);
    if(!rows.length){ showToast('Nothing to print yet.'); return; }
    if(rows.length > 60 && !await showConfirmDialog('Print ' + rows.length + ' reports at once? This can take a moment.')) return;
    crOpenPrint('Reports - ' + crClass + ' ' + crSection, rows.map(r => crStudentPageHtml(r, stage, crShowRank)).join(''), false);
  };
  window.crPrintSheet = function(){
    const stage = crStage(crStageId);
    const rows = crComputeClass(crClass, crSection, stage);
    const exams = crStageExams(stage, crClass, crSection);
    const subj = rows.reduce((acc, r) => { r.subjects.forEach(x => { if(!acc.includes(x.name)) acc.push(x.name); }); return acc; }, []);
    const inner = `<div class="pg">${crHeaderHtml(stage.name.toUpperCase() + ' — ' + crClass + ' Section ' + crSection)}
      <div class="rc-note" style="margin-bottom:8px;">Exams counted: ${exams.map(e => esc(e.name) + ' (' + crWeight(e, crClass) + '%)').join(', ')}</div>
      <table><thead><tr><th>Rank</th><th>Student</th><th>Adm. No</th>${subj.map(n => `<th>${esc(n)}</th>`).join('')}<th>Overall %</th><th>Grade</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${r.rank || '—'}</td><td>${esc(r.s.lastName)} ${esc(r.s.firstName)}</td><td>${esc(r.s.admissionNo)}</td>${subj.map(n => { const x = r.subjects.find(y => y.name === n); return `<td>${x && x.pct !== null ? x.pct + ' (' + esc(x.grade) + ')' + (x.overridden ? '*' : '') : '—'}</td>`; }).join('')}<td><b>${r.overall !== null ? r.overall : '—'}</b></td><td>${esc(r.grade)}</td></tr>`).join('')}
      </tbody></table><div class="rc-note">Subject figures are weighted % with grade. * = final mark after moderation. Absent counts as 0. Marks not yet entered are not counted.</div>
      ${crSignHtml({ className: crClass, section: crSection })}</div>`;
    crOpenPrint('Class Sheet - ' + crClass + ' ' + crSection, inner, true);
  };
  window.crDownloadCsv = function(){
    const stage = crStage(crStageId);
    const rows = crComputeClass(crClass, crSection, stage);
    const subj = rows.reduce((acc, r) => { r.subjects.forEach(x => { if(!acc.includes(x.name)) acc.push(x.name); }); return acc; }, []);
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [['Rank', 'Student', 'Admission No'].concat(subj, ['Overall %', 'Grade']).map(q).join(',')];
    rows.forEach(r => lines.push([r.rank || '', r.s.lastName + ' ' + r.s.firstName, r.s.admissionNo].concat(subj.map(n => { const x = r.subjects.find(y => y.name === n); return x && x.pct !== null ? x.pct : ''; }), [r.overall !== null ? r.overall : '', r.grade]).map(q).join(',')));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ('class-sheet-' + crClass + '-' + crSection + '.csv').replace(/\s+/g, '-'); document.body.appendChild(a); a.click(); a.remove();
  };

  window.renderConsolidatedTab = renderConsolidatedTab;
})();
