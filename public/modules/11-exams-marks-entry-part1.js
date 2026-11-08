const PAGE_SIZES_MM = { A4: [210, 297], Legal: [215.9, 355.6] };
  let roomAllotSubTab = 'hallTickets';
  let roomAllotExamId = '';
  let roomAllotHTClass = '';
  let roomAllotHTPrefix = 'HT';
  let roomAllotHTStart = 1;
  let roomAllotNoticeSort = 'ht';
  let roomAllotNoticeClassFilter = '';
  let roomAllotNoticeCols = 3;

  function roomAllotConfigFor(examId){
    if(!examId) return { selectedClasses: [], orientation: 'landscape', pageSize: 'A4' };
    let cfg = examRoomConfigs.find(c => c.id === examId);
    if(!cfg){
      cfg = { id: examId, selectedClasses: [], orientation: 'landscape', pageSize: 'A4' };
      examRoomConfigs.push(cfg);
    }
    cfg.selectedClasses = cfg.selectedClasses || [];
    cfg.orientation = cfg.orientation || 'landscape';
    cfg.pageSize = cfg.pageSize || 'A4';
    return cfg;
  }
  function roomAllotConfig(){ return roomAllotConfigFor(roomAllotExamId); }
  function roomAllotCurrentExam(){ return examDefs.find(e => e.id === roomAllotExamId) || null; }
  // Saves for the three Room Allotment lists go through ONE queue per list, so two quick clicks can never both try to
  // create the same record ("Duplicate entry"). If the server already has a record this screen did not know about, it
  // is picked up and updated instead of re-created, and the save is retried once.
  const raSaveChains = {};
  function raSave(key, getArr){
    const run = async () => {
      // Anything this screen thinks is new but the server already has: treat as an update, not a create (no duplicate error).
      try{
        const api = (typeof API_BACKED_KEYS !== 'undefined') ? API_BACKED_KEYS[key] : null;
        const known = new Set((_apiLastSynced[key] || []).map(x => x.id));
        if(api && getArr().some(x => !known.has(x.id))){
          const res = await fetch(api);
          if(res.ok){ const srv = await res.json(); if(Array.isArray(srv)){ const base = (_apiLastSynced[key] || []).slice(); srv.forEach(x => { if(!known.has(x.id)) base.push(JSON.parse(JSON.stringify(x))); }); _apiLastSynced[key] = base; } }
        }
      }catch(e){}
      let ok = await storageSet(key, getArr());
      if(ok === false && typeof API_BACKED_KEYS !== 'undefined' && API_BACKED_KEYS[key]){
        try{
          const res = await fetch(API_BACKED_KEYS[key]);
          if(res.ok){ const srv = await res.json(); if(Array.isArray(srv)){ _apiLastSynced[key] = JSON.parse(JSON.stringify(srv)); ok = await storageSet(key, getArr()); } }
        }catch(e){}
      }
      return ok;
    };
    const next = (raSaveChains[key] || Promise.resolve()).catch(() => {}).then(run);
    raSaveChains[key] = next;
    return next;
  }
  async function saveRoomAllotConfig(){ return raSave(EXAM_ROOM_CONFIG_KEY, () => examRoomConfigs); }

  let raFreshLoaded = false;
  function renderRoomAllotmentTab(body){
    // First time this screen opens in a session: pick up the latest saved settings (another person may have changed them), then draw.
    if(!raFreshLoaded){ raFreshLoaded = true; loadExamRoomConfigs().then(() => { try{ renderRoomAllotmentTab(document.getElementById('resultBody')); }catch(e){} }); }
    if(examDefs.length === 0){
      body.innerHTML = `<div class="empty-state"><b>No exams yet</b>Create an exam under the "Exams" tab first.</div>`;
      return;
    }
    if(!roomAllotExamId || !examDefs.find(e => e.id === roomAllotExamId)) roomAllotExamId = examDefs[0].id;
    const examOptions = examDefs.map(ex => `<option value="${ex.id}" ${roomAllotExamId===ex.id?'selected':''}>${ex.name}</option>`).join('');
    body.innerHTML = `
      <div class="f-field" style="max-width:320px; margin-bottom:16px;">
        <label>Exam</label>
        <select id="raExamSelect" onchange="roomAllotExamId=this.value; roomAllotHTClass=''; loadExamRoomConfigs().then(renderResultBody);">${examOptions}</select>
      </div>
      <div class="mf-tabs" style="margin-bottom:16px;">
        <button type="button" class="mf-tab ${roomAllotSubTab==='hallTickets'?'active':''}" onclick="switchRoomAllotSubTab('hallTickets')">Hall Ticket Numbers</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='classes'?'active':''}" onclick="switchRoomAllotSubTab('classes')">Select Classes</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='rooms'?'active':''}" onclick="switchRoomAllotSubTab('rooms')">Rooms &amp; Matrix</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='printout'?'active':''}" onclick="switchRoomAllotSubTab('printout')">Final Printout</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='notice'?'active':''}" onclick="switchRoomAllotSubTab('notice')">Notice Board</button>
        <button type="button" class="mf-tab ${roomAllotSubTab==='signatures'?'active':''}" onclick="switchRoomAllotSubTab('signatures')">Document Signatures</button>
      </div>
      <div id="raSubBody"></div>
    `;
    renderRoomAllotSubBody();
  }
  function switchRoomAllotSubTab(tab){
    roomAllotSubTab = tab;
    renderRoomAllotmentTab(document.getElementById('resultBody'));
  }
  function renderRoomAllotSubBody(){
    const el = document.getElementById('raSubBody');
    if(!el) return;
    if(roomAllotSubTab==='hallTickets') return renderHallTicketsSubTab(el);
    if(roomAllotSubTab==='classes') return renderClassSelectionSubTab(el);
    if(roomAllotSubTab==='rooms') return renderRoomsMatrixSubTab(el);
    if(roomAllotSubTab==='printout') return renderFinalPrintoutSubTab(el);
    if(roomAllotSubTab==='notice') return renderNoticeBoardSubTab(el);
    if(roomAllotSubTab==='signatures') return renderDocumentSignaturesSubTab(el);
  }

  /* --- Hall Ticket Numbers --- */
  function roomAllotStudentsForClass(className){
    return students.filter(s => s.className === className && isActive(s)).slice().sort((a,b) => {
      const ga = a.gender==='Female' ? 0 : 1, gb = b.gender==='Female' ? 0 : 1;
      if(ga !== gb) return ga - gb;
      return ((a.lastName||'')+' '+(a.firstName||'')).trim().localeCompare(((b.lastName||'')+' '+(b.firstName||'')).trim());
    });
  }
  function getHallTicket(examId, studentId){
    return examHallTickets.find(h => h.examId===examId && h.studentId===studentId);
  }
  function renderHallTicketsSubTab(el){
    const cfg = roomAllotConfig();
    const canEditHT = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? cfg.selectedClasses : CLASS_LEVELS;
    el.innerHTML = `
      <div class="profile-card" style="margin-bottom:16px;">
        <h4>Generate Hall Ticket Numbers</h4>
        <div class="form-grid" style="margin-top:10px;">
          <div class="f-field"><label>Class</label>
            <select id="raHTClass" onchange="roomAllotHTClass=this.value; renderRoomAllotSubBody();">
              <option value="">Select Class...</option>
              ${classList.map(c=>`<option value="${c}" ${c===roomAllotHTClass?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <div class="f-field"><label>Prefix</label><input type="text" id="raHTPrefix" value="${roomAllotHTPrefix}"></div>
          <div class="f-field"><label>Start Number</label><input type="number" id="raHTStart" min="1" value="${roomAllotHTStart}"></div>
          ${canEditHT ? `<div class="f-field" style="align-self:flex-end;"><button class="btn btn-primary btn-sm" ${roomAllotHTClass?'':'disabled'} onclick="regenHallTicketsForClass()">Auto-Generate (this class)</button></div>` : ''}
          ${canEditHT ? `<div class="f-field" style="align-self:flex-end;"><button class="btn btn-ghost btn-sm" onclick="generateHallTicketsAllSelected()">Generate for all selected classes</button></div>` : ''}
        </div>
        <span style="font-size:0.72rem; color:var(--ink-soft);">Students are numbered girls first, then boys, in the order shown below (surname first). "Generate for all selected classes" numbers every selected class in one go, counting on from the start number. Auto-Generate fills every student in this class — you can still edit individual numbers afterward.</span>
      </div>
      ${!roomAllotHTClass ? '' : renderHallTicketsTable(canEditHT)}
    `;
  }
  function renderHallTicketsTable(canEditHT){
    const studs = roomAllotStudentsForClass(roomAllotHTClass);
    if(!studs.length) return `<div class="empty-state"><b>No active students in this class</b></div>`;
    const rows = studs.map(s => {
      const ht = getHallTicket(roomAllotExamId, s.id);
      return `<tr>
        <td class="name-cell">${s.firstName||''} ${s.lastName||''}</td>
        <td class="id-cell">${s.admissionNo||''}</td>
        <td>${s.section||''}</td>
        <td>${s.gender||''}</td>
        <td>${canEditHT ? `<input type="text" style="width:150px;" value="${ht?ht.htNumber:''}" onchange="saveHallTicketNumber('${s.id}', this.value)">` : (ht?ht.htNumber:'—')}</td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table><thead><tr><th>Student</th><th>Admission No</th><th>Section</th><th>Gender</th><th>Hall Ticket No.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  async function regenHallTicketsForClass(){
    const prefix = document.getElementById('raHTPrefix').value.trim();
    const start = Number(document.getElementById('raHTStart').value) || 1;
    roomAllotHTPrefix = prefix; roomAllotHTStart = start;
    const studs = roomAllotStudentsForClass(roomAllotHTClass);
    let n = start;
    studs.forEach(s => {
      const num = prefix + String(n).padStart(4,'0');
      n++;
      const existing = getHallTicket(roomAllotExamId, s.id);
      if(existing) existing.htNumber = num;
      else examHallTickets.push({ id: 'ht_'+roomAllotExamId+'_'+s.id, examId: roomAllotExamId, studentId: s.id, htNumber: num });
    });
    await raSave(EXAM_HALL_TICKETS_KEY, () => examHallTickets);
    showToast('Hall ticket numbers generated for ' + studs.length + ' students.');
    renderRoomAllotSubBody();
  }
  async function saveHallTicketNumber(studentId, value){
    const val = value.trim();
    const existing = getHallTicket(roomAllotExamId, studentId);
    if(existing) existing.htNumber = val;
    else examHallTickets.push({ id: 'ht_'+roomAllotExamId+'_'+studentId, examId: roomAllotExamId, studentId, htNumber: val });
    await raSave(EXAM_HALL_TICKETS_KEY, () => examHallTickets);
  }

  /* --- Select Classes --- */
  function renderClassSelectionSubTab(el){
    const cfg = roomAllotConfig();
    cfg.selectedClasses = cfg.selectedClasses || [];
    const rows = CLASS_LEVELS.map(cls => {
      const checked = cfg.selectedClasses.includes(cls) ? 'checked' : '';
      const count = students.filter(s => s.className===cls && isActive(s)).length;
      return `<label style="display:flex; align-items:center; gap:8px; padding:8px 10px; border:1px solid var(--border); border-radius:8px;">
        <input type="checkbox" ${checked} onchange="toggleRoomAllotClass('${cls}', this.checked)">
        <span style="font-weight:600;">${cls}</span>
        <span style="margin-left:auto; font-size:0.75rem; color:var(--ink-soft);">${count} students</span>
      </label>`;
    }).join('');
    const sd = raSessionDefs(), curS = raCurrentSession(cfg), canEdS = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const cnt = list => list.reduce((n, c) => n + students.filter(s => s.className === c && isActive(s)).length, 0);
    const sCard = (name, list) => `<label class="ra-choice${curS === name ? ' on' : ''}" onclick="${canEdS ? `raPickSession('${name}')` : ''}"><b>${name === 'Morning' ? '🌅' : '🌇'} ${name} session</b><small>${list.length ? raEsc(list.join(', ')) : 'No classes set'} · ${cnt(list)} students</small></label>`;
    const sessionCard = `<div class="profile-card" style="margin-bottom:16px;">
      <style>.ra-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:8px 0 12px;}.ra-choice{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:2px solid var(--border);border-radius:10px;cursor:pointer;}.ra-choice input{display:none;}.ra-choice small{color:var(--ink-soft);font-size:.72rem;}.ra-choice.on{border-color:#1f8a7a;background:rgba(31,138,122,.09);}.ra-tick{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;margin:0 8px 8px 0;font-size:.82rem;}</style>
      <h4>Quick pick by session</h4>
      <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 0;">One tap selects every class of that session. Morning and Afternoon are sat in separate rooms and at separate times.</p>
      <div class="ra-opts">${sCard('Morning', sd.Morning)}${sCard('Afternoon', sd.Afternoon)}
        <label class="ra-choice" onclick="${canEdS ? `raPickSession('Both')` : ''}"><b>☀️ Both sessions</b><small>All classes of both sessions together</small></label></div>
      <details><summary style="cursor:pointer;font-size:.82rem;font-weight:600;">Change which classes belong to each session</summary>
        ${['Morning', 'Afternoon'].map(sn => `<div style="margin:10px 0 2px;font-weight:600;font-size:.8rem;">${sn}</div><div>${CLASS_LEVELS.map(c => `<label class="ra-tick"><input type="checkbox" ${sd[sn].includes(c) ? 'checked' : ''} ${canEdS ? '' : 'disabled'} onchange="raSetSessionClass('${sn}','${c}', this.checked)"> ${c}</label>`).join('')}</div>`).join('')}
      </details></div>`;
    el.innerHTML = sessionCard + `
      <div class="profile-card">
        <h4>Select Classes for This Exam${curS ? ' — ' + curS + ' session' : ''}</h4>
        <p style="font-size:0.78rem; color:var(--ink-soft); margin:4px 0 12px;">Chosen classes scope Hall Ticket generation, the Room Allotment Matrix, the Final Printout, and which class tiles appear on the Admit Cards page for this exam. Leave nothing selected to include every class.</p>
        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <button class="btn btn-ghost btn-sm" onclick="setAllRoomAllotClasses(true)">Select All</button>
          <button class="btn btn-ghost btn-sm" onclick="setAllRoomAllotClasses(false)">Clear All</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px,1fr)); gap:10px;">
          ${rows}
        </div>
      </div>
    `;
  }
  async function toggleRoomAllotClass(cls, checked){
    const cfg = roomAllotConfig();
    cfg.selectedClasses = cfg.selectedClasses || [];
    if(checked){ if(!cfg.selectedClasses.includes(cls)) cfg.selectedClasses.push(cls); }
    else cfg.selectedClasses = cfg.selectedClasses.filter(c => c!==cls);
    await saveRoomAllotConfig();
  }
  async function setAllRoomAllotClasses(all){
    const cfg = roomAllotConfig();
    cfg.selectedClasses = all ? CLASS_LEVELS.slice() : [];
    await saveRoomAllotConfig();
    renderRoomAllotSubBody();
  }

  /* --- Rooms & Matrix --- */
  function renderRoomsMatrixSubTab(el){
    const cfg = roomAllotConfig();
    const canEditRooms = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const canCreateRooms = getResultTabAccess(currentUser.role, 'result_roomallotment', 'create');
    const canDeleteRooms = getResultTabAccess(currentUser.role, 'result_roomallotment', 'delete');
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? cfg.selectedClasses : CLASS_LEVELS;
    const roomRows = rooms.map(r => `<tr>
      <td>${r.name}</td><td>${r.capacity}</td>
      <td>${canEditRooms ? `<button class="btn-edit-text" onclick="editExamRoom('${r.id}')">Edit</button>` : ''} &nbsp; ${canDeleteRooms ? `<button class="btn-edit-text" onclick="deleteExamRoom('${r.id}')">Delete</button>` : ''}</td>
    </tr>`).join('');
    const totalCap = rooms.reduce((s,r) => s+(Number(r.capacity)||0), 0);
    const exam = roomAllotCurrentExam();
    const cells = [];
    let grandBoys=0, grandGirls=0, grandTotal=0;
    classList.forEach(cls => {
      sectionsForClass(cls).forEach(sec => {
        const studs = students.filter(s => s.className===cls && s.section===sec && isActive(s));
        const boys = studs.filter(s => s.gender==='Male').length;
        const girls = studs.filter(s => s.gender==='Female').length;
        const total = boys+girls;
        grandBoys += boys; grandGirls += girls; grandTotal += total;
        if(total===0) return;
        const subjects = exam ? getExamSubjects(exam, cls, sec) : [];
        const warn = exam && subjects.length>0 && subjects.some(s => !s.date);
        cells.push({ cls, sec, boys, girls, total, warn });
      });
    });
    const maxTotal = cells.reduce((m,c) => Math.max(m,c.total), 0) || 1;
    const heatBg = t => {
      const from=[234,246,243], to=[31,138,122];
      const mix=(a,b,x)=>Math.round(a+(b-a)*x);
      const rgb = from.map((c,i)=>mix(c,to[i], t));
      return { bg:`rgb(${rgb.join(',')})`, dark: t>0.55 };
    };
    let matrixRows = cells.map(c => {
      const heat = heatBg(c.total/maxTotal);
      const ink = heat.dark ? '#fff' : 'inherit';
      const boysColor = heat.dark ? '#bcdcff' : '#1d4ed8';
      const girlsColor = heat.dark ? '#ffc7e6' : '#be185d';
      return `<tr style="background:${heat.bg}; color:${ink};">
        <td>${c.cls}${c.warn ? ` <span title="At least one subject for this class & section is still missing an exam date" style="color:#d97706;">⚠</span>` : ''}</td>
        <td>${c.sec}</td><td style="color:${boysColor};">${c.boys}</td><td style="color:${girlsColor};">${c.girls}</td><td style="font-weight:700;">${c.total}</td>
      </tr>`;
    }).join('');
    el.innerHTML = `
      <div class="profile-card" style="margin-bottom:16px;">
        <h4>Rooms</h4>
        <div class="table-wrap" style="margin:10px 0;"><table><thead><tr><th>Room Name</th><th>Capacity</th><th></th></tr></thead><tbody>${roomRows || '<tr><td colspan="3" style="color:var(--ink-soft);">No rooms added yet.</td></tr>'}</tbody></table></div>
        <div style="font-size:0.8rem; color:var(--ink-soft); margin-bottom:10px;">Total capacity: ${totalCap} seats</div>
        ${canCreateRooms ? `<button class="btn btn-primary btn-sm" onclick="openExamRoomModal()">+ Add Room</button>` : ''}
      </div>
      <div class="profile-card">
        <h4>Class × Section Matrix — Selected Classes</h4>
        <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 10px;">Darker cells hold more candidates. <span style="color:#d97706;">⚠</span> marks a class & section with a subject still missing its exam date for ${exam?exam.name:'the selected exam'} — set it under "Exams" before generating hall tickets.</p>
        <div class="table-wrap" style="margin-top:10px;"><table><thead><tr><th>Class</th><th>Section</th><th>Boys</th><th>Girls</th><th>Total</th></tr></thead><tbody>
          ${matrixRows || '<tr><td colspan="5" style="color:var(--ink-soft);">No students found for the selected classes.</td></tr>'}
          <tr style="font-weight:700;"><td colspan="2">Grand Total</td><td style="color:#1d4ed8;">${grandBoys}</td><td style="color:#be185d;">${grandGirls}</td><td>${grandTotal}</td></tr>
        </tbody></table></div>
      </div>
      ${raPlanCard(classList, totalCap)}
      <div id="roomModalWrap"></div>
    `;
  }
  function raPlanCard(classList, totalCap){
    let tg = 0, tb = 0, tn = 0;
    const rows = classList.map(cls => {
      const o = raOrderedClassStudents(roomAllotExamId, cls); if(!o.length) return '';
      const g = o.filter(x => raIsGirl(x.s)).length, b = o.length - g, miss = o.filter(x => !x.ht).length;
      tg += g; tb += b; tn += miss;
      return `<tr><td>${cls}</td><td style="color:${RA_GIRL_INK};font-weight:700;">${g}</td><td>${b}</td><td><b>${o.length}</b></td><td style="color:${miss?'#b91c1c':'#15803d'};">${miss ? miss + ' missing' : '✔ all issued'}</td></tr>`;
    }).join('');
    const tot = tg + tb;
    return `<div class="profile-card" style="margin-top:16px;">
      <h4>To Allot — Girls First, Then Boys</h4>
      <p style="font-size:0.76rem; color:var(--ink-soft); margin:4px 0 10px;">Each class is seated in Hall Ticket order with girls first, then boys, so the first rooms get the girls. ${tot} children for ${totalCap} seats${tot > totalCap ? ` — <b style="color:#b91c1c;">${tot - totalCap} will go to the corridor</b>` : ` (${totalCap - tot} seats spare)`}.</p>
      <div class="table-wrap"><table><thead><tr><th>Class</th><th style="color:${RA_GIRL_INK};">Girls</th><th>Boys</th><th>Total</th><th>Hall Tickets</th></tr></thead><tbody>${rows || '<tr><td colspan="5" style="color:var(--ink-soft);">No students.</td></tr>'}
        <tr style="font-weight:700;"><td>All</td><td style="color:${RA_GIRL_INK};">${tg}</td><td>${tb}</td><td>${tot}</td><td>${tn ? tn + ' missing — go to Hall Ticket Numbers' : '✔'}</td></tr></tbody></table></div>
    </div>`;
  }
  function openExamRoomModal(id){
    const r = id ? rooms.find(x => x.id===id) : null;
    const el = document.getElementById('roomModalWrap');
    el.innerHTML = `<div style="position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:999; padding:20px;">
      <div class="profile-card" style="width:100%; max-width:320px;">
        <h4>${id?'Edit Room':'Add Room'}</h4>
        <input type="hidden" id="raRoomId" value="${id||''}">
        <div class="f-field" style="margin-top:10px;"><label>Room Name</label><input type="text" id="raRoomName" value="${r?r.name:''}"></div>
        <div class="f-field"><label>Capacity</label><input type="number" min="1" id="raRoomCapacity" value="${r?r.capacity:''}"></div>
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="btn btn-primary btn-sm" onclick="saveExamRoom()">Save</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('roomModalWrap').innerHTML=''">Cancel</button>
        </div>
      </div>
    </div>`;
  }
  function editExamRoom(id){ openExamRoomModal(id); }
  async function saveExamRoom(){
    const id = document.getElementById('raRoomId').value;
    const name = document.getElementById('raRoomName').value.trim();
    const capacity = Number(document.getElementById('raRoomCapacity').value) || 0;
    if(!name || capacity<=0){ showToast('Enter a room name and capacity.'); return; }
    if(id){
      const r = rooms.find(x => x.id===id);
      if(r){ r.name = name; r.capacity = capacity; }
    } else {
      rooms.push({ id: 'examroom_'+Date.now(), name, capacity });
    }
    await raSave(ROOMS_KEY, () => rooms);
    document.getElementById('roomModalWrap').innerHTML = '';
    renderRoomAllotSubBody();
  }
  async function deleteExamRoom(id){
    if(!await showConfirmDialog('Delete this room?')) return;
    rooms = rooms.filter(r => r.id!==id);
    await raSave(ROOMS_KEY, () => rooms);
    renderRoomAllotSubBody();
  }

  /* --- Auto-allot algorithm (largest-remainder proportional split, remaining-capacity-weighted) --- */
  function proportionalSplit(count, weights){
    if(count<=0) return weights.map(()=>0);
    const totalWeight = weights.reduce((a,b)=>a+b,0);
    if(totalWeight<=0) return weights.map(()=>0);
    const raw = weights.map(w => count * w / totalWeight);
    const floors = raw.map(Math.floor);
    let remainder = count - floors.reduce((a,b)=>a+b,0);
    const fracIdx = raw.map((v,i) => ({ i, frac: v-Math.floor(v) })).sort((a,b) => b.frac-a.frac);
    const result = floors.slice();
    for(let k=0; k<remainder && fracIdx.length>0; k++){ result[fracIdx[k % fracIdx.length].i]++; }
    return result;
  }
  function distributeTotalsWithCorridor(classTotals, roomCaps){
    const roomsOut = roomCaps.map(r => ({ id:r.id, name:r.name, capacity:r.capacity, remaining:r.capacity, classes:{} }));
    const corridor = { name:'CORRIDOR', classes:{}, total:0 };
    classTotals.forEach(cls => {
      let need = cls.total;
      if(need<=0) return;
      const totalRemaining = roomsOut.reduce((s,r)=>s+r.remaining,0);
      const toRooms = Math.min(need, totalRemaining);
      if(toRooms>0){
        const weights = roomsOut.map(r => r.remaining);
        const split = proportionalSplit(toRooms, weights);
        split.forEach((n,i) => {
          if(n<=0) return;
          roomsOut[i].classes[cls.className] = (roomsOut[i].classes[cls.className]||0)+n;
          roomsOut[i].remaining -= n;
        });
      }
      const overflow = need - toRooms;
      if(overflow>0){
        corridor.classes[cls.className] = (corridor.classes[cls.className]||0) + overflow;
        corridor.total += overflow;
      }
    });
    return { rooms: roomsOut, corridor };
  }
  /* ---- Sessions (Morning / Afternoon) and paper timings from the Exams time table ---- */
  const RA_SESSIONS_ID = '__sessions';
  function raSessionDefs(){
    let r = examRoomConfigs.find(c => c.id === RA_SESSIONS_ID);
    if(!r){
      r = { id: RA_SESSIONS_ID, Morning: ['8th Class', '9th Class', '10th Class'].filter(c => CLASS_LEVELS.includes(c)), Afternoon: ['6th Class', '7th Class'].filter(c => CLASS_LEVELS.includes(c)) };
      examRoomConfigs.push(r);
    }
    r.Morning = r.Morning || []; r.Afternoon = r.Afternoon || [];
    return r;
  }
  function raCurrentSession(cfg){
    const sel = (cfg.selectedClasses || []).slice().sort().join('|'), d = raSessionDefs();
    if(!sel) return '';
    if(sel === d.Morning.slice().sort().join('|')) return 'Morning';
    if(sel === d.Afternoon.slice().sort().join('|')) return 'Afternoon';
    return '';
  }
  async function raPickSession(name){
    const cfg = roomAllotConfig(), d = raSessionDefs();
    cfg.selectedClasses = name === 'Both' ? CLASS_LEVELS.filter(c => d.Morning.includes(c) || d.Afternoon.includes(c)) : CLASS_LEVELS.filter(c => d[name].includes(c));
    cfg.paperDate = ''; cfg.paperSubject = ''; cfg.paperTime = '';
    await saveRoomAllotConfig(); renderRoomAllotSubBody();
  }
  async function raSetSessionClass(session, cls, on){
    const d = raSessionDefs(); d[session] = (d[session] || []).filter(c => c !== cls); if(on) d[session].push(cls);
    await saveRoomAllotConfig(); renderRoomAllotSubBody();
  }
  function raSelectedClassList(examId){
    const cfg = roomAllotConfigFor(examId);
    return (cfg.selectedClasses && cfg.selectedClasses.length) ? CLASS_LEVELS.filter(c => cfg.selectedClasses.includes(c)) : CLASS_LEVELS;
  }
  // What each class writes on a given date, read from the exam time table (subject + start/end time).
  function raPaperInfo(exam, classList, date){
    const by = {};
    if(!exam || !date) return by;
    classList.forEach(cls => {
      const seen = {};
      sectionsForClass(cls).forEach(sec => getExamSubjects(exam, cls, sec).forEach(sb => {
        if(sb && sb.date === date){ const time = acTimeText(sb, exam, cls); const k = sb.name + '|' + time; if(!seen[k]){ seen[k] = 1; (by[cls] = by[cls] || []).push({ subject: sb.name || '', time }); } }
      }));
    });
    return by;
  }
  function raExamDates(exam, classList){
    const set = {};
    classList.forEach(cls => sectionsForClass(cls).forEach(sec => getExamSubjects(exam, cls, sec).forEach(sb => { if(sb && sb.date){ const e = set[sb.date] = set[sb.date] || {}; e[sb.name] = 1; } })));
    return Object.keys(set).sort().map(d => ({ date: d, subjects: Object.keys(set[d]) }));
  }
  function raPaperText(by){
    const cls = Object.keys(by); if(!cls.length) return { subject: '', time: '' };
    const subs = {}, times = {};
    cls.forEach(c => by[c].forEach(x => { subs[x.subject] = 1; if(x.time) times[x.time] = 1; }));
    const perClass = f => cls.map(c => c + ': ' + Array.from(new Set(by[c].map(f).filter(Boolean))).join(', ')).join('; ');
    const sameSubject = cls.every(c => by[c].map(x => x.subject).sort().join('|') === by[cls[0]].map(x => x.subject).sort().join('|'));
    return { subject: sameSubject ? Object.keys(subs).join(' / ') : perClass(x => x.subject), time: Object.keys(times).length <= 1 ? Object.keys(times)[0] || '' : perClass(x => x.time) };
  }
  function raFmtDate(d){ const dt = d ? new Date(d + 'T00:00:00') : null; return dt && !isNaN(dt) ? String(dt.getDate()).padStart(2, '0') + '.' + String(dt.getMonth() + 1).padStart(2, '0') + '.' + dt.getFullYear() : ''; }
  async function raSetPaperDate(date){
    const cfg = roomAllotConfig(), exam = roomAllotCurrentExam();
    cfg.paperDate = date || '';
    const t = raPaperText(raPaperInfo(exam, raSelectedClassList(roomAllotExamId), date));
    if(date){ cfg.paperSubject = t.subject; cfg.paperTime = t.time; }
    await saveRoomAllotConfig(); renderRoomAllotSubBody();
  }

  /* ---- Room allotment engine: girls first, then boys, in hall-ticket order ---- */
  function raEsc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  const RA_GIRL_INK = '#c00000';   // red = girls (as on the school's manual sheet), black = boys
  function raIsGirl(s){ return s && s.gender === 'Female'; }
  function raHtParts(h){ const m = /^(.*?)(\d+)$/.exec(String(h || '')); return m ? { p: m[1], n: Number(m[2]), w: m[2].length } : { p: String(h || ''), n: NaN, w: 0 }; }
  // "Fill one room at a time": each class goes into the first room until it is full, then the next.
  function distributeFillWithCorridor(classTotals, roomCaps){
    const roomsOut = roomCaps.map(r => ({ id: r.id, name: r.name, capacity: r.capacity, remaining: r.capacity, classes: {} }));
    const corridor = { name: 'CORRIDOR', classes: {}, total: 0 };
    classTotals.forEach(cls => {
      let need = cls.total;
      roomsOut.forEach(r => { if(need <= 0 || r.remaining <= 0) return; const t = Math.min(need, r.remaining); r.classes[cls.className] = (r.classes[cls.className] || 0) + t; r.remaining -= t; need -= t; });
      if(need > 0){ corridor.classes[cls.className] = (corridor.classes[cls.className] || 0) + need; corridor.total += need; }
    });
    return { rooms: roomsOut, corridor };
  }
  function raCompareHt(a, b){ return String(a).localeCompare(String(b), undefined, { numeric: true }); }
  // "25260064, 25260065 ... 25260073, 25260210" -> [{from,to,count}, {from,to,count}]  (only truly consecutive numbers join a range)
  function raCompressRuns(list){
    const sorted = list.slice().sort(raCompareHt), runs = [];
    sorted.forEach(h => {
      const cur = runs[runs.length - 1], pp = cur ? raHtParts(cur.to) : null, hp = raHtParts(h);
      if(cur && pp.p === hp.p && pp.w === hp.w && isFinite(pp.n) && isFinite(hp.n) && hp.n === pp.n + 1){ cur.to = h; cur.count++; }
      else runs.push({ from: h, to: h, count: 1 });
    });
    return runs;
  }
  // The students of one class in allotment order: girls first, then boys; inside each, hall-ticket order (no ticket last, then by name).
  function raOrder(examId){ return (roomAllotConfigFor(examId).seatOrder) || 'girlsFirst'; }
  function raOrderedClassStudents(examId, className){
    const order = raOrder(examId);
    return students.filter(s => s.className === className && isActive(s)).map(s => { const ht = getHallTicket(examId, s.id); return { s, ht: ht && ht.htNumber ? String(ht.htNumber).trim() : '' }; })
      .sort((a, b) => {
        if(order !== 'ticket'){
          const ga = raIsGirl(a.s) ? 0 : 1, gb = raIsGirl(b.s) ? 0 : 1;
          if(ga !== gb) return order === 'boysFirst' ? gb - ga : ga - gb;
        }
        if(!!a.ht !== !!b.ht) return a.ht ? -1 : 1;
        if(a.ht && b.ht){ const c = raCompareHt(a.ht, b.ht); if(c) return c; }
        return (((a.s.lastName || '') + ' ' + (a.s.firstName || '')).trim()).localeCompare(((b.s.lastName || '') + ' ' + (b.s.firstName || '')).trim());
      });
  }
  function raEntryFor(className, chunk){
    const segs = [];
    const gOrder = raOrder(roomAllotExamId) === 'boysFirst' ? [false, true] : [true, false];
    gOrder.forEach(girl => {
      const part = chunk.filter(x => raIsGirl(x.s) === girl);
      if(!part.length) return;
      raCompressRuns(part.filter(x => x.ht).map(x => x.ht)).forEach(r => segs.push({ girl, from: r.from, to: r.to, count: r.count }));
      const noHt = part.filter(x => !x.ht).length;
      if(noHt) segs.push({ girl, from: '', to: '', count: noHt, noHt: true });
    });
    const girls = chunk.filter(x => raIsGirl(x.s)).length;
    const hts = chunk.map(x => x.ht).filter(Boolean);
    return { className, count: chunk.length, girls, boys: chunk.length - girls, segments: segs,
      from: segs.length ? segs[0].from : '', to: segs.length ? segs[segs.length - 1].to : '',
      htNumbers: hts, studentIds: chunk.map(x => x.s.id) };
  }
  function buildFinalPrintoutDataFor(examId){
    const cfg = roomAllotConfigFor(examId);
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? CLASS_LEVELS.filter(c => cfg.selectedClasses.includes(c)) : CLASS_LEVELS;
    const ordered = {};
    classList.forEach(c => { ordered[c] = raOrderedClassStudents(examId, c); });
    const classTotals = classList.map(cls => ({ className: cls, total: ordered[cls].length })).filter(c => c.total > 0);
    const off = cfg.roomsOff || [];
    const roomCaps = rooms.filter(r => !off.includes(r.id)).map(r => ({ id: r.id, name: r.name, capacity: Number(r.capacity) || 0 }));
    const { rooms: allocRooms, corridor } = (cfg.spread === 'fill') ? distributeFillWithCorridor(classTotals, roomCaps) : distributeTotalsWithCorridor(classTotals, roomCaps);
    const cursor = {};
    classList.forEach(c => { cursor[c] = 0; });
    function take(cls, count){ const chunk = ordered[cls].slice(cursor[cls], cursor[cls] + count); cursor[cls] += count; return chunk; }
    const mk = (name, capacity, id, map) => {
      const classEntries = Object.keys(map).sort((a, b) => CLASS_LEVELS.indexOf(a) - CLASS_LEVELS.indexOf(b)).map(cls => raEntryFor(cls, take(cls, map[cls])));
      const girls = classEntries.reduce((s, c) => s + c.girls, 0), total = classEntries.reduce((s, c) => s + c.count, 0);
      return { id, name, capacity, classEntries, total, girls, boys: total - girls };
    };
    const roomBlocks = allocRooms.filter(r => Object.keys(r.classes).length > 0).map(r => mk(r.name, r.capacity, r.id, r.classes));
    const corridorBlock = corridor.total > 0 ? mk('CORRIDOR', 0, 'corridor', corridor.classes) : null;
    return { roomBlocks, corridorBlock, classList, ordered };
  }
  function buildFinalPrintoutData(){ return buildFinalPrintoutDataFor(roomAllotExamId); }
  function buildNoticeBoardDataFor(examId){
    const { roomBlocks, corridorBlock } = buildFinalPrintoutDataFor(examId);
    const byId = {}; students.forEach(s => { byId[s.id] = s; });
    const allBlocks = corridorBlock ? [...roomBlocks, corridorBlock] : roomBlocks;
    const list = [];
    allBlocks.forEach(block => block.classEntries.forEach(ce => ce.studentIds.forEach(id => {
      const s = byId[id], ht = getHallTicket(examId, id);
      if(s && ht && ht.htNumber) list.push({ studentId: s.id, ht: ht.htNumber, name: (s.lastName || '') + ' ' + (s.firstName || ''), className: s.className, section: s.section, room: block.name });
    })));
    return list;
  }
  function buildNoticeBoardData(){ return buildNoticeBoardDataFor(roomAllotExamId); }
  function computeExamHallTicketRoomMap(examId){
    const map = {};
    buildNoticeBoardDataFor(examId).forEach(d => { map[d.studentId] = { ht: d.ht, room: d.room }; });
    return map;
  }
  // Self-check: every student exactly once, class totals match, numbers unique, ranges add up, rooms within capacity.
  function checkRoomAllotment(examId){
    const data = buildFinalPrintoutDataFor(examId), items = [];
    const add = (ok, text, warn) => items.push({ ok, warn: !!warn, text });
    const blocks = data.corridorBlock ? [...data.roomBlocks, data.corridorBlock] : data.roomBlocks;
    if(!rooms.length) add(false, 'No rooms added yet — add rooms under "Rooms & Matrix".');
    let enrolled = 0, allotted = 0;
    data.classList.forEach(cls => {
      const e = data.ordered[cls].length; if(!e) return;
      let a = 0; blocks.forEach(b => b.classEntries.forEach(ce => { if(ce.className === cls) a += ce.count; }));
      enrolled += e; allotted += a;
      if(a !== e) add(false, cls + ': ' + e + ' students but ' + a + ' allotted.');
    });
    add(allotted === enrolled, 'Total allotted ' + allotted + ' of ' + enrolled + ' students.' + (allotted === enrolled ? '' : ' Some students are missing.'));
    const seen = {}; let dupStud = 0;
    blocks.forEach(b => b.classEntries.forEach(ce => ce.studentIds.forEach(id => { if(seen[id]) dupStud++; seen[id] = 1; })));
    add(dupStud === 0, dupStud ? dupStud + ' student(s) placed in two rooms.' : 'Nobody is placed in two rooms.');
    let bad = 0; blocks.forEach(b => b.classEntries.forEach(ce => { const sum = ce.segments.reduce((s, g) => s + g.count, 0); if(sum !== ce.count) bad++; }));
    add(bad === 0, bad ? bad + ' room line(s) whose From–To ranges do not add up.' : 'Every From–To range adds up to its total.');
    let noHt = 0; const cnt = {};
    data.classList.forEach(cls => data.ordered[cls].forEach(x => { if(!x.ht) noHt++; else cnt[x.ht] = (cnt[x.ht] || 0) + 1; }));
    const dups = Object.keys(cnt).filter(k => cnt[k] > 1);
    add(noHt === 0, noHt ? noHt + ' student(s) have no Hall Ticket Number — they are allotted but show "no ticket" in the ranges. Use "Generate for all selected classes".' : 'Every student has a Hall Ticket Number.');
    add(dups.length === 0, dups.length ? 'Duplicate Hall Ticket Numbers: ' + dups.slice(0, 6).join(', ') + (dups.length > 6 ? '…' : '') : 'No duplicate Hall Ticket Numbers.');
    let mixed = 0; data.classList.forEach(cls => { const g = data.ordered[cls].filter(x => raIsGirl(x.s) && x.ht).map(x => x.ht), b = data.ordered[cls].filter(x => !raIsGirl(x.s) && x.ht).map(x => x.ht);
      if(g.length && b.length && raCompareHt(g[g.length - 1], b[0]) > 0) mixed++; });
    if(raOrder(examId) === 'ticket') mixed = 0;
    add(mixed === 0, mixed ? mixed + ' class(es) where some boys have lower ticket numbers than girls (numbers were not issued girls-first). Rooms still seat girls first.' : 'Hall Ticket Numbers run girls first, then boys.', mixed > 0);
    if(data.corridorBlock) add(false, data.corridorBlock.total + ' student(s) did not fit in the rooms and are in the CORRIDOR — add a room or raise a capacity.', true);
    const fail = items.filter(i => !i.ok && !i.warn).length;
    return { items, ok: fail === 0, data };
  }
  async function generateHallTicketsAllSelected(){
    const cfg = roomAllotConfig();
    const prefix = (document.getElementById('raHTPrefix') || {}).value || roomAllotHTPrefix;
    const start = Number((document.getElementById('raHTStart') || {}).value) || roomAllotHTStart || 1;
    const classList = (cfg.selectedClasses && cfg.selectedClasses.length) ? CLASS_LEVELS.filter(c => cfg.selectedClasses.includes(c)) : CLASS_LEVELS;
    const total = classList.reduce((s, c) => s + students.filter(x => x.className === c && isActive(x)).length, 0);
    if(!total){ showToast('No active students in the selected classes.'); return; }
    if(!await showConfirmDialog('Give new Hall Ticket Numbers to all ' + total + ' students of the selected classes? Class by class, girls first then boys, counting on from ' + prefix + String(start).padStart(4, '0') + '. Numbers already there will be replaced.')) return;
    roomAllotHTPrefix = prefix.trim(); roomAllotHTStart = start;
    let n = start;
    classList.forEach(cls => roomAllotStudentsForClass(cls).forEach(s => {
      const num = roomAllotHTPrefix + String(n++).padStart(4, '0');
      const ex = getHallTicket(roomAllotExamId, s.id);
      if(ex) ex.htNumber = num; else examHallTickets.push({ id: 'ht_' + roomAllotExamId + '_' + s.id, examId: roomAllotExamId, studentId: s.id, htNumber: num });
    }));
    await raSave(EXAM_HALL_TICKETS_KEY, () => examHallTickets);
    showToast('Hall ticket numbers generated for ' + total + ' students.');
    renderRoomAllotSubBody();
  }

  /* --- Final Printout --- */
  function raSegCells(ce){
    const col = g => g.girl ? ' style="color:' + RA_GIRL_INK + ';font-weight:700;"' : '';
    const line = (g, v) => '<div class="seg"' + col(g) + '>' + (g.noHt ? '<i>no ticket</i>' : raEsc(v)) + '</div>';
    return { from: ce.segments.map(g => line(g, g.from)).join('') || '', to: ce.segments.map(g => line(g, g.to)).join('') || '', tot: ce.segments.map(g => '<div class="seg"' + col(g) + '>' + g.count + '</div>').join('') };
  }
  function renderFinalPrintoutTable(roomBlocks, corridorBlock, forPrint){
    const allBlocks = corridorBlock ? [...roomBlocks, corridorBlock] : roomBlocks;
    if(!allBlocks.length) return '<tr><td colspan="12" style="color:var(--ink-soft);">No rooms or classes configured yet — add rooms under "Rooms &amp; Matrix" and select classes under "Select Classes".</td></tr>';
    const inv = (roomAllotConfig().invigilators) || {};
    let rowsHtml = '';
    allBlocks.forEach(block => {
      const n = block.classEntries.length || 1;
      const nm = raEsc(block.name), ivName = raEsc(inv[block.name] || '');
      block.classEntries.forEach((ce, idx) => {
        const c = raSegCells(ce);
        rowsHtml += '<tr' + (idx === 0 ? ' class="rb-first"' : '') + '>';
        if(idx === 0) rowsHtml += '<td rowspan="' + n + '" class="rb-room">' + nm + '</td><td rowspan="' + n + '" class="rb-inv">' + (forPrint ? ivName : '<input type="text" class="ra-inv" data-room="' + nm + '" value="' + ivName + '" placeholder="Invigilator" onchange="saveRoomInvigilator(this)">') + '</td>';
        rowsHtml += '<td class="rb-cls">' + raEsc(ce.className) + '</td><td>' + c.from + '</td><td>' + c.to + '</td><td><b>' + ce.count + '</b></td><td class="gbc" style="color:' + RA_GIRL_INK + ';">' + ce.girls + '</td><td class="gbc">' + ce.boys + '</td>';
        if(idx === 0) rowsHtml += '<td rowspan="' + n + '" class="rb-tot"><b>' + block.total + '</b><div class="gb"><span style="color:' + RA_GIRL_INK + ';">G ' + block.girls + '</span> · B ' + block.boys + '</div></td>';
        rowsHtml += '<td class="rb-blank"></td><td class="rb-blank"></td>';
        if(idx === 0) rowsHtml += '<td rowspan="' + n + '" class="rb-sign"></td>';
        rowsHtml += '</tr>';
      });
    });
    return rowsHtml;
  }
  const RA_TABLE_CSS = '.ra-tbl.nogb .gbc{display:none;}.ra-tbl.bw .seg{color:#000!important;}.ra-tbl.bw td{color:#000!important;}.ra-tbl{width:100%;border-collapse:collapse;font-size:11px;}.ra-tbl th,.ra-tbl td{border:1px solid #333;padding:4px 6px;text-align:center;vertical-align:middle;}.ra-tbl th{background:#211A4E;color:#fff;}.ra-tbl tr.rb-first td{border-top:2.5px solid #000;}.ra-tbl .seg{line-height:1.5;min-height:18px;}.ra-tbl .rb-room{font-weight:700;font-size:15px;}.ra-tbl .rb-cls{font-weight:700;white-space:nowrap;}.ra-tbl .rb-blank{min-width:60px;height:30px;}.ra-tbl .rb-sign{min-width:90px;}.ra-tbl .gb{font-size:9.5px;color:#444;margin-top:2px;}.ra-tbl .ra-inv{width:130px;border:none;border-bottom:1px dashed #999;background:transparent;text-align:center;}';
  function raSummaryRows(data){
    const rows = []; let tg = 0, tb = 0;
    data.classList.forEach(cls => { const o = data.ordered[cls]; if(!o.length) return; const g = o.filter(x => raIsGirl(x.s)).length; tg += g; tb += o.length - g; rows.push({ cls, g, b: o.length - g, t: o.length }); });
    return { rows, tg, tb };
  }
  function renderFinalPrintoutSubTab(el){
    const cfg = roomAllotConfig();
    const exam = roomAllotCurrentExam();
    const chk = checkRoomAllotment(roomAllotExamId), data = chk.data;
    const { roomBlocks, corridorBlock } = data;
    const totalAllotted = roomBlocks.reduce((s,b) => s+b.total, 0) + (corridorBlock ? corridorBlock.total : 0);
    const canEd = getResultTabAccess(currentUser.role, 'result_roomallotment', 'edit');
    const sum = raSummaryRows(data);
    el.innerHTML = `
      ${raOptionsPanel(cfg, canEd)}
      <div class="profile-card" style="margin-bottom:16px;">
        <h4>Sheet Details &amp; Page Setup</h4>
        <div class="form-grid" style="margin-top:10px;">
          <div class="f-field"><label>Date of paper</label><input type="date" id="raDate" value="${raEsc(cfg.paperDate || '')}" onchange="raSetPaperDate(this.value)" ${canEd?'':'disabled'}></div>
          <div class="f-field"><label>Subject</label><input type="text" id="raSubject" value="${raEsc(cfg.paperSubject || '')}" onchange="updateRoomAllotPageSetup()" ${canEd?'':'disabled'}></div>
          <div class="f-field"><label>Time</label><input type="text" id="raTime" value="${raEsc(cfg.paperTime || '')}" placeholder="e.g. 9:30 AM – 12:30 PM" onchange="updateRoomAllotPageSetup()" ${canEd?'':'disabled'}></div>
          <div class="f-field"><label>General duty</label><input type="text" id="raDuty" value="${raEsc(cfg.generalDuty || '')}" onchange="updateRoomAllotPageSetup()" ${canEd?'':'disabled'}></div>
          <div class="f-field"><label>Orientation</label>
            <select id="raOrientation" onchange="updateRoomAllotPageSetup()">
              <option value="landscape" ${cfg.orientation==='landscape'?'selected':''}>Landscape</option>
              <option value="portrait" ${cfg.orientation==='portrait'?'selected':''}>Portrait</option>
            </select>
          </div>
          <div class="f-field"><label>Page Size</label>
            <select id="raPageSize" onchange="updateRoomAllotPageSetup()">
              <option value="A4" ${cfg.pageSize==='A4'?'selected':''}>A4</option>
              <option value="Legal" ${cfg.pageSize==='Legal'?'selected':''}>Legal</option>
            </select>
          </div>
        </div>
        ${raDateChips(cfg, exam, canEd)}
        <span style="font-size:0.72rem; color:var(--ink-soft);">Tap a paper date and the subject and time are filled from the Exams time table. Type the room invigilators straight into the table below. They print on the sheet.</span>
      </div>
      <div class="profile-card" style="margin-bottom:16px;">
        <h4>Check</h4>
        <div style="margin-top:8px;font-size:0.82rem;line-height:1.7;">${chk.items.map(i => '<div style="color:' + (i.ok ? '#15803d' : (i.warn ? '#b45309' : '#b91c1c')) + ';">' + (i.ok ? '✔' : (i.warn ? '⚠' : '✖')) + ' ' + raEsc(i.text) + '</div>').join('')}</div>
      </div>
      <div class="profile-card">
        <style>${RA_TABLE_CSS}</style>
        <h4>Final Room Allotment — ${exam?raEsc(exam.name):''}</h4>
        <p style="font-size:0.8rem; color:var(--ink-soft);">${totalAllotted} candidate${totalAllotted===1?'':'s'} (<span style="color:${RA_GIRL_INK};font-weight:700;">${sum.tg} girls</span> + ${sum.tb} boys) allotted across ${roomBlocks.length} room${roomBlocks.length===1?'':'s'}${corridorBlock?' + CORRIDOR (room capacity exceeded)':''}. Girls are seated first; <span style="color:${RA_GIRL_INK};font-weight:700;">red numbers are girls</span>, black are boys.</p>
        <div class="table-wrap" style="margin:12px 0;">
          <table class="ra-tbl${cfg.showGB === false ? ' nogb' : ''}${cfg.colour === false ? ' bw' : ''}"><thead><tr><th rowspan="2">Room No.</th><th rowspan="2">Name of the Invigilator</th><th rowspan="2">Class</th><th colspan="3">Roll numbers allotment</th><th rowspan="2" class="gbc">Girls</th><th rowspan="2" class="gbc">Boys</th><th rowspan="2">Total in the Room</th><th rowspan="2">Absentees</th><th rowspan="2">Number Present</th><th rowspan="2">Signature</th></tr><tr><th>From</th><th>To</th><th>Total</th></tr></thead>
          <tbody>${renderFinalPrintoutTable(roomBlocks, corridorBlock, false)}</tbody></table>
        </div>
        ${getResultTabAccess(currentUser.role, 'result_roomallotment', 'print') ? `<button class="btn btn-primary" onclick="printFinalRoomAllotment()">Print Final Room Allotment</button>` : ''}
      </div>
    `;
  }
  function raChoice(name, val, cur, title, sub, canEd){
    return `<label class="ra-choice${cur === val ? ' on' : ''}"><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''} ${canEd ? '' : 'disabled'} onchange="setRaOption('${name}','${val}')"><b>${title}</b><small>${sub}</small></label>`;
  }
  function raOptionsPanel(cfg, canEd){
    const off = cfg.roomsOff || [];
    return `<div class="profile-card" style="margin-bottom:16px;">
      <style>.ra-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin:8px 0 14px;}.ra-choice{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border:2px solid var(--border);border-radius:10px;cursor:pointer;}.ra-choice input{display:none;}.ra-choice small{color:var(--ink-soft);font-size:.72rem;}.ra-choice.on{border-color:#1f8a7a;background:rgba(31,138,122,.09);}.ra-tick{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid var(--border);border-radius:8px;margin:0 8px 8px 0;font-size:.82rem;}</style>
      <h4>How should children be seated?</h4>
      <div style="font-size:.78rem;color:var(--ink-soft);">Pick one in each row. The table and the print update at once.</div>
      <div style="font-weight:600;margin-top:10px;">1 · Who sits first</div>
      <div class="ra-opts">
        ${raChoice('seatOrder','girlsFirst',raOrder(roomAllotExamId),'Girls first, then boys','Recommended. Girls take the first Hall Tickets of each class.',canEd)}
        ${raChoice('seatOrder','boysFirst',raOrder(roomAllotExamId),'Boys first, then girls','Boys take the first Hall Tickets.',canEd)}
        ${raChoice('seatOrder','ticket',raOrder(roomAllotExamId),'Hall Ticket order only','Mixed. Ignores boy / girl.',canEd)}
      </div>
      <div style="font-weight:600;">2 · How rooms are filled</div>
      <div class="ra-opts">
        ${raChoice('spread','even',cfg.spread||'even','Spread every class in every room','Each room gets a few of each class (like last year).',canEd)}
        ${raChoice('spread','fill',cfg.spread||'even','Fill one room at a time','Room 1 full, then Room 2. Fewer classes mixed in a room.',canEd)}
      </div>
      <div style="font-weight:600;">3 · Rooms to use for this exam</div>
      <div style="margin-top:8px;">${rooms.map(r => `<label class="ra-tick"><input type="checkbox" ${off.includes(r.id) ? '' : 'checked'} ${canEd ? '' : 'disabled'} onchange="toggleRaRoom('${r.id}', this.checked)"> ${raEsc(r.name)} <small style="color:var(--ink-soft);">(${r.capacity})</small></label>`).join('') || '<span style="color:var(--ink-soft);font-size:.8rem;">No rooms yet — add them under Rooms &amp; Matrix.</span>'}</div>
      <div style="font-weight:600;margin-top:4px;">4 · On the printed sheet</div>
      <div style="margin-top:8px;">
        <label class="ra-tick"><input type="checkbox" ${cfg.showGB === false ? '' : 'checked'} onchange="setRaOption('showGB', this.checked)"> Show Girls / Boys columns</label>
        <label class="ra-tick"><input type="checkbox" ${cfg.colour === false ? '' : 'checked'} onchange="setRaOption('colour', this.checked)"> Red numbers for girls (untick for black &amp; white)</label>
      </div>
    </div>`;
  }
  async function setRaOption(key, val){
    const cfg = roomAllotConfig(); cfg[key] = val; await saveRoomAllotConfig(); renderRoomAllotSubBody();
  }
  async function toggleRaRoom(id, on){
    const cfg = roomAllotConfig(); cfg.roomsOff = (cfg.roomsOff || []).filter(x => x !== id); if(!on) cfg.roomsOff.push(id);
    await saveRoomAllotConfig(); renderRoomAllotSubBody();
  }
  function raDateChips(cfg, exam, canEd){
    const dates = raExamDates(exam, raSelectedClassList(roomAllotExamId));
    if(!dates.length) return '<div style="font-size:.78rem;color:#b45309;margin:8px 0;">No paper dates found for these classes in the Exams time table — set them under Exams, or type the date, subject and time above.</div>';
    return '<div style="margin:10px 0 4px;font-weight:600;font-size:.82rem;">Paper dates from the Exams time table</div><div>' + dates.map(x => {
      const dt = new Date(x.date + 'T00:00:00'), label = dt.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
      return '<button type="button" class="ra-tick" style="cursor:pointer;' + (cfg.paperDate === x.date ? 'border-color:#1f8a7a;background:rgba(31,138,122,.12);font-weight:700;' : '') + '" ' + (canEd ? '' : 'disabled ') + 'onclick="raSetPaperDate(\'' + x.date + '\')">' + raEsc(label) + ' · ' + raEsc(x.subjects.slice(0, 3).join(', ')) + (x.subjects.length > 3 ? '…' : '') + '</button>';
    }).join('') + '</div>';
  }
  async function saveRoomInvigilator(inp){
    const cfg = roomAllotConfig(); cfg.invigilators = cfg.invigilators || {};
    cfg.invigilators[inp.getAttribute('data-room')] = inp.value.trim();
    await saveRoomAllotConfig();
  }
  async function updateRoomAllotPageSetup(){
    const cfg = roomAllotConfig();
    cfg.orientation = document.getElementById('raOrientation').value;
    cfg.pageSize = document.getElementById('raPageSize').value;
    const s = document.getElementById('raSubject'), g = document.getElementById('raDuty'), tm = document.getElementById('raTime');
    if(s) cfg.paperSubject = s.value.trim(); if(g) cfg.generalDuty = g.value.trim(); if(tm) cfg.paperTime = tm.value.trim();
    await saveRoomAllotConfig();
  }
  function printFinalRoomAllotment(){
    const cfg = roomAllotConfig();
    const exam = roomAllotCurrentExam();
    const chk = checkRoomAllotment(roomAllotExamId), data = chk.data;
    if(!chk.ok && !(typeof confirm === 'function' && confirm('The check found problems (see the Check box on this page). Print anyway?'))) return;
    const { roomBlocks, corridorBlock } = data;
    const [wmm, hmm] = PAGE_SIZES_MM[cfg.pageSize] || PAGE_SIZES_MM.A4;
    const pageSizeCss = cfg.orientation === 'landscape' ? `${hmm}mm ${wmm}mm` : `${wmm}mm ${hmm}mm`;
    const rowsHtml = renderFinalPrintoutTable(roomBlocks, corridorBlock, true);
    const sum = raSummaryRows(data);
    const dateTxt = raFmtDate(cfg.paperDate), sessName = raCurrentSession(cfg);
    const blocks = corridorBlock ? [...roomBlocks, corridorBlock] : roomBlocks;
    const allotted = blocks.reduce((s, b) => s + b.total, 0);
    const w = window.open('', '_blank');
    w.document.write(`
      <html><head><title>Final Room Allotment - ${exam?raEsc(exam.name):''}</title>
      <style>
        @page{ size:${pageSizeCss}; margin:10mm; }
        body{ font-family:Arial,Helvetica,sans-serif; color:#111; font-size:11px; }
        .frp-head{ text-align:center; margin-bottom:6px; }
        .frp-school{ font-weight:700; font-size:22px; letter-spacing:.5px; }
        .frp-addr{ font-size:11px; color:#333; }
        .frp-exam{ font-weight:700; font-size:13px; margin-top:6px; }
        .frp-fields{ display:flex; justify-content:space-between; gap:20px; margin:12px 0 8px; font-size:12px; }
        .frp-fields span{ border-bottom:1px solid #333; padding:0 6px 2px; min-width:150px; display:inline-block; font-weight:700; }
        ${RA_TABLE_CSS}
        .ra-tbl{ page-break-inside:auto; } .ra-tbl tr{ page-break-inside:avoid; }
        .foot{ margin-top:12px; display:flex; gap:24px; align-items:flex-start; justify-content:space-between; font-size:10.5px; }
        .foot table{ border-collapse:collapse; } .foot th,.foot td{ border:1px solid #333; padding:3px 8px; text-align:center; }
        .foot th{ background:#eee; } .sigline{ margin-top:34px; border-top:1px solid #333; padding-top:3px; min-width:160px; text-align:center; }
      </style></head>
      <body onload="window.print()">
        <div class="frp-head">
          <div class="frp-school">${raEsc(String(schoolInfo.name || '').toUpperCase())}</div>
          <div class="frp-addr">${raEsc(schoolInfo.address || '')}</div>
          <div class="frp-exam">${exam?raEsc(exam.name.toUpperCase()):''}${sessName ? ' — ' + sessName.toUpperCase() + ' SESSION' : ''}</div>
        </div>
        <div class="frp-fields">
          <div>DATE: <span>${raEsc(dateTxt) || '&nbsp;'}</span></div>
          <div>SUBJECT: <span>${raEsc(cfg.paperSubject || '') || '&nbsp;'}</span></div>
          <div>TIME: <span>${raEsc(cfg.paperTime || '') || '&nbsp;'}</span></div>
          <div>GENERAL DUTY: <span>${raEsc(cfg.generalDuty || '') || '&nbsp;'}</span></div>
        </div>
        <table class="ra-tbl${cfg.showGB === false ? ' nogb' : ''}${cfg.colour === false ? ' bw' : ''}">
          <thead><tr><th rowspan="2">Room No.</th><th rowspan="2">Name of the Invigilator</th><th rowspan="2">Class</th><th colspan="3">ROLL NUMBERS ALLOTMENT</th><th rowspan="2" class="gbc">Girls</th><th rowspan="2" class="gbc">Boys</th><th rowspan="2">Total Candidates in the Room</th><th rowspan="2">Absentees Numbers</th><th rowspan="2">Number Present</th><th rowspan="2">Signature</th></tr><tr><th>FROM</th><th>TO</th><th>TOTAL</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="foot">
          <table><thead><tr><th>Class</th><th style="color:${RA_GIRL_INK};">Girls</th><th>Boys</th><th>Total</th></tr></thead><tbody>
            ${sum.rows.map(r => `<tr><td>${raEsc(r.cls)}</td><td style="color:${RA_GIRL_INK};">${r.g}</td><td>${r.b}</td><td>${r.t}</td></tr>`).join('')}
            <tr><th>All</th><th style="color:${RA_GIRL_INK};">${sum.tg}</th><th>${sum.tb}</th><th>${sum.tg + sum.tb}</th></tr></tbody></table>
          <div>Red numbers = girls, black numbers = boys.<br>Check: ${allotted} allotted = ${sum.tg + sum.tb} enrolled ${allotted === sum.tg + sum.tb ? '✔' : '✖'}<br>Rooms used: ${roomBlocks.length}${corridorBlock ? ' + corridor' : ''}</div>
          <div style="display:flex;gap:30px;"><div class="sigline">General Duty</div><div class="sigline">Principal</div></div>
        </div>
      </body></html>
    `);
    w.document.close();
  }