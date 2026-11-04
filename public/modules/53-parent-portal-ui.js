/* =========================================================================
   Student / Parent portal — same friendly look as the Teacher portal.
   Look only: greeting banner, big task tiles (English / Telugu), softer cards, a bottom bar on phones.
   It adds nothing to what a parent or student can see or do: tiles open the same tabs, honour the same
   Admin Tools > Parent portal on/off switches, and the original cards stay below the tiles.
   ========================================================================= */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isParent = () => { try { return !!currentUser && (currentUser.role === 'Student' || currentUser.role === 'Parent'); } catch(e){ return false; } };
  const lang = () => { try{ if(typeof window.portalLang === 'function') return window.portalLang(); }catch(e){} let l = ''; try{ l = localStorage.getItem('portalLang') || ''; }catch(e){} return l === 'te' ? 'te' : 'en'; };
  const pick = (en, te) => lang() === 'te' ? te : en;

  // [tab id, icon, colour, English, Telugu, hint (en), hint (te)]
  const TILES = [
    ['fees',          '💳', '#e53935', 'Fees',               'ఫీజులు',          'View and pay',            'చెల్లింపులు చూడండి'],
    ['marks',         '📝', '#2f6fed', 'Marks',              'మార్కులు',        'Results and report cards', 'ఫలితాలు & రిపోర్టులు'],
    ['syllabushw',    '📔', '#e8710a', 'Homework',           'హోంవర్క్',        'Homework and syllabus',   'హోంవర్క్ & సిలబస్'],
    ['classinfo',     '🗓️', '#455a64', 'Timetable & Exams',   'టైమ్‌టేబుల్ & పరీక్షలు', 'Exam dates and classes',    'తరగతులు & టీచర్లు'],
    ['onlineexam',    '⏱️', '#00838f', 'Online Exams',       'ఆన్‌లైన్ పరీక్షలు', 'Take your tests',         'పరీక్షలు రాయండి'],
    ['material',      '📚', '#7b3fe4', 'Study Material',     'స్టడీ మెటీరియల్', 'Notes and videos',         'నోట్స్ & వీడియోలు'],
    ['contact',       '💬', '#3949ab', 'Messages',           'సందేశాలు',        'Talk to a teacher',       'టీచర్‌తో మాట్లాడండి'],
    ['notices',       '📌', '#d84315', 'Notices',            'ప్రకటనలు',        'School announcements',    'పాఠశాల ప్రకటనలు'],
    ['notifications', '🔔', '#f9a825', 'Updates',            'అప్‌డేట్స్',       'Attendance and alerts',   'హాజరు & అలర్ట్‌లు'],
    ['profile',       '👤', '#6d4c41', 'Profile',            'ప్రొఫైల్',         'Details and documents',   'వివరాలు & పత్రాలు'],
  ];
  let tabsCfg = {}, cfgAt = 0;
  async function loadCfg(){
    if(Date.now() - cfgAt < 30000) return;
    try{ const r = await fetch('/api/kv/portal-settings', { credentials: 'include' }); if(r.ok){ const v = await r.json(); tabsCfg = (v && typeof v.tabs === 'object' && v.tabs) || {}; } }catch(e){}
    cfgAt = Date.now();
  }
  const tabOn = id => tabsCfg[id] !== false;
  window.ppGo = id => { try{ switchMyProfileTab(id); }catch(e){ console.error(e); } };
  window.ppLang = () => { try{ if(typeof portalToggleLang === 'function') portalToggleLang(); }catch(e){} };

  function css(){
    if($('ppCss')) return;
    const s = document.createElement('style'); s.id = 'ppCss';
    s.textContent = `
      .pp-hero{position:relative;overflow:hidden;border-radius:22px;padding:22px 24px;margin-bottom:18px;color:#fff;
        background:linear-gradient(120deg,#0f766e 0%,#2f6fed 55%,#7b3fe4 100%);box-shadow:0 10px 30px rgba(47,111,237,.25);}
      .pp-hero:after{content:"";position:absolute;right:-60px;top:-60px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.10);}
      .pp-hero:before{content:"";position:absolute;right:70px;bottom:-80px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.08);}
      .pp-hero h2{margin:0 0 4px;font-size:1.6rem;color:#fff;position:relative;z-index:1;}
      .pp-hero .pp-sub{opacity:.92;font-size:.95rem;position:relative;z-index:1;}
      .pp-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;position:relative;z-index:1;}
      .pp-chip{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);color:#fff;border-radius:999px;padding:5px 12px;font-size:.8rem;font-weight:600;font-family:inherit;}
      button.pp-chip{cursor:pointer;} button.pp-chip:hover{background:rgba(255,255,255,.3);}
      .pp-sec{margin:0 0 18px;} .pp-sec>h3{margin:0 0 10px;font-size:1.05rem;color:#14325c;}
      .pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}
      .pp-tile{text-align:left;background:#fff;border:1px solid #e6ebf5;border-radius:18px;padding:14px;cursor:pointer;min-height:108px;display:flex;flex-direction:column;gap:4px;
        transition:transform .15s ease,box-shadow .15s ease;box-shadow:0 2px 8px rgba(20,50,92,.05);font-family:inherit;}
      .pp-tile:hover{transform:translateY(-3px);box-shadow:0 10px 22px rgba(20,50,92,.12);} .pp-tile:active{transform:scale(.98);}
      .pp-ic{width:42px;height:42px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:1.35rem;color:#fff;margin-bottom:4px;}
      .pp-tile b{font-size:.95rem;color:#14325c;line-height:1.2;} .pp-tile span.pp-h{font-size:.75rem;color:#667;line-height:1.25;}
      .sh-wrap .sh-top,.sh-wrap .sh-quick{display:none;}
      .sh-wrap .sh-card{border-radius:18px;box-shadow:0 2px 8px rgba(20,50,92,.05);}
      .pp-more>h3{margin:6px 0 10px;font-size:1.05rem;color:#14325c;}
      #ppDock{display:none;}
      @media (max-width:760px){
        .pp-grid{grid-template-columns:repeat(2,1fr);gap:10px;} .pp-tile{min-height:100px;padding:12px;}
        .pp-hero{padding:18px 16px;border-radius:18px;} .pp-hero h2{font-size:1.3rem;}
        #view-myprofile .mf-tabs{display:none;}
        body.pp-on{padding-bottom:74px;}
        #ppDock{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:900;background:#fff;border-top:1px solid #e3e8f3;box-shadow:0 -6px 20px rgba(20,50,92,.10);padding:6px 6px calc(6px + env(safe-area-inset-bottom));justify-content:space-around;}
        #ppDock button{flex:1;background:none;border:0;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.68rem;color:#52607a;padding:5px 2px;border-radius:12px;font-family:inherit;}
        #ppDock button .d{font-size:1.25rem;line-height:1;} #ppDock button.on{color:#2f6fed;font-weight:700;background:#eef3ff;}
      }
    `;
    document.head.appendChild(s);
  }

  /* ---------- home: banner + tiles above the original cards ---------- */
  let painting = false;
  async function paint(force){
    if(!isParent() || painting) return;
    const wrap = document.querySelector('#myProfileBody .sh-wrap'); if(!wrap) return;
    if(!force && $('ppHero')) return;
    painting = true;
    try{
      await loadCfg(); css(); document.body.classList.add('pp-on');
      Array.from(wrap.children).forEach(c => { if(c.id === 'ppHero' || c.id === 'ppTiles') c.remove(); });
      // reuse what the original header already worked out (name, class, teacher) — nothing is recomputed here
      const h2 = wrap.querySelector('.sh-top h2'), p = wrap.querySelector('.sh-top p');
      const name = h2 ? h2.textContent.trim() : pick('Hello', 'నమస్కారం');
      const sub = p ? p.textContent.trim() : '';
      const parts = sub.split(' · ');
      const chips = [];
      if(parts[0]) chips.push(`<span class="pp-chip">🎓 ${esc(parts[0])}</span>`);
      if(parts[1]) chips.push(`<span class="pp-chip">${esc(parts[1])}</span>`);
      if(parts[2]) chips.push(`<span class="pp-chip">👩‍🏫 ${esc(parts[2])}</span>`);
      chips.push(`<button type="button" class="pp-chip" onclick="ppLang()">🌐 ${lang() === 'te' ? 'English' : 'తెలుగు'}</button>`);
      const hero = `<div class="pp-hero" id="ppHero"><h2>${esc(name)} 👋</h2><div class="pp-sub">${esc(new Date().toLocaleDateString(lang() === 'te' ? 'te-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="pp-chips">${chips.join('')}</div></div>`;
      const tiles = TILES.filter(t => tabOn(t[0]) && $('mptab-' + t[0])).map(t => `<button type="button" class="pp-tile" onclick="ppGo('${t[0]}')"><div class="pp-ic" style="background:${t[2]};">${t[1]}</div><b>${esc(pick(t[3], t[4]))}</b><span class="pp-h">${esc(pick(t[5], t[6]))}</span></button>`).join('');
      wrap.insertAdjacentHTML('afterbegin', hero + `<div class="pp-sec" id="ppTiles"><h3>${esc(pick('What would you like to see?', 'మీరు ఏమి చూడాలనుకుంటున్నారు?'))}</h3><div class="pp-grid">${tiles}</div></div>`);
      const g = wrap.querySelector('.sh-grid');
      if(g && !wrap.querySelector('.pp-more')) g.insertAdjacentHTML('beforebegin', `<div class="pp-more"><h3>${esc(pick('Today at a glance', 'ఈరోజు ముఖ్యాంశాలు'))}</h3></div>`);
    }finally{ painting = false; }
  }

  /* ---------- phone bottom bar ---------- */
  const DOCK = [['home', '🏠', 'Home', 'హోమ్'], ['fees', '💳', 'Fees', 'ఫీజులు'], ['marks', '📝', 'Marks', 'మార్కులు'], ['syllabushw', '📔', 'Homework', 'హోంవర్క్'], ['contact', '💬', 'Messages', 'సందేశాలు']];
  function dock(){
    if(!isParent()){ const d = $('ppDock'); if(d) d.remove(); document.body.classList.remove('pp-on'); return; }
    css(); document.body.classList.add('pp-on');
    let d = $('ppDock');
    if(!d){ d = document.createElement('div'); d.id = 'ppDock'; document.body.appendChild(d); }
    const items = DOCK.filter(i => i[0] === 'home' || tabOn(i[0]));
    const cur = (typeof myProfileTab !== 'undefined') ? myProfileTab : 'home';
    const sig = items.map(i => i[0]).join() + lang() + cur;
    if(d.dataset.sig === sig) return;
    d.dataset.sig = sig;
    d.innerHTML = items.map(i => `<button type="button" class="${i[0] === cur ? 'on' : ''}" onclick="ppGo('${i[0]}')"><span class="d">${i[1]}</span><span class="l">${esc(pick(i[2], i[3]))}</span></button>`).join('');
  }

  /* ---------- hooks ---------- */
  let obs = null;
  function watch(){
    const body = $('myProfileBody'); if(!body || obs) return;
    obs = new MutationObserver(() => { if(!painting && body.querySelector('.sh-wrap') && !$('ppHero')) paint(false); });
    obs.observe(body, { childList: true });
  }
  if(typeof window.switchMyProfileTab === 'function'){
    const o = window.switchMyProfileTab;
    window.switchMyProfileTab = function(tab){
      const r = o.apply(this, arguments);
      if(isParent()){ try{ setTimeout(dock, 50); watch(); }catch(e){} }
      return r;
    };
  }
  if(typeof window.portalToggleLang === 'function'){
    const o = window.portalToggleLang;
    window.portalToggleLang = function(){ const r = o.apply(this, arguments); setTimeout(() => { const d = $('ppDock'); if(d) delete d.dataset.sig; dock(); paint(true); }, 400); return r; };
  }
  setInterval(() => { if(isParent()){ loadCfg(); dock(); watch(); } else if($('ppDock')) dock(); }, 2000);
})();
