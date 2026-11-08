
  let reportTemplates = [];
  let templatesView = 'list';
  let editingTemplateId = '';
  // Default co-scholastic areas for the 'modern' (CBSE-style) report card layout —
  // schools can rename/add/remove these per template via the Customize Wizard.
  const DEFAULT_COSCHOLASTIC_AREAS = ['Work Education', 'Art Education', 'Health & Physical Education'];
  async function loadReportTemplates(){
    reportTemplates = await storageGet(REPORT_TEMPLATES_KEY, [
      { id:'tmpl_classic', name:'Classic', layout:'classic', titleOverride:'', signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent', footerNote:'', showElective:true, showNotCounted:true, showAttendance:true, isDefault:true },
      { id:'tmpl_compact', name:'Compact', layout:'classic', titleOverride:'PROGRESS REPORT', signatureLabel1:'Class Teacher', signatureLabel2:'Head Master', footerNote:'', showElective:false, showNotCounted:false, showAttendance:true, isDefault:false },
      { id:'tmpl_annual', name:'Annual Result', layout:'classic', titleOverride:'ANNUAL PROGRESS REPORT', signatureLabel1:'Class Teacher', signatureLabel2:'Principal', footerNote:'This report card is valid only with the school seal.', showElective:true, showNotCounted:true, showAttendance:true, isDefault:false },
      { id:'tmpl_cbse', name:'CBSE Style (Co-Scholastic)', layout:'modern', titleOverride:'PROGRESS REPORT', signatureLabel1:'Class Teacher', signatureLabel2:'Principal', footerNote:'', showElective:true, showNotCounted:true, showAttendance:true, coScholasticAreas:DEFAULT_COSCHOLASTIC_AREAS.slice(), showDiscipline:true, isDefault:false },
    ]);
    // Non-breaking migration: any template saved before the 'layout' field
    // existed (or before co-scholastic support) gets safe defaults so old
    // saved templates keep behaving exactly as they did.
    reportTemplates.forEach(t => {
      if(!t.layout) t.layout = 'classic';
      if(!t.coScholasticAreas) t.coScholasticAreas = DEFAULT_COSCHOLASTIC_AREAS.slice();
      if(t.showDiscipline === undefined) t.showDiscipline = true;
    });
  }

  /* --- Admit Card Templates (multiple layouts, editable) --- */
  const ADMIT_CARD_TEMPLATES_KEY = "admit-card-templates";
  OBJECT_BACKED_KEYS[ADMIT_CARD_TEMPLATES_KEY] = '/api/kv/' + ADMIT_CARD_TEMPLATES_KEY;
  let admitCardTemplates = [];
  const DEFAULT_AC_INSTRUCTIONS = [
    'Bring this admit card to every examination — no entry without it.',
    'Report to the exam hall at least 15 minutes before the scheduled time.',
    'Mobile phones and other electronic devices are not allowed inside the exam hall.',
    'This card must be signed by the invigilator after every paper.',
  ].join('\n');
  async function loadAdmitCardTemplates(){
    admitCardTemplates = await storageGet(ADMIT_CARD_TEMPLATES_KEY, [
      { id:'ac_classic', name:'Classic Strip', layout:'strip', cardsPerPage:4, titleOverride:'', instructionsText:'', footerNote:'', isDefault:true },
      { id:'ac_modern', name:'Modern Card', layout:'grid4', cardsPerPage:4, titleOverride:'', instructionsText:DEFAULT_AC_INSTRUCTIONS, footerNote:'', isDefault:false },
      { id:'ac_full', name:'Full Board-Style', layout:'full', cardsPerPage:1, titleOverride:'', instructionsText:DEFAULT_AC_INSTRUCTIONS, footerNote:'', isDefault:false },
    ]);
  }

  /* --- Co-Scholastic Grades (CBSE-style 'modern' report card layout only) ---
     Keyed examId::studentId -> { areas:{areaName:grade}, discipline:grade }.
     Entirely optional — a report card prints fine with nothing set (shows
     "—"), so this never blocks generating cards for classes that don't use
     the modern layout. */
  const EXAM_COSCHOLASTIC_KEY = "exam-coscholastic";
  OBJECT_BACKED_KEYS[EXAM_COSCHOLASTIC_KEY] = '/api/kv/' + EXAM_COSCHOLASTIC_KEY;
  let examCoScholastic = {};
  async function loadExamCoScholastic(){
    examCoScholastic = await storageGet(EXAM_COSCHOLASTIC_KEY, {});
  }
  function coScholasticKeyFor(examId, studentId){ return examId + '::' + studentId; }
  async function saveCoScholasticGrades(examId, studentId){
    const t = currentReportTemplate();
    const areas = (t && t.coScholasticAreas) || DEFAULT_COSCHOLASTIC_AREAS;
    const rec = { areas:{}, discipline:'' };
    areas.forEach(a => {
      const el = document.getElementById('csg_'+a.replace(/[^a-zA-Z0-9]/g,''));
      if(el) rec.areas[a] = el.value;
    });
    const discEl = document.getElementById('csg_discipline');
    if(discEl) rec.discipline = discEl.value;
    examCoScholastic[coScholasticKeyFor(examId, studentId)] = rec;
    await storageSet(EXAM_COSCHOLASTIC_KEY, examCoScholastic);
    showToast('Co-scholastic grades saved.', 'burst');
    loadReportCardPreview();
  }
  function renderReportTemplatesTab(body){
    if(templatesView === 'edit') return renderTemplateEditor(body);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">
        Create multiple progress report layouts — Classic or the CBSE-style Modern layout with co-scholastic grading, different titles, signature wording, uploaded signatures, or footer notes — then pick which one to use each time you print, from the Progress Reports tab.
      </p>
      <button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openTemplateManager('reportcard')">+ Add Template — Customize Wizard</button>
      <div class="table-wrap" style="max-width:960px;">
        <table><thead><tr><th>Template</th><th>Layout</th><th>Title</th><th>Signatures</th><th>Attendance</th><th>Default</th><th></th></tr></thead>
        <tbody>
        ${reportTemplates.map(t => `<tr>
          <td class="name-cell">${t.name}</td>
          <td>${t.layout==='modern' ? 'Modern (CBSE-style)' : 'Classic'}</td>
          <td>${t.titleOverride || '(uses exam name)'}</td>
          <td>${t.signatureLabel1}${t.sigImage1?' 🖼':''} / ${t.signatureLabel2}${t.sigImage2?' 🖼':''}</td>
          <td>${t.showAttendance!==false ? '✓' : '—'}</td>
          <td>${t.isDefault ? '<span class="pill">Default</span>' : `<button class="btn-edit-text" onclick="setDefaultTemplate('${t.id}')">Set Default</button>`}</td>
          <td><button class="btn-edit-text" onclick="openTemplateManagerEdit('reportcard','${t.id}')">Edit</button>&nbsp;·&nbsp;<button class="btn-edit-text" onclick="duplicateTemplate('${t.id}')">Duplicate</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteTemplate('${t.id}')">Delete</button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
    `;
  }
  let sig1Data = '', sig2Data = '';
  function openTemplateEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingTemplateId = id || '';
    const t = editingTemplateId ? reportTemplates.find(x => x.id === editingTemplateId) : null;
    sig1Data = t ? (t.sigImage1||'') : '';
    sig2Data = t ? (t.sigImage2||'') : '';
    templatesView = 'edit';
    renderResultBody();
  }
  function backToTemplatesList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    templatesView = 'list';
    renderResultBody();
  }
  async function duplicateTemplate(id){
    const src = reportTemplates.find(t => t.id === id);
    if(!src) return;
    const copy = { ...src, id: 'tmpl_'+Date.now(), name: src.name+' (Copy)', isDefault: false };
    reportTemplates.push(copy);
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    renderReportTemplatesTab(document.getElementById('resultBody'));
    showToast('Template duplicated — edit it to make it your own.', 'burst');
  }
  const INFO_FIELD_DEFS = [
    { key:'studentName', label:'Student Name' },
    { key:'admissionNo', label:'Admission Number' },
    { key:'rollNo', label:'Roll Number' },
    { key:'className', label:'Class' },
    { key:'section', label:'Section' },
    { key:'fatherName', label:'Father Name' },
    { key:'motherName', label:'Mother Name' },
    { key:'dob', label:'Date of Birth' },
    { key:'gender', label:'Gender' },
    { key:'bloodGroup', label:'Blood Group' },
    { key:'address', label:'Address' },
    { key:'phone', label:'Phone Number' },
    { key:'email', label:'Email' },
    { key:'examPeriod', label:'Exam Period' },
    { key:'attendance', label:'Attendance' },
  ];
  const DEFAULT_INFO_FIELDS = { studentName:true, admissionNo:true, rollNo:false, className:true, section:true, fatherName:true, motherName:false, dob:false, gender:false, bloodGroup:false, address:false, phone:false, email:false, examPeriod:true, attendance:true };
  function studentInfoFieldValue(s, key){
    switch(key){
      case 'studentName': return s.lastName+' '+s.firstName;
      case 'admissionNo': return s.admissionNo || '—';
      case 'rollNo': return s.rollNo || '—';
      case 'className': return s.className || '—';
      case 'section': return s.section || '—';
      case 'fatherName': return s.fatherName || '—';
      case 'motherName': return s.motherName || '—';
      case 'dob': return s.dob || '—';
      case 'gender': return s.gender || '—';
      case 'bloodGroup': return s.blood || '—';
      case 'address': return s.fatherAddress || s.motherAddress || s.guardianAddress || '—';
      case 'phone': return s.fatherPhone || s.motherPhone || s.guardianPhone || '—';
      case 'email': return s.email || '—';
      default: return '—';
    }
  }
  function renderTemplateEditor(body){
    const t = editingTemplateId ? reportTemplates.find(x => x.id === editingTemplateId) : null;
    const infoFields = t && t.infoFields ? t.infoFields : DEFAULT_INFO_FIELDS;
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToTemplatesList()">Report Templates</a> &nbsp;/&nbsp; ${t ? t.name : 'New Template'}</div>
      <div class="profile-card" style="max-width:620px;">
        <div class="form-grid">
          <div class="f-field full"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="tmplName" value="${t?t.name:''}" placeholder="e.g. Half Yearly Format"></div>
          <div class="f-field full"><label>Title Override <span style="font-weight:400; color:var(--ink-soft);">— leave blank to use "REPORT CARD — [Exam Name]"</span></label><input type="text" id="tmplTitle" value="${t?(t.titleOverride||''):''}" placeholder="e.g. HALF YEARLY PROGRESS REPORT"></div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Student Info Fields to Show</label>
        <div class="disc-checklist" style="max-height:220px; margin-bottom:6px; display:grid; grid-template-columns:1fr 1fr; gap:2px 10px;">
          ${INFO_FIELD_DEFS.map(f => `<label class="disc-check-item"><input type="checkbox" class="tmpl-infofield-check" value="${f.key}" ${infoFields[f.key]?'checked':''} ${f.key==='studentName'?'disabled checked':''}> ${f.label}</label>`).join('')}
        </div>
        <p style="font-size:0.74rem; color:var(--ink-soft); margin:0 0 14px;">Student Name always shows. Pick whichever else your school wants on this layout — fields with no data on file simply show "—".</p>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 1</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="tmplSig1" value="${t?t.signatureLabel1:'Class Teacher'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="sig1Preview" src="${sig1Data}" style="height:36px; ${sig1Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="previewSignature(event,1)"></label>
              ${sig1Data ? `<button type="button" class="btn-danger-text" onclick="clearSignature(1)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 2</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="tmplSig2" value="${t?t.signatureLabel2:'Principal / Correspondent'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="sig2Preview" src="${sig2Data}" style="height:36px; ${sig2Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="previewSignature(event,2)"></label>
              ${sig2Data ? `<button type="button" class="btn-danger-text" onclick="clearSignature(2)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <div class="form-grid" style="margin-top:14px;">
          <div class="f-field full"><label>Footer Note</label><input type="text" id="tmplFooter" value="${t?(t.footerNote||''):''}" placeholder="Optional remark shown at the bottom of the card"></div>
        </div>
        <div style="display:flex; gap:30px; margin:14px 0; flex-wrap:wrap;">
          <label class="admission-toggle"><input type="checkbox" id="tmplShowElective" ${(!t || t.showElective!==false)?'checked':''}> Show "Elective" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="tmplShowNotCounted" ${(!t || t.showNotCounted!==false)?'checked':''}> Show "Not counted" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="tmplShowClassTopper" ${(!t || t.showClassTopper!==false)?'checked':''}> Show Highest Marks in Class per subject</label>
          <label class="admission-toggle"><input type="checkbox" id="tmplShowRank" ${(!t || t.showRank!==false)?'checked':''}> Show Class Rank (section-wise)</label>
        </div>
        <div style="display:flex; gap:10px; margin-top:16px;">
          <button class="btn btn-ghost" onclick="backToTemplatesList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveTemplate()">Save Report Period</button>
        </div>
      </div>
    `;
  }
  function previewSignature(e, which){
    readImageFileWithSizeLimit(e, dataUrl => {
      if(which===1){ sig1Data = dataUrl; document.getElementById('sig1Preview').src = sig1Data; document.getElementById('sig1Preview').style.display='inline-block'; }
      else { sig2Data = dataUrl; document.getElementById('sig2Preview').src = sig2Data; document.getElementById('sig2Preview').style.display='inline-block'; }
      renderTemplateEditor(document.getElementById('resultBody')); // refresh to show Remove button
    });
  }
  function clearSignature(which){
    if(which===1) sig1Data=''; else sig2Data='';
    renderTemplateEditor(document.getElementById('resultBody'));
  }
  async function saveTemplate(){
    const name = document.getElementById('tmplName').value.trim();
    if(!name){ showToast('Enter a name for the report period.'); return; }
    const infoFields = {};
    INFO_FIELD_DEFS.forEach(f => {
      infoFields[f.key] = f.key === 'studentName' ? true : document.querySelector(`.tmpl-infofield-check[value="${f.key}"]`).checked;
    });
    const data = {
      name,
      titleOverride: document.getElementById('tmplTitle').value.trim(),
      infoFields,
      signatureLabel1: document.getElementById('tmplSig1').value.trim() || 'Class Teacher',
      signatureLabel2: document.getElementById('tmplSig2').value.trim() || 'Principal / Correspondent',
      sigImage1: sig1Data, sigImage2: sig2Data,
      footerNote: document.getElementById('tmplFooter').value.trim(),
      showElective: document.getElementById('tmplShowElective').checked,
      showNotCounted: document.getElementById('tmplShowNotCounted').checked,
      showClassTopper: document.getElementById('tmplShowClassTopper').checked,
      showRank: document.getElementById('tmplShowRank').checked,
      showAttendance: infoFields.attendance,
    };
    if(editingTemplateId){
      const idx = reportTemplates.findIndex(x => x.id === editingTemplateId);
      reportTemplates[idx] = { ...reportTemplates[idx], ...data };
    }else{
      data.id = 'tmpl_' + Date.now();
      data.isDefault = reportTemplates.length === 0;
      reportTemplates.push(data);
    }
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    showToast('Template saved.', 'burst');
    backToTemplatesList();
  }
  async function setDefaultTemplate(id){
    reportTemplates.forEach(t => { t.isDefault = (t.id === id); });
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    renderReportTemplatesTab(document.getElementById('resultBody'));
  }
  async function deleteTemplate(id){
    if(reportTemplates.length <= 1){ showToast('Keep at least one template.'); return; }
    if(!await showConfirmDialog('Delete this template?')) return;
    const wasDefault = reportTemplates.find(t => t.id === id) && reportTemplates.find(t => t.id === id).isDefault;
    reportTemplates = reportTemplates.filter(t => t.id !== id);
    if(wasDefault && reportTemplates.length) reportTemplates[0].isDefault = true;
    await storageSet(REPORT_TEMPLATES_KEY, reportTemplates);
    renderReportTemplatesTab(document.getElementById('resultBody'));
  }

  /* --- Reusable Customize Wizard: manages both Admit Card templates and Report
     Card templates from one step-based modal (Layout → Details → Review). --- */
  let twKind = 'reportcard';   // 'reportcard' | 'admitcard'
  let twListView = true;       // true = template list inside the modal, false = wizard steps
  let twStep = 1;
  let twEditingId = '';
  let twDraft = {};
  let twSig1Data = '', twSig2Data = '';

  const AC_LAYOUT_DEFS = [
    { key:'strip', name:'Classic Strip', blurb:'3–4 full-width hall-ticket strips stacked per A4 sheet, each with its own subject-wise date sheet and a signature cell per day. The most common format for internal school exams.' },
    { key:'grid4', name:'Modern Card', blurb:'4 compact ID-style cards per A4 sheet in a 2×2 grid — photo, key details and hall ticket number, without a per-subject table. Fast to print for a whole class.' },
    { key:'full', name:'Full Board-Style', blurb:'One full A4 page per candidate, board-exam style — larger photo, a full candidate-instructions block and the complete subject-wise date sheet. Best for board or competitive exams.' },
  ];
  const RC_LAYOUT_DEFS = [
    { key:'classic', name:'Classic', blurb:'Subject-wise marks table with grade, remarks and signatures — the standard scholastic-only report card.' },
    { key:'modern', name:'Modern (CBSE-style)', blurb:'Adds a co-scholastic grading section (Work Education, Art, Health & Physical Education, each graded A–E) plus a separate Discipline grade, alongside the scholastic marks table.' },
  ];

  function openTemplateManager(kind){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    twKind = kind;
    twListView = true;
    twStep = 1;
    twEditingId = '';
    twDraft = {};
    document.getElementById('templateWizardOverlay').classList.add('open');
    renderTemplateWizard();
  }
  function closeTemplateWizard(){
    document.getElementById('templateWizardOverlay').classList.remove('open');
  }
  function openTemplateManagerEdit(kind, id){
    openTemplateManager(kind);
    twStartEdit(id);
  }
  function twTemplates(){ return twKind === 'admitcard' ? admitCardTemplates : reportTemplates; }
  function twStorageKey(){ return twKind === 'admitcard' ? ADMIT_CARD_TEMPLATES_KEY : REPORT_TEMPLATES_KEY; }
  function twLayoutDefs(){ return twKind === 'admitcard' ? AC_LAYOUT_DEFS : RC_LAYOUT_DEFS; }
  function twKindLabel(){ return twKind === 'admitcard' ? 'Admit Card' : 'Progress Report'; }
  function twStepTitles(){ return twKind === 'admitcard' ? ['Choose Layout','Details & Content','Review & Save'] : ['Choose Layout','Details & Signatures','Review & Save']; }

  function renderTemplateWizard(){
    const box = document.getElementById('templateWizardBody');
    if(!box) return;
    box.innerHTML = twListView ? twRenderList() : twRenderWizardStep();
  }
  function twRenderList(){
    const list = twTemplates();
    return `
      <h2 style="font-size:1.08rem; margin-bottom:4px;">${twKindLabel()} Templates</h2>
      <p class="modal-sub">Create multiple ${twKindLabel().toLowerCase()} layouts, then pick which one to use each time you print.</p>
      <button class="btn btn-primary btn-sm" style="margin-bottom:14px;" onclick="twStartNew()">+ New Template — Customize Wizard</button>
      <div class="table-wrap">
        <table><thead><tr><th>Template</th><th>Layout</th><th>Default</th><th></th></tr></thead>
        <tbody>
        ${list.map(t => `<tr>
          <td class="name-cell">${t.name}</td>
          <td>${(twLayoutDefs().find(l=>l.key===t.layout)||{}).name || t.layout}</td>
          <td>${t.isDefault ? '<span class="pill">Default</span>' : `<button class="btn-edit-text" onclick="twSetDefault('${t.id}')">Set Default</button>`}</td>
          <td><button class="btn-edit-text" onclick="twStartEdit('${t.id}')">Edit</button>&nbsp;·&nbsp;<button class="btn-edit-text" onclick="twDuplicate('${t.id}')">Duplicate</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="twDelete('${t.id}')">Delete</button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="closeTemplateWizard()">Close</button>
      </div>
    `;
  }
  function twDefaultDraft(){
    if(twKind === 'admitcard'){
      return { id:'', name:'', layout:'strip', cardsPerPage:4, titleOverride:'', instructionsText:DEFAULT_AC_INSTRUCTIONS, footerNote:'', isDefault:false };
    }
    return { id:'', name:'', layout:'classic', titleOverride:'', infoFields:{...DEFAULT_INFO_FIELDS}, signatureLabel1:'Class Teacher', signatureLabel2:'Principal / Correspondent', sigImage1:'', sigImage2:'', footerNote:'', showElective:true, showNotCounted:true, showClassTopper:true, showRank:true, showAttendance:true, coScholasticAreas:DEFAULT_COSCHOLASTIC_AREAS.slice(), showDiscipline:true, isDefault:false };
  }
  function twStartNew(){
    twEditingId = '';
    twDraft = twDefaultDraft();
    twSig1Data = ''; twSig2Data = '';
    twStep = 1;
    twListView = false;
    renderTemplateWizard();
  }
  function twStartEdit(id){
    const t = twTemplates().find(x => x.id === id);
    if(!t) return;
    twEditingId = id;
    twDraft = JSON.parse(JSON.stringify(t));
    if(twKind === 'reportcard'){
      twDraft.infoFields = twDraft.infoFields || {...DEFAULT_INFO_FIELDS};
      twDraft.coScholasticAreas = twDraft.coScholasticAreas || DEFAULT_COSCHOLASTIC_AREAS.slice();
      twSig1Data = twDraft.sigImage1 || ''; twSig2Data = twDraft.sigImage2 || '';
    }
    twStep = 1;
    twListView = false;
    renderTemplateWizard();
  }
  async function twDuplicate(id){
    const src = twTemplates().find(t => t.id === id);
    if(!src) return;
    const copy = { ...src, id: (twKind==='admitcard'?'ac_':'tmpl_')+Date.now(), name: src.name+' (Copy)', isDefault:false };
    twTemplates().push(copy);
    await storageSet(twStorageKey(), twTemplates());
    showToast('Template duplicated.', 'burst');
    renderTemplateWizard();
  }
  async function twSetDefault(id){
    twTemplates().forEach(t => { t.isDefault = (t.id === id); });
    await storageSet(twStorageKey(), twTemplates());
    renderTemplateWizard();
  }
  async function twDelete(id){
    if(twTemplates().length <= 1){ showToast('Keep at least one template.'); return; }
    if(!await showConfirmDialog('Delete this template?')) return;
    const found = twTemplates().find(t => t.id === id);
    const wasDefault = found && found.isDefault;
    const filtered = twTemplates().filter(t => t.id !== id);
    if(wasDefault && filtered.length) filtered[0].isDefault = true;
    if(twKind === 'admitcard') admitCardTemplates = filtered; else reportTemplates = filtered;
    await storageSet(twStorageKey(), filtered);
    renderTemplateWizard();
  }

  function twRenderWizardStep(){
    const titles = twStepTitles();
    const stepsNav = titles.map((t,i) => `<span class="tw-step ${twStep===i+1?'tw-step-active':''} ${twStep>i+1?'tw-step-done':''}">${i+1}. ${t}</span>`).join('<span class="tw-step-arrow">→</span>');
    let body = '';
    if(twStep === 1) body = twStepLayout();
    else if(twStep === 2) body = twKind === 'admitcard' ? twStepAdmitDetails() : twStepReportDetails();
    else body = twStepReview();
    return `
      <div class="breadcrumb"><a onclick="twBackToList()">${twKindLabel()} Templates</a> &nbsp;/&nbsp; Customize Wizard</div>
      <div class="tw-steps">${stepsNav}</div>
      ${body}
    `;
  }
  function twBackToList(){ twListView = true; renderTemplateWizard(); }
  function twGoStep(n){ twStep = n; renderTemplateWizard(); }

  function twStepLayout(){
    const defs = twLayoutDefs();
    return `
      <div class="tw-layout-grid">
        ${defs.map(l => `
          <div class="tw-layout-card ${twDraft.layout===l.key?'tw-layout-card-sel':''}" onclick="twSelectLayout('${l.key}')">
            <div class="tw-layout-name">${l.name}${twDraft.layout===l.key?' ✓':''}</div>
            <div class="tw-layout-blurb">${l.blurb}</div>
          </div>
        `).join('')}
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twBackToList()">Cancel</button>
        <button class="btn btn-primary" onclick="twGoStep(2)">Next</button>
      </div>
    `;
  }
  function twSelectLayout(key){
    twDraft.layout = key;
    if(twKind === 'admitcard') twDraft.cardsPerPage = key==='full' ? 1 : key==='grid4' ? 4 : (twDraft.cardsPerPage===3?3:4);
    renderTemplateWizard();
  }

  function twStepAdmitDetails(){
    const d = twDraft;
    return `
      <div class="profile-card" style="max-width:640px;">
        <div class="form-grid">
          <div class="f-field full"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="twName" value="${d.name}" placeholder="e.g. Board Exam Style"></div>
          <div class="f-field full"><label>Title Override <span style="font-weight:400; color:var(--ink-soft);">— leave blank for "Admit Card"</span></label><input type="text" id="twTitle" value="${d.titleOverride||''}" placeholder="e.g. HALL TICKET"></div>
        </div>
        ${d.layout==='strip' ? `
        <div class="f-field" style="max-width:280px;">
          <label>Cards per A4 Sheet</label>
          <select id="twCardsPerPage">
            <option value="4" ${d.cardsPerPage!==3?'selected':''}>4 per sheet — compact</option>
            <option value="3" ${d.cardsPerPage===3?'selected':''}>3 per sheet — more room to sign</option>
          </select>
        </div>` : `<p style="font-size:0.8rem; color:var(--ink-soft);">${d.layout==='full' ? '1 candidate per A4 sheet (fixed by this layout).' : '4 cards per A4 sheet, 2×2 grid (fixed by this layout).'}</p>`}
        ${d.layout!=='strip' ? `
        <div class="f-field full">
          <label>Candidate Instructions <span style="font-weight:400; color:var(--ink-soft);">— one per line${d.layout==='grid4'?' (kept short — this layout has limited space)':''}</span></label>
          <textarea id="twInstructions" rows="4" placeholder="e.g. Bring this admit card to every exam.">${d.instructionsText||''}</textarea>
        </div>` : ''}
        <div class="f-field full"><label>Footer Note</label><input type="text" id="twFooter" value="${d.footerNote||''}" placeholder="Optional remark shown at the bottom"></div>
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twGoStep(1)">Back</button>
        <button class="btn btn-primary" onclick="twCollectAdmitDetails()">Next</button>
      </div>
    `;
  }
  function twCollectAdmitDetails(){
    const name = document.getElementById('twName').value.trim();
    if(!name){ showToast('Enter a name for the report period.'); return; }
    twDraft.name = name;
    twDraft.titleOverride = document.getElementById('twTitle').value.trim();
    const cppEl = document.getElementById('twCardsPerPage');
    if(cppEl) twDraft.cardsPerPage = parseInt(cppEl.value);
    const instrEl = document.getElementById('twInstructions');
    if(instrEl) twDraft.instructionsText = instrEl.value;
    twDraft.footerNote = document.getElementById('twFooter').value.trim();
    twGoStep(3);
  }

  function twStepReportDetails(){
    const d = twDraft;
    const infoFields = d.infoFields || DEFAULT_INFO_FIELDS;
    return `
      <div class="profile-card" style="max-width:640px;">
        <div class="form-grid">
          <div class="f-field full"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="twName" value="${d.name}" placeholder="e.g. Half Yearly Format"></div>
          <div class="f-field full"><label>Title Override <span style="font-weight:400; color:var(--ink-soft);">— leave blank to use "REPORT CARD — [Exam Name]"</span></label><input type="text" id="twTitle" value="${d.titleOverride||''}" placeholder="e.g. HALF YEARLY PROGRESS REPORT"></div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Student Info Fields to Show</label>
        <div class="disc-checklist" style="max-height:200px; margin-bottom:6px; display:grid; grid-template-columns:1fr 1fr; gap:2px 10px;">
          ${INFO_FIELD_DEFS.map(f => `<label class="disc-check-item"><input type="checkbox" class="tw-infofield-check" value="${f.key}" ${infoFields[f.key]?'checked':''} ${f.key==='studentName'?'disabled checked':''}> ${f.label}</label>`).join('')}
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 1</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="twSig1" value="${d.signatureLabel1||'Class Teacher'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="twSig1Preview" src="${twSig1Data}" style="height:36px; ${twSig1Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="twPreviewSignature(event,1)"></label>
              ${twSig1Data ? `<button type="button" class="btn-danger-text" onclick="twClearSignature(1)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Signature 2</label>
        <div class="form-grid">
          <div class="f-field"><label>Label</label><input type="text" id="twSig2" value="${d.signatureLabel2||'Principal / Correspondent'}"></div>
          <div class="f-field">
            <label>Signature Image</label>
            <div style="display:flex; align-items:center; gap:10px;">
              <img id="twSig2Preview" src="${twSig2Data}" style="height:36px; ${twSig2Data?'':'display:none;'} border-bottom:1px solid var(--border);">
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;">Upload<input type="file" accept="image/*" style="display:none;" onchange="twPreviewSignature(event,2)"></label>
              ${twSig2Data ? `<button type="button" class="btn-danger-text" onclick="twClearSignature(2)">Remove</button>` : ''}
            </div>
          </div>
        </div>
        <div class="form-grid" style="margin-top:14px;">
          <div class="f-field full"><label>Footer Note</label><input type="text" id="twFooter" value="${d.footerNote||''}" placeholder="Optional remark shown at the bottom of the card"></div>
        </div>
        <div style="display:flex; gap:30px; margin:14px 0; flex-wrap:wrap;">
          <label class="admission-toggle"><input type="checkbox" id="twShowElective" ${d.showElective!==false?'checked':''}> Show "Elective" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="twShowNotCounted" ${d.showNotCounted!==false?'checked':''}> Show "Not counted" tag</label>
          <label class="admission-toggle"><input type="checkbox" id="twShowClassTopper" ${d.showClassTopper!==false?'checked':''}> Show Highest Marks in Class per subject</label>
          <label class="admission-toggle"><input type="checkbox" id="twShowRank" ${d.showRank!==false?'checked':''}> Show Class Rank (section-wise)</label>
        </div>
        ${d.layout==='modern' ? `
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin:14px 0 8px; display:block;">Co-Scholastic Areas <span style="font-weight:400; color:var(--ink-soft);">— each graded A–E</span></label>
        <div id="twCoschAreas">${(d.coScholasticAreas||DEFAULT_COSCHOLASTIC_AREAS).map((a,i) => `
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
            <input type="text" class="tw-cosch-area input" value="${a}" style="flex:1;">
            <button type="button" class="btn-danger-text" onclick="twRemoveCoschArea(${i})">Remove</button>
          </div>`).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="twAddCoschArea()">+ Add Area</button>
        <label class="admission-toggle" style="display:block; margin-top:14px;"><input type="checkbox" id="twShowDiscipline" ${d.showDiscipline!==false?'checked':''}> Show separate Discipline grade</label>
        ` : ''}
      </div>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twGoStep(1)">Back</button>
        <button class="btn btn-primary" onclick="twCollectReportDetails()">Next</button>
      </div>
    `;
  }
  function twAddCoschArea(){
    twSyncCoschAreasFromDom();
    twDraft.coScholasticAreas.push('New Area');
    renderTemplateWizard();
  }
  function twRemoveCoschArea(i){
    twSyncCoschAreasFromDom();
    twDraft.coScholasticAreas.splice(i,1);
    renderTemplateWizard();
  }
  function twSyncCoschAreasFromDom(){
    const inputs = document.querySelectorAll('.tw-cosch-area');
    if(inputs.length) twDraft.coScholasticAreas = Array.from(inputs).map(i => i.value.trim()).filter(Boolean);
    if(!twDraft.coScholasticAreas || !twDraft.coScholasticAreas.length) twDraft.coScholasticAreas = DEFAULT_COSCHOLASTIC_AREAS.slice();
  }
  function twPreviewSignature(e, which){
    readImageFileWithSizeLimit(e, dataUrl => {
      if(which===1){ twSig1Data = dataUrl; } else { twSig2Data = dataUrl; }
      renderTemplateWizard();
    });
  }
  function twClearSignature(which){
    if(which===1) twSig1Data=''; else twSig2Data='';
    renderTemplateWizard();
  }
  function twCollectReportDetails(){
    const name = document.getElementById('twName').value.trim();
    if(!name){ showToast('Enter a name for the report period.'); return; }
    twDraft.name = name;
    twDraft.titleOverride = document.getElementById('twTitle').value.trim();
    const infoFields = {};
    INFO_FIELD_DEFS.forEach(f => {
      infoFields[f.key] = f.key === 'studentName' ? true : document.querySelector(`.tw-infofield-check[value="${f.key}"]`).checked;
    });
    twDraft.infoFields = infoFields;
    twDraft.showAttendance = infoFields.attendance;
    twDraft.signatureLabel1 = document.getElementById('twSig1').value.trim() || 'Class Teacher';
    twDraft.signatureLabel2 = document.getElementById('twSig2').value.trim() || 'Principal / Correspondent';
    twDraft.sigImage1 = twSig1Data; twDraft.sigImage2 = twSig2Data;
    twDraft.footerNote = document.getElementById('twFooter').value.trim();
    twDraft.showElective = document.getElementById('twShowElective').checked;
    twDraft.showNotCounted = document.getElementById('twShowNotCounted').checked;
    twDraft.showClassTopper = document.getElementById('twShowClassTopper').checked;
    twDraft.showRank = document.getElementById('twShowRank').checked;
    if(twDraft.layout === 'modern'){
      twSyncCoschAreasFromDom();
      twDraft.showDiscipline = document.getElementById('twShowDiscipline').checked;
    }
    twGoStep(3);
  }

  function twStepReview(){
    const d = twDraft;
    const layoutName = (twLayoutDefs().find(l=>l.key===d.layout)||{}).name || d.layout;
    return `
      <div class="profile-card" style="max-width:600px;">
        <div class="profile-row"><span>Name</span><span>${d.name}</span></div>
        <div class="profile-row"><span>Layout</span><span>${layoutName}</span></div>
        <div class="profile-row"><span>Title</span><span>${d.titleOverride || '(default)'}</span></div>
        ${twKind==='admitcard' ? `<div class="profile-row"><span>Cards per Sheet</span><span>${d.cardsPerPage}</span></div>` : ''}
        ${twKind==='reportcard' && d.layout==='modern' ? `<div class="profile-row"><span>Co-Scholastic Areas</span><span>${(d.coScholasticAreas||[]).join(', ')}</span></div>` : ''}
        <div class="profile-row"><span>Footer Note</span><span>${d.footerNote || '—'}</span></div>
      </div>
      <p style="font-size:0.8rem; color:var(--ink-soft); margin-top:14px;">Review the details above, then save. You can edit this template again any time from the list.</p>
      <div class="modal-actions" style="margin-top:18px;">
        <button class="btn btn-ghost" onclick="twGoStep(2)">Back</button>
        <button class="btn btn-primary" onclick="twSaveTemplate()">${twEditingId ? 'Save Changes' : 'Create Template'}</button>
      </div>
    `;
  }
  async function twSaveTemplate(){
    const arr = twTemplates();
    if(twEditingId){
      const idx = arr.findIndex(x => x.id === twEditingId);
      if(idx > -1) arr[idx] = { ...arr[idx], ...twDraft, id: twEditingId };
    }else{
      twDraft.id = (twKind==='admitcard'?'ac_':'tmpl_') + Date.now();
      twDraft.isDefault = arr.length === 0;
      arr.push(twDraft);
    }
    await storageSet(twStorageKey(), arr);
    showToast('Template saved.', 'burst');
    twListView = true;
    renderTemplateWizard();
    if(document.getElementById('resultBody')) renderResultBody();
  }

  /* --- Exam Templates (which exams combine into a consolidated group) --- */
  let examTemplatesView = 'list';
  let editingExamGroupId = '';
  function renderExamTemplatesTab(body){
    if(examTemplatesView === 'edit') return renderExamGroupEditor(body);
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:680px;">
        Define named groups of exams — e.g. "2 Unit Tests" combining two unit tests, "Summative 1" for a single exam, or "Annual" combining all 6 exams for the year-end consolidated report. Each group gets its own combined percentage and grade using the Consolidation Scale.
      </p>
      <button class="btn btn-primary btn-sm" style="margin-bottom:16px;" onclick="openExamGroupEditor()">+ New Report Period</button>
      <div class="table-wrap" style="max-width:760px;">
        <table><thead><tr><th>Report Period</th><th>Exams Included</th><th></th></tr></thead>
        <tbody>
        ${examGroups.length ? examGroups.map(g => `<tr>
          <td class="name-cell">${g.name}</td>
          <td>${g.examIds.map(id => { const ex=examDefs.find(x=>x.id===id); return ex ? `<span class="pill">${ex.name}</span>` : ''; }).join(' ')}</td>
          <td><button class="btn-edit-text" onclick="openExamGroupEditor('${g.id}')">Edit</button>&nbsp;·&nbsp;<button class="btn-danger-text" onclick="deleteExamGroup('${g.id}')">Delete</button></td>
        </tr>`).join('') : `<tr><td colspan="3"><div class="empty-state"><b>No report periods yet</b>Click "+ New Report Period" to combine specific exams into a named group.</div></td></tr>`}
        </tbody></table>
      </div>
    `;
  }
  function openExamGroupEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingExamGroupId = id || '';
    examTemplatesView = 'edit';
    renderResultBody();
  }
  function backToExamTemplatesList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    examTemplatesView = 'list';
    renderResultBody();
  }
  function renderExamGroupEditor(body){
    const g = editingExamGroupId ? examGroups.find(x => x.id === editingExamGroupId) : null;
    const selectedIds = g ? g.examIds : [];
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToExamTemplatesList()">Report Periods</a> &nbsp;/&nbsp; ${g ? g.name : 'New Report Period'}</div>
      <div class="profile-card" style="max-width:520px;">
        <div class="f-field full" style="margin-bottom:14px;"><label>Report Period Name <span class="required-star">*</span></label><input type="text" id="egName" value="${g?g.name:''}" placeholder="e.g. 2 Unit Tests, Summative 1, Annual (All 6 Exams)"></div>
        <label style="font-size:0.8rem; font-weight:600; color:var(--navy); margin-bottom:8px; display:block;">Exams Included <span class="required-star">*</span></label>
        <div class="disc-checklist" style="max-height:220px; margin-bottom:16px;">
          ${examDefs.length ? examDefs.map(ex => `<label class="disc-check-item"><input type="checkbox" class="eg-exam-check" value="${ex.id}" ${selectedIds.includes(ex.id)?'checked':''}> ${ex.name}</label>`).join('') : `<div style="font-size:0.82rem; color:var(--ink-soft);">No exams created yet — add some under the "Exams" tab first.</div>`}
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-ghost" onclick="backToExamTemplatesList()">Cancel</button>
          <button class="btn btn-primary" onclick="saveExamGroup()">Save Report Period</button>
        </div>
      </div>
    `;
  }
  async function saveExamGroup(){
    const name = document.getElementById('egName').value.trim();
    const examIds = Array.from(document.querySelectorAll('.eg-exam-check:checked')).map(c => c.value);
    if(!name){ showToast('Enter a name for the report period.'); return; }
    if(examIds.length === 0){ showToast('Select at least one exam.'); return; }
    if(editingExamGroupId){
      const idx = examGroups.findIndex(x => x.id === editingExamGroupId);
      examGroups[idx] = { ...examGroups[idx], name, examIds };
    }else{
      examGroups.push({ id:'eg_'+Date.now(), name, examIds });
    }
    await storageSet(EXAM_GROUPS_KEY, examGroups);
    showToast('Report period saved.', 'burst');
    backToExamTemplatesList();
  }
  async function deleteExamGroup(id){
    if(!await showConfirmDialog('Delete this report period?')) return;
    examGroups = examGroups.filter(g => g.id !== id);
    await storageSet(EXAM_GROUPS_KEY, examGroups);
    renderExamTemplatesTab(document.getElementById('resultBody'));
  }

  /* --- Consolidation Scale (separate, editable grade bands for combined/grouped results) --- */
  function renderConsolidationScaleTab(body){
    body.innerHTML = `
      <p style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px; max-width:640px;">Grade boundaries used specifically for consolidated / combined exam-group results — kept separate from the per-exam Grading Scale so year-end consolidation can use different cutoffs if needed.</p>
      <div class="table-wrap" style="margin-bottom:16px; max-width:500px;">
        <table><thead><tr><th>Grade</th><th>Min %</th><th>Max %</th><th></th></tr></thead>
        <tbody>
        ${consolidationScale.map((g,i) => `<tr>
          <td><input type="text" class="input cs-grade" value="${g.grade}" style="max-width:80px;"></td>
          <td><input type="number" class="input cs-min" value="${g.minPct}" min="0" max="100" style="max-width:80px;"></td>
          <td><input type="number" class="input cs-max" value="${g.maxPct}" min="0" max="100" style="max-width:80px;"></td>
          <td><button class="btn-danger-text" onclick="removeConsolGradeRow(${i})">Remove</button></td>
        </tr>`).join('')}
        </tbody></table>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addConsolGradeRow()">+ Add Grade</button>
      <button class="btn btn-primary" onclick="saveConsolidationScale()" style="margin-left:10px;">Save Consolidation Scale</button>
    `;
  }
  function addConsolGradeRow(){
    consolidationScale.push({ grade:'', minPct:0, maxPct:0 });
    renderConsolidationScaleTab(document.getElementById('resultBody'));
  }
  function removeConsolGradeRow(i){
    consolidationScale.splice(i,1);
    renderConsolidationScaleTab(document.getElementById('resultBody'));
  }
  async function saveConsolidationScale(){
    const grades = document.querySelectorAll('.cs-grade');
    const mins = document.querySelectorAll('.cs-min');
    const maxs = document.querySelectorAll('.cs-max');
    for(let i=0;i<grades.length;i++){
      if(!grades[i].value.trim()) continue;
      const minV = Number(mins[i].value)||0, maxV = Number(maxs[i].value)||0;
      if(minV<0 || minV>100 || maxV<0 || maxV>100){
        showToast(`"${grades[i].value.trim()}" grade's Min/Max % must each be between 0 and 100.`);
        return;
      }
      if(minV>maxV){
        showToast(`"${grades[i].value.trim()}" grade's Min % can't be greater than its Max %.`);
        return;
      }
    }
    consolidationScale = Array.from(grades).map((el,i) => ({
      grade: el.value.trim(), minPct: Number(mins[i].value)||0, maxPct: Number(maxs[i].value)||0,
    })).filter(g => g.grade);
    await storageSet(CONSOLIDATION_SCALE_KEY, consolidationScale);
    showToast('Consolidation scale saved.', 'burst');
  }


  /* ===== ROOM ALLOTMENT MODULE (Hall Ticket Numbers, Class Selection, Rooms & Matrix, Final Printout, Notice Board) ===== */
  
/* Marks sheet: jump to the next box automatically once a mark is "complete" (typing one more
   digit could not give a valid mark), and on Enter / the phone keyboard's Next/Go key.
   Order = the order of boxes on the sheet (next student for a single-subject teacher). */
(function(){
  function nextBox(cur){
    const all = Array.from(document.querySelectorAll('.marks-input')).filter(i => !i.disabled && i.offsetParent !== null);
    const i = all.indexOf(cur);
    return i >= 0 ? all[i + 1] : null;
  }
  function go(cur){
    const n = nextBox(cur);
    if(n){ n.focus(); try{ n.select(); }catch(e){} }
    else { try{ cur.blur(); }catch(e){} }
  }
  document.addEventListener('input', function(e){
    const t = e.target;
    if(!t || !t.classList || !t.classList.contains('marks-input')) return;
    const it = e.inputType || '';
    if(it.indexOf('delete') === 0 || it === 'historyUndo') return;
    const raw = String(t.value || '');
    if(!raw || raw.indexOf('.') >= 0 || raw.indexOf('-') >= 0) return;
    const v = Number(raw), max = Number(t.max);
    if(!isFinite(v) || !isFinite(max) || max <= 0) return;
    if(v > max) return;                          // invalid: leave it so the sheet highlights it
    if(v * 10 > max) setTimeout(function(){ go(t); }, 60);
  }, true);
  document.addEventListener('keydown', function(e){
    const t = e.target;
    if(!t || !t.classList || !t.classList.contains('marks-input')) return;
    if(e.key === 'Enter'){ e.preventDefault(); go(t); }
  }, true);
  document.addEventListener('focusin', function(e){
    const t = e.target;
    if(t && t.classList && t.classList.contains('marks-input')){ try{ t.select(); }catch(x){} }
  });
})();
