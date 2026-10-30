/* ============================================================================
   Date lock on new entries (Admin switch).

   Admin can switch OFF "allow changing the date" for four areas: fee receipts, payment / receipt
   vouchers, stationery & inventory bills, and attendance. Leave a switch ON while old data is being
   entered in the middle of the year; switch it OFF afterwards, and everyone except Admin then sees
   today's date on those forms and cannot change it. Admin can always change dates.

   The server enforces the same rule (a changed date is refused), so hiding the box is only the polite
   half. Nothing changes until Admin switches an area off.
   ========================================================================== */
(function(){
  const KEY = 'date-lock-policy';
  try { OBJECT_BACKED_KEYS[KEY] = '/api/kv/' + KEY; } catch(e){}
  const AREAS = {
    fees:       { label: 'Fee receipts and refunds',            ids: ['pDate', 'ledgerPayDate', 'ffDate'] },
    vouchers:   { label: 'Payment vouchers, receipt vouchers and journals', ids: ['acctIncDate', 'acctExpDate', 'jvDate'] },
    inventory:  { label: 'Stationery and inventory bills',      ids: ['invCheckoutDate', 'invRetDate', 'vretDate'] },
    attendance: { label: 'Student and staff attendance',         ids: ['attDateInput', 'staffAttDateInput'] }
  };
  const idToArea = {}; Object.keys(AREAS).forEach(a => AREAS[a].ids.forEach(i => { idToArea[i] = a; }));
  let policy = {}, loadedAt = 0, loading = null;
  const isAdmin = () => { try { return !!(currentUser && currentUser.role === 'Admin'); } catch(e){ return false; } };
  const loggedIn = () => { try { return !!currentUser; } catch(e){ return false; } };
  const today = () => (typeof localISODate === 'function' ? localISODate() : new Date().toISOString().slice(0, 10));
  const locked = area => !isAdmin() && policy[area] === false;

  async function load(force){
    if(!loggedIn()) return;
    if(!force && Date.now() - loadedAt < 60000) return;
    if(loading) return loading;
    loading = (async () => {
      try { const v = await storageGet(KEY, {}); policy = (v && typeof v === 'object') ? v : {}; loadedAt = Date.now(); } catch(e){}
      loading = null; scan(document.body);
    })();
    return loading;
  }

  function lockInput(el, area){
    if(el.dataset.dlock === '1') return;
    const t = today();
    el.dataset.dlock = '1';
    const changed = el.value !== t;
    el.value = t; el.min = t; el.max = t; el.readOnly = true;
    el.classList.add('dl-locked');
    el.title = 'The Admin has fixed this date to today.';
    if(changed && area !== 'attendance') { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    if(!el.nextElementSibling || !el.nextElementSibling.classList.contains('dl-tag')){
      const s = document.createElement('span'); s.className = 'dl-tag'; s.textContent = '🔒 today'; el.after(s);
    }
  }
  function unlockInput(el){
    if(el.dataset.dlock !== '1') return;
    delete el.dataset.dlock; el.readOnly = false; el.classList.remove('dl-locked'); el.removeAttribute('title');
    const n = el.nextElementSibling; if(n && n.classList.contains('dl-tag')) n.remove();
  }
  function scan(root){
    if(!root || !root.querySelectorAll) return;
    Object.keys(idToArea).forEach(id => {
      const el = (root.id === id) ? root : root.querySelector('#' + id);
      if(!el) return;
      if(locked(idToArea[id])) lockInput(el, idToArea[id]); else unlockInput(el);
    });
  }
  const st = document.createElement('style');
  st.textContent = '.dl-locked{background:#f1f3f8 !important;color:#33405c;cursor:not-allowed;pointer-events:none}.dl-tag{display:inline-block;margin-left:8px;font-size:12px;font-weight:600;color:#4a5878}';
  document.head.appendChild(st);

  // Receipt & Counter tab belongs to Admin only.
  function hideReceiptTab(){
    const b = document.getElementById('mftab-receipt');
    if(b && loggedIn()) b.style.display = isAdmin() ? '' : 'none';
  }
  // Forms are drawn when they are opened, so watch for the date boxes appearing.
  let t = null;
  new MutationObserver(() => { hideReceiptTab(); clearTimeout(t); t = setTimeout(() => { scan(document.body); attendanceToToday(); hideReceiptTab(); }, 30); }).observe(document.body, { childList: true, subtree: true });

  // The attendance page remembers the date it was last on; when locked it must show today.
  function attendanceToToday(){
    try {
      if(!locked('attendance')) return;
      const d = today();
      if(typeof attMarkDate !== 'undefined' && attMarkDate !== d && document.getElementById('attDateInput') && typeof changeAttDate === 'function') changeAttDate(d);
      if(typeof staffAttMarkDate !== 'undefined' && staffAttMarkDate !== d && document.getElementById('staffAttDateInput') && typeof changeStaffAttDate === 'function') changeStaffAttDate(d);
    } catch(e){}
  }
  if(typeof switchView === 'function'){
    const orig = switchView;
    window.switchView = function(){ const r = orig.apply(this, arguments); load(false); return r; };
  }
  setInterval(() => { if(loggedIn()) load(false); }, 30000);
  setTimeout(() => load(true), 2500);

  /* ---------------- Admin card (Manage Fee > Receipt & Counter) ---------------- */
  function cardHtml(){
    const rows = Object.keys(AREAS).map(a => {
      const on = policy[a] !== false;
      return `<label class="dl-row"><input type="checkbox" id="dl_${a}" ${on ? 'checked' : ''} onchange="saveDateLockSettings(true)"><span><b>${AREAS[a].label}</b><br><small>${on ? 'Anyone with access can change the date' : 'Locked: everyone except Admin gets today\'s date'}</small></span></label>`;
    }).join('');
    return `<section class="sf-card ft-card" id="dlCard" style="grid-column:1/-1">
      ${ftCardHead('Dates on new entries', 'Keep a box ticked while you are entering old data from earlier in the year. When that work is done, untick it: everyone except Admin will then see today\'s date on new entries and cannot change it. Admin can always change dates.')}
      <div class="dl-rows">${rows}</div>
      <div style="margin-top:10px;padding:8px 12px;border-radius:10px;background:#fff6dc;font-size:13px;color:#5a4710">You are logged in as Admin, so you can always change dates yourself. To see the lock working, sign in as a teacher or accountant.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">${sfBtn('primary', 'check', 'Save date settings', 'saveDateLockSettings()')}<span id="dlMsg" style="font-size:12px;color:#4a5878"></span></div>
    </section>
    <style>.dl-rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.dl-row{display:flex;gap:10px;align-items:flex-start;border:1px solid #dde3ee;border-radius:10px;padding:10px 12px;cursor:pointer;background:#fff}.dl-row input{margin-top:3px;width:18px;height:18px}.dl-row small{color:#4a5878}</style>`;
  }
  window.saveDateLockSettings = async function(auto){
    if(!isAdmin()){ showToast('Only the Admin can change this.'); return; }
    const next = {};
    Object.keys(AREAS).forEach(a => { const c = document.getElementById('dl_' + a); next[a] = c ? c.checked : true; });
    const ok = await storageSet(KEY, next);
    if(ok === false){ showToast('Could not save. Check the connection and try again.'); return; }
    policy = next; loadedAt = Date.now();
    showToast('Date settings saved.', auto ? undefined : 'burst');
    const m = document.getElementById('dlMsg'); if(m) m.textContent = 'Saved.';
    if(auto){ document.querySelectorAll('.dl-row small').forEach((el, i) => { const k = Object.keys(AREAS)[i]; el.textContent = next[k] ? 'Anyone with access can change the date' : 'Locked: everyone except Admin gets today\'s date'; }); return; }
    const card = document.getElementById('dlCard'); if(card){ const tmp = document.createElement('div'); tmp.innerHTML = cardHtml(); card.replaceWith(...Array.from(tmp.children)); }
  };
  if(typeof window.renderReceiptTab === 'function'){
    const orig = window.renderReceiptTab;
    window.renderReceiptTab = async function(body){
      if(!isAdmin()){ body.innerHTML = '<div class="empty-state"><b>Admin access only</b>Receipt and counter settings can be changed by the Admin.</div>'; return; }
      const r = await orig.apply(this, arguments);
      if(isAdmin()){
        await load(true);
        const grid = body.querySelector('.ft-grid');
        if(grid){ const tmp = document.createElement('div'); tmp.innerHTML = cardHtml(); Array.from(tmp.children).forEach(c => grid.appendChild(c)); }
      }
      return r;
    };
  }
})();
