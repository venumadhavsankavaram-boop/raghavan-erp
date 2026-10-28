/* ============================================================================
   Student Bulk Import v2 — duplicate-proof, plain-language
   ----------------------------------------------------------------------------
   Loads right after 26-student-parent-portal-tabs.js and upgrades the Students
   import. Staff import keeps using the original wizard untouched.

   Why this exists: the first wizard only matched on an EXACT admission number
   (or an exact name + class + section when the number was blank), only warned
   about repeated rows inside the same file, and numbered new students with
   "students.length + 1" which collides after any deletion. Re-uploading a
   register therefore created many duplicate students.

   What it does now:
   1. Recognises the same student even when the sheet is written differently:
      admission no. (RGV2026-005 = rgv2026005 = RGV2026-5), names in any case or
      order, extra spaces/dots, and DD/MM/YYYY vs YYYY-MM-DD dates.
   2. Matching ladder, strongest first:
        Admission no.            -> "Update"   (same student, fill in details)
        Name + date of birth     -> "Update"
        Name + class + phone     -> "Update"
        Name + class (+section)  -> "Check"    (probably same, you decide)
   3. Repeated rows inside the same file are caught and skipped.
   4. Every row ends as New / Update / Skip. "Check" rows default to Skip and
      have a dropdown so nothing is created by accident.
   5. Just before saving, everything is re-checked against the latest student
      list, so a double click or a second upload cannot create copies.
   6. Brand-new students get an admission number that is guaranteed unused.
   7. A step-4 summary and an Excel "Import Report" show what happened per row.
   ========================================================================== */
(function(){
  const _orig = {
    step1: window.renderImportWizardStep1,
    step3: window.renderImportWizardStep3,
    validate: window.validateImportWizardRows,
    commit: window.commitImportWizard,
    template: window.downloadImportWizardTemplate,
    filter: window.setImportWizardFilter,
    errReport: window.downloadImportWizardErrorReport,
  };
  const isStu = () => importWizard && importWizard.entity === 'students';
  const esc = v => (typeof escapeHtml === 'function' ? escapeHtml(v == null ? '' : String(v)) : String(v == null ? '' : v));

  // ---------- normalisers ----------
  function admKey(v){
    // lowercase, drop punctuation, drop leading zeros inside digit runs
    return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/\d+/g, d => String(parseInt(d, 10)));
  }
  function nameKey(first, last){
    const t = (String(first || '') + ' ' + String(last || '')).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    return t.sort().join(' ');
  }
  function dobKey(v){
    if(!v) return '';
    if(v instanceof Date) return isNaN(v) ? '' : v.toISOString().slice(0, 10);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if(m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if(m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return '';
  }
  function phoneKeys(o){
    return [o.fatherPhone, o.motherPhone, o.contact].map(p => String(p || '').replace(/\D/g, '').slice(-10)).filter(p => p.length === 10);
  }
  const clsKey = v => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const secKey = v => String(v || '').trim().toLowerCase();
  const isDeleted = s => !!(s && (s.deleted || s.isDeleted || s.deletedAt));

  // ---------- index of existing students ----------
  function buildIndex(){
    const idx = { byAdm: new Map(), byNameDob: new Map(), byName: new Map(), adm: new Set() };
    (students || []).forEach(s => {
      if(isDeleted(s)) return;
      const ak = admKey(s.admissionNo);
      if(ak){ idx.adm.add(ak); if(!idx.byAdm.has(ak)) idx.byAdm.set(ak, s); }
      const nk = nameKey(s.firstName, s.lastName);
      if(!nk) return;
      if(!idx.byName.has(nk)) idx.byName.set(nk, []);
      idx.byName.get(nk).push(s);
      const dk = dobKey(s.dob);
      if(dk){ const k = nk + '|' + dk; if(!idx.byNameDob.has(k)) idx.byNameDob.set(k, s); }
    });
    return idx;
  }

  // Returns { level:'exact'|'strong'|'possible'|'conflict'|null, rec, why }
  function matchStudent(f, idx){
    const ak = admKey(f.admissionNo);
    const nk = nameKey(f.firstName, f.lastName);
    const dk = dobKey(f.dob);
    const byName = nk ? (idx.byName.get(nk) || []) : [];
    if(ak && idx.byAdm.has(ak)){
      const rec = idx.byAdm.get(ak);
      const sameName = nameKey(rec.firstName, rec.lastName) === nk;
      if(sameName || !nk) return { level: 'exact', rec, why: `Admission no. ${rec.admissionNo} already belongs to ${rec.name || ''}` };
      // same number but a different person -> never overwrite silently
      return { level: 'conflict', rec, why: `Admission no. ${rec.admissionNo} already belongs to a different student (${rec.name || ''}, ${rec.className || ''}-${rec.section || ''})` };
    }
    if(nk && dk){
      const rec = idx.byNameDob.get(nk + '|' + dk);
      if(rec) return { level: 'strong', rec, why: `Same name and date of birth as ${rec.admissionNo || 'an existing student'} (${rec.className || ''}-${rec.section || ''})` };
    }
    const ph = phoneKeys(f);
    for(const rec of byName){
      if(clsKey(rec.className) === clsKey(f.className) && ph.length && phoneKeys(rec).some(p => ph.includes(p))){
        return { level: 'strong', rec, why: `Same name, class and phone as ${rec.admissionNo || 'an existing student'}` };
      }
    }
    for(const rec of byName){
      const rd = dobKey(rec.dob);
      if(dk && rd && dk !== rd) continue; // clearly a different child
      if(clsKey(rec.className) === clsKey(f.className) && (!f.section || !rec.section || secKey(rec.section) === secKey(f.section))){
        return { level: 'possible', rec, why: `Looks like ${rec.name || ''} (${rec.admissionNo || 'no adm no.'}, ${rec.className || ''}-${rec.section || ''}) already in the ERP` };
      }
    }
    if(ak){
      // admission number is new but the same person exists under another number
      const rec = byName.find(r => dk && dobKey(r.dob) === dk);
      if(rec) return { level: 'conflict', rec, why: `Admission no. is new but ${rec.name || ''} already exists as ${rec.admissionNo}` };
    }
    return { level: null };
  }

  // ---------- unique admission numbers ----------
  function prefixInfo(){
    // keep whatever pattern this school already uses: PREFIX + YEAR + '-' + NNN
    const year = new Date().getFullYear();
    let prefix = 'RGV';
    const sample = (students || []).map(s => String(s.admissionNo || '')).find(a => /^[A-Za-z]+\d{4}-\d+$/.test(a));
    if(sample){ const m = sample.match(/^([A-Za-z]+)/); if(m) prefix = m[1]; }
    return { prefix, year };
  }
  function makeAdmissionGenerator(extraTaken){
    const { prefix, year } = prefixInfo();
    const taken = new Set();
    (students || []).forEach(s => { const k = admKey(s.admissionNo); if(k) taken.add(k); });
    (extraTaken || []).forEach(k => taken.add(k));
    let max = 0;
    const re = new RegExp('^' + prefix + year + '-?(\\d+)$', 'i');
    (students || []).forEach(s => { const m = String(s.admissionNo || '').match(re); if(m) max = Math.max(max, parseInt(m[1], 10)); });
    let n = Math.max(max, 0);
    return function next(){
      let v;
      do { n++; v = prefix + year + '-' + String(n).padStart(3, '0'); } while(taken.has(admKey(v)));
      taken.add(admKey(v));
      return v;
    };
  }
  // Also fixes "Add student" screen and anything else that calls it.
  window.nextAdmissionNo = function(){ return makeAdmissionGenerator()(); };

  // ---------- validation (students only) ----------
  window.validateImportWizardRows = function(){
    _orig.validate();
    if(!isStu()) return;
    const idx = buildIndex();
    const admCol = importWizard.mapping.admissionNo;
    const seen = { adm: new Map(), nameDob: new Map(), nameCls: new Map() };
    importWizard.validated.forEach((r, i) => {
      r.action = 'skip'; r.note = '';
      if(admCol && importWizard.rawRows[i][admCol] instanceof Date && r.status !== 'error'){
        r.errors.push('Admission No looks like a date (Excel changed it). Format that column as Text and re-type it, or leave it blank.'); r.status = 'error';
      } r.level = null; r.dupOf = null;
      if(r.status === 'error'){ r.action = 'error'; return; }
      const f = r.fields;
      const ak = admKey(f.admissionNo), nk = nameKey(f.firstName, f.lastName), dk = dobKey(f.dob);
      // 1. repeated inside the file
      let prev = null;
      if(ak && seen.adm.has(ak)) prev = seen.adm.get(ak);
      else if(nk && dk && seen.nameDob.has(nk + '|' + dk)) prev = seen.nameDob.get(nk + '|' + dk);
      else if(nk && !dk && seen.nameCls.has(nk + '|' + clsKey(f.className) + '|' + secKey(f.section))) prev = seen.nameCls.get(nk + '|' + clsKey(f.className) + '|' + secKey(f.section));
      if(prev){
        r.status = 'dupfile'; r.action = 'skip'; r.dupOf = prev;
        r.note = `Same student as row ${prev} of this file — skipped.`;
        r.warnings = [];
        return;
      }
      if(ak) seen.adm.set(ak, r.rowNum);
      if(nk && dk) seen.nameDob.set(nk + '|' + dk, r.rowNum);
      if(nk) seen.nameCls.set(nk + '|' + clsKey(f.className) + '|' + secKey(f.section), r.rowNum);
      // 2. against students already in the ERP
      const m = matchStudent(f, idx);
      r.level = m.level;
      r.existingId = null;
      if(m.level === 'exact' || m.level === 'strong'){
        r.status = 'update'; r.action = 'update'; r.existingId = m.rec.id; r.note = m.why + ' — details will be filled in, nothing is overwritten with blanks.';
      } else if(m.level === 'possible' || m.level === 'conflict'){
        r.status = 'review'; r.action = 'skip'; r.candidateId = m.rec.id; r.note = m.why + '. Choose what to do.';
      } else {
        r.status = 'new'; r.action = 'new';
      }
      if(r.status === 'new'){ /* admission no. checked at commit */ }
    });
  };


  // ---------- duplicate finder / cleanup (same rules as the server) ----------
  // A duplicate = same name (any order/case) in the same class, unless both
  // have different known dates of birth. Different class = different child.
  function dupGroups(){
    const groups = [];
    (students || []).forEach(s => {
      if(isDeleted(s)) return;
      const nk = nameKey(s.firstName, s.lastName);
      if(!nk) return;
      const g = groups.find(grp => grp.some(o => {
        if(s.admissionNo && o.admissionNo && admKey(o.admissionNo) === admKey(s.admissionNo)) return nameKey(o.firstName, o.lastName) === nk;
        if(nameKey(o.firstName, o.lastName) !== nk) return false;
        const a = dobKey(o.dob), b = dobKey(s.dob);
        if(a && b && a !== b) return false;
        return clsKey(o.className) === clsKey(s.className);
      }));
      if(g) g.push(s); else groups.push([s]);
    });
    return groups.filter(g => g.length > 1);
  }
  window.renderDuplicatesModal = function(){
    const groups = dupGroups();
    const body = document.getElementById('duplicatesModalBody');
    const bulkBtn = document.getElementById('deleteAllDuplicatesBtn');
    if(bulkBtn) bulkBtn.style.display = (isManagementUser() && groups.length > 0) ? 'inline-flex' : 'none';
    if(!groups.length){
      body.innerHTML = '<div class="empty-state"><b>No duplicates found</b>No two students share the same name in the same class.</div>';
      return;
    }
    body.innerHTML = `<p style="font-size:0.8rem;color:var(--ink-soft);margin:0 0 14px;">Same name in the same class is treated as a copy. Students with the same name in different classes are <b>not</b> listed. When copies are removed, the one that has fee receipts is kept.</p>` +
      groups.map(group => `
      <div style="margin-bottom:18px;">
        <div style="font-weight:700; color:var(--navy); margin-bottom:8px;">${esc(group[0].firstName)} ${esc(group[0].lastName)} <span style="font-weight:400; color:var(--ink-soft); font-size:0.78rem;">(${group.length} records)</span></div>
        ${group.map(s => `
          <div class="list-manage-row">
            <div style="font-size:0.82rem;">
              <div class="lm-name">${esc(s.admissionNo)} · ${esc(s.className)} — ${esc(s.section)}</div>
              <div class="lm-meta">Father: ${esc(s.fatherName || '—')} · Phone: ${esc(s.fatherPhone || s.motherPhone || '—')} · DOB: ${esc(s.dob || '—')} · Status: ${esc(s.status || 'Active')}</div>
            </div>
            <div style="display:flex; gap:10px;">
              <button class="btn-edit-text" onclick="closeDuplicatesModal(); editStudent('${s.id}');">View / Edit</button>
              <button class="btn-danger-text" onclick="deleteDuplicateEntry('${s.id}')">Request Deletion</button>
            </div>
          </div>`).join('')}
      </div>`).join('');
  };
  window.deleteAllDuplicates = async function(){
    const groups = dupGroups();
    const extra = groups.reduce((n, g) => n + g.length - 1, 0);
    if(!extra){ showToast('No duplicates to delete.'); return; }
    const preview = groups.slice(0, 8).map(g => `${g[0].firstName} ${g[0].lastName} (${g.length} records)`).join('\n');
    const more = groups.length > 8 ? `\n…and ${groups.length - 8} more.` : '';
    const msg = `Remove ${extra} duplicate record(s) across ${groups.length} student(s)?\n\n${preview}${more}\n\nThe copy that has fee receipts is kept (otherwise the earliest added). Copies are only moved to Recently Deleted and can be restored. If two copies both have receipts they are left alone for you to merge.`;
    if(!await showConfirmDialog(msg, { title: 'Delete duplicate students?', okText: 'Delete Duplicates' })) return;
    try{
      const res = await throwIfNotOk(await fetch('/api/students?action=delete-duplicates', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, actorHeaders()), body: '{}' }));
      const result = await res.json();
      await loadStudents();
      renderDuplicatesModal();
      const manual = (result.needsManualMerge || []).length;
      showToast(`Removed ${result.deletedCount} duplicate record(s).` + (manual ? ` ${manual} more have fee receipts on both copies — please merge those by hand.` : ''));
    }catch(e){
      if(e.message !== 'SESSION_EXPIRED') showToast('Could not delete duplicates (' + e.message + ').');
    }
  };

  // ---------- file reading ----------
  // CSV: keep every cell as typed text. Otherwise "2026-004" or "5/12" is turned into
  // a date by the spreadsheet reader and the real admission number is lost.
  window.handleImportWizardFile = async function(e){
    if(!(await ensureXLSX())){ e.target.value = ''; return; }
    const file = e.target.files[0];
    if(!file) return;
    const nameEl = document.getElementById('importWizardFileName');
    const fail = m => { showToast(m); if(nameEl) nameEl.textContent = ''; };
    if(nameEl) nameEl.textContent = 'Reading ' + file.name + '...';
    const isCsv = /\.csv$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const wb = XLSX.read(new Uint8Array(evt.target.result), isCsv ? { type: 'array', raw: true } : { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames.find(n => !/^read ?me$/i.test(n)) || wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: isCsv ? true : undefined })
          .filter(r => Object.values(r).some(v => String(v == null ? '' : v).trim() !== '')
            && !/^\*\s*=\s*required|^tip:/i.test(String(Object.values(r)[0] || '').trim()));
        if(rows.length === 0) return fail('No rows found in that file.');
        if(rows.length > 5000) return fail(`That file has ${rows.length} rows — please split it into batches of 5,000 or fewer.`);
        const headers = Object.keys(rows[0]);
        const seen = new Set(); const dupes = [];
        headers.forEach(h => { const n = h.trim().toLowerCase(); if(n && seen.has(n)) dupes.push(h); else seen.add(n); });
        if(dupes.length) return fail('Your file has duplicate column headers (' + dupes.join(', ') + ') — please fix and re-upload.');
        importWizard.headers = headers;
        importWizard.rawRows = rows;
        importWizard.mapping = autoMapImportColumns(importWizard.entity, headers);
        importWizard.fileName = file.name;
        renderImportWizardStep2();
      }catch(err){
        fail('Could not read this file. Please use an .xlsx file (e.g. the template).');
      }
    };
    reader.onerror = function(){ showToast('Could not read the selected file.'); };
    reader.readAsArrayBuffer(file);
  };

  // ---------- step 1 note, template ----------
  window.renderImportWizardStep1 = function(){
    _orig.step1();
    if(!isStu()) return;
    const box = document.querySelector('#importWizardBody .modal-actions');
    if(!box) return;
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:12px;background:#eef6ff;color:#0d3b66;font-size:0.8rem;line-height:1.5;';
    note.innerHTML = '<b>Safe to upload the same sheet again.</b> Students already in the ERP are recognised (by admission no., or name + date of birth, or name + class + phone) and are <b>updated, never added twice</b>. Leave <i>Admission No</i> blank for brand-new students — we will give each one a fresh number.';
    box.parentNode.insertBefore(note, box);
  };

  window.downloadImportWizardTemplate = async function(){
    if(!isStu()) return _orig.template();
    if(!(await ensureXLSX())) return;
    const cfg = IMPORT_FIELD_DEFS.students;
    const headers = cfg.fields.map(f => f.label + (f.required ? ' *' : ''));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...cfg.sampleRows]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(14, h.length + 2) }));
    const help = XLSX.utils.aoa_to_sheet([
      ['HOW TO USE THIS TEMPLATE'],
      [''],
      ['1. Fill one row per student on the "Students" sheet. Delete the two sample rows first.'],
      ['2. Columns marked * are required: First Name, Last Name, Class, Section.'],
      ['3. NEW students: leave "Admission No" blank. The ERP gives each a unique number.'],
      ['4. EXISTING students (to add phone numbers, DOB, etc.): you may leave Admission No blank too — they are found by name + date of birth.'],
      ['   Filling Date of Birth makes matching most reliable. Blank cells never erase data already saved.'],
      ['5. Dates: DD/MM/YYYY or YYYY-MM-DD. Phones: 10 digits. Class: e.g. "5th Class" or "V STD" — it is converted.'],
      ['6. Upload the file in Bulk Import. Check the preview, then Import. Uploading the same file twice is safe: nobody is added twice.'],
      ['7. Rows marked "Check" in the preview look like students already present. Pick Skip, Update or Create new for each.'],
    ]);
    help['!cols'] = [{ wch: 120 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.utils.book_append_sheet(wb, help, 'Read me');
    XLSX.writeFile(wb, `${slugifySchoolName()}_students_import_template.xlsx`);
    showToast('Template downloaded — fill it in, then upload it right here in the same window.');
  };

  // ---------- step 3 ----------
  function counts(){
    const c = { new: 0, update: 0, skip: 0, review: 0, error: 0, dupfile: 0, create: 0 };
    importWizard.validated.forEach(r => {
      if(r.status === 'error') c.error++;
      else if(r.status === 'dupfile') c.dupfile++;
      if(r.status === 'review') c.review++;
      if(r.action === 'new') c.new++;
      else if(r.action === 'update') c.update++;
      else if(r.action === 'skip' && r.status !== 'error') c.skip++;
    });
    return c;
  }
  window.setImportRowAction = function(rowNum, action){
    const r = importWizard.validated.find(x => x.rowNum === rowNum);
    if(!r) return;
    r.action = action;
    if(action === 'update'){ r.existingId = r.candidateId; }
    else r.existingId = null;
    renderImportWizardStep3();
  };
  window.setAllImportReview = function(action){
    importWizard.validated.forEach(r => { if(r.status === 'review'){ r.action = action; r.existingId = action === 'update' ? r.candidateId : null; } });
    renderImportWizardStep3();
  };
  window.setImportWizardFilter = function(f){ importWizard.filter = f; renderImportWizardStep3(); };

  function badge(r){
    const b = (t, bg, c) => `<span style="background:${bg};color:${c};padding:3px 9px;border-radius:12px;font-weight:700;font-size:0.72rem;white-space:nowrap;">${t}</span>`;
    if(r.status === 'error') return b('Error', '#fdecea', '#b3261e');
    if(r.status === 'dupfile') return b('Repeated in file', '#eee', '#555');
    if(r.status === 'review') return b('Check', '#fff3e0', '#8a5300');
    if(r.action === 'update') return b('Update', '#e3f2fd', '#0d47a1');
    return b('New', '#e8f5e9', '#1b5e20');
  }

  window.renderImportWizardStep3 = function(){
    if(!isStu()) return _orig.step3();
    importWizard.step = 3;
    renderImportWizardSteps();
    const rows = importWizard.validated;
    const c = counts();
    document.getElementById('importWizardSub').textContent = 'Step 3 of 4 — review the rows below. Nothing is saved until you click Import.';
    const filter = importWizard.filter || 'all';
    const match = r => filter === 'all' ? true : filter === 'review' ? r.status === 'review' : filter === 'dupfile' ? r.status === 'dupfile' : filter === 'error' ? r.status === 'error' : (filter === 'new' ? r.action === 'new' : filter === 'update' ? r.action === 'update' : true);
    const filtered = rows.filter(match);
    const visible = filtered.slice(0, 300);
    const pill = (n, t, bg, col) => `<span class="pill" style="background:${bg};color:${col};">${n} ${t}</span>`;
    const tabs = [['all', 'All'], ['new', 'New'], ['update', 'Update'], ['review', 'Check'], ['dupfile', 'Repeated'], ['error', 'Errors']];
    const sel = r => r.status === 'review'
      ? `<select onchange="setImportRowAction(${r.rowNum}, this.value)" style="padding:4px 6px;border-radius:8px;border:1.5px solid var(--border);font-size:0.75rem;">
           <option value="skip" ${r.action === 'skip' ? 'selected' : ''}>Skip (don't import)</option>
           <option value="update" ${r.action === 'update' ? 'selected' : ''}>Update existing</option>
           <option value="new" ${r.action === 'new' ? 'selected' : ''}>Create as new student</option>
         </select>`
      : (r.action === 'new' ? 'Add' : r.action === 'update' ? 'Update' : 'Skip');
    document.getElementById('importWizardBody').innerHTML = `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        ${pill(c.new, 'will be added', '#e8f5e9', '#1b5e20')}
        ${pill(c.update, 'will be updated', '#e3f2fd', '#0d47a1')}
        ${pill(c.review, 'to check', '#fff3e0', '#8a5300')}
        ${pill(c.dupfile, 'repeated in file', '#eee', '#555')}
        ${pill(c.error, 'with errors', '#fdecea', '#b3261e')}
      </div>
      ${c.review ? `<div style="margin-bottom:12px;padding:10px 12px;border-radius:10px;background:#fff8e1;font-size:0.8rem;">
        <b>${c.review} row(s) look like students already in the ERP.</b> They are set to <b>Skip</b> so nobody is added twice. Change a row only if you are sure.
        <button type="button" class="btn btn-ghost btn-sm" onclick="setAllImportReview('update')">Update all ${c.review}</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="setAllImportReview('skip')">Skip all ${c.review}</button></div>` : ''}
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        ${tabs.map(([k, l]) => `<button type="button" class="btn btn-ghost btn-sm" style="${filter === k ? 'border-color:var(--teal);border-width:2px;' : ''}" onclick="setImportWizardFilter('${k}')">${l}</button>`).join('')}
        <button type="button" class="btn btn-ghost btn-sm" onclick="downloadImportReport()">📥 Download preview as Excel</button>
      </div>
      <div style="max-height:380px;overflow:auto;border:1px solid var(--border);border-radius:10px;">
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
          <thead><tr style="background:var(--cream);position:sticky;top:0;">
            <th style="padding:8px;text-align:left;">Row</th><th style="padding:8px;text-align:left;">Result</th>
            <th style="padding:8px;text-align:left;">Name</th><th style="padding:8px;text-align:left;">Class</th>
            <th style="padding:8px;text-align:left;">Adm No</th><th style="padding:8px;text-align:left;">Action</th>
            <th style="padding:8px;text-align:left;">Notes</th></tr></thead>
          <tbody>${visible.map(r => `
            <tr style="border-top:1px solid var(--border);">
              <td style="padding:7px;">${r.rowNum}</td>
              <td style="padding:7px;">${badge(r)}</td>
              <td style="padding:7px;">${esc((r.fields.firstName || '') + ' ' + (r.fields.lastName || '')) || '—'}</td>
              <td style="padding:7px;">${esc((r.fields.className || '') + (r.fields.section ? '-' + r.fields.section : '')) || '—'}</td>
              <td style="padding:7px;">${esc(r.fields.admissionNo) || '<i style="color:#888">auto</i>'}</td>
              <td style="padding:7px;">${sel(r)}</td>
              <td style="padding:7px;color:${r.errors.length ? '#b3261e' : '#6b5200'};">${esc([...r.errors, r.note, ...r.warnings].filter(Boolean).join(' · ')) || '—'}</td>
            </tr>`).join('')}</tbody>
        </table>
        ${filtered.length > visible.length ? `<p style="padding:8px;margin:0;color:var(--ink-soft);font-size:0.76rem;">Showing first ${visible.length} of ${filtered.length} rows — use Download to see all.</p>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="renderImportWizardStep2()">Back</button>
        <button type="button" class="btn btn-primary" onclick="commitImportWizard()" ${c.new + c.update === 0 ? 'disabled' : ''}>Import ${c.new + c.update} (${c.new} new, ${c.update} updated)</button>
      </div>`;
  };

  // ---------- reports ----------
  async function exportRows(kind){
    if(!(await ensureXLSX())) return;
    const cfg = IMPORT_FIELD_DEFS.students;
    const lab = { new: 'Added', update: 'Updated', skip: 'Skipped', error: 'Not imported (error)', blocked: 'Skipped — already exists' };
    const out = importWizard.validated.map(r => {
      let res = r.outcome || (r.status === 'error' ? 'error' : r.action === 'new' ? 'new' : r.action === 'update' ? 'update' : 'skip');
      const o = { 'Row #': r.rowNum, 'Result': lab[res] || res, 'Admission No (final)': r.finalAdm || r.fields.admissionNo || '' };
      cfg.fields.forEach(f => { if(f.key !== 'admissionNo') o[f.label] = r.fields[f.key] || ''; });
      o['Notes'] = [...r.errors, r.note, ...r.warnings].filter(Boolean).join(' | ');
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(out), 'Import');
    XLSX.writeFile(wb, `${slugifySchoolName()}_students_import_${kind}.xlsx`);
  }
  window.downloadImportReport = () => exportRows(importWizard && importWizard.done ? 'report' : 'preview');
  window.downloadImportWizardErrorReport = function(){ return isStu() ? exportRows('issues') : _orig.errReport(); };

  // ---------- commit ----------
  window.commitImportWizard = async function(){
    if(!isStu()) return _orig.commit();
    if(importWizard.committing) return;
    const cfg = IMPORT_FIELD_DEFS.students;
    const todo = importWizard.validated.filter(r => r.action === 'new' || r.action === 'update');
    if(!todo.length){ showToast('Nothing to import.'); return; }
    const ok = await showConfirmDialog(`Save ${todo.length} student record(s) now?`, { title: 'Confirm Import' });
    if(!ok) return;
    importWizard.committing = true;
    try{
      // Re-check against the very latest list so nothing can be added twice.
      const idx = buildIndex();
      const gen = makeAdmissionGenerator();
      const batch = 'IMP-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const stamp = new Date().toISOString();
      const addedKeys = new Set();
      let added = 0, updated = 0, blocked = 0;
      for(const r of todo){
        const f = r.fields;
        if(r.action === 'new'){
          const m = matchStudent(f, idx);
          const nk = nameKey(f.firstName, f.lastName) + '|' + dobKey(f.dob) + '|' + clsKey(f.className) + '|' + secKey(f.section);
          // a "Create as new" choice on a Check row is allowed; automatic rows are not
          const forced = r.status === 'review';
          if(!forced && (m.level === 'exact' || m.level === 'strong' || addedKeys.has(nk))){
            r.outcome = 'blocked'; r.note = 'Skipped at save time — this student already exists (' + (m.why || 'added earlier in this import') + ').'; blocked++; continue;
          }
          const rec = cfg.newRecordDefaults();
          cfg.fields.forEach(x => { if(!x.isMatchKey) rec[x.key] = f[x.key]; });
          let adm = f.admissionNo ? String(f.admissionNo).trim() : '';
          if(!adm || idx.adm.has(admKey(adm))) adm = gen();
          rec.admissionNo = adm; r.finalAdm = adm;
          rec.importBatch = batch; rec.importedAt = stamp;
          cfg.deriveFields(rec);
          students.push(rec);
          idx.adm.add(admKey(adm)); addedKeys.add(nk);
          r.outcome = 'new'; added++;
        } else {
          const existing = students.find(x => x.id === r.existingId);
          if(!existing){ r.outcome = 'skip'; r.note = 'Student no longer exists — skipped.'; continue; }
          r.presentKeys.forEach(k => {
            const fd = cfg.fields.find(x => x.key === k);
            if(fd && fd.isMatchKey) return;
            existing[k] = f[k];
          });
          if(!existing.admissionNo && f.admissionNo) existing.admissionNo = f.admissionNo;
          existing.lastImportBatch = batch;
          cfg.deriveFields(existing);
          r.finalAdm = existing.admissionNo; r.outcome = 'update'; updated++;
        }
      }
      await cfg.afterCommit();
      importWizard.done = { added, updated, blocked, batch };
      renderSummary();
    } finally {
      importWizard.committing = false;
    }
  };

  function renderSummary(){
    importWizard.step = 4;
    renderImportWizardSteps();
    const d = importWizard.done;
    const c = counts();
    const skipped = importWizard.validated.filter(r => r.action === 'skip' && r.status !== 'error').length;
    const errs = importWizard.validated.filter(r => r.status === 'error').length;
    document.getElementById('importWizardSub').textContent = 'Step 4 of 4 — import finished.';
    document.getElementById('importWizardBody').innerHTML = `
      <div style="text-align:center;padding:10px 0 18px;">
        <div style="font-size:2.2rem;">✅</div>
        <h3 style="margin:6px 0 14px;">Import complete</h3>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <span class="pill" style="background:#e8f5e9;color:#1b5e20;">${d.added} students added</span>
          <span class="pill" style="background:#e3f2fd;color:#0d47a1;">${d.updated} updated</span>
          <span class="pill" style="background:#eee;color:#555;">${skipped + d.blocked} skipped (already in ERP / repeated)</span>
          <span class="pill" style="background:#fdecea;color:#b3261e;">${errs} not imported (errors)</span>
        </div>
        <p style="color:var(--ink-soft);font-size:0.8rem;margin-top:14px;">Batch ${esc(d.batch)}. Download the report to see what happened to every row, including the admission numbers given.</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="downloadImportReport()">📥 Download Import Report</button>
        <button type="button" class="btn btn-primary" onclick="closeImportWizard()">Done</button>
      </div>`;
    if(typeof showToast === 'function') showToast(`${d.added} added, ${d.updated} updated.`, 'burst');
  }
})();
