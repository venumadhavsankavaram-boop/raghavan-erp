const SYLLABUS_TAB_PERM_KEYS = { tracker:'syllabus_tracker', homework:'syllabus_homework' };
  let syllabusTab = 'tracker';
  let syClass = '', sySection = '', sySubject = '';
  function initSyllabusView(){
    const accessibleTabs = Object.keys(SYLLABUS_TAB_PERM_KEYS).filter(t => getSyllabusTabAccess(currentUser.role, SYLLABUS_TAB_PERM_KEYS[t]));
    Object.keys(SYLLABUS_TAB_PERM_KEYS).forEach(t => { const btn = document.getElementById('sytab-'+t); if(btn) btn.style.display = accessibleTabs.includes(t) ? '' : 'none'; });
    if(!accessibleTabs.includes(syllabusTab)) syllabusTab = accessibleTabs[0] || 'tracker';
    switchSyllabusTab(syllabusTab);
  }
  function switchSyllabusTab(tab){
    syllabusTab = tab;
    ['tracker','homework'].forEach(t => { const btn = document.getElementById('sytab-'+t); if(btn) btn.classList.toggle('active', t===tab); });
    renderSyllabusBody();
  }
  function renderSyllabusBody(){
    const body = document.getElementById('syllabusBody');
    if(!body) return;
    if(!getSyllabusTabAccess(currentUser.role, SYLLABUS_TAB_PERM_KEYS[syllabusTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(syllabusTab === 'tracker') return renderSyllabusTrackerTab(body);
    if(syllabusTab === 'homework') return renderHomeworkTab(body);
  }
  function syFilterBarHtml(){
    return `
      <div class="form-grid" style="max-width:640px; margin-bottom:16px;">
        <div class="f-field"><label>Class</label><select onchange="syClass=this.value; sySection=''; sySubject=''; renderSyllabusBody();"><option value="">All Classes</option>${CLASS_LEVELS.map(c => `<option ${c===syClass?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="f-field"><label>Section</label><select onchange="sySection=this.value; renderSyllabusBody();" ${!syClass?'disabled':''}><option value="">All Sections</option>${(syClass?sectionsForClass(syClass):[]).map(s => `<option ${s===sySection?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="f-field"><label>Subject</label><select onchange="sySubject=this.value; renderSyllabusBody();" ${!syClass?'disabled':''}><option value="">All Subjects</option>${[...new Set(subjectsList.filter(s=>s.className===syClass).map(s=>s.name))].map(n => `<option ${n===sySubject?'selected':''}>${n}</option>`).join('')}</select></div>
      </div>
    `;
  }
  function syllabusStatusPill(status){
    const color = status==='Completed' ? 'var(--success-ink)' : status==='In Progress' ? 'var(--warning-ink)' : 'var(--ink-soft)';
    const bg = status==='Completed' ? 'var(--success-bg)' : status==='In Progress' ? 'var(--warning-bg)' : 'rgba(0,0,0,0.06)';
    return `<span class="pill" style="background:${bg}; color:${color};">${status||'Not Started'}</span>`;
  }
  function renderSyllabusTrackerTab(body){
    const canEdit = canSub('syllabus_tracker','syllabus','edit');
    const rows = syllabusTopics.filter(t => (!syClass || t.className===syClass) && (!sySection || !t.section || t.section===sySection) && (!sySubject || t.subject===sySubject))
      .sort((a,b) => (a.className+a.subject).localeCompare(b.className+b.subject) || (a.targetDate||'').localeCompare(b.targetDate||''));
    body.innerHTML = `
      ${syFilterBarHtml()}
      ${canEdit ? `<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" ${!syClass?'disabled title="Pick a class first"':''} onclick="openSyllabusTopicModal()">+ Add Topic</button>` : ''}
      ${rows.length ? `
      <div class="table-wrap">
        <table><thead><tr><th>Class/Section</th><th>Subject</th><th>Topic</th><th>Status</th><th>Target Date</th>${canEdit?'<th></th>':''}</tr></thead><tbody>
        ${rows.map(t => `
          <tr>
            <td>${t.className}${t.section?' — '+t.section:' — All Sections'}</td>
            <td>${t.subject}</td>
            <td>${t.topic}</td>
            <td>${syllabusStatusPill(t.status)}</td>
            <td>${t.targetDate||'—'}</td>
            ${canEdit ? `<td style="white-space:nowrap;"><button class="btn-edit-text" onclick="openSyllabusTopicModal('${t.id}')">Edit</button> · <button class="btn-danger-text" onclick="deleteSyllabusTopic('${t.id}')">Delete</button></td>` : ''}
          </tr>`).join('')}
        </tbody></table>
      </div>` : `<div class="empty-state"><b>No syllabus topics yet</b>${syClass ? 'Add the first topic for '+syClass+'.' : 'Pick a class above, then add topics — or leave it on All Classes to see everything at once.'}</div>`}
    `;
  }
  let syEditId = '';
  function openSyllabusTopicModal(id){
    if(!syClass){ showToast('Pick a class first.'); return; }
    syEditId = id || '';
    const t = id ? syllabusTopics.find(x => x.id===id) : null;
    document.getElementById('syTopicModalTitle').textContent = id ? 'Edit Topic' : 'Add Syllabus Topic';
    document.getElementById('syTopicClassLabel').textContent = syClass;
    const sectionSel = document.getElementById('syTopicSection');
    sectionSel.innerHTML = `<option value="">All Sections</option>` + sectionsForClass(syClass).map(s => `<option ${t&&t.section===s?'selected':''}>${s}</option>`).join('');
    const subjSel = document.getElementById('syTopicSubject');
    const classSubjects = subjectsList.filter(s => s.className===syClass);
    subjSel.innerHTML = `<option value="">Select subject</option>` + classSubjects.map(s => `<option ${t&&t.subject===s.name?'selected':''}>${s.name}</option>`).join('');
    document.getElementById('syTopicName').value = t ? t.topic : '';
    document.getElementById('syTopicStatus').value = t ? (t.status||'Not Started') : 'Not Started';
    document.getElementById('syTopicTargetDate').value = t ? (t.targetDate||'') : '';
    document.getElementById('syTopicNotes').value = t ? (t.notes||'') : '';
    document.getElementById('syTopicModalOverlay').classList.add('open');
  }
  function closeSyllabusTopicModal(){ document.getElementById('syTopicModalOverlay').classList.remove('open'); }
  async function saveSyllabusTopic(e){
    e.preventDefault();
    const subject = document.getElementById('syTopicSubject').value;
    const topic = document.getElementById('syTopicName').value.trim();
    if(!subject || !topic){ showToast('Subject and topic are required.'); return false; }
    const existing = syEditId ? syllabusTopics.find(x => x.id===syEditId) : null;
    const status = document.getElementById('syTopicStatus').value;
    const data = {
      className: syClass,
      section: document.getElementById('syTopicSection').value,
      subject, topic, status,
      targetDate: document.getElementById('syTopicTargetDate').value,
      completedDate: status === 'Completed' ? ((existing && existing.status === 'Completed' && existing.completedDate) ? existing.completedDate : new Date().toISOString().slice(0,10)) : '',
      notes: document.getElementById('syTopicNotes').value.trim(),
      updatedAt: new Date().toISOString(),
    };
    if(existing){
      const idx = syllabusTopics.findIndex(x => x.id===syEditId);
      syllabusTopics[idx] = { ...existing, ...data };
    }else{
      syllabusTopics.push({ id:'syt_'+Date.now(), ...data });
    }
    await storageSet(SYLLABUS_KEY, syllabusTopics);
    closeSyllabusTopicModal();
    renderSyllabusBody();
    showToast('Saved.', 'burst');
    return false;
  }
  async function deleteSyllabusTopic(id){
    if(!await showConfirmDialog('Remove this syllabus topic?')) return;
    syllabusTopics = syllabusTopics.filter(x => x.id!==id);
    await storageSet(SYLLABUS_KEY, syllabusTopics);
    renderSyllabusBody();
  }
  function renderHomeworkTab(body){
    const canEdit = canSub('syllabus_homework','syllabus','edit');
    const today = new Date().toISOString().slice(0,10);
    const rows = homeworkItems.filter(h => (!syClass || h.className===syClass) && (!sySection || !h.section || h.section===sySection) && (!sySubject || h.subject===sySubject))
      .sort((a,b) => (b.dueDate||'').localeCompare(a.dueDate||''));
    body.innerHTML = `
      ${syFilterBarHtml()}
      ${canEdit ? `<button class="btn btn-primary btn-sm" style="margin-bottom:16px;" ${!syClass?'disabled title="Pick a class first"':''} onclick="openHomeworkModal()">+ Assign Homework</button>` : ''}
      ${rows.length ? `
      <div class="table-wrap">
        <table><thead><tr><th>Class/Section</th><th>Subject</th><th>Title</th><th>Assigned</th><th>Due</th><th></th>${canEdit?'<th></th>':''}</tr></thead><tbody>
        ${rows.map(h => {
          const overdue = h.dueDate && h.dueDate < today;
          return `<tr>
            <td>${h.className}${h.section?' — '+h.section:' — All Sections'}</td>
            <td>${h.subject}</td>
            <td>${h.title}${(h.attachments||[]).map(a => `<br><a href="${a.dataUrl}" target="_blank" rel="noopener" class="pill" style="text-decoration:none; font-size:0.68rem;">📎 ${a.name}</a>`).join('')}</td>
            <td>${h.assignedDate||'—'}</td>
            <td>${h.dueDate ? `<span style="${overdue?'color:var(--magenta); font-weight:600;':''}">${h.dueDate}${overdue?' (overdue)':''}</span>` : '—'}</td>
            <td><button class="btn-edit-text" onclick="openHomeworkRoster('${h.id}')">Roster</button></td>
            ${canEdit ? `<td style="white-space:nowrap;"><button class="btn-edit-text" onclick="openHomeworkModal('${h.id}')">Edit</button> · <button class="btn-danger-text" onclick="deleteHomework('${h.id}')">Delete</button></td>` : ''}
          </tr>`;
        }).join('')}
        </tbody></table>
      </div>` : `<div class="empty-state"><b>No homework assigned yet</b>${syClass ? 'Assign the first item for '+syClass+'.' : 'Pick a class above, then assign homework — or leave it on All Classes to see everything at once.'}</div>`}
    `;
  }
  let hwEditId = '';
  function openHomeworkModal(id){
    if(!syClass){ showToast('Pick a class first.'); return; }
    hwEditId = id || '';
    const h = id ? homeworkItems.find(x => x.id===id) : null;
    document.getElementById('homeworkModalTitle').textContent = id ? 'Edit Homework' : 'Assign Homework';
    document.getElementById('hwClassLabel').textContent = syClass;
    const sectionSel = document.getElementById('hwSection');
    sectionSel.innerHTML = `<option value="">All Sections</option>` + sectionsForClass(syClass).map(s => `<option ${h&&h.section===s?'selected':''}>${s}</option>`).join('');
    const subjSel = document.getElementById('hwSubject');
    const classSubjects = subjectsList.filter(s => s.className===syClass);
    subjSel.innerHTML = `<option value="">Select subject</option>` + classSubjects.map(s => `<option ${h&&h.subject===s.name?'selected':''}>${s.name}</option>`).join('');
    const staffSel = document.getElementById('hwStaff');
    const myStaffRecord = staffList.find(st => st.linkedUserId === currentUser.id);
    const defaultStaffId = h ? h.staffId : (myStaffRecord ? myStaffRecord.id : '');
    staffSel.innerHTML = `<option value="">Select teacher</option>` + staffList.filter(staffIsActive).map(st => `<option value="${st.id}" ${st.id===defaultStaffId?'selected':''}>${st.firstName} ${st.lastName}</option>`).join('');
    document.getElementById('hwTitle').value = h ? h.title : '';
    document.getElementById('hwDescription').value = h ? (h.description||'') : '';
    document.getElementById('hwAssignedDate').value = h ? (h.assignedDate||'') : new Date().toISOString().slice(0,10);
    document.getElementById('hwDueDate').value = h ? (h.dueDate||'') : '';
    hwAttachments = h && Array.isArray(h.attachments) ? h.attachments.map(a => ({ name:a.name, dataUrl:a.dataUrl, size:0 })) : [];
    renderHwAttachmentPreview();
    document.getElementById('homeworkModalOverlay').classList.add('open');
  }
  function closeHomeworkModal(){ document.getElementById('homeworkModalOverlay').classList.remove('open'); }
  // Same {name, dataUrl, size} shape and 5-file/12MB-combined caps as the
  // student submission attachments above — one teacher-facing upload of the
  // same kind, just attached to the homework item itself instead of a
  // student's response to it.
  let hwAttachments = [];
  function previewHwAttachment(e){
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if(!files.length) return;
    const currentTotal = hwAttachments.reduce((sum,a) => sum + (a.size||0), 0);
    let runningTotal = currentTotal;
    const toRead = [];
    for(const file of files){
      if(hwAttachments.length + toRead.length >= MAX_SUBMISSION_FILES){
        showToast('You can attach up to ' + MAX_SUBMISSION_FILES + ' files.');
        break;
      }
      if(file.size > MAX_SUBMISSION_FILE_BYTES){
        showToast(file.name + ' is over 5MB — please choose a smaller file.');
        continue;
      }
      if(runningTotal + file.size > MAX_SUBMISSION_TOTAL_BYTES){
        showToast('That would put your combined attachments over 12MB — please choose smaller or fewer files.');
        break;
      }
      runningTotal += file.size;
      toRead.push(file);
    }
    if(!toRead.length) return;
    let pending = toRead.length;
    toRead.forEach(file => {
      const reader = new FileReader();
      reader.onload = evt => {
        hwAttachments.push({ name: file.name, dataUrl: evt.target.result, size: file.size });
        pending--;
        if(pending === 0) renderHwAttachmentPreview();
      };
      reader.readAsDataURL(file);
    });
  }
  function renderHwAttachmentPreview(){
    const preview = document.getElementById('hwAttachmentPreview');
    if(!preview) return;
    preview.innerHTML = hwAttachments.map((a,i) => `
      <span class="pill" style="margin:0 6px 6px 0; display:inline-flex; align-items:center; gap:6px;">
        📎 ${a.name}
        <a href="javascript:void(0)" onclick="removeHwAttachment(${i})" style="color:var(--magenta); text-decoration:none; font-weight:700;">✕</a>
      </span>
    `).join('');
  }
  function removeHwAttachment(i){
    hwAttachments.splice(i, 1);
    renderHwAttachmentPreview();
  }
  async function saveHomework(e){
    e.preventDefault();
    const subject = document.getElementById('hwSubject').value;
    const title = document.getElementById('hwTitle').value.trim();
    if(!subject || !title){ showToast('Subject and title are required.'); return false; }
    const data = {
      className: syClass,
      section: document.getElementById('hwSection').value,
      subject, title,
      description: document.getElementById('hwDescription').value.trim(),
      assignedDate: document.getElementById('hwAssignedDate').value,
      dueDate: document.getElementById('hwDueDate').value,
      staffId: document.getElementById('hwStaff').value,
      attachments: hwAttachments.map(a => ({ name:a.name, dataUrl:a.dataUrl })),
      updatedAt: new Date().toISOString(),
    };
    if(hwEditId){
      const idx = homeworkItems.findIndex(x => x.id===hwEditId);
      if(idx>-1) homeworkItems[idx] = { ...homeworkItems[idx], ...data };
    }else{
      homeworkItems.push({ id:'hw_'+Date.now(), createdAt: new Date().toISOString(), ...data });
    }
    await storageSet(HOMEWORK_KEY, homeworkItems);
    closeHomeworkModal();
    renderSyllabusBody();
    showToast('Saved.', 'burst');
    return false;
  }
  async function deleteHomework(id){
    if(!await showConfirmDialog('Remove this homework item?')) return;
    homeworkItems = homeworkItems.filter(x => x.id!==id);
    await storageSet(HOMEWORK_KEY, homeworkItems);
    renderSyllabusBody();
  }
  // Who's turned this homework in — every active student in its class(+section)
  // cross-referenced against student_submissions for this homework_id, resolved
  // server-side (see GET /api/homework-items/:id/roster) since that join isn't
  // data this page already has lying around.
  async function openHomeworkRoster(id){
    document.getElementById('hwRosterSubtitle').textContent = '';
    document.getElementById('hwRosterBody').innerHTML = `<p style="font-size:0.85rem; color:var(--ink-soft);">Loading…</p>`;
    document.getElementById('hwRosterModalOverlay').classList.add('open');
    try{
      const res = await throwIfNotOk(await fetch('/api/homework-items/'+encodeURIComponent(id)+'/roster', { headers: actorHeaders() }));
      const { homework, roster } = await res.json();
      document.getElementById('hwRosterSubtitle').textContent = `${homework.subject} — ${homework.title} (${homework.className}${homework.section?' — '+homework.section:''})`;
      const statusLabel = st => st==='not_submitted' ? 'Not submitted' : st==='resubmit' ? 'Needs Resubmission' : st==='reviewed' ? 'Reviewed' : 'Submitted';
      const statusColor = st => st==='not_submitted' ? 'color:var(--ink-soft);' : st==='resubmit' ? 'background:rgba(209,16,115,0.15); color:var(--magenta);' : st==='reviewed' ? 'background:rgba(19,145,127,0.15); color:var(--teal);' : '';
      const sorted = [...roster].sort((a,b) => (a.studentName||'').localeCompare(b.studentName||''));
      const submittedCount = roster.filter(r => r.status !== 'not_submitted').length;
      document.getElementById('hwRosterBody').innerHTML = `
        <p style="font-size:0.8rem; color:var(--ink-soft); margin:0 0 12px;">${submittedCount} of ${roster.length} student(s) have submitted.</p>
        <div class="table-wrap">
          <table><thead><tr><th>Student</th><th>Section</th><th>Status</th><th>Marks</th></tr></thead><tbody>
          ${sorted.map(r => `<tr>
            <td>${r.studentName}</td><td>${r.section||'—'}</td>
            <td><span class="pill" style="${statusColor(r.status)}">${statusLabel(r.status)}</span></td>
            <td>${r.marks||'—'}</td>
          </tr>`).join('')}
          </tbody></table>
        </div>
      `;
    }catch(e){
      document.getElementById('hwRosterBody').innerHTML = `<div class="empty-state"><b>Could not load the roster</b>${e.message||''}</div>`;
    }
  }
  function closeHomeworkRoster(){ document.getElementById('hwRosterModalOverlay').classList.remove('open'); }

  function initMyAccountView(){
    myAccountPhotoData = currentUser ? (currentUser.photo || '') : '';
    renderMyAccountBody();
  }
  function renderMyAccountBody(){
    const body = document.getElementById('myAccountBody');
    if(!body) return;
    if(!currentUser){ body.innerHTML = `<div class="empty-state"><b>Account not found</b></div>`; return; }
    const u = currentUser;
    // Falls back to the Staff-record photo until the person uploads their own.
    const shown = myAccountPhotoData || myAvatarPhoto();
    const fromStaff = !myAccountPhotoData && !!shown;
    body.innerHTML = `
      <section class="acct-hero">
        <div class="acct-avatar">
          ${shown ? `<img src="${shown}" alt="Your photo">` : `<span>${myInitials()}</span>`}
          <label class="acct-cam" title="Change photo" aria-label="Change photo">📷
            <input type="file" accept="image/*" hidden onchange="previewMyAccountPhoto(event)"></label>
        </div>
        <div class="acct-id">
          <h2>${escapeHtml(u.name || '')}</h2>
          <div><span class="pill">${escapeHtml(u.role)}</span> <span class="acct-user">@${escapeHtml(u.username)}</span></div>
          <small>${fromStaff ? 'Showing the photo from your staff record. Upload one here to use your own.' : 'Tap the camera to change your photo. Save to keep it.'}</small>
        </div>
        ${myAccountPhotoData ? `<button type="button" class="sf-btn sf-btn--danger" onclick="removeMyAccountPhoto()">Remove photo</button>` : ''}
      </section>
      <div class="acct-grid">
        <section class="acct-card">
          <h3>Profile</h3>
          <div class="f-field"><label for="myAccountName">Full name</label><input type="text" class="input" id="myAccountName" value="${escapeHtml(u.name || '')}"></div>
          <div class="acct-row2">
            <div class="f-field"><label>Username</label><input type="text" class="input" value="${escapeHtml(u.username)}" disabled></div>
            <div class="f-field"><label>Role</label><input type="text" class="input" value="${escapeHtml(u.role)}" disabled></div>
          </div>
          <button type="button" class="sf-btn sf-btn--primary sf-btn--lg" onclick="saveMyAccountProfile()">Save profile</button>
        </section>
        <section class="acct-card">
          <h3>🔑 Change password</h3>
          <p class="acct-hint">Choose something only you know and that is hard to guess: at least 8 characters for Admin and Principal, 6 for everyone else.</p>
          <div class="f-field"><label for="myCpCurrent">Current password</label><input type="password" class="input" id="myCpCurrent" autocomplete="current-password"></div>
          <div class="f-field"><label for="myCpNew">New password</label><input type="password" class="input" id="myCpNew" autocomplete="new-password"></div>
          <div class="f-field"><label for="myCpConfirm">Confirm new password</label><input type="password" class="input" id="myCpConfirm" autocomplete="new-password"></div>
          <label class="acct-show"><input type="checkbox" onchange="['myCpCurrent','myCpNew','myCpConfirm'].forEach(i=>document.getElementById(i).type=this.checked?'text':'password')"> Show passwords</label>
          <button type="button" class="sf-btn sf-btn--soft sf-btn--lg" onclick="changePasswordFromMyAccount()">Update password</button>
        </section>
        ${(u.role === 'Admin' || u.role === 'Principal') && u.id !== 'vendor-support' ? '<section class="acct-card" id="twofaCard"><h3>🛡️ Two-step sign-in</h3><p class="acct-hint">Loading…</p></section>' : ''}
      </div>`;
    if(document.getElementById('twofaCard')) loadTwofaCard();
  }
  function previewMyAccountPhoto(e){
    readAndCompressImage(e, dataUrl => {
      myAccountPhotoData = dataUrl;
      renderMyAccountBody();
    }, { maxDim: 480, quality: 0.82 });
  }
  function removeMyAccountPhoto(){
    myAccountPhotoData = '';
    renderMyAccountBody();
  }
  // Own-account changes go through /api/account/*, which every signed-in role
  // may use for their OWN record (the generic users API is Admin-only).
  async function saveMyAccountProfile(){
    const name = document.getElementById('myAccountName').value.trim();
    if(!name){ showToast('Enter your name.'); return; }
    try{
      const res = await fetch('/api/account/profile', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, photo: myAccountPhotoData }) });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){ showToast(data.error || 'Could not save your profile.'); return; }
    }catch(e){ showToast('Could not reach the server. Try again.'); return; }
    currentUser.name = name;
    currentUser.photo = myAccountPhotoData;
    const rec = users.find(x => x.id === currentUser.id);
    if(rec){ rec.name = name; rec.photo = myAccountPhotoData; }
    document.getElementById('sbUserName').textContent = name;
    updateSidebarAvatar();
    renderMyAccountBody();
    showToast('Profile updated.', 'burst');
  }
  async function changePasswordFromMyAccount(){
    const current = document.getElementById('myCpCurrent').value;
    const next = document.getElementById('myCpNew').value;
    const confirm2 = document.getElementById('myCpConfirm').value;
    if(!current){ showToast('Enter your current password.'); return; }
    { const pp = passwordProblemClient(next, currentUser && currentUser.role); if(pp){ showToast(pp); return; } }
    if(next !== confirm2){ showToast('New password and confirmation do not match.'); return; }
    try{
      const res = await fetch('/api/account/password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ current, next }) });
      const data = await res.json().catch(() => ({}));
      if(!res.ok){ showToast(data.error || 'Could not update the password.'); return; }
    }catch(e){ showToast('Could not reach the server. Try again.'); return; }
    ['myCpCurrent','myCpNew','myCpConfirm'].forEach(id => { document.getElementById(id).value = ''; });
    showToast('Password updated.', 'burst');
  }


  /* ---- Two-step sign-in card (My Account, Admin & Principal) ---- */
  let twofaState = null;
  async function twofaApi(path, body){
    try{
      const r = await fetch('/api/account/2fa' + path, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      return { ok: r.ok, data: d };
    }catch(e){ return { ok:false, data:{ error:'Could not reach the server. Try again.' } }; }
  }
  async function loadTwofaCard(view){
    const box = document.getElementById('twofaCard'); if(!box) return;
    if(view){ renderTwofaCard(view); return; }
    const r = await twofaApi('');
    twofaState = r.ok ? r.data : null;
    renderTwofaCard();
  }
  function renderTwofaCard(view){
    const box = document.getElementById('twofaCard'); if(!box) return;
    const st = twofaState;
    if(!st || !st.allowed){ box.style.display = 'none'; return; }
    const h = '<h3>🛡️ Two-step sign-in</h3>';
    if(view && view.codes){
      box.innerHTML = h + `<p class="acct-hint"><b>Two-step sign-in is ON.</b> Save these recovery codes now — each works once if you lose your phone. They will not be shown again.</p>
        <pre id="twofaCodes" style="background:rgba(0,0,0,.05);padding:12px;border-radius:10px;font-size:1rem;letter-spacing:1px;user-select:all;">${view.codes.join('\n')}</pre>
        <button type="button" class="sf-btn sf-btn--soft" onclick="navigator.clipboard&&navigator.clipboard.writeText(document.getElementById('twofaCodes').textContent).then(()=>showToast('Copied.'))">Copy codes</button>
        <button type="button" class="sf-btn sf-btn--primary" onclick="loadTwofaCard()">I have saved them</button>`;
      return;
    }
    if(view && view.step === 'app'){
      box.innerHTML = h + `<ol class="acct-hint" style="padding-left:18px;line-height:1.7;">
        <li>Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).</li>
        <li>In the app tap <b>+</b>, then scan this picture — or choose "enter a setup key" and type the key below.</li></ol>
        <div id="twofaQr" style="background:#fff;display:inline-block;padding:10px;border-radius:10px;min-height:40px;"></div>
        <p class="acct-hint" style="word-break:break-all;">Setup key: <b style="user-select:all">${view.secret}</b></p>
        <div class="f-field"><label for="twofaConfirmCode">3. Type the 6-digit code the app shows</label><input type="text" class="input" id="twofaConfirmCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></div>
        <button type="button" class="sf-btn sf-btn--primary" onclick="confirmTwofa()">Turn ON</button>
        <button type="button" class="sf-btn sf-btn--soft" onclick="loadTwofaCard()">Cancel</button>`;
      try{
        const draw = () => { const el = document.getElementById('twofaQr'); if(el && window.QRCode){ el.innerHTML = ''; new QRCode(el, { text: view.otpauth, width: 170, height: 170 }); } };
        if(window.QRCode) draw(); else { const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; sc.onload = draw; sc.onerror = () => { const el = document.getElementById('twofaQr'); if(el) el.textContent = '(picture could not load — use the setup key)'; }; document.head.appendChild(sc); }
      }catch(e){}
      return;
    }
    if(view && view.step === 'email'){
      box.innerHTML = h + `<p class="acct-hint">We sent a code to <b>${escapeHtml(view.masked)}</b>. Type it below.</p>
        <div class="f-field"><input type="text" class="input" id="twofaConfirmCode" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"></div>
        <button type="button" class="sf-btn sf-btn--primary" onclick="confirmTwofa()">Turn ON</button>
        <button type="button" class="sf-btn sf-btn--soft" onclick="loadTwofaCard()">Cancel</button>`;
      return;
    }
    if(view && view.step === 'choose'){
      box.innerHTML = h + `<p class="acct-hint">Choose how you want to confirm each sign-in. Enter your password to continue.</p>
        <div class="f-field"><label for="twofaPw">Your password</label><input type="password" class="input" id="twofaPw" autocomplete="current-password"></div>
        <button type="button" class="sf-btn sf-btn--primary" onclick="startTwofa('app')">📱 Authenticator app</button>
        ${st.emailAvailable ? `<div class="f-field" style="margin-top:12px;"><label for="twofaEmail">Or by email — your email address</label><input type="email" class="input" id="twofaEmail" placeholder="you@example.com"></div><button type="button" class="sf-btn sf-btn--soft" onclick="startTwofa('email')">✉️ Email me a code each time</button>`
          : `<p class="acct-hint" style="margin-top:12px;">✉️ Code by email will appear here once your school's email sending is set up.</p>`}
        <button type="button" class="sf-btn sf-btn--soft" style="margin-top:10px;" onclick="loadTwofaCard()">Cancel</button>`;
      return;
    }
    if(view && view.step === 'off'){
      box.innerHTML = h + `<p class="acct-hint">To turn it off, enter your password and ${st.method === 'email' ? 'one of your recovery codes' : 'the current 6-digit code from your app (or a recovery code)'}.</p>
        <div class="f-field"><label for="twofaPw">Your password</label><input type="password" class="input" id="twofaPw" autocomplete="current-password"></div>
        <div class="f-field"><label for="twofaOffCode">Code</label><input type="text" class="input" id="twofaOffCode" autocomplete="one-time-code" maxlength="14"></div>
        <button type="button" class="sf-btn sf-btn--danger" onclick="disableTwofa()">Turn OFF</button>
        <button type="button" class="sf-btn sf-btn--soft" onclick="loadTwofaCard()">Keep it ON</button>`;
      return;
    }
    box.innerHTML = h + `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
        <label class="twofa-switch" style="display:inline-flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;">
          <input type="checkbox" ${st.enabled ? 'checked' : ''} onchange="this.checked=${st.enabled ? 'true' : 'false'}; toggleTwofa(${st.enabled ? 'false' : 'true'})" style="width:20px;height:20px;">
          <span>${st.enabled ? 'ON' : 'OFF'}</span></label>
        <span class="pill">${st.enabled ? (st.method === 'email' ? 'Code by email' : 'Authenticator app') : 'Not protected'}</span></div>
      <p class="acct-hint">${st.enabled
        ? 'Each time you sign in you will also enter a 6-digit code. Recovery codes left: <b>' + st.recoveryLeft + '</b>.' + (st.recoveryLeft <= 2 ? ' <b style="color:var(--magenta)">Running low — turn it off and on again to get new codes.</b>' : '')
        : 'Adds a second check when you sign in, so a stolen password alone cannot open this account. Recommended for Admin and Principal.'}</p>`;
  }
  // Shown when the school requires two-step sign-in and this Admin/Principal has not set it up yet.
  function showForcedTwofaSetup(){
    return new Promise(resolve => {
      const old = document.getElementById('forcedTwofaOverlay'); if(old) old.remove();
      const o = document.createElement('div');
      o.id = 'forcedTwofaOverlay';
      o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.78);display:flex;align-items:center;justify-content:center;padding:16px;';
      o.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:460px;width:100%;max-height:92vh;overflow:auto;padding:22px;display:grid;gap:12px;">
        <h3 style="margin:0;">Set up two-step sign-in</h3>
        <p style="margin:0;font-size:.85rem;color:#555;">Your school now requires a second check at sign-in for Admin and Principal accounts. It takes about a minute. You can use the app after this step.</p>
        <div id="twofaCard"></div>
        <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost" id="ftwSignOut">Sign out</button>
          <button type="button" class="btn btn-primary" id="ftwContinue" disabled>I have saved my codes — continue</button>
        </div></div>`;
      document.body.appendChild(o);
      loadTwofaCard();
      const cont = o.querySelector('#ftwContinue');
      const t = setInterval(() => { if(currentUser && currentUser.twofaEnabled) cont.disabled = false; }, 400);
      cont.onclick = () => { clearInterval(t); o.remove(); resolve(true); };
      o.querySelector('#ftwSignOut').onclick = () => { clearInterval(t); o.remove(); try{ logout(); }catch(e){ location.reload(); } };
    });
  }
  function toggleTwofa(turnOn){ renderTwofaCard({ step: turnOn ? 'choose' : 'off' }); }
  async function startTwofa(method){
    const password = (document.getElementById('twofaPw') || {}).value || '';
    if(!password){ showToast('Enter your password.'); return; }
    const email = method === 'email' ? ((document.getElementById('twofaEmail') || {}).value || '').trim() : '';
    const r = await twofaApi('/start', { method, password, email });
    if(!r.ok){ showToast(r.data.error || 'Could not start.'); return; }
    renderTwofaCard(method === 'app' ? { step:'app', secret: r.data.secret, otpauth: r.data.otpauth } : { step:'email', masked: r.data.emailMasked });
  }
  async function confirmTwofa(){
    const code = ((document.getElementById('twofaConfirmCode') || {}).value || '').trim();
    if(!code){ showToast('Enter the code.'); return; }
    const r = await twofaApi('/confirm', { code });
    if(!r.ok){ showToast(r.data.error || 'That code is not right.'); return; }
    twofaState = { ...twofaState, enabled:true, method:r.data.method, recoveryLeft: r.data.recoveryCodes.length };
    if(currentUser) currentUser.twofaEnabled = true;
    renderTwofaCard({ codes: r.data.recoveryCodes });
    showToast('Two-step sign-in is ON.', 'burst');
  }
  async function disableTwofa(){
    const password = (document.getElementById('twofaPw') || {}).value || '';
    const code = ((document.getElementById('twofaOffCode') || {}).value || '').trim();
    if(!password || !code){ showToast('Enter your password and a code.'); return; }
    const r = await twofaApi('/disable', { password, code });
    if(!r.ok){ showToast(r.data.error || 'Could not turn it off.'); return; }
    if(currentUser) currentUser.twofaEnabled = false;
    showToast('Two-step sign-in is OFF.');
    loadTwofaCard();
  }
  Object.assign(window, { loadTwofaCard, toggleTwofa, startTwofa, confirmTwofa, disableTwofa });

  function initInventoryView(){
    inventoryTab = getInventoryTabAccess(currentUser.role, 'inventory_items') ? 'items'
      : getInventoryTabAccess(currentUser.role, 'inventory_approvals') ? 'approvals'
      : getInventoryTabAccess(currentUser.role, 'inventory_saleshistory') ? 'saleshistory'
      : getInventoryTabAccess(currentUser.role, 'inventory_stockoverview') ? 'stockoverview'
      : 'items';
    invItemsView = 'list'; invQuickOpen = false;
    renderInventoryBody();
  }
  function switchInventoryTab(tab){
    inventoryTab = tab;
    invQuickOpen = false;
    renderInventoryBody();
  }
  function toggleInvQuickMenu(e){
    if(e) e.stopPropagation();
    invQuickOpen = !invQuickOpen;
    renderInventoryItemsList(document.getElementById('inventoryBody'));
  }
  function pendingInventoryApprovalsCount(){
    return pendingApprovals.filter(a => a.type==='inventory_item' && a.status==='Pending').length;
  }
  const INV_TAB_PERM_KEYS = { items:'inventory_items', sellcart:'inventory_sell', sellcheckout:'inventory_sell', approvals:'inventory_approvals', saleshistory:'inventory_saleshistory', stockoverview:'inventory_stockoverview' };
  function renderInventoryBody(){
    const body = document.getElementById('inventoryBody');
    if(!body) return;
    if(!getInventoryTabAccess(currentUser.role, INV_TAB_PERM_KEYS[inventoryTab])){
      body.innerHTML = `<div class="empty-state"><b>You don't have access to this section.</b></div>`;
      return;
    }
    if(inventoryTab === 'items') return invItemsView==='edit' ? renderInventoryItemEditor(body) : renderInventoryItemsList(body);
    if(inventoryTab === 'sellcart') return renderInventorySellCart(body);
    if(inventoryTab === 'sellcheckout') return renderInventoryCheckout(body);
    if(inventoryTab === 'approvals') return renderInventoryApprovalsTab(body);
    if(inventoryTab === 'saleshistory') return renderInventorySalesHistoryTab(body);
    if(inventoryTab === 'stockoverview') return renderInventoryStockOverviewTab(body);
  }

  function setInvFilterType(t){ invFilterType = t; renderInventoryItemsList(document.getElementById('inventoryBody')); }
  /* --- Return unsold stock to the vendor/supplier: reduces quantity & stock
     value only — never touches Revenue, Collected or Profit, since no sale or
     payment is involved. Kept as its own log, separate from buyer returns. --- */
  function openVendorReturnModal(itemId){
    const it = inventoryItems.find(x => x.id === itemId);
    if(!it) return;
    const wrap = document.getElementById('vendorReturnModalWrap');
    if(!wrap) return;
    wrap.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;">
        <div class="profile-card" style="width:100%; max-width:400px;">
          <h4>Return to Vendor — ${it.name}</h4>
          <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 14px;">${it.quantity} currently in stock.</p>
          <input type="hidden" id="vretItemId" value="${it.id}">
          <div class="f-field" style="margin-bottom:10px;"><label>Return Date</label><input type="date" id="vretDate" value="${new Date().toISOString().slice(0,10)}" max="${new Date().toISOString().slice(0,10)}"></div>
          <div class="f-field" style="margin-bottom:10px;"><label>Quantity to Return (max ${it.quantity})</label><input type="number" id="vretQty" min="1" max="${it.quantity}" value="1"></div>
          <div class="f-field" style="margin-bottom:10px;"><label>Vendor / Supplier</label><input type="text" id="vretVendor" placeholder="e.g. name of the supplier"></div>
          <div class="f-field" style="margin-bottom:14px;"><label>Reason</label><input type="text" id="vretReason" placeholder="e.g. unsold, damaged, wrong order"></div>
          <div style="background:rgba(24,143,134,0.10); border-left:4px solid var(--teal); border-radius:8px; padding:10px 12px; margin-bottom:14px; font-size:0.76rem;">Only reduces stock on hand and stock value at cost — does not affect Revenue, Amount Collected, or Profit.</div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="submitVendorReturn()">Confirm Return</button>
            <button class="btn btn-ghost btn-sm" onclick="closeVendorReturnModal()">Cancel</button>
          </div>
        </div>
      </div>
    `;
  }
  function closeVendorReturnModal(){
    const wrap = document.getElementById('vendorReturnModalWrap');
    if(wrap) wrap.innerHTML = '';
  }
  async function submitVendorReturn(){
    const itemId = document.getElementById('vretItemId').value;
    const it = inventoryItems.find(x => x.id === itemId);
    if(!it) return;
    const qty = Math.max(1, Math.min(Number(document.getElementById('vretQty').value) || 0, it.quantity));
    if(qty <= 0){ showToast('Enter a valid quantity.'); return; }
    const vendor = document.getElementById('vretVendor').value.trim();
    const reason = document.getElementById('vretReason').value.trim();
    const todayStr = new Date().toISOString().slice(0,10);
    const vretDateInput = document.getElementById('vretDate');
    const today = vretDateInput ? vretDateInput.value : todayStr;
    if(!today){ showToast('Set a return date.'); return; }
    if(today > todayStr){ showToast("Return date can't be in the future."); return; }
    const costReversed = Math.round(qty * (it.costPrice||0) * 100) / 100;

    it.quantity -= qty;
    inventoryVendorReturns.push({
      id:'ivret_'+Date.now()+'_'+it.id, itemId:it.id, itemName:it.name, qty, costReversed,
      vendor, reason, date:today, processedBy:currentUser.name,
    });

    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    await storageSet(INVENTORY_VENDOR_RETURNS_KEY, inventoryVendorReturns);
    closeVendorReturnModal();
    renderInventoryBody();
    showToast(`${qty} unit${qty===1?'':'s'} of ${it.name} returned to vendor — stock updated.`);
  }

  /* --- Add / Edit product, with Admin approval required for non-Admin stock changes --- */
  function openInventoryItemEditor(id){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    editingInventoryItemId = id || '';
    invItemsView = 'edit';
    renderInventoryBody();
  }
  function backToInventoryItemsList(){
    window.scrollTo({top:0,left:0,behavior:'instant'});
    invItemsView = 'list';
    renderInventoryBody();
  }
  function renderInventoryItemEditor(body){
    const it = editingInventoryItemId ? inventoryItems.find(x => x.id === editingInventoryItemId) : null;
    const isAdmin = currentUser.role === 'Admin';
    const selectedCat = it && it.category ? it.category : INVENTORY_CATEGORIES[0];
    body.innerHTML = `
      <div class="breadcrumb"><a onclick="backToInventoryItemsList()">Items</a> &nbsp;/&nbsp; ${it ? it.name : 'New Product'}</div>
      ${!isAdmin ? `<div class="profile-card" style="max-width:760px; background:rgba(203,154,46,0.12); border-left:4px solid var(--gold); margin-bottom:16px; font-size:0.82rem;"><b>⚠ Stock changes need Admin approval.</b> Saving this will be sent for review before it takes effect.</div>` : ''}

      <div class="profile-card" style="max-width:760px; margin-bottom:20px;">
        <h4>📦 Basic Information</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field full"><label>Product Name <span class="required-star">*</span></label><input type="text" id="invItemName" value="${it?it.name:''}" placeholder="Enter product name"></div>
          <div class="f-field"><label>Type <span class="required-star">*</span></label><select id="invItemType"><option value="Sellable" ${(!it||it.type==='Sellable')?'selected':''}>Sellable</option><option value="Non-Sellable" ${it&&it.type==='Non-Sellable'?'selected':''}>Non-Sellable</option></select></div>
          <div class="f-field"><label>Category <span class="required-star">*</span></label><select id="invItemCategory" onchange="onInvCategoryChange()">${INVENTORY_CATEGORIES.map(c => `<option ${selectedCat===c?'selected':''}>${c}</option>`).join('')}</select></div>
          <div class="f-field"><label>Sub-Category</label><select id="invItemSubCategory">${invSubCategoryOptions(selectedCat, it?it.subCategory:'')}</select></div>
        </div>
      </div>

      <div class="profile-card" style="max-width:760px; margin-bottom:20px;">
        <h4>💰 Pricing &amp; Stock</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Cost Price (₹) / per unit <span class="required-star">*</span></label><input type="number" id="invItemCost" value="${it?it.costPrice:''}" min="0" step="0.01" placeholder="0.00"></div>
          <div class="f-field"><label>Selling Price (₹) / per unit <span class="required-star">*</span></label><input type="number" id="invItemSelling" value="${it?it.sellingPrice:''}" min="0" step="0.01" placeholder="0.00"></div>
          <div class="f-field"><label>Current Stock <span class="required-star">*</span></label><input type="number" id="invItemQty" value="${it?it.quantity:''}" min="0" placeholder="0"></div>
          <div class="f-field"><label>Minimum Stock (low-stock threshold)</label><input type="number" id="invItemThreshold" value="${it?it.threshold:5}" min="0"></div>
          <div class="f-field"><label>Unit <span class="required-star">*</span></label><select id="invItemUnit">${INVENTORY_UNITS.map(u => `<option ${it&&it.unit===u?'selected':(!it&&u==='Piece')?'selected':''}>${u}</option>`).join('')}</select></div>
          <div class="f-field">
            <label>Size</label>
            <input type="text" id="invItemSize" value="${it&&it.size?it.size:''}" placeholder="e.g. S, M, L, XL (optional)">
            <p style="font-size:0.72rem; color:var(--ink-soft); margin:4px 0 0;">Optional — for uniforms etc.</p>
          </div>
        </div>
      </div>

      <div class="profile-card" style="max-width:760px; margin-bottom:20px;">
        <h4>🏷️ Tax &amp; Other Details</h4>
        <div class="form-grid" style="margin-top:12px;">
          <div class="f-field"><label>Applicable Class</label><input type="text" id="invItemClass" value="${it&&it.applicableClass?it.applicableClass:''}" placeholder="e.g. Class 5"></div>
          <div class="f-field"><label>Tax Rate (GST %)</label><input type="number" id="invItemTaxRate" value="${it&&it.taxRate!==undefined?it.taxRate:0}" min="0" max="100" step="0.01"></div>
          <div class="f-field full"><label>HSN Code</label><input type="text" id="invItemHsn" value="${it&&it.hsnCode?it.hsnCode:''}" placeholder="HSN code for GST (optional)"></div>
          <div class="f-field full"><label>Description</label><textarea id="invItemDescription" rows="3" placeholder="Enter product description (optional)">${it&&it.description?it.description:''}</textarea></div>
        </div>
      </div>

      ${!isAdmin ? `<div class="profile-card" style="max-width:760px; margin-bottom:20px;"><div class="f-field full"><label>Explanation for Admin <span class="required-star">*</span></label><textarea id="invItemExplanation" rows="2" placeholder="Why is this stock change needed?"></textarea></div></div>` : ''}

      <div style="display:flex; gap:10px; max-width:760px; justify-content:flex-end;">
        <button class="btn btn-ghost" onclick="backToInventoryItemsList()">Cancel</button>
        <button class="btn btn-primary" onclick="saveInventoryItem()">${isAdmin ? (it ? 'Save Product' : '📦 Add Product') : 'Submit for Approval'}</button>
      </div>
    `;
  }
  function invSubCategoryOptions(category, selected){
    const opts = INVENTORY_SUBCATEGORIES[category] || INVENTORY_SUBCATEGORIES['Other'];
    return `<option value="">Select sub-category</option>` + opts.map(s => `<option ${selected===s?'selected':''}>${s}</option>`).join('');
  }
  function onInvCategoryChange(){
    const cat = document.getElementById('invItemCategory').value;
    document.getElementById('invItemSubCategory').innerHTML = invSubCategoryOptions(cat, '');
  }
  async function saveInventoryItem(){
    const name = document.getElementById('invItemName').value.trim();
    const type = document.getElementById('invItemType').value;
    const category = document.getElementById('invItemCategory').value;
    const subCategory = document.getElementById('invItemSubCategory').value;
    const quantity = Number(document.getElementById('invItemQty').value) || 0;
    const threshold = Number(document.getElementById('invItemThreshold').value) || 0;
    const costPrice = Number(document.getElementById('invItemCost').value) || 0;
    const sellingPrice = Number(document.getElementById('invItemSelling').value) || 0;
    const unit = document.getElementById('invItemUnit').value;
    const size = document.getElementById('invItemSize').value.trim();
    const applicableClass = document.getElementById('invItemClass').value.trim();
    const taxRate = Number(document.getElementById('invItemTaxRate').value) || 0;
    const hsnCode = document.getElementById('invItemHsn').value.trim();
    const description = document.getElementById('invItemDescription').value.trim();
    if(!name){ showToast('Enter a product name.'); return; }
    if(costPrice <= 0 || sellingPrice <= 0){ showToast('Enter both a cost price and a selling price.'); return; }
    const payload = {
      editingId: editingInventoryItemId, name, type, category, subCategory, quantity, threshold, costPrice, sellingPrice,
      unit, size, applicableClass, taxRate, hsnCode, description,
    };
    const isAdmin = currentUser.role === 'Admin';
    if(!isAdmin){
      const explanation = document.getElementById('invItemExplanation').value.trim();
      if(!explanation){ showToast('Enter an explanation before submitting for approval.'); return; }
      if(!await showConfirmDialog('Submit this stock change to Admin for approval?')) return;
      pendingApprovals.push({
        id:'appr_'+Date.now(), type:'inventory_item', requestedBy:currentUser.name, requestedByRole:currentUser.role, requestedByUserId: currentUser.id,
        requestDate:new Date().toISOString().slice(0,10), explanation, payload, status:'Pending',
      });
      await storageSet(PENDING_APPROVALS_KEY, pendingApprovals);
      showToast('Submitted for Admin approval.', 'burst');
      backToInventoryItemsList();
      return;
    }
    await applyInventoryItemSave(payload);
    showToast('Product saved.', 'burst');
    backToInventoryItemsList();
  }
  async function applyInventoryItemSave(p){
    const fields = {
      name:p.name, type:p.type, category:p.category, subCategory:p.subCategory||'', quantity:p.quantity, threshold:p.threshold,
      costPrice:p.costPrice, sellingPrice:p.sellingPrice, unit:p.unit||'Piece', size:p.size||'',
      applicableClass:p.applicableClass||'', taxRate:p.taxRate||0, hsnCode:p.hsnCode||'', description:p.description||'',
    };
    if(p.editingId){
      const idx = inventoryItems.findIndex(x => x.id === p.editingId);
      if(idx > -1) inventoryItems[idx] = { ...inventoryItems[idx], ...fields };
    }else{
      inventoryItems.push({ id:'item_'+Date.now(), ...fields, active:true, createdBy:currentUser.name });
    }
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    renderInventoryBody();
  }
  async function toggleInventoryItemActive(id){
    const it = inventoryItems.find(x => x.id === id);
    if(!it) return;
    it.active = it.active===false ? true : false;
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    renderInventoryItemsList(document.getElementById('inventoryBody'));
  }
  async function deleteInventoryItem(id){
    if(currentUser.role !== 'Admin'){ showToast('Only Admin can delete a product.'); return; }
    if(!await showConfirmDialog('Delete this product? Past sales history will be kept.')) return;
    inventoryItems = inventoryItems.filter(x => x.id !== id);
    await storageSet(INVENTORY_ITEMS_KEY, inventoryItems);
    renderInventoryItemsList(document.getElementById('inventoryBody'));
  }

  /* --- Sell: cart-based 2-step flow --- */
  let invCart = [];
  let invCartCategory = 'All';
  // Second-level filter, within the chosen category — lets staff narrow
  // "Books" down to just "Govt Text Books" or "IIT Books" etc. instead of
  // scrolling through every book to find the right one. Uses each item's
  // own subCategory (see invSubCategoryOptions/INVENTORY_SUBCATEGORIES),
  // not a fixed list, so it always reflects what's actually stocked.
  let invCartSubCategory = 'All';
  let invCartSearch = '';
  let invCheckoutBuyerType = 'Student', invCheckoutStudentId = '', invCheckoutPaymentMode = 'Cash';
  let invCheckoutSearchMode = 'name', invCheckoutBrowseClass = '', invCheckoutBrowseSection = '';
  let invCheckoutDate = new Date().toISOString().slice(0,10);
  function openInventorySellCart(){
    invCart = [];
    invCartCategory = 'All'; invCartSubCategory = 'All'; invCartSearch = '';
    invCheckoutBuyerType = 'Student'; invCheckoutStudentId = ''; invCheckoutSearchMode = 'name';
    invCheckoutBrowseClass = ''; invCheckoutBrowseSection = '';
    invCheckoutDate = new Date().toISOString().slice(0,10);
    inventoryTab = 'sellcart';
    invQuickOpen = false;
    renderInventoryBody();
  }
  function setInvCartCategory(c){
    invCartCategory = c;
    invCartSubCategory = 'All'; // picking a new top-level category always clears the sub-filter
    renderInventorySellCart(document.getElementById('inventoryBody'));
  }
  function setInvCartSubCategory(sc){
    invCartSubCategory = sc;
    renderInventorySellCart(document.getElementById('inventoryBody'));
  }
  function quickSellItem(itemId){
    openInventorySellCart();
    addToInvCart(itemId);
  }
  function closeInventorySell(){
    invCart = [];
    inventoryTab = 'items';
    renderInventoryBody();
  }
  let invCartLastAddTime = {};