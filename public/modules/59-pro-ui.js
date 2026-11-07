/* Pro UI (stage 1) - look and navigation helpers only. No data, saving or permission logic is touched.
   1. Reports: a search box and category chips above the report cards.
   2. Admin Tools: each long card folds up/open (remembers what you opened).
   3. Tab rows with 9+ tabs: the rest go under a "More" menu (the open tab always stays visible).
   4. Ctrl+K (or /) jumps to the sidebar module search.
   Every piece fails safe: if something is not found it simply does nothing. */
(function(){
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let busy = false;

  function css(){
    if($('#pxCss')) return;
    const s = document.createElement('style'); s.id = 'pxCss';
    s.textContent = `
    .px-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 16px;position:sticky;top:0;z-index:5;padding:10px 0;background:linear-gradient(var(--cream,#fdf8f0) 70%,transparent)}
    .px-search{flex:1 1 260px;min-width:200px;border:1.5px solid var(--border,#e3e0f0);border-radius:12px;padding:10px 14px;font:inherit;background:#fff}
    .px-search:focus{outline:none;border-color:var(--magenta,#c2185b);box-shadow:0 0 0 3px rgba(194,24,91,.12)}
    .px-chip{border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:999px;padding:7px 14px;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;color:var(--ink,#1b1a33)}
    .px-chip.on{background:var(--navy,#211a4e);border-color:var(--navy,#211a4e);color:#fff}
    .px-count{font-size:.8rem;color:var(--ink-soft,#5b5a73);margin-left:auto}
    .px-empty{padding:30px;text-align:center;color:var(--ink-soft,#5b5a73)}
    .px-acc-head{cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none}
    .px-acc-head::after{content:'▾';margin-left:auto;font-size:.9rem;color:var(--ink-soft,#5b5a73);transition:transform .15s}
    .px-collapsed .px-acc-head::after{transform:rotate(-90deg)}
    .px-collapsed > :not(.px-keep){display:none !important}
    .px-more-wrap{position:relative;display:inline-block}
    .px-more-btn{border:1.5px dashed var(--border,#cfcbe6);background:#fff;border-radius:999px;padding:7px 14px;font:inherit;font-size:.82rem;font-weight:700;cursor:pointer;color:var(--navy,#211a4e)}
    .px-more-btn.has-active{background:var(--navy,#211a4e);color:#fff;border-style:solid}
    .px-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:50;min-width:210px;background:#fff;border:1px solid var(--border,#e3e0f0);border-radius:14px;box-shadow:0 14px 34px rgba(30,27,75,.18);padding:6px}
    .px-menu button{display:block;width:100%;text-align:left;border:0;background:none;padding:9px 12px;border-radius:9px;font:inherit;font-size:.86rem;cursor:pointer}
    .px-menu button:hover{background:#f3f0fb}
    .px-menu button.on{font-weight:700;color:var(--magenta,#c2185b)}
    `;
    document.head.appendChild(s);
  }

  /* ---- 1. Reports search + chips ---- */
  function enhanceReports(){
    const v = $('#view-reports'); if(!v || v.offsetParent === null) return;
    const cats = [];
    $$('h3', v).forEach(h => {
      if(!/Reports/.test(h.textContent)) return;
      const wrap = h.parentElement && h.parentElement.children.length === 1 ? h.parentElement : h;
      const grid = wrap.nextElementSibling;
      if(grid && grid.children.length && grid.children[0].classList.contains('profile-card')) cats.push({ h: wrap, grid, name: (h.textContent.trim().replace(/\s*Reports\b/, '').trim() || 'General').split(' — ')[0] });
    });
    if(cats.length < 2 || $('#pxRptBar', v)) return;
    const bar = document.createElement('div'); bar.className = 'px-bar'; bar.id = 'pxRptBar';
    bar.innerHTML = '<input class="px-search" id="pxRptQ" type="search" placeholder="Search reports (e.g. fee, attendance, bus, stock)…" autocomplete="off"><span id="pxRptChips" style="display:contents"></span><span class="px-count" id="pxRptCount"></span>';
    cats[0].h.parentElement.insertBefore(bar, cats[0].h);
    let cur = '';
    const apply = () => {
      const q = ($('#pxRptQ').value || '').trim().toLowerCase(); let shown = 0, total = 0;
      cats.forEach(c => {
        let n = 0;
        Array.from(c.grid.children).forEach(card => {
          total++;
          const ok = (!cur || cur === c.name) && (!q || card.textContent.toLowerCase().includes(q));
          card.style.display = ok ? '' : 'none'; if(ok){ n++; shown++; }
        });
        c.h.style.display = c.grid.style.display = n ? '' : 'none';
      });
      $('#pxRptCount').textContent = shown === total ? total + ' reports' : shown + ' of ' + total;
      let e = $('#pxRptEmpty', v); if(!shown){ if(!e){ e = document.createElement('div'); e.id = 'pxRptEmpty'; e.className = 'px-empty'; e.textContent = 'No report matches. Try another word or clear the filter.'; bar.after(e); } } else if(e) e.remove();
    };
    const drawChips = () => { $('#pxRptChips').innerHTML = ['All'].concat(Array.from(new Set(cats.map(c => c.name)))).map(n => `<button type="button" class="px-chip ${(n === 'All' && !cur) || n === cur ? 'on' : ''}" data-c="${esc(n)}">${esc(n)}</button>`).join(''); };
    drawChips(); apply();
    $('#pxRptQ').addEventListener('input', apply);
    $('#pxRptChips').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if(!b) return; cur = b.dataset.c === 'All' ? '' : b.dataset.c; drawChips(); apply(); });
  }

  /* ---- 2. Admin Tools: fold-up cards ---- */
  let openSet = new Set(); try{ openSet = new Set(JSON.parse(sessionStorage.getItem('pxAcc') || '[]')); }catch(e){}
  function enhanceAdminTools(){
    const v = $('#view-admintools2'); if(!v || v.offsetParent === null) return;
    $$('.profile-card', v).forEach(card => {
      if(card.dataset.pxAcc || card.parentElement.closest('.profile-card')) return;
      const title = card.querySelector('h2,h3,h4'); if(!title) return;
      let top = title; while(top.parentElement && top.parentElement !== card) top = top.parentElement;
      if(top.parentElement !== card || card.children.length < 2 || card.offsetHeight < 190) return;
      card.dataset.pxAcc = '1'; top.classList.add('px-keep'); title.classList.add('px-acc-head');
      const key = title.textContent.trim().slice(0, 40);
      if(!openSet.has(key)) card.classList.add('px-collapsed');
      title.addEventListener('click', ev => {
        if(ev.target.closest('button,a,input,select')) return;
        card.classList.toggle('px-collapsed');
        if(card.classList.contains('px-collapsed')) openSet.delete(key); else openSet.add(key);
        try{ sessionStorage.setItem('pxAcc', JSON.stringify(Array.from(openSet))); }catch(e){}
      });
    });
  }

  /* ---- 3. Tab rows with 9+ tabs: "More" menu ---- */
  function enhanceTabs(){
    $$('.mf-tabs').forEach(row => {
      if(row.offsetParent === null) return;
      const tabs = Array.from(row.children).filter(b => b.tagName === 'BUTTON' && !b.classList.contains('px-more-btn'));
      if(tabs.length < 9) return;
      const act = tabs.findIndex(b => b.classList.contains('active') || b.classList.contains('on') || b.getAttribute('aria-selected') === 'true');
      const KEEP = 5; const keep = new Set(tabs.slice(0, KEEP)); if(act >= 0) keep.add(tabs[act]);
      tabs.forEach(b => { if(/Receipt|Defaulter|Reports/i.test(b.textContent)) keep.add(b); });
      const rest = tabs.filter(b => !keep.has(b));
      tabs.forEach(b => { b.style.display = keep.has(b) ? '' : 'none'; });
      let wrap = row.querySelector('.px-more-wrap');
      const sig = rest.map(b => b.id + (b === tabs[act] ? '*' : '')).join(',') + '|' + act;
      if(wrap && wrap.dataset.sig === sig) return;
      if(wrap) wrap.remove();
      wrap = document.createElement('span'); wrap.className = 'px-more-wrap'; wrap.dataset.sig = sig;
      wrap.innerHTML = `<button type="button" class="px-more-btn">More ▾ (${rest.length})</button><div class="px-menu" hidden></div>`;
      row.appendChild(wrap);
      const menu = wrap.querySelector('.px-menu');
      menu.innerHTML = rest.map((b, i) => `<button type="button" data-i="${i}">${esc(b.textContent.trim())}</button>`).join('');
      wrap.querySelector('.px-more-btn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
      menu.onclick = e => { const x = e.target.closest('[data-i]'); if(!x) return; menu.hidden = true; rest[+x.dataset.i].click(); };
    });
  }
  document.addEventListener('click', e => { if(!e.target.closest('.px-more-wrap')) $$('.px-menu').forEach(m => m.hidden = true); });

  /* ---- 4. Ctrl+K / "/" -> quick jump ---- */
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if(((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey)){
      const i = document.getElementById('sbModuleSearch'); if(!i || i.offsetParent === null) return;
      e.preventDefault(); try{ document.body.classList.remove('sb-collapsed'); }catch(_){} i.focus(); i.select();
    }
  });

  function pass(){
    if(busy) return; busy = true;
    try{ css(); enhanceReports(); enhanceAdminTools(); enhanceTabs(); }catch(e){ console.warn('pro-ui', e); }
    busy = false;
  }
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(pass, 150); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  setTimeout(pass, 800);
})();
