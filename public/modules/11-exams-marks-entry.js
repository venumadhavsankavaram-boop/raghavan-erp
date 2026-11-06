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
  