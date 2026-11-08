
  function onCsGroupChange(){
    csSelectedGroupId = document.getElementById('csGroupSelect').value;
    if(csCurrentStudentId) loadConsolidatedReport();
  }

  function onCsSearchInput(){
    clearTimeout(csSearchDebounce);
    csSearchDebounce = setTimeout(() => renderCsSuggestions(document.getElementById('csSearch').value.trim()), 150);
  }
  function renderCsSuggestions(q){
    const box = document.getElementById('csSearchSuggestions');
    if(!box) return;
    if(q.length < 2){ box.classList.remove('open'); box.innerHTML=''; return; }
    const ql = q.toLowerCase();
    const matches = students.filter(s => (s.firstName||'').toLowerCase().includes(ql) || (s.lastName||'').toLowerCase().includes(ql) || (s.admissionNo||'').toLowerCase().includes(ql)).slice(0,8);
    if(matches.length===0){ box.innerHTML = `<div class="sg-empty">No students match "${q}"</div>`; box.classList.add('open'); return; }
    box.innerHTML = matches.map(s => `<div class="sg-item" onmousedown="selectCsSuggestion('${s.id}')">
      <div class="sg-avatar">${s.photo?`<img src="${s.photo}">`:initials(s)}</div>
      <div><div class="sg-name">${s.lastName} ${s.firstName}</div><div class="sg-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
    </div>`).join('');
    box.classList.add('open');
  }
  function selectCsSuggestion(id){
    hideCsSuggestions();
    document.getElementById('csSearch').value = '';
    csCurrentStudentId = id;
    loadConsolidatedReport();
  }
  function hideCsSuggestions(){
    const box = document.getElementById('csSearchSuggestions');
    if(box) box.classList.remove('open');
  }

  function buildConsolidatedData(studentId, groupId){
    const s = students.find(x => x.id === studentId);
    if(!s) return null;
    const group = groupId ? examGroups.find(g => g.id === groupId) : null;
    let relevantExams = examDefs
      .filter(ex => getExamSubjects(ex, s.className, s.section).length > 0)
      .sort((a,b) => (a.startDate||'').localeCompare(b.startDate||''));
    if(group) relevantExams = relevantExams.filter(ex => group.examIds.includes(ex.id));
    const subjectSet = [];
    relevantExams.forEach(ex => {
      getExamSubjects(ex, s.className, s.section).forEach(sub => {
        if(!subjectSet.includes(sub.name)) subjectSet.push(sub.name);
      });
    });
    subjectSet.sort();

    const matrix = subjectSet.map(subjName => {
      const cells = relevantExams.map(ex => {
        const subjDef = getExamSubjects(ex, s.className, s.section).find(sub => sub.name === subjName);
        if(!subjDef) return null;
        const r = examResults.find(r => r.examId===ex.id && r.studentId===s.id && r.subject===subjName);
        return { marks: r ? r.marks : null, max: subjDef.maxMarks, countable: subjDef.countable !== false };
      });
      return { subject: subjName, cells };
    });

    const examTotals = relevantExams.map((ex, i) => {
      let obtained = 0, max = 0;
      matrix.forEach(row => { const c = row.cells[i]; if(c && c.countable){ max += c.max; obtained += (Number(c.marks)||0); } });
      return { obtained, max };
    });
    const grandObtained = examTotals.reduce((sum,t) => sum+t.obtained, 0);
    const grandMax = examTotals.reduce((sum,t) => sum+t.max, 0);
    const overallPct = grandMax > 0 ? Math.round((grandObtained/grandMax)*1000)/10 : 0;
    const overallGrade = gradeForConsolPct(overallPct);

    return { s, relevantExams, matrix, examTotals, grandObtained, grandMax, overallPct, overallGrade };
  }

  function loadConsolidatedReport(){
    const data = buildConsolidatedData(csCurrentStudentId, csSelectedGroupId);
    if(!data){ document.getElementById('csResult').innerHTML = `<div class="empty-state"><b>No data</b></div>`; return; }
    const { s, relevantExams, matrix, examTotals, grandObtained, grandMax, overallPct, overallGrade } = data;

    if(relevantExams.length === 0){
      document.getElementById('csResult').innerHTML = `
        <div class="profile-head">
          ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
          <div><h2>${s.lastName} ${s.firstName}</h2><div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section}</div></div>
        </div>
        <div class="empty-state"><b>No exams with configured subjects yet</b>Configure subjects for ${s.className} — Section ${s.section} under the "Exams" tab first.</div>
      `;
      return;
    }

    document.getElementById('csResult').innerHTML = `
      <div class="profile-head">
        ${s.photo ? `<img class="profile-photo" src="${s.photo}">` : `<div class="profile-photo">${initials(s)}</div>`}
        <div><h2>${s.lastName} ${s.firstName}</h2><div class="p-meta">${s.admissionNo} · ${s.className} — Section ${s.section} · ${relevantExams.length} exam(s)</div></div>
        <div class="profile-actions"><button class="btn btn-primary" onclick="printConsolidatedReport('${s.id}')">Print Consolidated Report</button></div>
      </div>
      <div class="table-wrap" style="overflow-x:auto;">
        <table><thead><tr>
          <th>Subject</th>
          ${relevantExams.map(ex => `<th>${ex.name}</th>`).join('')}
        </tr></thead>
        <tbody>
        ${matrix.map(row => `<tr>
          <td class="name-cell">${row.subject}</td>
          ${row.cells.map(c => `<td>${c ? (c.marks!==null ? c.marks+' / '+c.max : '— / '+c.max) : '—'}</td>`).join('')}
        </tr>`).join('')}
        <tr class="rcpt-total-row">
          <td><b>Total</b></td>
          ${examTotals.map(t => `<td><b>${t.obtained} / ${t.max}</b></td>`).join('')}
        </tr>
        </tbody></table>
      </div>
      <div class="fee-summary-row" style="margin-top:16px;">
        <div class="fee-sum-card"><b>${grandObtained} / ${grandMax}</b><span>Grand Total</span></div>
        <div class="fee-sum-card"><b>${overallPct}%</b><span>Overall Percentage</span></div>
        <div class="fee-sum-card"><span class="grade-pill ${isFailGrade(overallGrade)?'fail':''}" style="font-size:1.1rem;">${overallGrade}</span><span>Overall Grade</span></div>
      </div>
    `;
  }

  function printConsolidatedReport(studentId){
    const data = buildConsolidatedData(studentId, csSelectedGroupId);
    if(!data) return;
    const { s, relevantExams, matrix, examTotals, grandObtained, grandMax, overallPct, overallGrade } = data;
    const logoSrc = document.querySelector('.sb-brand img').src;
    const t = reportTemplates.find(x => x.isDefault) || reportTemplates[0] || { signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent' };
    const grp = csSelectedGroupId ? examGroups.find(g => g.id === csSelectedGroupId) : null;
    const consolTitle = grp ? `CONSOLIDATED REPORT — ${grp.name.toUpperCase()}` : 'CONSOLIDATED ANNUAL REPORT';

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Consolidated Report - ${s.lastName} ${s.firstName}</title>
      <style>
        @page{ size:A4; margin:14mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
        .rc-head{ display:flex; align-items:center; gap:12px; justify-content:center; margin-bottom:6px; }
        .rc-head img{ width:44px; height:44px; border-radius:50%; }
        .rc-school{ font-weight:700; font-size:18px; text-align:center; }
        .rc-addr{ font-size:11px; text-align:center; color:#555; margin-bottom:14px; }
        .rc-title{ text-align:center; font-weight:700; font-size:13px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin-bottom:14px; }
        .rc-info{ display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-bottom:16px; }
        table{ width:100%; border-collapse:collapse; font-size:11px; margin-bottom:16px; }
        th,td{ border:1px solid #999; padding:5px 6px; text-align:left; }
        th{ background:#211A4E; color:#fff; }
        .rc-summary{ display:flex; gap:24px; font-size:13px; margin-bottom:30px; }
        .rc-sign{ display:flex; justify-content:space-between; font-size:12px; margin-top:50px; }
        .rc-sign img{ height:34px; display:block; margin-bottom:3px; }
      </style></head>
      <body onload="window.print()">
        <div class="rc-head"><img src="${logoSrc}"></div>
        <div class="rc-school">${schoolInfo.name}</div>
        <div class="rc-addr">${schoolInfo.address}</div>
        ${brandLineHtml({ size:'11px' })}${brandFixedWmHtml()}
        <div class="rc-title">${consolTitle}</div>
        <div class="rc-info">
          <div>Student Name: <b>${s.lastName} ${s.firstName}</b></div>
          <div>Admission No: <b>${s.admissionNo}</b></div>
          <div>Class &amp; Section: <b>${s.className} — ${s.section}</b></div>
          <div>Father Name: <b>${s.fatherName||'—'}</b></div>
        </div>
        <table>
          <thead><tr><th>Subject</th>${relevantExams.map(ex => `<th>${ex.name}</th>`).join('')}</tr></thead>
          <tbody>
          ${matrix.map(row => `<tr><td>${row.subject}</td>${row.cells.map(c => `<td>${c ? (c.marks!==null ? c.marks+'/'+c.max : '—/'+c.max) : '—'}</td>`).join('')}</tr>`).join('')}
          <tr><td><b>Total</b></td>${examTotals.map(t => `<td><b>${t.obtained}/${t.max}</b></td>`).join('')}</tr>
          </tbody>
        </table>
        <div class="rc-summary">
          <div>Grand Total: <b>${grandObtained} / ${grandMax}</b></div>
          <div>Overall Percentage: <b>${overallPct}%</b></div>
          <div>Overall Grade: <b>${overallGrade}</b></div>
        </div>
        <div class="rc-sign">
          <div>${resolveReportSignature1(t,s) ? `<img src="${resolveReportSignature1(t,s)}">` : ''}${t.signatureLabel1 || 'Class Teacher'}</div>
          <div>${resolveReportSignature2(t) ? `<img src="${resolveReportSignature2(t)}" style="margin-left:auto;">` : ''}${t.signatureLabel2 || 'Principal / Correspondent'}</div>
        </div>
      </body></html>
    `);
    w.document.close();
  }

  /* --- Year-End Marks Card: a "Consolidation Scheme" (built and versioned via
     its own wizard below) is the full formula for one class/subject group's
     annual result — which exam types feed each weighted "bucket", how they
     combine (sum & scale raw marks, average %, latest exam, best/drop-lowest
     N), and each bucket's weight. Only one scheme may be Active for a given
     class+subject at a time (a subject-specific scheme always wins over an
     all-subjects one for the subjects it names, so both can be Active
     together). Anything not referenced by any Active scheme's buckets —
     Prefinals by default — never enters this calculation at all. Once a
     student's result is explicitly "Finalized & Issued" it's frozen forever
     as its own snapshot in yearEndRecords; editing or retiring the scheme
     afterward can never silently change an already-issued marksheet. --- */
  let yeClass = '', yeSection = '', yeView = 'cards', yeEditingSchemeId = null, yeDraft = null;

  function activeSchemesForClass(className){
    return consolSchemes.filter(sc => sc.status==='active' && (!sc.classScope || !sc.classScope.length || sc.classScope.includes(className)));
  }
  // A subject-specific scheme (e.g. the Science 8th-9th scheme) always wins
  // over an all-subjects scheme for the subjects it names — that's what lets
  // both be Active for the same classes simultaneously without ambiguity.
  function activeSchemeForClassSubject(className, subjectName){
    const candidates = activeSchemesForClass(className);
    if(!candidates.length) return null;
    const subjectSpecific = candidates.filter(sc => sc.subjectScope && sc.subjectScope.length && sc.subjectScope.includes(subjectName));
    if(subjectSpecific.length) return subjectSpecific[0];
    return candidates.find(sc => !sc.subjectScope || !sc.subjectScope.length) || null;
  }
  function classesWithActiveScheme(){
    return CLASS_LEVELS.filter(c => activeSchemesForClass(c).length > 0);
  }
  // Two schemes only truly conflict when they'd be equally-specific candidates
  // for the same class+subject — two general (all-subjects) schemes covering
  // the same class, or two subject-scoped schemes sharing a named subject. A
  // general scheme + a subject-specific one covering the same class is fine:
  // the specific one simply wins for its own subjects (see resolver above).
  function schemesOverlap(a, b){
    const aClasses = a.classScope||[], bClasses = b.classScope||[];
    const classesOverlap = (!aClasses.length || !bClasses.length) || aClasses.some(c => bClasses.includes(c));
    if(!classesOverlap) return false;
    const aGeneral = !(a.subjectScope && a.subjectScope.length), bGeneral = !(b.subjectScope && b.subjectScope.length);
    if(aGeneral && bGeneral) return true;
    if(!aGeneral && !bGeneral) return a.subjectScope.some(sub => b.subjectScope.includes(sub));
    return false;
  }
  function memberTypeNamesForBucket(bucket){
    return (bucket.memberTypeIds||[]).map(id => { const t = examTypes.find(x => x.id===id); return t ? t.name : null; }).filter(Boolean);
  }
  function examsForBucket(bucket){
    const names = memberTypeNamesForBucket(bucket);
    return examDefs.filter(ex => names.includes(ex.examType));
  }
  // Combines whatever member exams already have marks for this subject,
  // according to the bucket's chosen method. Every method is marks-aware —
  // "Sum & Scale" is marks-weighted (an 80-mark exam naturally counts for
  // more than a 50-mark one, matching how the official AP formula actually
  // works), not just an equal-weight average of each exam's own percentage.
  function computeBucketForSubject(bucket, studentId, className, section, subjectName){
    const exams = examsForBucket(bucket);
    const withData = exams.map(ex => {
      const subjDef = getExamSubjects(ex, className, section).find(s => s.name === subjectName);
      if(!subjDef) return null;
      const max = Number(subjDef.maxMarks) || 0;
      if(max <= 0) return null;
      const res = examResults.find(r => r.examId===ex.id && r.studentId===studentId && r.subject===subjectName);
      if(!res) return null;
      const marks = res.absent ? 0 : (Number(res.marks)||0);
      return { ex, marks, max, pct: (marks/max)*100 };
    }).filter(Boolean);
    if(!withData.length) return null;
    let combinedPct, detail;
    switch(bucket.method){
      case 'sum-scaled': {
        const sumMarks = withData.reduce((a,x) => a+x.marks, 0);
        const sumMax = withData.reduce((a,x) => a+x.max, 0);
        combinedPct = sumMax > 0 ? (sumMarks/sumMax)*100 : 0;
        detail = `${withData.length}/${exams.length} exam(s) · ${sumMarks}/${sumMax}`;
        break;
      }
      case 'best-n': {
        const n = Math.max(1, Number(bucket.n)||1);
        const sorted = withData.slice().sort((a,b) => b.pct-a.pct).slice(0, n);
        combinedPct = sorted.reduce((a,x) => a+x.pct, 0) / sorted.length;
        detail = `best ${sorted.length} of ${withData.length}`;
        break;
      }
      case 'drop-lowest-n': {
        const n = Math.max(0, Number(bucket.n)||0);
        const sorted = withData.slice().sort((a,b) => b.pct-a.pct);
        const kept = (n > 0 && sorted.length > n) ? sorted.slice(0, sorted.length-n) : sorted;
        combinedPct = kept.reduce((a,x) => a+x.pct, 0) / kept.length;
        detail = `dropped lowest ${Math.min(n, sorted.length-1)} of ${sorted.length}`;
        break;
      }
      case 'latest': {
        const byDate = withData.slice().sort((a,b) => (a.ex.startDate||'').localeCompare(b.ex.startDate||''));
        const latest = byDate[byDate.length-1];
        combinedPct = latest.pct;
        detail = latest.ex.name;
        break;
      }
      case 'avg-pct':
      default: {
        combinedPct = withData.reduce((a,x) => a+x.pct, 0) / withData.length;
        detail = `${withData.length}/${exams.length} exam(s), averaged`;
      }
    }
    return { pct: combinedPct, detail };
  }
  function computeYearEndSubjectWithScheme(scheme, studentId, className, section, subjectName){
    if(!scheme) return null;
    let weightedSum = 0, weightAvailable = 0;
    const breakdown = [];
    scheme.buckets.forEach(b => {
      const r = computeBucketForSubject(b, studentId, className, section, subjectName);
      if(r){
        weightedSum += (r.pct/100) * Number(b.weight||0);
        weightAvailable += Number(b.weight||0);
        breakdown.push({ label: b.label, detail: r.detail, pct: r.pct, weight: Number(b.weight||0) });
      }
    });
    if(weightAvailable === 0) return null;
    const totalWeight = scheme.buckets.reduce((a,b) => a+Number(b.weight||0), 0) || Number(scheme.totalMarks) || 100;
    const pct = (weightedSum / weightAvailable) * 100; // scaled up if not everything's been conducted yet
    return { pct: Math.round(pct*10)/10, weightAvailable, totalWeight, breakdown, schemeId: scheme.id, schemeName: scheme.name };
  }
  function computeYearEndSubject(studentId, className, section, subjectName){
    return computeYearEndSubjectWithScheme(activeSchemeForClassSubject(className, subjectName), studentId, className, section, subjectName);
  }
  // The subject roster for the card: the union of every countable subject
  // across every exam this class is offered (FA, SA, Prefinals — whatever
  // exists), so a subject never silently drops off the card just because one
  // exam type happened to omit it. Whether it actually earns a mark on the
  // card is decided separately, by whether any Active scheme's buckets cover it.
  function yearEndSubjectRoster(className, section){
    const names = new Set();
    examDefs.forEach(ex => {
      if(!classAllowedForExamType(ex.examType, className)) return;
      getExamSubjects(ex, className, section).forEach(s => { if(s.countable !== false) names.add(s.name); });
    });
    return Array.from(names);
  }
  function computeYearEndForStudentWithSchemeResolver(studentId, className, section, resolverFn){
    const roster = yearEndSubjectRoster(className, section);
    const subjects = roster.map(name => {
      const r = computeYearEndSubjectWithScheme(resolverFn(name), studentId, className, section, name);
      return { name, pct: r?r.pct:null, grade: r?gradeForConsolPct(r.pct):'—', breakdown: r?r.breakdown:[], complete: r?(r.weightAvailable>=r.totalWeight):false, schemeName: r?r.schemeName:null, schemeId: r?r.schemeId:null };
    });
    const withData = subjects.filter(s => s.pct !== null);
    const overallPct = withData.length ? Math.round((withData.reduce((a,s) => a+s.pct, 0)/withData.length)*10)/10 : null;
    const overallGrade = overallPct !== null ? gradeForConsolPct(overallPct) : '—';
    return { subjects, overallPct, overallGrade, allComplete: subjects.length>0 && subjects.every(s => s.complete) };
  }
  function computeYearEndForStudent(studentId, className, section){
    return computeYearEndForStudentWithSchemeResolver(studentId, className, section, (subjectName) => activeSchemeForClassSubject(className, subjectName));
  }

  /* --- Finalize & Issue: freezes today's computed result as a permanent,
     never-recomputed snapshot per student per academic year. A student
     without a frozen record still shows live/provisional figures that move
     as marks are entered — printing before finalizing is fine, it's just
     watermarked PROVISIONAL. --- */
  function yearEndRecordFor(studentId){
    return yearEndRecords.find(r => r.studentId===studentId && r.academicYear===currentAcademicYearValue);
  }
  function buildYearEndRecord(s, existing){
    const r = computeYearEndForStudent(s.id, s.className, s.section);
    if(!r.subjects.length || r.overallPct===null) return null;
    return {
      id: existing ? existing.id : 'yer_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      studentId: s.id, className: s.className, section: s.section, academicYear: currentAcademicYearValue,
      subjects: r.subjects, overallPct: r.overallPct, overallGrade: r.overallGrade,
      generatedAt: new Date().toISOString(), generatedBy: currentUser ? currentUser.username : '',
    };
  }
  async function finalizeYearEnd(studentId){
    const s = students.find(x => x.id===studentId);
    if(!s) return;
    const existing = yearEndRecordFor(studentId);
    if(existing && !await showConfirmDialog('This student already has a finalized Year-End record for this year. Re-finalizing overwrites it with today\'s figures. Continue?')) return;
    const record = buildYearEndRecord(s, existing);
    if(!record){ showToast('No marks entered yet — nothing to finalize.'); return; }
    if(existing){ const idx = yearEndRecords.findIndex(x => x.id===existing.id); yearEndRecords[idx] = record; } else yearEndRecords.push(record);
    await storageSet(YEAR_END_RECORDS_KEY, yearEndRecords);
    showToast('Year-End result finalized & issued.', 'burst');
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function unfinalizeYearEnd(studentId){
    if(!await showConfirmDialog('Remove the finalized Year-End record so it goes back to a live/provisional calculation? Marks already entered are untouched — only the frozen snapshot is removed.')) return;
    yearEndRecords = yearEndRecords.filter(r => !(r.studentId===studentId && r.academicYear===currentAcademicYearValue));
    await storageSet(YEAR_END_RECORDS_KEY, yearEndRecords);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function finalizeBulkYearEnd(){
    const list = students.filter(s => s.className===yeClass && s.section===yeSection && isActive(s));
    if(!list.length) return;
    if(!await showConfirmDialog(`Finalize & issue Year-End results for all ${list.length} students in ${yeClass} — Section ${yeSection}? This freezes today's figures for each; anyone with no marks yet is skipped.`)) return;
    let count = 0;
    for(const s of list){
      const existing = yearEndRecordFor(s.id);
      const record = buildYearEndRecord(s, existing);
      if(!record) continue;
      if(existing){ const idx = yearEndRecords.findIndex(x => x.id===existing.id); yearEndRecords[idx] = record; } else yearEndRecords.push(record);
      count++;
    }
    await storageSet(YEAR_END_RECORDS_KEY, yearEndRecords);
    showToast(`Finalized & issued for ${count} student(s).`, 'burst');
    renderYearEndTab(document.getElementById('resultBody'));
  }

  /* --- Cards view / Schemes wizard dispatcher --- */
  function renderYearEndTab(body){
    if(yeView === 'schemes') return renderConsolSchemesTab(body);
    return renderYearEndCardsView(body);
  }
  function renderYearEndCardsView(body){
    const classesWithTypes = classesWithActiveScheme();
    const headerBar = `<div style="display:flex; align-items:center; justify-content:flex-end; margin-bottom:10px;"><a onclick="yeView='schemes'; renderYearEndTab(document.getElementById('resultBody'));" style="color:var(--magenta); cursor:pointer; font-weight:600;">⚙ Manage Consolidation Schemes</a></div>`;
    if(classesWithTypes.length === 0){
      body.innerHTML = headerBar + `<div class="empty-state"><b>No Active Consolidation Scheme yet</b>Open "Manage Consolidation Schemes" above and use "Add AP defaults" for a ready-made, fully-editable starting point — or build your own — then Activate it.</div>`;
      return;
    }
    if(!yeClass || !classesWithTypes.includes(yeClass)) yeClass = classesWithTypes[0];
    if(!yeSection) yeSection = SECTIONS[0];
    const roster = yearEndSubjectRoster(yeClass, yeSection);
    const list = students.filter(s => s.className===yeClass && s.section===yeSection && isActive(s));
    const schemesInUse = activeSchemesForClass(yeClass);
    const cfg = yearEndPrintConfig;
    body.innerHTML = headerBar + `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:14px; max-width:680px;">
        The official annual result — computed from whichever Consolidation Scheme is Active for a subject. Anything not part of an Active scheme (like Prefinals) stays out of this entirely.
      </p>
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
        ${schemesInUse.map(sc => `<span class="pill" style="background:rgba(33,26,78,0.06);">${sc.name} — ${sc.buckets.map(b=>`${b.label} ${b.weight}`).join(' + ')} = ${sc.totalMarks}${sc.subjectScope&&sc.subjectScope.length?' ('+sc.subjectScope.join(', ')+')':''}</span>`).join('')}
      </div>
      <div class="form-grid" style="max-width:420px; margin-bottom:16px;">
        <div class="f-field"><label>Class</label><select onchange="yeClass=this.value; renderYearEndTab(document.getElementById('resultBody'));">${classesWithTypes.map(c => `<option ${c===yeClass?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="f-field"><label>Section</label><select onchange="yeSection=this.value; renderYearEndTab(document.getElementById('resultBody'));">${SECTIONS.map(sec => `<option ${sec===yeSection?'selected':''}>${sec}</option>`).join('')}</select></div>
      </div>
      <div class="profile-card" style="margin-bottom:16px; max-width:420px;">
        <h4 style="margin:0 0 10px;">Page Setup</h4>
        <div class="form-grid">
          <div class="f-field"><label>Orientation</label>
            <select id="yeOrientation" onchange="updateYearEndPrintConfig()">
              <option value="portrait" ${cfg.orientation==='portrait'?'selected':''}>Portrait</option>
              <option value="landscape" ${cfg.orientation==='landscape'?'selected':''}>Landscape</option>
            </select>
          </div>
          <div class="f-field"><label>Page Size</label>
            <select id="yePageSize" onchange="updateYearEndPrintConfig()">
              <option value="A4" ${cfg.pageSize==='A4'?'selected':''}>A4</option>
              <option value="Legal" ${cfg.pageSize==='Legal'?'selected':''}>Legal</option>
            </select>
          </div>
          <div class="f-field full"><label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="yeCompact" style="width:auto;" ${cfg.compact?'checked':''} onchange="updateYearEndPrintConfig()"> Compact layout (fits more subjects/buckets on one A4 page)</label></div>
        </div>
      </div>
      ${roster.length===0 ? `<div class="empty-state"><b>No countable subjects found yet for ${yeClass}</b>Configure subjects under Manage Exams for at least one exam first.</div>` : `
      <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:10px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" onclick="finalizeBulkYearEnd()" ${list.length===0?'disabled':''}>✅ Finalize &amp; Issue — Whole Class</button>
        <button class="btn btn-primary btn-sm" onclick="printBulkYearEndCards()" ${list.length===0?'disabled':''}>🖨️ Print Year-End Cards — ${yeClass} Section ${yeSection}</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Admission No</th>${roster.map(n => `<th>${n}</th>`).join('')}<th>Overall %</th><th>Grade</th><th>Status</th><th></th></tr></thead>
        <tbody>
        ${list.length ? list.map(s => {
          const finalized = yearEndRecordFor(s.id);
          const r = finalized ? { subjects: finalized.subjects, overallPct: finalized.overallPct, overallGrade: finalized.overallGrade } : computeYearEndForStudent(s.id, yeClass, yeSection);
          const bySubject = {}; r.subjects.forEach(su => bySubject[su.name]=su);
          return `<tr>
            <td class="name-cell">${s.lastName} ${s.firstName}</td>
            <td>${s.admissionNo}</td>
            ${roster.map(n => { const su=bySubject[n]; return `<td>${su && su.pct!==null ? su.pct+'%' : '—'}${su && !finalized && !su.complete ? ' <span style="color:var(--ink-soft); font-size:0.72rem;">(partial)</span>' : ''}</td>`; }).join('')}
            <td><b>${r.overallPct!==null ? r.overallPct+'%' : '—'}</b></td>
            <td><span class="grade-pill ${isFailGrade(r.overallGrade)?'fail':''}">${r.overallGrade}</span></td>
            <td>${finalized ? `<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Finalized</span>` : `<span class="pill" style="background:rgba(203,154,46,0.18); color:#8a6a1f;">Provisional</span>`}</td>
            <td><button class="btn-edit-text" onclick="printYearEndCard('${s.id}')">Print</button>&nbsp;·&nbsp;${finalized ? `<button class="btn-danger-text" onclick="unfinalizeYearEnd('${s.id}')">Un-finalize</button>` : `<button class="btn-edit-text" onclick="finalizeYearEnd('${s.id}')">Finalize</button>`}</td>
          </tr>`;
        }).join('') : `<tr><td colspan="${roster.length+6}"><div class="empty-state"><b>No students in ${yeClass} — Section ${yeSection}</b></div></td></tr>`}
        </tbody></table>
      </div>
      `}
    `;
  }
  async function updateYearEndPrintConfig(){
    yearEndPrintConfig.orientation = document.getElementById('yeOrientation').value;
    yearEndPrintConfig.pageSize = document.getElementById('yePageSize').value;
    yearEndPrintConfig.compact = document.getElementById('yeCompact').checked;
    await storageSet(YEAR_END_PRINT_CFG_KEY, yearEndPrintConfig);
  }

  /* --- Consolidation Schemes: list + wizard editor --- */
  function newSchemeSkeleton(){
    const ts = Date.now();
    return {
      id: 'scheme_'+ts+'_'+Math.random().toString(36).slice(2,7),
      name: '', academicYear: currentAcademicYearValue || '', status: 'draft',
      classScope: [], subjectScope: [], totalMarks: 100,
      buckets: [
        { id:'b_'+ts+'_a', label:'Internal Assessment', memberTypeIds:[], method:'sum-scaled', weight:20, n:1 },
        { id:'b_'+ts+'_b', label:'Annual Exam', memberTypeIds:[], method:'latest', weight:80, n:1 },
      ],
    };
  }
  function renderConsolSchemesTab(body){
    if(yeEditingSchemeId) return renderSchemeEditorView(body);
    const byYear = {};
    consolSchemes.forEach(sc => { const y = sc.academicYear || '—'; (byYear[y] = byYear[y]||[]).push(sc); });
    const years = Object.keys(byYear).sort().reverse();
    const statusBadge = (st) => {
      const map = { draft:['Draft','rgba(203,154,46,0.18)','#8a6a1f'], active:['Active','rgba(24,143,134,0.15)','#0f6a63'], archived:['Archived','rgba(0,0,0,0.06)','var(--ink-soft)'] };
      const [label,bg,fg] = map[st] || map.draft;
      return `<span class="pill" style="background:${bg}; color:${fg};">${label}</span>`;
    };
    body.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <a onclick="yeView='cards'; renderYearEndTab(document.getElementById('resultBody'));" style="color:var(--magenta); cursor:pointer; font-weight:600;">← Back to Year-End Cards</a>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="quickSetupConsolSchemes()">⚡ Add AP ${currentAcademicYearValue||''} defaults</button>
          <button class="btn btn-primary btn-sm" onclick="openSchemeEditor()">+ New Scheme</button>
        </div>
      </div>
      <p style="font-size:0.82rem; color:var(--ink-soft); margin:0 0 16px; max-width:700px;">A Scheme is the full formula for one class/subject group's Year-End result — which exams feed it, how they combine, and their weight. Build or edit freely as a Draft (with a live preview against real entered marks), then Activate when ready. Only one Active scheme may cover a given class+subject at a time — activating one automatically retires any overlapping Active scheme, and next year you can Duplicate instead of starting over.</p>
      ${years.length===0 ? `<div class="empty-state"><b>No consolidation schemes yet</b>Use "Add AP defaults" for a ready-made starting point (fully editable), or "+ New Scheme" to build your own from scratch.</div>` : years.map(y => `
        <div class="profile-card" style="margin-bottom:16px;">
          <h4 style="margin:0 0 10px;">Academic Year ${y}</h4>
          ${byYear[y].map(sc => `
            <div class="list-manage-row">
              <div>
                <div class="lm-name">${sc.name || '(untitled scheme)'} ${statusBadge(sc.status)}</div>
                <div class="lm-meta">${sc.buckets.map(b=>`${b.label} ${b.weight}`).join(' + ')} = ${sc.totalMarks} &nbsp;·&nbsp; ${sc.classScope && sc.classScope.length ? sc.classScope.join(', ') : 'All classes'}${sc.subjectScope && sc.subjectScope.length ? ' · ' + sc.subjectScope.join(', ') : ''}</div>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn-edit-text" onclick="openSchemeEditor('${sc.id}')">Edit</button>
                ${sc.status!=='active' ? `<button class="btn-edit-text" onclick="activateScheme('${sc.id}')">Activate</button>` : `<button class="btn-danger-text" onclick="archiveScheme('${sc.id}')">Retire</button>`}
                <button class="btn-edit-text" onclick="duplicateSchemeForNewYear('${sc.id}')">Duplicate for new year</button>
                <button class="btn-danger-text" onclick="deleteScheme('${sc.id}')">Delete</button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    `;
  }
  function renderSchemeEditorView(body){
    const d = yeDraft;
    const methodOptions = (selected) => `
      <option value="sum-scaled" ${selected==='sum-scaled'?'selected':''}>Sum &amp; Scale (marks-weighted)</option>
      <option value="avg-pct" ${selected==='avg-pct'?'selected':''}>Average of % (equal weight per exam)</option>
      <option value="latest" ${selected==='latest'?'selected':''}>Latest / only exam</option>
      <option value="best-n" ${selected==='best-n'?'selected':''}>Best N of these exams</option>
      <option value="drop-lowest-n" ${selected==='drop-lowest-n'?'selected':''}>Drop lowest N, average the rest</option>
    `;
    const totalWeight = d.buckets.reduce((a,b) => a+Number(b.weight||0), 0);
    const isExisting = consolSchemes.some(x => x.id===d.id);
    body.innerHTML = `
      <a onclick="closeSchemeEditor()" style="color:var(--magenta); cursor:pointer; font-weight:600;">← Back to Schemes</a>
      <h4 style="margin:14px 0 4px;">${isExisting ? 'Edit' : 'New'} Consolidation Scheme</h4>
      <p style="font-size:0.82rem; color:var(--ink-soft); margin:0 0 16px; max-width:680px;">Pre-filled with sensible defaults below — change anything: the name, which classes/subjects it applies to, how many buckets, which exams feed each one, how they combine, and their weight.</p>
      <div class="profile-card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="f-field"><label>Scheme Name</label><input type="text" id="scName" value="${d.name||''}" placeholder="e.g. AP Pattern 2026-27 — Standard"></div>
          <div class="f-field"><label>Academic Year</label><input type="text" id="scYear" value="${d.academicYear||''}" placeholder="e.g. 2026-27"></div>
          <div class="f-field"><label>Total Marks <span style="font-weight:400; color:var(--ink-soft);">(usually 100)</span></label><input type="number" id="scTotal" value="${d.totalMarks||100}" min="1" oninput="updateSchemeWeightTotalDisplay()"></div>
        </div>
        <div class="f-field full" style="margin-top:10px;">
          <label>Applies To — Classes <span style="font-weight:400; color:var(--ink-soft);">(leave all unchecked for every class)</span></label>
          <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:140px; overflow-y:auto; margin-top:6px;">
            ${CLASS_LEVELS.map(c => `<label class="admission-toggle"><input type="checkbox" class="sc-class-check" value="${c}" ${d.classScope && d.classScope.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}
          </div>
        </div>
        <div class="f-field full" style="margin-top:10px;">
          <label>Applies To — Subjects <span style="font-weight:400; color:var(--ink-soft);">(leave blank for every subject)</span></label>
          <input type="text" id="scSubjects" value="${(d.subjectScope||[]).join(', ')}" placeholder="Leave blank for all subjects, or list specific ones e.g. Physical Science, Biological Science">
          <p style="font-size:0.76rem; color:var(--ink-soft); margin-top:4px;">A subject-specific scheme always takes priority over an all-subjects one for the subjects it names — both can be Active for the same classes at once.</p>
        </div>
      </div>
      <div class="profile-card" style="margin-bottom:16px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
          <h4 style="margin:0;">Buckets</h4>
          <div>Weight total: <b id="scWeightTotal" style="color:${totalWeight===Number(d.totalMarks||100)?'#0f6a63':'#b45309'};">${totalWeight} / ${d.totalMarks||100}</b></div>
        </div>
        ${d.buckets.map((b,i) => `
          <div class="scb-row" data-idx="${i}" style="border:1px solid var(--border-color,#e5e7eb); border-radius:10px; padding:14px; margin-bottom:12px;">
            <div class="form-grid">
              <div class="f-field full"><label>Bucket Label</label><input type="text" class="scb-label" value="${b.label||''}" placeholder="e.g. Internal Assessment"></div>
              <div class="f-field"><label>Combine By</label><select class="scb-method" onchange="this.closest('.scb-row').querySelector('.scb-n-wrap').style.display = (this.value==='best-n'||this.value==='drop-lowest-n') ? '' : 'none';">${methodOptions(b.method)}</select></div>
              <div class="f-field"><label>Weight</label><input type="number" class="scb-weight" value="${b.weight||0}" min="0" oninput="updateSchemeWeightTotalDisplay()"></div>
              <div class="f-field scb-n-wrap" style="display:${(b.method==='best-n'||b.method==='drop-lowest-n')?'':'none'};"><label>N</label><input type="number" class="scb-n" value="${b.n||1}" min="1"></div>
            </div>
            <div class="f-field full" style="margin-top:6px;">
              <label>Member Exam Types <span style="font-weight:400; color:var(--ink-soft);">(which exams feed this bucket)</span></label>
              <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:6px;">
                ${examTypes.length ? examTypes.map(t => `<label class="admission-toggle"><input type="checkbox" class="scb-member" value="${t.id}" ${b.memberTypeIds && b.memberTypeIds.includes(t.id) ? 'checked' : ''}> ${t.name}</label>`).join('') : `<span style="color:var(--ink-soft); font-size:0.82rem;">No exam types yet — add some under the Exams tab first.</span>`}
              </div>
            </div>
            <div style="text-align:right; margin-top:8px;"><button type="button" class="btn-danger-text" onclick="removeSchemeBucket(${i})">Remove bucket</button></div>
          </div>
        `).join('')}
        <button type="button" class="btn btn-ghost btn-sm" onclick="addSchemeBucket()">+ Add Bucket</button>
      </div>
      <div class="profile-card" style="margin-bottom:16px;">
        <h4 style="margin:0 0 10px;">Preview against real marks</h4>
        <div class="form-grid" style="max-width:420px;">
          <div class="f-field"><label>Class</label><select id="scPreviewClass">${(d.classScope && d.classScope.length ? d.classScope : CLASS_LEVELS).map(c => `<option>${c}</option>`).join('')}</select></div>
          <div class="f-field"><label>Section</label><select id="scPreviewSection">${SECTIONS.map(sec => `<option>${sec}</option>`).join('')}</select></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="previewSchemeDraft()" style="margin-top:6px;">🔍 Preview with real entered marks</button>
        <div id="scPreviewBox" style="margin-top:12px;"></div>
      </div>
      <div class="modal-actions" style="justify-content:flex-start; gap:10px;">
        <button type="button" class="btn btn-ghost" onclick="saveSchemeDraftFromEditor(false)">Save as Draft</button>
        <button type="button" class="btn btn-primary" onclick="saveSchemeDraftFromEditor(true)">Save &amp; Activate</button>
      </div>
    `;
  }
  function updateSchemeWeightTotalDisplay(){
    const total = Array.from(document.querySelectorAll('.scb-weight')).reduce((a,i) => a+(Number(i.value)||0), 0);
    const totalMarksEl = document.getElementById('scTotal');
    const totalMarks = totalMarksEl ? (Number(totalMarksEl.value)||100) : 100;
    const el = document.getElementById('scWeightTotal');
    if(el){ el.textContent = `${total} / ${totalMarks}`; el.style.color = total===totalMarks ? '#0f6a63' : '#b45309'; }
  }
  // Reads every live form field back into yeDraft. Called before any
  // structural change (add/remove bucket) or save/activate/preview action —
  // simple fields (name, weights, member checkboxes) are read on demand
  // rather than kept in sync on every keystroke, so typing never triggers a
  // re-render and never loses cursor position.
  function readSchemeDraftFromForm(){
    if(!yeDraft) return;
    const nameEl = document.getElementById('scName');
    if(nameEl) yeDraft.name = nameEl.value.trim();
    const yearEl = document.getElementById('scYear');
    if(yearEl) yeDraft.academicYear = yearEl.value.trim();
    const totalEl = document.getElementById('scTotal');
    if(totalEl) yeDraft.totalMarks = Number(totalEl.value) || 100;
    const classChecks = document.querySelectorAll('.sc-class-check');
    if(classChecks.length) yeDraft.classScope = Array.from(classChecks).filter(c => c.checked).map(c => c.value);
    const subjEl = document.getElementById('scSubjects');
    if(subjEl) yeDraft.subjectScope = subjEl.value.split(',').map(x => x.trim()).filter(Boolean);
    document.querySelectorAll('.scb-row').forEach(row => {
      const idx = Number(row.getAttribute('data-idx'));
      const b = yeDraft.buckets[idx];
      if(!b) return;
      b.label = row.querySelector('.scb-label').value.trim();
      b.method = row.querySelector('.scb-method').value;
      b.weight = Number(row.querySelector('.scb-weight').value) || 0;
      const nInput = row.querySelector('.scb-n');
      if(nInput) b.n = Number(nInput.value) || 1;
      b.memberTypeIds = Array.from(row.querySelectorAll('.scb-member:checked')).map(c => c.value);
    });
  }
  function addSchemeBucket(){
    readSchemeDraftFromForm();
    yeDraft.buckets.push({ id:'b_'+Date.now()+'_'+Math.random().toString(36).slice(2,5), label:'New Bucket', memberTypeIds:[], method:'sum-scaled', weight:0, n:1 });
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function removeSchemeBucket(idx){
    readSchemeDraftFromForm();
    yeDraft.buckets.splice(idx, 1);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function previewSchemeDraft(){
    readSchemeDraftFromForm();
    const previewClassEl = document.getElementById('scPreviewClass');
    const previewSectionEl = document.getElementById('scPreviewSection');
    const previewClass = previewClassEl ? previewClassEl.value : (yeDraft.classScope[0] || CLASS_LEVELS[0]);
    const previewSection = previewSectionEl ? previewSectionEl.value : SECTIONS[0];
    const list = students.filter(s => s.className===previewClass && s.section===previewSection && isActive(s)).slice(0, 15);
    const box = document.getElementById('scPreviewBox');
    if(!box) return;
    if(!list.length){ box.innerHTML = `<div class="empty-state"><b>No students in ${previewClass} — Section ${previewSection}</b></div>`; return; }
    const rows = list.map(s => {
      const r = computeYearEndForStudentWithSchemeResolver(s.id, previewClass, previewSection, () => yeDraft);
      return `<tr><td>${s.lastName} ${s.firstName}</td><td>${r.overallPct!==null ? r.overallPct+'%' : '—'}</td><td>${r.overallGrade}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Overall %</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></div><p style="font-size:0.74rem; color:var(--ink-soft); margin-top:6px;">Preview only — nothing is saved yet.</p>`;
  }
  async function saveSchemeDraftFromEditor(activate){
    readSchemeDraftFromForm();
    if(!yeDraft.name){ showToast('Give the scheme a name.'); return; }
    if(!yeDraft.buckets.length){ showToast('Add at least one bucket.'); return; }
    const totalWeight = yeDraft.buckets.reduce((a,b) => a+Number(b.weight||0), 0);
    if(Math.round(totalWeight) !== Math.round(Number(yeDraft.totalMarks)||100) && !await showConfirmDialog(`Bucket weights add up to ${totalWeight}, not the scheme's total (${yeDraft.totalMarks}). Save anyway?`)) return;
    const toSave = JSON.parse(JSON.stringify(yeDraft));
    const idx = consolSchemes.findIndex(s => s.id===toSave.id);
    if(idx>=0) consolSchemes[idx] = toSave; else consolSchemes.push(toSave);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    if(activate){ await activateScheme(toSave.id); return; }
    showToast('Scheme saved as draft.', 'burst');
    yeEditingSchemeId = null; yeDraft = null;
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function openSchemeEditor(id){
    yeDraft = id ? JSON.parse(JSON.stringify(consolSchemes.find(x => x.id===id))) : newSchemeSkeleton();
    yeEditingSchemeId = yeDraft.id;
    yeView = 'schemes';
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function closeSchemeEditor(){
    yeEditingSchemeId = null; yeDraft = null;
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function activateScheme(id){
    const scheme = (yeDraft && yeDraft.id===id) ? yeDraft : consolSchemes.find(s => s.id===id);
    if(!scheme) return;
    const overlapping = consolSchemes.filter(s => s.id!==id && s.status==='active' && schemesOverlap(s, scheme));
    if(overlapping.length){
      const names = overlapping.map(s => s.name).join(', ');
      if(!await showConfirmDialog(`Activating "${scheme.name}" will retire the currently Active scheme(s) that overlap its scope: ${names}. Continue?`)) return;
      overlapping.forEach(s => s.status = 'archived');
    }
    scheme.status = 'active';
    const idx = consolSchemes.findIndex(s => s.id===id);
    if(idx>=0) consolSchemes[idx] = scheme; else consolSchemes.push(scheme);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    showToast('Scheme activated.', 'burst');
    yeEditingSchemeId = null; yeDraft = null;
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function archiveScheme(id){
    const s = consolSchemes.find(x => x.id===id);
    if(!s) return;
    if(!await showConfirmDialog(`Retire "${s.name}"? Classes/subjects it covered will show no Active scheme until another one is activated.`)) return;
    s.status = 'archived';
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  function duplicateSchemeForNewYear(id){
    const scheme = consolSchemes.find(s => s.id===id);
    if(!scheme) return;
    const copy = JSON.parse(JSON.stringify(scheme));
    copy.id = 'scheme_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    copy.name = scheme.name + ' (copy)';
    copy.status = 'draft';
    yeDraft = copy;
    yeEditingSchemeId = copy.id;
    yeView = 'schemes';
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function deleteScheme(id){
    const s = consolSchemes.find(x => x.id===id);
    if(!s) return;
    const inUse = yearEndRecords.some(r => r.subjects.some(su => su.schemeId===id));
    if(!await showConfirmDialog(inUse ? `This scheme was used for one or more finalized Year-End records — those keep their own frozen snapshot and won't change. Delete the scheme itself anyway?` : `Delete "${s.name}"?`)) return;
    consolSchemes = consolSchemes.filter(x => x.id!==id);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    renderYearEndTab(document.getElementById('resultBody'));
  }
  async function quickSetupConsolSchemes(){
    if(consolSchemes.length && !await showConfirmDialog(`Add the default AP ${currentAcademicYearValue||''} schemes (Standard + Science) as new Drafts alongside what you already have?`)) return;
    const byName = n => { const t = examTypes.find(x => x.name===n); return t ? t.id : null; };
    const faId = byName('Formative Assessment'), sa1Id = byName('Summative Assessment 1'), sa2Id = byName('Summative Assessment 2 (Annual)');
    const memberIds = [faId, sa1Id].filter(Boolean);
    const annualIds = [sa2Id].filter(Boolean);
    const tenth = CLASS_LEVELS[CLASS_LEVELS.length-1];
    const nonTenth = CLASS_LEVELS.filter(c => c!==tenth);
    const yr = currentAcademicYearValue || '';
    const standard = { id:'scheme_'+Date.now()+'_std', name:`AP Pattern ${yr} — Standard`.trim(), academicYear:yr, status:'draft', classScope: nonTenth, subjectScope: [], totalMarks:100, buckets:[
      { id:'b_std_int', label:'Internal Assessment', memberTypeIds: memberIds.slice(), method:'sum-scaled', weight:20, n:1 },
      { id:'b_std_ann', label:'Annual Exam', memberTypeIds: annualIds.slice(), method:'latest', weight:80, n:1 },
    ]};
    const scienceClasses = ['8th Class','9th Class'].filter(c => CLASS_LEVELS.includes(c));
    const science = { id:'scheme_'+Date.now()+'_sci', name:`AP Pattern ${yr} — Science (8th-9th)`.trim(), academicYear:yr, status:'draft', classScope: scienceClasses, subjectScope:['Physical Science','Biological Science'], totalMarks:50, buckets:[
      { id:'b_sci_int', label:'Internal Assessment', memberTypeIds: memberIds.slice(), method:'sum-scaled', weight:10, n:1 },
      { id:'b_sci_ann', label:'Annual Exam', memberTypeIds: annualIds.slice(), method:'latest', weight:40, n:1 },
    ]};
    consolSchemes.push(standard, science);
    await storageSet(CONSOL_SCHEMES_KEY, consolSchemes);
    const missing = [!faId && 'Formative Assessment', !sa1Id && 'Summative Assessment 1', !sa2Id && 'Summative Assessment 2 (Annual)'].filter(Boolean);
    showToast(missing.length ? `Default schemes added as drafts — but ${missing.join(', ')} exam type(s) don't exist yet, so edit each bucket to pick the right types once they're created.` : 'Default schemes added as drafts — edit and Activate when ready.', 'burst');
    renderYearEndTab(document.getElementById('resultBody'));
  }

  function yearEndCardPageHtml(s){
    const finalized = yearEndRecordFor(s.id);
    const r = finalized ? { subjects: finalized.subjects, overallPct: finalized.overallPct, overallGrade: finalized.overallGrade } : computeYearEndForStudent(s.id, s.className, s.section);
    const labelOrder = [];
    r.subjects.forEach(su => (su.breakdown||[]).forEach(b => { if(!labelOrder.includes(b.label)) labelOrder.push(b.label); }));
    const schemesUsed = {};
    r.subjects.forEach(su => { if(su.schemeName){ (schemesUsed[su.schemeName] = schemesUsed[su.schemeName]||[]).push(su.name); } });
    const schemeNamesUsed = Object.keys(schemesUsed);
    const multiScheme = schemeNamesUsed.length > 1;
    const majorityScheme = multiScheme ? schemeNamesUsed.reduce((a,b) => schemesUsed[a].length >= schemesUsed[b].length ? a : b) : null;
    const t = reportTemplates.find(x => x.isDefault) || reportTemplates[0] || { signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent' };
    const logoSrc = schoolLogoSrc ? schoolLogoSrc() : document.querySelector('.sb-brand img').src;
    const attendance = computeAttendanceStats(s.id);
    return `
      <div class="yec-card">
        <div class="yec-head"><img src="${logoSrc}"></div>
        <div class="yec-school">${schoolInfo.name||''}</div>
        <div class="yec-addr">${schoolInfo.address||''}</div>
        ${brandLineHtml({ size:'10px' })}${brandFixedWmHtml()}
        <div class="${finalized ? 'yec-final' : 'yec-provisional'}">${finalized ? `FINAL — ISSUED ${finalized.generatedAt ? new Date(finalized.generatedAt).toLocaleDateString() : ''}` : 'PROVISIONAL — SUBJECT TO CHANGE UNTIL FINALIZED'}</div>
        <div class="yec-title">YEAR-END MARKS CARD — ${currentAcademicYearValue || ''}</div>
        <div class="yec-info">
          <div>Student Name: <b>${s.lastName} ${s.firstName}</b></div>
          <div>Admission No: <b>${s.admissionNo}</b></div>
          <div>Class &amp; Section: <b>${s.className} — ${s.section}</b></div>
          <div>Father Name: <b>${s.fatherName||'—'}</b></div>
          ${attendance ? `<div>Attendance: <b>${attendance.present}/${attendance.total} (${attendance.pct}%)</b></div>` : ''}
        </div>
        <table>
          <thead><tr><th>Subject</th>${labelOrder.map(l => `<th>${l}</th>`).join('')}<th>Total</th><th>Grade</th></tr></thead>
          <tbody>
          ${r.subjects.map(su => {
            const byLabel = {}; (su.breakdown||[]).forEach(b => byLabel[b.label]=b);
            const marker = multiScheme && su.schemeName && su.schemeName !== majorityScheme ? ' †' : '';
            return `<tr>
              <td>${su.name}${marker}</td>
              ${labelOrder.map(l => { const b=byLabel[l]; return `<td>${b ? Math.round(b.pct*10)/10+'%' : '—'}</td>`; }).join('')}
              <td><b>${su.pct!==null ? su.pct+'%' : '—'}</b></td>
              <td><b>${su.grade}</b></td>
            </tr>`;
          }).join('')}
          <tr><td><b>Overall</b></td><td colspan="${labelOrder.length}"></td><td><b>${r.overallPct!==null ? r.overallPct+'%' : '—'}</b></td><td><b>${r.overallGrade}</b></td></tr>
          </tbody>
        </table>
        ${multiScheme ? `<div class="yec-footnote">† ${schemeNamesUsed.filter(n => n!==majorityScheme).map(n => `${schemesUsed[n].join(', ')} use a different weighting (${n}).`).join(' ')}</div>` : ''}
        <div class="yec-sign">
          <div>${resolveReportSignature1(t,s) ? `<img src="${resolveReportSignature1(t,s)}">` : ''}${t.signatureLabel1 || 'Class Teacher'}</div>
          <div>${resolveReportSignature2(t) ? `<img src="${resolveReportSignature2(t)}" style="margin-left:auto;">` : ''}${t.signatureLabel2 || 'Principal / Correspondent'}</div>
        </div>
      </div>
    `;
  }
  function yearEndPrintCss(){
    const cfg = yearEndPrintConfig || { orientation:'portrait', pageSize:'A4', compact:false };
    const [wmm, hmm] = PAGE_SIZES_MM[cfg.pageSize] || PAGE_SIZES_MM.A4;
    const pageSizeCss = cfg.orientation === 'landscape' ? `${hmm}mm ${wmm}mm` : `${wmm}mm ${hmm}mm`;
    const fs = cfg.compact ? '10px' : '11px';
    const tfs = cfg.compact ? '9.5px' : '11px';
    return `
      @page{ size:${pageSizeCss}; margin:${cfg.compact ? '10mm' : '14mm'}; }
      body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; font-size:${fs}; }
      .yec-card{ page-break-after:always; padding-bottom:10mm; }
      .yec-card:last-child{ page-break-after:auto; }
      .yec-head{ display:flex; align-items:center; gap:12px; justify-content:center; margin-bottom:6px; }
      .yec-head img{ width:${cfg.compact?'36px':'44px'}; height:${cfg.compact?'36px':'44px'}; border-radius:50%; }
      .yec-school{ font-weight:700; font-size:${cfg.compact?'16px':'18px'}; text-align:center; }
      .yec-addr{ font-size:${cfg.compact?'10px':'11px'}; text-align:center; color:#555; margin-bottom:6px; }
      .yec-provisional{ text-align:center; font-size:9.5px; color:#b45309; font-weight:700; letter-spacing:0.04em; margin-bottom:${cfg.compact?'6px':'10px'}; }
      .yec-final{ text-align:center; font-size:9.5px; color:#0f6a63; font-weight:700; letter-spacing:0.04em; margin-bottom:${cfg.compact?'6px':'10px'}; }
      .yec-title{ text-align:center; font-weight:700; font-size:13px; border-top:1px solid #333; border-bottom:1px solid #333; padding:5px 0; margin-bottom:${cfg.compact?'10px':'14px'}; }
      .yec-info{ display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-bottom:${cfg.compact?'10px':'16px'}; }
      .yec-card table{ width:100%; border-collapse:collapse; font-size:${tfs}; margin-bottom:8px; table-layout:fixed; }
      .yec-card th, .yec-card td{ border:1px solid #999; padding:${cfg.compact?'3px 5px':'5px 6px'}; text-align:left; word-wrap:break-word; }
      .yec-card th{ background:#211A4E; color:#fff; }
      .yec-footnote{ font-size:9px; color:#555; margin-bottom:${cfg.compact?'10px':'16px'}; }
      .yec-sign{ display:flex; justify-content:space-between; font-size:12px; margin-top:${cfg.compact?'30px':'50px'}; }
      .yec-sign img{ height:34px; display:block; margin-bottom:3px; }
    `;
  }
  function printYearEndCard(studentId){
    const s = students.find(x => x.id===studentId);
    if(!s) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Year-End Marks Card - ${s.lastName} ${s.firstName}</title><style>${yearEndPrintCss()}</style></head><body onload="window.print()">${yearEndCardPageHtml(s)}</body></html>`);
    w.document.close();
  }
  async function printBulkYearEndCards(){
    const list = students.filter(s => s.className===yeClass && s.section===yeSection && isActive(s));
    if(list.length === 0) return;
    if(list.length > 60 && !await showConfirmDialog(`Print ${list.length} Year-End Marks Cards at once? This can take a moment to render.`)) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Year-End Marks Cards - ${yeClass} Section ${yeSection}</title><style>${yearEndPrintCss()}</style></head><body onload="window.print()">${list.map(s => yearEndCardPageHtml(s)).join('')}</body></html>`);
    w.document.close();
  }

  /* ===== REPORTS MODULE ===== */
  