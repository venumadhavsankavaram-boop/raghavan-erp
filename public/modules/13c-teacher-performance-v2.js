/* ============================================================================
   Teacher Performance v2 — loads its own data, explains empty results,
   adds the measures other school ERPs show.
   ----------------------------------------------------------------------------
   Loads after 13-reports-teacher-performance.js.

   What was wrong: the Staff -> Reports page drew the Teacher Performance
   dashboard before the exam marks had been fetched (marks load lazily), so it
   always said "No marks recorded yet" unless someone had opened an exam page
   first. The same applied to the Excel/PDF exports and the Staff Meeting Pack.

   What this adds:
   * Every piece of data (marks and staff attendance) is loaded first.
   * If a result is still empty it says exactly why and what to do.
   * A "data coverage" line shows how many marks the ranking rests on.
   * Distinct students (not repeat results), Distinction % (75% and above) and
     Below-pass results sit next to the average, as in Fedena, Entab and
     MasterSoft style teacher reports.
   * Teachers judged on fewer than 20 results are tagged "Low data".
   * Opening a teacher also shows their class / subject breakdown table.
   Ranking weights and flags are unchanged.
   ========================================================================== */
(function(){
  const DIST_PCT = 75;
  const LOW_DATA = 20;
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v));
  const o = {
    render: window.renderStaffReportsTab,
    gen: window.generateTeacherPerfReport,
    pack: window.printStaffMeetingPack,
    rows: window.teacherPerformanceDashboardRows,
    summary: window.teacherPerformanceSummaryReport,
    detail: window.renderTeacherPerfDetail,
  };

  // ---------- data ----------
  function loaders(){
    const L = [];
    if(typeof loadExamResultsData === 'function') L.push(['examResults', loadExamResultsData]);
    if(typeof loadStaffAttendance === 'function') L.push(['staffAttendanceRecords', loadStaffAttendance]);
    return L;
  }
  const isReady = () => loaders().every(([k]) => !!_lazyDataPromises[k]);
  async function ensureData(){
    await Promise.all(loaders().map(([k, f]) => ensureDataLoaded(k, f).catch(() => null)));
  }

  // ---------- per-teacher student-level figures ----------
  function studentStats(examId, filters){
    const idx = new Map();
    examResults.forEach(r => { idx.set(r.examId + '|' + r.studentId + '|' + r.subject, r); });
    const exams = examId ? examDefs.filter(e => e.id === examId) : examDefs;
    const by = new Map();
    const get = t => { let v = by.get(t); if(!v){ v = { ids: new Set(), results: 0, dist: 0, below: 0 }; by.set(t, v); } return v; };
    exams.forEach(exam => {
      subjectsList.forEach(subj => {
        if(filters.className && subj.className !== filters.className) return;
        (subj.sections || []).forEach(section => {
          if(filters.section && section !== filters.section) return;
          const tids = subjectStaffForSection(subj, section);
          if(!tids || !tids.length) return;
          const cfg = getExamSubjects(exam, subj.className, section).find(s => s.name === subj.name);
          if(!cfg || cfg.countable === false) return;
          students.forEach(s => {
            if(s.className !== subj.className || s.section !== section || !isActive(s)) return;
            const r = idx.get(exam.id + '|' + s.id + '|' + subj.name);
            if(!r || r.absent || r.marks === null || r.marks === undefined || r.marks === '') return;
            const pct = (Number(r.marks) / (cfg.maxMarks || 100)) * 100;
            const fail = isFailGrade(gradeForPct(pct));
            tids.forEach(t => {
              const v = get(t); v.ids.add(s.id); v.results++;
              if(pct >= DIST_PCT) v.dist++;
              if(fail) v.below++;
            });
          });
        });
      });
    });
    return by;
  }

  window.teacherPerformanceDashboardRows = function(examId, filters){
    const rows = o.rows(examId, filters);
    const st = studentStats(examId, filters);
    rows.forEach(r => {
      const v = st.get(r.teacherId) || { ids: new Set(), results: 0, dist: 0, below: 0 };
      r.studentCount = v.ids.size; r.resultCount = v.results;
      r.distinctionPct = v.results ? Math.round(v.dist * 1000 / v.results) / 10 : 0;
      r.belowPass = v.below;
      r.lowData = v.results < LOW_DATA;
    });
    return rows;
  };

  window.teacherPerformanceSummaryReport = function(examId, filters){
    const base = o.summary(examId, filters);
    const rows = window.teacherPerformanceDashboardRows(examId, filters);
    return base.map((b, i) => {
      const r = rows[i] || {};
      const out = {};
      Object.keys(b).forEach(k => {
        out[k] = b[k];
        if(k === 'Students Evaluated') out['Distinct Students'] = r.studentCount != null ? r.studentCount : '';
        if(k === 'Pass Rate %'){ out['Distinction % (≥' + DIST_PCT + '%)'] = r.distinctionPct != null ? r.distinctionPct : ''; out['Results Below Pass'] = r.belowPass != null ? r.belowPass : ''; }
      });
      out['Students Evaluated'] = r.resultCount != null ? r.resultCount : b['Students Evaluated'];
      out['Data Note'] = r.lowData ? 'Low data (fewer than ' + LOW_DATA + ' results)' : '';
      return out;
    });
  };

  // ---------- diagnostics ----------
  function diagnose(examId, filters){
    const exams = examId ? examDefs.filter(e => e.id === examId) : examDefs;
    let secs = 0, withTeacher = 0, noTeacher = [];
    subjectsList.forEach(subj => {
      if(filters.className && subj.className !== filters.className) return;
      (subj.sections || []).forEach(section => {
        if(filters.section && section !== filters.section) return;
        secs++;
        if((subjectStaffForSection(subj, section) || []).length) withTeacher++;
        else noTeacher.push(subj.name + ' (' + subj.className + '-' + section + ')');
      });
    });
    const ids = new Set(exams.map(e => e.id));
    const marks = examResults.filter(r => ids.has(r.examId) && !r.absent && r.marks !== null && r.marks !== undefined && r.marks !== '').length;
    const perExam = exams.map(e => ({ name: e.name, n: examResults.filter(r => r.examId === e.id && !r.absent && r.marks !== null && r.marks !== undefined && r.marks !== '').length }));
    return { secs, withTeacher, noTeacher, marks, perExam, exams: exams.length };
  }
  function whyEmpty(d){
    const msgs = [];
    if(!d.exams) msgs.push('No exams are set up yet — create them under Manage Exams.');
    else if(!d.marks) msgs.push('No marks have been entered for ' + (d.exams === 1 ? 'this exam' : 'any exam') + ' yet. Enter marks under Manage Exams → Marks Entry.');
    if(d.secs && !d.withTeacher) msgs.push('No teacher is assigned to any subject in this scope. Open Manage Subjects and assign a teacher to each class section.');
    else if(d.noTeacher.length) msgs.push(d.noTeacher.length + ' subject-section(s) have no teacher assigned, so their marks cannot be credited to anyone: ' + d.noTeacher.slice(0, 5).join(', ') + (d.noTeacher.length > 5 ? '…' : '') + '.');
    if(d.marks && d.withTeacher) msgs.push('Marks exist, but none match a teacher-assigned subject that is part of the exam. Check that each subject is included in the exam under Manage Exams.');
    return msgs;
  }

  // ---------- dashboard ----------
  window.renderTeacherPerfDashboard = function(filters){
    const examId = tpDashExamId;
    const dash = window.teacherPerformanceDashboardRows(examId, filters);
    const d = diagnose(examId, filters);
    const w = TEACHER_PERF_WEIGHTS;
    const examOptions = `<option value="">All Exams (Cumulative)</option>` + examDefs.map(ex => `<option value="${ex.id}" ${examId === ex.id ? 'selected' : ''}>${esc(ex.name)}</option>`).join('');
    const header = `
      <div class="profile-card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <h4 style="margin:0;">📊 Teacher Performance Dashboard</h4>
          <select id="tpDashExamSelect" onchange="onTeacherPerfDashExamChange()" style="font-size:0.8rem; padding:6px 10px; border-radius:8px; border:1.5px solid var(--border);">${examOptions}</select>
        </div>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:8px 0 6px;">Ranked by <b>Overall Score</b> — student results (${Math.round(w.academic * 100)}%), pass rate (${Math.round(w.passRate * 100)}%), the teacher's own attendance (${Math.round(w.attendance * 100)}%), syllabus completion (${Math.round(w.syllabus * 100)}%) and result consistency (${Math.round(w.consistency * 100)}%). A part with no data yet is left out and the rest are rescaled. "vs subject avg" compares a teacher only with others teaching the same subject. Click a row for the full breakdown.</p>
        <div style="display:flex; gap:14px; flex-wrap:wrap; font-size:0.72rem; color:var(--ink-soft);">
          <span>🌟 <b>Top Performer</b> — score ≥ 85 with strong personal attendance</span>
          <span>⚠ <b>Needs Attention</b> — score &lt; 60, a sharp dip, low attendance, or syllabus well behind</span>
          <span>🏅 <b>Distinction</b> — results of ${DIST_PCT}% and above</span>
        </div>
      </div>`;
    if(!dash.length){
      const why = whyEmpty(d);
      return header + `<div class="empty-state" style="margin-bottom:24px;"><b>No teacher results to show for this scope</b>${why.length ? '<ul style="text-align:left;max-width:640px;margin:10px auto 0;font-size:0.82rem;">' + why.map(m => `<li style="margin-bottom:6px;">${esc(m)}</li>`).join('') + '</ul>' : 'Enter marks under Manage Exams, then come back here.'}</div>`;
    }
    const coverage = `<div style="margin:0 0 12px;padding:9px 12px;border-radius:10px;background:var(--cream);font-size:0.76rem;color:var(--ink-soft);">
        <b>Based on ${d.marks.toLocaleString('en-IN')} marks</b> across ${d.perExam.filter(e => e.n).length} of ${d.exams} exam(s) · ${d.withTeacher} of ${d.secs} subject-sections have a teacher.
        ${d.noTeacher.length ? `<span style="color:#8a5300;"> ${d.noTeacher.length} have none assigned and are not counted (e.g. ${esc(d.noTeacher.slice(0, 3).join(', '))}).</span>` : ''}
        ${!examId && d.perExam.some(e => !e.n) ? `<span style="color:#8a5300;"> No marks yet for: ${esc(d.perExam.filter(e => !e.n).map(e => e.name).join(', '))}.</span>` : ''}
      </div>`;
    const flagBadge = flag => flag === 'top' ? `<span class="pill" style="background:rgba(24,143,134,0.14); color:var(--teal); font-weight:700;">🌟 Top</span>`
      : flag === 'attention' ? `<span class="pill" style="background:rgba(209,16,115,0.12); color:var(--magenta); font-weight:700;">⚠ Attention</span>`
      : `<span class="pill" style="background:rgba(0,0,0,0.06); color:var(--ink-soft);">Steady</span>`;
    const body = dash.map((t, i) => {
      const deltaColor = t.delta > 0 ? 'var(--teal)' : (t.delta < 0 ? 'var(--magenta)' : 'var(--ink-soft)');
      const expanded = tpDashExpandedId === t.teacherId;
      const detailRow = expanded ? `<tr><td colspan="11" style="padding:0; background:var(--cream); border-bottom:2px solid var(--border);">${renderTeacherPerfDetail(t, examId, filters)}</td></tr>` : '';
      return `
        <tr style="cursor:pointer;" onclick="toggleTeacherPerfDetail('${t.teacherId}')">
          <td style="font-family:'Baloo 2',cursive; font-weight:700; color:var(--gold);">#${i + 1}</td>
          <td class="name-cell">${esc(t.name)}<div style="font-size:0.7rem; color:var(--ink-soft); font-weight:400;">${esc(t.designation)}</div>${t.lowData ? '<div style="font-size:0.66rem;color:#8a5300;">Low data</div>' : ''}</td>
          <td style="font-size:0.78rem;">${esc(t.subjects.join(', '))}</td>
          <td title="${t.resultCount} results">${t.studentCount}</td>
          <td><b>${t.avgPct}%</b><div style="font-size:0.72rem; color:${deltaColor};">${(t.delta > 0 ? '+' : '') + t.delta}% vs subject avg</div></td>
          <td>${t.passRate}%</td>
          <td>${t.distinctionPct}%</td>
          <td>${t.belowPass}</td>
          <td>${t.attendancePct !== null ? t.attendancePct + '%' : '—'}</td>
          <td>${t.syllabusPct !== null ? t.syllabusPct + '%' : '—'}</td>
          <td><b style="font-size:0.95rem;">${t.overallScore}</b><div style="margin-top:2px;">${flagBadge(t.flag)}</div></td>
        </tr>${detailRow}`;
    }).join('');
    return header + coverage + `
      <div class="table-wrap" style="overflow-x:auto; margin-bottom:28px;">
        <table><thead><tr>
          <th>Rank</th><th>Teacher</th><th>Subjects</th><th>Students</th><th>Academic Avg</th><th>Pass Rate</th><th>Distinction</th><th>Below Pass</th><th>Attendance</th><th>Syllabus</th><th>Overall Score</th>
        </tr></thead><tbody>${body}</tbody></table>
      </div>`;
  };

  // ---------- detail: class/subject breakdown ----------
  window.renderTeacherPerfDetail = function(t, examId, filters){
    const base = o.detail(t, examId, filters);
    let rows = [];
    try{ rows = teacherPerformanceScopedRows(examId, filters).filter(r => r.teacherId === t.teacherId); }catch(e){}
    if(!rows.length) return base;
    const grp = new Map();
    rows.forEach(r => {
      const k = r.className + '|' + r.section + '|' + r.subject;
      const g = grp.get(k) || { cls: r.className + ' - ' + r.section, subject: r.subject, n: 0, sum: 0, pass: 0, hi: -Infinity, lo: Infinity };
      g.n += r.studentsEvaluated; g.sum += r.avgPct * r.studentsEvaluated; g.pass += r.passRate * r.studentsEvaluated;
      g.hi = Math.max(g.hi, r.highest); g.lo = Math.min(g.lo, r.lowest);
      grp.set(k, g);
    });
    const list = [...grp.values()].map(g => ({ ...g, avg: g.sum / g.n, passRate: g.pass / g.n })).sort((a, b) => a.cls.localeCompare(b.cls, undefined, { numeric: true }) || a.subject.localeCompare(b.subject));
    const table = `
      <div style="padding:0 20px 18px;">
        <h4 style="margin:0 0 8px; font-size:0.9rem;">Class &amp; subject breakdown</h4>
        <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:#fff;"><th style="text-align:left;padding:6px;">Class</th><th style="text-align:left;padding:6px;">Subject</th><th style="padding:6px;">Results</th><th style="padding:6px;">Average</th><th style="padding:6px;">Pass rate</th><th style="padding:6px;">Highest</th><th style="padding:6px;">Lowest</th></tr></thead>
          <tbody>${list.map(g => `<tr style="border-top:1px solid var(--border);"><td style="padding:6px;">${esc(g.cls)}</td><td style="padding:6px;">${esc(g.subject)}</td><td style="padding:6px;text-align:center;">${g.n}</td><td style="padding:6px;text-align:center;"><b>${Math.round(g.avg * 10) / 10}%</b></td><td style="padding:6px;text-align:center;">${Math.round(g.passRate * 10) / 10}%</td><td style="padding:6px;text-align:center;">${Math.round(g.hi * 10) / 10}%</td><td style="padding:6px;text-align:center;">${Math.round(g.lo * 10) / 10}%</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    return base + table;
  };

  // ---------- make sure data is loaded first ----------
  window.renderStaffReportsTab = function(body){
    if(!body) return;
    if(isReady()) return o.render(body);
    body.innerHTML = '<div class="empty-state"><b>Loading marks, attendance and syllabus…</b>This takes a few seconds the first time.</div>';
    return ensureData().then(() => o.render(body));
  };
  window.generateTeacherPerfReport = async function(){ await ensureData(); return o.gen.apply(this, arguments); };
  window.printStaffMeetingPack = async function(){ await ensureData(); return o.pack.apply(this, arguments); };
  window.__teacherPerf = { studentStats, diagnose, whyEmpty };
})();
