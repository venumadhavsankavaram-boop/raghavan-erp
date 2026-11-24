/* Copyright (c) 2026 SVM EdTech. All rights reserved. Proprietary and confidential.
   Unauthorised copying, modification or distribution of this file is prohibited. See LICENSE. */
/* ============================================================================
   Teacher notices: own class only.
   A Teacher can send a notice only to the parents of the classes and sections they teach (class teacher
   or subject teacher). The server enforces this; this file simply stops offering the choices that would be
   refused: All students, All staff, Everyone, Fee defaulters, and classes or sections that are not theirs.
   ========================================================================== */
(function(){
  'use strict';
  const isT = () => typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'Teacher';
  function rooms(){
    const st = (typeof staffList !== 'undefined' ? staffList : []).find(x => x.linkedUserId === currentUser.id);
    const out = new Set();
    if(!st) return out;
    if(st.classTeacherClass && st.classTeacherSection) out.add(st.classTeacherClass + '|' + st.classTeacherSection);
    (typeof subjectsList !== 'undefined' ? subjectsList : []).forEach(sub => {
      Object.entries(sub.sectionStaff || {}).forEach(([sec, ids]) => { if(Array.isArray(ids) && ids.includes(st.id)) out.add(sub.className + '|' + sec); });
    });
    return out;
  }
  function trimSelect(sel, keep){
    if(!sel) return;
    Array.from(sel.options).forEach(o => { if(o.value && !keep(o.value, o.textContent)) o.remove(); });
  }
  function tick(){
    if(!isT()) return;
    const r = rooms();
    const classes = new Set([...r].map(x => x.split('|')[0]));
    const secsOf = c => new Set([...r].filter(x => x.split('|')[0] === c).map(x => x.split('|')[1]));
    // Communications > Compose
    const sc = document.getElementById('commsAudienceScope');
    if(sc){
      ['allstudents', 'allstaff', 'defaulters'].forEach(v => { const o = sc.querySelector('option[value="' + v + '"]'); if(o) o.remove(); });
      if(typeof commsAudienceScope !== 'undefined' && ['allstudents', 'allstaff', 'defaulters'].includes(commsAudienceScope)){
        commsAudienceScope = 'section'; sc.value = 'section'; try{ renderCommsAudienceFields(); }catch(e){}
      }
    }
    trimSelect(document.getElementById('commsClassSel'), v => classes.has(v));
    const cs = document.getElementById('commsSectionSel');
    if(cs){ const c = (typeof commsAudienceClass !== 'undefined' && commsAudienceClass) || ''; trimSelect(cs, v => !c || secsOf(c).has(v)); }
    // Notice Board
    if(typeof NBX_SCOPES !== 'undefined'){
      for(let i = NBX_SCOPES.length - 1; i >= 0; i--) if(!['class', 'section', 'individual'].includes(NBX_SCOPES[i][0])) NBX_SCOPES.splice(i, 1);
      if(typeof nbxScope !== 'undefined' && !['class', 'section', 'individual'].includes(nbxScope)){ nbxScope = 'section'; try{ nbxPaintComposer(); }catch(e){} }
    }
  }
  setInterval(tick, 800);
})();
