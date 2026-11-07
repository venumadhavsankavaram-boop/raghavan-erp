/* Dashboard - "Start something" row. Four big buttons for the jobs done most days (collect a fee, add a student,
   take attendance, send a notice) plus today's collection. They only open the existing screens/wizards; a button is
   hidden when the signed-in role has no access to that screen. Nothing on the dashboard is removed. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const ACTS = [
    { k:'fee',  nav:'navManageFee',     icon:'💰', t:'Collect fee',     s:'Find a student, then press Pay', go(){ switchView('managefee'); } },
    { k:'adm',  nav:'navAdmissions',    icon:'🎓', t:'Add student',     s:'New admission in 4 short steps', go(){ switchView('admissions'); setTimeout(() => { try{ openWizard(); }catch(e){} }, 250); } },
    { k:'att',  nav:'navAttendance',    icon:'🗓️', t:'Take attendance', s:'Mark today for a class',         go(){ switchView('attendance'); } },
    { k:'note', nav:'navAnnouncements', icon:'📣', t:'Send a notice',   s:'Message parents and staff',      go(){ switchView('announcements'); } }
  ];

  function css(){
    if($('hsCss')) return;
    const s = document.createElement('style'); s.id = 'hsCss';
    s.textContent = `
    .hs{margin:6px 0 26px}
    .hs-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px}
    .hs-top h3{margin:0;font-size:1.05rem;color:var(--navy,#1a1a4b)}
    .hs-today{font-size:.86rem;color:var(--ink-soft,#5b5a73)}
    .hs-today b{color:#14633a;font-size:1rem}
    .hs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
    .hs-btn{display:flex;align-items:center;gap:12px;text-align:left;border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:16px;padding:14px 16px;font:inherit;cursor:pointer;transition:transform .12s,box-shadow .12s,border-color .12s}
    .hs-btn:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(30,20,80,.10);border-color:var(--magenta,#c2185b)}
    .hs-ic{font-size:1.5rem;width:44px;height:44px;border-radius:12px;background:#f6f1fb;display:grid;place-items:center;flex:none}
    .hs-btn b{display:block;color:var(--navy,#1a1a4b);font-size:.95rem}
    .hs-btn small{display:block;color:var(--ink-soft,#5b5a73);font-size:.76rem;margin-top:2px}
    `;
    document.head.appendChild(s);
  }

  function shown(id){ const e = $(id); return !!e && e.style.display !== 'none'; }

  function todayTotal(){
    try{
      const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      let n = 0, c = 0;
      (window.payments || payments || []).forEach(p => { if(p && String(p.date).slice(0,10) === iso && !p.voided){ n += Number(p.amount) || 0; c++; } });
      return { n, c };
    }catch(e){ return null; }
  }

  function render(){
    const host = $('view-dashboard'); if(!host) return;
    css();
    const acts = ACTS.filter(a => shown(a.nav));
    let box = $('hsBox');
    if(!acts.length){ if(box) box.remove(); return; }
    if(!box){
      box = document.createElement('div'); box.id = 'hsBox'; box.className = 'hs';
      const anchor = $('dashInsights'); const wrap = host.querySelector('.strength-hero-wrap');
      if(anchor) anchor.parentNode.insertBefore(box, $('dashBanner') || anchor);
      else if(wrap) wrap.insertAdjacentElement('afterend', box);
      else return;
    }
    const t = shown('navManageFee') ? todayTotal() : null;
    const money = v => { try{ return fmtMoney(v); }catch(e){ return '₹' + Number(v).toLocaleString('en-IN'); } };
    box.innerHTML = '<div class="hs-top"><h3>Start something</h3>' + (t ? '<div class="hs-today">Collected today: <b>' + money(t.n) + '</b>' + (t.c ? ' · ' + t.c + ' receipt' + (t.c > 1 ? 's' : '') : '') + '</div>' : '') + '</div>' +
      '<div class="hs-grid">' + acts.map(a => '<button type="button" class="hs-btn" data-hs="' + a.k + '"><span class="hs-ic">' + a.icon + '</span><span><b>' + a.t + '</b><small>' + a.s + '</small></span></button>').join('') + '</div>';
    box.querySelectorAll('[data-hs]').forEach(b => b.addEventListener('click', () => { const a = ACTS.find(x => x.k === b.dataset.hs); if(a) a.go(); }));
  }

  function init(){
    render();
    // Re-draw when the dashboard is shown again (numbers and role buttons may have changed).
    const prev = window.switchView;
    if(typeof prev === 'function' && !prev.__hs){
      const w = function(id){ const r = prev.apply(this, arguments); if(id === 'dashboard') setTimeout(render, 60); return r; };
      w.__hs = true; window.switchView = w;
    }
    [1500, 4000, 9000].forEach(ms => setTimeout(render, ms));
    const host = $('view-dashboard');
    if(host){
      let t = null;
      new MutationObserver(() => { if($('hsBox')) return; clearTimeout(t); t = setTimeout(() => { if(!$('hsBox')) render(); }, 80); }).observe(host, { childList:true, subtree:true });
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
