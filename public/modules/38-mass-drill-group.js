/* ============================================================================
   Timetable: "Mass Drill for a group" - give MD to many classes in one go.
   Pick day + period + teacher, tick the classes (or use the Primary / High school
   buttons), and every ticked class gets Mass Drill in that slot. A class that already
   has another subject there is skipped and listed. Needs an MD / Mass Drill subject in each class.
   ========================================================================== */
(function(){
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const canEdit = () => { try { return ['Admin', 'Principal'].includes(currentUser.role); } catch(e){ return false; } };
  const shared = n => typeof ttIsSharedSubject === 'function' && ttIsSharedSubject(n);
  const primaryIdx = () => { const i = CLASS_LEVELS.indexOf('5th Class'); return i < 0 ? 8 : i; };
  const isPrimary = cls => CLASS_LEVELS.indexOf(cls) <= primaryIdx();

  // [{cls, sec, subject}] for every class-section that has an MD subject
  function targets(){
    const out = [];
    CLASS_LEVELS.forEach(cls => {
      const subs = subjectsList.filter(s => s.className === cls && shared(s.name));
      const secs = new Set(); subs.forEach(s => (s.sections || []).forEach(x => secs.add(x)));
      Array.from(secs).sort().forEach(sec => { const s = subs.find(x => (x.sections || []).includes(sec)); out.push({ cls, sec, subject: s.name }); });
    });
    return out;
  }
  const key = t => t.cls + '|' + t.sec;

  const css = document.createElement('style');
  css.textContent = `
  .md-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:10px 14px;border:1px dashed #b9c4dc;border-radius:12px;background:#f7f9fd;font-size:.85rem;color:#33405c}
  .md-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:8px 0}
  .md-chk{display:flex;gap:6px;align-items:center;border:1px solid #dde3ee;border-radius:8px;padding:6px 8px;font-size:.82rem;cursor:pointer;background:#fff}
  .md-chk.off{opacity:.45;cursor:not-allowed}
  .md-quick{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}
  .md-quick button{border:1px solid #cfd7e6;background:#fff;border-radius:999px;padding:5px 12px;font-size:.78rem;font-weight:600;cursor:pointer}
  .md-note{font-size:.8rem;border-radius:8px;padding:8px 10px;margin-top:10px}
  .md-ok{background:#e8f7ef;color:#14532d}.md-warn{background:#fff3d6;color:#6b4e0b}.md-bad{background:rgba(209,16,115,.1);color:#8a0b4f}`;
  document.head.appendChild(css);

  function addBar(){
    const body = document.getElementById('timetableBody');
    if(!body || body.querySelector('.md-bar')) return;
    if(typeof timetableTab !== 'undefined' && timetableTab !== 'class') return;
    if(!canEdit()) return;
    const bar = document.createElement('div'); bar.className = 'md-bar';
    bar.innerHTML = `<span>🏃 <b>Mass Drill (MD)</b> for many classes in one go</span><button type="button" class="btn btn-ghost" onclick="openMdGroup()">Set Mass Drill for a group</button>`;
    body.prepend(bar);
  }
  if(typeof renderTimetableBody === 'function'){
    const orig = renderTimetableBody;
    window.renderTimetableBody = function(){ const r = orig.apply(this, arguments); Promise.resolve(r).then(() => setTimeout(addBar, 0)); setTimeout(addBar, 0); return r; };
  }

  function overlay(){
    let o = document.getElementById('mdGroupOverlay');
    if(!o){
      document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay" id="mdGroupOverlay"><div class="modal" style="max-width:720px;"><div class="modal-inner"><button class="modal-close" onclick="closeMdGroup()">&times;</button><div id="mdGroupBody"></div></div></div></div>`);
      o = document.getElementById('mdGroupOverlay');
    }
    return o;
  }
  window.closeMdGroup = function(){ const o = document.getElementById('mdGroupOverlay'); if(o) o.classList.remove('open'); };

  window.openMdGroup = function(){
    const T = targets();
    const days = activeTimetableDays(), periods = timetablePeriods.filter(p => !p.isBreak);
    const mdIds = new Set(); subjectsList.filter(s => shared(s.name)).forEach(s => (s.staffIds || []).forEach(i => mdIds.add(i)));
    const act = staffList.filter(s => staffIsActive(s));
    const stOpt = s => `<option value="${s.id}">${esc(s.firstName)} ${esc(s.lastName)}</option>`;
    const boxes = T.map(t => `<label class="md-chk"><input type="checkbox" class="md-box" value="${esc(key(t))}" onchange="mdCheck()"> ${esc(t.cls)} ${esc(t.sec)}</label>`).join('');
    const missing = CLASS_LEVELS.filter(c => !T.some(t => t.cls === c));
    const mdStaff = act.filter(s => mdIds.has(s.id)), otherStaff = act.filter(s => !mdIds.has(s.id));
    const staffOpts = '<option value="">Select teacher</option>' + (mdStaff.length ? '<optgroup label="Teaches Mass Drill">' + mdStaff.map(stOpt).join('') + '</optgroup>' : '') + '<optgroup label="Other staff">' + otherStaff.map(stOpt).join('') + '</optgroup>';
    const dayOpts = '<option value="*">Every day of the week</option>' + days.map(d => '<option>' + esc(d) + '</option>').join('');
    const perOpts = periods.map(p => '<option value="' + esc(p.id) + '">' + esc(p.label) + ' (' + esc(p.start) + '–' + esc(p.end) + ')</option>').join('');
    const missNote = missing.length ? '<div class="md-note md-warn">No Mass Drill subject yet in: ' + missing.map(esc).join(', ') + '. Add an "MD" or "Mass Drill" subject in Manage Subjects to include them.</div>' : '';
    const form = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:8px">'
      + '<div class="f-field"><label>Day</label><select id="mdDay" onchange="mdCheck()">' + dayOpts + '</select></div>'
      + '<div class="f-field"><label>Period</label><select id="mdPer" onchange="mdCheck()">' + perOpts + '</select></div>'
      + '<div class="f-field"><label>Teacher</label><select id="mdStaff" onchange="mdCheck()">' + staffOpts + '</select></div></div>'
      + '<div class="md-quick"><button type="button" onclick="mdPick(\'primary\')">Primary (' + esc(CLASS_LEVELS[0]) + ' – 5th)</button>'
      + '<button type="button" onclick="mdPick(\'high\')">High school (6th – ' + esc(CLASS_LEVELS[CLASS_LEVELS.length - 1]) + ')</button>'
      + '<button type="button" onclick="mdPick(\'all\')">All classes</button><button type="button" onclick="mdPick(\'none\')">Clear ticks</button></div>'
      + '<div class="md-grid">' + boxes + '</div>' + missNote + '<div id="mdPreview"></div>'
      + '<div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="closeMdGroup()">Cancel</button><button type="button" class="btn btn-primary" id="mdApplyBtn" onclick="applyMdGroup()" disabled>Set Mass Drill</button></div>';
    const empty = '<div class="md-note md-warn">No class has a Mass Drill subject yet. In Manage Subjects, add a subject named "MD" or "Mass Drill" to the classes that take it, then come back here.</div>';
    overlay();
    document.getElementById('mdGroupBody').innerHTML = '<h2>Mass Drill for a group</h2><p class="modal-sub">One teacher takes Mass Drill with several classes together in the same period.</p>' + (T.length ? form : empty);
    document.getElementById('mdGroupOverlay').classList.add('open');
    mdCheck();
  };
  window.mdPick = function(which){
    document.querySelectorAll('.md-box').forEach(b => {
      const cls = b.value.split('|')[0];
      b.checked = which === 'all' || (which === 'primary' && isPrimary(cls)) || (which === 'high' && !isPrimary(cls));
      if(which === 'none') b.checked = false;
    });
    mdCheck();
  };

  // Work out what would happen, without saving anything. Each item is one class-section on one day.
  function plan(){
    const dayV = (document.getElementById('mdDay') || {}).value, per = (document.getElementById('mdPer') || {}).value, staff = (document.getElementById('mdStaff') || {}).value;
    const dayList = dayV === '*' ? activeTimetableDays() : [dayV];
    const picked = Array.from(document.querySelectorAll('.md-box:checked')).map(b => b.value);
    const T = targets().filter(t => picked.includes(key(t)));
    const add = [], same = [], skip = [], busy = [];
    dayList.forEach(day => {
      T.forEach(t => {
        const ex = timetableEntries.find(e => e.className === t.cls && e.section === t.sec && e.day === day && e.period === per);
        const label = t.cls + ' ' + t.sec + (dayList.length > 1 ? ' ' + String(day).slice(0, 3) : '');
        if(!ex) add.push({ t, day });
        else if(shared(ex.subject)) (ex.staffId === staff ? same : add).push({ t, day });
        else skip.push(label + ' (has ' + ex.subject + ')');
      });
      // The teacher must not be teaching something that is not Mass Drill in this slot.
      if(staff) timetableEntries.filter(e => e.day === day && e.period === per && e.staffId === staff && !shared(e.subject) && !T.some(t => t.cls === e.className && t.sec === e.section)).forEach(e => busy.push(e));
    });
    return { dayList, per, staff, T, add, same, skip, busy };
  }
  window.mdCheck = function(){
    const pv = document.getElementById('mdPreview'), btn = document.getElementById('mdApplyBtn'); if(!pv) return;
    const p = plan(); let html = '', can = false;
    if(!p.staff) html = '<div class="md-note md-warn">Choose a teacher.</div>';
    else if(!p.T.length) html = '<div class="md-note md-warn">Tick the classes that should have Mass Drill.</div>';
    else if(p.busy.length) html = '<div class="md-note md-bad">⚠ This teacher is already teaching another subject at this time: ' + p.busy.map(e => esc(e.className) + ' ' + esc(e.section) + ' ' + esc(String(e.day).slice(0, 3)) + ' (' + esc(e.subject) + ')').join(', ') + '. Choose a different teacher or period.</div>';
    else {
      can = p.add.length > 0;
      html = '<div class="md-note md-ok">Will set Mass Drill for <b>' + p.add.length + '</b> class-period' + (p.add.length === 1 ? '' : 's') + (p.dayList.length > 1 ? ' across ' + p.dayList.length + ' days' : '') + (p.same.length ? ' · ' + p.same.length + ' already set' : '') + '.</div>' +
        (p.skip.length ? '<div class="md-note md-warn"><b>' + p.skip.length + ' skipped</b>, they already have another subject in this period: ' + p.skip.map(esc).join('; ') + '. Clear that slot first if it should be Mass Drill.</div>' : '');
    }
    pv.innerHTML = html; if(btn) btn.disabled = !can;
  };
  window.applyMdGroup = async function(){
    const p = plan(); if(!p.staff || p.busy.length || !p.add.length) return;
    const stamp = Date.now();
    p.add.forEach(({ t, day }, i) => {
      const idx = timetableEntries.findIndex(e => e.className === t.cls && e.section === t.sec && e.day === day && e.period === p.per);
      const data = { className: t.cls, section: t.sec, day, period: p.per, subject: t.subject, staffId: p.staff };
      if(idx > -1) timetableEntries[idx] = { ...timetableEntries[idx], ...data };
      else timetableEntries.push({ id: 'tt_' + stamp + '_' + i, ...data });
    });
    await storageSet(TIMETABLE_KEY, timetableEntries);
    closeMdGroup(); renderTimetableBody();
    showToast('Mass Drill set for ' + p.add.length + ' class-period' + (p.add.length === 1 ? '' : 's') + (p.skip.length ? ' (' + p.skip.length + ' skipped)' : '') + '.', 'burst');
  };

  /* ---- Any subject: repeat the same period on every day of the week (class timetable cell) ---- */
  if(typeof openTtCellModal === 'function'){
    const origOpen = openTtCellModal;
    window.openTtCellModal = function(){
      const r = origOpen.apply(this, arguments);
      const filled = timetableEntries.some(e => e.className === ttClass && e.section === ttSection && e.day === arguments[0] && e.period === arguments[1]);
      let row = document.getElementById('ttRepeatRow');
      if(!row){
        const warn = document.getElementById('ttConflictWarning');
        if(warn) warn.insertAdjacentHTML('beforebegin', '<label id="ttRepeatRow" style="display:flex;gap:8px;align-items:center;margin:0 0 12px;font-size:.84rem;cursor:pointer"><input type="checkbox" id="ttRepeatAll" onchange="try{localStorage.setItem(\'erpTtRepeat\', this.checked ? \'1\' : \'0\')}catch(e){}"> <span>Repeat in this same period on every day of the week<br><small style="color:#5b6784">Stays ticked for new periods, so each subject you add fills the whole week. A period that is already filled opens unticked, so you can edit just that day. Days with another subject are left alone.</small></span></label>');
      }
      const c = document.getElementById('ttRepeatAll'); if(c){ let on = false; try { on = localStorage.getItem('erpTtRepeat') === '1'; } catch(e){} c.checked = on && !filled; }
      return r;
    };
  }
  if(typeof saveTtCell === 'function'){
    const origSave = saveTtCell;
    window.saveTtCell = async function(){
      const rep = (document.getElementById('ttRepeatAll') || {}).checked;
      const subject = (document.getElementById('ttCellSubject') || {}).value, staffId = (document.getElementById('ttCellStaff') || {}).value;
      const cls = ttClass, sec = ttSection, per = ttEditPeriod, day0 = ttEditDay;
      const r = await origSave.apply(this, arguments);
      if(!rep || !subject || !staffId) return r;
      const here = timetableEntries.find(e => e.className === cls && e.section === sec && e.day === day0 && e.period === per && e.subject === subject && e.staffId === staffId);
      if(!here) return r;                       // the normal save was refused (teacher clash): nothing to repeat
      const isMd = shared(subject);
      let added = 0; const skipped = [];
      activeTimetableDays().filter(d => d !== day0).forEach((d, i) => {
        const ex = timetableEntries.find(e => e.className === cls && e.section === sec && e.day === d && e.period === per);
        if(ex && ex.subject !== subject) { skipped.push(String(d).slice(0, 3) + ' (has ' + ex.subject + ')'); return; }
        const clash = timetableEntries.find(e => e.day === d && e.period === per && e.staffId === staffId && !(e.className === cls && e.section === sec) && !(isMd && shared(e.subject)));
        if(clash) { skipped.push(String(d).slice(0, 3) + ' (teacher busy in ' + clash.className + ' ' + clash.section + ')'); return; }
        const data = { className: cls, section: sec, day: d, period: per, subject, staffId };
        if(ex) Object.assign(ex, data); else timetableEntries.push({ id: 'tt_' + Date.now() + '_r' + i, ...data });
        added++;
      });
      await storageSet(TIMETABLE_KEY, timetableEntries);
      renderTimetableBody();
      showToast('Repeated on ' + added + ' more day' + (added === 1 ? '' : 's') + (skipped.length ? '. Skipped: ' + skipped.join(', ') : '.'), 'burst');
      return r;
    };
  }
})();
