/* ============================================================================
   Elective subject for many classes (Subjects > Add Subject).
   Tick "Elective Subject" and you can:
     - add the subject to several other classes in one go (each gets all its sections, the same teachers), and
     - mark it "taken by several classes in one period" so one teacher can take them together in the Timetable.
   The second part only adds the name to the Timetable's "subjects taken by several classes at once" list
   (Admin / Principal). Marks, exams, report cards and every other subject are untouched.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const GKEY = 'timetable-shared-subjects';
  try { OBJECT_BACKED_KEYS[GKEY] = '/api/kv/' + GKEY; } catch(e){}
  const canShare = () => { try { return !!currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Principal'); } catch(e){ return false; } };
  const norm = s => String(s || '').trim().toLowerCase();
  const hasSubject = (cls, name, exceptId) => subjectsList.some(s => s.className === cls && norm(s.name) === norm(name) && s.id !== exceptId);

  function ensureBox(){
    const form = $('masterSubjectForm'); if(!form) return null;
    let box = $('msElectiveBox');
    if(!box){
      box = document.createElement('div'); box.id = 'msElectiveBox'; box.style.cssText = 'display:none;margin:12px 0 0;padding:12px 14px;border:1px solid var(--border,#dde3ee);border-radius:10px;background:#f7f9fe';
      const actions = form.querySelector('.modal-actions'); form.insertBefore(box, actions);
      const el = $('msElective'); if(el) el.addEventListener('change', paint);
      const nm = $('msName'); if(nm) nm.addEventListener('input', () => { if($('msElective').checked) paint(); });
    }
    return box;
  }
  function paint(){
    const box = ensureBox(); if(!box) return;
    if(!$('msElective').checked){ box.style.display = 'none'; return; }
    box.style.display = 'block';
    const keep = new Set(Array.from(box.querySelectorAll('.ms-extra:checked')).map(c => c.value));
    const cur = $('msClass').value, name = $('msName').value.trim(), editId = $('editMasterSubjectId').value;
    const chips = CLASS_LEVELS.filter(c => c !== cur).map(c => {
      const has = name && hasSubject(c, name, editId);
      return `<label class="admission-toggle" style="min-width:88px"><input type="checkbox" class="ms-extra" value="${esc(c)}" ${has ? 'disabled' : ''} ${keep.has(c) ? 'checked' : ''}> ${esc(c)}${has ? ' <small style="color:#5b6784">(has it)</small>' : ''}</label>`;
    }).join('');
    const prevShared = $('msSharedPeriod') ? $('msSharedPeriod').checked : null;
    const sharedNow = typeof ttSharedKind === 'function' && name && ttSharedKind(name) !== '';
    box.innerHTML = `<div style="font-weight:600;font-size:.84rem;color:var(--navy,#1a2a52);margin-bottom:4px">Also add this elective to other classes</div>
      <div style="font-size:.76rem;color:var(--ink-soft,#5b6784);margin-bottom:8px">Each ticked class gets this subject with all its sections and the teachers chosen above. You can fine-tune any class later with Edit.</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin-bottom:8px">${chips}</div>
      <div style="margin-bottom:8px"><button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#msElectiveBox .ms-extra:not(:disabled)').forEach(c=>c.checked=true)">Tick all</button> <button type="button" class="btn btn-ghost btn-sm" onclick="document.querySelectorAll('#msElectiveBox .ms-extra').forEach(c=>c.checked=false)">Clear</button></div>
      ${canShare() ? `<label class="admission-toggle"><input type="checkbox" id="msSharedPeriod" ${(prevShared == null ? true : prevShared) || sharedNow ? 'checked' : ''} ${sharedNow ? 'disabled' : ''}> One teacher takes these classes together in the same period${sharedNow ? ' <small style="color:#5b6784">(already allowed in the Timetable)</small>' : ''}</label>
      <div style="font-size:.76rem;color:var(--ink-soft,#5b6784);margin-top:2px">Timetable only: this subject will not show a teacher clash when several classes have it in one period.</div>` : ''}`;
  }

  if(typeof openMasterSubjectModal === 'function'){
    const o = openMasterSubjectModal;
    window.openMasterSubjectModal = function(){
      const r = o.apply(this, arguments);
      try {
        const b = ensureBox(); if(b) b.innerHTML = '';
        const cls = $('msClass'); if(cls && !cls.dataset.emHook){ cls.dataset.emHook = '1'; cls.addEventListener('change', () => { if($('msElective').checked) paint(); }); }
        paint();
      } catch(e){}
      return r;
    };
  }

  async function addToSharedList(name){
    let list = null;
    try { const v = await storageGet(GKEY, null); if(Array.isArray(v)) list = v; } catch(e){}
    if(!list) list = (typeof ttSharedGroups === 'function' ? ttSharedGroups() : []).map(g => ({ ...g, names: (g.names || []).slice() }));
    if(typeof ttSharedKind === 'function' && ttSharedKind(name)) return true;
    let id = norm(name).replace(/[^a-z0-9]+/g, '') || 'subj'; while(list.some(g => g.id === id)) id += 'x';
    list.push({ id, label: name, names: [name] });
    const ok = await storageSet(GKEY, list);
    if(ok === false) return false;
    window.ttSharedGroupsData = list; return true;
  }

  if(typeof saveMasterSubject === 'function'){
    const o = saveMasterSubject;
    window.saveMasterSubject = async function(e){
      const elective = $('msElective') && $('msElective').checked;
      const extras = elective ? Array.from(document.querySelectorAll('#msElectiveBox .ms-extra:checked')).map(c => c.value) : [];
      const sharedTick = elective && canShare() && $('msSharedPeriod') && $('msSharedPeriod').checked && !$('msSharedPeriod').disabled;
      const name = $('msName').value.trim(), cls = $('msClass').value;
      const r = await o.apply(this, arguments);
      try {
        const open = $('masterSubjectModalOverlay') && $('masterSubjectModalOverlay').classList.contains('open');
        if(open || !elective) return r;      // validation failed (form still open) or not an elective
        const base = subjectsList.find(s => s.className === cls && norm(s.name) === norm(name));
        if(!base) return r;
        let added = [], skipped = [];
        extras.forEach((c, i) => {
          if(hasSubject(c, name)) { skipped.push(c); return; }
          const secs = (typeof sectionsForClass === 'function' ? sectionsForClass(c) : ['A']) || ['A'];
          const staff = (base.staffIds || []).slice(), sectionStaff = {};
          secs.forEach(s => { sectionStaff[s] = staff.slice(); });
          subjectsList.push({ id: 'msub_' + Date.now() + '_' + i, name: base.name, code: base.code || '', className: c, sections: secs.slice(), sectionStaff, staffIds: staff, countable: base.countable !== false, elective: true });
          added.push(c);
        });
        if(added.length) await storageSet(SUBJECTS_KEY, subjectsList);
        let msg = '';
        if(sharedTick){ const ok = await addToSharedList(base.name); msg += ok ? ' Timetable: one teacher can take it with several classes in a period.' : ' Could not update the Timetable list (ask the Admin).'; }
        if(added.length || msg){ showToast('Elective "' + base.name + '"' + (added.length ? ' also added to ' + added.join(', ') + '.' : ' saved.') + msg); }
        if(skipped.length) showToast('Already had it: ' + skipped.join(', ') + '.');
        try { renderSubjectsBody(); } catch(e2){}
      } catch(e3){}
      return r;
    };
  }
})();
