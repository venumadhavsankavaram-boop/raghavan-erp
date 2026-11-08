

  /* --- Notice Board: the sheet pasted outside, so every child can find the room they go to --- */
  function raNoticeRows(examId){
    const { roomBlocks, corridorBlock } = buildFinalPrintoutDataFor(examId);
    const byId = {}; students.forEach(s => { byId[s.id] = s; });
    const rows = [];
    (corridorBlock ? [...roomBlocks, corridorBlock] : roomBlocks).forEach(block => block.classEntries.forEach(ce => ce.studentIds.forEach(id => {
      const s = byId[id]; if(!s) return;
      const ht = getHallTicket(examId, id);
      rows.push({ studentId: id, ht: ht && ht.htNumber ? String(ht.htNumber) : '', name: ((s.lastName || '') + ' ' + (s.firstName || '')).trim(), className: s.className, section: s.section || '', room: block.name, girl: raIsGirl(s) });
    })));
    return rows;
  }
  function raNoticeGroups(rows, cfg){
    const group = cfg.nbGroup || 'class';
    const cmpHt = (a, b) => (a.ht && b.ht) ? raCompareHt(a.ht, b.ht) : (a.ht ? -1 : b.ht ? 1 : a.name.localeCompare(b.name));
    const sorter = group === 'name' ? ((a, b) => a.name.localeCompare(b.name)) : cmpHt;
    const map = {};
    rows.forEach(r => { const k = group === 'room' ? r.room : group === 'class' ? r.className : 'All children'; (map[k] = map[k] || []).push(r); });
    let keys = Object.keys(map);
    if(group === 'class') keys.sort((a, b) => CLASS_LEVELS.indexOf(a) - CLASS_LEVELS.indexOf(b));
    else if(group === 'room') keys.sort((a, b) => a === 'CORRIDOR' ? 1 : b === 'CORRIDOR' ? -1 : a.localeCompare(b, undefined, { numeric: true }));
    return keys.map(k => ({ key: k, rows: map[k].sort(sorter) }));
  }
  function raNoticeWhen(g, group, cfg, exam){
    const d = raFmtDate(cfg.paperDate); if(!d) return '';
    let sub = cfg.paperSubject || '', time = cfg.paperTime || '';
    if(group === 'class'){ const by = raPaperInfo(exam, [g.key], cfg.paperDate); if(by[g.key]){ const t = raPaperText(by); sub = t.subject || sub; time = t.time || time; } }
    return '<div class="nb-when">' + [d, sub, time].filter(Boolean).map(raEsc).join(' &nbsp;·&nbsp; ') + '</div>';
  }
  function raNoticeSheetHtml(groups, cfg, exam, forPrint){
    const size = { normal: 12, large: 15, xl: 19 }[cfg.nbSize || 'large'] || 15;
    const cols = Number(cfg.nbCols) || 2, group = cfg.nbGroup || 'class';
    const ink = cfg.colour === false ? '#000' : RA_GIRL_INK;
    const sections = groups.map((g, gi) => {
      const girls = g.rows.filter(r => r.girl).length;
      const title = group === 'room' ? 'ROOM ' + raEsc(g.key).replace(/^ROOM\s*/i, '') : group === 'class' ? 'CLASS ' + raEsc(g.key) : 'ALL CHILDREN';
      const lines = g.rows.map((r, i) => {
        const room = '<span class="nb-room" title="' + raEsc(r.room) + '">' + raEsc(r.room.replace(/\s*\(.*\)\s*$/, '').replace(/^ROOM\s*/i, 'Room ')) + '</span>';
        const left = group === 'room' ? raEsc(r.className) + (r.section ? ' - ' + raEsc(r.section) : '') : (group === 'name' ? raEsc(r.className) + (r.section ? '-' + raEsc(r.section) : '') : raEsc(r.section));
        return '<div class="nb-row"><span class="nb-no">' + (i + 1) + '</span><span class="nb-ht">' + (r.ht ? raEsc(r.ht) : '—') + '</span><span class="nb-name"' + (r.girl && cfg.nbGirlRed ? ' style="color:' + ink + ';"' : '') + '>' + raEsc(r.name) + '</span><span class="nb-sec">' + left + '</span>' + (group === 'room' ? '' : room) + '</div>';
      }).join('');
      return '<section class="nb-sec-wrap"' + (forPrint && cfg.nbPageBreak !== false && gi > 0 ? ' style="break-before:page;page-break-before:always;"' : '') + '>'
        + '<div class="nb-head"><div class="nb-sch">' + raEsc(String(schoolInfo.name || '').toUpperCase()) + '</div><div class="nb-ex">' + (exam ? raEsc(exam.name.toUpperCase()) + ' — ' : '') + 'ROOM ALLOTMENT' + (raCurrentSession(cfg) ? ' — ' + raCurrentSession(cfg).toUpperCase() + ' SESSION' : '') + '</div>'
        + '<div class="nb-title">' + title + '</div>' + raNoticeWhen(g, group, cfg, exam) + '<div class="nb-cnt">' + g.rows.length + ' children' + (group === 'room' ? ' · girls ' + girls + ' · boys ' + (g.rows.length - girls) : '') + '</div></div>'
        + '<div class="nb-cols">' + lines + '</div></section>';
    }).join('');
    const css = '.nb-sec-wrap{margin-bottom:18px;}.nb-head{text-align:center;margin-bottom:10px;}.nb-sch{font-weight:700;font-size:' + (size + 6) + 'px;}.nb-ex{font-size:' + (size - 1) + 'px;color:#444;margin-top:2px;}.nb-title{display:inline-block;margin-top:8px;padding:4px 22px;border:2px solid #000;font-weight:800;font-size:' + (size + 5) + 'px;letter-spacing:1px;}.nb-when{font-size:' + (size + 1) + 'px;font-weight:700;margin-top:6px;}.nb-cnt{font-size:' + (size - 2) + 'px;color:#555;margin-top:4px;}'
      + '.nb-cols{column-count:' + cols + ';column-gap:22px;}.nb-row{display:flex;align-items:center;gap:8px;break-inside:avoid;padding:3px 2px;border-bottom:1px solid #999;font-size:' + size + 'px;line-height:1.35;}'
      + '.nb-no{width:2.2em;color:#666;text-align:right;font-size:' + (size - 3) + 'px;}.nb-ht{width:6.6em;font-weight:700;font-variant-numeric:tabular-nums;}.nb-name{flex:1;}.nb-sec{min-width:2em;text-align:center;color:#444;}.nb-room{display:inline-block;white-space:nowrap;flex-shrink:0;min-width:4.6em;text-align:center;padding:1px 8px;border:2px solid #000;border-radius:5px;font-weight:800;}';
    return { css, html: sections };
  }
  function renderNoticeBoardSubTab(el){
    const cfg = roomAllotConfig(), canEd = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const all = raNoticeRows(roomAllotExamId);
    const classesPresent = Array.from(new Set(all.map(d => d.className))).sort((a, b) => CLASS_LEVELS.indexOf(a) - CLASS_LEVELS.indexOf(b));
    if(roomAllotNoticeClassFilter && !classesPresent.includes(roomAllotNoticeClassFilter)) roomAllotNoticeClassFilter = '';
    const rows = roomAllotNoticeClassFilter ? all.filter(d => d.className === roomAllotNoticeClassFilter) : all;
    const groups = raNoticeGroups(rows, cfg), exam = roomAllotCurrentExam();
    const sheet = raNoticeSheetHtml(groups, cfg, exam, false);
    const noHt = rows.filter(r => !r.ht).length;
    const g = cfg.nbGroup || 'class', sz = cfg.nbSize || 'large', cl = String(cfg.nbCols || 2);
    el.innerHTML = `
      <div class="profile-card">
        <style>.ra-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:8px 0 14px;}.ra-choice{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:2px solid var(--border);border-radius:10px;cursor:pointer;}.ra-choice input{display:none;}.ra-choice small{color:var(--ink-soft);font-size:.72rem;}.ra-choice.on{border-color:#1f8a7a;background:rgba(31,138,122,.09);}.ra-tick{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;margin:0 8px 8px 0;font-size:.82rem;}</style>
        <h4>Notice Board Sheet — where does each child go?</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 8px;">Print it and paste it outside, so every child finds their name and goes straight to their room. Pick how the list is arranged:</p>
        <div class="ra-opts">
          ${raChoice('nbGroup','class',g,'One page per class','Children look up their own class. Recommended.',canEd)}
          ${raChoice('nbGroup','room',g,'One page per room','Everyone sitting in a room, for the room door.',canEd)}
          ${raChoice('nbGroup','name',g,'One A–Z list','All children in name order.',canEd)}
        </div>
        <div class="form-grid" style="margin-bottom:6px;">
          <div class="f-field"><label>Letter size</label><select onchange="setRaOption('nbSize', this.value)">
            <option value="normal" ${sz==='normal'?'selected':''}>Normal</option><option value="large" ${sz==='large'?'selected':''}>Large (easy to read)</option><option value="xl" ${sz==='xl'?'selected':''}>Extra large</option></select></div>
          <div class="f-field"><label>Columns on the page</label><select onchange="setRaOption('nbCols', Number(this.value))">
            <option value="1" ${cl==='1'?'selected':''}>1</option><option value="2" ${cl==='2'?'selected':''}>2</option><option value="3" ${cl==='3'?'selected':''}>3</option></select></div>
          <div class="f-field"><label>Show only class</label><select onchange="roomAllotNoticeClassFilter=this.value; renderRoomAllotSubBody();">
            <option value="">All classes</option>${classesPresent.map(c => `<option value="${raEsc(c)}" ${roomAllotNoticeClassFilter===c?'selected':''}>${raEsc(c)}</option>`).join('')}</select></div>
        </div>
        <label class="ra-tick"><input type="checkbox" ${cfg.nbPageBreak === false ? '' : 'checked'} onchange="setRaOption('nbPageBreak', this.checked)"> Start each ${g==='room'?'room':'class'} on a new page</label>
        <label class="ra-tick"><input type="checkbox" ${cfg.nbGirlRed ? 'checked' : ''} onchange="setRaOption('nbGirlRed', this.checked)"> Show girls' names in red</label>
        ${noHt ? `<div style="color:#b45309;font-size:.8rem;margin:2px 0 10px;">⚠ ${noHt} child${noHt===1?' has':'ren have'} no Hall Ticket Number yet (shown as —). Generate them under Hall Ticket Numbers first for a complete sheet.</div>` : ''}
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin:8px 0 14px;max-height:460px;overflow:auto;background:#fff;color:#111;"><style>${sheet.css}</style>${sheet.html || '<div style="color:#666;">No children allotted yet — add rooms and select classes first.</div>'}</div>
        ${getResultTabAccess(currentUser.role, 'result_roomallotment', 'print') ? `<button class="btn btn-primary" onclick="printNoticeBoard()">Print Notice Board Sheet</button>` : ''}
      </div>
    `;
  }
  function printNoticeBoard(){
    const cfg = roomAllotConfig(), exam = roomAllotCurrentExam();
    const all = raNoticeRows(roomAllotExamId);
    const rows = roomAllotNoticeClassFilter ? all.filter(d => d.className === roomAllotNoticeClassFilter) : all;
    if(!rows.length){ showToast('Nothing to print yet — add rooms and select classes first.'); return; }
    const sheet = raNoticeSheetHtml(raNoticeGroups(rows, cfg), cfg, exam, true);
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Notice Board - ${exam?raEsc(exam.name):''}</title>
      <style>
        @page{ size:A4 portrait; margin:12mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; }
        ${sheet.css}
      </style></head>
      <body onload="window.print()">${sheet.html}</body></html>
    `);
    w.document.close();
  }

  /* --- Document Signatures --- */
  function renderDocumentSignaturesSubTab(el){
    const canEdit = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const principalSig = schoolInfo.principalSignature || '';
    const classTeachers = staffList.filter(st => st.classTeacherClass && isActive(st))
      .sort((a,b) => (a.classTeacherClass+a.classTeacherSection).localeCompare(b.classTeacherClass+b.classTeacherSection));
    const sampleTeacher = classTeachers.find(t => t.signature) || null;
    el.innerHTML = `
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">Upload each signing authority's signature once, and it's applied automatically wherever that signature is needed — Admit Cards, Progress Reports, and Certificates — instead of every document needing to be signed by hand afterward. A student's own signature is the one exception; that always stays blank on the admit card for them to sign in person.</p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px,1fr)); gap:16px; margin-bottom:16px;">
        <div class="profile-card">
          <h4>Principal / Correspondent Signature</h4>
          <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 12px;">One signature, set once here (also visible under School Profile). Applied school-wide to every Admit Card and Progress Report.</p>
          <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
            <div style="width:150px; height:60px; border:1.5px dashed var(--border); border-radius:6px; display:flex; align-items:center; justify-content:center; background:#fafafa; overflow:hidden; flex-shrink:0;" id="examSigPrincipalPreviewWrap">
              <img id="examSigPrincipalPreview" src="${principalSig}" style="max-width:100%; max-height:100%; ${principalSig?'':'display:none;'}">
              <span id="examSigPrincipalPlaceholder" style="font-size:0.72rem; color:var(--ink-soft); ${principalSig?'display:none;':''}">No signature</span>
            </div>
            ${canEdit ? `
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">⟳ ${principalSig?'Replace':'Upload'} Signature<input type="file" accept="image/*" id="examSigPrincipalInput" style="display:none;" onchange="previewExamPrincipalSignature(event)"></label>
              ${principalSig ? `<button type="button" class="btn-danger-text" onclick="removeExamPrincipalSignature()">Remove</button>` : ''}
            </div>` : ''}
          </div>
          <span style="font-size:0.7rem; color:var(--ink-soft); display:block; margin-top:8px;">Scanned signature on a plain/white background, PNG preferred · Max 2MB</span>
        </div>
        <div class="profile-card">
          <h4>Class Teacher Signatures</h4>
          <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 12px;">Uploaded once per teacher on their own Staff Profile — right next to their photo — then applied wherever that teacher is the Class Teacher on a report.</p>
          <div class="table-wrap" style="max-height:220px; overflow:auto;">
            <table><thead><tr><th>Class Teacher</th><th>Class</th><th>Signature</th><th></th></tr></thead>
            <tbody>${classTeachers.length ? classTeachers.map(t => `
              <tr>
                <td>${t.firstName} ${t.lastName}</td>
                <td>${t.classTeacherClass} — ${t.classTeacherSection}</td>
                <td>${t.signature ? `<img src="${t.signature}" style="height:22px;">` : '<span style="color:var(--ink-soft); font-size:0.76rem;">Not uploaded</span>'}</td>
                <td><button type="button" class="btn-edit-text" onclick="openStaffWizard('${t.id}')">Manage →</button></td>
              </tr>`).join('') : '<tr><td colspan="4" style="color:var(--ink-soft);">No staff assigned as Class Teacher yet — set this under Staff → Edit Staff → Professional tab.</td></tr>'}
            </tbody></table>
          </div>
        </div>
      </div>
      <div class="profile-card">
        <h4>How it looks on documents</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 14px;">Both signatures are applied the moment a document is generated — nobody has to remember to sign anything afterward.</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:14px;">
          <div style="border:1px solid var(--border); border-radius:8px; padding:12px;">
            <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); margin-bottom:10px;">ADMIT CARD — SIGNATURE STRIP</div>
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <div style="text-align:center; flex:1;"><div style="height:26px;"></div><div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Student's Signature<br><i style="color:var(--ink-soft);">(signs in person)</i></div></div>
              <div style="text-align:center; flex:1;">${principalSig?`<img src="${principalSig}" style="height:26px; max-width:100%;">`:`<div style="height:26px;"></div>`}<div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Principal / Correspondent<br><i style="color:var(--ink-soft);">(auto-applied)</i></div></div>
            </div>
          </div>
          <div style="border:1px solid var(--border); border-radius:8px; padding:12px;">
            <div style="font-size:0.74rem; font-weight:700; color:var(--ink-soft); margin-bottom:10px;">PROGRESS REPORT — SIGNATURE STRIP</div>
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <div style="text-align:center; flex:1;">${sampleTeacher?`<img src="${sampleTeacher.signature}" style="height:26px; max-width:100%;">`:`<div style="height:26px;"></div>`}<div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Class Teacher<br><i style="color:var(--ink-soft);">(auto-applied)</i></div></div>
              <div style="text-align:center; flex:1;">${principalSig?`<img src="${principalSig}" style="height:26px; max-width:100%;">`:`<div style="height:26px;"></div>`}<div style="border-top:1px solid var(--border); padding-top:4px; font-size:0.72rem;">Principal / Correspondent<br><i style="color:var(--ink-soft);">(auto-applied)</i></div></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  function previewExamPrincipalSignature(e){
    readImageFileWithSizeLimit(e, async dataUrl => {
      schoolInfo.principalSignature = dataUrl;
      await storageSet(SCHOOL_INFO_KEY, schoolInfo);
      showToast('Principal / Correspondent signature saved.', 'burst');
      renderRoomAllotSubBody();
    });
  }
  async function removeExamPrincipalSignature(){
    if(!await showConfirmDialog('Remove the Principal / Correspondent signature? It will need to be re-uploaded before it appears on Admit Cards or Progress Reports again.')) return;
    schoolInfo.principalSignature = '';
    await storageSet(SCHOOL_INFO_KEY, schoolInfo);
    showToast('Signature removed.', 'burst');
    renderRoomAllotSubBody();
  }

  /* --- Tab: Admit Cards --- */
  let admitCardsView = 'grid';
  let admitCardsExamId = '', admitCardsClass = '', admitCardsSection = '';
  let admitCardsPerPage = 4; // 3 or 4 — how many hall-ticket strips are stacked on each printed A4 sheet (Classic Strip layout only)
  let admitCardsTemplateId = ''; // '' = use the default admit card template
  function currentAdmitCardTemplate(){
    return admitCardTemplates.find(t => t.id === admitCardsTemplateId) || admitCardTemplates.find(t => t.isDefault) || admitCardTemplates[0];
  }

  // ---- Exam timings + automatic exam choice ----
  function acFmtTime(t){ if(!t) return ''; const [h, m] = String(t).split(':').map(Number); if(isNaN(h)) return ''; return ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM'); }
  // Time for a subject: its own time first, then the time set for its class group, then the exam-wide time.
  function acTimeText(sub, exam, cls){
    if(sub && sub.startTime) return acFmtTime(sub.startTime) + (sub.endTime ? ' – ' + acFmtTime(sub.endTime) : '');
    const g = cls && exam && (exam.classTimes || []).find(x => x.start && (x.classes || []).includes(cls));
    const a = g ? g.start : (exam && exam.defaultStart) || '', b = g ? g.end : (exam && exam.defaultEnd) || '';
    return a ? acFmtTime(a) + (b ? ' – ' + acFmtTime(b) : '') : '';
  }
  // The exam running today, else the next one coming up, else the most recent one, else the first.
  function acCurrentExam(){
    const today = new Date().toISOString().slice(0, 10);
    const dated = examDefs.filter(e => e.startDate);
    const running = dated.filter(e => e.startDate <= today && (e.endDate || e.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if(running) return running;
    const next = dated.filter(e => e.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if(next) return next;
    return dated.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] || examDefs[0];
  }
  function acExamTag(e){
    const today = new Date().toISOString().slice(0, 10);
    if(!e.startDate) return '';
    if(e.startDate <= today && (e.endDate || e.startDate) >= today) return ' — running now';
    return e.startDate > today ? ' — upcoming' : ' — finished';
  }
  // ---- Timings editor: one exam-wide time, plus different times for groups of classes ----
  let acDraft = null;
  function acDraftFor(exam){
    if(!acDraft || acDraft.examId !== exam.id) acDraft = { examId: exam.id, start: exam.defaultStart || '', end: exam.defaultEnd || '', groups: (exam.classTimes || []).map(g => ({ classes: (g.classes || []).slice(), start: g.start || '', end: g.end || '' })) };
    return acDraft;
  }
  function acReadTimes(){
    if(!acDraft) return;
    acDraft.start = document.getElementById('acDefStart').value; acDraft.end = document.getElementById('acDefEnd').value;
    document.querySelectorAll('.ac-grp').forEach(el => {
      const g = acDraft.groups[+el.dataset.i]; if(!g) return;
      g.start = el.querySelector('.ac-gs').value; g.end = el.querySelector('.ac-ge').value;
      g.classes = [...el.querySelectorAll('.ac-gc:checked')].map(c => c.value);
    });
  }
  function acAddGroup(){ if(!acDraft) acPaintTimes(); acReadTimes(); acDraft.groups.push({ classes: [], start: '', end: '' }); acPaintTimes(); }
  function acRemoveGroup(i){ if(!acDraft) acPaintTimes(); acReadTimes(); acDraft.groups.splice(i, 1); acPaintTimes(); }
  function acPaintTimes(){
    const box = document.getElementById('acTimesBox'); if(!box) return;
    const exam = examDefs.find(e => e.id === admitCardsExamId); if(!exam) return;
    const d = acDraftFor(exam);
    const raCfg = roomAllotConfigFor(admitCardsExamId);
    const classes = (raCfg.selectedClasses && raCfg.selectedClasses.length) ? raCfg.selectedClasses : CLASS_LEVELS;
    box.innerHTML = `
      <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; margin:10px 0 6px;">
        <div class="f-field" style="margin:0;"><label>All classes — starts</label><input type="time" id="acDefStart" value="${d.start}"></div>
        <div class="f-field" style="margin:0;"><label>ends</label><input type="time" id="acDefEnd" value="${d.end}"></div>
      </div>
      ${d.groups.map((g, i) => `<div class="ac-grp" data-i="${i}" style="border:1px dashed var(--border); border-radius:10px; padding:8px 10px; margin:8px 0;">
        <div style="font-size:.8rem; font-weight:700; margin-bottom:4px;">Different time for these classes:</div>
        <div style="display:flex; gap:4px 12px; flex-wrap:wrap; margin-bottom:6px;">${classes.map(c => `<label style="font-size:.8rem;"><input type="checkbox" class="ac-gc" value="${c}" ${g.classes.includes(c) ? 'checked' : ''}> ${c}</label>`).join('')}</div>
        <div style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
          <div class="f-field" style="margin:0;"><label>starts</label><input type="time" class="ac-gs" value="${g.start}"></div>
          <div class="f-field" style="margin:0;"><label>ends</label><input type="time" class="ac-ge" value="${g.end}"></div>
          <button class="btn btn-ghost btn-sm" onclick="acRemoveGroup(${i})">Remove</button>
        </div></div>`).join('')}
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
        <button class="btn btn-ghost btn-sm" onclick="acAddGroup()">＋ Different time for some classes</button>
        <button class="btn btn-primary btn-sm" onclick="acSaveDefaultTimes()">Save timings</button>
      </div>
      <div style="font-size:.78rem; color:var(--ink-soft); margin-top:6px;">A subject's own time (Exams tab) wins, then the time for its class group, then the "All classes" time.</div>`;
  }
  async function acSaveDefaultTimes(){
    const exam = examDefs.find(e => e.id === admitCardsExamId); if(!exam) return;
    acReadTimes();
    const bad = t => t.start && t.end && t.end <= t.start;
    if(bad(acDraft) || acDraft.groups.some(bad)){ showToast('An end time must be after its start time.'); return; }
    const groups = acDraft.groups.filter(g => g.start && g.classes.length);
    const seen = new Set();
    for(const g of groups) for(const c of g.classes){ if(seen.has(c)){ showToast(c + ' is in two groups — put each class in only one.'); return; } seen.add(c); }
    exam.defaultStart = acDraft.start; exam.defaultEnd = acDraft.end; exam.classTimes = groups;
    await storageSet(EXAM_DEFS_KEY, examDefs);
    acDraft = null;
    showToast('Exam timings saved — they print on every admit card of this exam.');
    renderResultBody();
  }
  // Prints every section of one class (each with its own subjects) in a single go.
  function printAdmitCardsClass(cls){
    const secs = SECTIONS.filter(sec => students.some(s => s.className === cls && s.section === sec && isActive(s)));
    if(!secs.length){ showToast('No students in ' + cls + '.'); return; }
    acRunPrint(secs.map(sec => ({ cls, sec })));
  }

  let expandedAdmitClass = '';
  function toggleAdmitClassExpand(cls){
    expandedAdmitClass = (expandedAdmitClass === cls) ? '' : cls;
    renderAdmitCardsGrid(document.getElementById('resultBody'));
  }
  function renderAdmitCardsGrid(body){
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam under the "Exams" tab first.</div>`;
      return;
    }
    if(!admitCardsExamId || !examDefs.find(e => e.id === admitCardsExamId)) admitCardsExamId = acCurrentExam().id;
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${admitCardsExamId===ex.id?'selected':''}>${ex.name}${acExamTag(ex)}</option>`).join('');
    const raCfg = roomAllotConfigFor(admitCardsExamId);
    const visibleClasses = (raCfg.selectedClasses && raCfg.selectedClasses.length) ? raCfg.selectedClasses : CLASS_LEVELS;
    const gridHtml = buildModernClassGrid(
      visibleClasses,
      (cls, sec) => students.filter(s => s.className===cls && s.section===sec && isActive(s)).length,
      cls => `toggleAdmitClassExpand('${cls}')`,
      (cls, sec) => `openAdmitCardsRoster('${cls}','${sec}')`,
      cls => expandedAdmitClass === cls
    );
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:12px;">
        <label>Exam</label>
        <select id="admitExamSelect" onchange="admitCardsExamId=this.value; renderResultBody();">${examOptions}</select>
      </div>
      ${acHeaderHtml(raCfg, visibleClasses)}
      ${(raCfg.selectedClasses && raCfg.selectedClasses.length) ? `<p style="font-size:0.78rem; color:var(--ink-soft); margin:-10px 0 16px;">Showing only the classes selected for this exam under <a onclick="switchResultTab('roomallotment')" style="color:var(--magenta); cursor:pointer; font-weight:600;">Room Allotment → Select Classes</a>.</p>` : ''}
      ${gridHtml}
    `;
    acPaintTimes();
  }
  function acReady(exam, c, sec){ const sj = getExamSubjects(exam, c, sec); return sj.length > 0 && sj.every(x => x.date); }
  function acHeaderHtml(raCfg, visibleClasses){
    const exam = examDefs.find(e => e.id === admitCardsExamId); if(!exam) return '';
    const period = exam.startDate ? exam.startDate + (exam.endDate && exam.endDate !== exam.startDate ? ' – ' + exam.endDate : '') : 'dates not set';
    const canPrint = getResultTabAccess(currentUser.role, 'result_admitcards', 'print');
    const rows = visibleClasses.map(c => ({ c, secs: SECTIONS.filter(sec => students.some(s => s.className === c && s.section === sec && isActive(s))) })).filter(r => r.secs.length);
    const printPanel = !canPrint ? '' : `<div style="margin-top:12px;"><div style="font-weight:700; font-size:.9rem; margin-bottom:6px;">Print admit cards</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
        <button class="btn btn-primary btn-sm" onclick="acPrintEverything()">Print ALL classes &amp; sections</button>
        <button class="btn btn-ghost btn-sm" onclick="acTickAll(true)">Tick all</button>
        <button class="btn btn-ghost btn-sm" onclick="acTickAll(false)">Clear</button>
        <button class="btn btn-primary btn-sm" onclick="acPrintSelected()">Print ticked</button>
      </div>
      <div style="max-height:260px; overflow:auto; border:1px solid var(--border); border-radius:10px; padding:6px 10px;">
        ${rows.map(r => `<div style="padding:4px 0; border-top:1px solid var(--border);">
          <label style="font-weight:700; font-size:.85rem; margin-right:10px;"><input type="checkbox" class="ac-pc" value="${r.c}" onchange="acTickClass(this)"> ${r.c}</label>
          ${r.secs.map(sec => { const ok = acReady(exam, r.c, sec); return `<label style="font-size:.82rem; margin-right:10px;${ok ? '' : ' opacity:.55;'}" title="${ok ? '' : 'Subjects or exam dates missing'}"><input type="checkbox" class="ac-ps" data-c="${r.c}" value="${sec}" ${ok ? '' : 'disabled'}> Sec ${sec}${ok ? '' : ' ⚠'}</label>`; }).join('')}
        </div>`).join('') || '<small>No classes with students.</small>'}
      </div>
      <div style="font-size:.76rem; color:var(--ink-soft); margin-top:4px;">Tick a class to tick all its sections, or tick single sections. Sections marked ⚠ are not ready (no subjects or exam dates) and are skipped. To print one student, open that section from the grid below.</div></div>`;
    return `<div style="border:1px solid var(--border); border-radius:12px; padding:12px 14px; margin-bottom:16px; background:var(--surface-2,#f7f5fb);">
      <div style="font-weight:700;">${exam.name} <span style="font-weight:400; color:var(--ink-soft);">· ${period}${acExamTag(exam)}</span></div>
      <div id="acTimesBox"></div>
      ${printPanel}
    </div>`;
  }
  function acTickClass(el){ document.querySelectorAll('.ac-ps[data-c="' + el.value + '"]:not(:disabled)').forEach(x => x.checked = el.checked); }
  function acTickAll(on){ document.querySelectorAll('.ac-pc').forEach(x => x.checked = on); document.querySelectorAll('.ac-ps:not(:disabled)').forEach(x => x.checked = on); }
  function acRunPrint(pairs){ const seen = new Set(); pairs = pairs.filter(p => { const k = p.cls + '|' + p.sec; if(seen.has(k)) return false; seen.add(k); return true; }); if(typeof window.acPrintPairsGuarded === 'function') window.acPrintPairsGuarded(pairs); else printAdmitCardPairs(pairs); }
  function acPrintSelected(){
    const pairs = [...document.querySelectorAll('.ac-ps:checked')].map(x => ({ cls: x.dataset.c, sec: x.value }));
    if(!pairs.length){ showToast('Tick at least one class or section first.'); return; }
    acRunPrint(pairs);
  }
  function acPrintEverything(){
    const exam = examDefs.find(e => e.id === admitCardsExamId); if(!exam) return;
    const raCfg = roomAllotConfigFor(admitCardsExamId);
    const classes = (raCfg.selectedClasses && raCfg.selectedClasses.length) ? raCfg.selectedClasses : CLASS_LEVELS;
    const pairs = [];
    classes.forEach(c => SECTIONS.forEach(sec => { if(students.some(s => s.className === c && s.section === sec && isActive(s))) pairs.push({ cls: c, sec }); }));
    if(!pairs.length){ showToast('No students to print for.'); return; }
    acRunPrint(pairs);
  }
  function openAdmitCardsRoster(cls, sec){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    admitCardsClass = cls; admitCardsSection = sec;
    admitCardsView = 'roster';
    renderResultBody();
  }
  function backToAdmitCardsGrid(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    admitCardsView = 'grid';
    renderResultBody();
  }
  function renderAdmitCardsRoster(body){
    const exam = examDefs.find(e => e.id === admitCardsExamId);
    if(!exam){ admitCardsView = 'grid'; return renderExamBody(); }
    const subjects = getExamSubjects(exam, admitCardsClass, admitCardsSection);
    const missingDates = subjects.filter(s => !s.date);
    const list = students.filter(s => s.className===admitCardsClass && s.section===admitCardsSection && isActive(s))
      .sort(compareByRoll);
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToAdmitCardsGrid()">All Classes</a> &nbsp;/&nbsp; ${admitCardsClass} — Section ${admitCardsSection} &nbsp;/&nbsp; ${exam.name}</div>
      ${subjects.length===0 ? `<div class="empty-state" style="margin-bottom:16px;"><b>No subjects configured yet</b>Hall tickets need at least one dated subject — configure subjects for this class &amp; section under the "Exams" tab first.</div>` : ``}
      ${subjects.length>0 && missingDates.length>0 ? `<div class="empty-state" style="margin-bottom:16px; border-color:var(--gold);"><b>⚠ ${missingDates.length} subject${missingDates.length===1?'':'s'} still need${missingDates.length===1?'s':''} an exam date</b>${missingDates.map(s=>s.name).join(', ')} — set a date for each under "Exams" → Configure Subjects before printing hall tickets.</div>` : ``}
      ${(() => {
        const canPrint = getResultTabAccess(currentUser.role, 'result_admitcards', 'print');
        const tmpl = currentAdmitCardTemplate();
        const templateOptions = admitCardTemplates.map(t => `<option value="${t.id}" ${(admitCardsTemplateId?admitCardsTemplateId===t.id:t.isDefault)?'selected':''}>${t.name}</option>`).join('');
        const perPageNote = tmpl && tmpl.layout==='strip'
          ? `<select id="admitCardsPerPageSelect" onchange="admitCardsPerPage=parseInt(this.value);">
              <option value="4" ${admitCardsPerPage===4?'selected':''}>4 per sheet — compact</option>
              <option value="3" ${admitCardsPerPage===3?'selected':''}>3 per sheet — more room to sign</option>
            </select>`
          : `<div style="font-size:0.85rem; color:var(--ink-soft); padding:10px 0;">${tmpl && tmpl.layout==='full' ? '1 per A4 sheet (fixed by this layout)' : '4 per A4 sheet, 2×2 grid (fixed by this layout)'}</div>`;
        return `
      <div style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; margin-bottom:16px;">
        ${canPrint ? `<button class="btn btn-primary" onclick="printAdmitCards('${admitCardsClass}','${admitCardsSection}', null)" ${(list.length===0 || subjects.length===0 || missingDates.length>0)?'disabled':''}>Print All Admit Cards</button>` : ''}
        <div class="f-field" style="max-width:230px; margin-bottom:0;">
          <label>Template</label>
          <select id="admitCardsTemplateSelect" onchange="admitCardsTemplateId=this.value; renderResultBody();">${templateOptions}</select>
        </div>
        <div class="f-field" style="max-width:230px; margin-bottom:0;">
          <label>Cards per A4 Sheet</label>
          ${perPageNote}
        </div>
        <button class="btn btn-ghost btn-sm" onclick="openTemplateManager('admitcard')">Customize Templates</button>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Student</th><th>Admission No</th><th></th></tr></thead>
        <tbody>
        ${list.map(s => `<tr>
          <td class="name-cell">${s.lastName} ${s.firstName}</td>
          <td class="id-cell">${s.admissionNo}</td>
          <td>${canPrint ? `<button class="btn-edit-text" ${(subjects.length===0 || missingDates.length>0)?'disabled':''} onclick="printAdmitCards('${admitCardsClass}','${admitCardsSection}', '${s.id}')">Print Admit Card</button>` : ''}</td>
        </tr>`).join('')}
        </tbody></table>
        ${list.length===0 ? `<div class="empty-state"><b>No students here</b></div>` : ``}
      </div>
        `; })()}
    `;
  }

  function printAdmitCards(cls, secArg, singleStudentId){
    const secList = Array.isArray(secArg) ? secArg : [secArg];
    printAdmitCardPairs(secList.map(sec => ({ cls, sec })), singleStudentId);
  }
  // Prints any mix of classes/sections in one go. One section = strict (tells you what is missing); several = prints every
  // section that is ready and lists the ones it skipped.
  function printAdmitCardPairs(pairs, singleStudentId){
    const exam = examDefs.find(e => e.id === admitCardsExamId);
    if(!exam || !pairs.length) return;
    const strict = pairs.length === 1;
    const logoSrc = document.querySelector('.sb-brand img').src;
    const examPeriod = exam.startDate ? exam.startDate + (exam.endDate && exam.endDate!==exam.startDate ? ' – '+exam.endDate : '') : 'To be announced';
    const tmpl = currentAdmitCardTemplate();
    const roomMap = computeExamHallTicketRoomMap(admitCardsExamId);
    const principalSig = schoolInfo.principalSignature || '';
    const cardTitle = (tmpl.titleOverride||'').trim() || 'Admit Card';
    const instructions = (tmpl.instructionsText||'').split('\n').map(l=>l.trim()).filter(Boolean);
    const parts = [], skipped = []; let firstList = null, builtCss = '', cnt = 0;
    for(const { cls, sec } of pairs){
      const subjects = getExamSubjects(exam, cls, sec).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
      if(subjects.length === 0){ if(strict){ showToast('No subjects configured for ' + cls + ' ' + sec + ' yet.'); return; } skipped.push(cls + ' ' + sec + ' (no subjects)'); continue; }
      const missingDates = subjects.filter(s => !s.date);
      if(missingDates.length > 0){ if(strict){ showToast(`Set an exam date for: ${missingDates.map(s=>s.name).join(', ')} (${cls} ${sec}) — every subject needs a date before hall tickets can be generated.`); return; } skipped.push(cls + ' ' + sec + ' (exam dates missing)'); continue; }
      let list = students.filter(s => s.className===cls && s.section===sec && isActive(s)).sort(compareByRoll);
      if(singleStudentId) list = list.filter(s => s.id === singleStudentId);
      if(list.length === 0) continue;
      if(!firstList) firstList = list;
      cnt += list.length;
      const ctx = { exam, subjects, list, logoSrc, examPeriod, tmpl, roomMap, principalSig, cardTitle, instructions };
      // Layout is template-driven: 'strip' (Classic Strip, unchanged), 'grid4'
      // (Modern Card, 4-up 2x2 on A4) or 'full' (Full Board-Style, one candidate
      // per A4 sheet with a full instructions block) — see admitCardTemplates.
      const built = tmpl.layout === 'full' ? buildAdmitCardsFull(ctx)
                  : tmpl.layout === 'grid4' ? buildAdmitCardsGrid4(ctx)
                  : buildAdmitCardsStrip(ctx);
      builtCss = built.css; parts.push(built.html);
    }
    if(skipped.length) showToast('Skipped: ' + skipped.join(', ') + '. Printing the rest (' + cnt + ' cards).');
    const cls = pairs[0].cls, secList = pairs.map(p => p.sec);
    if(!parts.length) return;
    const list = firstList;
    const built = { css: builtCss, html: parts.join('<div style="page-break-after:always;"></div>') };

    // Smart print filename: this becomes the print popup's document title, which
    // browsers use to suggest a filename in the native "Save as PDF" dialog —
    // so a descriptive, unique name lands there instead of a generic one.
    const safe = str => (str||'').replace(/[^\w-]+/g,'_').replace(/^_+|_+$/g,'');
    const fileTitle = singleStudentId
      ? `AdmitCard_${safe(list[0].admissionNo)}_${safe((list[0].firstName||'')+(list[0].lastName||''))}_${safe(exam.name)}`
      : `AdmitCards_${pairs.length === 1 ? safe(cls) + '_' + safe(secList[0]) : (new Set(pairs.map(p => p.cls)).size > 1 ? 'MultiClass' : safe(cls) + '_AllSections')}_${safe(exam.name)}`;

    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${fileTitle}</title>
      <style>
        *{ box-sizing:border-box; }
        @page{ size:A4; margin:8mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; margin:0; }
        ${built.css}
        ${brandWmCss('.ac-strip, .acg-card, .acf-sheet', { size:'50%', opacity:0.06 })}
      </style></head>
      <body onload="window.print()">
        ${built.html}
      </body></html>
    `);
    w.document.close();
  }

  // --- Layout: Classic Strip — 3 or 4 full-width horizontal strips stacked per A4 sheet ---
  function buildAdmitCardsStrip(ctx){
    const { exam, subjects, list, logoSrc, examPeriod, roomMap, principalSig } = ctx;
    const perPage = (admitCardsPerPage===3) ? 3 : 4;
    // Each admit card is a full-width horizontal strip; 3 or 4 are stacked down a
    // portrait A4 sheet (chosen via the "Cards per A4 Sheet" selector). Every
    // subject row carries its own blank cell so a different invigilator can sign
    // in person on that exam's day, instead of one signature covering the whole
    // exam period.
    const stripHtml = (s, isLastInPage) => {
      const ht = getHallTicket(admitCardsExamId, s.id);
      const roomInfo = roomMap[s.id];
      return `
      <div class="ac-strip">
        <div class="ac-col-brand">
          <img class="ac-logo" src="${logoSrc}">
          <div class="ac-school">${schoolInfo.name}</div>
          <div class="ac-addr">${schoolInfo.address||''}</div>
          ${brandLineHtml({ size:'6px', margin:'0 0 1px' })}
          <div class="ac-examname">Admit Card<br>${exam.name}<br>${examPeriod}</div>
        </div>
        <div class="ac-col-student">
          <div class="ac-photo-slot">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
          <div class="ac-title">STUDENT DETAILS</div>
          <table class="ac-info">
            <tr><td>Name</td><td>${s.lastName} ${s.firstName}</td></tr>
            <tr><td>Admission No.</td><td>${s.admissionNo}</td></tr>
            <tr><td>Class &amp; Section</td><td>${s.className} — ${s.section}</td></tr>
            <tr><td>Roll No.</td><td>${s.rollNo||'—'}</td></tr>
          </table>
          ${(ht && ht.htNumber) || roomInfo ? `<div class="ac-ht-room-box">Hall Ticket No.: <b>${ht&&ht.htNumber?ht.htNumber:'—'}</b> &nbsp;|&nbsp; Room: <b>${roomInfo?roomInfo.room:'—'}</b></div>` : ''}
        </div>
        <div class="ac-col-subjects">
          <div class="ac-subj-title">SUBJECT-WISE SCHEDULE — sign daily before the exam begins</div>
          <table class="ac-subj-table">
            <thead><tr><th>Subject</th><th class="date-col">Date</th>${subjects.some(x => acTimeText(x, exam, list[0].className)) ? '<th class="time-col">Time</th>' : ''}<th class="sign-col">Invigilator's Signature</th></tr></thead>
            <tbody>
            ${subjects.map(sub => `<tr><td>${sub.name}</td><td class="date-cell">${sub.date||'TBA'}</td>${subjects.some(x => acTimeText(x, exam, list[0].className)) ? `<td class="time-cell">${acTimeText(sub, exam, list[0].className) || '—'}</td>` : ''}<td class="sign-cell">&nbsp;</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="ac-col-sign">
          <div class="ac-sign-line">Student's<br>Signature</div>
          <div style="height:3mm;"></div>
          <div class="ac-sign-line ac-sign-auto">${principalSig ? `<img src="${principalSig}">` : ''}Principal /<br>Correspondent</div>
        </div>
        ${!isLastInPage ? `<span class="scissor">✂</span>` : ''}
      </div>
    `;
    };

    const pages = [];
    for(let i=0;i<list.length;i+=perPage) pages.push(list.slice(i, i+perPage));
    const html = pages.map((pageStudents, pIdx) => `
      <div class="ac-page${pIdx < pages.length-1 ? ' ac-pagebreak' : ''}">
        <div class="ac-stack">
          ${pageStudents.map((s,i) => stripHtml(s, i===pageStudents.length-1)).join('')}
        </div>
      </div>
    `).join('');

    const css = `
        .ac-page{ width:100%; }
        .ac-pagebreak{ page-break-after:always; }
        .ac-stack{ display:flex; flex-direction:column; height:281mm; gap:4mm; }
        .ac-strip{ flex:1; border:1.4px solid #333; border-radius:3px; display:flex; overflow:hidden; position:relative; page-break-inside:avoid; }
        .ac-strip:not(:last-child)::after{ content:''; position:absolute; left:-8mm; right:-8mm; bottom:-2.7mm; border-bottom:1px dashed #aaa; }
        .ac-strip .scissor{ position:absolute; left:-6mm; bottom:-4.6mm; font-size:9px; color:#999; background:#fff; padding:0 2px; }

        .ac-col-brand{ width:30mm; background:#faf6ec; border-right:1px solid #333; padding:2mm; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; flex-shrink:0; }
        .ac-logo{ width:11mm; height:11mm; border-radius:50%; object-fit:cover; margin-bottom:1.5mm; }
        .ac-school{ font-weight:700; font-size:7.6px; line-height:1.15; color:#1b2a52; }
        .ac-addr{ font-size:5.6px; color:#666; line-height:1.25; margin-top:1mm; }
        .ac-examname{ margin-top:1.5mm; font-size:6px; font-weight:700; color:#d11073; line-height:1.3; }

        .ac-col-student{ width:47mm; border-right:1px solid #333; padding:2mm 2.5mm; flex-shrink:0; display:flex; flex-direction:column; justify-content:center; position:relative; }
        .ac-title{ font-size:7.2px; font-weight:700; letter-spacing:.03em; color:#666; margin-bottom:1.4mm; }
        .ac-info{ width:76%; font-size:7.4px; border-collapse:collapse; }
        .ac-info td{ padding:0.9px 0; }
        .ac-info td:first-child{ color:#666; width:44%; }
        .ac-info td:last-child{ font-weight:700; }
        .ac-photo-slot{ position:absolute; top:2mm; right:2mm; width:11mm; height:13mm; border:1px solid #999; font-size:8px; font-weight:700; color:#999; display:flex; align-items:center; justify-content:center; text-align:center; background:#f7f7f7; overflow:hidden; }
        .ac-photo-slot img{ width:100%; height:100%; object-fit:cover; }
        .ac-ht-room-box{ margin-top:1.5mm; font-size:6.2px; font-weight:700; color:#0a5c36; background:#e9f9ef; border:1px solid #8fd6ab; border-radius:2px; padding:1mm 1.4mm; text-align:center; }

        .ac-col-subjects{ flex:1; padding:2mm 2.5mm; display:flex; flex-direction:column; justify-content:center; min-width:0; }
        .ac-subj-title{ font-size:6.6px; font-weight:700; color:#666; margin-bottom:1mm; }
        .ac-subj-table{ width:100%; border-collapse:collapse; font-size:6.8px; table-layout:fixed; }
        .ac-subj-table th{ text-align:left; background:#eef0f4; padding:1.2px 3px; font-size:6.4px; border:1px solid #ddd; }
        .ac-subj-table td{ padding:2mm 3px; border:1px solid #ddd; line-height:1; }
        .ac-subj-table th.sign-col, .ac-subj-table td.sign-cell{ width:26mm; }
        .ac-subj-table th.date-col, .ac-subj-table td.date-cell{ width:18mm; }
        .ac-subj-table th.time-col, .ac-subj-table td.time-cell{ width:25mm; }

        .ac-col-sign{ width:20mm; border-left:1px solid #333; padding:2mm 1.6mm; flex-shrink:0; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; }
        .ac-sign-line{ width:100%; border-top:1px solid #555; text-align:center; font-size:5.6px; color:#666; padding-top:1mm; }
        .ac-sign-auto img{ display:block; max-width:100%; max-height:6mm; margin:0 auto 0.5mm; }
    `;
    return { html, css };
  }

  // --- Layout: Modern Card — 4 compact cards per A4 sheet, 2×2 grid ---
  function buildAdmitCardsGrid4(ctx){
    const { exam, subjects, list, logoSrc, examPeriod, roomMap, principalSig, cardTitle, tmpl } = ctx;
    const cardHtml = (s) => {
      const ht = getHallTicket(admitCardsExamId, s.id);
      const roomInfo = roomMap[s.id];
      return `
      <div class="acg-card">
        <div class="acg-head">
          <img class="acg-logo" src="${logoSrc}">
          <div class="acg-head-text">
            <div class="acg-school">${schoolInfo.name}</div>
            ${brandLineHtml({ size:'7px', align:'left', margin:'0' })}
            <div class="acg-cardtitle">${cardTitle}</div>
          </div>
          <div class="acg-photo">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
        </div>
        <div class="acg-examline">${exam.name} &nbsp;·&nbsp; ${examPeriod}</div>
        <table class="acg-info">
          <tr><td>Name</td><td>${s.lastName} ${s.firstName}</td></tr>
          <tr><td>Admission No.</td><td>${s.admissionNo}</td></tr>
          <tr><td>Class</td><td>${s.className} — ${s.section}</td></tr>
          <tr><td>Roll No.</td><td>${s.rollNo||'—'}</td></tr>
          <tr><td>Hall Ticket No.</td><td>${ht&&ht.htNumber?ht.htNumber:'—'}</td></tr>
          <tr><td>Room</td><td>${roomInfo?roomInfo.room:'—'}</td></tr>
        </table>
        <div class="acg-subjcount">${subjects.length} subject${subjects.length===1?'':'s'}${subjects.some(x => acTimeText(x, exam, list[0].className)) ? ' · ' + (acTimeText(subjects[0], exam, list[0].className) || '') : ''} — see notice board / class teacher for the full subject-wise date sheet.</div>
        ${tmpl.footerNote ? `<div class="acg-footnote">${tmpl.footerNote}</div>` : ''}
        <div class="acg-signrow">
          <div class="acg-sign">Student's Signature</div>
          <div class="acg-sign acg-sign-auto">${principalSig ? `<img src="${principalSig}">` : ''}Principal</div>
        </div>
      </div>
      `;
    };
    const pages = [];
    for(let i=0;i<list.length;i+=4) pages.push(list.slice(i, i+4));
    const html = pages.map((pageStudents, pIdx) => `
      <div class="acg-page${pIdx < pages.length-1 ? ' acg-pagebreak' : ''}">
        <div class="acg-grid">
          ${pageStudents.map(s => cardHtml(s)).join('')}
        </div>
      </div>
    `).join('');
    const css = `
        .acg-page{ width:100%; }
        .acg-pagebreak{ page-break-after:always; }
        .acg-grid{ display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:6mm; height:281mm; }
        .acg-card{ border:1.6px solid #1b2a52; border-radius:6px; padding:3mm 3.5mm; display:flex; flex-direction:column; page-break-inside:avoid; background:linear-gradient(180deg,#fbfbff 0%,#fff 26%); }
        .acg-head{ display:flex; align-items:center; gap:2.5mm; border-bottom:1.4px solid #1b2a52; padding-bottom:2mm; margin-bottom:2mm; }
        .acg-logo{ width:9mm; height:9mm; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .acg-head-text{ flex:1; min-width:0; }
        .acg-school{ font-weight:800; font-size:9px; color:#1b2a52; line-height:1.15; }
        .acg-cardtitle{ font-size:6.6px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:#d11073; margin-top:0.6mm; }
        .acg-photo{ width:12mm; height:14mm; border:1px solid #999; font-size:8px; font-weight:700; color:#999; display:flex; align-items:center; justify-content:center; text-align:center; background:#f7f7f7; overflow:hidden; flex-shrink:0; }
        .acg-photo img{ width:100%; height:100%; object-fit:cover; }
        .acg-examline{ font-size:7px; font-weight:700; color:#333; background:#eef0f4; border-radius:3px; padding:1mm 2mm; margin-bottom:2mm; }
        .acg-info{ width:100%; font-size:7.6px; border-collapse:collapse; margin-bottom:2mm; }
        .acg-info td{ padding:0.8px 0; }
        .acg-info td:first-child{ color:#666; width:42%; }
        .acg-info td:last-child{ font-weight:700; }
        .acg-subjcount{ font-size:6.2px; color:#666; line-height:1.3; margin-bottom:auto; }
        .acg-footnote{ font-size:6px; color:#d11073; font-weight:700; margin-top:1.5mm; }
        .acg-signrow{ display:flex; justify-content:space-between; gap:4mm; margin-top:3mm; }
        .acg-sign{ flex:1; border-top:1px solid #555; text-align:center; font-size:6px; color:#666; padding-top:1mm; }
        .acg-sign-auto img{ display:block; max-width:100%; max-height:6mm; margin:0 auto 0.5mm; }
    `;
    return { html, css };
  }

  // --- Layout: Full Board-Style — one full A4 page per candidate ---
  function buildAdmitCardsFull(ctx){
    const { exam, subjects, list, logoSrc, examPeriod, roomMap, principalSig, cardTitle, instructions, tmpl } = ctx;
    const pageHtml = (s, isLast) => {
      const ht = getHallTicket(admitCardsExamId, s.id);
      const roomInfo = roomMap[s.id];
      return `
      <div class="acf-page${!isLast ? ' acf-pagebreak' : ''}">
        <div class="acf-sheet">
          <div class="acf-header">
            <img class="acf-logo" src="${logoSrc}">
            <div class="acf-head-text">
              <div class="acf-school">${schoolInfo.name}</div>
              <div class="acf-addr">${schoolInfo.address||''}</div>
              ${brandLineHtml({ size:'11px', align:'left', margin:'2px 0 0' })}
            </div>
          </div>
          <div class="acf-title">${cardTitle}</div>
          <div class="acf-examname">${exam.name} &nbsp;·&nbsp; ${examPeriod}</div>
          <div class="acf-body">
            <table class="acf-info">
              <tr><td>Candidate Name</td><td>${s.lastName} ${s.firstName}</td></tr>
              <tr><td>Admission No.</td><td>${s.admissionNo}</td></tr>
              <tr><td>Class &amp; Section</td><td>${s.className} — ${s.section}</td></tr>
              <tr><td>Roll No.</td><td>${s.rollNo||'—'}</td></tr>
              <tr><td>Hall Ticket No.</td><td>${ht&&ht.htNumber?ht.htNumber:'—'}</td></tr>
              <tr><td>Room / Seat</td><td>${roomInfo?(roomInfo.room+(roomInfo.seat?(' / Seat '+roomInfo.seat):'')):'—'}</td></tr>
            </table>
            <div class="acf-photo-slot">${s.photo ? `<img src="${s.photo}">` : initials(s)}</div>
          </div>
          <div class="acf-subj-title">SUBJECT-WISE SCHEDULE</div>
          <table class="acf-subj-table">
            <thead><tr><th>Subject</th><th>Date</th>${subjects.some(x => acTimeText(x, exam, list[0].className)) ? '<th>Time</th>' : ''}<th>Max Marks</th><th>Invigilator's Signature</th></tr></thead>
            <tbody>
            ${subjects.map(sub => `<tr><td>${sub.name}</td><td>${sub.date||'TBA'}</td>${subjects.some(x => acTimeText(x, exam, list[0].className)) ? `<td>${acTimeText(sub, exam, list[0].className) || '—'}</td>` : ''}<td>${sub.maxMarks||''}</td><td>&nbsp;</td></tr>`).join('')}
            </tbody>
          </table>
          ${instructions.length ? `
          <div class="acf-instr-title">CANDIDATE INSTRUCTIONS</div>
          <ol class="acf-instr">${instructions.map(l => `<li>${l}</li>`).join('')}</ol>
          ` : ''}
          <div class="acf-signrow">
            <div class="acf-sign">Student's Signature</div>
            <div class="acf-sign acf-sign-auto">${principalSig ? `<img src="${principalSig}">` : ''}Principal / Correspondent</div>
          </div>
          ${tmpl.footerNote ? `<div class="acf-footnote">${tmpl.footerNote}</div>` : ''}
        </div>
      </div>
      `;
    };
    const html = list.map((s,i) => pageHtml(s, i===list.length-1)).join('');
    const css = `
        .acf-page{ width:100%; }
        .acf-pagebreak{ page-break-after:always; }
        .acf-sheet{ border:1.6px solid #1b2a52; border-radius:4px; padding:8mm 10mm; min-height:281mm; }
        .acf-header{ display:flex; align-items:center; gap:4mm; border-bottom:2px solid #1b2a52; padding-bottom:3mm; margin-bottom:3mm; }
        .acf-logo{ width:16mm; height:16mm; border-radius:50%; object-fit:cover; flex-shrink:0; }
        .acf-school{ font-weight:800; font-size:16px; color:#1b2a52; }
        .acf-addr{ font-size:9px; color:#666; margin-top:1mm; }
        .acf-title{ text-align:center; font-size:14px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:#d11073; margin-top:2mm; }
        .acf-examname{ text-align:center; font-size:10px; font-weight:700; color:#333; margin-top:1mm; margin-bottom:5mm; }
        .acf-body{ display:flex; gap:8mm; align-items:flex-start; margin-bottom:6mm; }
        .acf-info{ flex:1; font-size:10.5px; border-collapse:collapse; }
        .acf-info td{ padding:2mm 0; border-bottom:1px dotted #ddd; }
        .acf-info td:first-child{ color:#666; width:40%; }
        .acf-info td:last-child{ font-weight:700; }
        .acf-photo-slot{ width:30mm; height:36mm; border:1.4px solid #999; font-size:11px; font-weight:700; color:#999; display:flex; align-items:center; justify-content:center; text-align:center; background:#f7f7f7; overflow:hidden; flex-shrink:0; }
        .acf-photo-slot img{ width:100%; height:100%; object-fit:cover; }
        .acf-subj-title, .acf-instr-title{ font-size:10px; font-weight:700; color:#1b2a52; letter-spacing:.04em; margin-bottom:2mm; border-left:3px solid #d11073; padding-left:2mm; }
        .acf-subj-table{ width:100%; border-collapse:collapse; font-size:9.5px; margin-bottom:6mm; }
        .acf-subj-table th{ text-align:left; background:#eef0f4; padding:2mm 3mm; border:1px solid #ccc; }
        .acf-subj-table td{ padding:2.6mm 3mm; border:1px solid #ccc; }
        .acf-instr{ font-size:9px; color:#333; line-height:1.6; margin:0 0 6mm 4mm; padding:0; }
        .acf-signrow{ display:flex; justify-content:space-between; gap:12mm; margin-top:14mm; }
        .acf-sign{ flex:1; border-top:1px solid #555; text-align:center; font-size:9px; color:#666; padding-top:2mm; }
        .acf-sign-auto img{ display:block; max-width:100%; max-height:10mm; margin:0 auto 1mm; }
        .acf-footnote{ text-align:center; font-size:8px; color:#d11073; font-weight:700; margin-top:4mm; }
    `;
    return { html, css };
  }

  /* --- Tab: Consolidated Report (whole-year, all exams) --- */
  let csCurrentStudentId = '', csSearchDebounce = null;

  let csSelectedGroupId = '';
  function renderConsolidatedTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        Pulls together exams side by side, with a final consolidated percentage and grade using the <a onclick="switchResultTab('grading')" style="color:var(--magenta); cursor:pointer; font-weight:600;">Grading scheme</a>. Choose a <a onclick="switchResultTab('examtemplates')" style="color:var(--magenta); cursor:pointer; font-weight:600;">Report Period</a> to combine just a subset — like two Unit Tests — or leave it on "All Exams" for the full year-end view.
      </p>
      <div class="ms-toolbar">
        <div class="ms-toolbar-left">
          <div class="search-wrap">
            <input class="input" id="csSearch" placeholder="Search student by name..." autocomplete="off" oninput="onCsSearchInput()" onblur="setTimeout(hideCsSuggestions,150)" onfocus="onCsSearchInput()">
            <div class="search-suggestions" id="csSearchSuggestions"></div>
          </div>
          <select id="csGroupSelect" onchange="onCsGroupChange()">
            <option value="">All Exams (Full Year)</option>
            ${examGroups.map(g => `<option value="${g.id}" ${csSelectedGroupId===g.id?'selected':''}>${g.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="csResult"><div class="empty-state"><b>Search for a student</b>Pick a student above to see their consolidated results.</div></div>
    `;
  }