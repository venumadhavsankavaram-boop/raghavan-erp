/* Add / Edit Student - lighter first step and a progress stepper.
   The student form keeps every field and every id. Step 1 now shows only what an admission needs (name, class, section,
   gender, date of birth, roll no, joining date, photo). The other 13 fields move, unchanged, into a "More details" box that
   opens by itself when a student being edited already has any of them filled. "Next" checks the required fields on step 1
   first, so a missing name is caught there and not when Save is pressed on the last step. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const MORE = ['fEmail','fPassword','fBlood','fMotherTongue','fBirthPlace','fPen','fAadhar','fCaste','fCasteName','fReligion','fCategory','fNationality','fNationalityOther','fStatus'];

  function css(){
    if($('awCss')) return;
    const s = document.createElement('style'); s.id = 'awCss';
    s.textContent = `
    .wizard-tabs{counter-reset:wst;border-bottom:0!important;gap:8px!important;margin-bottom:18px!important}
    .wizard-tabs .wtab{flex:1;min-width:92px;text-align:center;border:0!important;margin:0!important;padding:8px 4px 0!important;border-top:4px solid #1b7f4b!important;color:#1b7f4b!important;font-size:.76rem!important}
    .wizard-tabs .wtab.active{border-top-color:var(--magenta,#c2185b)!important;color:var(--magenta,#c2185b)!important}
    .wizard-tabs .wtab.active ~ .wtab{border-top-color:#e3e0f0!important;color:var(--ink-soft,#5b5a73)!important}
    .aw-more{margin-top:16px;border:1.5px solid var(--border,#e3e0f0);border-radius:14px;background:#fbfaff}
    .aw-more>summary{cursor:pointer;list-style:none;padding:12px 16px;font-weight:700;color:var(--navy,#1a1a4b);display:flex;justify-content:space-between;align-items:center;gap:10px}
    .aw-more>summary::-webkit-details-marker{display:none}
    .aw-more>summary small{font-weight:500;color:var(--ink-soft,#5b5a73)}
    .aw-more>summary::after{content:'+';font-size:1.3rem;color:var(--magenta,#c2185b);line-height:1}
    .aw-more[open]>summary::after{content:'\\2212'}
    .aw-more .form-grid{padding:4px 16px 16px}
    .aw-err{color:#b3261e;font-size:.86rem;margin:10px 0 0;min-height:1.1em}
    `;
    document.head.appendChild(s);
  }

  function build(){
    const panel = $('panel-new');
    if(!panel || panel.dataset.aw) return;
    panel.dataset.aw = '1';
    const grid = panel.querySelector('.form-grid');
    const det = document.createElement('details'); det.className = 'aw-more'; det.id = 'awMore';
    det.innerHTML = '<summary><span>More details <small>optional - email, login password, Aadhaar, caste, religion, status</small></span></summary><div class="form-grid" id="awMoreGrid"></div>';
    const g = det.querySelector('#awMoreGrid');
    MORE.forEach(id => {
      const el = $(id); const box = el && (el.classList.contains('f-field') ? el : el.closest('.f-field'));
      if(box) g.appendChild(box);
    });
    grid.insertAdjacentElement('afterend', det);
    const err = document.createElement('p'); err.className = 'aw-err'; err.id = 'awErr';
    det.insertAdjacentElement('afterend', err);
  }

  function syncOpen(){
    const det = $('awMore'); if(!det) return;
    const edited = ($('wizardTitle') && /Edit/i.test($('wizardTitle').textContent));
    let filled = false;
    ['fEmail','fPassword','fBlood','fMotherTongue','fBirthPlace','fPen','fAadhar','fCaste','fCasteName','fReligion','fCategory'].forEach(id => { const e = $(id); if(e && String(e.value || '').trim()) filled = true; });
    const st = $('fStatus'); if(st && st.value && st.value !== 'Active') filled = true;
    const na = $('fNationality'); if(na && na.value && na.value !== 'Indian') filled = true;
    det.open = !!(edited && filled);
    const e = $('awErr'); if(e) e.textContent = '';
  }

  function guardNext(ev){
    const b = ev.target.closest && ev.target.closest('#wizardNextBtn'); if(!b) return;
    const active = document.querySelector('.wizard-tabs .wtab.active');
    if(!active || active.id !== 'wtab-new') return;
    const need = [['fFirstName','first name'],['fLastName','surname'],['fClass','class'],['fSection','section']];
    for(const [id, label] of need){
      const el = $(id);
      if(el && !String(el.value || '').trim()){
        ev.stopImmediatePropagation(); ev.preventDefault();
        const e = $('awErr'); if(e) e.textContent = 'Please fill the ' + label + ' to continue.';
        try{ el.focus(); }catch(x){}
        return;
      }
    }
    const e = $('awErr'); if(e) e.textContent = '';
  }

  function init(){
    css(); build();
    const form = $('wizardForm'); if(form) form.addEventListener('click', guardNext, true);
    const ov = $('wizardOverlay');
    if(ov) new MutationObserver(() => { if(ov.classList.contains('open')) setTimeout(syncOpen, 0); }).observe(ov, { attributes:true, attributeFilter:['class'] });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
