/* ============================================================================
   Timetable for Teachers: only what concerns them.
   A teacher sees (1) their own timetable and (2) the timetable of the class they are class teacher of.
   Nothing else: no list of other teachers, no other classes, no Periods Setup, and no editing.
   Admin, Principal, office staff and every other role see the Timetable exactly as before.
   ========================================================================== */
(function(){
  const isTeacher = () => { try { return !!currentUser && currentUser.role === 'Teacher'; } catch(e){ return false; } };
  const scope = () => { try { return typeof myTeacherScope === 'function' ? myTeacherScope() : null; } catch(e){ return null; } };
  const note = (title, text) => '<div class="empty-state"><b>' + title + '</b>' + text + '</div>';
  const hideSel = body => { body.querySelectorAll('.ttx-sel').forEach(l => { l.style.display = 'none'; }); };

  function fixTabs(){
    if(!isTeacher()) return;
    const sc = scope() || {};
    const per = document.getElementById('tttab-periods'); if(per) per.style.display = 'none';
    const cls = document.getElementById('tttab-class'); if(cls) cls.style.display = sc.classTeacherOf ? '' : 'none';
    const tch = document.getElementById('tttab-teacher'); if(tch) tch.textContent = 'My Timetable';
    if(cls && sc.classTeacherOf) cls.textContent = 'My Class (' + sc.classTeacherOf.className + ' ' + sc.classTeacherOf.section + ')';
    try {
      if(timetableTab === 'periods' || (timetableTab === 'class' && !sc.classTeacherOf)){
        timetableTab = 'teacher';
        ['class', 'teacher', 'periods'].forEach(t => { const b = document.getElementById('tttab-' + t); if(b) b.classList.toggle('active', t === 'teacher'); });
      }
    } catch(e){}
  }
  if(typeof initTimetableView === 'function'){
    const o = initTimetableView;
    window.initTimetableView = function(){ const r = o.apply(this, arguments); try { fixTabs(); } catch(e){} return r; };
  }
  if(typeof switchTimetableTab === 'function'){
    const o = switchTimetableTab;
    window.switchTimetableTab = function(tab){
      if(isTeacher()){ const sc = scope() || {}; if(tab === 'periods' || (tab === 'class' && !sc.classTeacherOf)) tab = 'teacher'; }
      const r = o.call(this, tab); try { fixTabs(); } catch(e){} return r;
    };
  }
  if(typeof renderClassTimetableTab === 'function'){
    const o = renderClassTimetableTab;
    window.renderClassTimetableTab = function(body){
      if(!isTeacher()) return o.apply(this, arguments);
      const sc = scope();
      if(!sc || !sc.classTeacherOf){ body.innerHTML = note('No class timetable', 'The class timetable is shown to class teachers. Your own timetable is under "My Timetable".'); return; }
      ttClass = sc.classTeacherOf.className; ttSection = sc.classTeacherOf.section;
      const r = o.apply(this, arguments); hideSel(body); return r;
    };
  }
  if(typeof renderTeacherTimetableTab === 'function'){
    const o = renderTeacherTimetableTab;
    window.renderTeacherTimetableTab = function(body){
      if(!isTeacher()) return o.apply(this, arguments);
      const sc = scope();
      if(!sc || !sc.staffId){ body.innerHTML = note('Your login is not linked to a staff record', 'Ask the Admin to link your login to your staff profile. Then your timetable will appear here.'); return; }
      ttTeacherId = sc.staffId;
      const r = o.apply(this, arguments); hideSel(body); return r;
    };
  }
  if(typeof renderTimetablePeriodsTab === 'function'){
    const o = renderTimetablePeriodsTab;
    window.renderTimetablePeriodsTab = function(body){
      if(isTeacher()){ body.innerHTML = note('Not available', 'Periods Setup is managed by the Admin.'); return; }
      return o.apply(this, arguments);
    };
  }
  // Teachers look, they do not edit.
  ['openTtCellModal', 'saveTtCell', 'openMdGroup'].forEach(n => {
    if(typeof window[n] === 'function'){
      const o = window[n];
      window[n] = function(){ if(isTeacher()){ try { showToast('Only the Admin or Principal can change the timetable.'); } catch(e){} return; } return o.apply(this, arguments); };
    }
  });
})();
