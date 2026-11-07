/* Pro navigation (stage 2) - fewer sidebar entries, a cleaner sidebar look. Presentation only:
   every screen, permission and saved setting stays exactly as it was; the old menu buttons are only tucked away.
   Hubs: several related screens share ONE sidebar entry and a tab bar across the top of each screen.
   Fails safe: any screen the role cannot open simply does not appear in the tab bar. */
(function(){
  'use strict';
  const HUBS = [
    { id: 'access', label: 'Users & Access', members: [['usersroles', 'Users & Roles'], ['studentparentlogins', 'Student/Parent Logins'], ['rolespermissions', 'Roles & Permissions']] },
    { id: 'setup', label: 'School Setup', members: [['schoolprofile', 'School Profile'], ['classessetup', 'Classes'], ['academicyear', 'Academic Year'], ['feestructuresetup', 'Fee Structure'], ['promotions', 'Promotions'], ['refundpolicy', 'Refund Policy']] },
    { id: 'comms', label: 'Messages & Notices', members: [['announcements', 'Announcements'], ['noticeboard', 'Notice Board'], ['inbox', 'Inbox']] }
  ];
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const navOf = view => $(`.sb-link[onclick*="switchView('${view}')"]`);
  const canSee = view => { const n = navOf(view); return !!n && n.style.display !== 'none' && !n.hidden; };
  let curView = '';

  function css(){
    if($('#pnCss')) return;
    const s = document.createElement('style'); s.id = 'pnCss';
    s.textContent = `
    .px-navhide{display:none !important}
    .pn-hub{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 18px;padding:5px;background:rgba(33,26,78,.05);border-radius:14px;width:fit-content;max-width:100%}
    .pn-hub button{border:0;background:transparent;border-radius:10px;padding:9px 16px;font:inherit;font-size:.86rem;font-weight:600;color:var(--ink-soft,#5b5a73);cursor:pointer;transition:background .15s,color .15s}
    .pn-hub button:hover{background:rgba(33,26,78,.08);color:var(--navy,#211a4e)}
    .pn-hub button.on{background:var(--navy,#211a4e);color:#fff;box-shadow:0 4px 12px -4px rgba(33,26,78,.5)}
    /* ---- sidebar polish: calmer headings, softer active state, tighter rhythm ---- */
    .sidebar .sb-section-toggle{margin:10px 2px 4px;padding:7px 9px;font-family:'Poppins',sans-serif;font-size:.7rem;font-weight:600;letter-spacing:.09em;color:rgba(255,255,255,.5)}
    .sidebar .sb-section-toggle:hover{color:#fff}
    .sidebar .sb-section-icon{width:16px;height:16px}
    .sidebar .sb-section-count{background:transparent;color:rgba(255,255,255,.45);font-weight:600;padding:0 2px}
    .sidebar .sb-section-group{border-bottom:0;padding-bottom:4px}
    .sidebar .sb-link{padding:8px 10px;margin-bottom:2px;font-size:.9rem;border-radius:12px}
    .sidebar .sb-icon-wrap{width:30px;height:30px;border-radius:9px;background:rgba(255,255,255,.06)}
    .sidebar .sb-link.active{background:linear-gradient(90deg,rgba(var(--accent-rgb,232,200,116),.28),rgba(var(--accent-rgb,232,200,116),.08));color:#fff;font-weight:600;box-shadow:inset 0 0 0 1px rgba(var(--accent-rgb,232,200,116),.35);transform:none}
    .sidebar .sb-link.active::before{display:block;transform:translateY(-50%) scaleY(1);height:58%;width:3.5px}
    .sidebar .sb-link.active .sb-icon-wrap{background:var(--accent,#e8c874);color:#211a4e;box-shadow:0 4px 12px -3px rgba(var(--accent-rgb,232,200,116),.6)}
    .sidebar .sb-link:not(.active):not(.disabled):hover{transform:none;background:rgba(255,255,255,.07)}
    `;
    document.head.appendChild(s);
  }

  function setLabel(nav, text, aliases){
    const nodes = Array.from(nav.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim());
    if(nodes[0]) nodes[0].textContent = ' ' + text; else nav.appendChild(document.createTextNode(' ' + text));
    let a = nav.querySelector('.pn-alias'); if(!a){ a = document.createElement('span'); a.className = 'pn-alias'; a.style.display = 'none'; nav.appendChild(a); }
    a.textContent = ' ' + aliases;
  }

  function applyHubsToSidebar(){
    HUBS.forEach(h => {
      const vis = h.members.filter(m => canSee(m[0]));
      if(!vis.length) return;
      const rep = navOf(vis[0][0]);
      h.members.forEach(m => { const n = navOf(m[0]); if(n && n !== rep) n.classList.add('px-navhide'); });
      if(rep.classList.contains('px-navhide')) rep.classList.remove('px-navhide');
      if(vis.length > 1){ setLabel(rep, h.label, vis.map(m => m[1]).join(' ')); rep.dataset.pnHub = h.id; }
      else rep.dataset.pnHub = '';
    });
    // section counts follow what is really shown
    $$('[id^=sbGroup-]').forEach(g => {
      const key = g.id.replace('sbGroup-', ''), c = document.getElementById('sbCount-' + key); if(!c) return;
      c.textContent = $$('.sb-link', g).filter(l => l.style.display !== 'none' && !l.classList.contains('px-navhide')).length;
    });
  }

  function syncView(view){
    curView = view || curView;
    HUBS.forEach(h => {
      const inHub = h.members.some(m => m[0] === curView);
      const vis = h.members.filter(m => canSee(m[0]));
      const rep = vis.length ? navOf(vis[0][0]) : null;
      if(rep && vis.length > 1) rep.classList.toggle('active', inHub);
      // tab bar on the open screen
      h.members.forEach(m => { const old = $('#pnHub-' + h.id + '-' + m[0]); if(old && (m[0] !== curView || vis.length < 2)) old.remove(); });
      if(!inHub || vis.length < 2) return;
      const v = document.getElementById('view-' + curView); if(!v) return;
      let bar = $('#pnHub-' + h.id + '-' + curView);
      const sig = vis.map(m => m[0]).join(',');
      if(bar && bar.dataset.sig === sig) { $$('button', bar).forEach(b => b.classList.toggle('on', b.dataset.v === curView)); return; }
      if(bar) bar.remove();
      bar = document.createElement('div'); bar.className = 'pn-hub'; bar.id = 'pnHub-' + h.id + '-' + curView; bar.dataset.sig = sig;
      bar.innerHTML = vis.map(m => `<button type="button" data-v="${m[0]}" class="${m[0] === curView ? 'on' : ''}">${esc(m[1])}</button>`).join('');
      bar.onclick = e => { const b = e.target.closest('[data-v]'); if(b && b.dataset.v !== curView) switchView(b.dataset.v); };
      const top = v.querySelector('.topbar');
      if(top) top.insertAdjacentElement('afterend', bar); else v.insertBefore(bar, v.firstChild);
    });
  }

  function install(){
    if(typeof window.switchView !== 'function' || window.__pnWrapped) return false;
    const orig = window.switchView; window.__pnWrapped = true;
    window.switchView = function(view){
      const r = orig.apply(this, arguments);
      try{ css(); applyHubsToSidebar(); const shown = document.querySelector('[id^="view-"]:not([style*="display: none"]):not([style*="display:none"])'); syncView(String(view)); }catch(e){ console.warn('pro-nav', e); }
      return r;
    };
    return true;
  }
  function boot(){
    css();
    install();
    applyHubsToSidebar();
    // permissions are applied after sign-in: re-check a few times, then whenever the sidebar changes
    let n = 0; const iv = setInterval(() => { n++; try{ applyHubsToSidebar(); }catch(e){} if(n > 20) clearInterval(iv); }, 800);
    const sb = document.querySelector('.sidebar');
    if(sb){ let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { try{ applyHubsToSidebar(); }catch(e){} }, 200); }).observe(sb, { subtree: true, attributes: true, attributeFilter: ['style', 'hidden'] }); }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
