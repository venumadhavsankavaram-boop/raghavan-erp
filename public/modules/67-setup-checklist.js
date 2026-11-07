/* Dashboard - "Set up your school" checklist, for a newly launched school. Seven plain steps (School profile, Classes, Academic
   year, Fees, Staff, Students, Parent logins). Each tick is worked out from the school's own data, so it can never be wrong;
   "Classes" cannot be detected (classes come pre-filled), so it has an "I checked" button (and counts as done once students exist). The card shows for the Admin only,
   disappears by itself when every step is done (so a school that is already running never sees it), and can be hidden
   with "Hide" (remembered on that computer). It only opens existing screens and changes no data. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const ls = { get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }, set(k, v){ try{ localStorage.setItem(k, v); }catch(e){} } };
  const arr = f => { try{ const v = f(); return Array.isArray(v) ? v : []; }catch(e){ return []; } };
  const STEPS = [
    { k:'profile', icon:'🏫', t:'School profile', s:'Name, logo, phone and address', view:'schoolprofile',
      done(){ try{ return !!(schoolInfo && schoolInfo.name && schoolInfo.name !== 'Your School Name' && (schoolInfo.phone || schoolInfo.address || schoolInfo.email)); }catch(e){ return false; } } },
    { k:'classes', icon:'📚', t:'Classes and sections', s:'Check the classes your school has', view:'classessetup', manual:true,
      done(){ return ls.get('sgClasses') === '1' || arr(() => students).length > 0; } },
    { k:'year', icon:'🗓️', t:'Academic year', s:'Add this year and make it current', view:'academicyear',
      done(){ return arr(() => academicYears).length > 0; } },
    { k:'fees', icon:'💰', t:'Fee structure', s:'Fees for every class', view:'feestructuresetup',
      done(){ try{ return Object.values(classFeeStructure || {}).some(v => v && Number(v.fee) > 0); }catch(e){ return false; } } },
    { k:'staff', icon:'👩‍🏫', t:'Add staff', s:'Teachers and office staff', view:'staffdirectory',
      done(){ return arr(() => staffList).length > 0; } },
    { k:'students', icon:'🎓', t:'Add students', s:'One by one, or Bulk Import from Excel', view:'admissions',
      done(){ return arr(() => students).length > 0; } },
    { k:'parents', icon:'📱', t:'Parent logins', s:'Create logins so parents can use the app', view:'studentparentlogins',
      done(){ return arr(() => users).some(u => /parent|student/i.test(String(u && u.role))); } }
  ];

  function css(){
    if($('sgCss')) return;
    const s = document.createElement('style'); s.id = 'sgCss';
    s.textContent = `
    .sg{margin:6px 0 24px;border:1.5px solid #e7d9f3;border-radius:18px;background:linear-gradient(135deg,#fbf6ff,#fff8f1);padding:16px 18px}
    .sg-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
    .sg-top h3{margin:0;font-size:1.05rem;color:var(--navy,#1a1a4b)}
    .sg-top p{margin:2px 0 0;font-size:.82rem;color:var(--ink-soft,#5b5a73)}
    .sg-hide{border:0;background:none;color:var(--ink-soft,#5b5a73);font:inherit;font-size:.8rem;cursor:pointer;text-decoration:underline}
    .sg-bar{height:8px;border-radius:99px;background:#eadff5;margin:12px 0 14px;overflow:hidden}
    .sg-bar i{display:block;height:100%;background:linear-gradient(90deg,#c2185b,#e59a2f);border-radius:99px;transition:width .3s}
    .sg-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
    .sg-it{display:flex;gap:10px;align-items:center;text-align:left;border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:14px;padding:11px 13px;font:inherit;cursor:pointer}
    .sg-it:hover{border-color:var(--magenta,#c2185b)}
    .sg-it.done{background:#f3faf5;border-color:#bfe3c9}
    .sg-it.next{border-color:var(--magenta,#c2185b);box-shadow:0 0 0 3px rgba(194,24,91,.10)}
    .sg-ck{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#f4eefa;font-size:1rem}
    .sg-it.done .sg-ck{background:#1f9d55;color:#fff;font-weight:700}
    .sg-it b{display:block;color:var(--navy,#1a1a4b);font-size:.9rem}
    .sg-it small{display:block;color:var(--ink-soft,#5b5a73);font-size:.74rem;margin-top:1px}
    .sg-chk{margin-top:4px;border:0;background:none;color:var(--magenta,#c2185b);font:inherit;font-size:.74rem;cursor:pointer;padding:0;text-decoration:underline}
    `;
    document.head.appendChild(s);
  }

  function isAdmin(){ try{ return currentUser && currentUser.role === 'Admin'; }catch(e){ return false; } }

  function render(){
    const host = $('view-dashboard'); if(!host) return;
    let box = $('sgBox');
    const off = () => { if(box) box.remove(); };
    if(!isAdmin() || ls.get('sgHide') === '1') return off();
    const res = STEPS.map(st => ({ st, ok: !!st.done() }));
    const n = res.filter(r => r.ok).length;
    if(n === STEPS.length) return off();
    css();
    if(!box){
      box = document.createElement('div'); box.id = 'sgBox'; box.className = 'sg';
      const anchor = $('hsBox') || $('dashBanner') || $('dashInsights'); const wrap = host.querySelector('.strength-hero-wrap');
      if(anchor) anchor.parentNode.insertBefore(box, anchor);
      else if(wrap) wrap.insertAdjacentElement('afterend', box);
      else return;
    }
    const next = res.find(r => !r.ok);
    box.innerHTML = '<div class="sg-top"><div><h3>Set up your school</h3><p>' + n + ' of ' + STEPS.length + ' done. Go in order; each step ticks by itself when it is finished.</p></div>' +
      '<button type="button" class="sg-hide" data-sg-hide="1">Hide</button></div>' +
      '<div class="sg-bar"><i style="width:' + Math.round(n / STEPS.length * 100) + '%"></i></div>' +
      '<div class="sg-list">' + res.map(r => '<button type="button" class="sg-it' + (r.ok ? ' done' : '') + (r === next ? ' next' : '') + '" data-sg="' + r.st.k + '">' +
        '<span class="sg-ck">' + (r.ok ? '✓' : r.st.icon) + '</span><span><b>' + r.st.t + '</b><small>' + r.st.s + '</small>' +
        (r.st.manual && !r.ok ? '<span class="sg-chk" data-sg-chk="' + r.st.k + '">I checked this</span>' : '') + '</span></button>').join('') + '</div>';
    box.querySelectorAll('[data-sg]').forEach(b => b.addEventListener('click', e => {
      if(e.target && e.target.getAttribute('data-sg-chk')){ ls.set('sgClasses', '1'); render(); return; }
      const st = STEPS.find(x => x.k === b.dataset.sg); if(st) switchView(st.view);
    }));
    const h = box.querySelector('[data-sg-hide]');
    if(h) h.addEventListener('click', () => { ls.set('sgHide', '1'); render(); });
  }

  function init(){
    render();
    const prev = window.switchView;
    if(typeof prev === 'function' && !prev.__sg){
      const w = function(id){ const r = prev.apply(this, arguments); if(id === 'dashboard') setTimeout(render, 90); return r; };
      w.__sg = true; Object.keys(prev).forEach(k => { try{ w[k] = prev[k]; }catch(e){} }); window.switchView = w;
    }
    [1800, 4500, 9500].forEach(ms => setTimeout(render, ms));
    const host = $('view-dashboard');
    if(host){
      let t = null;
      new MutationObserver(() => { if($('sgBox') || ls.get('sgHide') === '1') return; clearTimeout(t); t = setTimeout(() => { if(!$('sgBox')) render(); }, 120); }).observe(host, { childList:true, subtree:true });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
