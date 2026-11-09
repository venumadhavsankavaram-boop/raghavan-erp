/* Users & Access polish: staff last sign-in and two-step columns, a plain-English line on each role,
   a clearer "Not linked" hint, a corrected Users & Roles subtitle, and the Student/Parent Logins table no longer clips its buttons. */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAdmin = () => { try { return currentUser && currentUser.role === 'Admin'; } catch(e){ return false; } };
  const ROLE_INFO = {
    'Admin': 'Full control: every screen, settings, users and money. Keep this to one or two trusted people.',
    'Principal': 'Runs the school day to day: academics, staff, approvals and reports. Cannot change logins or permissions.',
    'Accountant': 'Fees, receipts, expenses and payroll. No access to marks or school setup.',
    'Office Assistant': 'Front-office work such as admissions and enquiries. Very limited by default.',
    'Teacher': 'Own classes and subjects only: attendance, marks, homework, exams and notices for those classes.',
    'Staff': 'Basic staff login: own profile, notices and leave. Add access under Edit permissions if needed.'
  };
  let act = null, actAt = 0;

  function css(){
    if($('apCss')) return;
    const s = document.createElement('style'); s.id = 'apCss';
    s.textContent = `
      @media (min-width:821px){ #lc .lc-list .lc-row{grid-template-columns:minmax(150px,1.4fr) 100px minmax(110px,1fr) 140px minmax(0,auto);} #lc .lc-act{min-width:0;} }
      .urx-act{white-space:nowrap;} .ap-c{font-size:.84rem;} .ap-c .ap-pill{display:block;width:fit-content;margin-top:3px;}
      .ap-fix{display:block;font-size:.72rem;color:#8a5a00;margin-top:2px;}
      .ap-role{margin:6px 0 8px;font-size:.82rem;color:#556;line-height:1.4;}
      .ap-pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:.72rem;font-weight:700;}
      .ap-on{background:#dff5e6;color:#17703a;} .ap-off{background:#fdf0d0;color:#8a5a00;}
    `;
    document.head.appendChild(s);
  }
  async function loadActivity(){
    if(act && Date.now() - actAt < 30000) return act;
    try{ const r = await fetch('/api/users/activity', { credentials: 'include' }); if(!r.ok) return null; const j = await r.json(); act = new Map(j.map(x => [x.id, x])); actAt = Date.now(); }catch(e){ act = null; }
    return act;
  }
  const ago = iso => {
    if(!iso) return 'Never';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if(m < 2) return 'Just now'; if(m < 60) return m + ' min ago'; if(m < 1440) return Math.round(m / 60) + ' hr ago';
    const d = Math.round(m / 1440); if(d < 31) return d + (d === 1 ? ' day ago' : ' days ago');
    return new Date(iso).toLocaleDateString('en-GB');
  };
  async function decorateUsers(){
    if(!isAdmin()) return;
    const tb = $('urxURows'); if(!tb) return;
    css();
    const table = tb.closest('table'); const head = table && table.querySelector('thead tr');
    const map = await loadActivity();
    if(head && !head.querySelector('.ap-h')){
      const ths = head.querySelectorAll('th'); const last = ths[ths.length - 1];
      ['Last sign-in'].forEach(t => { const th = document.createElement('th'); th.className = 'ap-h'; th.textContent = t; head.insertBefore(th, last); });
    }
    tb.querySelectorAll('tr').forEach(tr => {
      if(tr.querySelector('.ap-c')) return;
      const tds = tr.querySelectorAll('td'); if(tds.length < 4) return;
      const m = /editUser\('([^']+)'/.exec(tr.innerHTML); const a = m && map ? map.get(m[1].replace(/\\'/g, "'")) : null;
      const act4 = tds[tds.length - 1];
      const c1 = document.createElement('td'); c1.className = 'ap-c'; c1.setAttribute('data-l', 'Last sign-in');
      c1.innerHTML = esc(map ? (a ? (a.lastLogin ? ago(a.lastLogin) : 'Not yet') : '-') : '-') + (a ? ' <span class="ap-pill ' + (a.twofa ? 'ap-on' : 'ap-off') + '" title="Two-step sign-in">2-step ' + (a.twofa ? 'on' : 'off') + '</span>' : '');
      tr.insertBefore(c1, act4);
      const nl = tds[2].querySelector('.urx-mute');
      if(nl && /Not linked/.test(nl.textContent) && !tds[2].querySelector('.ap-fix') && !/Admin|Accountant|Principal|Office/.test(tds[1].textContent)) nl.insertAdjacentHTML('afterend', '<span class="ap-fix">Link in Staff so scope works</span>');
    });
    const ep = document.querySelector('#urxURows tr td[colspan="4"]'); if(ep) ep.setAttribute('colspan', '5');
  }
  function decorateRoles(){
    document.querySelectorAll('.urx-role-card').forEach(card => {
      if(card.querySelector('.ap-role')) return;
      const h = card.querySelector('h4'); if(!h) return;
      const t = ROLE_INFO[h.textContent.trim()] || 'Custom role: the screens it can open are exactly those you tick under Edit permissions.';
      const hd = card.querySelector('header'); (hd || h).insertAdjacentHTML('afterend', `<p class="ap-role">${esc(t)}</p>`);
    });
  }
  function fixHeader(){
    const v = $('view-usersroles'); if(!v) return;
    const p = v.querySelector('.topbar p'); if(p && /students, and parents/.test(p.textContent)) p.textContent = 'Create and manage staff logins here. Student and parent logins have their own tab.';
  }
  function hook(name, fn){
    const o = window[name]; if(typeof o !== 'function' || o.__ap) return;
    const w = function(){ const r = o.apply(this, arguments); try{ Promise.resolve(r).then(() => setTimeout(fn, 0)); fn(); }catch(e){} return r; };
    w.__ap = true; window[name] = w;
  }
  css();
  hook('renderUsersTab', () => { css(); fixHeader(); decorateUsers(); });
  hook('urxUsersRepaint', decorateUsers);
  hook('renderPermissionsTab', () => { css(); decorateRoles(); });
})();
