/* School Setup - "Year-end checklist". A small bar on the Academic Year, Fee Structure and Promotions screens that opens into
   four steps in the order chosen for the school: 1 Add the new year > 2 Check fees > 3 Promote students > 4 Make it current.
   It only moves between the existing screens (switchView) and explains each step; it changes no data and blocks nothing.
   Collapsed by default so it stays out of the way for the rest of the year. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const VIEWS = ['academicyear', 'feestructuresetup', 'promotions'];
  const STEPS = [
    { n:1, view:'academicyear',      t:'Add new year',  hint:'Type next year (for example 2027-28) and press "Add year". Do not make it current yet.' },
    { n:2, view:'feestructuresetup', t:'Check fees',    hint:'Check every class has its fees for the new year. Promoted students follow the next class\'s fee structure.' },
    { n:3, view:'promotions',        t:'Promote',       hint:'Start with the highest class (10th) and work down to Baby Class, so classes never get mixed. Review each list, then promote.' },
    { n:4, view:'academicyear',      t:'Make current',  hint:'When promotion is done, choose the new year and press "Set as current". Everything then follows the new year.' }
  ];
  const get = k => { try{ return sessionStorage.getItem(k); }catch(e){ return null; } };
  const set = (k, v) => { try{ sessionStorage.setItem(k, v); }catch(e){} };
  let step = Number(get('ayStep')) || 1, open = get('ayOpen') === '1', curView = '';

  function css(){
    if($('ayCss')) return;
    const s = document.createElement('style'); s.id = 'ayCss';
    s.textContent = `
    .ayg{margin:0 0 16px;border:1.5px solid var(--border,#e3e0f0);border-radius:16px;background:#fff;padding:12px 16px}
    .ayg-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .ayg-bar b{color:var(--navy,#1a1a4b)}.ayg-bar span{font-size:.82rem;color:var(--ink-soft,#5b5a73)}
    .ayg-link{background:none;border:0;color:var(--magenta,#c2185b);font:inherit;font-weight:700;cursor:pointer;padding:0}
    .ayg-steps{display:flex;gap:6px;margin-top:10px}
    .ayg-st{flex:1;min-width:0;text-align:center;border:0;background:none;font:inherit;cursor:pointer;padding:8px 2px 0;border-top:4px solid #e3e0f0;color:var(--ink-soft,#5b5a73);font-size:.78rem;font-weight:700}
    .ayg-st i{font-style:normal;display:block;font-size:.68rem;font-weight:600;opacity:.8}
    .ayg-st.done{border-top-color:#1b7f4b;color:#1b7f4b}.ayg-st.on{border-top-color:var(--magenta,#c2185b);color:var(--magenta,#c2185b)}
    .ayg-line{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px}
    .ayg-hint{font-size:.86rem;color:var(--ink-soft,#5b5a73);flex:1;min-width:200px}
    .ayg-btns{display:flex;gap:8px}
    .ayg-b{border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:999px;padding:8px 16px;font:inherit;font-weight:700;font-size:.84rem;cursor:pointer}
    .ayg-b.p{background:var(--magenta,#c2185b);border-color:var(--magenta,#c2185b);color:#fff}
    `;
    document.head.appendChild(s);
  }

  function go(n){
    step = Math.min(4, Math.max(1, n)); set('ayStep', String(step));
    const s = STEPS[step - 1];
    if(s.view === curView) draw(); else { try{ switchView(s.view); }catch(e){} }
  }

  function draw(){
    const old = $('ayBox'); if(old) old.remove();
    if(!VIEWS.includes(curView)) return;
    const host = $('view-' + curView); if(!host) return;
    css();
    // keep the step in line with the screen the person opened by hand
    if(curView === 'feestructuresetup') step = 2; else if(curView === 'promotions') step = 3; else if(step === 2 || step === 3) step = 1;
    set('ayStep', String(step));
    const box = document.createElement('div'); box.id = 'ayBox'; box.className = 'ayg';
    if(!open){
      box.innerHTML = '<div class="ayg-bar"><div><b>📅 Year-end checklist</b> <span>Moving to a new academic year? Four steps, in order.</span></div><button type="button" class="ayg-link" data-a="open">Show steps</button></div>';
    }else{
      const s = STEPS[step - 1];
      box.innerHTML = '<div class="ayg-bar"><div><b>📅 Year-end checklist</b></div><button type="button" class="ayg-link" data-a="close">Hide</button></div>' +
        '<div class="ayg-steps">' + STEPS.map(x => '<button type="button" class="ayg-st' + (x.n === step ? ' on' : (x.n < step ? ' done' : '')) + '" data-go="' + x.n + '"><i>Step ' + x.n + '</i>' + x.t + '</button>').join('') + '</div>' +
        '<div class="ayg-line"><div class="ayg-hint">' + s.hint + '</div><div class="ayg-btns">' +
        (step > 1 ? '<button type="button" class="ayg-b" data-go="' + (step - 1) + '">← Back</button>' : '') +
        (step < 4 ? '<button type="button" class="ayg-b p" data-go="' + (step + 1) + '">Next: ' + STEPS[step].t + ' →</button>' : '<button type="button" class="ayg-b p" data-a="close">Done</button>') + '</div></div>';
    }
    const anchor = host.querySelector('.pn-hub') || host.querySelector('.topbar');
    if(anchor) anchor.insertAdjacentElement('afterend', box); else host.insertBefore(box, host.firstChild);
    box.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.go))));
    box.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { open = b.dataset.a === 'open'; set('ayOpen', open ? '1' : '0'); draw(); }));
  }

  function init(){
    const prev = window.switchView;
    if(typeof prev === 'function' && !prev.__ay){
      const w = function(id){ const r = prev.apply(this, arguments); curView = id; setTimeout(draw, 120); return r; };
      w.__ay = true; window.switchView = w;
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
