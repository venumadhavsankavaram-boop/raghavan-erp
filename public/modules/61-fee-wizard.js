/* Collect Fee - guided steps for the "Collect Family Fees" window that the Pay button opens.
   The real fields (fee-head tickboxes, amounts, family total, mode, date, cheque/UPI details, note) are MOVED into three
   steps - they are not copied - and the last button runs the same submitFamilyPayments() as before, so receipts, day-close
   checks, extra-fee balances and printing are untouched. "Use full form" puts everything back exactly as it was. */
(function(){
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const money = n => { try{ return fmtMoney(n); }catch(e){ return '₹' + Number(n || 0).toLocaleString('en-IN'); } };
  const guidedOn = () => { try{ return localStorage.getItem('pwGuided') !== '0'; }catch(e){ return true; } };
  const setGuided = v => { try{ localStorage.setItem('pwGuided', v ? '1' : '0'); }catch(e){} };
  let step = 1, wiz = null, moved = [], inner = null;

  function css(){
    if($('#pwCss')) return;
    const s = document.createElement('style'); s.id = 'pwCss';
    s.textContent = `
    .pw{margin-top:6px}
    .pw-steps{display:flex;gap:6px;margin:4px 0 16px}
    .pw-dot{flex:1;text-align:center;font-size:.72rem;font-weight:700;color:var(--ink-soft,#5b5a73);padding-top:8px;border-top:4px solid #e3e0f0}
    .pw-dot.done{border-color:#1b7f4b;color:#1b7f4b}.pw-dot.on{border-color:var(--magenta,#c2185b);color:var(--magenta,#c2185b)}
    .pw h3{margin:0 0 4px;font-size:1.05rem}
    .pw-hint{font-size:.82rem;color:var(--ink-soft,#5b5a73);margin:0 0 12px}
    .pw-pane[hidden]{display:none}
    .pw-quick{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
    .pw-chip{border:1.5px solid var(--border,#e3e0f0);background:#fff;border-radius:999px;padding:9px 16px;font:inherit;font-weight:600;font-size:.86rem;cursor:pointer}
    .pw-chip:hover{border-color:var(--magenta,#c2185b)}
    .pw-nav{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:18px}
    .pw-link{background:none;border:0;color:var(--magenta,#c2185b);font:inherit;font-weight:700;cursor:pointer;padding:0}
    .pw-review{border:1.5px solid var(--border,#e3e0f0);border-radius:14px;overflow:hidden;margin-top:6px}
    .pw-review div{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;border-top:1px solid #eef1f7;font-size:.9rem}
    .pw-review div:first-child{border-top:0}
    .pw-review .pw-stu{background:#f3f0fb;font-weight:700}
    .pw-review .pw-tot{background:#eafaf3;font-weight:800;font-size:1.05rem;color:#14633a}
    .pw-err{color:#b3261e;font-size:.86rem;margin-top:8px;min-height:1.1em}
    .pw-on-hide{display:none !important}
    `;
    document.head.appendChild(s);
  }

  const rows = () => $$('.ff-head-row').map(r => { const c = document.getElementById('ffChk_' + r.dataset.hid), a = document.getElementById('ffAmt_' + r.dataset.hid); return { r, on: !!(c && c.checked), amt: Number(a ? a.value : 0) || 0, due: Number(r.dataset.outstanding) || 0 }; });
  const paying = () => rows().filter(x => x.on && x.amt > 0);
  const total = () => paying().reduce((s, x) => s + x.amt, 0);
  const stuName = sid => { const h = $(`.ff-student-header-row[data-student-id="${sid}"] .name-cell b`); return h ? h.textContent : sid; };

  function unmount(){
    moved.forEach(m => { if(m.ph.parentNode) m.ph.replaceWith(m.el); });
    moved = [];
    if(wiz && wiz.parentNode) wiz.parentNode.removeChild(wiz);
    wiz = null;
    if(inner){ inner.classList.remove('pw-active'); $$('.pw-on-hide', inner).forEach(e => e.classList.remove('pw-on-hide')); inner.removeEventListener('keydown', onKey, true); }
  }
  function take(el, pane){ if(!el) return; const ph = document.createComment('pw'); el.replaceWith(ph); moved.push({ el, ph }); pane.appendChild(el); }

  function onKey(e){
    if(e.key !== 'Enter' || (e.target && e.target.tagName === 'TEXTAREA') || (e.target && e.target.tagName === 'BUTTON')) return;
    e.preventDefault(); e.stopPropagation();   // Enter must never save a payment by accident
    const n = wiz && wiz.querySelector('#pwNext'); if(n) n.click();
  }

  function mount(){
    const ov = document.getElementById('familyFeeModalOverlay'); if(!ov) return;
    inner = $('.modal-inner', ov); if(!inner) return;
    unmount(); css();
    let link = $('#pwToggle', inner);
    if(!link){ const sub = $('.modal-sub', inner); if(sub){ link = document.createElement('button'); link.type = 'button'; link.id = 'pwToggle'; link.className = 'pw-link'; link.style.marginLeft = '10px'; sub.appendChild(link); link.onclick = () => { setGuided(!guidedOn()); step = 1; mount(); }; } }
    if(!guidedOn()){ if(link) link.textContent = 'Use guided steps'; return; }
    if(link) link.textContent = 'Use full form';
    const grid = $('.form-grid', inner), fields = grid ? Array.from(grid.children) : [];
    const [fMode, fDate, fNote, fTotal] = fields;
    wiz = document.createElement('div'); wiz.className = 'pw'; wiz.id = 'pwWiz';
    wiz.innerHTML = `<div class="pw-steps" id="pwDots"></div>
      <div class="pw-pane" id="pwP1"><h3>What is being paid?</h3><p class="pw-hint">Tick the fee heads and check the amounts. Everything due is filled in for you.</p><div class="pw-quick"><button type="button" class="pw-chip" id="pwAll">Pay everything due</button><button type="button" class="pw-chip" id="pwNone">Clear all</button></div><div id="pwTotalBox"></div><div id="pwTableBox"></div><div id="pwSumBox"></div><div class="pw-err" id="pwErr1"></div></div>
      <div class="pw-pane" id="pwP2" hidden><h3>How is it paid?</h3><p class="pw-hint">Choose the mode and date. Cheque, UPI and online details appear below when needed.</p><div class="form-grid" id="pwFields"></div><div id="pwDetBox"></div></div>
      <div class="pw-pane" id="pwP3" hidden><h3>Check and collect</h3><div id="pwReview"></div><div class="pw-err" id="pwErr3"></div></div>
      <div class="pw-nav"><button type="button" class="btn btn-ghost" id="pwBack">Cancel</button><button type="button" class="btn btn-primary" id="pwNext">Next →</button></div>`;
    const sub = $('.modal-sub', inner); sub.insertAdjacentElement('afterend', wiz);
    take(fTotal, $('#pwTotalBox', wiz)); take($('.table-wrap', inner), $('#pwTableBox', wiz)); take($('.pay-summary-box', inner), $('#pwSumBox', wiz));
    [fMode, fDate, fNote].forEach(f => take(f, $('#pwFields', wiz))); take($('#ffDetails', inner), $('#pwDetBox', wiz));
    if(grid) grid.classList.add('pw-on-hide'); const act = $('.modal-actions', inner); if(act) act.classList.add('pw-on-hide');
    inner.classList.add('pw-active'); inner.addEventListener('keydown', onKey, true);
    $('#pwAll', wiz).onclick = () => { $$('.ff-student-header-row input[type=checkbox]:not(:disabled)', inner).forEach(c => { if(!c.checked){ c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); } }); $$('.ff-head-row', inner).forEach(r => { const c = document.getElementById('ffChk_' + r.dataset.hid), a = document.getElementById('ffAmt_' + r.dataset.hid); if(c){ c.checked = true; } if(a){ a.disabled = false; a.value = r.dataset.outstanding; } }); try{ onFamilyRowToggle(); }catch(e){} };
    $('#pwNone', wiz).onclick = () => { $$('.ff-head-row', inner).forEach(r => { const c = document.getElementById('ffChk_' + r.dataset.hid); if(c) c.checked = false; }); try{ onFamilyRowToggle(); }catch(e){} };
    $('#pwBack', wiz).onclick = () => step === 1 ? closeFamilyFeeModal() : go(step - 1);
    $('#pwNext', wiz).onclick = () => {
      if(step === 1){ if(!(total() > 0)){ $('#pwErr1', wiz).textContent = 'Tick at least one fee head and enter an amount.'; return; } $('#pwErr1', wiz).textContent = ''; return go(2); }
      if(step === 2) return go(3);
      const b = $('#pwNext', wiz); b.disabled = true; b.textContent = 'Saving…';
      try{ submitFamilyPayments(); }catch(e){ console.warn('fee-wizard', e); }
      setTimeout(() => { const x = $('#pwNext', wiz); if(x){ x.disabled = false; x.textContent = '💰 Collect fees'; } }, 3500);
    };
    step = 1; go(1);
  }

  function go(n){
    step = n; if(!wiz) return;
    ['pwP1', 'pwP2', 'pwP3'].forEach((id, i) => { $('#' + id, wiz).hidden = (i + 1) !== step; });
    $('#pwDots', wiz).innerHTML = ['Fees', 'Payment', 'Collect'].map((t, i) => `<div class="pw-dot ${i + 1 < step ? 'done' : i + 1 === step ? 'on' : ''}">${i + 1}. ${t}</div>`).join('');
    $('#pwBack', wiz).textContent = step === 1 ? 'Cancel' : '← Back';
    const nb = $('#pwNext', wiz); nb.disabled = false; nb.textContent = step === 3 ? '💰 Collect fees' : 'Next →';
    if(step === 3) review();
  }

  function review(){
    const by = {}; paying().forEach(x => { (by[x.r.dataset.studentId] = by[x.r.dataset.studentId] || []).push(x); });
    let h = '<div class="pw-review">';
    Object.keys(by).forEach(sid => { h += `<div class="pw-stu"><span>${esc(stuName(sid))}</span><span>${money(by[sid].reduce((s, x) => s + x.amt, 0))}</span></div>` + by[sid].map(x => `<div><span>${esc(x.r.dataset.label)}</span><span>${money(x.amt)}${x.amt < x.due ? ' <small style="color:#b7791f">(' + money(x.due - x.amt) + ' stays due)</small>' : ''}</span></div>`).join(''); });
    const mode = (document.getElementById('ffMode') || {}).value, date = (document.getElementById('ffDate') || {}).value, note = (document.getElementById('ffNote') || {}).value;
    h += `<div><span>Mode</span><b>${esc(mode)}</b></div><div><span>Date</span><b>${esc(date)}</b></div>`;
    $$('#ffDetails input, #ffDetails select').forEach(i => { if(i.value){ const l = i.closest('.f-field') && $('label', i.closest('.f-field')); h += `<div><span>${esc(l ? l.textContent.replace('*', '').trim() : 'Detail')}</span><b>${esc(i.value)}</b></div>`; } });
    if(note) h += `<div><span>Note</span><b>${esc(note)}</b></div>`;
    h += `<div class="pw-tot"><span>Total to collect</span><span>${money(total())}</span></div></div>`;
    $('#pwReview', wiz).innerHTML = h;
  }

  function install(){
    if(typeof window.openFamilyFeeModal !== 'function' || window.__pwWrapped) return false;
    const orig = window.openFamilyFeeModal; window.__pwWrapped = true;
    window.openFamilyFeeModal = async function(){
      const r = await orig.apply(this, arguments);
      try{ if(document.getElementById('familyFeeModalOverlay').classList.contains('open')) mount(); }catch(e){ console.warn('fee-wizard', e); }
      return r;
    };
    const oc = window.closeFamilyFeeModal;
    if(typeof oc === 'function') window.closeFamilyFeeModal = function(){ const r = oc.apply(this, arguments); try{ unmount(); }catch(e){} return r; };
    return true;
  }
  if(!install()){ let n = 0; const iv = setInterval(() => { if(install() || ++n > 40) clearInterval(iv); }, 500); }
})();
