/* Admin Tools - tidy layout. The page used to be one long pile of cards in different widths. This groups the same cards
   under five tabs (Portals, Security, Backups & data, Server & health, Reminders & payments) with one consistent width.
   Presentation only: no card, button, setting or permission is changed, and nothing is hidden for good - every card is in
   exactly one tab, and a card this file does not know yet is shown under "More". */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const GROUPS = [
    { k: 'portals',  label: '🧒 Portals',            ids: ['portalSettingsCard', 'teacherPortalCard'], words: [] },
    { k: 'security', label: '🔐 Security',           ids: [], words: ['Change Password', 'Two-step sign-in', 'Audit trail'] },
    { k: 'data',     label: '💾 Backups & data',     ids: ['autoBackupCard', 'autoCleanupCard'], words: ['Full Data Backup', 'Downloads', 'Reset Inventory'] },
    { k: 'health',   label: '🩺 Server & health',    ids: ['siteHealthCard'], words: ['Server problems'] },
    { k: 'notify',   label: '🔔 Reminders & payments', ids: [], words: ['Fee reminders', 'Online payments'] }
  ];
  const get = () => { try{ return sessionStorage.getItem('atTab'); }catch(e){ return null; } };
  const put = v => { try{ sessionStorage.setItem('atTab', v); }catch(e){} };
  let want = get() || 'portals', cur = want, busy = false;

  function css(){
    if($('atCss')) return;
    const s = document.createElement('style'); s.id = 'atCss';
    s.textContent = '#adminTools2Body.at-on > .profile-card{max-width:860px !important;width:100%;margin:0 0 14px !important}' +
      '#adminTools2Body.at-on > .at-hide{display:none !important}' +
      '#adminTools2Body.at-on > p.at-note{margin:0 0 14px !important}' +
      '#adminTools2Body .at-tabs{margin:0 0 16px}' +
      '#adminTools2Body.at-on > .profile-card:empty,#adminTools2Body.at-on > .profile-card.at-empty{display:none !important}';
    document.head.appendChild(s);
  }
  function groupOf(card){
    if(card.id){ const g = GROUPS.find(x => x.ids.indexOf(card.id) >= 0); if(g) return g.k; }
    const t = (card.innerText || '').replace(/\s+/g, ' ').trim();
    const g = GROUPS.find(x => x.words.some(w => t.indexOf(w) >= 0));
    return g ? g.k : (t ? 'more' : '');
  }
  function tidy(){
    if(busy) return; const body = $('adminTools2Body'); if(!body) return;
    busy = true;
    try{
      css(); body.classList.add('at-on');
      const cards = Array.from(body.children).filter(c => c.classList && c.classList.contains('profile-card'));
      const note = Array.from(body.children).find(c => c.tagName === 'P'); if(note) note.classList.add('at-note');
      const counts = {};
      cards.forEach(c => { const g = groupOf(c); c.dataset.atg = g; counts[g] = (counts[g] || 0) + 1; c.classList.toggle('at-empty', !g); });
      const tabs = GROUPS.concat(counts.more ? [{ k: 'more', label: 'More' }] : []).filter(g => counts[g.k]);
      if(!tabs.length) return;
      cur = tabs.find(t => t.k === want) ? want : tabs[0].k;   /* remember what was asked for; a tab that is still loading falls back for now */
      let bar = $('atTabs');
      const sig = tabs.map(t => t.k).join(',');
      if(!bar || bar.dataset.sig !== sig){
        if(bar) bar.remove();
        bar = document.createElement('div'); bar.id = 'atTabs'; bar.className = 'mf-tabs at-tabs'; bar.dataset.sig = sig;
        bar.innerHTML = tabs.map(t => '<button type="button" class="mf-tab" data-at="' + t.k + '">' + t.label + '</button>').join('');
        bar.addEventListener('click', e => { const b = e.target.closest('[data-at]'); if(!b) return; want = b.dataset.at; put(want); tidy(); });
        const anchor = note || body.firstChild; body.insertBefore(bar, anchor && anchor.parentNode === body ? anchor : null);
        if(note && bar.nextSibling !== note) body.insertBefore(note, bar.nextSibling);
      }
      bar.querySelectorAll('[data-at]').forEach(b => b.classList.toggle('active', b.dataset.at === cur));
      cards.forEach(c => c.classList.toggle('at-hide', c.dataset.atg !== cur));
    }finally{ setTimeout(() => { busy = false; }, 0); }
  }
  function watch(){
    const body = $('adminTools2Body'); if(!body || body.__atw) return; body.__atw = true;
    let t = null; new MutationObserver(() => { clearTimeout(t); t = setTimeout(tidy, 120); }).observe(body, { childList: true });
    tidy();
  }
  const prev = window.switchView;
  if(typeof prev === 'function' && !prev.__at){
    const w = function(v){ const r = prev.apply(this, arguments); if(v === 'admintools2'){ setTimeout(watch, 300); setTimeout(tidy, 1500); } return r; };
    w.__at = true; window.switchView = w;
  }
})();
