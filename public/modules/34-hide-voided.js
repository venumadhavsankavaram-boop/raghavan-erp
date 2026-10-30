/* ===== Hide voided receipts =====
   Voided / refunded / bounced receipts are hidden in the receipt lists by default. A small button
   ("Show voided receipts (N)") shows them again. Display only: nothing is deleted, totals and
   Excel / PDF exports are unchanged. Rows carry the class hv-void; the page carries hv-show when shown. */
(function(){
  const css = document.createElement('style');
  css.textContent = 'body:not(.hv-show) .hv-void{display:none !important}' +
    '.hv-toggle{white-space:nowrap}';
  document.head.appendChild(css);
  function label(btn){
    const n = btn.getAttribute('data-n') || '0';
    btn.textContent = document.body.classList.contains('hv-show') ? 'Hide voided receipts' : 'Show voided receipts (' + n + ')';
  }
  window.hvBtn = function(n){
    n = Number(n) || 0;
    if(!n) return '';
    const shown = document.body.classList.contains('hv-show');
    return '<button type="button" class="btn btn-ghost btn-sm hv-toggle" data-n="' + n + '" onclick="hvToggle()" title="Voided receipts are hidden by default">' +
      (shown ? 'Hide voided receipts' : 'Show voided receipts (' + n + ')') + '</button>';
  };
  window.hvToggle = function(){
    document.body.classList.toggle('hv-show');
    document.querySelectorAll('.hv-toggle').forEach(label);
  };
})();
