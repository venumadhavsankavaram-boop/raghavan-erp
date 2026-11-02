/* =========================================================================
   Admit Cards and Room Allotment now live inside Manage Exams (tabs after "Results Summary").
   They are the SAME screens as before: this file only moves where they open. Their code, data,
   permissions (Roles & Permissions still calls them Result > Admit Cards / Room Allotment) and
   printing are untouched. They keep drawing into #resultBody, which is carried into the Manage
   Exams page while one of these two tabs is open and put back in Result afterwards.
   If a role can open Result but not Manage Exams, the two tabs simply stay in Result for them.
   ========================================================================= */
(function(){
  'use strict';
  const MINE = { admitcards: 'Admit Cards', roomallotment: 'Room Allotment' };
  const KEYS = { admitcards: 'result_admitcards', roomallotment: 'result_roomallotment' };
  const $ = id => document.getElementById(id);
  let moved = false;

  const examsUsable = () => { try{ return !!currentUser && getRoleViews(currentUser.role).includes('exams') && !!$('view-exams'); }catch(e){ return false; } };
  const can = t => { try{ return !!getResultTabAccess(currentUser.role, KEYS[t]); }catch(e){ return false; } };

  function moveIn(){
    const body = $('resultBody'), ex = $('examBody'); if(!body || !ex) return;
    if(!moved){ ex.insertAdjacentElement('afterend', body); moved = true; }
    ex.style.display = 'none'; body.style.display = '';
  }
  function moveOut(){
    const body = $('resultBody'), ex = $('examBody'), rv = $('view-result');
    if(moved && body && rv){ rv.appendChild(body); }
    moved = false;
    if(ex) ex.style.display = '';
  }
  function markActive(tab){
    document.querySelectorAll('#view-exams .mf-tabs .mf-tab').forEach(b => b.classList.remove('active'));
    const b = $('extab-' + tab); if(b) b.classList.add('active');
  }
  function ensureTabs(){
    const usable = examsUsable();
    let anchor = $('extab-results');
    Object.keys(MINE).forEach(t => {
      let b = $('extab-' + t);
      if(!usable || !can(t) || !anchor){ if(b) b.remove(); return; }
      if(!b){
        b = document.createElement('button'); b.type = 'button'; b.className = 'mf-tab'; b.id = 'extab-' + t; b.textContent = MINE[t];
        b.setAttribute('onclick', "switchExamTab('" + t + "')");
        anchor.insertAdjacentElement('afterend', b);
      }
      anchor = b;
    });
    const p = document.querySelector('#view-exams .topbar p');
    if(p && usable) p.textContent = 'Exams, marks entry, admit cards, room allotment, report cards, results, and grading — all in one place.';
  }
  function showMine(tab){
    ensureTabs();
    moveIn();
    origSwitchResultTab(tab);
    markActive(tab);
  }

  const origSwitchResultTab = window.switchResultTab;
  window.switchResultTab = function(tab){
    if(MINE[tab] && examsUsable() && can(tab)){
      const ev = $('view-exams');
      if(!ev || ev.style.display === 'none'){ switchView('exams'); }
      showMine(tab);
      return;
    }
    return origSwitchResultTab.apply(this, arguments);
  };

  const origSwitchExamTab = window.switchExamTab;
  window.switchExamTab = function(tab){
    if(MINE[tab] && can(tab)){ showMine(tab); return; }
    moveOut();
    const r = origSwitchExamTab.apply(this, arguments);
    Object.keys(MINE).forEach(t => { const b = $('extab-' + t); if(b) b.classList.remove('active'); });
    return r;
  };

  const origRenderExamBody = window.renderExamBody;
  if(typeof origRenderExamBody === 'function'){
    window.renderExamBody = function(){
      if(moved) return window.renderResultBody();
      return origRenderExamBody.apply(this, arguments);
    };
  }

  const origInitExams = window.initExamsView;
  window.initExamsView = function(){
    ensureTabs();
    return origInitExams.apply(this, arguments);
  };

  const origInitResult = window.initResultView;
  window.initResultView = function(){
    moveOut();
    const usable = examsUsable();
    if(usable && MINE[resultTab]){ const nxt = RESULT_TABS.filter(t => !MINE[t] && getResultTabAccess(currentUser.role, RESULT_TAB_PERM_KEYS[t]))[0]; resultTab = nxt || resultTab; }
    const r = origInitResult.apply(this, arguments);
    if(usable){
      Object.keys(MINE).forEach(t => { const b = $('restab-' + t); if(b) b.style.display = 'none'; });
      const p = document.querySelector('#view-result .topbar p');
      if(p) p.textContent = 'Progress reports, year-end consolidated results, grading scale, and report templates — all in one place. (Admit Cards and Room Allotment are now in Manage Exams.)';
    }
    return r;
  };
})();
