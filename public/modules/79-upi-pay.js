/* ============================================================================
   Pay fees by UPI (school QR) with office verification
   * Parent / student: "Pay by UPI" on the Fees tab. Shows the school QR and UPI ID, then the parent sends the 12-digit UTR,
     date, amount and (optionally required) a screenshot. NOTHING is marked paid until the office has seen the money in the bank.
   * Admin / Principal / Accountant: "UPI Payments" page. Check each claim, paste the bank statement to match UTRs and amounts
     automatically, approve (a normal fee receipt is issued) or reject with a reason the parent sees.
   * Admin / Principal: settings (UPI ID, QR image, ON/OFF, screenshot rule) and the UPI charge rule with its change history.
   ========================================================================== */
(function(){
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => { try { return currentUser ? currentUser.role : ''; } catch(e){ return ''; } };
  const isParent = () => ['Student', 'Parent'].includes(role());
  const isStaff = () => ['Admin', 'Principal', 'Accountant'].includes(role());
  const isMgr = () => ['Admin', 'Principal'].includes(role());
  const toast = m => { try{ showToast(m); }catch(e){ console.log(m); } };
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const today = () => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const dmy = v => { if(!v) return ''; const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1] : ''; };
  const dt = v => { if(!v) return ''; const d = new Date(v); if(isNaN(d)) return ''; const p = n => String(n).padStart(2, '0'); return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
  async function api(method, url, body){
    const r = await fetch(url, { method, credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    let j = null; try{ j = await r.json(); }catch(e){}
    if(!r.ok){ const err = new Error((j && j.error) || 'Something went wrong'); err.status = r.status; err.data = j; throw err; }
    return j;
  }
  function calcCharge(fee, c, onDate){
    c = c || {}; fee = Number(fee) || 0;
    if(!c.mode || c.mode === 'none' || fee <= 0) return 0;
    if(c.effectiveFrom && onDate && String(onDate) < c.effectiveFrom) return 0;
    if(Number(c.freeUpTo) > 0 && fee <= Number(c.freeUpTo)) return 0;
    let v = c.mode === 'percent' ? fee * (Number(c.percent) || 0) / 100 : (Number(c.flat) || 0);
    if(Number(c.min) > 0) v = Math.max(v, Number(c.min));
    if(Number(c.max) > 0) v = Math.min(v, Number(c.max));
    return Math.round(v * 100) / 100;
  }
  const FLAGS = { no_screenshot: 'No screenshot', older_payment: 'Payment is a few days old', amount_differs: 'Amount differs from fee + charge', similar_claim: 'Similar claim already exists',
    same_amount_recorded: 'Same amount already recorded that day', many_claims: 'Many claims in 7 days' };
  const STATUS = { submitted: ['Waiting for the office', '#8a5a00', '#fff3d6'], approved: ['Paid and receipted', '#17703a', '#e1f5e8'], rejected: ['Could not be matched', '#b3261e', '#fde4e1'], cancelled: ['Withdrawn', '#556', '#eceff5'] };
  const chip = s => { const x = STATUS[s] || [s, '#556', '#eceff5']; return `<span class="up-chip" style="color:${x[1]};background:${x[2]}">${esc(x[0])}</span>`; };

  function css(){
    if($('upCss')) return;
    const s = document.createElement('style'); s.id = 'upCss';
    s.textContent = `
      .up-ov{position:fixed;inset:0;z-index:99990;background:rgba(20,16,50,.65);display:flex;align-items:center;justify-content:center;padding:12px;}
      .up-box{background:#fff;border-radius:18px;max-width:560px;width:100%;max-height:94vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 80px -20px rgba(0,0,0,.55);}
      .up-head{padding:14px 18px;background:linear-gradient(135deg,#0f4c81,#1c7ed6);color:#fff;display:flex;justify-content:space-between;gap:10px;align-items:center;font-weight:700;}
      .up-head button{background:transparent;border:0;color:#fff;font-size:1.4rem;cursor:pointer;line-height:1;}
      .up-body{padding:14px 18px;overflow:auto;flex:1;} .up-foot{padding:12px 18px;border-top:1px solid #eef1f7;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;background:#fbfcff;}
      .up-btn{border:0;border-radius:11px;padding:10px 16px;font:inherit;font-weight:700;cursor:pointer;font-size:.9rem;background:#eef1f7;color:#334;} .up-btn.go{background:#17703a;color:#fff;} .up-btn.bl{background:#1c7ed6;color:#fff;} .up-btn.no{background:#fde4e1;color:#b3261e;} .up-btn:disabled{opacity:.5;cursor:not-allowed;}
      .up-card{background:#fff;border:1px solid var(--border,#e3e8f3);border-radius:16px;padding:14px 16px;margin-bottom:14px;}
      .up-card h3{margin:0 0 10px;font-size:1.02rem;color:var(--navy,#14325c);display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;}
      .up-chip{font-weight:700;font-size:.74rem;padding:3px 10px;border-radius:999px;white-space:nowrap;display:inline-block;}
      .up-line{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid #dfe5f1;border-radius:11px;margin-bottom:6px;} .up-line span{flex:1;font-size:.9rem;} .up-line input[type=number]{width:110px;padding:6px;border:1px solid #cfd6e6;border-radius:8px;font:inherit;}
      .up-sum{background:#f4f7fd;border-radius:12px;padding:10px 12px;margin:10px 0;font-size:.92rem;} .up-sum div{display:flex;justify-content:space-between;padding:2px 0;} .up-sum .t{font-weight:800;font-size:1.08rem;border-top:1px dashed #b9c4dc;margin-top:4px;padding-top:6px;}
      .up-qr{text-align:center;margin:8px 0;} .up-qr img{max-width:230px;width:100%;border:1px solid #e3e8f3;border-radius:12px;padding:6px;background:#fff;}
      .up-id{display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;font-weight:700;margin:6px 0;} .up-id code{background:#eef4ff;padding:5px 10px;border-radius:8px;font-size:.98rem;}
      .up-warn{background:#fff6e0;border:1px solid #f0d28a;color:#6b4a00;border-radius:11px;padding:9px 11px;font-size:.84rem;line-height:1.45;margin:8px 0;}
      .up-ok{background:#e8f6ee;border:1px solid #b7e0c5;color:#14572f;border-radius:11px;padding:9px 11px;font-size:.84rem;margin:8px 0;}
      .up-f{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;} .up-f label{display:block;font-size:.78rem;color:#667;margin-bottom:3px;} .up-f input,.up-f select,.up-f textarea{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cfd6e6;border-radius:10px;font:inherit;}
      .up-tbl{width:100%;border-collapse:collapse;font-size:.86rem;} .up-tbl th,.up-tbl td{text-align:left;padding:8px 6px;border-top:1px solid #eef1f7;vertical-align:top;} .up-tbl th{font-size:.72rem;color:#667;text-transform:uppercase;}
      .up-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px;} .up-tile{background:#f4f7fd;border-radius:12px;padding:10px 12px;} .up-tile b{display:block;font-size:1.3rem;color:#14325c;} .up-tile span{font-size:.78rem;color:#667;}
      .up-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;} .up-flag{display:inline-block;background:#fde8d0;color:#8a4300;border-radius:8px;padding:2px 8px;font-size:.72rem;font-weight:600;margin:2px 3px 0 0;}
      .up-mt{font-size:.74rem;font-weight:700;border-radius:8px;padding:2px 8px;} .up-mt.m{background:#e1f5e8;color:#17703a;} .up-mt.d{background:#fff3d6;color:#8a5a00;} .up-mt.n{background:#fde4e1;color:#b3261e;}
      .up-note{font-size:.82rem;color:#667;line-height:1.45;} .up-shot{max-width:100%;max-height:300px;border-radius:10px;border:1px solid #dfe5f1;margin-top:6px;}
    `;
    document.head.appendChild(s);
  }
  function modal(title, bodyHtml, footHtml){
    css(); closeModal();
    const o = document.createElement('div'); o.className = 'up-ov'; o.id = 'upModal';
    o.innerHTML = `<div class="up-box"><div class="up-head"><span>${esc(title)}</span><button type="button" id="upX" aria-label="Close">×</button></div><div class="up-body">${bodyHtml}</div><div class="up-foot">${footHtml || ''}</div></div>`;
    document.body.appendChild(o); $('upX').onclick = closeModal; return o;
  }
  function closeModal(){ const o = $('upModal'); if(o) o.remove(); }

  /* ===================================================================== PARENT SIDE ===== */
  let pset = null, pmine = [];
  async function loadParent(){
    try{ pset = await api('GET', '/api/upi/settings'); }catch(e){ pset = { enabled: false }; }
    try{ pmine = pset.enabled ? await api('GET', '/api/upi/mine') : []; }catch(e){ pmine = []; }
  }
  function mineHtml(){
    if(!pmine.length) return '';
    return `<table class="up-tbl"><thead><tr><th>Sent</th><th>Amount</th><th>UTR</th><th>Status</th></tr></thead><tbody>${pmine.slice(0, 8).map(c => `<tr><td>${dt(c.createdAt)}</td><td>${money(c.paidTotal)}</td><td>${esc(c.utr)}</td>
      <td>${chip(c.status)}${c.status === 'approved' ? `<div class="up-note">Receipt ${esc((c.receiptNos || []).join(', '))}</div>` : ''}${c.status === 'rejected' ? `<div class="up-note" style="color:#b3261e">${esc(c.rejectReason)}</div>` : ''}
      ${c.status === 'submitted' ? `<div><a href="#" data-cancel="${esc(c.id)}" style="font-size:.78rem">Withdraw</a></div>` : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  async function mountParentCard(body, s){
    if(!body || !s || !isParent()) return;
    css(); await loadParent();
    if(!pset || !pset.enabled || !body.isConnected) return;
    let card = body.querySelector('#upParentCard'); if(card) card.remove();
    card = document.createElement('div'); card.id = 'upParentCard'; card.className = 'up-card';
    const chg = pset.charge && pset.charge.mode !== 'none' ? `<div class="up-note">A ${esc(pset.charge.label || 'UPI charge')} applies to UPI payments${pset.charge.freeUpTo ? ' above ' + money(pset.charge.freeUpTo) : ''}${pset.charge.reason ? ' (' + esc(pset.charge.reason) + ')' : ''}. You will see it before you pay.</div>` : '';
    card.innerHTML = `<h3><span>📲 Pay by UPI</span><button class="up-btn bl" id="upPayBtn">Pay by UPI</button></h3>
      <div class="up-note">${pset.qr ? 'Scan the school QR with any UPI app' : 'Pay to the school UPI ID with any UPI app'}, then send us the payment reference (UTR). The office checks the bank and issues your receipt.</div>${chg}
      ${pmine.length ? `<div style="margin-top:10px"><b style="font-size:.9rem">My UPI payments</b>${mineHtml()}</div>` : ''}`;
    body.insertBefore(card, body.firstChild);
    $('upPayBtn').onclick = () => openPay(s);
    card.querySelectorAll('[data-cancel]').forEach(a => a.onclick = async ev => {
      ev.preventDefault(); if(!confirm('Withdraw this payment? Only do this if you have not actually paid.')) return;
      try{ await api('POST', '/api/upi/claims/' + a.dataset.cancel + '/cancel'); toast('Withdrawn.'); mountParentCard(body, s); }catch(e){ toast(e.message); }
    });
  }
  function openPay(s){
    let rows = []; try{ rows = computePendingFeeRows(s).pendingRows; }catch(e){}
    if(!rows.length){ toast('There are no pending fees to pay.'); return; }
    const refCode = 'RF' + Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
    const items = rows.map(r => ({ type: r.type, key: r.key, label: r.label, due: Math.round((r.outstanding + r.lateFee) * 100) / 100, on: false, amount: Math.round((r.outstanding + r.lateFee) * 100) / 100 }));
    modal('Pay by UPI', `<div id="upStep"></div>`, '');
    const state = { step: 1, shot: '' };
    const sel = () => items.filter(i => i.on && i.amount > 0);
    const fee = () => Math.round(sel().reduce((t, i) => t + i.amount, 0) * 100) / 100;
    const chargeNow = () => calcCharge(fee(), pset.charge, today());
    function step1(){
      $('upStep').innerHTML = `<div class="up-note" style="margin-bottom:8px">Choose what you are paying for. You can pay part of a fee.</div>
        ${items.map((i, n) => `<div class="up-line"><input type="checkbox" data-c="${n}" ${i.on ? 'checked' : ''}><span>${esc(i.label)}<br><small style="color:#667">Due ${money(i.due)}</small></span><input type="number" min="1" max="${i.due}" step="0.01" data-a="${n}" value="${i.amount}"></div>`).join('')}
        <div class="up-sum" id="upSum"></div>`;
      document.querySelector('#upModal .up-foot').innerHTML = `<button class="up-btn" id="upCancel">Cancel</button><button class="up-btn bl" id="upNext">Next: how to pay</button>`;
      $('upCancel').onclick = closeModal;
      const sum = () => {
        const f = fee(), c = chargeNow();
        $('upSum').innerHTML = `<div><span>Fee</span><b>${money(f)}</b></div>${c ? `<div><span>${esc(pset.charge.label || 'UPI charge')}</span><b>${money(c)}</b></div>` : ''}<div class="t"><span>Amount to pay</span><span>${money(f + c)}</span></div>`;
        $('upNext').disabled = f <= 0;
      };
      document.querySelectorAll('#upStep [data-c]').forEach(x => x.onchange = () => { items[x.dataset.c].on = x.checked; sum(); });
      document.querySelectorAll('#upStep [data-a]').forEach(x => x.oninput = () => { const i = items[x.dataset.a]; let v = Number(x.value); if(!(v > 0)) v = 0; if(v > i.due) v = i.due; i.amount = Math.round(v * 100) / 100; sum(); });
      $('upNext').onclick = () => { state.step = 2; step2(); };
      sum();
    }
    function step2(){
      const total = Math.round((fee() + chargeNow()) * 100) / 100;
      const link = 'upi://pay?pa=' + encodeURIComponent(pset.upiId || '') + '&pn=' + encodeURIComponent(pset.payeeName || '') + '&am=' + total.toFixed(2) + '&cu=INR&tn=' + encodeURIComponent('School fee ' + refCode);
      const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      $('upStep').innerHTML = `<div class="up-sum"><div class="t"><span>Pay exactly</span><span>${money(total)}</span></div></div>
        ${pset.qr ? `<div class="up-qr"><img src="${pset.qr}" alt="School UPI QR"></div>` : ''}
        ${pset.upiId ? `<div class="up-id">UPI ID: <code id="upIdTxt">${esc(pset.upiId)}</code><button class="up-btn" id="upCopy">Copy</button></div>` : ''}
        ${pset.payeeName ? `<div class="up-note" style="text-align:center">Name: <b>${esc(pset.payeeName)}</b></div>` : ''}
        <div class="up-warn">In the UPI remarks write <b>${refCode}</b> (it helps the office find your payment). After paying, note the <b>12-digit UTR / reference number</b> from your UPI app, then press "I have paid".</div>
        ${pset.instructions ? `<div class="up-note">${esc(pset.instructions)}</div>` : ''}
        ${mobile && pset.upiId ? `<div style="text-align:center;margin-top:8px"><a class="up-btn bl" style="display:inline-block;text-decoration:none" href="${esc(link)}">Open my UPI app</a></div>` : ''}`;
      document.querySelector('#upModal .up-foot').innerHTML = `<button class="up-btn" id="upBack">Back</button><button class="up-btn go" id="upPaid">I have paid</button>`;
      $('upBack').onclick = step1; $('upPaid').onclick = () => { state.step = 3; step3(total); };
      const cp = $('upCopy'); if(cp) cp.onclick = () => { try{ navigator.clipboard.writeText(pset.upiId); toast('Copied'); }catch(e){} };
    }
    function step3(total){
      $('upStep').innerHTML = `<div class="up-warn"><b>Please be careful.</b> The office will match the UTR and amount with the bank. A wrong or made-up reference will be rejected and your payment will not be recorded.</div>
        <div class="up-f">
          <div><label>UTR / reference (12 digits)</label><input id="upUtr" inputmode="numeric" maxlength="14" placeholder="e.g. 412345678901"></div>
          <div><label>Total amount you paid (₹)</label><input id="upAmt" type="number" step="0.01" value="${total}"></div>
          <div><label>Date paid</label><input id="upDate" type="date" value="${today()}" max="${today()}"></div>
          <div><label>Time (optional)</label><input id="upTime" type="time"></div>
        </div>
        <div style="margin-top:10px"><label class="up-note">Screenshot of the successful payment ${pset.requireScreenshot ? '<b style="color:#b3261e">(required)</b>' : '(recommended)'}</label><input type="file" id="upShot" accept="image/*"><div id="upShotPrev"></div></div>
        <div style="margin-top:10px"><label class="up-note">Note (optional)</label><input id="upNote" maxlength="300" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cfd6e6;border-radius:10px;font:inherit"></div>
        <label style="display:flex;gap:8px;margin-top:12px;font-size:.86rem;align-items:flex-start"><input type="checkbox" id="upSure" style="margin-top:3px"><span>I confirm the UTR and amount above are copied from my UPI app and the money has left my account.</span></label>
        <div id="upErr" style="color:#b3261e;font-size:.86rem;margin-top:8px"></div>`;
      document.querySelector('#upModal .up-foot').innerHTML = `<button class="up-btn" id="upBack2">Back</button><button class="up-btn go" id="upSend">Send for checking</button>`;
      $('upBack2').onclick = step2;
      $('upShot').onchange = async ev => { const f = ev.target.files[0]; state.shot = ''; $('upShotPrev').innerHTML = ''; if(!f) return;
        try{ state.shot = await compress(f); $('upShotPrev').innerHTML = `<img class="up-shot" src="${state.shot}">`; }catch(e){ $('upErr').textContent = 'Could not read that picture.'; } };
      $('upSend').onclick = async () => {
        const err = $('upErr'); err.textContent = '';
        const utr = $('upUtr').value.replace(/\s+/g, '');
        if(!/^\d{12}$/.test(utr)){ err.textContent = 'The UTR must be exactly 12 digits.'; return; }
        if(!$('upSure').checked){ err.textContent = 'Please tick the confirmation.'; return; }
        if(pset.requireScreenshot && !state.shot){ err.textContent = 'Please attach the screenshot.'; return; }
        const btn = $('upSend'); btn.disabled = true;
        try{
          await api('POST', '/api/upi/claims', { studentId: s.id, lines: sel().map(i => ({ type: i.type, key: i.key, label: i.label, amount: i.amount })), utr, paidTotal: Number($('upAmt').value), paidOn: $('upDate').value,
            paidTime: $('upTime').value, note: $('upNote').value, screenshot: state.shot || undefined, refCode });
          modal('Sent', `<div class="up-ok"><b>Thank you.</b> Your payment has been sent to the school office. Your receipt will appear here after they confirm it in the bank, usually within one working day.</div>`, `<button class="up-btn go" id="upDone">OK</button>`);
          $('upDone').onclick = () => { closeModal(); const b = document.getElementById('myProfileBody'); if(b) mountParentCard(b, s); };
        }catch(e){ err.textContent = e.message; btn.disabled = false; }
      };
    }
    step1();
  }
  function compress(file){
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => { const img = new Image(); img.onerror = reject; img.onload = () => {
        const max = 1100, k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); let q = .7, out = c.toDataURL('image/jpeg', q); while(out.length > 450000 && q > .3){ q -= .1; out = c.toDataURL('image/jpeg', q); } resolve(out); };
        img.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }

  /* ===================================================================== STAFF PAGE ===== */
  let data = null, set = null, tab = 'submitted', matchMap = {}, stmt = '', q = '';
  function ensureShell(){
    if(!isStaff()) return; css();
    const dash = $('view-dashboard');
    if(dash && !$('view-upiclaims')){ const v = document.createElement('div'); v.id = 'view-upiclaims'; v.style.display = 'none'; dash.parentNode.insertBefore(v, dash); }
    const anchor = $('navManageFee');
    if(anchor && !$('navUpiClaims')){
      const b = document.createElement('button'); b.className = 'sb-link'; b.id = 'navUpiClaims'; b.setAttribute('onclick', "switchView('upiclaims')");
      b.innerHTML = '<span class="sb-icon-wrap"><svg class="sb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/></svg></span> UPI Payments';
      anchor.insertAdjacentElement('afterend', b);
    }
  }
  async function loadStaff(){
    try{ data = await api('GET', '/api/upi/claims?status=' + (tab === 'settings' ? 'submitted' : tab)); }catch(e){ data = null; toast(e.message); }
    try{ set = await api('GET', '/api/upi/settings'); }catch(e){ set = null; }
  }
  async function renderStaff(){
    const v = $('view-upiclaims'); if(!v) return;
    await loadStaff();
    const c = (data && data.counts) || {}, n = k => (c[k] ? c[k].n : 0); try{ badge(n('submitted')); lastWaiting = n('submitted'); titleCount(n('submitted')); }catch(e){}
    v.innerHTML = `<div class="topbar"><div><h1>UPI Payments</h1><p style="margin:0;color:#667">Parents pay with the school QR and send the UTR. Check each one against the bank, then approve to issue the receipt.</p></div></div>
      ${set && !set.enabled ? `<div class="up-warn">UPI payment is <b>OFF</b>. Parents cannot see it yet.${isMgr() ? ' Open the Settings tab to add the QR and UPI ID and switch it on.' : ''}</div>` : ''}
      <div class="up-tiles"><div class="up-tile"><b>${n('submitted')}</b><span>Waiting to verify (${money(c.submitted ? c.submitted.amt : 0)})</span></div>
        <div class="up-tile"><b>${data ? data.today.n : 0}</b><span>Approved today (${money(data ? data.today.fee : 0)})</span></div>
        <div class="up-tile"><b>${money(data ? data.today.charge : 0)}</b><span>UPI charges today</span></div><div class="up-tile"><b>${money(data ? data.monthCharge : 0)}</b><span>UPI charges this month</span></div></div>
      <div class="up-row" id="upTabs">${[['submitted', 'To verify'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['cancelled', 'Withdrawn']].map(([k, l]) => `<button class="btn ${tab === k ? 'btn-primary' : 'btn-secondary'}" data-t="${k}">${l}</button>`).join('')}
        <button class="btn ${tab === 'settings' ? 'btn-primary' : 'btn-secondary'}" data-t="settings">Settings and charge</button></div>
      <div id="upPage"></div>`;
    v.querySelectorAll('#upTabs [data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; renderStaff(); });
    if(tab === 'settings') renderSettings(); else renderClaims();
  }
  function matchState(c){
    const m = matchMap[c.id]; if(!m) return '';
    return m.state === 'matched' ? '<span class="up-mt m">✔ Bank matched</span>' : m.state === 'amount_differs' ? `<span class="up-mt d">Amount differs in bank (${esc(m.amounts.map(money).join(', '))})</span>` : '<span class="up-mt n">UTR not found in statement</span>';
  }
  function renderClaims(){
    const p = $('upPage'); if(!data){ p.innerHTML = '<div class="up-card">Could not load. Please try again.</div>'; return; }
    const rows = data.claims.filter(c => !q || (c.studentName + ' ' + c.utr + ' ' + c.admissionNo + ' ' + c.refCode).toLowerCase().indexOf(q.toLowerCase()) >= 0);
    p.innerHTML = `${tab === 'submitted' ? `<div class="up-card"><h3>Match with the bank statement</h3>
        <div class="up-note">Open the SBI statement (or net banking), copy the recent credit lines and paste them here, or load the CSV. The page looks for each 12-digit UTR and checks the amount.</div>
        <textarea id="upStmt" rows="4" style="width:100%;box-sizing:border-box;margin-top:8px;padding:9px;border:1px solid #cfd6e6;border-radius:10px;font:inherit" placeholder="Paste statement lines here">${esc(stmt)}</textarea>
        <div class="up-row" style="margin-top:8px"><input type="file" id="upCsv" accept=".csv,.txt"><button class="btn btn-primary" id="upMatch">Match now</button><button class="btn btn-secondary" id="upBulk">Approve all matched</button></div></div>` : ''}
      <div class="up-row"><input id="upQ" placeholder="Search name, UTR, admission no." value="${esc(q)}" style="padding:8px;border:1px solid #d6dcea;border-radius:10px;font:inherit;min-width:240px"></div>
      <div class="up-card" style="overflow-x:auto"><table class="up-tbl"><thead><tr><th>Student</th><th>Paid</th><th>UTR / Ref</th><th>Date</th><th>Checks</th><th></th></tr></thead><tbody>
      ${rows.length ? rows.map(c => `<tr><td><b>${esc(c.studentName)}</b><div class="up-note">${esc(c.className)} ${esc(c.section)} · ${esc(c.userName)}</div></td>
        <td><b>${money(c.paidTotal)}</b><div class="up-note">Fee ${money(c.feeAmount)}${c.chargeAmount ? ' + charge ' + money(c.chargeAmount) : ''}</div></td>
        <td>${esc(c.utr)}<div class="up-note">${esc(c.refCode)}</div></td><td>${dmy(c.paidOn)} ${esc(c.paidTime)}<div class="up-note">Sent ${dt(c.createdAt)}</div></td>
        <td>${matchState(c)}${c.flags.map(f => `<span class="up-flag">${esc(FLAGS[f] || f)}</span>`).join('')}${c.status !== 'submitted' ? `<div class="up-note">${chip(c.status)} ${esc(c.reviewedBy)}${c.receiptNos && c.receiptNos.length ? '<br>Receipt ' + esc(c.receiptNos.join(', ')) : ''}${c.rejectReason ? '<br>' + esc(c.rejectReason) : ''}</div>` : ''}</td>
        <td style="white-space:nowrap">${c.status === 'submitted' ? `<button class="btn btn-primary btn-sm" data-ap="${esc(c.id)}">Review</button>` : `<button class="btn btn-secondary btn-sm" data-vw="${esc(c.id)}">Details</button>`}</td></tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:#667;padding:20px">Nothing here.</td></tr>'}
      </tbody></table></div>`;
    $('upQ').oninput = ev => { q = ev.target.value; renderClaims(); const i = $('upQ'); i.focus(); i.setSelectionRange(q.length, q.length); };
    p.querySelectorAll('[data-ap]').forEach(b => b.onclick = () => openReview(data.claims.find(c => c.id === b.dataset.ap)));
    p.querySelectorAll('[data-vw]').forEach(b => b.onclick = () => openDetails(data.claims.find(c => c.id === b.dataset.vw)));
    if($('upMatch')){
      $('upCsv').onchange = ev => { const f = ev.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = () => { $('upStmt').value = String(r.result || ''); }; r.readAsText(f); };
      $('upMatch').onclick = () => { stmt = $('upStmt').value; runMatch(); renderClaims(); };
      $('upBulk').onclick = bulkApprove;
    }
  }
  function runMatch(){
    matchMap = {}; const lines = stmt.split(/\r?\n/);
    data.claims.forEach(c => {
      const hit = lines.filter(l => l.indexOf(c.utr) >= 0); if(!hit.length){ matchMap[c.id] = { state: 'not_found', amounts: [] }; return; }
      const amts = []; hit.forEach(l => (l.replace(c.utr, ' ').replace(/\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?/g, ' ').match(/\d[\d,]*(?:\.\d{1,2})?/g) || []).forEach(x => { const v = Number(x.replace(/,/g, '')); if(v > 0 && !amts.includes(v)) amts.push(v); }));
      matchMap[c.id] = { state: amts.some(a => Math.abs(a - c.paidTotal) < 0.01) ? 'matched' : 'amount_differs', amounts: amts };
    });
    const m = Object.values(matchMap); toast(`${m.filter(x => x.state === 'matched').length} matched, ${m.filter(x => x.state !== 'matched').length} need a look.`);
  }
  async function bulkApprove(){
    const ids = data.claims.filter(c => c.status === 'submitted' && matchMap[c.id] && matchMap[c.id].state === 'matched');
    if(!ids.length){ toast('Match the statement first. Nothing matched yet.'); return; }
    if(!confirm(`Approve ${ids.length} matched payment(s)? Receipts will be issued and parents notified. Payments whose amount differs from fee + charge will be skipped.`)) return;
    let ok = 0, skip = 0;
    for(const c of ids){ try{ await api('POST', '/api/upi/claims/' + c.id + '/approve', { bankMatch: 'matched', receivedTotal: c.paidTotal }); ok++; }catch(e){ skip++; } }
    toast(`${ok} approved${skip ? ', ' + skip + ' skipped (open them one by one)' : ''}.`); renderStaff();
  }
  function lineText(c){ return c.lines.map(l => `${esc(l.label)} ${money(l.amount)}`).join(', '); }
  function openDetails(c){
    modal('Payment details', `<div><b>${esc(c.studentName)}</b> · ${esc(c.className)} ${esc(c.section)}<br>${lineText(c)}<br>Paid ${money(c.paidTotal)} · UTR ${esc(c.utr)}</div>
      <div class="up-note" style="margin-top:8px">${(c.history || []).map(h => `${dt(h.at)} · ${esc(h.by)} · ${esc(h.what)}`).join('<br>')}</div><div id="upShotBox"></div>`, `<button class="up-btn" id="upC">Close</button>`);
    $('upC').onclick = closeModal; if(c.hasShot) loadShot(c.id);
  }
  async function loadShot(id){ try{ const j = await api('GET', '/api/upi/claims/' + id + '/screenshot'); const b = $('upShotBox'); if(b) b.innerHTML = `<img class="up-shot" src="${j.image}">`; }catch(e){} }
  function openReview(c){
    const m = matchMap[c.id], single = c.lines.length === 1, matched = m && m.state === 'matched';
    modal('Verify payment', `<div><b>${esc(c.studentName)}</b> · ${esc(c.className)} ${esc(c.section)} · Adm ${esc(c.admissionNo)}<br>${lineText(c)}</div>
      <div class="up-sum"><div><span>Fee</span><b>${money(c.feeAmount)}</b></div><div><span>UPI charge</span><b>${money(c.chargeAmount)}</b></div><div class="t"><span>Parent says paid</span><span>${money(c.paidTotal)}</span></div></div>
      <div>UTR <b>${esc(c.utr)}</b> · ${dmy(c.paidOn)} ${esc(c.paidTime)} · Ref ${esc(c.refCode)}</div>
      <div style="margin:6px 0">${matchState(c)} ${c.flags.map(f => `<span class="up-flag">${esc(FLAGS[f] || f)}</span>`).join('')}</div>
      ${c.note ? `<div class="up-note">Parent note: ${esc(c.note)}</div>` : ''}<div id="upShotBox">${c.hasShot ? '<div class="up-note">Loading screenshot…</div>' : '<div class="up-warn">No screenshot attached.</div>'}</div>
      <div class="up-f" style="margin-top:10px">${single ? `<div><label>Fee amount to credit (₹)</label><input id="rvCredit" type="number" step="0.01" value="${c.feeAmount}"></div>` : ''}<div><label>Money received in bank (₹)</label><input id="rvRecv" type="number" step="0.01" value="${c.paidTotal}"></div></div>
      ${matched ? '' : `<label style="display:flex;gap:8px;margin-top:10px;font-size:.86rem"><input type="checkbox" id="rvSeen"><span>I have seen this credit (this UTR and amount) in the SBI account.</span></label>`}
      <label id="rvDiffW" style="display:none;gap:8px;margin-top:8px;font-size:.86rem"><input type="checkbox" id="rvDiff"><span>The money received differs from fee + charge. Accept the difference.</span></label>
      <div id="rvErr" style="color:#b3261e;font-size:.86rem;margin-top:8px"></div>`,
      `<button class="up-btn no" id="rvRej">Reject</button><button class="up-btn" id="rvC">Close</button><button class="up-btn go" id="rvOk">Approve and issue receipt</button>`);
    if(c.hasShot) loadShot(c.id);
    $('rvC').onclick = closeModal;
    $('rvRej').onclick = () => openReject(c);
    $('rvOk').onclick = async () => {
      const err = $('rvErr'); err.textContent = '';
      if(!matched && !$('rvSeen').checked){ err.textContent = 'Please confirm you have seen the credit in the bank.'; return; }
      const body = { bankMatch: matched ? 'matched' : (m && m.state) || 'manual', seenInBank: matched ? true : $('rvSeen').checked, receivedTotal: Number($('rvRecv').value), acceptDifference: $('rvDiff').checked };
      if(single) body.creditAmount = Number($('rvCredit').value);
      $('rvOk').disabled = true;
      try{ const r = await api('POST', '/api/upi/claims/' + c.id + '/approve', body); closeModal(); toast('Approved. Receipt ' + (r.receiptNos || []).join(', ')); renderStaff(); }
      catch(e){ err.textContent = e.message; if(e.data && e.data.needsAccept) $('rvDiffW').style.display = 'flex'; $('rvOk').disabled = false; }
    };
  }
  function openReject(c){
    modal('Reject payment', `<div class="up-note">The parent will see this reason.</div><div class="up-f" style="margin-top:8px"><div><label>Reason</label><select id="rjSel"><option>UTR not found in the bank account</option><option>Amount in bank is different</option><option>Payment was made to a different account</option><option>Wrong or unreadable reference</option><option>Other</option></select></div>
      <div><label>More detail (optional)</label><input id="rjTxt" maxlength="200"></div></div><div id="rjErr" style="color:#b3261e;font-size:.86rem;margin-top:8px"></div>`, `<button class="up-btn" id="rjC">Back</button><button class="up-btn no" id="rjGo">Reject</button>`);
    $('rjC').onclick = () => openReview(c);
    $('rjGo').onclick = async () => {
      const reason = $('rjSel').value + ($('rjTxt').value.trim() ? ' — ' + $('rjTxt').value.trim() : '');
      try{ await api('POST', '/api/upi/claims/' + c.id + '/reject', { reason, bankMatch: (matchMap[c.id] || {}).state || '' }); closeModal(); toast('Rejected.'); renderStaff(); }catch(e){ $('rjErr').textContent = e.message; }
    };
  }
  function renderSettings(){
    const p = $('upPage'); if(!set){ p.innerHTML = '<div class="up-card">Could not load.</div>'; return; }
    const mg = isMgr(), c = set.charge || {}, dis = mg ? '' : 'disabled';
    p.innerHTML = `<div class="up-card"><h3>School UPI account</h3>${checkHtml(set)}${mg ? '' : '<div class="up-note">Only the Admin or Principal can change these.</div>'}
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="stOn" ${set.enabled ? 'checked' : ''} ${dis}> <b>Let parents pay by UPI (ON/OFF)</b></label>
      <div class="up-f"><div><label>UPI ID (e.g. school@sbi)</label><input id="stId" value="${esc(set.upiId)}" ${dis}></div><div><label>Name shown to parents</label><input id="stNm" value="${esc(set.payeeName)}" ${dis}></div>
        <div><label>Accept payments up to (days old)</label><input id="stAge" type="number" min="1" max="60" value="${set.maxAgeDays || 10}" ${dis}></div></div>
      <div style="margin-top:10px"><label class="up-note">QR image (from the SBI merchant QR / YONO app)</label><input type="file" id="stQr" accept="image/*" ${dis}><div id="stQrPrev">${set.qr ? `<img src="${set.qr}" style="max-width:180px;margin-top:6px;border:1px solid #e3e8f3;border-radius:10px">` : ''}</div></div>
      <div style="margin-top:10px"><label class="up-note">Instructions for parents (optional)</label><textarea id="stIns" rows="2" maxlength="600" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid #cfd6e6;border-radius:10px;font:inherit" ${dis}>${esc(set.instructions)}</textarea></div>
      <label style="display:flex;gap:8px;margin-top:10px;align-items:center"><input type="checkbox" id="stShot" ${set.requireScreenshot ? 'checked' : ''} ${dis}> Parents must attach a payment screenshot</label></div>
      <div class="up-card"><h3>UPI charge (government / bank policy)</h3><div class="up-note">If a charge is levied on UPI payments, set it here. Parents see "Fee + charge = amount to pay". Change it any time the policy changes; every change is recorded below.</div>
      <div class="up-f" style="margin-top:8px"><div style="grid-column:1/-1"><label>Quick presets (you can still edit the boxes after)</label><div class="up-row" style="margin:0">${mg ? `<button type="button" class="btn btn-secondary btn-sm" data-pre="none">No charge</button><button type="button" class="btn btn-secondary btn-sm" data-pre="mdr">0.4% above ₹2,000, max ₹300</button><button type="button" class="btn btn-secondary btn-sm" data-pre="flat5">Flat ₹5 above ₹2,000</button>` : ''}</div></div>
        <div><label>No charge up to (₹)</label><input id="chFree" type="number" step="1" min="0" value="${c.freeUpTo || 0}" ${dis}></div><div><label>Charge type</label><select id="chMode" ${dis}><option value="none" ${c.mode === 'none' ? 'selected' : ''}>No charge</option><option value="percent" ${c.mode === 'percent' ? 'selected' : ''}>Percentage of fee</option><option value="flat" ${c.mode === 'flat' ? 'selected' : ''}>Flat amount per payment</option></select></div>
        <div><label>Percent (%)</label><input id="chPct" type="number" step="0.01" value="${c.percent || 0}" ${dis}></div><div><label>Flat amount (₹)</label><input id="chFlat" type="number" step="0.01" value="${c.flat || 0}" ${dis}></div>
        <div><label>Minimum charge (₹)</label><input id="chMin" type="number" step="0.01" value="${c.min || 0}" ${dis}></div><div><label>Maximum charge (₹, 0 = none)</label><input id="chMax" type="number" step="0.01" value="${c.max || 0}" ${dis}></div>
        <div><label>Name shown to parents</label><input id="chLbl" value="${esc(c.label || 'UPI charge')}" ${dis}></div><div><label>Applies to payments made from</label><input id="chFrom" type="date" value="${esc(c.effectiveFrom || '')}" ${dis}></div>
        <div><label>Reason (shown to parents)</label><input id="chWhy" maxlength="200" value="${esc(c.reason || '')}" ${dis}></div></div>
      <div class="up-note" style="margin-top:8px">The charge is recorded against each payment and totalled on this page. It is not added to the fee receipt amount.</div></div>
      ${mg ? '<div class="up-row"><button class="btn btn-primary" id="stSave">Save settings</button></div>' : ''}
      <div class="up-card"><h3>Change history</h3>${(set.changes || []).length ? (set.changes || []).map(h => `<div class="up-note">${dt(h.at)} · <b>${esc(h.by)}</b> · ${esc(h.text)}</div>`).join('') : '<div class="up-note">No changes yet.</div>'}</div>`;
    let newQr = null;
    if(mg){
      const PRE = { none: { m: 'none', p: 0, f: 0, mn: 0, mx: 0, fr: 0 }, mdr: { m: 'percent', p: 0.4, f: 0, mn: 0, mx: 300, fr: 2000 }, flat5: { m: 'flat', p: 0, f: 5, mn: 0, mx: 0, fr: 2000 } };
      p.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { const x = PRE[b.dataset.pre]; $('chMode').value = x.m; $('chPct').value = x.p; $('chFlat').value = x.f; $('chMin').value = x.mn; $('chMax').value = x.mx; $('chFree').value = x.fr; toast('Filled in. Press Save settings to apply.'); });
      $('stQr').onchange = async ev => { const f = ev.target.files[0]; if(!f) return; try{ newQr = await compress(f); $('stQrPrev').innerHTML = `<img src="${newQr}" style="max-width:180px;margin-top:6px;border:1px solid #e3e8f3;border-radius:10px">`; }catch(e){ toast('Could not read that picture.'); } };
      $('stSave').onclick = async () => {
        if($('chMode').value === 'none' && (Number($('chPct').value) > 0 || Number($('chFlat').value) > 0 || Number($('chMax').value) > 0 || Number($('chFree').value) > 0) && !confirm('Charge type is "No charge", so parents will NOT be charged anything, even though amounts are filled in. Save like this?')) return;
        const body = { enabled: $('stOn').checked, upiId: $('stId').value, payeeName: $('stNm').value, maxAgeDays: Number($('stAge').value), instructions: $('stIns').value, requireScreenshot: $('stShot').checked,
          charge: { mode: $('chMode').value, percent: Number($('chPct').value), flat: Number($('chFlat').value), freeUpTo: Number($('chFree').value), min: Number($('chMin').value), max: Number($('chMax').value), label: $('chLbl').value, effectiveFrom: $('chFrom').value, reason: $('chWhy').value } };
        if(newQr) body.qr = newQr;
        try{ set = await api('PUT', '/api/upi/settings', body); toast('Saved.'); renderStaff(); }catch(e){ toast(e.message); }
      };
    }
  }

  function checkHtml(set){
    const c = set.charge || {}, items = [];
    const handle = String(set.upiId || '').split('@')[1] || '';
    if(!set.upiId && !set.qr) items.push(['#fde4e1', '#b3261e', 'Add the UPI ID or the QR image. Parents have nothing to pay to.']);
    if(set.upiId && !/^[a-z]+$/.test(handle)) items.push(['#fff3d6', '#8a5a00', `Please double-check the UPI ID <b>${esc(set.upiId)}</b>. The part after @ (the bank handle) is normally lowercase letters only, for example <b>name@sbi</b>. A wrong ID makes every parent payment fail. Check it in your SBI / YONO app.`]);
    if(!set.qr) items.push(['#fff3d6', '#8a5a00', 'No QR image uploaded. Parents will see only the UPI ID and the "Open my UPI app" button. Uploading the QR from your SBI merchant / YONO app makes paying easier.']);
    if(c.mode === 'none' && (Number(c.freeUpTo) > 0 || Number(c.max) > 0 || Number(c.percent) > 0 || Number(c.flat) > 0 || c.reason)) items.push(['#fff3d6', '#8a5a00', 'The charge type is <b>No charge</b>, so parents are <b>not</b> being charged anything even though charge amounts or a reason are filled in. Pick a preset or choose "Percent" / "Flat" under Charge type, then Save.']);
    if(!items.length) return '';
    return items.map(i => `<div style="background:${i[0]};color:${i[1]};border-radius:10px;padding:8px 11px;font-size:.84rem;margin:6px 0;line-height:1.45">⚠ ${i[2]}</div>`).join('');
  }
  /* In-app alert for the office: a red count on the "UPI Payments" menu item, the browser tab title, a message when a new
     payment arrives, and the dashboard card. Checked every 45 seconds while the page is visible; it is a background check, so it
     never keeps a forgotten screen signed in. */
  let lastWaiting = null, pollTimer = null;
  function badge(n){
    const b = $('navUpiClaims'); if(!b) return; let sp = b.querySelector('.up-bdg');
    if(!n){ if(sp) sp.remove(); return; }
    if(!sp){ sp = document.createElement('span'); sp.className = 'up-bdg'; sp.style.cssText = 'margin-left:auto;background:#d32f2f;color:#fff;border-radius:999px;padding:1px 8px;font-size:.7rem;font-weight:700'; b.appendChild(sp); }
    sp.textContent = n;
  }
  function titleCount(n){ const base = document.title.replace(/^\(\d+\)\s*/, ''); document.title = n ? '(' + n + ') ' + base : base; }
  async function poll(){
    if(!isStaff() || document.hidden) return;
    try{
      const r = await fetch('/api/upi/count', { credentials: 'include', headers: { 'x-background': '1' } }); if(!r.ok) return;
      const j = await r.json(); const n = j.waiting || 0;
      badge(n); titleCount(n);
      if(n && (lastWaiting === null || n > lastWaiting)) toast(lastWaiting === null ? n + ' UPI payment(s) waiting for you to verify.' : 'A parent has sent a new UPI payment to verify.');
      lastWaiting = n;
      const dv = $('view-dashboard'); if(dv && dv.style.display !== 'none') dashCard();
    }catch(e){}
  }
  window.__upiPoll = poll;
  function startPoll(){
    if(pollTimer || !isStaff()) return;
    pollTimer = setInterval(poll, 45000); setTimeout(poll, 2500);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) poll(); });
  }
  /* ===================================================================== DASHBOARD COUNT + WIRING ===== */
  async function dashCard(){
    if(!isStaff()) return; const v = $('view-dashboard'); if(!v) return;
    try{
      const j = await api('GET', '/api/upi/count'); const old = $('upDashCard'); if(old) old.remove(); if(!j.waiting) return;
      const d = document.createElement('div'); d.id = 'upDashCard'; d.className = 'up-ok'; d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap';
      d.innerHTML = `<span><b>UPI to verify:</b> ${j.waiting} payment(s) sent by parents are waiting for the office.</span><button class="btn btn-secondary" onclick="switchView('upiclaims')">Open</button>`;
      const top = v.querySelector('.topbar'); if(top) top.insertAdjacentElement('afterend', d); else v.insertBefore(d, v.firstChild);
    }catch(e){}
  }
  const origSwitch = window.switchView;
  window.switchView = function(view){
    try{ if(isStaff()) ensureShell(); }catch(e){}
    if(view !== 'upiclaims' || !isStaff()){
      const r = origSwitch.apply(this, arguments);
      const v = $('view-upiclaims'); if(v) v.style.display = 'none';
      const n = $('navUpiClaims'); if(n) n.classList.remove('active');
      if(view === 'dashboard') setTimeout(dashCard, 400);
      return r;
    }
    const root = $('view-dashboard') ? $('view-dashboard').parentNode : null;
    if(root) Array.from(root.children).forEach(c => { if(c.id && c.id.indexOf('view-') === 0 && c.id !== 'view-upiclaims') c.style.display = 'none'; });
    document.querySelectorAll('.sb-link.active').forEach(b => b.classList.remove('active'));
    const n = $('navUpiClaims'); if(n) n.classList.add('active');
    $('view-upiclaims').style.display = 'block';
    try{ closeMobileSidebar(); }catch(e){}
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    data = null; matchMap = {}; renderStaff();
  };
  if(typeof renderMyFeesTab === 'function'){
    const o = renderMyFeesTab;
    renderMyFeesTab = function(body, s){ const r = o.apply(this, arguments); try{ mountParentCard(body, s); }catch(e){} return r; };
  }
  if(typeof applyRolePermissions === 'function'){
    const o = applyRolePermissions;
    window.applyRolePermissions = function(){
      const r = o.apply(this, arguments);
      try{
        if(isStaff()){ ensureShell(); startPoll(); const n = $('navUpiClaims'); if(n){ const m = $('navManageFee'); n.style.display = m && m.style.display === 'none' && role() !== 'Accountant' ? 'none' : 'flex'; } }
        else { const n = $('navUpiClaims'); if(n) n.remove(); const v = $('view-upiclaims'); if(v) v.style.display = 'none'; }
        if(typeof updateSbSectionVisibility === 'function') updateSbSectionVisibility();
      }catch(e){}
      return r;
    };
  }
})();
