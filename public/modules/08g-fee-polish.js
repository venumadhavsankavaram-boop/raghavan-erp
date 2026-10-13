/* Manage Fee polish — layout and look only. No fee logic, saving or calculation is changed here.
   Tab bar on one row, summary cards on Fee Types / Extra Fees / Late Fees, a two-column Late Fees page,
   and a proper style for the secondary button. */
(function(){
  if(document.getElementById('mfPolishCss')) return;
  const st = document.createElement('style'); st.id = 'mfPolishCss';
  st.textContent = `
  .sf-btn--secondary{color:var(--navy); background:var(--white); border:1.5px solid var(--navy);}
  .sf-btn--secondary{margin-bottom:12px;}
  .sf-btn--secondary:hover{background:var(--navy); color:#fff;}
  #view-managefee .mf-tabs{flex-wrap:wrap; gap:6px 4px; padding-bottom:4px;}
  #view-managefee .mf-tab{white-space:nowrap; padding:7px 10px; font-size:.79rem; flex:0 0 auto;}
  #view-managefee .mf-tab-danger{margin-left:0;}
  .mfp-kpis{margin-bottom:18px;}
  .ft-fee small.mfp-assigned{font-size:.76rem; color:var(--ink-soft);}
  .ft-fee{transition:transform .15s, box-shadow .15s; border-top:3px solid var(--teal);}
  .ft-fee:hover{transform:translateY(-2px); box-shadow:var(--shadow);}
  .ft-chip{transition:background .15s;}
  .lf-grid{grid-template-columns:minmax(340px,1.15fr) minmax(300px,1fr) !important;}
  .lf-side{display:flex; flex-direction:column; gap:18px;}
  .lf-side .sf-btn{margin-top:4px;}
  @media (max-width:900px){ .lf-grid{grid-template-columns:1fr !important;} }
  `;
  document.head.appendChild(st);
})();

function mfpKpis(items){
  return `<section class="sf-kpis mfp-kpis">${items.map(i => sfKpi(i[0], i[1], i[2], i[3])).join('')}</section>`;
}

{
  const _types = renderFeeTypesTab;
  renderFeeTypesTab = function(body){
    _types.apply(this, arguments);
    try{
      const coreN = Object.keys(CATS).length;
      body.insertAdjacentHTML('afterbegin', mfpKpis([
        ['Fee types', feeTypes.length, 'good', 'labels for Extra Fees'],
        ['Extra fees defined', extraFeeDefs.length, 'plain', 'one-off charges'],
        ['Core categories', coreN, 'plain', 'managed in Fee Structure']
      ]));
    }catch(e){ console.error('fee types polish', e); }
  };
}
{
  const _extra = renderExtraFeesTab;
  renderExtraFeesTab = function(body){
    _extra.apply(this, arguments);
    try{
      const total = extraFeeDefs.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const assigned = studentExtraFees.filter(x => x.kind !== 'late' && extraFeeDefs.some(d => d.name === x.name));
      const out = assigned.filter(x => !x.paid && !(Number(x.paidAmount) >= Number(x.amount))).length;
      body.insertAdjacentHTML('afterbegin', mfpKpis([
        ['Extra fees defined', extraFeeDefs.length, 'good', 'one-off charges'],
        ['Combined value', fmtMoney(total), 'plain', 'if all are charged once'],
        ['Charged to students', assigned.length, 'plain', out + ' still unpaid']
      ]));
      body.querySelectorAll('.ft-fee').forEach((card, i) => {
        const d = extraFeeDefs[i]; if(!d) return;
        const n = studentExtraFees.filter(x => x.name === d.name && x.kind !== 'late').length;
        const amt = card.querySelector('.ft-fee-amt');
        if(amt) amt.insertAdjacentHTML('afterend', `<small class="mfp-assigned">Charged to ${n} student${n === 1 ? '' : 's'}</small>`);
      });
    }catch(e){ console.error('extra fees polish', e); }
  };
}
{
  const _late = renderLateFeesTab;
  renderLateFeesTab = async function(body){
    await _late.apply(this, arguments);
    try{
      const r = lateFeeSettings || {};
      const lateExtras = studentExtraFees.filter(e => e.kind === 'late');
      const out = lateExtras.reduce((s, e) => s + Math.max((Number(e.amount) || 0) - (Number(e.paidAmount) || 0), 0), 0);
      const rule = Number(r.amount) > 0 ? (r.mode === 'perday' ? fmtMoney(r.amount) + ' / day' : fmtMoney(r.amount) + ' flat') : 'Not set';
      body.insertAdjacentHTML('afterbegin', mfpKpis([
        ['Late fee rule', rule, Number(r.amount) > 0 ? 'good' : 'warn', r.autoAssess ? 'assessed automatically each day' : 'assessed manually'],
        ['Assessed so far', lateExtras.length, 'plain', 'late fees on students'],
        ['Late fees outstanding', fmtMoney(out), out > 0 ? 'danger' : 'plain', 'still to be collected'],
        ['Waived', (typeof fpWaivers !== 'undefined' ? fpWaivers.length : 0), 'plain', 'late fees waived']
      ]));
      const grid = body.querySelector('.ft-grid');
      if(grid && grid.children.length === 3 && !grid.classList.contains('lf-grid')){
        const side = document.createElement('div'); side.className = 'lf-side';
        side.appendChild(grid.children[1]); side.appendChild(grid.children[1]);
        grid.appendChild(side); grid.classList.add('lf-grid');
      }
    }catch(e){ console.error('late fees polish', e); }
  };
}
