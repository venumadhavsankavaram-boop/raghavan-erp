function toggleMoreActions(){
    document.getElementById('moreActionsMenu').classList.toggle('open');
  }
  document.addEventListener('click', function(e){
    const wrap = document.querySelector('.dropdown-wrap');
    if(wrap && !wrap.contains(e.target)){
      document.getElementById('moreActionsMenu').classList.remove('open');
    }
  });

  function downloadIdCards(){
    const active = students.filter(statusMatches);
    if(active.length===0){ showToast('No students to generate ID cards for.'); return; }
    const w = window.open('', '_blank');
    const cardsHtml = active.map(s => `
      <div style="width:280px; border:2px solid #211A4E; border-radius:14px; padding:16px; display:inline-block; margin:8px; font-family:sans-serif; vertical-align:top;">
        <div style="font-weight:700; color:#211A4E; font-size:13px; margin-bottom:8px;">${schoolInfo.name}</div>
        <div style="display:flex; gap:12px;">
          ${s.photo ? `<img src="${s.photo}" style="width:60px;height:60px;border-radius:8px;object-fit:cover;">` : `<div style="width:60px;height:60px;border-radius:8px;background:#eee;"></div>`}
          <div>
            <div style="font-weight:700;">${s.lastName} ${s.firstName}</div>
            <div style="font-size:12px; color:#555;">${s.className} - Sec ${s.section}</div>
            <div style="font-size:12px; color:#555;">Adm No: ${s.admissionNo}</div>
          </div>
        </div>
      </div>
    `).join('');
    w.document.write('<html><head><title>ID Cards</title></head><body onload="window.print()">' + cardsHtml + '</body></html>');
    w.document.close();
  }

  function showGroupsClubs(){
    const groups = {};
    students.forEach(s => {
      (s.clubs||'').split(',').map(c=>c.trim()).filter(Boolean).forEach(c => {
        groups[c] = groups[c] || [];
        groups[c].push(s.lastName + ' ' + s.firstName);
      });
    });
    const keys = Object.keys(groups);
    let msg = keys.length === 0
      ? 'No groups or clubs assigned yet. Add a "Clubs" note to a student profile (via Edit) to start one.'
      : keys.map(k => k + ': ' + groups[k].length + ' member(s)').join('\n');
    showInfoDialog(msg, {title:'Groups & Clubs'});
    document.getElementById('moreActionsMenu').classList.remove('open');
  }

  async function ensureXLSX(){
    if(typeof XLSX !== 'undefined') return true;
    showToast('Loading Excel support...');
    const ok = await window.__xlsxReady;
    if(!ok || typeof XLSX === 'undefined'){
      showToast('Could not load Excel support — please check your internet connection and try again.');
      return false;
    }
    return true;
  }

  /* --- Generic report export: Excel + PDF, reused across every report screen --- */
  async function exportRowsToExcel(filename, sheetName, rows){
    if(rows.length === 0){ showToast('Nothing to export.'); return; }
    if(!(await ensureXLSX())) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0,31));
    XLSX.writeFile(wb, filename);
  }
  function exportRowsToPDF(title, subtitle, rows){
    if(rows.length === 0){ showToast('Nothing to export.'); return; }
    const logoSrc = document.querySelector('.sb-brand img').src;
    const headers = Object.keys(rows[0]);
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>${title}</title>
      <style>
        @page{ size:A4 landscape; margin:12mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
        .pdf-head{ display:flex; align-items:center; gap:10px; justify-content:center; margin-bottom:4px; }
        .pdf-head img{ width:36px; height:36px; border-radius:50%; }
        .pdf-school{ font-weight:700; font-size:15px; text-align:center; }
        .pdf-title{ text-align:center; font-weight:700; font-size:12px; margin:6px 0 14px; }
        table{ width:100%; border-collapse:collapse; font-size:10.5px; }
        th,td{ border:1px solid #999; padding:5px 7px; text-align:left; }
        th{ background:#211A4E; color:#fff; }
        tr:nth-child(even){ background:#f7f5fa; }
      </style></head>
      <body onload="window.print()">
        <div class="pdf-head"><img src="${logoSrc}"></div>
        <div class="pdf-school">${schoolInfo.name}</div>
        <div class="pdf-title">${title}${subtitle ? ' — '+subtitle : ''}</div>
        <table>
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(r => `<tr>${headers.map(h => `<td>${r[h]!==undefined && r[h]!==null ? r[h] : ''}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body></html>
    `);
    w.document.close();
  }
  function reportExportButtons(excelFn, pdfFn){
    return `<button class="btn btn-ghost btn-sm" onclick="${excelFn}">📥 Excel</button> <button class="btn btn-ghost btn-sm" onclick="${pdfFn}">📄 PDF</button>`;
  }


  async function exportExcel(){
    if(!(await ensureXLSX())) return;
    if(students.length === 0){ showToast('No records to export.'); return; }
    const rows = students.map(s => ({
      'Admission No': s.admissionNo, 'First Name': s.firstName, 'Last Name': s.lastName,
      'Class': s.className, 'Section': s.section, 'Gender': s.gender||'', 'Date of Birth': s.dob||'',
      'Email': s.email||'', 'Date of Joining': s.admDate||'', 'Blood Group': s.blood||'',
      'Caste Category': s.caste||'', 'Caste': s.casteName||'', 'Religion': s.religion||'',
      'Father Name': s.fatherName||'', 'Father Phone': s.fatherPhone||'',
      'Mother Name': s.motherName||'', 'Mother Phone': s.motherPhone||'',
      'Address': s.fatherAddress||s.motherAddress||'', 'Needs Transport': s.needsTransport||'No',
      'Status': s.status||'Active',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(h => ({ wch: Math.max(14, h.length+2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, `${slugifySchoolName()}_students.xlsx`);
    document.getElementById('moreActionsMenu').classList.remove('open');
  }

  function exportStudentsPDF(){
    if(students.length === 0){ showToast('No records to export.'); return; }
    const rows = students.map(s => `
      <tr>
        <td>${s.admissionNo}</td><td>${s.lastName} ${s.firstName}</td><td>${s.className}</td><td>${s.section}</td>
        <td>${s.gender||'—'}</td><td>${s.fatherName||'—'}</td><td>${s.fatherPhone||s.motherPhone||'—'}</td><td>${s.status||'Active'}</td>
      </tr>`).join('');
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Student List</title>
      <style>
        @page{ size:A4 landscape; margin:12mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; }
        h2{ text-align:center; margin-bottom:2px; }
        p.sub{ text-align:center; color:#555; font-size:11px; margin-top:0; margin-bottom:16px; }
        table{ width:100%; border-collapse:collapse; font-size:11px; }
        th,td{ border:1px solid #999; padding:5px 7px; text-align:left; }
        th{ background:#211A4E; color:#fff; }
        tr:nth-child(even){ background:#f6f6f6; }
      </style></head>
      <body onload="window.print()">
        <h2>${schoolInfo.name} — Student List</h2>
        <p class="sub">Generated ${new Date().toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})} · ${students.length} student(s)</p>
        <table>
          <thead><tr><th>Admission No</th><th>Name</th><th>Class</th><th>Sec</th><th>Gender</th><th>Father Name</th><th>Contact</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body></html>
    `);
    w.document.close();
    document.getElementById('moreActionsMenu').classList.remove('open');
  }

  // ============================================================================
  // Bulk Import Wizard (Students & Staff) — first-time data dumping
  // ----------------------------------------------------------------------------
  // Modeled on how UDISE+ (the government school-data portal every Indian
  // school already deals with) and modern school-ERP onboarding flows handle
  // bulk data: (1) download a template or bring your own existing register,
  // (2) match your sheet's own column headers to our fields — so a school's
  // real Excel register works even when its headers/order don't match ours,
  // (3) preview every single row's validation result — new/update/warning/
  // error counts, a scrollable table, and a downloadable Issues Report —
  // before ANYTHING is written, then (4) an explicit commit that writes only
  // the rows without a blocking error.
  //
  // Updating an EXISTING record uses patch semantics: a blank cell in the
  // sheet never clears/overwrites an existing value — only a column that
  // actually had a value in that row changes anything. That's what makes a
  // "just add everyone's phone numbers" re-upload (every other column left
  // blank) safe to run without wiping out unrelated data.
  // ============================================================================

  function importValidateDate(v){
    if(!v) return { value:'' };
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return { value: v };
    m = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if(m){
      const [, d, mo, y] = m;
      return { value: `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}` };
    }
    return { value: v, warning: `"${v}" doesn't look like a date (expected YYYY-MM-DD or DD/MM/YYYY) — saved as typed.` };
  }
  function importValidateEmail(v, required){
    if(!v) return { value:'' };
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { value:v };
    return required ? { value:v, error:`"${v}" isn't a valid email address.` } : { value:v, warning:`"${v}" doesn't look like a valid email address — saved as typed.` };
  }
  function importValidatePhone(v, required){
    if(!v) return { value:'' };
    const digits = v.replace(/\D/g,'');
    if(digits.length === 10) return { value: digits };
    return required ? { value:v, error:`"${v}" isn't a valid 10-digit phone number.` } : { value:v, warning:`"${v}" doesn't look like a valid 10-digit phone number — saved as typed.` };
  }
  function importValidateAadhar(v){
    if(!v) return { value:'' };
    const digits = v.replace(/\D/g,'');
    if(digits.length === 12) return { value: digits };
    return { value:v, warning:`"${v}" isn't a valid 12-digit Aadhaar number — saved as typed.` };
  }
  function importValidateGender(v){
    if(!v) return { value:'' };
    const g = v.toLowerCase();
    if(g.startsWith('m')) return { value:'Male' };
    if(g.startsWith('f')) return { value:'Female' };
    return { value:v, warning:`Gender "${v}" wasn't recognized (expected Male/Female/Other) — saved as typed.` };
  }
  function runImportFieldValidate(f, raw){
    const v = raw === undefined || raw === null ? '' : String(raw).trim();
    if(f.validate) return f.validate(v);
    if(f.type === 'date') return importValidateDate(v);
    if(f.type === 'email') return importValidateEmail(v, f.required);
    if(f.type === 'phone') return importValidatePhone(v, f.required);
    if(f.type === 'aadhar') return importValidateAadhar(v);
    return { value: v };
  }

  const IMPORT_FIELD_DEFS = {
    students: {
      label: 'Students',
      matchKey: 'admissionNo',
      matchKeyLabel: 'Admission No',
      listRef: () => students,
      newRecordDefaults: () => ({ id: 'stu_' + Date.now() + '_' + Math.random().toString(36).slice(2,7) }),
      newIdValue: () => nextAdmissionNo(),
      deriveFields: rec => {
        rec.name = (rec.lastName || '') + ' ' + (rec.firstName || '');
        rec.parent = rec.fatherName || rec.motherName || '';
        rec.contact = rec.fatherPhone || rec.motherPhone || '';
      },
      findExisting: (matchVal, rec) => matchVal
        ? students.find(s => (s.admissionNo||'').toLowerCase() === matchVal.toLowerCase())
        : findPossibleDuplicate(rec.firstName, rec.lastName, rec.className, rec.section, null),
      afterCommit: async () => { await persist(); renderDashboard(); renderAdmissionsBody(); },
      sampleRows: [
        ['','Priya','Kumar','5th Class','A','Female','2015-06-12','priya@example.com','2026-06-01','B+','OC','Hindu','K. Ramesh','9876543210','K. Sita','9876500000','Main Bus Stand','No','Active'],
        ['2026-001','Arjun','Rao','6th Class','A','Male','2014-03-20','arjun@example.com','2025-06-01','O+','BC-A','Hindu','K. Suresh','9876500001','K. Latha','9876500002','Main Bus Stand','Yes','Active'],
      ],
      fields: [
        { key:'admissionNo', label:'Admission No', isMatchKey:true, aliases:['admission no','admissionno','adm no'] },
        { key:'firstName', label:'First Name', required:true, aliases:['first name','firstname','fname'] },
        { key:'lastName', label:'Last Name', required:true, aliases:['last name','lastname','lname','surname'] },
        { key:'className', label:'Class', required:true, aliases:['class','classname','grade','std'],
          validate: v => {
            const norm = normalizeClassName(v);
            const known = CLASS_LEVELS.some(c => c.toLowerCase() === norm.toLowerCase());
            return { value: norm, warning: known ? null : `Class "${v}" isn't one of your configured classes — will be saved as typed.` };
          } },
        { key:'section', label:'Section', required:true, aliases:['section','sec'],
          validate: v => {
            const raw = v.toUpperCase();
            const known = SECTIONS.find(s => s.toUpperCase() === raw);
            return { value: known || raw, warning: known ? null : `Section "${v}" isn't one of your configured sections (${SECTIONS.join(', ')}) — will be saved as typed.` };
          } },
        { key:'gender', label:'Gender', aliases:['gender','sex'], validate: importValidateGender },
        { key:'dob', label:'Date of Birth', aliases:['date of birth','dob'], type:'date' },
        { key:'email', label:'Email', aliases:['email','email address'], type:'email' },
        { key:'admDate', label:'Date of Joining', aliases:['date of joining','admission date','doj'], type:'date' },
        { key:'blood', label:'Blood Group', aliases:['blood group','blood'] },
        { key:'caste', label:'Caste Category', aliases:['caste category','caste','category'] },
        { key:'casteName', label:'Caste', aliases:['caste name','specific caste','sub caste','sub-caste'] },
        { key:'religion', label:'Religion', aliases:['religion'] },
        { key:'fatherName', label:'Father Name', aliases:['father name'] },
        { key:'fatherPhone', label:'Father Phone', aliases:['father phone'], type:'phone' },
        { key:'motherName', label:'Mother Name', aliases:['mother name'] },
        { key:'motherPhone', label:'Mother Phone', aliases:['mother phone'], type:'phone' },
        { key:'fatherAddress', label:'Address', aliases:['address'] },
        { key:'needsTransport', label:'Needs Transport', aliases:['needs transport','transport'], defaultWhenBlank:'No',
          validate: v => ({ value: /^y/i.test(v) ? 'Yes' : 'No' }) },
        { key:'status', label:'Status', aliases:['status'], defaultWhenBlank:'Active' },
      ],
    },
    staff: {
      label: 'Staff',
      matchKey: 'staffId',
      matchKeyLabel: 'Staff ID',
      listRef: () => staffList,
      newRecordDefaults: () => ({ id: 'stf_' + Date.now() + '_' + Math.random().toString(36).slice(2,7) }),
      newIdValue: () => nextStaffId(),
      findExisting: (matchVal, rec) => matchVal
        ? staffList.find(s => (s.staffId||'').toLowerCase() === matchVal.toLowerCase())
        : staffList.find(s => (s.firstName||'').toLowerCase()===(rec.firstName||'').toLowerCase()
            && (s.lastName||'').toLowerCase()===(rec.lastName||'').toLowerCase()
            && (s.phone||'')===(rec.phone||'') && rec.phone),
      afterCommit: async () => { await storageSet(STAFF_KEY, staffList); renderStaffBody(); },
      sampleRows: [
        ['','Lakshmi','Kumari','Female','1990-04-15','Teaching','Teacher','2026-06-01','9876543210','lakshmi.k@example.com','12-3, Main Road, Town','B+','','M.Sc, B.Ed','5','25000','Active'],
        ['STF2026-003','Ramesh','Babu','Male','1985-01-10','Administration','Office Assistant','2020-06-01','9876500003','ramesh.b@example.com','5-6, Market Street','O+','123456789012','B.Com','8','18000','Active'],
      ],
      fields: [
        { key:'staffId', label:'Staff ID', isMatchKey:true, aliases:['staff id','staffid','employee id'] },
        { key:'firstName', label:'First Name', required:true, aliases:['first name','firstname'] },
        { key:'lastName', label:'Last Name', required:true, aliases:['last name','lastname'] },
        { key:'gender', label:'Gender', required:true, aliases:['gender','sex'], validate: v => {
            const r = importValidateGender(v);
            return r.value ? r : { value:v, error:`Gender "${v}" wasn't recognized (expected Male/Female/Other).` };
          } },
        { key:'dob', label:'Date of Birth', required:true, aliases:['date of birth','dob'], type:'date' },
        { key:'department', label:'Department', required:true, aliases:['department','dept'],
          validate: v => ({ value:v, warning: staffDepartments.includes(v) ? null : `"${v}" isn't in your configured Departments list yet — will still be saved (add it under Departments & Designations for consistent filtering).` }) },
        { key:'designation', label:'Designation', required:true, aliases:['designation','role','job title'],
          validate: v => ({ value:v, warning: staffDesignations.includes(v) ? null : `"${v}" isn't in your configured Designations list yet — will still be saved.` }) },
        { key:'doj', label:'Date of Joining', required:true, aliases:['date of joining','doj'], type:'date' },
        { key:'phone', label:'Phone', required:true, aliases:['phone','mobile','contact'], type:'phone' },
        { key:'email', label:'Email', required:true, aliases:['email'], type:'email' },
        { key:'address', label:'Address', required:true, aliases:['address'] },
        { key:'blood', label:'Blood Group', aliases:['blood group','blood'] },
        { key:'aadhar', label:'Aadhar Number', aliases:['aadhar','aadhaar','aadhar number'], type:'aadhar' },
        { key:'qualification', label:'Qualification', aliases:['qualification'] },
        { key:'experience', label:'Experience (Years)', aliases:['experience','experience (years)'] },
        { key:'salary', label:'Basic Salary', aliases:['salary','basic salary'] },
        { key:'status', label:'Status', aliases:['status'], defaultWhenBlank:'Active' },
      ],
    },
  };

  function normalizeImportHeader(h){
    return (h||'').toString().trim().replace(/\s*\*+\s*$/,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function autoMapImportColumns(entityKey, headers){
    const defs = IMPORT_FIELD_DEFS[entityKey].fields;
    const normHeaders = headers.map(h => ({ raw:h, norm: normalizeImportHeader(h) }));
    const mapping = {};
    defs.forEach(f => {
      const candidates = [normalizeImportHeader(f.label), ...(f.aliases||[]).map(normalizeImportHeader)];
      const hit = normHeaders.find(h => candidates.includes(h.norm));
      mapping[f.key] = hit ? hit.raw : '';
    });
    return mapping;
  }

  let importWizard = null;

  function openImportWizard(entityKey){
    importWizard = { entity: entityKey, step: 1, headers: [], rawRows: [], mapping: {}, validated: [], filter: 'all' };
    document.getElementById('importWizardTitle').textContent = 'Bulk Import — ' + IMPORT_FIELD_DEFS[entityKey].label;
    document.getElementById('importWizardOverlay').classList.add('open');
    renderImportWizardSteps();
    renderImportWizardStep1();
    document.getElementById('moreActionsMenu') && document.getElementById('moreActionsMenu').classList.remove('open');
  }
  function closeImportWizard(){
    document.getElementById('importWizardOverlay').classList.remove('open');
    importWizard = null;
  }
  function renderImportWizardSteps(){
    const labels = ['1. Upload','2. Match Columns','3. Preview & Validate','4. Import'];
    document.getElementById('importWizardSteps').innerHTML = labels.map((l,i) => {
      const n = i+1;
      const bg = n === importWizard.step ? 'var(--navy)' : (n < importWizard.step ? 'var(--teal)' : 'var(--cream)');
      const color = n <= importWizard.step ? '#fff' : 'var(--ink-soft)';
      return `<span style="background:${bg}; color:${color}; padding:6px 12px; border-radius:20px; font-size:0.72rem; font-weight:700;">${l}</span>`;
    }).join('');
  }

  function renderImportWizardStep1(){
    importWizard.step = 1;
    renderImportWizardSteps();
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    document.getElementById('importWizardSub').textContent = `Step 1 of 4 — download the template (or use your school's own existing register), then upload it here.`;
    document.getElementById('importWizardBody').innerHTML = `
      <div style="border:1.5px dashed var(--border); border-radius:14px; padding:28px; text-align:center;">
        <p style="margin-bottom:16px; color:var(--ink-soft); font-size:0.85rem;">
          New to this? Download our template — required columns are marked with a red *.<br>
          Already have your own ${cfg.label.toLowerCase()} register in Excel? Upload it directly — the next step lets you match its columns to ours, whatever they're named.
        </p>
        <button type="button" class="btn btn-ghost" onclick="downloadImportWizardTemplate()">Download ${cfg.label} Template (Excel)</button>
        <div style="margin:18px 0 8px;">
          <input type="file" id="importWizardFileInput" accept=".xlsx,.xls,.csv" style="display:none;" onchange="handleImportWizardFile(event)">
          <button type="button" class="btn btn-primary" onclick="document.getElementById('importWizardFileInput').click()">Choose File to Upload</button>
        </div>
        <p id="importWizardFileName" style="color:var(--ink-soft); font-size:0.8rem;"></p>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="closeImportWizard()">Cancel</button></div>
    `;
  }

  async function downloadImportWizardTemplate(){
    if(!(await ensureXLSX())) return;
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    const headers = cfg.fields.map(f => f.label + (f.required ? ' *' : ''));
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ...cfg.sampleRows,
      [],
      ['* = required. A row missing a required column shows as an Error in the preview step and will not be imported until it\'s fixed.'],
      [`Tip: leave "${cfg.matchKeyLabel}" blank to create a brand-new record. To UPDATE an existing one instead, put its exact ${cfg.matchKeyLabel} in that column — and leave any column blank that you don't want to change (blank never clears an existing value on an update).`],
    ]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(14, h.length+2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.label);
    XLSX.writeFile(wb, `${slugifySchoolName()}_${importWizard.entity}_import_template.xlsx`);
    showToast('Template downloaded — fill it in, then upload it right here in the same window.');
  }

  async function handleImportWizardFile(e){
    if(!(await ensureXLSX())) { e.target.value=''; return; }
    const file = e.target.files[0];
    if(!file) return;
    document.getElementById('importWizardFileName').textContent = 'Reading ' + file.name + '...';
    const reader = new FileReader();
    reader.onload = function(evt){
      try{
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type:'array', cellDates:true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval:'' });
        if(rows.length === 0){ showToast('No rows found in that file.'); document.getElementById('importWizardFileName').textContent=''; return; }
        if(rows.length > 5000){ showToast(`That file has ${rows.length} rows — please split it into batches of 5,000 or fewer.`); document.getElementById('importWizardFileName').textContent=''; return; }
        const headers = Object.keys(rows[0]);
        const seen = new Set(); const dupes = [];
        headers.forEach(h => { const n = h.trim().toLowerCase(); if(n && seen.has(n)) dupes.push(h); else seen.add(n); });
        if(dupes.length){
          showToast('Your file has duplicate column headers (' + dupes.join(', ') + ') — please fix and re-upload.');
          document.getElementById('importWizardFileName').textContent = '';
          return;
        }
        importWizard.headers = headers;
        importWizard.rawRows = rows;
        importWizard.mapping = autoMapImportColumns(importWizard.entity, headers);
        renderImportWizardStep2();
      }catch(err){
        showToast('Could not read this file. Please use an .xlsx file (e.g. the template).');
        document.getElementById('importWizardFileName').textContent = '';
      }
    };
    reader.onerror = function(){ showToast('Could not read the selected file.'); };
    reader.readAsArrayBuffer(file);
  }

  function renderImportWizardStep2(){
    importWizard.step = 2;
    renderImportWizardSteps();
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    document.getElementById('importWizardSub').textContent = `Step 2 of 4 — we matched your file's columns automatically where we could. Fix any that are wrong, or pick a column for anything left unmatched. Required fields must be matched to continue.`;
    const headerOptions = ['', ...importWizard.headers];
    document.getElementById('importWizardBody').innerHTML = `
      <div style="max-height:420px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
          <thead><tr style="background:var(--cream);"><th style="padding:8px; text-align:left;">Our Field</th><th style="padding:8px; text-align:left;">Your Column</th></tr></thead>
          <tbody>
            ${cfg.fields.map(f => `
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:8px;">${escapeHtml(f.label)}${f.required?' <span class="required-star">*</span>':''}</td>
                <td style="padding:8px;">
                  <select id="importMap_${f.key}" style="width:100%; padding:7px 9px; border-radius:8px; border:1.5px solid var(--border);">
                    ${headerOptions.map(h => `<option value="${escapeHtml(h)}" ${importWizard.mapping[f.key]===h?'selected':''}>${h ? escapeHtml(h) : '— Not in file —'}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="renderImportWizardStep1()">Back</button>
        <button type="button" class="btn btn-primary" onclick="continueImportWizardMapping()">Continue to Preview</button>
      </div>
    `;
  }

  function continueImportWizardMapping(){
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    const mapping = {};
    const missingRequired = [];
    cfg.fields.forEach(f => {
      const sel = document.getElementById('importMap_' + f.key);
      mapping[f.key] = sel ? sel.value : '';
      if(f.required && !mapping[f.key]) missingRequired.push(f.label);
    });
    if(missingRequired.length){
      showToast('Please match a column for: ' + missingRequired.join(', '));
      return;
    }
    importWizard.mapping = mapping;
    validateImportWizardRows();
    importWizard.filter = 'all';
    renderImportWizardStep3();
  }

  function validateImportWizardRows(){
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    const seenMatchVals = new Map();
    const seenIdentity = new Map();
    const results = [];
    importWizard.rawRows.forEach((row, idx) => {
      const errors = [];
      const warnings = [];
      const fieldsOut = {};
      const presentKeys = new Set();
      cfg.fields.forEach(f => {
        const colHeader = importWizard.mapping[f.key];
        const raw = colHeader ? row[colHeader] : '';
        const rawStr = (raw instanceof Date) ? raw : (raw !== undefined && raw !== null ? String(raw).trim() : '');
        const hasValue = rawStr !== '' && !(rawStr instanceof Date && isNaN(rawStr));
        const hasRealValue = raw instanceof Date ? !isNaN(raw) : hasValue;
        if(f.required && !hasRealValue){
          errors.push(`Missing required "${f.label}"`);
          fieldsOut[f.key] = '';
          return;
        }
        if(!hasRealValue){
          fieldsOut[f.key] = f.defaultWhenBlank !== undefined ? f.defaultWhenBlank : '';
          return;
        }
        const normalizedRaw = (raw instanceof Date) ? (isNaN(raw) ? '' : raw.toISOString().slice(0,10)) : rawStr;
        const result = runImportFieldValidate(f, normalizedRaw);
        fieldsOut[f.key] = result.value;
        presentKeys.add(f.key);
        if(result.error) errors.push(result.error);
        else if(result.warning) warnings.push(result.warning);
      });

      const matchVal = (fieldsOut[cfg.matchKey] || '').toString().trim();
      if(matchVal){
        const key = matchVal.toLowerCase();
        if(seenMatchVals.has(key)){
          warnings.push(`Duplicate ${cfg.matchKeyLabel} "${matchVal}" also appears at row ${seenMatchVals.get(key)+2} in this file — later rows will overwrite earlier ones.`);
        } else {
          seenMatchVals.set(key, idx);
        }
      }

      let existing = null;
      if(errors.length === 0){
        existing = cfg.findExisting(matchVal, fieldsOut);
        if(!matchVal && existing){
          const idKey = 'auto:' + existing.id;
          if(seenIdentity.has(idKey)){
            warnings.push(`This looks like a duplicate of row ${seenIdentity.get(idKey)+2} in this file (matched to the same existing record) — later rows will overwrite earlier ones.`);
          } else {
            seenIdentity.set(idKey, idx);
          }
        }
      }

      const status = errors.length ? 'error' : (existing ? 'update' : 'new');
      results.push({ rowNum: idx+2, status, errors, warnings, fields: fieldsOut, presentKeys, existingId: existing ? existing.id : null });
    });
    importWizard.validated = results;
  }

  function importStatusBadge(r){
    if(r.status==='error') return `<span style="color:#b3261e; font-weight:700;">Error</span>`;
    if(r.warnings.length) return `<span style="color:#8a5300; font-weight:700;">${r.status==='new'?'New':'Update'} ⚠</span>`;
    return r.status==='new' ? `<span style="color:#1b5e20; font-weight:700;">New</span>` : `<span style="color:#0d47a1; font-weight:700;">Update</span>`;
  }
  function setImportWizardFilter(f){ importWizard.filter = f; renderImportWizardStep3(); }

  function renderImportWizardStep3(){
    importWizard.step = 3;
    renderImportWizardSteps();
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    const rows = importWizard.validated;
    const counts = { new:0, update:0, error:0, warning:0 };
    rows.forEach(r => { if(r.status!=='error') counts[r.status]++; else counts.error++; if(r.warnings.length) counts.warning++; });
    document.getElementById('importWizardSub').textContent = `Step 3 of 4 — review every row below. Nothing is written to ${cfg.label} until you click Import.`;
    const filter = importWizard.filter || 'all';
    const filtered = rows.filter(r => {
      if(filter==='all') return true;
      if(filter==='error') return r.status==='error';
      if(filter==='warning') return r.warnings.length>0;
      return r.status===filter;
    });
    const visibleRows = filtered.slice(0, 200);
    const previewFields = cfg.fields.filter(f => f.required || f.isMatchKey);
    document.getElementById('importWizardBody').innerHTML = `
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
        <span class="pill" style="background:#e8f5e9; color:#1b5e20;">${counts.new} new</span>
        <span class="pill" style="background:#e3f2fd; color:#0d47a1;">${counts.update} update</span>
        <span class="pill" style="background:#fff3e0; color:#8a5300;">${counts.warning} with warnings</span>
        <span class="pill" style="background:#fdecea; color:#b3261e;">${counts.error} error(s) — won't be imported</span>
      </div>
      <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">
        ${['all','new','update','warning','error'].map(f => `<button type="button" class="btn btn-ghost btn-sm" style="${filter===f?'border-color:var(--teal); border-width:2px;':''}" onclick="setImportWizardFilter('${f}')">${f==='all'?'All rows':f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}
        <button type="button" class="btn btn-ghost btn-sm" onclick="downloadImportWizardErrorReport()" ${counts.error+counts.warning===0?'disabled':''}>📥 Download Issues Report</button>
      </div>
      <div style="max-height:380px; overflow:auto; border:1px solid var(--border); border-radius:10px;">
        <table style="width:100%; border-collapse:collapse; font-size:0.78rem;">
          <thead><tr style="background:var(--cream); position:sticky; top:0;">
            <th style="padding:8px; text-align:left;">Row</th>
            <th style="padding:8px; text-align:left;">Status</th>
            ${previewFields.map(f=>`<th style="padding:8px; text-align:left;">${escapeHtml(f.label)}</th>`).join('')}
            <th style="padding:8px; text-align:left;">Notes</th>
          </tr></thead>
          <tbody>
            ${visibleRows.map(r => `
              <tr style="border-top:1px solid var(--border);">
                <td style="padding:7px;">${r.rowNum}</td>
                <td style="padding:7px; white-space:nowrap;">${importStatusBadge(r)}</td>
                ${previewFields.map(f=>`<td style="padding:7px;">${escapeHtml(r.fields[f.key]) || '—'}</td>`).join('')}
                <td style="padding:7px; color:${r.errors.length?'#b3261e':'#8a5300'};">${escapeHtml([...r.errors, ...r.warnings].join(' · ')) || '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
        ${filtered.length > visibleRows.length ? `<p style="padding:8px; margin:0; color:var(--ink-soft); font-size:0.76rem;">Showing first ${visibleRows.length} of ${filtered.length} matching rows — download the Issues Report to see everything.</p>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="renderImportWizardStep2()">Back</button>
        <button type="button" class="btn btn-primary" onclick="commitImportWizard()" ${counts.new+counts.update===0?'disabled':''}>Import ${counts.new+counts.update} ${cfg.label} (${counts.new} new, ${counts.update} update)</button>
      </div>
    `;
  }

  async function downloadImportWizardErrorReport(){
    if(!(await ensureXLSX())) return;
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    const rows = importWizard.validated.filter(r => r.status==='error' || r.warnings.length);
    if(!rows.length){ showToast('No errors or warnings to report.'); return; }
    const out = rows.map(r => {
      const obj = { 'Row #': r.rowNum, 'Status': r.status==='error' ? 'Error — not imported' : (r.status==='new' ? 'New (with warning)' : 'Update (with warning)') };
      cfg.fields.forEach(f => { obj[f.label] = r.fields[f.key] || ''; });
      obj['Issues'] = [...r.errors, ...r.warnings].join(' | ');
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Issues');
    XLSX.writeFile(wb, `${slugifySchoolName()}_${importWizard.entity}_import_issues.xlsx`);
  }

  function moShowImportProgress(total){
    const panel = document.createElement('div');
    panel.className = 'mo-import-progress';
    panel.innerHTML = `<div class="mo-ip-step" id="moIpStep">Writing records…</div>
      <div class="mo-ip-track"><div class="mo-ip-fill" id="moIpFill"></div></div>
      <div class="mo-ip-meta"><span><b id="moIpCount">0</b> / ${total} records</span><span id="moIpPct">0%</span></div>`;
    document.body.appendChild(panel);
    return {
      update(done, total){
        const pct = Math.round((done/total)*100);
        panel.querySelector('#moIpFill').style.width = pct + '%';
        panel.querySelector('#moIpCount').textContent = done;
        panel.querySelector('#moIpPct').textContent = pct + '%';
      },
      done(){
        panel.querySelector('#moIpStep').textContent = 'Done';
        setTimeout(() => panel.remove(), 500);
      }
    };
  }

  async function commitImportWizard(){
    const cfg = IMPORT_FIELD_DEFS[importWizard.entity];
    const list = cfg.listRef();
    const toCommit = importWizard.validated.filter(r => r.status !== 'error');
    if(!toCommit.length){ showToast('Nothing to import — fix the errors first.'); return; }
    const proceed = await showConfirmDialog(`Import ${toCommit.length} ${cfg.label.toLowerCase()} record(s) now?`, {title:'Confirm Import'});
    if(!proceed) return;

    // Determinate progress + live count: only shown for imports big enough that
    // a per-row percentage is actually meaningful (small imports just finish).
    const progress = toCommit.length >= 20 ? moShowImportProgress(toCommit.length) : null;
    let added = 0, updated = 0;
    const CHUNK = 25;
    for(let i = 0; i < toCommit.length; i += CHUNK){
      toCommit.slice(i, i + CHUNK).forEach(r => {
        if(r.existingId){
          const existing = list.find(x => x.id === r.existingId);
          if(existing){
            // Patch semantics — see the big comment at the top of this section:
            // only a field that actually had a value in this row is written;
            // a blank cell never clears something already on file.
            r.presentKeys.forEach(k => {
              const f = cfg.fields.find(x => x.key === k);
              if(f && f.isMatchKey) return;
              existing[k] = r.fields[k];
            });
            if(cfg.deriveFields) cfg.deriveFields(existing);
            updated++;
          }
        }else{
          const rec = cfg.newRecordDefaults();
          cfg.fields.forEach(f => { if(!f.isMatchKey) rec[f.key] = r.fields[f.key]; });
          rec[cfg.matchKey] = r.fields[cfg.matchKey] || cfg.newIdValue();
          if(cfg.deriveFields) cfg.deriveFields(rec);
          list.push(rec);
          added++;
        }
      });
      if(progress) progress.update(Math.min(i + CHUNK, toCommit.length), toCommit.length);
      if(i + CHUNK < toCommit.length) await new Promise(r => setTimeout(r, 0));
    }
    if(progress) progress.done();
    await cfg.afterCommit();
    const errorCount = importWizard.validated.length - toCommit.length;
    let msg = `${added} added, ${updated} updated.`;
    if(errorCount) msg += ` ${errorCount} row(s) had errors and were not imported — download the Issues Report from the previous step to see why.`;
    showToast(msg, 'burst');
    closeImportWizard();
  }

  // ===== Recently Deleted (soft-delete trash + restore) =====
  // Students and Users are soft-deleted server-side (see server.js) after a
  // real incident where a hard delete gave no way back from a mistake.
  // This modal is the one place both resources' "Recently Deleted" list
  // and Restore action live, since the two are otherwise identical.
  let _trashResource = '';
  let _trashRowsCache = [];
  // Days until an auto-purge, formatted the way the rest of the app phrases
  // relative dates — mirrors TRASH_RETENTION_DAYS in server.js (keep the two
  // in sync if that ever changes).
  function purgeCountdownText(purgesAt){
    if(!purgesAt) return '';
    const days = Math.ceil((new Date(purgesAt) - new Date()) / 86400000);
    if(days <= 0) return 'auto-purges very soon';
    if(days === 1) return 'auto-purges tomorrow';
    return `auto-purges in ${days} days`;
  }
  const TRASH_CONFIG = {
    students: {
      apiPath: '/api/students',
      title: 'Recently Deleted Students',
      label: s => `${s.firstName||''} ${s.lastName||''}`.trim() || '(no name)',
      meta: s => `${s.className||'—'} — Section ${s.section||'—'} · Admission No: ${s.admissionNo||'—'}`,
      onRestored: async () => { await loadStudents(); renderDashboard(); renderAdmissionsBody(); },
      // "Delete Permanently" requires typing this back exactly, so an admin
      // can't fat-finger the wrong row in a long list — same idea as typing
      // a repo's name to confirm deleting it.
      confirmLabel: 'Admission No', confirmValue: s => s.admissionNo || '',
    },
    users: {
      apiPath: '/api/users',
      title: 'Recently Deleted Users',
      label: u => u.name || u.username || '(no name)',
      meta: u => `${u.username||'—'} · ${u.role||'—'}`,
      onRestored: async () => { await loadUsers(); refreshUserListViews(); },
      confirmLabel: 'Username', confirmValue: u => u.username || '',
    },
  };
  async function openTrashModal(resource){
    _trashResource = resource;
    document.getElementById('trashModalTitle').textContent = TRASH_CONFIG[resource].title;
    document.getElementById('trashModalOverlay').classList.add('open');
    const menu = document.getElementById('moreActionsMenu');
    if(menu) menu.classList.remove('open');
    await renderTrashModal();
  }
  function closeTrashModal(){
    document.getElementById('trashModalOverlay').classList.remove('open');
  }
  async function renderTrashModal(){
    const cfg = TRASH_CONFIG[_trashResource];
    const body = document.getElementById('trashModalBody');
    body.innerHTML = `<div class="empty-state"><b>Loading…</b></div>`;
    let rows = [];
    try{
      const res = await fetch(cfg.apiPath + '?trash=1');
      if(!res.ok) throw new Error('Request failed (' + res.status + ')');
      rows = await res.json();
      _trashRowsCache = rows;
    }catch(e){
      body.innerHTML = `<div class="empty-state"><b>Could not load</b>${e.message}</div>`;
      return;
    }
    if(!rows.length){
      body.innerHTML = `<div class="empty-state"><b>Nothing here</b>No deleted records right now.</div>`;
      return;
    }
    body.innerHTML = rows.map(r => `
      <div class="list-manage-row">
        <div style="font-size:0.82rem;">
          <div class="lm-name">${cfg.label(r)}</div>
          <div class="lm-meta">${cfg.meta(r)}</div>
          <div class="lm-meta" style="color:var(--muted,#667);">
            Deleted${r.deletedByName ? ' by ' + r.deletedByName : ''}${r.deletedAt ? ' · ' + new Date(r.deletedAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : ''}
            ${r.purgesAt ? ' · ' + purgeCountdownText(r.purgesAt) : ''}
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary btn-sm" onclick="restoreTrashedRecord('${r.id}')">Restore</button>
          <button class="btn-danger-text" onclick="purgeTrashedRecord('${r.id}')">Delete Permanently</button>
        </div>
      </div>
    `).join('');
  }
  async function restoreTrashedRecord(id){
    const cfg = TRASH_CONFIG[_trashResource];
    try{
      await throwIfNotOk(await fetch(cfg.apiPath + '?id=' + encodeURIComponent(id) + '&restore=1', { method:'PUT', headers: actorHeaders() }));
      showToast('Restored.', 'burst');
      await cfg.onRestored();
      await renderTrashModal();
    }catch(e){
      showToast('Could not restore (' + e.message + ').');
    }
  }
  // Jumps the retention queue and removes one record right now instead of
  // waiting out the auto-purge window (see TRASH_RETENTION_DAYS in
  // server.js). This is the one truly irreversible action in the whole
  // deletion flow, so — unlike the soft-delete itself — it asks the admin
  // to type the record's own identifier back, the same pattern GitHub uses
  // for deleting a repo, rather than just a yes/no click.
  async function purgeTrashedRecord(id){
    const cfg = TRASH_CONFIG[_trashResource];
    const rows = _trashRowsCache || [];
    const row = rows.find(r => r.id === id);
    const expected = row ? cfg.confirmValue(row) : '';
    const typed = await showPromptDialog(`This permanently and irreversibly deletes this record — there is no Restore after this.\n\nType the ${cfg.confirmLabel} (${expected || '—'}) to confirm.`, { title:'Permanently delete', okText:'Delete permanently', placeholder:cfg.confirmLabel });
    if(typed === null) return;
    if(typed.trim().toLowerCase() !== String(expected).trim().toLowerCase()){
      showToast(`That didn't match — nothing was deleted.`);
      return;
    }
    try{
      await throwIfNotOk(await fetch(cfg.apiPath + '?id=' + encodeURIComponent(id) + '&purge=1', {
        method:'PUT', headers:{'Content-Type':'application/json', ...actorHeaders()}, body: JSON.stringify({ confirmText: typed.trim() })
      }));
      showToast('Permanently deleted.', 'burst');
      await renderTrashModal();
    }catch(e){
      showToast('Could not permanently delete (' + e.message + ').');
    }
  }

  // ===== Pending Deletion Requests (3-step deletion) =====
  // Deleting a student takes three distinct, deliberate steps — request
  // (with a reason), a first confirmation, and a final confirmation that
  // requires typing the record's own Admission No back — logged with who
  // did each step and when. The same single Admin/Principal can do all
  // three themselves in one sitting (see server.js's handleDeletionRequests
  // for why this no longer requires a second, different person); a second
  // Admin/Principal can still do a later step instead, if the school has
  // one and wants to. Admin/Principal see and act on every request here;
  // anyone else sees only the ones they personally filed, so they can
  // check whether theirs went through without seeing the queue.
  let _deletionRequestsCache = [];
  function openDeletionRequestsModal(){
    document.getElementById('deletionRequestsModalOverlay').classList.add('open');
    const menu = document.getElementById('moreActionsMenu');
    if(menu) menu.classList.remove('open');
    renderDeletionRequestsModal();
  }
  function closeDeletionRequestsModal(){
    document.getElementById('deletionRequestsModalOverlay').classList.remove('open');
  }
  async function renderDeletionRequestsModal(){
    const body = document.getElementById('deletionRequestsModalBody');
    const isManagement = currentUser && ['Admin','Principal'].includes(currentUser.role);
    document.getElementById('deletionRequestsModalSub').textContent = isManagement
      ? 'Deleting a student takes 3 steps — request, first confirmation, final confirmation (typed) — logged with who did each one. You can complete all 3 yourself, or have another Admin/Principal do a later step.'
      : 'Requests you have filed, and whether they were approved or rejected. Only Admin/Principal can act on a pending request.';
    body.innerHTML = `<div class="empty-state"><b>Loading…</b></div>`;
    let rows = [];
    try{
      const res = await fetch('/api/deletion-requests');
      if(!res.ok) throw new Error('Request failed (' + res.status + ')');
      rows = await res.json();
      _deletionRequestsCache = rows;
    }catch(e){
      body.innerHTML = `<div class="empty-state"><b>Could not load</b>${e.message}</div>`;
      return;
    }
    if(!rows.length){
      body.innerHTML = `<div class="empty-state"><b>Nothing here</b>No deletion requests right now.</div>`;
      return;
    }
    const statusPill = st => {
      const color = st === 'Pending' ? 'var(--warn, #b8860b)'
        : st === 'Pending Final Approval' ? 'var(--info, #2563eb)'
        : st === 'Approved' ? 'var(--danger, #c0392b)'
        : 'var(--muted, #667)';
      return `<span class="pill" style="color:${color};border-color:${color};">${st}</span>`;
    };
    // Step 1 (request) and step 2 (first confirmation) can now be the same
    // person, or a different one — see the comment above this function.
    const canDecide = r => isManagement && (r.status === 'Pending' || r.status === 'Pending Final Approval');
    body.innerHTML = rows.map(r => `
      <div class="list-manage-row">
        <div style="font-size:0.82rem;">
          <div class="lm-name">${r.recordLabel || r.recordId} ${statusPill(r.status)}</div>
          <div class="lm-meta">Reason: ${r.reason || '—'}</div>
          <div class="lm-meta">Requested by ${r.requestedByName || '—'} · ${new Date(r.requestedAt).toLocaleString('en-IN')}</div>
          ${r.firstApprovedByName ? `<div class="lm-meta">First approval by ${r.firstApprovedByName} · ${r.firstApprovedAt ? new Date(r.firstApprovedAt).toLocaleString('en-IN') : ''}</div>` : ''}
          ${(r.status === 'Approved' || r.status === 'Rejected') ? `<div class="lm-meta">${r.status === 'Approved' ? 'Final approval' : 'Rejected'} by ${r.decidedByName || '—'} · ${r.decidedAt ? new Date(r.decidedAt).toLocaleString('en-IN') : ''}${r.decisionNote ? ' · ' + r.decisionNote : ''}</div>` : ''}
        </div>
        ${canDecide(r) ? `
        <div style="display:flex; gap:10px;">
          <button class="btn-danger-text" onclick="decideDeletionRequest('${r.id}','Approve','${r.status}')">${r.status === 'Pending' ? 'Confirm (Step 2 of 3)' : 'Final Confirm &amp; Delete (Step 3 of 3)'}</button>
          <button class="btn-edit-text" onclick="decideDeletionRequest('${r.id}','Reject','${r.status}')">Reject</button>
        </div>` : ''}
      </div>
    `).join('');
  }