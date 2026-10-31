/* ============================================================================
   Two tidy-ups.
   1) Teachers and Homework / Syllabus: a Teacher can add, change and see homework and syllabus topics only for the
      class + section + subject they are assigned to teach (the server enforces the same rule). Admin, Principal and
      every other role see everything, as before.
   2) Sidebar section numbers: the small number beside Communication, Academics and so on used to be fixed text.
      It now counts only the links the signed-in person can actually open.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isTeacher = () => { try { return !!currentUser && currentUser.role === 'Teacher'; } catch(e){ return false; } };
  const mine = () => { try { return (typeof myTeacherScope === 'function' && myTeacherScope()) || { subjectSections: [] }; } catch(e){ return { subjectSections: [] }; } };
  const ssAll = () => mine().subjectSections || [];
  const myClasses = () => CLASS_LEVELS.filter(c => ssAll().some(x => x.className === c));
  const mySections = c => sectionsForClass(c).filter(s => ssAll().some(x => x.className === c && x.section === s));
  const mySubjects = (c, s) => Array.from(new Set(ssAll().filter(x => x.className === c && (!s || x.section === s)).map(x => x.subject)));
  // blank section ("all sections") is allowed only when the teacher teaches that subject in every section of the class
  const coversAll = (c, subj) => { const subjRow = subjectsList.find(r => r.className === c && r.name === subj); const secs = subjRow ? (subjRow.sections || []) : []; return secs.length > 0 && secs.every(s => ssAll().some(x => x.className === c && x.subject === subj && x.section === s)); };
  const itemOk = it => !!it && (it.section ? ssAll().some(x => x.className === it.className && x.section === it.section && x.subject === it.subject) : coversAll(it.className, it.subject));

  /* ---- filter bar for teachers ---- */
  if(typeof syFilterBarHtml === 'function'){
    const o = syFilterBarHtml;
    window.syFilterBarHtml = function(){
      if(!isTeacher()) return o.apply(this, arguments);
      const cls = myClasses();
      if(syClass && !cls.includes(syClass)){ syClass = ''; sySection = ''; sySubject = ''; }
      const secs = syClass ? mySections(syClass) : [];
      if(sySection && !secs.includes(sySection)) sySection = '';
      const subs = syClass ? mySubjects(syClass, sySection) : [];
      if(sySubject && !subs.includes(sySubject)) sySubject = '';
      return `<div class="form-grid" style="max-width:640px; margin-bottom:16px;">
        <div class="f-field"><label>Class</label><select onchange="syClass=this.value; sySection=''; sySubject=''; renderSyllabusBody();"><option value="">My classes</option>${cls.map(c => `<option ${c === syClass ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="f-field"><label>Section</label><select onchange="sySection=this.value; sySubject=''; renderSyllabusBody();" ${!syClass ? 'disabled' : ''}><option value="">My sections</option>${secs.map(s => `<option ${s === sySection ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="f-field"><label>Subject</label><select onchange="sySubject=this.value; renderSyllabusBody();" ${!syClass ? 'disabled' : ''}><option value="">My subjects</option>${subs.map(n => `<option ${n === sySubject ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      </div>`;
    };
  }
  // lists: show a teacher only the items for their own class + subject (the arrays are put back right after drawing)
  if(typeof renderSyllabusBody === 'function'){
    const o = renderSyllabusBody;
    window.renderSyllabusBody = function(){
      if(!isTeacher()) return o.apply(this, arguments);
      const st = syllabusTopics, hw = homeworkItems;
      syllabusTopics = st.filter(itemOk); homeworkItems = hw.filter(itemOk);
      let r;
      try { r = o.apply(this, arguments); } finally { syllabusTopics = st; homeworkItems = hw; }
      try {
        const body = $('syllabusBody');
        if(body && !ssAll().length && !(mine().unlinked)) body.innerHTML = '<div class="empty-state"><b>No subjects allotted to you yet</b>Homework and syllabus topics are added for the classes and subjects you teach. Ask the Admin to allot your subjects (Subjects, then choose your name under Staff).</div>';
        else if(body && mine().unlinked) body.innerHTML = '<div class="empty-state"><b>Your login is not linked to a staff record</b>Ask the Admin to link your login to your staff profile.</div>';
      } catch(e){}
      return r;
    };
  }
  /* ---- add / edit forms for teachers ---- */
  function limitForm(secId, subId, staffId){
    const sec = $(secId), sub = $(subId); if(!sec || !sub) return;
    const cls = syClass;
    const allowedSecs = mySections(cls);
    const keepSec = sec.value;
    // "All Sections" only if the teacher covers every section for at least one of their subjects
    const anyAll = mySubjects(cls).some(n => coversAll(cls, n));
    sec.innerHTML = (anyAll ? '<option value="">All Sections</option>' : '<option value="">Select section</option>') + allowedSecs.map(s => `<option ${s === keepSec ? 'selected' : ''}>${esc(s)}</option>`).join('');
    if(!anyAll && !keepSec && allowedSecs.length === 1) sec.value = allowedSecs[0];
    const fill = () => {
      const s = sec.value, keep = sub.value;
      const names = s ? mySubjects(cls, s) : mySubjects(cls).filter(n => coversAll(cls, n));
      sub.innerHTML = '<option value="">Select subject</option>' + names.map(n => `<option ${n === keep ? 'selected' : ''}>${esc(n)}</option>`).join('');
    };
    sec.onchange = fill; fill();
    const st = $(staffId);
    if(st){ const me = (typeof staffList !== 'undefined') && staffList.find(x => x.linkedUserId === currentUser.id); if(me) st.innerHTML = `<option value="${esc(me.id)}" selected>${esc((me.firstName || '') + ' ' + (me.lastName || ''))}</option>`; }
  }
  if(typeof openHomeworkModal === 'function'){
    const o = openHomeworkModal;
    window.openHomeworkModal = function(id){
      if(isTeacher() && id){ const h = homeworkItems.find(x => x.id === id); if(h && !itemOk(h)){ showToast('You can only change homework for your own class and subject.'); return; } }
      const r = o.apply(this, arguments);
      if(isTeacher()){ try { limitForm('hwSection', 'hwSubject', 'hwStaff'); if(id){ const h = homeworkItems.find(x => x.id === id); if(h){ $('hwSection').value = h.section || ''; $('hwSection').onchange(); $('hwSubject').value = h.subject; } } } catch(e){} }
      return r;
    };
  }
  if(typeof openSyllabusTopicModal === 'function'){
    const o = openSyllabusTopicModal;
    window.openSyllabusTopicModal = function(id){
      if(isTeacher() && id){ const t = syllabusTopics.find(x => x.id === id); if(t && !itemOk(t)){ showToast('You can only change topics for your own class and subject.'); return; } }
      const r = o.apply(this, arguments);
      if(isTeacher()){ try { limitForm('syTopicSection', 'syTopicSubject', null); if(id){ const t = syllabusTopics.find(x => x.id === id); if(t){ $('syTopicSection').value = t.section || ''; $('syTopicSection').onchange(); $('syTopicSubject').value = t.subject; } } } catch(e){} }
      return r;
    };
  }
  // saving: refuse on screen too, with a clear reason (the server refuses as well)
  ['saveHomework', 'saveSyllabusTopic'].forEach(n => {
    if(typeof window[n] !== 'function') return;
    const o = window[n];
    const ids = n === 'saveHomework' ? ['hwSection', 'hwSubject'] : ['syTopicSection', 'syTopicSubject'];
    window[n] = function(e){
      if(isTeacher() && !itemOk({ className: syClass, section: $(ids[0]).value, subject: $(ids[1]).value })){
        if(e && e.preventDefault) e.preventDefault();
        showToast('Choose a section and subject that you teach.'); return false;
      }
      return o.apply(this, arguments);
    };
  });

  /* ---- sidebar numbers ---- */
  function recount(){
    try {
      (typeof SB_SECTION_KEYS !== 'undefined' ? SB_SECTION_KEYS : []).forEach(key => {
        const group = $('sbGroup-' + key), badge = $('sbCount-' + key); if(!group || !badge) return;
        const n = Array.from(group.querySelectorAll('.sb-link')).filter(el => el.style.display !== 'none').length;
        if(badge.textContent !== String(n)) badge.textContent = n;
      });
    } catch(e){}
  }
  if(typeof updateSbSectionVisibility === 'function'){
    const o = updateSbSectionVisibility;
    window.updateSbSectionVisibility = function(){ const r = o.apply(this, arguments); recount(); return r; };
  }
  document.addEventListener('DOMContentLoaded', recount);
  setTimeout(recount, 1500);
})();
