/* ============================================================================
   Fee counter screen styles + printed receipt styles (Admin chooses).

   Screen styles (Manage Fee > Receipt numbering card > "Fee counter screen"):
     classic  - the screen exactly as it always was (default)
     cashier  - Cashier desk: payment form on the left, receipts + today's list on the right
     modern   - Modern two-pane: receipts on the left, "Make a receipt" panel on the right
   Receipt styles ("Printed receipt style"):
     existing - the receipt exactly as it always was (default)
     formal, modern, slip (compact), thermal (80 mm roll printer)

   Only the LOOK changes. The payment form fields, validation, receipt numbering
   and saving are the same code as before. Nothing changes until Admin picks a style.
   ========================================================================== */
(function(){
  const DESKS = { classic: 'Classic (current screen)', cashier: 'Cashier desk', modern: 'Modern two-pane', table: 'Fee table (compact rows)', quick: 'Quick collect (one bar on top)' };
  const RECEIPTS = { existing: 'Existing receipt (current)', formal: 'Formal (serif, bordered)', modern: 'Modern (colour header)', slip: 'Compact slip', thermal: 'Thermal roll (80 mm)', bw: 'Black & white simple', bank: 'Bank voucher style', minimal: 'Minimal clean', preprinted: 'For pre-printed school paper (black & white)' };
  window.DESK_STYLES = DESKS; window.RECEIPT_STYLES = RECEIPTS;
  const deskStyle = () => { const v = (typeof receiptSettings !== 'undefined' && receiptSettings && receiptSettings.deskStyle) || 'classic'; return DESKS[v] ? v : 'classic'; };
  const rcptStyle = () => { const v = (typeof receiptSettings !== 'undefined' && receiptSettings && receiptSettings.receiptStyle) || 'existing'; return RECEIPTS[v] ? v : 'existing'; };
  window.deskStyle = deskStyle; window.rcptStyle = rcptStyle;

  const esc = v => (typeof frcEsc === 'function' ? frcEsc(v) : String(v == null ? '' : v));
  const money = n => frcMoney(n);
  const inr0 = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  /* ------------------------------ settings tab: Manage Fee > Receipt & Counter ------------------------------ */
  window.renderReceiptTab = async function(body){
    const canEdit = canSub('managefee_late', 'managefee', 'edit');
    const dis = canEdit ? '' : 'disabled';
    const opts = (map, cur) => Object.keys(map).map(k => `<option value="${k}" ${k === cur ? 'selected' : ''}>${map[k]}</option>`).join('');
    body.innerHTML = `<div class="ft-grid">
      <section class="sf-card ft-card">
        ${ftCardHead('Receipt numbering', 'Switching over from another system? Set where receipt numbers should continue (if your last printed receipt was 001666, enter 1667).')}
        <div class="ft-form">
          <label class="ft-field"><span>Next receipt starts at</span><input type="number" min="1" class="input" id="rsStart" ${dis} value="${Number(receiptSettings.startNumber) || 1}"></label>
        </div>
      </section>
      <section class="sf-card ft-card">
        ${ftCardHead('Fee counter & receipt style', 'Choose how the fee counter screen and the printed receipt look. The current screen and receipt stay until you change these.')}
        <div class="ft-form">
          <label class="ft-field"><span>Fee counter screen</span><select class="input" id="rsDesk" ${dis} onchange="rsPreview()">${opts(DESKS, deskStyle())}</select></label>
          <label class="ft-field"><span>Printed receipt style</span><select class="input" id="rsRcpt" ${dis} onchange="rsPreview()">${opts(RECEIPTS, rcptStyle())}</select></label>
        </div>
        <div class="ft-form" id="rsPreBox" style="${rcptStyle() === 'preprinted' ? '' : 'display:none'}">
          <label class="ft-field"><span>Pre-printed paper size</span><select class="input" id="rsPaper" ${dis} onchange="rsPreview()">${Object.keys(PAPERS).map(k => `<option value="${k}" ${k === paperKey() ? 'selected' : ''}>${PAPERS[k][2]}</option>`).join('')}</select></label>
          <label class="ft-field"><span>Blank space at top for your letterhead (mm)</span><input type="number" min="0" max="120" class="input" id="rsTop" ${dis} value="${topMm()}" oninput="rsPreview()"></label>
          <p class="dk-pre-hint">Prints only the receipt details, in plain black, so it can go on paper that already has your school name, address and logo. Do a test print on plain paper first and adjust the blank space.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${canEdit ? sfBtn('primary', 'check', 'Save receipt settings', 'saveReceiptSettings()') : ''}
          ${sfBtn('secondary', 'receipt', 'Preview this receipt style', 'previewReceiptStyle()')}
        </div>
      </section>
      <section class="sf-card ft-card" style="grid-column:1/-1">
        ${ftCardHead('Preview', 'Updates as soon as you change a choice. Nothing is saved or printed until you press Save.')}
        <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">
          <div style="flex:1;min-width:300px"><div style="font-weight:700;margin-bottom:6px">Fee counter screen</div><div id="rsPrevDesk"></div></div>
          <div style="flex:1;min-width:300px"><div style="font-weight:700;margin-bottom:6px">Printed receipt <span id="rsPrevNote" style="font-weight:400;color:#667;font-size:12px"></span></div>
            <div id="rsPrevBox" style="width:100%;max-width:520px;height:360px;overflow:hidden;border:1px solid #dde3ee;border-radius:10px;background:#dfe1ea;position:relative"><iframe id="rsPrevFrame" title="Receipt preview" style="width:820px;height:600px;border:0;transform-origin:0 0;position:absolute;left:0;top:0"></iframe></div></div>
        </div>
      </section>
    </div>`;
    rsPreview();
  };
  const DESK_PIC = (() => {
    const b = (w, h, bg, extra) => `<div style="width:${w};height:${h};background:${bg};border-radius:4px;${extra || ''}"></div>`;
    const frame = inner => `<div style="border:1px solid #dde3ee;border-radius:10px;background:#f6f7fb;padding:8px;height:200px;max-width:520px;overflow:hidden;font:600 9px sans-serif;color:#fff">${inner}</div>`;
    const bar = `<div style="height:16px;background:#14213d;border-radius:4px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;padding:0 6px"><span>Fee counter</span><span style="background:#1f7a52;padding:1px 5px;border-radius:3px">Last receipt issued</span></div>`;
    const head = '<div style="height:20px;background:#fff;border:1px solid #dde3ee;border-radius:5px;margin-bottom:4px"></div>';
    return {
      classic: frame(`<div style="height:22px;background:#fff;border:1px solid #dde3ee;border-radius:5px;margin-bottom:6px"></div><div style="display:flex;gap:5px;margin-bottom:6px">${b('25%','30px','#fff','border:1px solid #dde3ee')}${b('25%','30px','#fff','border:1px solid #dde3ee')}${b('25%','30px','#fff','border:1px solid #dde3ee')}${b('25%','30px','#fff','border:1px solid #dde3ee')}</div>${head}${head}<div style="height:26px;background:#fff;border:1px solid #dde3ee;border-radius:5px;display:flex;justify-content:flex-end;align-items:center;padding:0 6px"><span style="background:#4b3fa8;padding:3px 8px;border-radius:4px">Record Payment(s)</span></div>`),
      cashier: frame(`${bar}<div style="display:flex;gap:6px"><div style="width:45%;background:#fff;border:1px solid #dde3ee;border-radius:6px;padding:5px">${head}${head}<div style="height:22px;border:1px solid #c9d1e0;border-radius:4px;margin-bottom:4px"></div><div style="display:flex;gap:3px;margin-bottom:4px">${b('20%','10px','#e6e9f2')}${b('20%','10px','#e6e9f2')}${b('20%','10px','#e6e9f2')}</div><div style="display:flex;margin-bottom:5px">${b('25%','14px','#14213d','border-radius:3px 0 0 3px')}${b('25%','14px','#e6e9f2','border-radius:0')}${b('25%','14px','#e6e9f2','border-radius:0')}</div><div style="height:18px;background:#1f7a52;border-radius:5px;text-align:center;line-height:18px">Save &amp; print receipt</div></div><div style="flex:1;display:flex;flex-direction:column;gap:5px"><div style="display:flex;gap:4px">${b('33%','24px','#fff','border:1px solid #dde3ee')}${b('33%','24px','#fff','border:1px solid #dde3ee')}${b('33%','24px','#fff','border:1px solid #dde3ee')}</div>${b('100%','52px','#fff','border:1px solid #dde3ee')}${b('100%','40px','#fff','border:1px solid #dde3ee')}</div></div>`),
      table: frame(`${bar}<div style="display:flex;gap:6px"><div style="width:48%;background:#fff;border:1px solid #dde3ee;border-radius:6px;padding:5px"><div style="border:1px solid #dde3ee;border-radius:4px;margin-bottom:5px">${[1,2,3,4].map(() => `<div style="height:13px;border-bottom:1px solid #edf0f6;display:flex;align-items:center;gap:4px;padding:0 4px"><span style="width:8px;height:8px;border:1px solid #9aa6c0;border-radius:2px"></span><span style="flex:1;height:5px;background:#e6e9f2"></span><span style="width:26px;height:7px;background:#eef2fb"></span></div>`).join('')}</div><div style="height:22px;border:1px solid #c9d1e0;border-radius:4px;margin-bottom:4px"></div><div style="height:16px;background:#0b6b4a;border-radius:4px;text-align:center;line-height:16px">Save &amp; print receipt</div></div><div style="flex:1;display:flex;flex-direction:column;gap:5px"><div style="display:flex;gap:4px">${b('33%','24px','#fff','border:1px solid #dde3ee')}${b('33%','24px','#fff','border:1px solid #dde3ee')}${b('33%','24px','#fff','border:1px solid #dde3ee')}</div>${b('100%','80px','#fff','border:1px solid #dde3ee')}</div></div>`),
      quick: frame(`${bar}<div style="background:#fff;border:1px solid #dde3ee;border-radius:6px;padding:5px;display:flex;gap:8px"><div style="flex:1.4">${[1,2,3].map(() => `<div style="height:13px;border:1px solid #dde3ee;border-radius:4px;margin-bottom:3px"></div>`).join('')}</div><div style="flex:1"><div style="height:22px;border:1px solid #c9d1e0;border-radius:4px;margin-bottom:3px"></div><div style="height:10px;background:#e6e9f2;border-radius:3px;width:60%"></div></div></div><div style="display:flex;gap:6px;margin:5px 0"><div style="flex:1;height:16px;border:1px solid #c9d1e0;border-radius:4px;background:#fff"></div><div style="flex:1;height:16px;border:1px solid #c9d1e0;border-radius:4px;background:#fff"></div><div style="width:34%;height:16px;background:#1f7a52;border-radius:4px;text-align:center;line-height:16px">Save &amp; print</div></div>${b('100%','54px','#fff','border:1px solid #dde3ee')}`),
      modern: frame(`<div style="display:flex;gap:6px"><div style="flex:1;display:flex;flex-direction:column;gap:5px"><div style="display:flex;gap:4px">${b('33%','22px','#fff','border:1px solid #dde3ee')}${b('33%','22px','#fff','border:1px solid #dde3ee')}${b('33%','22px','#fff','border:1px solid #dde3ee')}</div>${b('100%','28px','#fff','border:1px solid #dde3ee;border-radius:12px')}${b('100%','28px','#fff','border:1px solid #dde3ee;border-radius:12px')}${b('100%','28px','#fff','border:1px solid #dde3ee;border-radius:12px')}</div><div style="width:42%;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.12);padding:6px;color:#231f3d">Make a receipt${head}${head}<div style="height:18px;background:#b0105f;border-radius:99px;margin-top:4px;color:#fff;text-align:center;line-height:18px">Save &amp; print receipt</div></div></div>`)
    };
  })();
  function noAutoPrint(html){ return html.replace(/window\.onload\s*=\s*function\(\)\s*\{\s*setTimeout\(function\(\)\s*\{\s*window\.print\(\)\s*;?\s*\}\s*,\s*250\s*\)\s*;?\s*\}\s*;?/g, ''); }
  function sampleRecs(){
    const p = (payments || []).filter(x => !x.voided && x.receiptNo).sort((a, b) => String(b.receiptNo).localeCompare(String(a.receiptNo)))[0];
    if(p){ const r = payments.filter(x => x.receiptNo === p.receiptNo && !x.voided); if(r.length) return { recs: r, real: true }; }
    const st = (students || [])[0]; if(!st) return null;
    return { real: false, recs: [{ studentId: st.id, receiptNo: 'SAMPLE-000001', date: new Date().toISOString().slice(0, 10), mode: 'Cash', amount: 5500, category: 'fee', instalment: 'Instalment 1' }] };
  }
  window.rsPreview = function(){
    const rc = document.getElementById('rsRcpt'), dk = document.getElementById('rsDesk'); if(!rc || !dk) return;
    const pd = document.getElementById('rsPrevDesk'); if(pd) pd.innerHTML = DESK_PIC[dk.value] || '';
    const fr = document.getElementById('rsPrevFrame'), box = document.getElementById('rsPrevBox'); if(!fr) return;
    const sm = sampleRecs(); if(!sm) return;
    const pb = document.getElementById('rsPreBox'); if(pb) pb.style.display = rc.value === 'preprinted' ? '' : 'none';
    const keep = Object.assign({}, receiptSettings); receiptSettings.receiptStyle = rc.value;
    const pp = document.getElementById('rsPaper'), pt = document.getElementById('rsTop'); if(pp) receiptSettings.preprintPaper = pp.value; if(pt) receiptSettings.preprintTopMm = Number(pt.value);
    let html = ''; try { html = frcDocHtml(frcBuildData(sm.recs)); } finally { receiptSettings = keep; }
    fr.srcdoc = noAutoPrint(html);
    const sc = rc.value === 'thermal' ? 0.9 : Math.min(1, (box.clientWidth || 520) / 820);
    fr.style.transform = 'scale(' + sc + ')'; fr.style.width = (rc.value === 'thermal' ? 420 : 820) + 'px'; fr.style.height = Math.round(360 / sc) + 'px';
    const n = document.getElementById('rsPrevNote'); if(n) n.textContent = sm.real ? '(shown with your latest receipt)' : '(sample)';
  };
  window.saveReceiptSettings = async function(){
    const g = id => document.getElementById(id);
    receiptSettings = Object.assign({}, receiptSettings || {}, { startNumber: Number(g('rsStart').value) || 1 });
    if(g('rsDesk')) receiptSettings.deskStyle = g('rsDesk').value;
    if(g('rsRcpt')) receiptSettings.receiptStyle = g('rsRcpt').value;
    if(g('rsPaper')) receiptSettings.preprintPaper = g('rsPaper').value;
    if(g('rsTop')) receiptSettings.preprintTopMm = Math.max(0, Math.min(120, Number(g('rsTop').value) || 0));
    await storageSet(RECEIPT_SETTINGS_KEY, receiptSettings);
    showToast('Receipt settings saved.', 'burst');
  };
  window.previewReceiptStyle = function(){
    const sel = document.getElementById('rsRcpt'); if(!sel) return;
    const p = (payments || []).filter(x => !x.voided && x.receiptNo).sort((a, b) => String(b.receiptNo).localeCompare(String(a.receiptNo)))[0];
    if(!p){ showToast('Make one receipt first, then you can preview the styles.'); return; }
    const recs = payments.filter(x => x.receiptNo === p.receiptNo && !x.voided);
    const keep = Object.assign({}, receiptSettings); receiptSettings.receiptStyle = sel.value;
    const pp = document.getElementById('rsPaper'), pt = document.getElementById('rsTop'); if(pp) receiptSettings.preprintPaper = pp.value; if(pt) receiptSettings.preprintTopMm = Number(pt.value);
    let html; try { html = frcDocHtml(frcBuildData(recs)); } finally { receiptSettings = keep; }
    html = noAutoPrint(html);
    const w = window.open('', '_blank'); if(!w){ showToast('Allow pop-ups to preview.'); return; }
    w.document.write(html); w.document.close();
  };

  /* ------------------------------ screen styles ------------------------------ */
  const css = `
  .dk-grid{display:flex;gap:24px;align-items:flex-start;margin-top:14px}
  .dk-left,.dk-right{min-width:0;display:flex;flex-direction:column;gap:16px}
  .dk-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#14213d;color:#fff;border-radius:12px;padding:10px 16px;margin:6px 0 0;font-size:13px}
  .dk-top b{font-family:ui-monospace,Consolas,monospace}
  .dk-last{margin-left:auto;background:#1f7a52;border-radius:8px;padding:6px 12px;font-weight:700}
  .dk-card{background:#fff;border:1px solid #dde3ee;border-radius:14px;padding:16px 18px}
  .dk-card h4{margin:0 0 10px;font-size:15px}
  .dk-card table{width:100%;border-collapse:collapse}
  .dk-card td{padding:8px 6px;border-bottom:1px solid #edf0f6;font-size:13px}
  .dk-mono{font-family:ui-monospace,Consolas,monospace}
  .dk-chips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 4px}
  .dk-chip{border:1px solid #c9d1e0;border-radius:6px;padding:5px 11px;font:600 12px ui-monospace,Consolas,monospace;background:#fff;cursor:pointer}
  .dk-seg{display:flex;border:1px solid #c9d1e0;border-radius:8px;overflow:hidden;margin:4px 0 8px}
  .dk-seg button{flex:1;padding:10px 0;border:0;border-right:1px solid #c9d1e0;background:#fff;font-weight:600;cursor:pointer}
  .dk-seg button:last-child{border-right:0}.dk-seg button.on{background:#14213d;color:#fff}
  .dk-lab{display:block;font-size:12px;font-weight:600;color:#4a5878;margin:2px 0 6px;text-transform:uppercase;letter-spacing:.04em}
  .dk-opts{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
  .dk-opt{display:flex;align-items:center;gap:12px;border:1px solid #dde3ee;border-radius:10px;padding:11px 14px;cursor:pointer;background:#fff}
  .dk-opt.on{border:2px solid #14213d;padding:10px 13px;background:#f5f7fc}
  .dk-dot{width:18px;height:18px;border-radius:5px;border:2px solid #9aa6c0;background:#fff;flex:none;box-sizing:border-box}
  .dk-opt.on .dk-dot{border-color:#14213d;background:#14213d;box-shadow:inset 0 0 0 3px #fff}
  .dk-sub{color:#4a5878;font-size:12px}
  .dk-row{width:110px;height:38px;border:1px solid #c9d1e0;border-radius:6px;padding:0 8px;font-weight:600;text-align:right;flex:none}
  .dk-amt{width:100%;box-sizing:border-box;height:54px;font-size:24px;font-weight:600;border:1px solid #c9d1e0;border-radius:8px;padding:0 12px}
  .dk-hint{font-size:12px;color:#4a5878;margin-top:5px}
  .dk-note{font-size:12px;color:#4a5878;text-align:center;margin-top:8px}
  body.dk-cashier .dk-left{width:540px;flex:none}
  body.dk-cashier .dk-left .sf-heads{display:flex;flex-direction:column;gap:8px}
  body.dk-cashier .dk-left .sf-paybar{display:flex;flex-direction:column;gap:12px;align-items:stretch}
  body.dk-cashier #quickPayAmt{font-size:24px;height:54px;font-weight:600}
  body.dk-cashier .dk-left .sf-paybar .sf-btn--lg,body.dk-cashier .dk-left .sf-paybar .btn-primary{width:100%;height:52px;font-size:16px;background:#1f7a52;border-color:#1f7a52}
  body.dk-modern .dk-grid{flex-direction:row}
  body.dk-modern .dk-left{flex:1}
  body.dk-modern .dk-right{width:470px;flex:none;background:#fff;border-radius:18px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(35,31,61,.08);padding:20px}
  body.dk-modern .dk-right .sf-heads{display:flex;flex-direction:column;gap:8px}
  body.dk-modern .dk-right .sf-paybar{display:flex;flex-direction:column;gap:10px;align-items:stretch}
  body.dk-modern .dk-right .sf-paybar .sf-btn--lg,body.dk-modern .dk-right .sf-paybar .btn-primary{width:100%;height:46px;border-radius:999px;background:#b0105f;border-color:#b0105f}
  .dk-left .sf-paybar,.dk-right .sf-paybar{width:100%;max-width:100%;margin:0;box-sizing:border-box;min-width:0;border:0;box-shadow:none;background:transparent;padding:0}
  .dk-left .sf-paybar>*,.dk-right .sf-paybar>*{width:100%;max-width:100%;min-width:0}
  .dk-left .sf-paybar input,.dk-left .sf-paybar select,.dk-right .sf-paybar input,.dk-right .sf-paybar select{width:100%;box-sizing:border-box}
  .dk-left .sf-paybar-total,.dk-right .sf-paybar-total{text-align:left}
  .dk-left .sf-paybar,.dk-right .sf-paybar{position:static !important;inset:auto !important;transform:none !important;margin-top:12px}
  .dk-right,.dk-left{overflow:visible}
  body.dk-table .dk-left{width:560px;flex:none}
  body.dk-table .dk-opts{gap:0;border:1px solid #dde3ee;border-radius:8px;overflow:hidden;background:#fff}
  body.dk-table .dk-opt{border:0;border-bottom:1px solid #edf0f6;border-radius:0;padding:8px 12px}
  body.dk-table .dk-opt.on{border:0;border-bottom:1px solid #edf0f6;background:#eef2fb;padding:8px 12px}
  body.dk-table .dk-sub{display:none}
  body.dk-table .dk-left .sf-paybar{display:flex;flex-direction:column;gap:10px}
  body.dk-table .dk-left .sf-paybar .sf-btn--lg,body.dk-table .dk-left .sf-paybar .btn-primary{width:100%;height:46px;background:#0b6b4a;border-color:#0b6b4a}
  body.dk-quick .dk-grid{flex-direction:column}
  body.dk-quick .dk-left,body.dk-quick .dk-right{width:100%}
  body.dk-quick .dk-pick{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:4px 24px;align-items:start}
  body.dk-quick .dk-pick>.dk-lab:first-child{grid-column:1}
  body.dk-quick .dk-opts{grid-column:1;grid-row:2 / span 4;gap:4px}
  body.dk-quick .dk-opt{padding:7px 12px}
  body.dk-quick .dk-pick>label[for=dkAmt],body.dk-quick .dk-pick>#dkAmt,body.dk-quick .dk-pick>.dk-hint,body.dk-quick .dk-pick>.dk-chips{grid-column:2}
  body.dk-quick .dk-left .sf-paybar{display:flex;flex-direction:row;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:10px}
  body.dk-quick .dk-left .sf-paybar>*{width:auto;flex:1 1 200px}
  body.dk-quick .dk-left .sf-paybar .sf-btn--lg,body.dk-quick .dk-left .sf-paybar .btn-primary{flex:0 0 240px;height:48px;background:#1f7a52;border-color:#1f7a52}
  body.dk-quick .dk-seg{flex:1 1 260px}
  .dk-pre-hint{font-size:12px;color:#667}
  @media (max-width:1000px){.dk-grid{flex-direction:column}body.dk-table .dk-left{width:100%}body.dk-cashier .dk-left,body.dk-modern .dk-right{width:100%}}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  function lastReceiptNo(){
    let best = '';
    (payments || []).forEach(p => { if(!p.voided && p.receiptNo && String(p.receiptNo) > best) best = String(p.receiptNo); });
    return best;
  }
  function todayList(){
    const today = (typeof localISODate === 'function' ? localISODate() : new Date().toISOString().slice(0, 10));
    const by = {};
    (payments || []).forEach(p => {
      if(p.voided || p.date !== today || !p.receiptNo) return;
      const o = by[p.receiptNo] || (by[p.receiptNo] = { no: p.receiptNo, sid: p.studentId, amt: 0 });
      o.amt += Number(p.amount) || 0;
    });
    return Object.values(by).sort((a, b) => String(b.no).localeCompare(String(a.no)));
  }
  function nameOf(sid){ const s = (students || []).find(x => x.id === sid); return s ? (s.firstName + ' ' + (s.lastName || '')).trim() : '—'; }

  // Pick the fee(s) being paid (tick the heads, like the top fee desks), then the amount for each is filled in
  // and stays editable; the "Total received" box can also be typed and is shared across the ticked heads in order.
  // The real amount boxes of the classic screen stay in the page (hidden) and are filled from here, so the
  // saving, validation and receipt numbering are the same code as before.
  function addHelpers(root, style){
    const bar = root.querySelector('.sf-paybar'); if(!bar) return;
    const heads = Array.from(root.querySelectorAll('article.sf-head')).map(a => {
      const inp = a.querySelector('.ledger-pay-input'); if(!inp) return null;
      const h4 = a.querySelector('h4');
      const bd = a.querySelector('header [class*=badge], header .sf-badge, header .pill');
      return { inp, label: h4 ? h4.textContent.trim() : 'Fee', freq: ((a.querySelector('.sf-freq') || {}).textContent || '').trim(),
        state: bd ? bd.textContent.trim() : '', out: Number(inp.dataset.outstanding) || 0, on: false, amt: 0 };
    }).filter(Boolean);
    const classicHeads = root.querySelector('.sf-heads'), classicQuick = root.querySelector('#quickPayAmt');
    const modeSel = root.querySelector('#ledgerPayMode');
    const money0 = n => '₹' + Math.round(n).toLocaleString('en-IN');
    const wrap = document.createElement('div'); wrap.className = 'dk-pick dk-pick-' + style;
    wrap.innerHTML = `<label class="dk-lab">Select the fee(s) being paid</label>
      <div class="dk-opts">${heads.map((h, k) => `<div class="dk-opt" data-k="${k}"><span class="dk-dot"></span><div style="flex:1;min-width:0"><b>${esc(h.label)}</b><div class="dk-sub">${esc([h.freq, h.state, 'due ' + money0(h.out)].filter(Boolean).join(' · '))}</div></div><input type="number" min="0" max="${h.out}" class="dk-row dk-mono" data-k="${k}" style="display:none" aria-label="Amount for ${esc(h.label)}"></div>`).join('')}</div>
      <label class="dk-lab" for="dkAmt">Total received (₹)</label>
      <input id="dkAmt" type="number" min="0" class="dk-amt dk-mono" inputmode="numeric">
      <div class="dk-hint">Balance on the selected fee(s) after this: <b id="dkBal">—</b></div>
      <div class="dk-chips"></div>`;
    bar.before(wrap);
    if(classicHeads) classicHeads.style.display = 'none';
    if(classicQuick && classicQuick.closest('label')) classicQuick.closest('label').style.display = 'none';
    const rows = Array.from(wrap.querySelectorAll('.dk-opt')), rowInps = Array.from(wrap.querySelectorAll('.dk-row'));
    const box = wrap.querySelector('#dkAmt'), chips = wrap.querySelector('.dk-chips');
    function pushToClassic(){
      heads.forEach(h => { h.inp.value = h.on ? h.amt : 0; });
      if(typeof onLedgerPayInput === 'function') onLedgerPayInput();
      const sel = heads.filter(h => h.on), got = sel.reduce((a, h) => a + h.amt, 0), due = sel.reduce((a, h) => a + h.out, 0);
      document.getElementById('dkBal').textContent = sel.length ? money0(Math.max(0, due - got)) : '—';
      return { got, due };
    }
    function drawChips(due){
      chips.innerHTML = '';
      if(!due) return;
      const mk = (lab, v) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'dk-chip'; b.textContent = lab; b.onclick = () => { distribute(v); }; chips.appendChild(b); };
      mk('Full ' + money0(due), due);
      [3000, 2000, 1000, 500].filter(v => v < due).slice(0, 3).forEach(v => mk(money0(v), v));
    }
    function drawRows(){
      heads.forEach((h, k) => { rows[k].classList.toggle('on', h.on); rowInps[k].style.display = h.on ? '' : 'none'; if(h.on && document.activeElement !== rowInps[k]) rowInps[k].value = h.amt; });
    }
    function refresh(keepBox){
      drawRows(); const r = pushToClassic();
      if(!keepBox) box.value = r.got || '';
      drawChips(r.due);
    }
    function distribute(total){
      let left = Math.max(0, Number(total) || 0);
      heads.forEach(h => { if(h.on){ const t = Math.min(left, h.out); h.amt = t; left -= t; } });
      refresh(false);
    }
    rows.forEach((el, k) => {
      el.addEventListener('click', ev => {
        if(ev.target.classList.contains('dk-row')) return;
        const h = heads[k]; h.on = !h.on; h.amt = h.on ? h.out : 0; refresh(false);
      });
    });
    rowInps.forEach((inp, k) => {
      inp.addEventListener('input', () => { const h = heads[k]; h.amt = Math.max(0, Math.min(Number(inp.value) || 0, h.out)); refresh(false); });
      inp.addEventListener('blur', () => { inp.value = heads[k].amt; });
    });
    box.addEventListener('input', () => {
      let left = Math.max(0, Number(box.value) || 0);
      heads.forEach(h => { if(h.on){ const t = Math.min(left, h.out); h.amt = t; left -= t; } });
      drawRows(); const r = pushToClassic(); drawChips(r.due);
    });
    box.addEventListener('keydown', ev => { if(ev.key === 'Enter'){ const f = bar.querySelector('.sf-btn--lg,.btn-primary'); if(f) f.click(); } });
    if(modeSel){
      const seg = document.createElement('div'); seg.className = 'dk-seg';
      Array.from(modeSel.options).forEach(o => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = o.textContent;
        if(o.selected) b.className = 'on';
        b.onclick = () => { modeSel.value = o.value; Array.from(seg.children).forEach(x => x.className = ''); b.className = 'on'; modeSel.dispatchEvent(new Event('change')); };
        seg.appendChild(b);
      });
      modeSel.closest('label').after(seg); modeSel.closest('label').style.display = 'none';
    }
    const note = document.createElement('div'); note.className = 'dk-note';
    note.textContent = 'The receipt number is given when you press Save.';
    bar.appendChild(note);
    if(heads.length){ heads[0].on = true; heads[0].amt = heads[0].out; refresh(false); }
  }

  function restyle(body, style){
    const hero = body.querySelector('.sf-hero');
    const titles = Array.from(body.children).filter(el => el.classList && el.classList.contains('dash-section-title'));
    const pendTitle = titles.find(t => /Pending Fees/.test(t.textContent));
    const heads = body.querySelector('.sf-heads');
    const bar = body.querySelector('.sf-paybar');
    if(!hero || !heads || !bar || !pendTitle) return;          // nothing to pay (or family view): leave the page as it is
    const formParts = [pendTitle, heads, bar];
    const rest = Array.from(body.children).filter(el => el !== hero && !formParts.includes(el) && !(el.classList && el.classList.contains('breadcrumb')));
    // total still due for the "Full" chip
    const tot = (bar.querySelector('.sf-paybar-total small') || {}).textContent || '';
    const m = tot.match(/of\s*₹?\s*([\d,]+(?:\.\d+)?)/); window.__dkDue = m ? Number(m[1].replace(/,/g, '')) : 0;

    const top = document.createElement('div'); top.className = 'dk-top';
    const last = lastReceiptNo(); const tl = todayList();
    top.innerHTML = `<b style="font-family:inherit">Fee counter</b><span>Today: <b>${inr0(tl.reduce((a, x) => a + x.amt, 0))}</b> · ${tl.length} receipt${tl.length === 1 ? '' : 's'}</span>${last ? `<span class="dk-last">Last receipt issued: <b>${esc(last)}</b></span>` : ''}`;
    const grid = document.createElement('div'); grid.className = 'dk-grid';
    const L = document.createElement('div'); L.className = 'dk-left';
    const R = document.createElement('div'); R.className = 'dk-right';
    const formCard = document.createElement('div'); formCard.className = (style === 'modern') ? '' : 'dk-card';
    formParts.forEach(el => formCard.appendChild(el));
    const restWrap = document.createElement('div'); restWrap.style.cssText = 'display:flex;flex-direction:column;gap:16px;min-width:0';
    rest.forEach(el => restWrap.appendChild(el));
    if(style !== 'modern'){
      L.appendChild(formCard); R.appendChild(restWrap);
      const t = document.createElement('div'); t.className = 'dk-card';
      t.innerHTML = `<h4>Today at the counter <span style="font-weight:400;color:#4a5878;font-size:13px">· latest first</span></h4>` +
        (tl.length ? `<table><tbody>${tl.slice(0, 8).map(x => `<tr><td class="dk-mono"><b>${esc(String(x.no).split('-').pop())}</b></td><td>${esc(nameOf(x.sid))}</td><td class="dk-mono" style="text-align:right">${money(x.amt)}</td></tr>`).join('')}</tbody></table>` : '<div style="color:#4a5878;font-size:13px">No receipts yet today.</div>');
      R.appendChild(t);
    } else {
      L.appendChild(restWrap); R.appendChild(formCard);
    }
    grid.appendChild(L); grid.appendChild(R);
    hero.after(top); top.after(grid);
    addHelpers(formCard, style);
  }

  if(typeof renderStudentLedger === 'function'){
    const orig = renderStudentLedger;
    renderStudentLedger = function(body){
      const r = orig.apply(this, arguments);
      document.body.classList.remove('dk-cashier', 'dk-modern', 'dk-table', 'dk-quick');
      const style = deskStyle();
      if(style !== 'classic' && body){
        try { restyle(body, style); document.body.classList.add('dk-' + style); }
        catch(e){ console.warn('Counter style skipped:', e); }
      }
      return r;
    };
    window.renderStudentLedger = renderStudentLedger;
  }

  /* ------------------------------ receipt styles ------------------------------ */
  function itemsRows(d, withInst){
    return d.recs.map((r, i) => `<tr><td class="n">${i + 1}</td><td><b>${esc(feeLabelFor(r))}</b>${r.note ? ` <small>${esc(r.note)}</small>` : ''}</td>${withInst ? `<td>${esc(frcInstalmentText(r))}</td>` : ''}<td class="a">${money(r.amount)}</td></tr>`).join('');
  }
  function ctx(d){
    const s = d.s, rel = s.fatherName ? 'Father' : (s.motherName ? 'Mother' : 'Guardian');
    return { name: (s.firstName + ' ' + (s.lastName || '')).trim(), cls: `${s.className} — ${s.section}`, rel,
      school: schoolInfo.name || 'School', addr: schoolInfo.address || '', phone: schoolInfo.phone || '',
      note: (typeof fpSettings !== 'undefined' && fpSettings && fpSettings.receiptNote) || 'Computer-generated receipt.' };
  }
  const SHARED = `
    *{box-sizing:border-box}html,body{margin:0}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#dfe1ea}
    .bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center;padding:8px 10px;background:#211A4E;color:#fff;font:13px 'Segoe UI',Arial,sans-serif}
    .bar button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;background:rgba(255,255,255,.14);color:#fff}
    .bar button.on{background:#E9B949;color:#211A4E}.bar .go{background:#168a5f}
    .sheet{width:210mm;height:148mm;margin:10px auto;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden;display:flex}
    .half{width:105mm;height:148mm;padding:4mm;overflow:hidden;flex:none}.half+.half{border-left:1.5px dashed #aaa}
    .copy{height:100%;overflow:hidden;display:flex;flex-direction:column}
    .a{text-align:right;white-space:nowrap}
    @media print{body{background:#fff}.bar{display:none}.sheet{margin:0;box-shadow:none}}`;

  const STYLES = {
    formal: {
      css: `.copy{font-family:Georgia,'Times New Roman',serif;color:#1d1a4d;border:1.5px solid #1d1a4d;padding:3mm;font-size:9px}
        .f-hd{display:flex;gap:7px;align-items:center;border-bottom:2px solid #1d1a4d;padding-bottom:4px}
        .f-hd img{width:30px;height:30px;border-radius:50%;object-fit:cover}.f-sch{font-size:12px;font-weight:700;line-height:1.15}.f-ad{font:7px Arial,sans-serif;color:#555}
        .f-t{display:flex;justify-content:space-between;align-items:flex-end;margin:5px 0 4px}.f-t b{font-size:12px;letter-spacing:1px}.f-t span{font:700 9px Arial,sans-serif}
        .f-g{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;background:#f5f4fa;padding:4px 6px;font:8px Arial,sans-serif;border-radius:3px}.f-g i{font-style:normal;color:#666}
        table{border-collapse:collapse;width:100%;margin-top:5px;font:8.5px Arial,sans-serif}th{text-align:left;font-size:6.5px;text-transform:uppercase;border-bottom:1.3px solid #1d1a4d;padding:2px 3px}
        td{padding:3.5px 3px;border-bottom:1px solid #e4e2ee}.n{width:12px;color:#888}.tot td{font-weight:700;font-size:10px;border-bottom:0;border-top:1.3px solid #1d1a4d}
        .f-w{margin-top:4px;padding:3px 5px;border:1px dashed #b9b4d4;font:7.5px Arial,sans-serif}.f-d{margin-top:3px;font:8px Arial,sans-serif}
        .f-s{margin-top:auto;display:flex;justify-content:space-between;font:7px Arial,sans-serif;color:#555;padding-top:14px}.f-s span{border-top:1px solid #333;padding-top:2px;width:34mm}`,
      copy: (lab, d, c) => `<section class="copy"><div class="f-hd">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ''}<div><div class="f-sch">${esc(c.school)}</div><div class="f-ad">${esc(c.addr)}${c.phone ? ' · Ph: ' + esc(c.phone) : ''}</div></div></div>
        <div class="f-t"><b>FEE RECEIPT</b><span>No. ${esc(d.receiptNo)} · ${esc(lab)}</span></div>
        <div class="f-g"><div><i>Student:</i> <b>${esc(c.name)}</b></div><div><i>Date:</i> <b>${esc(d.date)}</b></div><div><i>Class:</i> <b>${esc(c.cls)}</b></div><div><i>Adm. no.:</i> <b>${esc(d.s.admissionNo)}</b></div><div><i>${c.rel}:</i> <b>${esc(d.parentName)}</b></div><div><i>Mode:</i> <b>${esc(d.mode)}</b></div></div>
        <table><thead><tr><th>#</th><th>Fee head</th><th>Period</th><th class="a">Amount (₹)</th></tr></thead><tbody>${itemsRows(d, true)}</tbody><tfoot>${d.disc > 0 ? `<tr><td colspan="3" class="a">Discount allowed</td><td class="a">${money(d.disc)}</td></tr>` : ''}<tr class="tot"><td colspan="3" class="a">Total received</td><td class="a">₹ ${money(d.netPaid)}</td></tr></tfoot></table>
        <div class="f-w">In words: <b>${esc(d.words)}</b></div><div class="f-d">Balance due after this receipt: <b>₹ ${money(d.due)}</b></div>
        <div class="f-s"><span>Parent / guardian</span><span style="text-align:right">${esc(d.signer)}</span></div><div style="font:6px Arial;color:#777;margin-top:3px">${esc(c.note)}${d.collector ? ' · Collected by ' + esc(d.collector) : ''}</div></section>`
    },
    modern: {
      css: `.copy{font-family:'Segoe UI',Arial,sans-serif;color:#231f3d;border:1px solid #d6d2e6;border-radius:8px;font-size:9px}
        .m-hd{background:#b0105f;color:#fff;padding:7px 9px;display:flex;gap:7px;align-items:center}.m-hd img{width:28px;height:28px;border-radius:50%;background:#fff;object-fit:cover}
        .m-sch{font-size:11.5px;font-weight:700;line-height:1.15}.m-ad{font-size:6.8px;opacity:.9}
        .m-b{padding:6px 9px;display:flex;flex-direction:column;flex:1;min-height:0}.m-no{display:flex;justify-content:space-between;align-items:flex-start}
        .m-no small{display:block;font-size:6.3px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#6a6685}.m-no b{font-size:13px}
        .m-who{background:#f6f2f4;border-radius:8px;padding:5px 7px;margin:5px 0;display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:8px}.m-who small{display:block;font-size:6px;color:#6a6685;font-weight:600;text-transform:uppercase}
        table{width:100%;border-collapse:collapse;font-size:9px}td{padding:4px 0;border-bottom:1px solid #ece9f5}.n{display:none}td small{display:block;color:#6a6685;font-size:7px}
        .m-tot{display:flex;justify-content:space-between;align-items:baseline;margin-top:6px;padding:7px 9px;background:#231f3d;color:#fff;border-radius:8px}.m-tot b{font-size:14px}
        .m-w{margin-top:4px;font-size:8px;color:#6a6685}.m-bal{margin-top:5px;font-size:8.5px}.m-bal b{color:#b0105f}
        .m-s{margin-top:auto;display:flex;justify-content:space-between;font-size:7px;color:#6a6685;padding-top:14px}.m-s span{border-top:1px solid #231f3d;padding-top:2px;width:32mm}`,
      copy: (lab, d, c) => `<section class="copy"><div class="m-hd">${d.logo ? `<img src="${esc(d.logo)}" alt="">` : ''}<div><div class="m-sch">${esc(c.school)}</div><div class="m-ad">${esc(c.addr)}${c.phone ? ' · Ph: ' + esc(c.phone) : ''}</div></div></div>
        <div class="m-b"><div class="m-no"><div><small>Fee receipt · ${esc(lab)}</small><b>${esc(d.receiptNo)}</b></div><div style="text-align:right"><small>Date</small><b style="font-size:10px">${esc(d.date)}</b></div></div>
        <div class="m-who"><div><small>Student</small><b>${esc(c.name)}</b></div><div><small>Class</small><b>${esc(c.cls)}</b></div><div><small>Adm. no.</small><b>${esc(d.s.admissionNo)}</b></div><div><small>Paid by</small><b>${esc(d.mode)}</b></div></div>
        <table><tbody>${d.recs.map(r => `<tr><td><b>${esc(feeLabelFor(r))}</b><small>${esc(frcInstalmentText(r))}${r.note ? ' · ' + esc(r.note) : ''}</small></td><td class="a"><b>₹${money(r.amount)}</b></td></tr>`).join('')}</tbody></table>
        <div class="m-tot"><span>Total received</span><b>₹${money(d.netPaid)}</b></div><div class="m-w">${esc(d.words)}</div><div class="m-bal">Balance due after this: <b>₹${money(d.due)}</b></div>
        <div class="m-s"><span>Parent signature</span><span style="text-align:right">${esc(d.signer)}</span></div><div style="font-size:6px;color:#777;margin-top:3px;text-align:center">${esc(c.note)}</div></div></section>`
    },
    slip: {
      css: `.copy{font-family:'Segoe UI',Arial,sans-serif;color:#14213d;border:1px solid #c9d1e0;padding:4mm;font-size:9px}
        .s-h{text-align:center;border-bottom:2px solid #14213d;padding-bottom:4px}.s-h b{font-size:11px;display:block}.s-h span{font-size:7px;color:#4a5878}
        .s-p{display:inline-block;margin-top:4px;background:#14213d;color:#fff;font-weight:700;letter-spacing:.12em;font-size:8px;padding:2px 9px;border-radius:3px}
        .s-no{text-align:center;font:600 15px ui-monospace,Consolas,monospace;margin:7px 0 1px}.s-dt{text-align:center;font-size:8px;color:#4a5878;margin-bottom:6px}
        .s-r{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #9aa6c0}.s-r span:first-child{color:#4a5878}
        .s-l{margin:7px 0 2px;font-size:7px;letter-spacing:.08em;color:#4a5878;font-weight:700}
        .s-t{display:flex;justify-content:space-between;align-items:baseline;margin-top:7px;padding:6px 8px;border:2px solid #14213d;border-radius:5px}.s-t b:last-child{font:600 15px ui-monospace,Consolas,monospace}
        .s-w{margin-top:4px;font-size:8px;color:#4a5878}.s-b{margin-top:6px;background:#eef1f7;border-radius:5px;padding:4px 8px;font-size:8.5px}
        .s-s{margin-top:auto;display:flex;justify-content:space-between;color:#4a5878;font-size:7px;padding-top:14px}.s-s span{border-top:1px solid #14213d;padding-top:2px;width:30mm}`,
      copy: (lab, d, c) => `<section class="copy"><div class="s-h"><b>${esc(c.school)}</b><span>${esc(c.addr)}${c.phone ? ' · Ph: ' + esc(c.phone) : ''}</span><br><span class="s-p">FEE RECEIPT · ${esc(lab)}</span></div>
        <div class="s-no">${esc(d.receiptNo)}</div><div class="s-dt">${esc(d.date)}</div>
        <div class="s-r"><span>Student</span><b>${esc(c.name)}</b></div><div class="s-r"><span>Class</span><b>${esc(c.cls)}</b></div><div class="s-r"><span>Adm. no.</span><b>${esc(d.s.admissionNo)}</b></div><div class="s-r"><span>Mode</span><b>${esc(d.mode)}</b></div>
        <div class="s-l">PAID FOR</div>${d.recs.map(r => `<div class="s-r"><span>${esc(feeLabelFor(r))} — ${esc(frcInstalmentText(r))}</span><span style="font-family:ui-monospace,Consolas,monospace">${money(r.amount)}</span></div>`).join('')}
        <div class="s-t"><b>TOTAL</b><b>₹${money(d.netPaid)}</b></div><div class="s-w">${esc(d.words)}</div><div class="s-b">Balance due: <b>₹${money(d.due)}</b></div>
        <div class="s-s"><span>Parent signature</span><span style="text-align:right">${esc(d.signer)}</span></div><div style="font-size:6px;color:#777;text-align:center;margin-top:3px">${esc(c.note)}</div></section>`
    }
  };

  function thermalDoc(d){
    const c = ctx(d);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
    <style>@page{size:80mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0}body{background:#dfe1ea;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .bar{display:flex;gap:8px;justify-content:center;padding:8px;background:#211A4E}.bar button{font:700 13px Arial;border:0;border-radius:8px;padding:7px 14px;background:#168a5f;color:#fff;cursor:pointer}
    .roll{width:76mm;margin:10px auto;background:#fff;padding:4mm 3mm;font:11px 'Courier New',monospace;color:#000;box-shadow:0 4px 16px rgba(0,0,0,.2)}
    .c{text-align:center}.h{font-weight:700;font-size:13px}.hr{border-top:1px dashed #000;margin:5px 0}.r{display:flex;justify-content:space-between;gap:6px}.t{font-weight:700;font-size:14px}
    @media print{body{background:#fff}.bar{display:none}.roll{margin:0;box-shadow:none;width:76mm}}</style></head><body>
    <div class="bar"><button onclick="window.print()">🖨 Print</button></div>
    <div class="roll"><div class="c h">${esc(c.school)}</div><div class="c">${esc(c.addr)}</div>${c.phone ? `<div class="c">Ph: ${esc(c.phone)}</div>` : ''}
    <div class="hr"></div><div class="c h">FEE RECEIPT</div><div class="r"><span>No:</span><b>${esc(d.receiptNo)}</b></div><div class="r"><span>Date:</span><span>${esc(d.date)}</span></div>
    <div class="hr"></div><div>${esc(c.name)}</div><div>${esc(c.cls)} · Adm ${esc(d.s.admissionNo)}</div><div>Mode: ${esc(d.mode)}</div><div class="hr"></div>
    ${d.recs.map(r => `<div class="r"><span>${esc(feeLabelFor(r))} ${esc(frcInstalmentText(r))}</span><span>${money(r.amount)}</span></div>`).join('')}
    ${d.disc > 0 ? `<div class="r"><span>Discount</span><span>${money(d.disc)}</span></div>` : ''}
    <div class="hr"></div><div class="r t"><span>TOTAL</span><span>₹${money(d.netPaid)}</span></div><div>${esc(d.words)}</div><div class="hr"></div>
    <div class="r"><span>Balance due</span><span>₹${money(d.due)}</span></div><div class="hr"></div><div class="c">${esc(c.note)}</div>${d.collector ? `<div class="c">Collected by ${esc(d.collector)}</div>` : ''}<div class="c">Thank you</div></div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  }

  function styledDoc(style, d){
    if(style === 'thermal') return thermalDoc(d);
    if(style === 'preprinted') return preprintedDoc(d);
    const S = STYLES[style], c = ctx(d);
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
    <style id="frcPage">@page{size:A4;margin:0}</style><style>${SHARED}${S.css}</style></head><body data-mode="a4">
    <div class="bar"><button id="mA4" class="on" onclick="m('a4')">A4 paper · both copies on the top half</button><button id="mA5" onclick="m('a5')">Half-A4 paper (A5 landscape)</button><button class="go" onclick="window.print()">🖨 Print</button></div>
    <div class="sheet"><div class="half">${S.copy('STUDENT COPY', d, c)}</div><div class="half">${S.copy('OFFICE COPY', d, c)}</div></div>
    <script>function m(x){document.getElementById('mA4').className=x==='a4'?'on':'';document.getElementById('mA5').className=x==='a5'?'on':'';document.getElementById('frcPage').textContent=x==='a5'?'@page{size:210mm 148mm;margin:0}':'@page{size:A4;margin:0}'}
    window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  }

  STYLES.bw = {
    css: `.copy{font-family:Arial,Helvetica,sans-serif;color:#000;border:1.5px solid #000;padding:3mm;font-size:9px}
      .w-h{text-align:center;border-bottom:1.5px solid #000;padding-bottom:4px}.w-h b{font-size:12.5px;display:block}.w-h span{font-size:7px}
      .w-t{display:flex;justify-content:space-between;margin:5px 0 4px;font-weight:700;font-size:9.5px}
      .w-g{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px;border:1px solid #000;padding:4px 6px;font-size:8px}
      table{border-collapse:collapse;width:100%;margin-top:5px;font-size:8.5px}th,td{border:1px solid #000;padding:3px 4px;text-align:left}th{font-size:7px;text-transform:uppercase}
      .a{text-align:right}.tot td{font-weight:700;font-size:10px}.w-w{margin-top:4px;font-size:8px}.w-s{margin-top:auto;display:flex;justify-content:space-between;font-size:7px;padding-top:14px}.w-s span{border-top:1px solid #000;padding-top:2px;width:34mm}`,
    copy: (lab, d, c) => `<section class="copy"><div class="w-h"><b>${esc(c.school)}</b><span>${esc(c.addr)}${c.phone ? ' · Ph: ' + esc(c.phone) : ''}</span></div>
      <div class="w-t"><span>FEE RECEIPT — ${esc(lab)}</span><span>No. ${esc(d.receiptNo)}</span></div>
      <div class="w-g"><div>Student: <b>${esc(c.name)}</b></div><div>Date: <b>${esc(d.date)}</b></div><div>Class: <b>${esc(c.cls)}</b></div><div>Adm. no.: <b>${esc(d.s.admissionNo)}</b></div><div>${c.rel}: <b>${esc(d.parentName)}</b></div><div>Mode: <b>${esc(d.mode)}</b></div></div>
      <table><thead><tr><th>#</th><th>Fee head</th><th>Period</th><th class="a">Amount (₹)</th></tr></thead><tbody>${itemsRows(d, true)}</tbody><tfoot>${d.disc > 0 ? `<tr><td colspan="3" class="a">Discount</td><td class="a">${money(d.disc)}</td></tr>` : ''}<tr class="tot"><td colspan="3" class="a">TOTAL</td><td class="a">₹ ${money(d.netPaid)}</td></tr></tfoot></table>
      <div class="w-w">Rupees in words: <b>${esc(d.words.replace(/^Rupees /, ''))}</b></div><div class="w-w">Balance due after this receipt: <b>₹ ${money(d.due)}</b></div>
      <div class="w-s"><span>Parent / guardian</span><span style="text-align:right">${esc(d.signer)}</span></div></section>`
  };
  STYLES.bank = {
    css: `.copy{font-family:'Times New Roman',serif;color:#111;border:3px double #111;padding:3mm;font-size:9px}
      .k-h{text-align:center}.k-h b{font-size:13px;display:block;letter-spacing:.5px}.k-h span{font:7px Arial}
      .k-t{text-align:center;font:700 11px Arial;letter-spacing:2px;border:1px solid #111;margin:5px 0;padding:2px}
      .k-r{display:flex;justify-content:space-between;font:8.5px Arial;margin:3px 0}
      .k-l{margin:5px 0;font-size:9.5px;line-height:1.7}.k-l u{text-decoration:none;border-bottom:1px dotted #111;font-weight:700;padding:0 3px}
      table{width:100%;border-collapse:collapse;font:8.5px Arial;margin-top:3px}th,td{border-top:1px solid #111;border-bottom:1px solid #111;padding:3px 3px;text-align:left}.a{text-align:right}
      .k-b{display:flex;justify-content:space-between;align-items:center;margin-top:6px}.k-amt{border:1.5px solid #111;padding:3px 9px;font:700 12px Arial}
      .k-s{margin-top:auto;display:flex;justify-content:space-between;font:7px Arial;padding-top:14px}.k-s span{border-top:1px solid #111;padding-top:2px;width:34mm}`,
    copy: (lab, d, c) => `<section class="copy"><div class="k-h"><b>${esc(c.school)}</b><span>${esc(c.addr)}${c.phone ? ' · Ph: ' + esc(c.phone) : ''}</span></div><div class="k-t">RECEIPT — ${esc(lab)}</div>
      <div class="k-r"><span>No. <b>${esc(d.receiptNo)}</b></span><span>Date: <b>${esc(d.date)}</b></span></div>
      <div class="k-l">Received with thanks from <u>${esc(c.name)}</u> of class <u>${esc(c.cls)}</u> (Adm. no. <u>${esc(d.s.admissionNo)}</u>), ${c.rel.toLowerCase()} <u>${esc(d.parentName)}</u>, the sum of <u>${esc(d.words)}</u> by <u>${esc(d.mode)}</u> towards:</div>
      <table><thead><tr><th>Particulars</th><th>Period</th><th class="a">₹</th></tr></thead><tbody>${d.recs.map(r => `<tr><td>${esc(feeLabelFor(r))}</td><td>${esc(frcInstalmentText(r))}</td><td class="a">${money(r.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="k-b"><span style="font:8px Arial">Balance due: ₹ ${money(d.due)}</span><span class="k-amt">₹ ${money(d.netPaid)}/-</span></div>
      <div class="k-s"><span>Received by</span><span style="text-align:right">${esc(d.signer)}</span></div></section>`
  };
  STYLES.minimal = {
    css: `.copy{font-family:'Helvetica Neue',Arial,sans-serif;color:#222;padding:5mm 4mm;font-size:9px}
      .n-h{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #222;padding-bottom:5px}.n-h b{font-size:12px;font-weight:600}.n-h span{font-size:7px;color:#666;display:block}
      .n-n{font-size:7px;letter-spacing:.14em;text-transform:uppercase;color:#777;margin-top:8px}.n-v{font-size:13px;font-weight:600}
      .n-g{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:8px 0}.n-g small{display:block;font-size:6.5px;letter-spacing:.1em;text-transform:uppercase;color:#777}
      table{width:100%;border-collapse:collapse;font-size:9px}td{padding:5px 0;border-bottom:1px solid #e2e2e2}.a{text-align:right}
      .n-t{display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-top:8px;padding-top:6px;border-top:1px solid #222}.n-w{font-size:8px;color:#555;margin-top:3px}
      .n-s{margin-top:auto;display:flex;justify-content:space-between;font-size:7px;color:#777;padding-top:14px}.n-s span{border-top:1px solid #aaa;padding-top:2px;width:32mm}`,
    copy: (lab, d, c) => `<section class="copy"><div class="n-h"><div><b>${esc(c.school)}</b><span>${esc(c.addr)}${c.phone ? ' · ' + esc(c.phone) : ''}</span></div><span>${esc(lab)}</span></div>
      <div class="n-n">Receipt</div><div class="n-v">${esc(d.receiptNo)} <span style="font-size:8px;font-weight:400;color:#666;display:inline">· ${esc(d.date)}</span></div>
      <div class="n-g"><div><small>Student</small><b>${esc(c.name)}</b></div><div><small>Class</small>${esc(c.cls)}</div><div><small>Adm. no.</small>${esc(d.s.admissionNo)}</div><div><small>Paid by</small>${esc(d.mode)}</div></div>
      <table><tbody>${d.recs.map(r => `<tr><td>${esc(feeLabelFor(r))} <span style="color:#777">· ${esc(frcInstalmentText(r))}</span></td><td class="a">${money(r.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="n-t"><span>Total</span><span>₹ ${money(d.netPaid)}</span></div><div class="n-w">${esc(d.words)} · Balance due ₹ ${money(d.due)}</div>
      <div class="n-s"><span>Parent signature</span><span style="text-align:right">${esc(d.signer)}</span></div></section>`
  };

  // For schools that print on paper that already carries the school's name, address and logo.
  // Only the receipt details are printed, in plain black; a blank band at the top is left for the letterhead.
  const PAPERS = { a5l: ['210mm', '148mm', 'Half A4 / A5 landscape (210 x 148 mm)'], a5p: ['148mm', '210mm', 'A5 portrait (148 x 210 mm)'], a4: ['210mm', '297mm', 'Full A4 (210 x 297 mm)'] };
  window.RECEIPT_PAPERS = PAPERS;
  const paperKey = () => { const v = receiptSettings && receiptSettings.preprintPaper; return PAPERS[v] ? v : 'a5l'; };
  const topMm = () => { const v = Number(receiptSettings && receiptSettings.preprintTopMm); return v >= 0 && v <= 120 ? v : 35; };
  function preprintedDoc(d){
    const c = ctx(d), pk = paperKey(), P = PAPERS[pk], top = topMm(), n = d.recs.length;
    const fs = n > 9 ? 9 : n > 6 ? 10 : 11;
    const rows = d.recs.map((r, i) => `<tr><td class="n">${i + 1}</td><td>${esc(feeLabelFor(r))}${r.note ? ' (' + esc(r.note) + ')' : ''}</td><td>${esc(frcInstalmentText(r))}</td><td class="a">${money(r.amount)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(d.receiptNo)}</title>
    <style id="frcPage">@page{size:${P[0]} ${P[1]};margin:0}</style>
    <style>*{box-sizing:border-box}html,body{margin:0}body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#dfe1ea;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;padding:8px;background:#222;color:#fff;font:13px Arial}.bar button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:7px 14px;cursor:pointer;background:rgba(255,255,255,.16);color:#fff}.bar button.on{background:#fff;color:#000}.bar .go{background:#168a5f;color:#fff}
    .page{width:${P[0]};height:${P[1]};margin:10px auto;background:#fff;position:relative;box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden}
    .lh{position:absolute;left:8mm;right:8mm;top:4mm;height:${Math.max(0, top - 8)}mm;border:1px dashed #9aa;color:#9aa;font:11px Arial;display:flex;align-items:center;justify-content:center}
    .body{position:absolute;left:10mm;right:10mm;top:${top}mm;bottom:8mm;font-size:${fs}px;line-height:1.35;display:flex;flex-direction:column}
    .r1{display:flex;justify-content:space-between;font-weight:700;font-size:${fs + 1}px;margin-bottom:5px}
    .st{border-top:1px solid #000;border-bottom:1px solid #000;padding:4px 0;margin-bottom:6px}.st div{margin:1px 0}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:3px 5px;text-align:left}th{font-size:${fs - 2}px;text-transform:uppercase}.n{width:22px}.a{text-align:right;white-space:nowrap}
    .tot td{font-weight:700;font-size:${fs + 1}px}.ft{margin-top:6px}.ft div{margin:2px 0}
    .sg{margin-top:auto;display:flex;justify-content:space-between;padding-top:18px}.sg span{border-top:1px solid #000;padding-top:2px;min-width:44mm;text-align:center;font-size:${fs - 2}px}
    @media print{body{background:#fff}.bar{display:none}.page{margin:0;box-shadow:none}.lh{display:none}}</style></head><body>
    <div class="bar"><span>Pre-printed paper · ${esc(P[2])} · ${top} mm left blank at the top</span><button id="cs" class="on" onclick="c('STUDENT COPY')">Student copy</button><button id="co" onclick="c('OFFICE COPY')">Office copy</button><button class="go" onclick="window.print()">🖨 Print</button></div>
    <div class="page"><div class="lh">Space for your pre-printed school name, address and logo (not printed)</div>
    <div class="body"><div class="r1"><span>FEE RECEIPT &nbsp; No. ${esc(d.receiptNo)}</span><span id="cl">STUDENT COPY</span><span>Date: ${esc(d.date)}</span></div>
    <div class="st"><div>Received from: <b>${esc(c.name)}</b> &nbsp; Class: <b>${esc(c.cls)}</b> &nbsp; Adm. no.: <b>${esc(d.s.admissionNo)}</b></div><div>${c.rel}: <b>${esc(d.parentName)}</b> &nbsp; Mode: <b>${esc(d.mode)}</b>${d.detail ? ' (' + esc(d.detail) + ')' : ''}</div></div>
    <table><thead><tr><th>#</th><th>Fee head</th><th>Period</th><th class="a">Amount (₹)</th></tr></thead><tbody>${rows}</tbody><tfoot>${d.disc > 0 ? `<tr><td colspan="3" class="a">Discount allowed</td><td class="a">${money(d.disc)}</td></tr>` : ''}<tr class="tot"><td colspan="3" class="a">TOTAL RECEIVED</td><td class="a">₹ ${money(d.netPaid)}</td></tr></tfoot></table>
    <div class="ft"><div>Amount in words: <b>${esc(d.words)}</b></div><div>Balance due after this receipt: <b>₹ ${money(d.due)}</b></div></div>
    <div class="sg"><span>Parent / guardian signature</span><span>${esc(d.signer)}${d.collector ? ' (' + esc(d.collector) + ')' : ''}</span></div></div></div>
    <script>function c(t){document.getElementById('cl').textContent=t;document.getElementById('cs').className=t[0]==='S'?'on':'';document.getElementById('co').className=t[0]==='O'?'on':''}
    window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  }

  window.frcStyledDoc = styledDoc;

  if(typeof frcDocHtml === 'function'){
    const origDoc = frcDocHtml;
    frcDocHtml = function(d){
      const s = rcptStyle();
      if(s === 'existing' || !(s === 'thermal' || s === 'preprinted' || STYLES[s])) return origDoc.apply(this, arguments);
      try { return styledDoc(s, d); } catch(e){ console.warn('Receipt style skipped:', e); return origDoc.apply(this, arguments); }
    };
    window.frcDocHtml = frcDocHtml;
  }
})();
