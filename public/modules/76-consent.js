/* ============================================================================
   Privacy & Consent (data protection)
   * Parent / student: when the Admin has switched consent ON, a full-screen notice asks the parent to read it
     (English / Telugu) and tick what they agree to. "Agree to all" ticks every box at once. Answers can be changed
     or withdrawn later from the "Privacy & consent" card in the portal.
   * Admin / Principal: "Privacy & Consent" page (Users & Access) with a master ON/OFF switch (OFF by default),
     a monitor of who agreed and who did not, a one-click reminder, paper-form marking, printable forms and a call list.
   * A class teacher sees the status of their own class only.
   Nothing here blocks fees, marks or attendance. Every answer is stored as a new line, so there is a full history.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const isParent = () => ['Student', 'Parent'].includes(role());
  const isMgr = () => ['Admin', 'Principal'].includes(role());
  const toast = m => { try{ showToast(m); }catch(e){ console.log(m); } };
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok){ const err = new Error((j && j.error) || 'Something went wrong'); err.status = r.status; throw err; }
    return j;
  }
  const dstr = v => { if(!v) return ''; const d = new Date(v); if(isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); };

  function css(){
    if($('cnCss')) return;
    const s = document.createElement('style'); s.id = 'cnCss';
    s.textContent = `
      .cn-ov{position:fixed;inset:0;z-index:99999;background:rgba(20,16,50,.72);display:flex;align-items:center;justify-content:center;padding:14px;}
      .cn-box{background:#fff;border-radius:20px;max-width:640px;width:100%;max-height:94vh;display:flex;flex-direction:column;box-shadow:0 30px 80px -20px rgba(0,0,0,.6);overflow:hidden;}
      .cn-head{padding:16px 20px;background:linear-gradient(135deg,#211a4e,#3a2f8f);color:#fff;display:flex;justify-content:space-between;gap:10px;align-items:center;}
      .cn-head b{font-size:1.05rem;} .cn-lang{border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;border-radius:999px;padding:5px 12px;cursor:pointer;font:inherit;font-size:.82rem;}
      .cn-body{padding:16px 20px;overflow:auto;flex:1;}
      .cn-notice{white-space:pre-wrap;font-size:.92rem;line-height:1.55;color:#2b2a44;background:#f7f8fc;border-radius:12px;padding:12px 14px;max-height:240px;overflow:auto;border:1px solid #e3e8f3;}
      .cn-kids{margin:12px 0 4px;font-size:.88rem;color:#444;} .cn-kids b{color:#211a4e;}
      .cn-tick{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #dfe5f1;border-radius:12px;margin-top:8px;cursor:pointer;font-size:.9rem;line-height:1.4;}
      .cn-tick input{width:20px;height:20px;margin-top:1px;flex:none;} .cn-tick.req{background:#f1f6ff;border-color:#b9cdf5;}
      .cn-tick small{display:block;color:#b3261e;font-weight:600;margin-top:2px;}
      .cn-foot{padding:14px 20px;border-top:1px solid #eef1f7;display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:#fbfcff;}
      .cn-foot .sp{flex:1;} .cn-btn{border:0;border-radius:12px;padding:11px 18px;font:inherit;font-weight:700;cursor:pointer;font-size:.92rem;}
      .cn-go{background:#17703a;color:#fff;} .cn-go:disabled{background:#b8c4bc;cursor:not-allowed;} .cn-all{background:#2F80ED;color:#fff;}
      .cn-no{background:#fde4e1;color:#b3261e;} .cn-later{background:#eef1f7;color:#445;}
      .cn-card{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:16px;padding:16px 18px;margin-bottom:14px;}
      .cn-card h3{margin:0 0 10px;font-size:1.05rem;color:var(--navy,#14325c);display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}
      .cn-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px;}
      .cn-tile{border-radius:12px;padding:10px 12px;background:#f4f7fd;cursor:pointer;border:2px solid transparent;} .cn-tile.on{border-color:#211a4e;} .cn-tile b{display:block;font-size:1.4rem;color:#211a4e;} .cn-tile span{font-size:.78rem;color:#667;}
      .cn-pill{font-weight:700;font-size:.74rem;padding:3px 10px;border-radius:999px;white-space:nowrap;display:inline-block;}
      .cn-tbl{width:100%;border-collapse:collapse;font-size:.88rem;} .cn-tbl th,.cn-tbl td{text-align:left;padding:8px 6px;border-top:1px solid #eef1f7;vertical-align:top;} .cn-tbl th{font-size:.74rem;color:#667;text-transform:uppercase;}
      .cn-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;} .cn-row select,.cn-row input[type=text]{padding:8px;border:1px solid #d6dcea;border-radius:10px;font:inherit;}
      .cn-f{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;} .cn-f label{font-size:.8rem;color:#667;display:block;margin-bottom:3px;} .cn-f input,.cn-f select,.cn-f textarea{width:100%;padding:9px;border:1px solid #d6dcea;border-radius:10px;font:inherit;box-sizing:border-box;} .cn-f .full{grid-column:1/-1;}
      .cn-sw{display:flex;gap:12px;align-items:center;padding:12px 14px;border-radius:14px;background:#f4f7fd;margin-bottom:12px;flex-wrap:wrap;} .cn-sw.on{background:#e6f6ec;} .cn-sw b{font-size:1rem;}
      .cn-note{font-size:.84rem;color:#667;margin-top:4px;line-height:1.45;}
      .cn-mine{margin:14px 0;} .cn-mine .cn-card{border-left:6px solid #211a4e;}
    `;
    document.head.appendChild(s);
  }

  /* ===================================================================== PARENT SIDE ===== */
  let me = null, overlayOpen = false, checkedOnce = false;
  const STATUS_TXT = { given: ['#dff5e6', '#17703a', 'Agreed'], paper: ['#dff5e6', '#17703a', 'Agreed (paper form)'], declined: ['#fde4e1', '#b3261e', 'Did not agree'], withdrawn: ['#fde4e1', '#b3261e', 'Withdrawn'], pending: ['#fdf0d0', '#8a5a00', 'Not answered'], outdated: ['#fdf0d0', '#8a5a00', 'Notice updated - please answer again'] };
  const pill = st => { const p = STATUS_TXT[st] || ['#eee', '#444', st]; return `<span class="cn-pill" style="background:${p[0]};color:${p[1]}">${esc(p[2])}</span>`; };

  async function loadMe(){ try{ me = await api('GET', '/api/consent/me'); }catch(e){ me = null; } return me; }

  function closeOverlay(){ const o = $('cnOverlay'); if(o) o.remove(); overlayOpen = false; }

  function openOverlay(opts){
    opts = opts || {};
    if(!me || !me.enabled || overlayOpen) return;
    css(); overlayOpen = true;
    let lang = 'en';
    try{ if(typeof window.portalLang === 'function' && window.portalLang() === 'te') lang = 'te'; }catch(e){}
    const kids = (opts.onlyUnanswered ? me.children.filter(c => !c.answered) : me.children);
    const ids = (kids.length ? kids : me.children).map(c => c.id);
    const first = me.children.find(c => ids.includes(c.id)) || {};
    const ticks = {}; me.purposes.forEach(p => { ticks[p.id] = p.required ? false : !!(first.purposes && first.purposes[p.id]); if(opts.change && first.purposes) ticks[p.id] = !!first.purposes[p.id]; });
    const o = document.createElement('div'); o.className = 'cn-ov'; o.id = 'cnOverlay';
    document.body.appendChild(o);
    const canSkip = !opts.change && (me.mode === 'remind' || (me.mode === 'skip' && (me.skipsLeft || 0) > 0));
    function draw(){
      const te = lang === 'te';
      const names = (kids.length ? kids : me.children).map(c => `<b>${esc(c.name)}</b> (${esc(c.className)} ${esc(c.section)})`).join(', ');
      const allOn = me.purposes.every(p => ticks[p.id]);
      o.innerHTML = `<div class="cn-box" role="dialog" aria-modal="true">
        <div class="cn-head"><b>${te ? 'గోప్యతా నోటీసు మరియు అంగీకారం' : 'Privacy notice and consent'}</b><button class="cn-lang" id="cnLang">${te ? 'English' : 'తెలుగు'}</button></div>
        <div class="cn-body">
          <div class="cn-notice">${esc(te ? me.noticeTe : me.noticeEn)}</div>
          <div class="cn-kids">${te ? 'ఈ అంగీకారం వీరికి వర్తిస్తుంది' : 'This answer is for'}: ${names}</div>
          ${me.purposes.map(p => `<label class="cn-tick ${p.required ? 'req' : ''}"><input type="checkbox" data-p="${esc(p.id)}" ${ticks[p.id] ? 'checked' : ''}><span>${esc(te ? (p.labelTe || p.label) : p.label)}${p.required ? `<small>${te ? 'అంగీకరించడానికి ఇది తప్పనిసరి' : 'Needed to agree'}</small>` : `<small style="color:#667;font-weight:400">${te ? 'ఐచ్ఛికం' : 'Optional'}</small>`}</span></label>`).join('')}
        </div>
        <div class="cn-foot">
          <button class="cn-btn cn-all" id="cnAll">${allOn ? (te ? 'అన్నీ తొలగించు' : 'Untick all') : (te ? 'అన్నింటికీ అంగీకరిస్తున్నాను' : 'Agree to all')}</button>
          <span class="sp"></span>
          ${canSkip ? `<button class="cn-btn cn-later" id="cnLater">${te ? 'తర్వాత అడగండి' : 'Ask me later'}${me.mode === 'skip' ? ' (' + me.skipsLeft + ')' : ''}</button>` : ''}
          ${opts.change ? `<button class="cn-btn cn-later" id="cnClose">${te ? 'మూసివేయి' : 'Close'}</button>` : ''}
          <button class="cn-btn cn-no" id="cnNo">${te ? 'నేను అంగీకరించను' : (opts.change ? 'Withdraw my consent' : 'I do not agree')}</button>
          <button class="cn-btn cn-go" id="cnYes" ${ticks.core ? '' : 'disabled'}>${te ? 'నేను అంగీకరిస్తున్నాను' : 'I agree'}</button>
        </div></div>`;
      o.querySelector('#cnLang').onclick = () => { lang = te ? 'en' : 'te'; try{ localStorage.setItem('portalLang', lang); }catch(e){} draw(); };
      o.querySelectorAll('input[data-p]').forEach(i => i.onchange = () => { ticks[i.dataset.p] = i.checked; draw(); });
      o.querySelector('#cnAll').onclick = () => { const to = !allOn; me.purposes.forEach(p => ticks[p.id] = to); draw(); };
      const cl = o.querySelector('#cnClose'); if(cl) cl.onclick = closeOverlay;
      const lt = o.querySelector('#cnLater'); if(lt) lt.onclick = async () => { try{ await api('POST', '/api/consent/skip', {}); }catch(e){ toast(e.message); await loadMe(); closeOverlay(); openOverlay(opts); return; } closeOverlay(); };
      o.querySelector('#cnYes').onclick = async () => { await send('given'); };
      o.querySelector('#cnNo').onclick = async () => {
        if(!confirm(opts.change ? 'Withdraw your consent for this child? The school will be told.' : 'You are choosing not to agree. The school will be told and may contact you. Continue?')) return;
        await send(opts.change ? 'withdrawn' : 'declined');
      };
    }
    async function send(status){
      const btns = o.querySelectorAll('button'); btns.forEach(b => b.disabled = true);
      try{
        await api('POST', '/api/consent/answer', { studentIds: ids, status, purposes: ticks });
        toast(status === 'given' ? 'Thank you. Your answer is saved.' : 'Your answer is saved.');
        closeOverlay(); await loadMe(); refreshCard();
      }catch(e){ toast(e.message); btns.forEach(b => b.disabled = false); draw(); }
    }
    draw();
  }

  async function checkParent(){
    if(!isParent() || checkedOnce) return;
    checkedOnce = true;
    await loadMe();
    if(me && me.enabled && me.due) openOverlay({ onlyUnanswered: true });
    refreshCard();
  }

  /* "Privacy & consent" card at the bottom of the portal */
  function refreshCard(){
    if(!isParent()) return;
    const body = $('myProfileBody'); if(!body) return;
    const old = $('cnMine'); if(old) old.remove();
    if(!me || !me.enabled) return;
    css();
    const box = document.createElement('div'); box.id = 'cnMine'; box.className = 'cn-mine';
    box.innerHTML = `<div class="cn-card"><h3>Privacy &amp; consent <button class="btn btn-secondary" id="cnOpen">${me.due ? 'Answer now' : 'View or change'}</button></h3>
      ${me.children.map(c => `<div style="padding:6px 0;border-top:1px solid #eef1f7;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span><b>${esc(c.name)}</b> <small style="color:#667">${esc(c.className)} ${esc(c.section)}</small></span>${pill(c.answered ? (c.method === 'paper' ? 'paper' : c.status) : 'pending')}</div>`).join('')}
      <div class="cn-note">You can read the notice again, change your tick boxes or withdraw your consent here at any time.</div></div>`;
    body.appendChild(box);
    $('cnOpen').onclick = () => openOverlay({ change: !me.due });
  }
  if(typeof window.renderMyProfileBody === 'function'){
    const o = window.renderMyProfileBody;
    window.renderMyProfileBody = async function(){ const r = await o.apply(this, arguments); try{ if(isParent()){ if(!me) await loadMe(); refreshCard(); } }catch(e){} return r; };
  }

  /* ===================================================================== STAFF PAGE ===== */
  let st = null, cfg = null, tab = 'monitor', filt = { status: 'open', cls: '', q: '' }, sel = new Set(), busy = false;
  function ensureShell(){
    if(!isMgr() && role() !== 'Teacher') return;
    css();
    const dash = $('view-dashboard');
    if(dash && !$('view-privacyconsent')){ const v = document.createElement('div'); v.id = 'view-privacyconsent'; v.style.display = 'none'; dash.parentNode.insertBefore(v, dash); }
    const anchor = $('navRolesPermissions') || $('navUsersRoles');
    if(anchor && !$('navPrivacyConsent')){
      const b = document.createElement('button'); b.className = 'sb-link'; b.id = 'navPrivacyConsent'; b.setAttribute('onclick', "switchView('privacyconsent')");
      b.style.display = isMgr() ? 'flex' : 'none';
      b.innerHTML = '<span class="sb-icon-wrap"><svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg></span> Privacy &amp; Consent';
      anchor.insertAdjacentElement('afterend', b);
    }
  }
  async function probeTeacher(){
    if(role() !== 'Teacher' || window.__cnTeacherProbed) return; window.__cnTeacherProbed = true;
    try{ const j = await api('GET', '/api/consent/status'); if(j.enabled && !j.noClass && j.rows.length){ ensureShell(); const n = $('navPrivacyConsent'); if(n){ n.style.display = 'flex'; if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility(); } } }catch(e){}
  }

  const classes = () => Array.from(new Set((st ? st.rows : []).map(r => r.className + ' ' + r.section))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const isOpen = r => r.status === 'pending' || r.status === 'outdated';
  function visibleRows(){
    return (st ? st.rows : []).filter(r => {
      if(filt.cls && (r.className + ' ' + r.section) !== filt.cls) return false;
      if(filt.status === 'open' && !isOpen(r)) return false;
      if(filt.status === 'agreed' && !['given', 'paper'].includes(r.status)) return false;
      if(['declined', 'withdrawn'].includes(filt.status) && r.status !== filt.status) return false;
      if(filt.status === 'nologin' && !(isOpen(r) && !r.hasLogin)) return false;
      if(filt.q && (r.name + ' ' + r.admissionNo).toLowerCase().indexOf(filt.q.toLowerCase()) < 0) return false;
      return true;
    });
  }
  async function load(){
    try{ st = await api('GET', '/api/consent/status'); if(isMgr()) cfg = await api('GET', '/api/consent/settings'); }catch(e){ st = null; toast(e.message); }
  }
  async function render(){
    const v = $('view-privacyconsent'); if(!v) return;
    if(!st) await load();
    const mg = isMgr();
    v.innerHTML = `<div class="topbar"><div><h1>Privacy &amp; Consent</h1><p style="margin:0;color:#667">Ask parents to read the school privacy notice and tick what they agree to. See who has answered and remind the rest.</p></div></div>
      ${mg ? `<div class="cn-row" id="cnTabs"><button class="btn ${tab === 'monitor' ? 'btn-primary' : 'btn-secondary'}" data-t="monitor">Who has answered</button><button class="btn ${tab === 'settings' ? 'btn-primary' : 'btn-secondary'}" data-t="settings">Settings and notice</button></div>` : ''}
      <div id="cnPage"></div>`;
    v.querySelectorAll('#cnTabs [data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
    if(tab === 'settings' && mg) renderSettings(); else renderMonitor();
  }

  function renderMonitor(){
    const p = $('cnPage'); if(!st){ p.innerHTML = '<div class="cn-card">Could not load. Please try again.</div>'; return; }
    if(st.noClass){ p.innerHTML = '<div class="cn-card">You are not a class teacher of any class, so there is nothing to show here.</div>'; return; }
    const c = st.count || {}, open = (c.pending || 0) + (c.outdated || 0), agreed = (c.given || 0) + (c.paper || 0), mg = isMgr();
    const rows = visibleRows();
    const tile = (k, n, label) => `<div class="cn-tile ${filt.status === k ? 'on' : ''}" data-s="${k}"><b>${n}</b><span>${label}</span></div>`;
    const pct = st.total ? Math.round(agreed * 100 / st.total) : 0;
    p.innerHTML = `
      ${!st.enabled ? `<div class="cn-card" style="border-left:6px solid #e0a100"><b>Consent is switched OFF.</b> Parents are not being asked anything yet.${mg ? ' Open "Settings and notice" to switch it on when you are ready.' : ''}</div>` : ''}
      <div class="cn-card"><h3>Status <small style="color:#667;font-weight:500">${pct}% agreed (${agreed} of ${st.total}) · notice version ${st.version}</small></h3>
        <div class="cn-tiles">${tile('open', open, 'Not answered')}${tile('agreed', agreed, 'Agreed')}${tile('declined', c.declined || 0, 'Did not agree')}${tile('withdrawn', c.withdrawn || 0, 'Withdrawn')}${tile('nologin', rows.length ? (st.rows.filter(r => isOpen(r) && !r.hasLogin).length) : (st.rows.filter(r => isOpen(r) && !r.hasLogin).length), 'No login yet')}${tile('all', st.total, 'All children')}</div>
        <div class="cn-row">
          <select id="cnCls"><option value="">All classes</option>${classes().map(x => `<option ${x === filt.cls ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
          <input type="text" id="cnQ" placeholder="Search name or admission no." value="${esc(filt.q)}">
          <span style="flex:1"></span>
          ${mg ? `<button class="btn btn-primary" id="cnRemind" ${st.enabled ? '' : 'disabled'}>🔔 Remind parents who have not answered</button>` : ''}
          <button class="btn btn-secondary" id="cnCsv">Download call list</button>
          ${mg ? `<button class="btn btn-secondary" id="cnPrint">Print forms</button>` : ''}
        </div>
        ${mg ? `<div class="cn-row"><button class="btn btn-secondary" id="cnPaper">Mark selected as "paper form received"</button><label style="font-size:.85rem"><input type="checkbox" id="cnSelAll"> Select all shown (${rows.length})</label></div>` : ''}
        <div style="overflow:auto"><table class="cn-tbl"><thead><tr>${mg ? '<th></th>' : ''}<th>Child</th><th>Class</th><th>Answer</th><th>When / how</th><th>Parent phone</th><th>App</th></tr></thead><tbody>
        ${rows.slice(0, 400).map(r => `<tr>${mg ? `<td><input type="checkbox" class="cnSel" data-id="${esc(r.studentId)}" ${sel.has(r.studentId) ? 'checked' : ''}></td>` : ''}
          <td><b>${esc(r.name)}</b><div class="cn-note" style="margin:0">${esc(r.admissionNo)}</div></td><td>${esc(r.className)} ${esc(r.section)}</td>
          <td>${pill(r.status)}${r.status !== 'pending' && ['given', 'paper'].includes(r.status) ? `<div class="cn-note" style="margin:2px 0 0">${(st.purposes || []).filter(x => !x.required).map(x => (r.purposes && r.purposes[x.id] ? '✓ ' : '✗ ') + esc(x.label.split(' ').slice(0, 4).join(' '))).join('<br>')}</div>` : ''}</td>
          <td>${r.at ? dstr(r.at) + ' · ' + (r.method === 'paper' ? 'paper' : 'app') : (r.remindedAt ? 'Reminded ' + dstr(r.remindedAt) : '-')}</td>
          <td>${esc(r.phone || '-')}</td><td>${r.hasLogin ? (r.signedIn ? 'Signed in' : 'Login not used yet') : '<span style="color:#b3261e">No login</span>'}${r.notifications ? ' · 🔔' : ''}</td></tr>`).join('') || `<tr><td colspan="7" style="padding:18px;color:#667">Nobody matches this filter.</td></tr>`}
        </tbody></table>${rows.length > 400 ? `<div class="cn-note">Showing the first 400 of ${rows.length}. Use the class filter to narrow down.</div>` : ''}</div>
        <div class="cn-note">"No login yet" parents cannot be reminded in the app: call them (use the call list) or give them a paper form and mark it here.</div>
      </div>`;
    p.querySelectorAll('.cn-tile').forEach(t => t.onclick = () => { filt.status = t.dataset.s; renderMonitor(); });
    $('cnCls').onchange = e => { filt.cls = e.target.value; renderMonitor(); };
    const q = $('cnQ'); q.oninput = () => { filt.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { renderMonitor(); const n = $('cnQ'); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); };
    $('cnCsv').onclick = () => csv(rows);
    if(mg){
      $('cnRemind').onclick = remind; $('cnPrint').onclick = () => printForms(rows); $('cnPaper').onclick = paper;
      $('cnSelAll').onchange = e => { rows.forEach(r => e.target.checked ? sel.add(r.studentId) : sel.delete(r.studentId)); renderMonitor(); };
      p.querySelectorAll('.cnSel').forEach(i => i.onchange = () => { i.checked ? sel.add(i.dataset.id) : sel.delete(i.dataset.id); });
    }
  }
  async function remind(){
    const ids = filt.cls ? visibleRows().filter(isOpen).map(r => r.studentId) : [];
    const n = filt.cls ? ids.length : (st.count.pending || 0) + (st.count.outdated || 0);
    if(!n) return toast('Nobody is waiting to be reminded.');
    if(!confirm(`Send an app reminder to ${n} parent(s)${filt.cls ? ' of ' + filt.cls : ''}? Each parent gets at most one reminder per day.`)) return;
    if(busy) return; busy = true;
    try{
      const j = await api('POST', '/api/consent/remind', ids.length ? { studentIds: ids } : {});
      alert(`Reminders sent: ${j.reminded}\nOf these, phones with notifications switched on: ${j.withDevice}\nNo login yet (call or paper form): ${j.noLogin}\nReminded in the last day already: ${j.tooSoon}\n\nParents without notifications will see the notice the next time they open the app.`);
      await load(); renderMonitor();
    }catch(e){ toast(e.message); } busy = false;
  }
  async function paper(){
    const ids = Array.from(sel); if(!ids.length) return toast('Tick the children first.');
    const picks = {}; let msg = '';
    (st.purposes || []).forEach(p => { if(!p.required){ const ok = confirm(`Did the parent also tick: "${p.label}"?\n\nOK = yes, Cancel = no`); picks[p.id] = ok; } });
    if(!confirm(`Record a paper form received for ${ids.length} child(ren)?`)) return;
    try{ const j = await api('POST', '/api/consent/paper', { studentIds: ids, purposes: picks }); toast(j.recorded + ' paper form(s) recorded.'); sel.clear(); await load(); renderMonitor(); }catch(e){ toast(e.message); }
  }
  function csv(rows){
    const q = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
    const out = [['Name', 'Admission no', 'Class', 'Answer', 'Parent phone', 'Has login', 'Last reminded'].map(q).join(',')];
    rows.forEach(r => out.push([r.name, r.admissionNo, r.className + ' ' + r.section, (STATUS_TXT[r.status] || [0, 0, r.status])[2], r.phone, r.hasLogin ? 'Yes' : 'No', dstr(r.remindedAt)].map(q).join(',')));
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out.join('\r\n')], { type: 'text/csv' })); a.download = 'consent-call-list.csv'; document.body.appendChild(a); a.click(); a.remove();
  }
  function printForms(rows){
    const list = rows.filter(isOpen).length ? rows.filter(isOpen) : rows;
    if(!list.length) return toast('No children to print for.');
    if(list.length > 120 && !confirm(`This will print ${list.length} forms. Choose a class first to print fewer. Continue?`)) return;
    const s = cfg || {}; const notice = String(s.noticeEn || '').replace(/\{school\}/g, (s.school && s.school.name) || 'the school').replace(/\{officer\}/g, (s.officer && s.officer.name ? s.officer.name + ' ' + (s.officer.phone || '') : 'the school office'));
    const noticeTe = String(s.noticeTe || '').replace(/\{school\}/g, (s.school && s.school.name) || 'పాఠశాల').replace(/\{officer\}/g, (s.officer && s.officer.name ? s.officer.name + ' ' + (s.officer.phone || '') : 'పాఠశాల కార్యాలయం'));
    const pur = (st.purposes || []);
    const page = r => `<section><h2>${esc((s.school && s.school.name) || 'School')} - Privacy notice and parent consent</h2>
      <p><b>Child:</b> ${esc(r.name)} &nbsp; <b>Class:</b> ${esc(r.className)} ${esc(r.section)} &nbsp; <b>Admission no:</b> ${esc(r.admissionNo)}</p>
      <div class="n">${esc(s.noticeEn ? notice : '')}</div><div class="n">${esc(noticeTe)}</div>
      ${pur.map(x => `<p class="t">&#9744; ${esc(x.label)}${x.required ? ' <i>(needed to agree)</i>' : ' <i>(optional)</i>'}</p>`).join('')}
      <p style="margin-top:28px">Parent / guardian name: ____________________________ &nbsp; Signature: ______________ &nbsp; Date: __________</p></section>`;
    const w = window.open('', '_blank'); if(!w) return toast('Please allow pop-ups to print.');
    w.document.write(`<html><head><meta charset="utf-8"><title>Consent forms</title><style>body{font-family:Arial,sans-serif;font-size:11.5px;margin:18px}section{page-break-after:always}h2{font-size:15px;margin:0 0 8px}.n{white-space:pre-wrap;border:1px solid #ccc;padding:8px;margin:8px 0;line-height:1.45}.t{margin:6px 0}</style></head><body>${list.map(page).join('')}</body></html>`);
    w.document.close(); setTimeout(() => { try{ w.print(); }catch(e){} }, 400);
  }

  function renderSettings(){
    const p = $('cnPage'); if(!cfg){ p.innerHTML = '<div class="cn-card">Could not load settings.</div>'; return; }
    const sc = cfg.school || {}, of = cfg.officer || {};
    p.innerHTML = `
      <div class="cn-sw ${cfg.enabled ? 'on' : ''}"><div style="flex:1"><b>Ask parents for consent: ${cfg.enabled ? 'ON' : 'OFF'}</b>
        <div class="cn-note">It stays OFF until you switch it on. Switch it on only after all parents have logged in at least once. When ON, each parent sees the notice the next time they open the app.</div></div>
        <button class="btn ${cfg.enabled ? 'btn-secondary' : 'btn-primary'}" id="cnToggle">${cfg.enabled ? 'Switch OFF' : 'Switch ON'}</button></div>
      <div class="cn-card"><h3>How parents are asked</h3><div class="cn-f">
        <div><label>When a parent does not answer</label><select id="cnMode"><option value="remind" ${cfg.mode === 'remind' ? 'selected' : ''}>Remind on every login (recommended)</option><option value="skip" ${cfg.mode === 'skip' ? 'selected' : ''}>Allow "Ask me later" a few times only</option><option value="required" ${cfg.mode === 'required' ? 'selected' : ''}>Must answer before using the app</option></select></div>
        <div><label>"Ask me later" allowed (only for the second option)</label><input type="number" id="cnSkips" min="1" max="10" value="${esc(cfg.maxSkips)}"></div>
        <div><label>Start showing from (optional)</label><input type="date" id="cnStart" value="${esc(cfg.startDate)}"></div></div>
        <div class="cn-note">Fees, marks and attendance are never blocked by this. "Must answer" only stops the parent from opening the portal until they choose. Use it only if the school decides to make it compulsory.</div></div>
      <div class="cn-card"><h3>School details used in the notice</h3><div class="cn-f">
        <div><label>School name</label><input id="cnSn" value="${esc(sc.name)}"></div><div><label>School address</label><input id="cnSa" value="${esc(sc.address)}"></div>
        <div><label>Grievance / data officer name</label><input id="cnOn" value="${esc(of.name)}"></div><div><label>Officer phone</label><input id="cnOp" value="${esc(of.phone)}"></div><div><label>Officer email</label><input id="cnOe" value="${esc(of.email)}"></div></div></div>
      <div class="cn-card"><h3>Notice text</h3><div class="cn-note">Use {school} and {officer} where the name should appear. Changing the notice or the tick boxes asks every parent to answer again.</div><div class="cn-f" style="margin-top:8px">
        <div class="full"><label>English</label><textarea id="cnNe" rows="9">${esc(cfg.noticeEn)}</textarea></div><div class="full"><label>తెలుగు</label><textarea id="cnNt" rows="9">${esc(cfg.noticeTe)}</textarea></div></div></div>
      <div class="cn-card"><h3>Tick boxes</h3><div class="cn-note">The first box is always needed to agree. The others are optional for the parent.</div>
        ${(cfg.purposes || []).map((x, i) => `<div class="cn-f" style="margin-top:8px"><div><label>${i === 0 ? 'Required box (English)' : 'Optional box (English)'}</label><input data-pe="${i}" value="${esc(x.label)}"></div><div><label>తెలుగు</label><input data-pt="${i}" value="${esc(x.labelTe)}"></div></div>`).join('')}</div>
      <div class="cn-row"><button class="btn btn-primary" id="cnSave">Save settings</button><label style="font-size:.88rem"><input type="checkbox" id="cnReask"> Ask every parent again (new notice version)</label></div>`;
    $('cnToggle').onclick = async () => {
      if(!cfg.enabled && !confirm('Switch consent ON now? Every parent will see the notice the next time they open the app.')) return;
      cfg.enabled = !cfg.enabled; await save(false);
    };
    $('cnSave').onclick = () => save(true);
  }
  function gather(){
    const g = id => ($(id) || {}).value;
    const out = Object.assign({}, cfg, { mode: g('cnMode') || cfg.mode, maxSkips: parseInt(g('cnSkips'), 10) || cfg.maxSkips, startDate: g('cnStart') || '',
      school: { name: g('cnSn') || '', address: g('cnSa') || '' }, officer: { name: g('cnOn') || '', phone: g('cnOp') || '', email: g('cnOe') || '' }, noticeEn: g('cnNe') || cfg.noticeEn, noticeTe: g('cnNt') || cfg.noticeTe });
    out.purposes = cfg.purposes.map((x, i) => { const e = document.querySelector(`[data-pe="${i}"]`), t = document.querySelector(`[data-pt="${i}"]`); return Object.assign({}, x, { label: e ? e.value : x.label, labelTe: t ? t.value : x.labelTe }); });
    return out;
  }
  async function save(fromForm){
    if(busy) return; busy = true;
    try{
      const body = fromForm ? gather() : Object.assign({}, cfg, { enabled: cfg.enabled });
      if(!fromForm && $('cnMode')) Object.assign(body, gather(), { enabled: cfg.enabled });
      try{ if(typeof schoolInfo !== 'undefined' && schoolInfo){ body.school = Object.assign({}, body.school); if(!body.school.name) body.school.name = schoolInfo.name || ''; if(!body.school.address) body.school.address = schoolInfo.address || ''; body.officer = Object.assign({}, body.officer); if(!body.officer.phone) body.officer.phone = schoolInfo.phone || ''; if(!body.officer.email) body.officer.email = schoolInfo.email || ''; } }catch(e){}
      body.enabled = cfg.enabled; if($('cnReask') && $('cnReask').checked) body.reaskAll = true;
      cfg = await api('PUT', '/api/consent/settings', body); st = null; toast('Saved.'); await load(); render();
    }catch(e){ toast(e.message); } busy = false;
  }

  /* dashboard reminder card for Admin / Principal */
  async function dashCard(){
    if(!isMgr()) return;
    try{
      const v = $('view-dashboard'); if(!v || v.style.display === 'none') return;
      const old = $('cnDash'); if(old) old.remove();
      const j = await api('GET', '/api/consent/status'); if(!j.enabled) return;
      const open = (j.count.pending || 0) + (j.count.outdated || 0); if(!open) return;
      css();
      const d = document.createElement('div'); d.id = 'cnDash'; d.className = 'cn-card'; d.style.cssText = 'border-left:6px solid #e0a100;display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap';
      d.innerHTML = `<span><b>Privacy consent:</b> ${open} of ${j.total} children have not been answered for yet.</span><button class="btn btn-secondary" onclick="switchView('privacyconsent')">Open the monitor</button>`;
      const top = v.querySelector('.topbar'); if(top) top.insertAdjacentElement('afterend', d); else v.insertBefore(d, v.firstChild);
    }catch(e){}
  }
  if(typeof window.renderDashboard === 'function'){
    const o = window.renderDashboard;
    window.renderDashboard = async function(){ const r = await o.apply(this, arguments); setTimeout(dashCard, 50); return r; };
  }

  /* ===================================================================== WIRING ===== */
  const origSwitch = window.switchView;
  window.switchView = function(view){
    try{ if(isParent()) setTimeout(checkParent, 600); else { ensureShell(); probeTeacher(); } }catch(e){}
    if(view !== 'privacyconsent' || (!isMgr() && role() !== 'Teacher')){
      const r = origSwitch.apply(this, arguments);
      const v = $('view-privacyconsent'); if(v) v.style.display = 'none';
      const n = $('navPrivacyConsent'); if(n) n.classList.remove('active');
      if(view === 'dashboard') setTimeout(dashCard, 400);
      return r;
    }
    const root = $('view-dashboard') ? $('view-dashboard').parentNode : null;
    if(root) Array.from(root.children).forEach(c => { if(c.id && c.id.indexOf('view-') === 0 && c.id !== 'view-privacyconsent') c.style.display = 'none'; });
    document.querySelectorAll('.sb-link.active').forEach(b => b.classList.remove('active'));
    const n = $('navPrivacyConsent'); if(n) n.classList.add('active');
    $('view-privacyconsent').style.display = 'block';
    try{ closeMobileSidebar(); }catch(e){}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    st = null; cfg = null; sel.clear(); render();
  };
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){
      const r = o.apply(this, arguments);
      try{
        if(isMgr()){ ensureShell(); const n = $('navPrivacyConsent'); if(n) n.style.display = 'flex'; }
        else { const n = $('navPrivacyConsent'); if(n && role() !== 'Teacher') n.remove(); const v = $('view-privacyconsent'); if(v && role() !== 'Teacher') v.style.display = 'none'; }
        if(isParent()){ checkedOnce = false; me = null; setTimeout(checkParent, 800); }
        if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility();
      }catch(e){}
      return r;
    };
  }
})();
