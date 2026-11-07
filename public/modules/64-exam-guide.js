/* Manage Exams - "Run an exam" guide strip. A numbered journey above the existing tabs:
   1 Set up > 2 Enter marks > 3 Check entry > 4 Release > 5 Results. It follows whichever tab is open, says in one line what
   that step is for, and "Next" just opens the next tab (switchExamTab), so no exam logic changes. Tabs a role cannot see are
   skipped; Admit Cards, Room Allotment and Holidays stay available as "before the exam" shortcuts. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const STEPS = [
    { tab:'exams',       t:'Set up',        hint:'Create the exam, then press "Configure Subjects" on it for each class. Use "Copy subjects" to save time.' },
    { tab:'marks',       t:'Enter marks',   hint:'Pick the exam, class and subject, then type each student\'s marks. Teachers can do this for their own subjects.' },
    { tab:'entrystatus', t:'Check entry',   hint:'See which classes or students still have no marks, before you release anything.' },
    { tab:'release',     t:'Release',       hint:'Release marks when they are checked, so parents and students can see them.' },
    { tab:'results',     t:'Results',       hint:'See pass and fail, toppers and class results for the released exam.' }
  ];
  const EXTRAS = [['admitcards','Admit Cards'],['roomallotment','Room Allotment'],['holidays','Holidays']];

  function css(){
    if($('egCss')) return;
    const s = document.createElement('style'); s.id = 'egCss';
    s.textContent = `
    .eg{margin:2px 0 16px;border:1.5px solid var(--border,#e3e0f0);border-radius:16px;background:#fff;padding:14px 16px}
    .eg-steps{display:flex;gap:6px}
    .eg-st{flex:1;min-width:0;text-align:center;border:0;background:none;font:inherit;cursor:pointer;padding:8px 2px 0;border-top:4px solid #e3e0f0;color:var(--ink-soft,#5b5a73);font-size:.78rem;font-weight:700}
    .eg-st i{font-style:normal;display:block;font-size:.68rem;font-weight:600;opacity:.8}
    .eg-st.done{border-top-color:#1b7f4b;color:#1b7f4b}
    .eg-st.on{border-top-color:var(--magenta,#c2185b);color:var(--magenta,#c2185b)}
    .eg-line{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px}
    .eg-hint{font-size:.86rem;color:var(--ink-soft,#5b5a73);flex:1;min-width:200px}
    .eg-next{border:0;background:var(--magenta,#c2185b);color:#fff;border-radius:999px;padding:9px 18px;font:inherit;font-weight:700;font-size:.86rem;cursor:pointer}
    .eg-x{margin-top:8px;font-size:.8rem;color:var(--ink-soft,#5b5a73)}
    .eg-x button{background:none;border:0;color:var(--magenta,#c2185b);font:inherit;font-weight:700;cursor:pointer;padding:0 6px}
    `;
    document.head.appendChild(s);
  }

  const tabBtn = k => $('extab-' + k);
  const avail = k => { const b = tabBtn(k); return !!b && b.style.display !== 'none'; };
  const current = () => { const a = document.querySelector('#view-exams .mf-tabs .mf-tab.active'); return a ? a.id.replace('extab-','') : ''; };
  const open = k => { try{ switchExamTab(k); }catch(e){ const b = tabBtn(k); if(b) b.click(); } };

  function draw(){
    const host = document.querySelector('#view-exams .mf-tabs'); if(!host) return;
    css();
    let box = $('egBox');
    if(!box){ box = document.createElement('div'); box.id = 'egBox'; box.className = 'eg'; host.parentNode.insertBefore(box, host); }
    const steps = STEPS.filter(s => avail(s.tab)); if(!steps.length){ box.style.display = 'none'; return; }
    box.style.display = '';
    const cur = current(); const idx = steps.findIndex(s => s.tab === cur);
    let html = '<div class="eg-steps">' + steps.map((s, i) => '<button type="button" class="eg-st' + (i === idx ? ' on' : (idx > -1 && i < idx ? ' done' : '')) + '" data-eg="' + s.tab + '"><i>Step ' + (i + 1) + '</i>' + s.t + '</button>').join('') + '</div>';
    if(idx > -1){
      const nx = steps[idx + 1];
      html += '<div class="eg-line"><div class="eg-hint">' + steps[idx].hint + '</div>' + (nx ? '<button type="button" class="eg-next" data-eg="' + nx.tab + '">Next: ' + nx.t + ' →</button>' : '') + '</div>';
      if(idx === 0){
        const ex = EXTRAS.filter(e => avail(e[0]));
        if(ex.length) html += '<div class="eg-x">Before the exam: ' + ex.map(e => '<button type="button" data-eg="' + e[0] + '">' + e[1] + '</button>').join('·') + '</div>';
      }
    } else {
      html += '<div class="eg-line"><div class="eg-hint">This is an extra tool. The exam steps above are still one tap away.</div><button type="button" class="eg-next" data-eg="exams">Back to Step 1</button></div>';
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-eg]').forEach(b => b.addEventListener('click', () => open(b.dataset.eg)));
  }

  function init(){
    draw();
    const tabs = document.querySelector('#view-exams .mf-tabs');
    if(tabs) new MutationObserver(() => setTimeout(draw, 0)).observe(tabs, { attributes:true, attributeFilter:['class','style'], subtree:true });
    const prev = window.switchView;
    if(typeof prev === 'function' && !prev.__eg){
      const w = function(id){ const r = prev.apply(this, arguments); if(id === 'exams') setTimeout(draw, 80); return r; };
      w.__eg = true; window.switchView = w;
    }
    [1500, 4000].forEach(ms => setTimeout(draw, ms));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
