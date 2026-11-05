/* =========================================================================
   Admit Cards: (1) printing works even when the browser blocks pop-up windows, and
   (2) an optional "hold the admit card while fees are due" rule that the Admin or Principal
   can switch on, with a recorded exception ("Allow") for individual students.

   Nothing about how admit cards or room allotment are built or printed is changed. The rule is OFF
   until an Admin/Principal turns it on (Manage Exams > Admit Cards). When it is on:
     - a student whose fee due is above the limit set there cannot be printed until the Admin or
       Principal presses "Allow" and gives a reason (kept on record with name, role, date and amount);
     - "Print All" skips held students and says how many it skipped;
     - roles that cannot see fees (e.g. teachers) cannot print while the rule is on.
   ========================================================================= */
(function(){
  'use strict';
  const POL = 'admit-card-policy', EXC = 'admit-card-exceptions';
  try{ OBJECT_BACKED_KEYS[POL] = '/api/kv/' + POL; OBJECT_BACKED_KEYS[EXC] = '/api/kv/' + EXC; }catch(e){}
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isMgr = () => { try{ return !!currentUser && ['Admin', 'Principal'].includes(currentUser.role); }catch(e){ return false; } };
  const hasFees = () => { try{ return getRoleViews(currentUser.role).includes('managefee'); }catch(e){ return false; } };
  const money = n => { try{ return fmtMoney(n); }catch(e){ return '₹' + (Number(n) || 0).toLocaleString('en-IN'); } };
  const fdate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear(); };

  /* ---------- 1. printing without pop-ups ---------- */
  function frameWindow(){
    let buf = '';
    return {
      document: {
        write(h){ buf += h; }, writeln(h){ buf += h + '\n'; },
        close(){
          const f = document.createElement('iframe');
          f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
          document.body.appendChild(f);
          f.onload = () => { try{ if(!/window\.print\(\)/.test(buf)){ f.contentWindow.focus(); f.contentWindow.print(); } }catch(e){} setTimeout(() => f.remove(), 120000); };
          f.srcdoc = buf;
        }
      },
      focus(){}, close(){}, print(){}
    };
  }
  function withPrintFallback(fn){
    if(typeof fn !== 'function') return fn;
    return function(){
      const real = window.open;
      window.open = function(){ let w = null; try{ w = real.apply(window, arguments); }catch(e){} return w || frameWindow(); };
      try{ return fn.apply(this, arguments); } finally{ window.open = real; }
    };
  }
  ['printAdmitCards', 'printAdmitCardPairs', 'printFinalRoomAllotment', 'printNoticeBoard'].forEach(n => { if(typeof window[n] === 'function') window[n] = withPrintFallback(window[n]); });

  /* ---------- 2. fee hold ---------- */
  let policy = { hold: false, minDue: 0 }, exc = {};
  async function load(){
    try{
      const p = await storageGet(POL, {}), e = await storageGet(EXC, {});
      policy = { hold: !!(p && p.hold), minDue: Math.max(Number(p && p.minDue) || 0, 0) };
      exc = (e && typeof e === 'object' && !Array.isArray(e)) ? e : {};
    }catch(err){}
  }
  const keyOf = (examId, sid) => examId + '|' + sid;
  function dueOf(s){ try{ return Math.round(computeStudentFinance(s).totals.receivable || 0); }catch(e){ return 0; } }
  const isHeld = (examId, s) => policy.hold && !exc[keyOf(examId, s.id)] && dueOf(s) > policy.minDue;
  const listFor = (cls, sec) => students.filter(s => s.className === cls && s.section === sec && isActive(s));

  async function savePolicy(){
    const hold = !!$('acHoldOn').checked, minDue = Math.max(Number($('acMinDue').value) || 0, 0);
    try{ await load(); policy = { hold, minDue }; await storageSet(POL, policy); showToast(hold ? 'Fee hold is ON for admit cards.' : 'Fee hold is OFF — admit cards print for everyone.'); }
    catch(e){ showToast('Could not save: ' + (e && e.message || 'try again')); }
    renderResultBody();
  }
  window.acSavePolicy = savePolicy;

  window.acAllow = async function(sid){
    const s = students.find(x => x.id === sid); if(!s) return;
    const examId = admitCardsExamId, due = dueOf(s);
    const reason = await showPromptDialog(s.lastName + ' ' + s.firstName + ' has ' + money(due) + ' fee due. Why is the admit card being issued? (This is kept on record.)', { title: 'Allow admit card', okText: 'Allow', placeholder: 'e.g. Parent requested — will pay by 15th' });
    if(reason === null) return;
    if(!reason){ showToast('Please write a short reason.'); return; }
    try{
      await load();
      exc[keyOf(examId, sid)] = { by: currentUser.name, role: currentUser.role, at: new Date().toISOString(), reason: reason.slice(0, 300), due };
      await storageSet(EXC, exc);
      showToast('Admit card allowed for ' + s.firstName + '.');
    }catch(e){ showToast('Could not save: ' + (e && e.message || 'try again')); }
    renderResultBody();
  };
  window.acWithdraw = async function(sid){
    const s = students.find(x => x.id === sid); if(!s) return;
    if(!await showConfirmDialog('Withdraw the permission for ' + s.lastName + ' ' + s.firstName + '? Their admit card will be on hold again while fees are due.', { title: 'Withdraw permission', okText: 'Withdraw' })) return;
    try{ await load(); delete exc[keyOf(admitCardsExamId, sid)]; await storageSet(EXC, exc); showToast('Permission withdrawn.'); }
    catch(e){ showToast('Could not save: ' + (e && e.message || 'try again')); }
    renderResultBody();
  };

  window.acPrintAll = async function(cls, sec){
    await load();
    if(policy.hold && !hasFees()){ showToast('While the fee hold is on, admit cards are printed by roles that can see fees.'); return; }
    const exam = admitCardsExamId;
    const held = policy.hold ? listFor(cls, sec).filter(s => isHeld(exam, s)) : [];
    if(held.length){
      await showInfoDialog(held.length + ' student' + (held.length === 1 ? ' is' : 's are') + ' on hold because fees are due and will be skipped:\n' + held.slice(0, 8).map(s => '• ' + s.lastName + ' ' + s.firstName).join('\n') + (held.length > 8 ? '\n…and ' + (held.length - 8) + ' more' : '') + (isMgr() ? '\n\nUse "Allow" next to a name to include them.' : '\n\nAsk the Admin or Principal to allow them.'), { title: 'Some admit cards are on hold' });
      const ids = new Set(held.map(s => s.id)), saved = students;
      students = students.filter(s => !ids.has(s.id));
      try{ window.printAdmitCards(cls, sec, null); } finally{ students = saved; }
      return;
    }
    window.printAdmitCards(cls, sec, null);
  };

  // Printing several classes/sections at once (Admit Cards screen): same fee-hold rule as printing one section.
  window.acPrintPairsGuarded = async function(pairs){
    await load();
    if(policy.hold && !hasFees()){ showToast('While the fee hold is on, admit cards are printed by roles that can see fees.'); return; }
    const exam = admitCardsExamId;
    const held = policy.hold ? pairs.reduce((a, p) => a.concat(listFor(p.cls, p.sec)), []).filter(s => isHeld(exam, s)) : [];
    if(held.length){
      await showInfoDialog(held.length + ' student' + (held.length === 1 ? ' is' : 's are') + ' on hold because fees are due and will be skipped:\n' + held.slice(0, 8).map(s => '• ' + s.lastName + ' ' + s.firstName).join('\n') + (held.length > 8 ? '\n…and ' + (held.length - 8) + ' more' : '') + (isMgr() ? '\n\nOpen the class and use "Allow" next to a name to include them.' : '\n\nAsk the Admin or Principal to allow them.'), { title: 'Some admit cards are on hold' });
      const ids = new Set(held.map(s => s.id)), saved = students;
      students = students.filter(s => !ids.has(s.id));
      try{ window.printAdmitCardPairs(pairs); } finally{ students = saved; }
      return;
    }
    window.printAdmitCardPairs(pairs);
  };

  async function decorateGrid(body){
    await load();
    if(admitCardsView !== 'grid' || !body.isConnected) return;
    $('acPolicyCard') && $('acPolicyCard').remove();
    let html;
    if(isMgr()){
      html = `<div id="acPolicyCard" class="profile-card" style="margin:0 0 16px; padding:14px 16px; max-width:760px;">
        <h4 style="margin:0 0 6px;">Fee rule for admit cards</h4>
        <label style="display:flex; gap:8px; align-items:center; font-size:.92rem;"><input type="checkbox" id="acHoldOn" style="width:auto;" ${policy.hold ? 'checked' : ''}> Hold the admit card of a student whose fees are due</label>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:10px 0 6px; font-size:.88rem;">Ignore dues up to ₹ <input class="input" id="acMinDue" type="number" min="0" step="1" value="${policy.minDue}" style="width:120px;"> <button class="btn btn-primary btn-sm" onclick="acSavePolicy()">Save</button></div>
        <p style="margin:6px 0 0; font-size:.78rem; color:var(--ink-soft);">When this is on, you (Admin or Principal) can still allow any student: open the class, press <b>Allow</b> beside the name and write a reason. Every permission is kept on record with who allowed it and when. Off by default.</p></div>`;
    }else if(policy.hold){
      html = `<div id="acPolicyCard" class="profile-card" style="margin:0 0 16px; padding:12px 16px; max-width:760px; font-size:.88rem;">🔒 Admit cards are on hold for students with fees due. The Admin or Principal can allow exceptions.</div>`;
    }
    if(html) body.insertAdjacentHTML('afterbegin', html);
  }

  async function decorateRoster(body){
    await load();
    if(admitCardsView !== 'roster' || !body.isConnected) return;
    const exam = admitCardsExamId, cls = admitCardsClass, sec = admitCardsSection;
    const table = body.querySelector('table'); if(!table) return;
    const note = policy.hold
      ? `<div style="margin:0 0 12px; font-size:.85rem; color:var(--ink-soft);">🔒 Fee hold is ON${policy.minDue ? ' (dues up to ' + money(policy.minDue) + ' are ignored)' : ''}. ${isMgr() ? 'Press <b>Allow</b> to issue a card to a student with dues.' : 'Only the Admin or Principal can allow an exception.'}</div>` : '';
    if(note) table.closest('.table-wrap').insertAdjacentHTML('beforebegin', note);
    if(!policy.hold) return;
    const feeOk = hasFees();
    if(feeOk) await ensureDataLoaded('payments', loadPaymentsData);
    const list = listFor(cls, sec);
    const headRow = table.querySelector('thead tr'); headRow.insertAdjacentHTML('beforeend', '<th>Fees</th>');
    const bodyRows = [...table.querySelectorAll('tbody tr')];
    bodyRows.forEach(tr => {
      const adm = (tr.querySelector('.id-cell') || {}).textContent;
      const s = list.find(x => String(x.admissionNo) === String(adm));
      const printBtn = tr.querySelector('.btn-edit-text');
      let cell = '—';
      if(s){
        if(!feeOk){
          cell = '<span style="color:var(--ink-soft); font-size:.8rem;">Checked by the office</span>';
          if(printBtn){ printBtn.disabled = true; printBtn.style.opacity = '.4'; printBtn.style.cursor = 'not-allowed'; printBtn.title = 'Fee hold is on — printing is done by roles that can see fees.'; }
        }else{
          const due = dueOf(s), ex = exc[keyOf(exam, s.id)];
          if(ex){
            cell = `<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Allowed</span><div style="font-size:.74rem; color:var(--ink-soft); max-width:240px;">${esc(ex.by)} (${esc(ex.role)}), ${fdate(ex.at)} — due was ${money(ex.due)}: “${esc(ex.reason)}”</div>${isMgr() ? `<button class="btn-edit-text" onclick="acWithdraw('${s.id}')">Withdraw</button>` : ''}`;
          }else if(due > policy.minDue){
            cell = `<span class="balance-tag due">On hold — ${money(due)} due</span> ${isMgr() ? `<button class="btn-edit-text" onclick="acAllow('${s.id}')">Allow</button>` : ''}`;
            if(printBtn){ printBtn.disabled = true; printBtn.style.opacity = '.4'; printBtn.style.cursor = 'not-allowed'; printBtn.title = 'Fees are due — the Admin or Principal can allow this card.'; }
          }else{
            cell = '<span class="pill" style="background:rgba(24,143,134,0.15); color:#0f6a63;">Fees clear</span>';
          }
        }
      }
      tr.insertAdjacentHTML('beforeend', '<td>' + cell + '</td>');
    });
    const all = [...body.querySelectorAll('button')].find(b => /Print All Admit Cards/.test(b.textContent));
    if(all){ all.setAttribute('onclick', `acPrintAll('${cls}','${sec}')`); if(!feeOk) all.disabled = true; }
  }

  const origGrid = window.renderAdmitCardsGrid;
  if(typeof origGrid === 'function') window.renderAdmitCardsGrid = function(body){ const r = origGrid.apply(this, arguments); decorateGrid(body).catch(() => {}); return r; };
  const origRoster = window.renderAdmitCardsRoster;
  if(typeof origRoster === 'function') window.renderAdmitCardsRoster = function(body){ const r = origRoster.apply(this, arguments); decorateRoster(body).catch(() => {}); return r; };

  /* ---------- 3. message for students and parents ---------- */
  // Shown on the Home and Fees tabs of a Student/Parent login while the fee hold is ON and fees are due.
  const Lp = (en, te) => (typeof window.portalT === 'function') ? window.portalT(en, te) : en;
  const isPortalUser = () => { try{ return !!currentUser && /^(Student|Parent)$/i.test(currentUser.role); }catch(e){ return false; } };
  let bannerBusy = false;
  async function ensureBanner(){
    if(bannerBusy || !isPortalUser() || typeof myProfileStudent !== 'function') return;
    bannerBusy = true;
    try{
      const host = $('myProfileBody'), s = myProfileStudent(); if(!host || !s) return;
      const act = document.querySelector('[id^=mptab-].active'); const tab = act ? act.id.replace('mptab-', '') : '';
      const old = $('acHoldBanner');
      if(tab !== 'home' && tab !== 'fees'){ if(old) old.remove(); return; }
      if(old) return;
      let pol = {}; try{ const r = await fetch('/api/kv/admit-card-policy', { credentials: 'include' }); if(r.ok) pol = await r.json(); }catch(e){}
      if(!pol || !pol.hold) return;
      await ensureDataLoaded('payments', loadPaymentsData);
      const due = Math.round(computeStudentFinance(s).totals.receivable || 0);
      if(due <= (Number(pol.minDue) || 0)) return;
      let allowedIds = []; try{ const r = await fetch('/api/my-admit-card-status', { credentials: 'include' }); if(r.ok) allowedIds = (await r.json()).allowedExamIds || []; }catch(e){}
      try{ await ensureDataLoaded('exams', loadExams); }catch(e){}
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (examDefs || []).filter(e => (e.endDate || e.startDate || '') >= today && (e.startDate || e.endDate));
      // the child's own exams first (an exam only for other classes must not be named on this child's banner)
      const forChild = upcoming.filter(e => e.classSubjects && Object.keys(e.classSubjects).some(k => String(k).split('||')[0] === s.className));
      const next = (forChild.length ? forChild : upcoming).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))[0];
      if(!$('myProfileBody') || $('acHoldBanner')) return;
      const approved = next && allowedIds.includes(next.id);
      const html = approved
        ? `<div id="acHoldBanner" style="margin:0 0 14px; padding:14px 16px; border-radius:14px; background:#e5f6ec; border:1px solid #bfe3cc; color:#17603a; font-size:.92rem;"><b>✅ ${Lp('Hall ticket approved', 'హాల్ టికెట్ ఆమోదించబడింది')}</b><br>${Lp('The school has approved your hall ticket for ' + esc(next.name) + '. Please collect it from your class teacher. Fee due ' + money(due) + ' is still pending — please clear it soon.', esc(next.name) + ' కోసం మీ హాల్ టికెట్‌ను పాఠశాల ఆమోదించింది. క్లాస్ టీచర్ నుండి తీసుకోండి. ఫీజు బకాయి ' + money(due) + ' ఇంకా ఉంది — త్వరగా చెల్లించండి.')}</div>`
        : `<div id="acHoldBanner" style="margin:0 0 14px; padding:14px 16px; border-radius:14px; background:#fff3e0; border:1px solid #ffd9a6; color:#8a4b00; font-size:.92rem;"><b>🎫 ${Lp('Hall ticket on hold — fee due ' + money(due), 'హాల్ టికెట్ నిలిపివేయబడింది — ఫీజు బకాయి ' + money(due))}</b><br>${Lp('Please pay the pending fee to receive your hall ticket' + (next ? ' for ' + esc(next.name) + ' (from ' + esc(next.startDate || next.endDate) + ')' : '') + '. You can pay online in the Fees tab or at the school office. If you need more time, please meet the Principal.', 'హాల్ టికెట్ పొందడానికి బకాయి ఫీజును చెల్లించండి' + (next ? ' (' + esc(next.name) + ', ' + esc(next.startDate || next.endDate) + ' నుండి)' : '') + '. ఫీజుల ట్యాబ్‌లో ఆన్‌లైన్‌లో లేదా పాఠశాల కార్యాలయంలో చెల్లించవచ్చు. మరింత సమయం కావాలంటే ప్రిన్సిపాల్‌ను కలవండి.')}</div>`;
      host.insertAdjacentHTML('afterbegin', html);
    }catch(e){} finally{ bannerBusy = false; }
  }
  ['renderMyProfileBody', 'switchMyProfileTab'].forEach(n => {
    const o = window[n]; if(typeof o !== 'function') return;
    window[n] = function(){ const r = o.apply(this, arguments); setTimeout(ensureBanner, 700); setTimeout(ensureBanner, 2000); return r; };
  });
})();
