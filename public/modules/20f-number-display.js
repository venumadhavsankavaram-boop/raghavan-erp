/* Shows the receipt / voucher number ON the form while it is being filled in.
   Fee receipts, family fee receipts, ledger quick-pay, income / payment / journal vouchers and refunds.
   The number shown is the one the server has set aside for this entry (the same one the Save button uses),
   so two people working at the same time never see the same number. If the number has to change at Save
   (for example another person used it), a message says so. Nothing here changes how numbers are issued. */
(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const css = document.createElement('style');
  css.textContent = '.dn-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:8px 12px;border-radius:10px;' +
    'background:rgba(37,99,235,.08);border:1px solid rgba(37,99,235,.28);font-size:.86rem;color:inherit}' +
    '.dn-banner b{font-variant-numeric:tabular-nums;letter-spacing:.2px}.dn-banner small{opacity:.7}.dn-banner[hidden]{display:none}';
  (document.head || document.documentElement).appendChild(css);

  /* ---- where each banner goes, which number it shows ---- */
  const T = [
    { key:'pay',    kind:'receipt', label:'Receipt No', note:'reserved for this entry',
      find(){ const ov = $('paymentModalOverlay'), f = $('paymentForm'); return f ? { open: !!(ov && ov.classList.contains('open')), parent: f, mode:'prepend' } : null; }, count:() => 1 },
    { key:'ledger', kind:'receipt', label:'Receipt No', note:'one receipt for all fee heads paid together',
      find(){ const el = document.querySelector('.sf-paybar'); return el ? { open:true, parent: el.parentNode, ref: el, mode:'before' } : null; }, count:() => 1 },
    { key:'family', kind:'receipt', label:'Receipt No', note:'one receipt per student paying',
      find(){ const ov = $('familyFeeModalOverlay'); const sub = ov && ov.querySelector('.modal-sub'); return sub ? { open: ov.classList.contains('open'), parent: sub.parentNode, ref: sub.nextSibling, mode:'before' } : null; },
      count(){ const n = document.querySelectorAll('input[id^="ffStudentChk_"]:checked').length; return Math.max(1, Math.min(n, 20)); } },
    { key:'inc',    kind:'voucher', series:'income_voucher',  label:'Receipt Voucher No', note:'reserved for this entry',
      find(){ const d = $('acctIncDate'); const g = d && d.closest('.form-grid'); return g ? { open:true, parent: g.parentNode, ref: g, mode:'before' } : null; } },
    { key:'exp',    kind:'voucher', series:'payment_voucher', label:'Payment Voucher No', note:'reserved for this entry',
      find(){ const d = $('acctExpDate'); const g = d && d.closest('.form-grid'); return g ? { open:true, parent: g.parentNode, ref: g, mode:'before' } : null; } },
    { key:'jv',     kind:'journal', series:'journal_voucher', label:'Journal Voucher No', note:'confirmed when you press Save',
      find(){ const d = $('jvDate'); const g = d && d.closest('.form-grid'); return g ? { open:true, parent: g.parentNode, ref: g, mode:'before' } : null; } },
    { key:'refund', kind:'voucher', series:'payment_voucher', label:'Refund Voucher No', note:'reserved for this refund',
      find(){ const ov = $('refundPaymentModalOverlay'), sub = $('refundModalSub'); return sub ? { open: !!(ov && ov.classList.contains('open')), parent: sub.parentNode, ref: sub.nextSibling, mode:'before' } : null; } },
  ];

  const shown = { receipts: [], voucher: {} };   // what the screen last showed, to notice a change at Save

  function show(b, html){ b.hidden = false; b.innerHTML = html; }
  function noNumber(b, t){ show(b, '🧾 <small>' + esc(t.label) + ': it will be given when you press Save</small>'); }

  async function fill(b, t, want){
    const token = (b._tok = (b._tok || 0) + 1);
    b.dataset.state = 'busy';
    try{
      if(t.kind === 'receipt'){
        // Receipt numbers are issued at Save, never when a form opens, so opening or cancelling a form leaves no gap.
        return noNumber(b, t);
        if(typeof rcEnsure !== 'function' || typeof rcPool === 'undefined') return noNumber(b, t);
        const ok = await rcEnsure(want);
        if(token !== b._tok) return;
        const nums = ok ? rcPool.slice(0, want) : [];
        if(!nums.length) return noNumber(b, t);
        shown.receipts = nums.slice();
        show(b, '🧾 ' + esc(t.label) + (nums.length > 1 ? 's' : '') + ': <b>' + nums.map(esc).join(', ') + '</b> <small>· ' + esc(t.note) + '</small>');
      }else if(t.kind === 'voucher'){
        const no = await (issueDocNumber.__orig || issueDocNumber)(t.series);
        if(token !== b._tok) return;
        shown.voucher[t.series] = no;
        show(b, '🧾 ' + esc(t.label) + ': <b>' + esc(no) + '</b> <small>· ' + esc(t.note) + '</small>');
      }else{
        const res = await fetch('/api/next-doc-number', { method:'POST', headers:{'Content-Type':'application/json', ...actorHeaders()}, body: JSON.stringify({ series:t.series, peek:true }) });
        if(!res.ok) throw new Error('x');
        const d = await res.json();
        if(token !== b._tok) return;
        show(b, '🧾 ' + esc(t.label) + ': <b>' + esc(d.docNumber) + '</b> <small>· ' + esc(t.note) + '</small>');
      }
      b.dataset.state = 'done'; b.dataset.n = String(want);
    }catch(e){
      if(token !== b._tok) return;
      noNumber(b, t); b.dataset.state = 'done'; b.dataset.n = String(want);
    }
  }

  let timer = 0;
  function scan(){
    timer = 0;
    for(const t of T){
      let pos; try{ pos = t.find(); }catch(e){ pos = null; }
      const id = 'dn_' + t.key;
      let b = $(id);
      if(!pos){ if(b) b.remove(); continue; }
      if(!b || !b.isConnected){
        b = document.createElement('div'); b.id = id; b.className = 'dn-banner'; b.hidden = true;
        if(pos.mode === 'prepend') pos.parent.insertBefore(b, pos.parent.firstChild);
        else pos.parent.insertBefore(b, pos.ref || null);
      }
      const visible = pos.open && pos.parent.getClientRects().length > 0;
      if(!visible){ if(b.dataset.state){ b.dataset.state = ''; b.hidden = true; } continue; }
      const want = t.count ? t.count() : 1;
      if(b.dataset.state === 'busy') continue;
      if(b.dataset.state !== 'done' || b.dataset.n !== String(want)) fill(b, t, want);
    }
  }
  const later = () => { if(!timer) timer = setTimeout(scan, 120); };

  /* ---- a number that had to change at Save is announced ---- */
  function wrapGlobals(){
    if(typeof issueDocNumber === 'function' && !issueDocNumber.__dn){
      const orig = issueDocNumber;
      const w = async function(series, slot){
        const no = await orig.apply(this, arguments);
        const before = shown.voucher[series];
        if(!slot && before && before !== no) showToast('The voucher number changed to ' + no + ' (' + before + ' was taken by another entry).');
        if(!slot) delete shown.voucher[series];
        return no;
      };
      w.__dn = true; w.__orig = orig; window.issueDocNumber = w;
    }
    if(typeof nextReceiptNo === 'function' && !nextReceiptNo.__dn){
      const orig = nextReceiptNo;
      const w = function(){
        const exp = shown.receipts.shift();
        const no = orig.apply(this, arguments);
        if(exp && exp !== no) showToast('The receipt number changed to ' + no + ' (' + exp + ' was taken by another entry).');
        return no;
      };
      w.__dn = true; window.nextReceiptNo = w;
    }
  }

  function start(){
    wrapGlobals();
    try{
      new MutationObserver(later).observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class', 'style'] });
    }catch(e){}
    document.addEventListener('click', later, true);
    document.addEventListener('change', later, true);
    later();
  }
  if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
