/* Collect Fee - guided steps. Sits on top of the normal "Record Payment" form: every choice is written into that same
   form and the final button submits it, so receipt numbers, validation, accounting and printing are the ones that
   already exist. "Use full form" shows the original form any time (and remembers your choice). */
(function(){
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = n => { try{ return fmtMoney(n); }catch(e){ return '₹' + Number(n || 0).toLocaleString('en-IN'); } };
  const guidedOn = () => { try{ return localStorage.getItem('pwGuided') !== '0'; }catch(e){ return true; } };
  const setGuided = v => { try{ localStorage.setItem('pwGuided', v ? '1' : '0'); }catch(e){} };
  let step = 1, wiz = null;

  function css(){
    if($('#pwCss')) return;
    const s = document.createElement('style'); s.id = 'pwCss';
    s.textContent = `
    #paymentForm.pw-on .form-grid, #paymentForm.pw-on .modal-actions{display:none !important}
    #paymentForm.pw-on[data-pwstep="1"] #paymentSummaryBox, #paymentForm.pw-on[data-pwstep="4"] #paymentSummaryBox{display:none}
    .pw{margin-top:6px}
    .pw-steps{display:flex;gap:6px;margin:4px 0 18px}
    .pw-dot{flex:1;text-align:center;font-size:.72rem;font-weight:700;color:var(--ink-soft,#5b5a73);padding-top:8px;border-top:4px solid #e3e0f0;letter-spacing:.02em}
    .pw-dot.done{border-color:#1b7f4b;color:#1b7f4b}
    .pw-dot.on{border-color:var(--magenta,#c2185b);color:var(--magenta,#c2185b)}
    .pw h3{margin:0 0 4px;font-size:1.05rem}
    .pw .pw-hint{font-size:.82rem;color:var(--ink-soft,#5b5a73);margin:0 0 12px}
    .pw input[type=text],.pw input[type=number],.pw input[type=date],.pw select,.pw input[type=search]{width:100%;box-sizing:border-box;border:1.5px solid var(--border,#e3e0f0);border-radius:12px;padding:11px 14px;font:inherit;background:#fff}
    .pw input:focus,.pw select:focus{outline:none;border-color:var(--magenta,#c2185b);box-shadow:0 0 0 3px rgba(194,24,91,.12)}
    .pw-list{margin-top:10px;max-height:290px;overflow:auto;display:flex;flex-direction:column;gap:6px}
    .pw-stu{display:flex;justify-content:space-between;align-items:center;gap:10px;text-align:left;border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:12px;padding:10px 14px;cursor:pointer;font:inherit}
    .pw-stu:hover{border-color:var(--magenta,#c2185b);background:#fdf4f8}
    .pw-stu small{color:var(--ink-soft,#5b5a73);display:block}
    .pw-due{font-weight:700;white-space:nowrap}.pw-due.zero{color:#1b7f4b}.pw-due.owe{color:#b3261e}
    .pw-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 12px}
    .pw-chip{border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:999px;padding:9px 16px;font:inherit;font-weight:600;font-size:.88rem;cursor:pointer}
    .pw-chip.on{background:var(--navy,#211a4e);border-color:var(--navy,#211a4e);color:#fff}
    .pw-who{display:flex;justify-content:space-between;align-items:center;gap:10px;background:#f3f0fb;border-radius:12px;padding:10px 14px;margin-bottom:12px}
    .pw-link{background:none;border:0;color:var(--magenta,#c2185b);font:inherit;font-weight:700;cursor:pointer;padding:0}
    .pw-quick{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 0}
    .pw-nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}
    .pw-review{border:1.5px solid var(--border,#e3e0f0);border-radius:14px;overflow:hidden}
    .pw-review div{display:flex;justify-content:space-between;gap:12px;padding:10px 14px;border-top:1px solid #eef1f7}
    .pw-review div:first-child{border-top:0}
    .pw-review b.big{font-size:1.15rem;color:#1b7f4b}
    .pw-err{color:#b3261e;font-size:.84rem;margin-top:8px;min-height:1.1em}
    .pw-row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    @media(max-width:520px){.pw-row2{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  const F = id => document.getElementById(id);
  function setField(id, val, ev){ const el = F(id); if(!el) return; el.value = val; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); }
  const stu = () => (typeof students !== 'undefined' ? students : []).find(x => x.id === (F('pStudent') || {}).value);
  const fin = s => { try{ return computeStudentFinance(s); }catch(e){ return null; } };
  const catBal = (s, c) => { const f = fin(s); return f && f.perCat && f.perCat[c] ? f.perCat[c].receivable : 0; };
  const catName = c => { try{ return CATS[c] || c; }catch(e){ return c; } };

  function dots(){
    const n = ['Student', 'Fee', 'Payment', 'Review'];
    return '<div class="pw-steps">' + n.map((t, i) => `<div class="pw-dot ${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}">${i + 1}. ${t}</div>`).join('') + '</div>';
  }

  function render(){
    const form = F('paymentForm'); if(!form || !wiz) return;
    form.dataset.pwstep = String(step);
    const s = stu(); let h = dots();
    if(step === 1){
      h += `<h3>Who is paying?</h3><p class="pw-hint">Type a name, admission number or class.</p><input type="search" id="pwQ" placeholder="Search student…" autocomplete="off"><div class="pw-list" id="pwList"></div>`;
    } else {
      h += `<div class="pw-who"><div><b>${esc(s ? s.name : '')}</b><small style="display:block;color:#5b5a73">${esc(s ? s.className + ' ' + (s.section || '') + ' · Adm ' + (s.admissionNo || '—') : '')}</small></div><button type="button" class="pw-link" id="pwChange">Change</button></div>`;
    }
    if(step === 2){
      const cats = Array.from(F('pCategory').options).map(o => o.value);
      h += `<h3>What is being paid?</h3><div class="pw-chips">${cats.map(c => `<button type="button" class="pw-chip ${F('pCategory').value === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(catName(c))}${s ? ' · ' + money(catBal(s, c)) : ''}</button>`).join('')}</div>
        <label style="font-weight:700;font-size:.85rem">Amount received (₹)</label><input type="number" id="pwAmt" min="0" step="1" placeholder="0" value="${esc(F('pAmount').value)}">
        <div class="pw-quick"><button type="button" class="pw-chip" id="pwFull">Pay full balance</button><button type="button" class="pw-chip" id="pwHalf">Half</button></div><div class="pw-err" id="pwErr"></div>`;
    }
    if(step === 3){
      const modes = Array.from(F('pMode').options).map(o => o.value);
      h += `<h3>How is it paid?</h3><div class="pw-chips">${modes.map(m => `<button type="button" class="pw-chip ${F('pMode').value === m ? 'on' : ''}" data-mode="${esc(m)}">${esc(m)}</button>`).join('')}</div>
        <div class="pw-row2"><div><label style="font-weight:700;font-size:.85rem">Date</label><input type="date" id="pwDate" value="${esc(F('pDate').value || new Date().toISOString().slice(0, 10))}"></div>
        <div><label style="font-weight:700;font-size:.85rem">Instalment / term</label><input type="text" id="pwInst" placeholder="e.g. Term-I" value="${esc(F('pInstalment').value)}"></div></div>
        <div style="margin-top:10px"><label style="font-weight:700;font-size:.85rem">Note (optional)</label><input type="text" id="pwNote" value="${esc(F('pNote').value)}"></div>
        <details style="margin-top:12px" ${Number(F('pDiscount').value) ? 'open' : ''}><summary style="cursor:pointer;font-weight:700">Give a discount</summary><div class="pw-row2" style="margin-top:8px"><div><label style="font-size:.8rem">Reason</label><select id="pwDiscType">${F('pDiscountType').innerHTML}</select></div><div><label style="font-size:.8rem">Discount (₹)</label><input type="number" id="pwDisc" min="0" step="1" value="${esc(F('pDiscount').value)}"></div></div></details>`;
    }
    if(step === 4 && s){
      const amt = Number(F('pAmount').value) || 0, disc = Number(F('pDiscount').value) || 0, bal = catBal(s, F('pCategory').value);
      const after = Math.max(bal - amt - disc, 0);
      h += `<h3>Check and save</h3><div class="pw-review"><div><span>Fee</span><b>${esc(catName(F('pCategory').value))}</b></div><div><span>Amount received</span><b class="big">${money(amt)}</b></div>${disc ? `<div><span>Discount</span><b>${money(disc)}</b></div>` : ''}<div><span>Mode</span><b>${esc(F('pMode').value)}</b></div><div><span>Date</span><b>${esc(F('pDate').value || new Date().toISOString().slice(0, 10))}</b></div>${F('pInstalment').value ? `<div><span>Instalment</span><b>${esc(F('pInstalment').value)}</b></div>` : ''}<div><span>Balance before</span><b>${money(bal)}</b></div><div><span>Balance after this payment</span><b>${money(after)}</b></div></div>${(amt + disc) > bal && bal > 0 ? '<div class="pw-err">This is more than the balance due. Go back if that is a mistake.</div>' : ''}`;
    }
    h += `<div class="pw-nav"><button type="button" class="btn btn-ghost" id="pwBack">${step === 1 ? 'Cancel' : '← Back'}</button>${step === 1 ? '<span class="pw-link" style="align-self:center"><button type="button" class="pw-link" id="pwFull2">Use full form</button></span>' : step === 4 ? '<button type="button" class="btn btn-primary" id="pwSave">Save payment</button>' : '<button type="button" class="btn btn-primary" id="pwNext">Next →</button>'}</div>`;
    wiz.innerHTML = h; bind();
  }

  function bind(){
    const q = id => wiz.querySelector('#' + id);
    const go = n => { step = n; render(); };
    q('pwBack').onclick = () => step === 1 ? closePaymentModal() : go(step - 1);
    if(q('pwFull2')) q('pwFull2').onclick = () => { setGuided(false); mountOrUnmount(); };
    if(q('pwChange')) q('pwChange').onclick = () => { setField('pStudent', '', 'change'); go(1); };
    if(step === 1){
      const list = q('pwList'), inp = q('pwQ');
      const paint = () => {
        const t = inp.value.trim().toLowerCase();
        const src = (typeof students !== 'undefined' ? students : []).filter(x => (typeof isActive !== 'function' || isActive(x)) && (!t || (x.name + ' ' + (x.admissionNo || '') + ' ' + x.className + ' ' + (x.section || '')).toLowerCase().includes(t))).slice(0, 12);
        list.innerHTML = src.length ? src.map(x => { const f = fin(x), due = f && f.totals ? f.totals.receivable : 0; return `<button type="button" class="pw-stu" data-id="${esc(x.id)}"><span><b>${esc(x.name)}</b><small>${esc(x.className)} ${esc(x.section || '')} · Adm ${esc(x.admissionNo || '—')}</small></span><span class="pw-due ${due > 0 ? 'owe' : 'zero'}">${due > 0 ? money(due) + ' due' : 'No dues'}</span></button>`; }).join('') : '<div class="pw-hint">No student found.</div>';
      };
      inp.oninput = paint; paint(); setTimeout(() => inp.focus(), 50);
      list.onclick = e => { const b = e.target.closest('[data-id]'); if(!b) return; setField('pStudent', b.dataset.id, 'change'); go(2); };
    }
    if(step === 2){
      wiz.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { setField('pCategory', b.dataset.cat, 'change'); render(); });
      const amt = q('pwAmt'); amt.oninput = () => setField('pAmount', amt.value, 'input');
      const s = stu();
      q('pwFull').onclick = () => { const v = Math.max(Math.round(catBal(s, F('pCategory').value)), 0); amt.value = v; setField('pAmount', v, 'input'); };
      q('pwHalf').onclick = () => { const v = Math.max(Math.round(catBal(s, F('pCategory').value) / 2), 0); amt.value = v; setField('pAmount', v, 'input'); };
      q('pwNext').onclick = () => { if(!(Number(F('pAmount').value) > 0) && !(Number(F('pDiscount').value) > 0)){ q('pwErr').textContent = 'Enter the amount received.'; amt.focus(); return; } go(3); };
    }
    if(step === 3){
      wiz.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { setField('pMode', b.dataset.mode, 'change'); wiz.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); });
      q('pwDate').onchange = e => setField('pDate', e.target.value, 'change');
      q('pwInst').oninput = e => setField('pInstalment', e.target.value, 'input');
      q('pwNote').oninput = e => setField('pNote', e.target.value, 'input');
      const dt = q('pwDiscType'); dt.value = F('pDiscountType').value; dt.onchange = () => { setField('pDiscountType', dt.value, 'change'); q('pwDisc').value = F('pDiscount').value; };
      q('pwDisc').oninput = e => setField('pDiscount', e.target.value, 'input');
      if(!F('pDate').value) setField('pDate', q('pwDate').value, 'change');
      q('pwNext').onclick = () => go(4);
    }
    if(step === 4){
      q('pwSave').onclick = () => {
        const form = F('paymentForm'); q('pwSave').disabled = true; q('pwSave').textContent = 'Saving…';
        try{ if(form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }catch(e){ console.warn(e); }
        setTimeout(() => { const b = q('pwSave'); if(b){ b.disabled = false; b.textContent = 'Save payment'; } }, 3000);
      };
    }
  }

  function mountOrUnmount(){
    const form = F('paymentForm'); if(!form) return;
    css();
    let link = $('#pwToggle');
    if(!link){ const sub = form.closest('.modal-inner').querySelector('.modal-sub'); if(sub){ link = document.createElement('button'); link.type = 'button'; link.id = 'pwToggle'; link.className = 'pw-link'; link.style.marginLeft = '10px'; sub.appendChild(link); link.onclick = () => { setGuided(!guidedOn()); step = F('pStudent').value ? 2 : 1; mountOrUnmount(); }; } }
    if(guidedOn()){
      form.classList.add('pw-on'); if(link) link.textContent = 'Use full form';
      if(!wiz){ wiz = document.createElement('div'); wiz.className = 'pw'; wiz.id = 'pwWiz'; }
      form.insertBefore(wiz, F('paymentSummaryBox'));
      render();
    } else {
      form.classList.remove('pw-on'); if(link) link.textContent = 'Use guided steps';
      if(wiz && wiz.parentNode) wiz.parentNode.removeChild(wiz);
    }
  }

  function install(){
    if(typeof window.openPaymentModal !== 'function' || window.__pwWrapped) return false;
    const orig = window.openPaymentModal; window.__pwWrapped = true;
    window.openPaymentModal = function(preset){
      const r = orig.apply(this, arguments);
      try{ step = (F('pStudent') && F('pStudent').value) ? 2 : 1; wiz = null; const o = $('#pwWiz'); if(o) o.remove(); mountOrUnmount(); }catch(e){ console.warn('fee-wizard', e); }
      return r;
    };
    return true;
  }
  if(!install()){ let n = 0; const iv = setInterval(() => { if(install() || ++n > 40) clearInterval(iv); }, 500); }
})();
